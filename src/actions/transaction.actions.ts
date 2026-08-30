'use server';
import 'server-only';

import { unstable_noStore, revalidatePath } from 'next/cache';
import { addDays } from 'date-fns';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { safeAction } from '@/lib/utils/action-wrapper';
import { log } from '@/lib/logger';
import { addCents, subtractCents } from '@/lib/money';
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
} from '@/lib/errors/api-errors';
import {
  GetAllTransactionsSchema,
  CreateTransactionActionSchema,
  DeleteTransactionSchema,
  GetTransactionByIdSchema,
  UpdateTransactionSchema,
} from './transaction.schema';
import type { Prisma, ApiAction } from '@prisma/client';

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
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    transactions,
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
    return { transaction: existing, wasIdempotent: true };
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

    // Validate category if provided (must be system or own, and active)
    if (validated.categoryId) {
      const category = await tx.category.findUnique({
        where: { id: validated.categoryId },
        select: { id: true, isActive: true, userId: true },
      });
      if (!category?.isActive) throw new NotFoundError('Category', validated.categoryId);
      if (category.userId !== null && category.userId !== session.userId) {
        throw new UnauthorizedError('Category does not belong to user');
      }
    }

    // For EXPENSE, verify sufficient funds using true balance (Rule 13)
    if (validated.type === 'EXPENSE') {
      const transactionRepo = getTransactionRepository();
      const trueBalance = await getTrueBalance(validated.accountId, transactionRepo);

      const projectedBalance = addCents(trueBalance, validated.amountCents);
      if (projectedBalance < 0) {
        throw new InsufficientFundsError(Math.abs(validated.amountCents), trueBalance);
      }
    }

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
    const newBalance = addCents(account.balanceCents, validated.amountCents);
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

  return { transaction: result, wasIdempotent: false };
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
  const { ipAddress } = await getClientInfo();
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

    const account = await tx.account.findUnique({
      where: { id: transaction.accountId },
      select: { id: true, balanceCents: true },
    });
    if (!account) throw new NotFoundError('Account', transaction.accountId);

    // Reverse balance impact to maintain cache consistency
    const revertedBalance = addCents(account.balanceCents, -transaction.amountCents);

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

  return transaction;
}

export const getTransactionById = safeAction(getTransactionByIdInternal);

// ============================================================================
// updateTransaction — Edit description, amount, date, or category atomically
// ============================================================================

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
    // 1. Find transaction
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
    if (transaction.userId !== session.userId)
      throw new UnauthorizedError('Transaction does not belong to user');

    // 2. Find account
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
    if (account.userId !== session.userId)
      throw new UnauthorizedError('Account does not belong to user');

    // 3. Validate category if provided
    if (validated.categoryId !== undefined) {
      if (validated.categoryId !== null) {
        const category = await tx.category.findUnique({
          where: { id: validated.categoryId },
          select: { id: true, isActive: true, userId: true },
        });
        if (!category?.isActive) throw new NotFoundError('Category', validated.categoryId);
        if (category.userId !== null && category.userId !== session.userId) {
          throw new UnauthorizedError('Category does not belong to user');
        }
      }
    }

    // 4. Amount sign validation and balance calculation
    const originalAmount = transaction.amountCents;
    const newAmount = validated.amountCents ?? originalAmount;

    if (validated.amountCents !== undefined) {
      // Validate sign matches transaction type
      if (transaction.type === 'EXPENSE' && validated.amountCents >= 0) {
        throw new ValidationError(
          'Amount sign must match transaction type (EXPENSE must be negative)'
        );
      }
      if (transaction.type === 'INCOME' && validated.amountCents <= 0) {
        throw new ValidationError(
          'Amount sign must match transaction type (INCOME must be positive)'
        );
      }

      // Validate sufficient funds for EXPENSE (Rule 13)
      if (transaction.type === 'EXPENSE') {
        const transactionRepo = getTransactionRepository();
        const trueBalance = await getTrueBalance(transaction.accountId, transactionRepo);
        const balanceWithoutTx = subtractCents(trueBalance, originalAmount);
        const projected = addCents(balanceWithoutTx, newAmount);

        if (projected < 0) {
          throw new InsufficientFundsError(Math.abs(newAmount), balanceWithoutTx);
        }
      }
    }

    // 5. Update transaction
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

    // 6. Update account balance if amount changed
    if (validated.amountCents !== undefined && newAmount !== originalAmount) {
      const newBalance = addCents(addCents(account.balanceCents, -originalAmount), newAmount);
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

  return { transaction: result, wasIdempotent: false };
}

export const updateTransaction = safeAction(updateTransactionInternal);
