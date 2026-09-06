/**
 * Credit Card Server Actions
 * CRUD + statement + payment for CREDIT_CARD accounts
 *
 * FINANCIAL SEMANTICS (agreed with tech-lead):
 * - Card debt = negative balanceCents (seed uses -15000000 for debt)
 * - Available credit = creditLimitCents - |trueBalance| (using REAL balance)
 * - Card expense = EXPENSE transaction with negative amountCents (increases debt)
 * - Card payment = double-entry: EXPENSE negative on bank account +
 *                  CREDIT_PAYMENT positive on the card (reduces debt)
 * - Credit limit validation only applies to CREDIT_CARD with creditLimitCents set
 *
 * RULES: R1 (Decimal.js), R2 (ISO 4217), R3 ($transaction), R4 (soft deletes/audit),
 * R5 (Zod), R12 (idempotency), R13 (getTrueBalance), R14 (ipAddress/userAgent)
 */

'use server';
import 'server-only';

import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { Prisma, type ApiAction } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { safeAction } from '@/lib/utils/action-wrapper';
import { log } from '@/lib/logger';
import { addCents, subtractCents } from '@/lib/money';
import { serializeTransaction } from '@/lib/serialize';
import { getTrueBalance, getTrueBalanceFromTx } from '@/services/reconciliation.service';
import { getTransactionRepository } from '@/lib/repositories';
import { getClientInfo } from '@/lib/utils/client-info';
import {
  checkApiRateLimit,
  recordApiAttempt,
  markApiAttemptSuccess,
} from '@/services/rate-limit.service';
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  InsufficientFundsError,
  RateLimitError,
  CurrencyMismatchError,
  InactiveAccountError,
  ValidationError,
  CardHasBalanceError,
  CardNoDebtError,
  CardOverpaymentError,
} from '@/lib/errors/api-errors';
import {
  CreateCreditCardSchema,
  UpdateCreditCardSchema,
  DeleteCreditCardSchema,
  PayCreditCardSchema,
  GetCreditCardStatementSchema,
  GetCreditCardsSchema,
} from './credit-card.schema';

type PaymentStatus = 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE';

/**
 * Transaction types that count as card charges (consumptions) on a statement.
 * Explicit set (not "any negative amount") so non-consumption debits are not
 * misclassified as charges.
 */
const CREDIT_CARD_CHARGE_TYPES: ReadonlySet<string> = new Set(['EXPENSE']);

/**
 * Account types allowed to fund a credit card payment. Bank accounts AND
 * pockets are valid sources — they represent the user's own funds, not credit,
 * so they cannot move credit between cards or bypass the credit-limit
 * validation. Only a CREDIT_CARD source is rejected (it would let a malicious
 * client pay a card from another card).
 */
const CARD_PAYMENT_SOURCE_TYPES: ReadonlySet<string> = new Set([
  'CHECKING',
  'CASH',
  'SAVINGS',
  'POCKET',
]);

/**
 * Convert Prisma monetary BIGINT fields back to JS numbers so the object is
 * safe to serialize back to the client (JSON.stringify throws on bigint).
 */
/**
 * Validate that a card has outstanding debt to pay and that the payment amount
 * does not exceed it. Throws CardNoDebtError / CardOverpaymentError.
 */
function assertPayableCardDebt(
  accountId: string,
  cardTrueBalance: number,
  amountCents: number
): void {
  const cardDebtCents = cardTrueBalance < 0 ? Math.abs(cardTrueBalance) : 0;
  if (cardDebtCents === 0) {
    throw new CardNoDebtError(accountId);
  }
  if (amountCents > cardDebtCents) {
    throw new CardOverpaymentError(amountCents, cardDebtCents);
  }
}

/**
 * Payment status for a card based on its paymentDueDay relative to today.
 * DUE_SOON → next due date is within the next 7 days.
 * OVERDUE  → this month's due date already passed and there is outstanding debt.
 * ON_TRACK → otherwise.
 */
function computePaymentStatus(paymentDueDay: number | null, hasDebt: boolean): PaymentStatus {
  if (paymentDueDay == null) return 'ON_TRACK';

  const today = new Date();
  const currentDue = new Date(today.getFullYear(), today.getMonth(), paymentDueDay);
  const nextDue = new Date(today.getFullYear(), today.getMonth() + 1, paymentDueDay);
  const upcomingDue = today.getDate() > paymentDueDay ? nextDue : currentDue;

  const daysUntilDue = Math.ceil((upcomingDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilDue <= 7) return 'DUE_SOON';
  if (today.getDate() > paymentDueDay && hasDebt) return 'OVERDUE';
  return 'ON_TRACK';
}

/**
 * Compute the statement period for a card based on its cutoff day.
 * Requested period: from cutoffDay of the previous month to cutoffDay of the
 * requested month. If month/year are omitted, uses the current active period.
 */
function computeStatementPeriod(
  cutoffDay: number,
  month?: number,
  year?: number
): { periodStart: Date; periodEnd: Date } {
  if (month !== undefined && year !== undefined) {
    const periodStart = new Date(year, month - 2, cutoffDay);
    const periodEnd = new Date(year, month - 1, cutoffDay);
    return { periodStart, periodEnd };
  }

  const today = new Date();
  if (today.getDate() >= cutoffDay) {
    // In-progress period: [this month cutoff, next month cutoff)
    return {
      periodStart: new Date(today.getFullYear(), today.getMonth(), cutoffDay),
      periodEnd: new Date(today.getFullYear(), today.getMonth() + 1, cutoffDay),
    };
  }
  // In-progress period: [last month cutoff, this month cutoff)
  return {
    periodStart: new Date(today.getFullYear(), today.getMonth() - 1, cutoffDay),
    periodEnd: new Date(today.getFullYear(), today.getMonth(), cutoffDay),
  };
}

// ============================================================================
// 1. getCreditCards — List all credit cards with debt / available credit
// ============================================================================

async function getCreditCardsInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  GetCreditCardsSchema.parse(input ?? {});

  const cards = await prisma.account.findMany({
    where: { userId: session.userId, isActive: true, type: 'CREDIT_CARD' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      currency: true,
      balanceCents: true,
      creditLimitCents: true,
      cutoffDay: true,
      paymentDueDay: true,
      cardColor: true,
      cardNetwork: true,
      createdAt: true,
      transactions: {
        where: { isActive: true },
        orderBy: { date: 'desc' },
        take: 5,
        select: {
          id: true,
          description: true,
          amountCents: true,
          currency: true,
          type: true,
          date: true,
        },
      },
    },
  });

  const transactionRepo = getTransactionRepository();

  const result = [];
  for (const card of cards) {
    const trueBalance = await getTrueBalance(card.id, transactionRepo);
    const debtCents = trueBalance < 0 ? Math.abs(trueBalance) : 0;
    const availableCreditCents =
      card.creditLimitCents != null
        ? subtractCents(Number(card.creditLimitCents), debtCents)
        : null;
    const paymentStatus = computePaymentStatus(card.paymentDueDay, debtCents > 0);

    result.push({
      ...card,
      balanceCents: Number(card.balanceCents),
      creditLimitCents: card.creditLimitCents == null ? null : Number(card.creditLimitCents),
      transactions: card.transactions.map((t) => ({
        ...t,
        amountCents: Number(t.amountCents),
      })),
      debtCents,
      availableCreditCents,
      paymentStatus,
    });
  }

  return result;
}

export const getCreditCards = safeAction(getCreditCardsInternal);

// ============================================================================
// 2. createCreditCard — Create a new CREDIT_CARD account
// ============================================================================

async function createCreditCardInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = CreateCreditCardSchema.parse(input);

  // Verify user exists (session cookie may outlive a DB reset)
  const userExists = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true },
  });
  if (!userExists) {
    throw new AppError(
      'Your session is no longer valid. Please log out and sign in again.',
      401,
      'SESSION_INVALID'
    );
  }

  // Idempotency check (Rule 12)
  const existing = await prisma.account.findUnique({
    where: { idempotencyKey: validated.idempotencyKey },
  });
  if (existing) {
    log.info(
      { action: 'credit-card.create.idempotent', accountId: existing.id },
      'Duplicate request'
    );
    return {
      account: {
        ...existing,
        balanceCents: Number(existing.balanceCents),
        creditLimitCents:
          existing.creditLimitCents == null ? null : Number(existing.creditLimitCents),
      },
      wasIdempotent: true,
    };
  }

  const { ipAddress, userAgent } = await getClientInfo();

  const account = await prisma.account.create({
    data: {
      userId: session.userId,
      name: validated.name,
      type: 'CREDIT_CARD',
      currency: validated.currency,
      balanceCents: BigInt(0),
      creditLimitCents: BigInt(validated.creditLimitCents),
      cutoffDay: validated.cutoffDay,
      paymentDueDay: validated.paymentDueDay,
      cardColor: validated.cardColor ?? null,
      cardNetwork: validated.cardNetwork ?? 'NONE',
      idempotencyKey: validated.idempotencyKey,
      createdBy: session.userId,
      lastModifiedBy: session.userId,
    },
  });

  log.info(
    {
      action: 'credit-card.create',
      accountId: account.id,
      userId: session.userId,
      ipAddress,
      userAgent,
    },
    'Credit card created'
  );

  revalidatePath('/[lang]/credit-cards', 'page');
  revalidatePath('/[lang]/accounts', 'page');
  revalidatePath('/[lang]/dashboard', 'page');

  return {
    account: {
      ...account,
      balanceCents: Number(account.balanceCents),
      creditLimitCents: account.creditLimitCents == null ? null : Number(account.creditLimitCents),
    },
    wasIdempotent: false,
  };
}

export const createCreditCard = safeAction(createCreditCardInternal);

// ============================================================================
// 3. updateCreditCard — Edit card attributes (never balanceCents)
// ============================================================================

async function updateCreditCardInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = UpdateCreditCardSchema.parse(input);

  const account = await prisma.account.findUnique({ where: { id: validated.accountId } });
  if (!account?.isActive) throw new NotFoundError('Account', validated.accountId);
  if (account.userId !== session.userId) throw new UnauthorizedError();
  if (account.type !== 'CREDIT_CARD') {
    throw new ValidationError('Account is not a credit card');
  }

  const updated = await prisma.account.update({
    where: { id: validated.accountId },
    data: {
      ...(validated.name !== undefined && { name: validated.name }),
      ...(validated.creditLimitCents !== undefined && {
        creditLimitCents: BigInt(validated.creditLimitCents),
      }),
      ...(validated.cutoffDay !== undefined && { cutoffDay: validated.cutoffDay }),
      ...(validated.paymentDueDay !== undefined && { paymentDueDay: validated.paymentDueDay }),
      ...(validated.cardColor !== undefined && { cardColor: validated.cardColor }),
      ...(validated.cardNetwork !== undefined && { cardNetwork: validated.cardNetwork }),
      lastModifiedBy: session.userId,
    },
  });

  log.info(
    { action: 'credit-card.update', accountId: updated.id, userId: session.userId },
    'Credit card updated'
  );

  revalidatePath('/[lang]/credit-cards', 'page');
  revalidatePath('/[lang]/accounts', 'page');

  return {
    account: {
      ...updated,
      balanceCents: Number(updated.balanceCents),
      creditLimitCents: updated.creditLimitCents == null ? null : Number(updated.creditLimitCents),
    },
  };
}

export const updateCreditCard = safeAction(updateCreditCardInternal);

// ============================================================================
// 4. deleteCreditCard — Soft delete only when the card has no debt
// ============================================================================

async function deleteCreditCardInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const { accountId } = DeleteCreditCardSchema.parse(input);

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account?.isActive) throw new NotFoundError('Account', accountId);
  if (account.userId !== session.userId) throw new UnauthorizedError();
  if (account.type !== 'CREDIT_CARD') {
    throw new ValidationError('Account is not a credit card');
  }

  // Rule: a card can only be deleted when there is no outstanding debt.
  // Debt = negative true balance; a positive balance (credit in favor) is allowed.
  const transactionRepo = getTransactionRepository();
  const trueBalance = await getTrueBalance(accountId, transactionRepo);

  if (trueBalance < 0) {
    throw new CardHasBalanceError(accountId, Math.abs(trueBalance));
  }

  // Soft delete (Rule 4)
  await prisma.account.update({
    where: { id: accountId },
    data: {
      isActive: false,
      deletedAt: new Date(),
      lastModifiedBy: session.userId,
    },
  });

  log.info(
    { action: 'credit-card.delete', accountId, userId: session.userId },
    'Credit card soft-deleted'
  );
  // No revalidatePath here — the client controls refresh timing to allow close animation.
}

export const deleteCreditCard = safeAction(deleteCreditCardInternal);

// ============================================================================
// 5. getCreditCardStatement — Period statement for a card
// ============================================================================

async function getCreditCardStatementInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetCreditCardStatementSchema.parse(input);

  const card = await prisma.account.findUnique({
    where: { id: validated.accountId },
    select: {
      id: true,
      userId: true,
      name: true,
      currency: true,
      isActive: true,
      type: true,
      cutoffDay: true,
      paymentDueDay: true,
      creditLimitCents: true,
    },
  });

  if (!card?.isActive) throw new NotFoundError('Account', validated.accountId);
  if (card.userId !== session.userId) throw new UnauthorizedError();
  if (card.type !== 'CREDIT_CARD') {
    throw new ValidationError('Account is not a credit card');
  }

  const cutoffDay = card.cutoffDay ?? 1;
  const { periodStart, periodEnd } = computeStatementPeriod(
    cutoffDay,
    validated.month,
    validated.year
  );

  // Previous balance = sum of all active transactions before the period (Rule 13)
  const previousTransactions = await prisma.transaction.findMany({
    where: { accountId: validated.accountId, isActive: true, date: { lt: periodStart } },
    select: { amountCents: true },
  });

  let previousBalanceCents = 0;
  for (const tx of previousTransactions) {
    previousBalanceCents = addCents(previousBalanceCents, Number(tx.amountCents));
  }

  // Period transactions
  const periodTransactions = await prisma.transaction.findMany({
    where: {
      accountId: validated.accountId,
      isActive: true,
      date: { gte: periodStart, lt: periodEnd },
    },
    orderBy: { date: 'asc' },
    select: {
      id: true,
      description: true,
      amountCents: true,
      type: true,
      date: true,
      categoryId: true,
    },
  });

  let chargesTotalCents = 0; // consumptions (EXPENSE) — increase debt
  let paymentsTotalCents = 0; // positive CREDIT_PAYMENT amounts (reduce debt)
  let totalPeriodAmount = 0;

  for (const tx of periodTransactions) {
    const amountCents = Number(tx.amountCents);
    totalPeriodAmount = addCents(totalPeriodAmount, amountCents);
    if (CREDIT_CARD_CHARGE_TYPES.has(tx.type)) {
      chargesTotalCents = addCents(chargesTotalCents, amountCents);
    } else if (tx.type === 'CREDIT_PAYMENT') {
      paymentsTotalCents = addCents(paymentsTotalCents, amountCents);
    }
  }

  const newBalanceCents = addCents(previousBalanceCents, totalPeriodAmount);

  return {
    accountId: validated.accountId,
    currency: card.currency,
    periodStart,
    periodEnd,
    previousBalanceCents,
    chargesTotalCents,
    paymentsTotalCents,
    interestTotalCents: 0, // No interest model yet
    newBalanceCents,
    availableCreditCents:
      card.creditLimitCents != null
        ? subtractCents(Number(card.creditLimitCents), Math.abs(Math.min(newBalanceCents, 0)))
        : null,
    transactions: periodTransactions.map((t) => ({
      ...t,
      amountCents: Number(t.amountCents),
    })),
  };
}

export const getCreditCardStatement = safeAction(getCreditCardStatementInternal);

// ============================================================================
// 6. payCreditCard — Double-entry card payment
// ============================================================================

async function payCreditCardInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = PayCreditCardSchema.parse(input);
  const { ipAddress, userAgent } = await getClientInfo();

  // Rate limiting (Rule 10)
  const rateLimit = await checkApiRateLimit(session.userId, 'CREDIT_CARD_PAYMENT' as ApiAction);
  if (!rateLimit.allowed) {
    log.warn(
      { action: 'credit-card.pay.rate_limited', userId: session.userId, ipAddress },
      'Credit card payment rate limited'
    );
    throw new RateLimitError();
  }

  // Idempotency check (Rule 12) — stored on the CREDIT_PAYMENT transaction
  const existing = await prisma.transaction.findUnique({
    where: { idempotencyKey: validated.idempotencyKey },
  });
  if (existing) {
    log.info(
      { action: 'credit-card.pay.idempotent', transactionId: existing.id },
      'Duplicate payment request'
    );
    return { payment: serializeTransaction(existing), wasIdempotent: true };
  }

  // Verify user exists and get language for the localized default description
  // (session cookie may outlive a DB reset).
  const userExists = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, language: true },
  });
  if (!userExists) {
    throw new AppError(
      'Your session is no longer valid. Please log out and sign in again.',
      401,
      'SESSION_INVALID'
    );
  }
  const defaultPaymentDescription =
    userExists.language === 'ENGLISH' ? 'Credit card payment' : 'Pago tarjeta';

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      // 1. Validate the credit card
      const card = await tx.account.findUnique({
        where: { id: validated.accountId },
        select: {
          id: true,
          userId: true,
          name: true,
          balanceCents: true,
          currency: true,
          isActive: true,
          type: true,
        },
      });

      if (!card?.isActive) throw new NotFoundError('Account', validated.accountId);
      if (card.userId !== session.userId) {
        throw new UnauthorizedError('Card does not belong to user');
      }
      if (card.type !== 'CREDIT_CARD') {
        throw new ValidationError('Account is not a credit card');
      }
      if (card.currency !== validated.currency) {
        throw new CurrencyMismatchError(card.currency, validated.currency);
      }

      // 1b. Compute the card's REAL balance from the transactional snapshot and
      //     validate there is outstanding debt to pay. Prevents paying a card
      //     with no debt (creating unintended credit in favor) and overpaying
      //     beyond the outstanding debt.
      const cardTrueBalance = await getTrueBalanceFromTx(tx, validated.accountId);
      assertPayableCardDebt(validated.accountId, cardTrueBalance, validated.amountCents);

      // 2. Validate the source (funding) account
      const sourceAccount = await tx.account.findUnique({
        where: { id: validated.sourceAccountId },
        select: {
          id: true,
          userId: true,
          balanceCents: true,
          currency: true,
          isActive: true,
          type: true,
        },
      });

      if (!sourceAccount?.isActive) throw new InactiveAccountError(validated.sourceAccountId);
      if (sourceAccount.userId !== session.userId) {
        throw new UnauthorizedError('Source account does not belong to user');
      }
      if (sourceAccount.currency !== validated.currency) {
        throw new CurrencyMismatchError(sourceAccount.currency, validated.currency);
      }
      // Bank accounts and pockets can fund a card payment (they hold the user's
      // own funds, not credit). Only a CREDIT_CARD source is rejected — paying
      // from another card would move credit between cards and bypass the
      // credit-limit validation.
      if (!CARD_PAYMENT_SOURCE_TYPES.has(sourceAccount.type)) {
        throw new ValidationError('Source account cannot be a credit card');
      }

      // 3. Lock the source account row (SELECT ... FOR UPDATE) so concurrent
      //    payments from the same account serialize at this point. This closes the
      //    TOCTOU race where two payments both pass the funds check and overdraw.
      const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Account" WHERE id = ${validated.sourceAccountId} FOR UPDATE
      `;
      if (lockedRows.length === 0) {
        throw new NotFoundError('Account', validated.sourceAccountId);
      }

      // 4. Re-read the cached balance under the lock so the cache update below
      //    never overwrites a concurrent payment's committed change.
      const lockedSource = await tx.account.findUnique({
        where: { id: validated.sourceAccountId },
        select: { id: true, balanceCents: true },
      });
      if (!lockedSource) throw new NotFoundError('Account', validated.sourceAccountId);

      // 5. Compute the true balance from the transactional snapshot (Rule 13).
      //    Using tx.transaction (not the global prisma client) guarantees the funds
      //    check sees every payment committed before we acquired the lock.
      const sourceTrueBalance = await getTrueBalanceFromTx(tx, validated.sourceAccountId);
      if (sourceTrueBalance < validated.amountCents) {
        throw new InsufficientFundsError(validated.amountCents, sourceTrueBalance);
      }

      // 6. Shared transfer ID links both legs (double-entry, pattern of transfers)
      const transferId = crypto.randomUUID();
      const description = validated.description ?? `${defaultPaymentDescription} ${card.name}`;
      const paymentDate = validated.date ?? new Date();

      // 7. EXPENSE (negative) on the source account — funds leave the bank account
      const sourceTransaction = await tx.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: session.userId,
          accountId: validated.sourceAccountId,
          type: 'EXPENSE',
          amountCents: -validated.amountCents,
          currency: validated.currency,
          description,
          date: paymentDate,
          transferId,
          transferToAccountId: validated.accountId,
          ipAddress,
          userAgent,
          createdBy: session.userId,
          lastModifiedBy: session.userId,
        },
      });

      // 8. CREDIT_PAYMENT (positive) on the card — reduces debt (balance gets less negative)
      const payment = await tx.transaction.create({
        data: {
          idempotencyKey: validated.idempotencyKey,
          userId: session.userId,
          accountId: validated.accountId,
          type: 'CREDIT_PAYMENT',
          amountCents: validated.amountCents,
          currency: validated.currency,
          description,
          date: paymentDate,
          transferId,
          transferFromAccountId: validated.sourceAccountId,
          ipAddress,
          userAgent,
          createdBy: session.userId,
          lastModifiedBy: session.userId,
        },
      });

      // 9. Update cached balances (Rule 1: Decimal.js)
      const newSourceBalance = subtractCents(
        Number(lockedSource.balanceCents),
        validated.amountCents
      );
      const newCardBalance = addCents(Number(card.balanceCents), validated.amountCents); // -150000 + 50000 = -100000

      await Promise.all([
        tx.account.update({
          where: { id: validated.sourceAccountId },
          data: { balanceCents: newSourceBalance, lastModifiedBy: session.userId },
        }),
        tx.account.update({
          where: { id: validated.accountId },
          data: { balanceCents: newCardBalance, lastModifiedBy: session.userId },
        }),
      ]);

      return { payment, sourceTransaction, transferId };
    });
  } catch (error) {
    // A concurrent request may have committed the same idempotencyKey between the
    // fast-path check and our create (unique constraint P2002). Treat it as an
    // idempotent success instead of surfacing a raw constraint error.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.transaction.findUnique({
        where: { idempotencyKey: validated.idempotencyKey },
      });
      if (existing) {
        log.info(
          { action: 'credit-card.pay.idempotent', transactionId: existing.id },
          'Duplicate payment request (concurrent)'
        );
        return { payment: serializeTransaction(existing), wasIdempotent: true };
      }
    }
    throw error;
  }

  // Record successful API attempt (best-effort)
  try {
    const attemptId = await recordApiAttempt({
      userId: session.userId,
      action: 'CREDIT_CARD_PAYMENT' as ApiAction,
      ipAddress,
    });
    await markApiAttemptSuccess(attemptId);
  } catch (err) {
    log.error({ err, userId: session.userId }, 'Failed to record API attempt');
  }

  log.info(
    {
      action: 'credit-card.pay',
      paymentId: result.payment.id,
      sourceTransactionId: result.sourceTransaction.id,
      accountId: validated.accountId,
      amountCents: validated.amountCents,
      userId: session.userId,
      ipAddress,
    },
    'Credit card payment completed'
  );

  revalidatePath('/[lang]/credit-cards', 'page');
  revalidatePath('/[lang]/accounts', 'page');
  revalidatePath('/[lang]/dashboard', 'page');

  return {
    payment: serializeTransaction(result.payment),
    sourceTransaction: serializeTransaction(result.sourceTransaction),
    wasIdempotent: false,
  };
}

export const payCreditCard = safeAction(payCreditCardInternal);
