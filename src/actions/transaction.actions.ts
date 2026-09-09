'use server';
import 'server-only';

import { unstable_noStore, revalidatePath } from 'next/cache';
import { addDays } from 'date-fns';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { safeAction } from '@/lib/utils/action-wrapper';
import { log } from '@/lib/logger';
import { addCents, subtractCents } from '@/lib/money';
import { serializeTransaction } from '@/lib/serialize';
import { getTrueBalance } from '@/services/reconciliation.service';
import { getTransactionRepository } from '@/lib/repositories';
import { getClientInfo } from '@/lib/utils/client-info';
import {
  checkApiRateLimit,
  recordApiAttempt,
  markApiAttemptSuccess,
} from '@/services/rate-limit.service';
import {
  NotFoundError,
  UnauthorizedError,
  InsufficientFundsError,
  InactiveAccountError,
  CurrencyMismatchError,
  RateLimitError,
  ValidationError,
  NegativeBalanceError,
  CreditLimitExceededError,
  TransactionLinkedToSavingsError,
} from '@/lib/errors/api-errors';
import {
  GetAllTransactionsSchema,
  CreateTransactionActionSchema,
  DeleteTransactionSchema,
  GetTransactionByIdSchema,
  UpdateTransactionSchema,
} from './transaction.schema';
import type { Prisma, ApiAction, TransactionType } from '@prisma/client';

/**
 * Verify funds (Rule 13) for a transaction with a negative amount. CREDIT_CARD
 * accounts are exempt from the negative-balance rule (debt is allowed) but must
 * respect their credit limit; other accounts cannot go negative.
 */
async function validateExpenseFundsForCreate(
  amountCents: number,
  account: { id: string; type: string; creditLimitCents: bigint | null }
): Promise<void> {
  // Only negative amounts reduce the balance / increase card debt.
  if (amountCents >= 0) return;

  const transactionRepo = getTransactionRepository();
  const trueBalance = await getTrueBalance(account.id, transactionRepo);

  if (account.type === 'CREDIT_CARD') {
    if (account.creditLimitCents != null) {
      const projectedDebt = Math.abs(addCents(trueBalance, amountCents));
      if (projectedDebt > account.creditLimitCents) {
        throw new CreditLimitExceededError(account.id, Number(account.creditLimitCents));
      }
    }
    return;
  }

  const projectedBalance = addCents(trueBalance, amountCents);
  if (projectedBalance < 0) {
    throw new InsufficientFundsError(Math.abs(amountCents), trueBalance);
  }
}

// ============================================================================
// getAllTransactions — Paginated list of all user transactions
// ============================================================================

async function getAllTransactionsInternal(input: unknown) {
  unstable_noStore();

  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetAllTransactionsSchema.parse(input);

  const where: Prisma.TransactionWhereInput = {
    userId: session.userId,
    isActive: true,
    ...(validated.search
      ? { description: { contains: validated.search, mode: 'insensitive' } }
      : {}),
    ...(validated.typeFilter ? { type: validated.typeFilter } : {}),
    ...(validated.dateFrom || validated.dateTo
      ? {
          date: {
            ...(validated.dateFrom ? { gte: validated.dateFrom } : {}),
            ...(validated.dateTo ? { lt: addDays(validated.dateTo, 1) } : {}),
          },
        }
      : {}),
    ...(validated.accountId ? { accountId: validated.accountId } : {}),
  };

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: (validated.page - 1) * validated.pageSize,
      take: validated.pageSize,
      include: {
        category: { select: { id: true, name: true, color: true } },
        account: { select: { name: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    transactions: transactions.map((t) => ({
      ...t,
      amountCents: Number(t.amountCents),
      originalAmountCents: t.originalAmountCents == null ? null : Number(t.originalAmountCents),
    })),
    total,
    page: validated.page,
    pageSize: validated.pageSize,
    totalPages: Math.ceil(total / validated.pageSize),
  };
}

export const getAllTransactions = safeAction(getAllTransactionsInternal);

// ============================================================================
// createTransaction — Create INCOME or EXPENSE transaction atomically
// ============================================================================

async function createTransactionInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = CreateTransactionActionSchema.parse(input);

  // Rate limiting (Rule 10)
  const { ipAddress, userAgent } = await getClientInfo();
  const rateLimit = await checkApiRateLimit(session.userId, 'TRANSACTION_CREATE' as ApiAction);
  if (!rateLimit.allowed) {
    log.warn(
      { action: 'transaction.rate_limited', userId: session.userId, ipAddress },
      'Transaction creation rate limited'
    );
    throw new RateLimitError();
  }

  // Idempotency check (Rule 10)
  const existing = await prisma.transaction.findUnique({
    where: { idempotencyKey: validated.idempotencyKey },
  });
  if (existing) {
    log.info(
      { action: 'transaction.create.idempotent', transactionId: existing.id },
      'Duplicate transaction request'
    );
    return { transaction: serializeTransaction(existing), wasIdempotent: true };
  }

  const result = await prisma.$transaction(async (tx) => {
    // Verify account exists, belongs to user, and is active
    const account = await tx.account.findUnique({
      where: { id: validated.accountId },
      select: {
        id: true,
        userId: true,
        balanceCents: true,
        currency: true,
        isActive: true,
        type: true,
        creditLimitCents: true,
      },
    });

    if (!account) throw new NotFoundError('Account', validated.accountId);
    if (!account.isActive) throw new InactiveAccountError(validated.accountId);
    if (account.userId !== session.userId)
      throw new UnauthorizedError('Account does not belong to user');

    // Verify currency matches (Rule 4)
    if (account.currency !== validated.currency) {
      throw new CurrencyMismatchError(account.currency, validated.currency);
    }

    // Credit cards only support EXPENSE (consumption). INCOME would reduce the
    // debt without the double-entry payment flow, which is inconsistent with
    // card semantics (the frontend hides it, but the server must reject it).
    if (account.type === 'CREDIT_CARD' && validated.type === 'INCOME') {
      throw new ValidationError('Income cannot be registered on a credit card');
    }

    await validateCategoryForUpdate(tx, validated.categoryId, session.userId);
    await validateExpenseFundsForCreate(validated.amountCents, account);

    // Create transaction record (Rule 2: integer cents)
    const transaction = await tx.transaction.create({
      data: {
        idempotencyKey: validated.idempotencyKey,
        userId: session.userId,
        accountId: validated.accountId,
        type: validated.type,
        amountCents: validated.amountCents,
        currency: validated.currency,
        description: validated.description ?? null,
        date: validated.date ?? new Date(),
        originalAmountCents: validated.originalAmountCents ?? null,
        originalCurrency: validated.originalCurrency ?? null,
        exchangeRate: validated.exchangeRate ?? null,
        categoryId: validated.categoryId ?? null,
        ipAddress,
        userAgent,
        createdBy: session.userId,
        lastModifiedBy: session.userId,
      },
    });

    // Update cached balance atomically (Rule 1: Decimal.js via addCents)
    const newBalance = addCents(Number(account.balanceCents), validated.amountCents);
    await tx.account.update({
      where: { id: validated.accountId },
      data: {
        balanceCents: newBalance,
        lastModifiedBy: session.userId,
      },
    });

    return transaction;
  });

  // Record successful API attempt (best-effort)
  try {
    const attemptId = await recordApiAttempt({
      userId: session.userId,
      action: 'TRANSACTION_CREATE' as ApiAction,
      ipAddress,
    });
    await markApiAttemptSuccess(attemptId);
  } catch (err) {
    log.error({ err, userId: session.userId }, 'Failed to record API attempt');
  }

  log.info(
    {
      action: 'transaction.create',
      transactionId: result.id,
      type: validated.type,
      userId: session.userId,
      ipAddress,
    },
    'Transaction created'
  );

  revalidatePath('/[lang]/transactions', 'page');
  revalidatePath('/[lang]/dashboard', 'page');
  revalidatePath('/[lang]/accounts', 'page');

  return { transaction: serializeTransaction(result), wasIdempotent: false };
}

export const createTransaction = safeAction(createTransactionInternal);

// ============================================================================
// deleteTransaction — Soft delete a transaction and reverse balance impact
// ============================================================================

async function deleteTransactionInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const { transactionId } = DeleteTransactionSchema.parse(input);

  // Rate limiting (Rule 10)
  const { ipAddress, userAgent } = await getClientInfo();
  const rateLimit = await checkApiRateLimit(session.userId, 'TRANSACTION_DELETE' as ApiAction);
  if (!rateLimit.allowed) {
    log.warn(
      { action: 'transaction.delete.rate_limited', userId: session.userId, ipAddress },
      'Transaction deletion rate limited'
    );
    throw new RateLimitError();
  }

  await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.findUnique({
      where: { id: transactionId },
      select: {
        id: true,
        userId: true,
        accountId: true,
        amountCents: true,
        isActive: true,
      },
    });

    if (!transaction?.isActive) throw new NotFoundError('Transaction', transactionId);
    if (transaction.userId !== session.userId)
      throw new UnauthorizedError('Transaction does not belong to user');

    // M2: a transaction that funds an active savings contribution is the
    // source of truth for the goal cache. Deleting it cascades atomically:
    // the linked contribution is soft-deleted and the goal cache is
    // decremented, keeping the ledger (transactions + contributions) the
    // single source of truth (Rule 11/13).
    const activeLinkedContributions = await tx.savingsContribution.findMany({
      where: { transactionId, isActive: true },
      select: { id: true, goalId: true, amountCents: true },
    });

    for (const contribution of activeLinkedContributions) {
      const contributionAmount = Number(contribution.amountCents);

      // 1. Soft-delete the contribution (Rule 6) with audit trail (Rule 14)
      await tx.savingsContribution.update({
        where: { id: contribution.id },
        data: {
          isActive: false,
          deletedAt: new Date(),
          lastModifiedBy: session.userId,
          ipAddress,
          userAgent,
        },
      });

      // 2. Ownership guard (defense in depth, Rule 7): the linked goal must
      //    belong to the session user. A corrupt contribution pointing at
      //    another user's goal must never decrement or revert that goal — skip
      //    the cache writes and leave reconciliation to correct the ledger.
      const goal = await tx.savingsGoal.findFirst({
        where: { id: contribution.goalId, userId: session.userId },
        select: {
          id: true,
          targetAmountCents: true,
        },
      });

      if (!goal) {
        log.warn(
          {
            contributionId: contribution.id,
            goalId: contribution.goalId,
          },
          '[SAVINGS] Cascade skipped — goal not found or not owned by user'
        );
        continue;
      }

      // 3. Revert the goal cache atomically with a CONDITIONAL update so the
      //    cache is never forced negative. If the goal has drifted below the
      //    contribution amount (0 rows matched), we do NOT force a negative
      //    value — the DB CHECK and reconcileGoalBalances on the next read
      //    will correct it from the ledger (source of truth).
      const revertResult = await tx.savingsGoal.updateMany({
        where: {
          id: contribution.goalId,
          userId: session.userId,
          currentAmountCents: { gte: contributionAmount },
        },
        data: {
          currentAmountCents: { decrement: contributionAmount },
          lastModifiedBy: session.userId,
          ipAddress,
          userAgent,
        },
      });

      if (revertResult.count === 0) {
        log.warn(
          {
            contributionId: contribution.id,
            goalId: contribution.goalId,
            amountCents: contributionAmount,
          },
          '[SAVINGS] Goal cache drift on cascade delete — left for reconciliation'
        );
      }

      // 4. If the goal was auto-completed and the reverted cache drops it below
      //    target, restore it to ACTIVE. This is a CONDITIONAL updateMany: the
      //    WHERE clause re-evaluates the live cache against the target, so a
      //    concurrent contribution that re-completed the goal between our read
      //    and this write is never overwritten back to ACTIVE (the WHERE no
      //    longer matches when currentAmountCents >= targetAmountCents).
      await tx.savingsGoal.updateMany({
        where: {
          id: contribution.goalId,
          userId: session.userId,
          status: 'COMPLETED',
          currentAmountCents: { lt: goal.targetAmountCents },
        },
        data: {
          status: 'ACTIVE',
          lastModifiedBy: session.userId,
          ipAddress,
          userAgent,
        },
      });

      log.info(
        {
          contributionId: contribution.id,
          goalId: contribution.goalId,
          amountCents: contributionAmount,
        },
        '[SAVINGS] Contribution cascade-deleted with transaction'
      );
    }

    const account = await tx.account.findUnique({
      where: { id: transaction.accountId },
      select: { id: true, balanceCents: true, type: true },
    });
    if (!account) throw new NotFoundError('Account', transaction.accountId);

    // Regla de integridad: el balance nunca puede quedar negativo (excl. CREDIT_CARD)
    if (account.type !== 'CREDIT_CARD') {
      const transactionRepo = getTransactionRepository();
      const trueBalance = await getTrueBalance(transaction.accountId, transactionRepo);
      const projectedBalance = subtractCents(trueBalance, Number(transaction.amountCents));
      if (projectedBalance < 0) {
        throw new NegativeBalanceError(transaction.accountId);
      }
    }

    // Reverse balance impact to maintain cache consistency
    const revertedBalance = addCents(
      Number(account.balanceCents),
      -Number(transaction.amountCents)
    );

    await tx.account.update({
      where: { id: account.id },
      data: {
        balanceCents: revertedBalance,
        lastModifiedBy: session.userId,
      },
    });

    // Soft delete (Rule 6)
    await tx.transaction.update({
      where: { id: transactionId },
      data: {
        isActive: false,
        deletedAt: new Date(),
        lastModifiedBy: session.userId,
      },
    });
  });

  // Record successful API attempt (best-effort)
  try {
    const attemptId = await recordApiAttempt({
      userId: session.userId,
      action: 'TRANSACTION_DELETE' as ApiAction,
      ipAddress,
    });
    await markApiAttemptSuccess(attemptId);
  } catch (err) {
    log.error({ err, userId: session.userId }, 'Failed to record API attempt');
  }

  log.info(
    {
      action: 'transaction.delete',
      transactionId,
      userId: session.userId,
    },
    'Transaction soft-deleted'
  );

  revalidatePath('/[lang]/transactions', 'page');
  revalidatePath('/[lang]/dashboard', 'page');
  revalidatePath('/[lang]/accounts', 'page');
  revalidatePath('/[lang]/savings', 'page');
}

export const deleteTransaction = safeAction(deleteTransactionInternal);

// ============================================================================
// getTransactionById — Retrieve a single transaction by ID
// ============================================================================

async function getTransactionByIdInternal(input: unknown) {
  unstable_noStore();

  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const { transactionId } = GetTransactionByIdSchema.parse(input);

  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction?.isActive) throw new NotFoundError('Transaction', transactionId);
  if (transaction.userId !== session.userId)
    throw new UnauthorizedError('Transaction does not belong to user');

  return {
    ...transaction,
    amountCents: Number(transaction.amountCents),
    originalAmountCents:
      transaction.originalAmountCents == null ? null : Number(transaction.originalAmountCents),
  };
}

export const getTransactionById = safeAction(getTransactionByIdInternal);

// ============================================================================
// updateTransaction helpers — reduce cognitive complexity (S3776)
// ============================================================================

async function validateCategoryForUpdate(
  tx: Prisma.TransactionClient,
  categoryId: string | null | undefined,
  userId: string
): Promise<void> {
  if (categoryId === undefined || categoryId === null) return;

  const category = await tx.category.findUnique({
    where: { id: categoryId },
    select: { id: true, isActive: true, userId: true },
  });

  if (!category?.isActive) throw new NotFoundError('Category', categoryId);
  if (category.userId !== null && category.userId !== userId) {
    throw new UnauthorizedError('Category does not belong to user');
  }
}

function assertAmountSignMatchesType(amountCents: number, type: TransactionType): void {
  if (type === 'EXPENSE' && amountCents >= 0) {
    throw new ValidationError('Amount sign must match transaction type (EXPENSE must be negative)');
  }
  if (type === 'INCOME' && amountCents <= 0) {
    throw new ValidationError('Amount sign must match transaction type (INCOME must be positive)');
  }
}

async function validateExpenseFunds(
  accountId: string,
  originalAmount: number,
  newAmount: number
): Promise<void> {
  const transactionRepo = getTransactionRepository();
  const trueBalance = await getTrueBalance(accountId, transactionRepo);
  const balanceWithoutTx = subtractCents(trueBalance, originalAmount);
  const projected = addCents(balanceWithoutTx, newAmount);

  if (projected < 0) {
    throw new InsufficientFundsError(Math.abs(newAmount), balanceWithoutTx);
  }
}

function computeBalanceAdjustment(
  accountBalanceCents: number,
  originalAmount: number,
  newAmount: number
): number {
  return addCents(addCents(accountBalanceCents, -originalAmount), newAmount);
}

// ============================================================================
// updateTransaction — Edit description, amount, date, or category atomically
// ============================================================================

/**
 * M2 guard: a transaction that funds an active savings contribution is the
 * source of truth for the goal cache. Editing its amount/date would
 * desynchronize the contribution ledger (amount no longer matches the cached
 * balance, or the monthly window shifts) — reject those fields. Non-monetary
 * edits (e.g. description, category) are safe and allowed.
 */
async function assertNoActiveLinkedSavingsContribution(
  tx: Prisma.TransactionClient,
  transactionId: string,
  changesMonetaryFields: boolean
): Promise<void> {
  if (!changesMonetaryFields) return;
  const activeLinkedContribution = await tx.savingsContribution.findFirst({
    where: { transactionId, isActive: true },
    select: { id: true },
  });
  if (activeLinkedContribution) {
    throw new TransactionLinkedToSavingsError();
  }
}

async function updateTransactionInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = UpdateTransactionSchema.parse(input);

  // Rate limiting (Rule 10)
  const { ipAddress, userAgent: _userAgent } = await getClientInfo();
  const rateLimit = await checkApiRateLimit(session.userId, 'TRANSACTION_UPDATE' as ApiAction);
  if (!rateLimit.allowed) {
    log.warn(
      { action: 'transaction.update.rate_limited', userId: session.userId, ipAddress },
      'Transaction update rate limited'
    );
    throw new RateLimitError();
  }

  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.findUnique({
      where: { id: validated.transactionId },
      select: {
        id: true,
        userId: true,
        accountId: true,
        amountCents: true,
        type: true,
        isActive: true,
      },
    });

    if (!transaction?.isActive) throw new NotFoundError('Transaction', validated.transactionId);
    if (transaction.userId !== session.userId) {
      throw new UnauthorizedError('Transaction does not belong to user');
    }

    // M2: a transaction that funds an active savings contribution is the source
    // of truth for the goal cache. Editing its amount/date would desynchronize
    // the contribution ledger (amount no longer matches the cached balance, or
    // the monthly window shifts) — reject those fields. Non-monetary edits
    // (e.g. description, category) are safe and allowed.
    const changesMonetaryFields =
      validated.amountCents !== undefined || validated.date !== undefined;
    await assertNoActiveLinkedSavingsContribution(
      tx,
      validated.transactionId,
      changesMonetaryFields
    );

    const account = await tx.account.findUnique({
      where: { id: transaction.accountId },
      select: {
        id: true,
        userId: true,
        balanceCents: true,
        currency: true,
        isActive: true,
      },
    });

    if (!account) throw new NotFoundError('Account', transaction.accountId);
    if (!account.isActive) throw new InactiveAccountError(account.id);
    if (account.userId !== session.userId) {
      throw new UnauthorizedError('Account does not belong to user');
    }

    await validateCategoryForUpdate(tx, validated.categoryId, session.userId);

    const originalAmount = Number(transaction.amountCents);
    const newAmount = validated.amountCents ?? originalAmount;

    if (validated.amountCents !== undefined) {
      assertAmountSignMatchesType(validated.amountCents, transaction.type);

      if (transaction.type === 'EXPENSE') {
        await validateExpenseFunds(transaction.accountId, originalAmount, newAmount);
      }
    }

    const updated = await tx.transaction.update({
      where: { id: validated.transactionId },
      data: {
        ...(validated.description !== undefined ? { description: validated.description } : {}),
        ...(validated.amountCents !== undefined ? { amountCents: validated.amountCents } : {}),
        ...(validated.date !== undefined ? { date: validated.date } : {}),
        ...(validated.categoryId !== undefined ? { categoryId: validated.categoryId } : {}),
        lastModifiedBy: session.userId,
      },
    });

    if (validated.amountCents !== undefined && newAmount !== originalAmount) {
      const newBalance = computeBalanceAdjustment(
        Number(account.balanceCents),
        originalAmount,
        newAmount
      );
      await tx.account.update({
        where: { id: account.id },
        data: {
          balanceCents: newBalance,
          lastModifiedBy: session.userId,
        },
      });
    }

    return updated;
  });

  // Record successful API attempt (best-effort)
  try {
    const attemptId = await recordApiAttempt({
      userId: session.userId,
      action: 'TRANSACTION_UPDATE' as ApiAction,
      ipAddress,
    });
    await markApiAttemptSuccess(attemptId);
  } catch (err) {
    log.error({ err, userId: session.userId }, 'Failed to record API attempt');
  }

  log.info(
    {
      action: 'transaction.update',
      transactionId: validated.transactionId,
      userId: session.userId,
      ipAddress,
    },
    'Transaction updated'
  );

  revalidatePath('/[lang]/transactions', 'page');
  revalidatePath('/[lang]/dashboard', 'page');
  revalidatePath('/[lang]/accounts', 'page');

  return { transaction: serializeTransaction(result), wasIdempotent: false };
}

export const updateTransaction = safeAction(updateTransactionInternal);
