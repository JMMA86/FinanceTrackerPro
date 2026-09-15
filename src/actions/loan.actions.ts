/**
 * Loan Server Actions (Fase B)
 *
 * RULE 3: Multi-record writes run inside prisma.$transaction()
 * RULE 4: Soft deletes + audit trail (createdBy, lastModifiedBy, ip, user agent)
 * RULE 5: Zod validation server-side
 * RULE 10: Rate limiting on money actions (ApiAction.LOAN_*)
 * RULE 12: Idempotency key UUID v4 on every mutating money action
 * RULE 13: Account.balanceCents is a cache; funds checked from the ledger snapshot
 * RULE 14: Security logging with IP and user agent
 */

'use server';
import 'server-only';

import { revalidatePath } from 'next/cache';
import {
  Prisma,
  type ApiAction,
  type Currency,
  type Loan,
  type LoanInstallmentStatus,
  type TransactionType,
} from '@prisma/client';
import { Decimal } from 'decimal.js';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { safeAction } from '@/lib/utils/action-wrapper';
import { log } from '@/lib/logger';
import { subtractCents } from '@/lib/money';
import { getTrueBalanceFromTx } from '@/services/reconciliation.service';
import { getClientInfo } from '@/lib/utils/client-info';
import {
  checkApiRateLimit,
  recordApiAttempt,
  markApiAttemptSuccess,
} from '@/services/rate-limit.service';
import {
  CurrencyMismatchError,
  IdempotencyError,
  InsufficientFundsError,
  LoanAlreadyCompletedError,
  LoanAdjustmentNotAllowedError,
  LoanInstallmentAlreadyPaidError,
  LoanInstallmentNotPayableError,
  LoanNotFoundError,
  LoanOverpaymentError,
  NotFoundError,
  PaymentAmountInvalidError,
  RateLimitError,
  UnauthorizedError,
} from '@/lib/errors/api-errors';
import {
  AddLoanAdjustmentSchema,
  CreateLoanSchema,
  DeleteLoanSchema,
  GetLoanDetailSchema,
  GetLoansForPaymentSchema,
  GetLoansSchema,
  GetLoansSummarySchema,
  GetPendingLoanInstallmentsSchema,
  PayLoanInstallmentSchema,
  UpdateLoanSchema,
  type AddLoanAdjustmentInput,
  type CreateLoanInput,
} from './loan.schema';
import {
  applyLoanInstallmentPayment,
  createLoanWithSchedule,
  deriveLoanLedgerBalance,
  getLoanDetail as getLoanDetailService,
  getLoansForPayment as getLoansForPaymentService,
  getLoansSummary as getLoansSummaryService,
  getLoansWithDetails,
  getPendingLoanInstallments as getPendingLoanInstallmentsService,
  recomputeLoanTotals,
  regenerateFutureSchedule,
  regenerateScheduleAfterExtraPayment,
  serializeAdjustment,
  serializeLoan,
  serializePayment,
  toSafeCents,
} from '@/services/loan.service';

// ============================================================================
// Shared helpers
// ============================================================================

type TxClient = Prisma.TransactionClient;

interface ClientAudit {
  ipAddress: string;
  userAgent: string;
}

/** Load a loan by id and enforce ownership + active state (generic errors). */
async function loadOwnedActiveLoan(tx: TxClient, userId: string, loanId: string): Promise<Loan> {
  const loan = await tx.loan.findUnique({ where: { id: loanId } });
  if (!loan?.isActive) {
    throw new LoanNotFoundError();
  }
  if (loan.userId !== userId) {
    throw new LoanNotFoundError();
  }
  return loan;
}

/** Load an installment with its loan, enforcing ownership + active state. */
async function loadOwnedInstallment(tx: TxClient, userId: string, installmentId: string) {
  const installment = await tx.loanInstallment.findUnique({
    where: { id: installmentId },
    include: { loan: true },
  });
  if (!installment || !installment.isActive || !installment.loan.isActive) {
    throw new LoanNotFoundError();
  }
  if (installment.loan.userId !== userId) {
    throw new LoanNotFoundError();
  }
  return installment;
}

/** Lock the account row (SELECT ... FOR UPDATE) and verify ownership/currency. */
async function lockOwnedAccount(
  tx: TxClient,
  userId: string,
  accountId: string,
  expectedCurrency: Currency
): Promise<{ id: string; balanceCents: bigint; currency: Currency }> {
  const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Account" WHERE id = ${accountId} FOR UPDATE
  `;
  if (lockedRows.length === 0) {
    throw new NotFoundError('Account', accountId);
  }

  const account = await tx.account.findUnique({
    where: { id: accountId },
    select: { id: true, userId: true, balanceCents: true, isActive: true, currency: true },
  });
  if (!account?.isActive) {
    throw new NotFoundError('Account', accountId);
  }
  if (account.userId !== userId) {
    throw new UnauthorizedError('Account does not belong to user');
  }
  if (account.currency !== expectedCurrency) {
    throw new CurrencyMismatchError(expectedCurrency, account.currency);
  }
  return account;
}

async function assertSufficientFunds(
  tx: TxClient,
  accountId: string,
  amountCents: number
): Promise<void> {
  const trueBalance = await getTrueBalanceFromTx(tx, accountId);
  if (trueBalance < amountCents) {
    throw new InsufficientFundsError(amountCents, trueBalance);
  }
}

async function enforceRateLimit(
  userId: string,
  action: ApiAction,
  ipAddress: string
): Promise<void> {
  const rateLimit = await checkApiRateLimit(userId, action);
  if (rateLimit.allowed) return;
  log.warn({ action, userId, ipAddress }, '[LOAN] Rate limited');
  throw new RateLimitError();
}

async function recordSuccessfulAttempt(
  userId: string,
  action: ApiAction,
  ipAddress: string
): Promise<void> {
  try {
    const attemptId = await recordApiAttempt({ userId, action, ipAddress });
    await markApiAttemptSuccess(attemptId);
  } catch (err) {
    log.error({ err, userId, action }, 'Failed to record API attempt');
  }
}

/**
 * Invalidate the pages that surface loan data after a mutation so the dashboard
 * KPIs (external debt / receivables) and the loans list never serve stale data.
 */
function revalidateLoanViews(): void {
  revalidatePath('/[lang]/dashboard', 'page');
  revalidatePath('/[lang]/loans', 'page');
}

/** Normalize a Prisma P2002 `meta.target` into a list of field names. */
function normalizeConstraintTarget(target: unknown): string[] {
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') return [target];
  return [];
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function toCreateLoanServiceInput(validated: CreateLoanInput) {
  return {
    name: validated.name,
    type: validated.type,
    direction: validated.direction,
    counterpartyContact: validated.counterpartyContact ?? null,
    notes: validated.notes ?? null,
    principalCents: validated.principalCents,
    currency: validated.currency,
    rateType: validated.rateType,
    interestRateValue: validated.interestRateValue,
    interestMode: validated.interestMode,
    interestAccrual: validated.interestAccrual,
    dayCountBasis: validated.dayCountBasis,
    amortizationType: validated.amortizationType,
    paymentFrequency: validated.paymentFrequency,
    scheduleMode: validated.scheduleMode,
    termCount: validated.termCount ?? null,
    installmentAmountCents: validated.installmentAmountCents ?? null,
    interestOnlyInstallments: validated.interestOnlyInstallments,
    customTotals: validated.customTotals ?? null,
    startDate: validated.startDate,
    firstPaymentDate: validated.firstPaymentDate,
    color: validated.color ?? null,
    icon: validated.icon ?? null,
    idempotencyKey: validated.idempotencyKey,
  };
}

// ============================================================================
// 1. createLoan
// ============================================================================

async function resolveCreateLoanRace(
  error: unknown,
  userId: string,
  idempotencyKey: string
): Promise<string | null> {
  if (!isUniqueViolation(error)) throw error;
  const existing = await prisma.loan.findUnique({ where: { idempotencyKey } });
  if (existing?.userId === userId && existing.isActive) {
    log.info(
      { action: 'loan.create.idempotent', loanId: existing.id },
      'Duplicate loan create resolved after unique violation'
    );
    return existing.id;
  }
  throw error;
}

async function createLoanInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = CreateLoanSchema.parse(input);
  const client = await getClientInfo();

  await enforceRateLimit(session.userId, 'LOAN_CREATE', client.ipAddress);

  const existing = await prisma.loan.findUnique({
    where: { idempotencyKey: validated.idempotencyKey },
  });
  if (existing?.userId === session.userId && existing.isActive) {
    const detail = await getLoanDetailService(session.userId, existing.id);
    return { loan: detail, wasIdempotent: true };
  }

  let loanId: string;
  try {
    loanId = await prisma.$transaction(async (tx) => {
      let accountId: string | null = null;
      if (validated.accountId) {
        const account = await lockOwnedAccount(
          tx,
          session.userId,
          validated.accountId,
          validated.currency
        );
        accountId = account.id;

        // Lending money out (RECEIVABLE) must be funded from the account.
        if (validated.direction === 'RECEIVABLE') {
          await assertSufficientFunds(tx, account.id, validated.principalCents);
        }
      }

      const loan = await createLoanWithSchedule(
        tx,
        toCreateLoanServiceInput(validated),
        session.userId,
        client
      );

      if (accountId) {
        const isReceivable = validated.direction === 'RECEIVABLE';
        const signedAmount = isReceivable ? -validated.principalCents : validated.principalCents;

        await tx.transaction.create({
          data: {
            // Same key as the loan: a network retry can never double-book.
            idempotencyKey: validated.idempotencyKey,
            userId: session.userId,
            accountId,
            type: isReceivable ? 'EXPENSE' : 'INCOME',
            amountCents: signedAmount,
            currency: validated.currency,
            description: isReceivable
              ? `Préstamo otorgado: ${validated.name}`
              : `Préstamo recibido: ${validated.name}`,
            date: validated.startDate,
            createdBy: session.userId,
            lastModifiedBy: session.userId,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
          },
        });

        await tx.account.update({
          where: { id: accountId },
          data: { balanceCents: { increment: signedAmount }, lastModifiedBy: session.userId },
        });
      }

      return loan.id;
    });
  } catch (error) {
    const resolvedId = await resolveCreateLoanRace(error, session.userId, validated.idempotencyKey);
    if (resolvedId == null) throw error;
    const detail = await getLoanDetailService(session.userId, resolvedId);
    await recordSuccessfulAttempt(session.userId, 'LOAN_CREATE', client.ipAddress);
    return { loan: detail, wasIdempotent: true };
  }

  await recordSuccessfulAttempt(session.userId, 'LOAN_CREATE', client.ipAddress);

  const detail = await getLoanDetailService(session.userId, loanId);
  if (!detail) throw new LoanNotFoundError();

  log.info(
    { action: 'loan.create', loanId, userId: session.userId },
    'Loan created with amortization schedule'
  );

  revalidateLoanViews();

  return { loan: detail, wasIdempotent: false };
}

export const createLoan = safeAction(createLoanInternal);

// ============================================================================
// 2. getLoans
// ============================================================================

async function getLoansInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetLoansSchema.parse(input ?? {});
  return getLoansWithDetails(session.userId, {
    direction: validated.direction,
    status: validated.status,
  });
}

export const getLoans = safeAction(getLoansInternal);

// ============================================================================
// 3. getLoanDetail
// ============================================================================

async function getLoanDetailInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetLoanDetailSchema.parse(input);
  const loan = await getLoanDetailService(session.userId, validated.loanId);
  if (!loan) throw new LoanNotFoundError();
  return loan;
}

export const getLoanDetail = safeAction(getLoanDetailInternal);

// ============================================================================
// 4. updateLoan (metadata only)
// ============================================================================

async function updateLoanInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = UpdateLoanSchema.parse(input);
  const client = await getClientInfo();

  const updated = await prisma.$transaction(async (tx) => {
    await loadOwnedActiveLoan(tx, session.userId, validated.loanId);

    const result = await tx.loan.updateMany({
      where: { id: validated.loanId, userId: session.userId, isActive: true },
      data: {
        name: validated.name,
        counterpartyContact: validated.counterpartyContact,
        notes: validated.notes,
        color: validated.color,
        icon: validated.icon,
        status: validated.status,
        lastModifiedBy: session.userId,
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
      },
    });
    if (result.count !== 1) throw new LoanNotFoundError();

    return tx.loan.findUniqueOrThrow({ where: { id: validated.loanId } });
  });

  log.info(
    { action: 'loan.update', loanId: updated.id, userId: session.userId },
    'Loan metadata updated'
  );

  revalidateLoanViews();

  return serializeLoan(updated);
}

export const updateLoan = safeAction(updateLoanInternal);

// ============================================================================
// 5. deleteLoan (soft delete)
// ============================================================================

async function deleteLoanInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = DeleteLoanSchema.parse(input);
  const client = await getClientInfo();

  await prisma.$transaction(async (tx) => {
    const loan = await loadOwnedActiveLoan(tx, session.userId, validated.loanId);

    const settledCount = await tx.loanInstallment.count({
      where: {
        loanId: loan.id,
        isActive: true,
        status: { in: ['PAID', 'PARTIAL'] },
      },
    });
    if (settledCount > 0) {
      throw new LoanAdjustmentNotAllowedError();
    }

    const now = new Date();
    const result = await tx.loan.updateMany({
      where: { id: loan.id, userId: session.userId, isActive: true },
      data: {
        isActive: false,
        deletedAt: now,
        status: 'CANCELLED',
        lastModifiedBy: session.userId,
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
      },
    });
    if (result.count !== 1) throw new LoanNotFoundError();

    await tx.loanInstallment.updateMany({
      where: {
        loanId: loan.id,
        isActive: true,
        status: { in: ['PENDING', 'OVERDUE'] },
      },
      data: {
        isActive: false,
        deletedAt: now,
        lastModifiedBy: session.userId,
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
      },
    });
  });

  log.info(
    { action: 'loan.delete', loanId: validated.loanId, userId: session.userId },
    'Loan soft-deleted'
  );

  revalidateLoanViews();

  return { success: true, loanId: validated.loanId };
}

export const deleteLoan = safeAction(deleteLoanInternal);

// ============================================================================
// 6. getPendingLoanInstallments
// ============================================================================

async function getPendingLoanInstallmentsInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetPendingLoanInstallmentsSchema.parse(input ?? {});

  let currency: Currency | undefined = validated.currency;
  if (validated.accountId) {
    const account = await prisma.account.findFirst({
      where: { id: validated.accountId, userId: session.userId, isActive: true },
      select: { currency: true },
    });
    if (!account) throw new NotFoundError('Account', validated.accountId);
    currency = account.currency;
  }

  return getPendingLoanInstallmentsService(session.userId, { currency });
}

export const getPendingLoanInstallments = safeAction(getPendingLoanInstallmentsInternal);

// ============================================================================
// 6b. getLoansForPayment — READ-ONLY selector for the transactions modal
// ============================================================================

async function getLoansForPaymentInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetLoansForPaymentSchema.parse(input ?? {});
  return getLoansForPaymentService(session.userId, {
    direction: validated.direction,
    currency: validated.currency,
  });
}

export const getLoansForPayment = safeAction(getLoansForPaymentInternal);

// ============================================================================
// 7. registerLoanPayment
// ============================================================================

interface LoanPaymentOutcome {
  payment: Awaited<ReturnType<typeof applyLoanInstallmentPayment>>['payment'];
  wasIdempotent: boolean;
}

async function resolveLoanPaymentRace(
  error: unknown,
  userId: string,
  idempotencyKey: string
): Promise<LoanPaymentOutcome | null> {
  if (!isUniqueViolation(error)) return null;

  const targetFields = normalizeConstraintTarget(
    error instanceof Prisma.PrismaClientKnownRequestError ? error.meta?.target : []
  );
  log.warn({ targetFields, idempotencyKey }, '[LOAN] Unique violation while registering payment');

  const payment = await prisma.loanInstallmentPayment.findUnique({
    where: { idempotencyKey },
  });
  if (payment) {
    const owner = await prisma.loanInstallment.findUnique({
      where: { id: payment.installmentId },
      select: { loan: { select: { userId: true } } },
    });
    if (owner?.loan.userId === userId) {
      return { payment, wasIdempotent: true };
    }
  }

  const existingTx = await prisma.transaction.findUnique({ where: { idempotencyKey } });
  if (existingTx?.userId === userId) {
    const linked = await prisma.loanInstallmentPayment.findUnique({
      where: { transactionId: existingTx.id },
    });
    if (linked) return { payment: linked, wasIdempotent: true };
  }

  return null;
}

interface PaymentContext {
  tx: TxClient;
  userId: string;
  validated: ReturnType<typeof PayLoanInstallmentSchema.parse>;
  client: ClientAudit;
}

/** Idempotency pre-check inside the transaction (Rule 12). */
async function resolvePaymentIdempotency(
  tx: TxClient,
  userId: string,
  validated: ReturnType<typeof PayLoanInstallmentSchema.parse>
): Promise<LoanPaymentOutcome | null> {
  const existingTx = await tx.transaction.findUnique({
    where: { idempotencyKey: validated.idempotencyKey },
  });
  if (!existingTx) return null;

  const belongs =
    existingTx.userId === userId && existingTx.loanInstallmentId === validated.installmentId;
  if (!belongs) throw new IdempotencyError(validated.idempotencyKey);

  const payment = await tx.loanInstallmentPayment.findUnique({
    where: { idempotencyKey: validated.idempotencyKey },
  });
  if (payment) return { payment, wasIdempotent: true };
  throw new IdempotencyError(validated.idempotencyKey);
}

/**
 * GLOBAL lock order: Account → Loan → LoanInstallment. The adjustment path
 * (EXTRA_PAYMENT/EXTRA_DISBURSEMENT) locks Account → Loan before its
 * installments; acquiring the installment before the Loan here would create an
 * inverted cycle and a 40P01 deadlock. Lock the Loan, then the installment.
 */
async function lockLoanAndInstallment(
  tx: TxClient,
  loanId: string,
  installmentId: string
): Promise<void> {
  const lockedLoanRows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Loan" WHERE id = ${loanId} FOR UPDATE
  `;
  if (lockedLoanRows.length === 0) {
    throw new LoanNotFoundError();
  }

  const lockedInstallmentRows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "LoanInstallment" WHERE id = ${installmentId} FOR UPDATE
  `;
  if (lockedInstallmentRows.length === 0) {
    throw new LoanNotFoundError();
  }
}

/** Reject installments whose status cannot accept a payment. */
function assertInstallmentPayable(status: LoanInstallmentStatus): void {
  if (status === 'PAID') {
    throw new LoanInstallmentAlreadyPaidError();
  }
  if (status !== 'PENDING' && status !== 'PARTIAL' && status !== 'OVERDUE') {
    throw new LoanInstallmentNotPayableError();
  }
}

/** Resolve and validate the amount to apply against the fresh installment. */
function resolvePaymentAmount(
  installment: { totalCents: bigint; paidAmountCents: bigint | null },
  requestedAmountCents: number | undefined
): number {
  const totalCents = toSafeCents(installment.totalCents, 'totalCents');
  const paidAmountCents =
    installment.paidAmountCents == null
      ? 0
      : toSafeCents(installment.paidAmountCents, 'paidAmountCents');
  const remainingCents = subtractCents(totalCents, paidAmountCents);
  const amountCents = requestedAmountCents ?? remainingCents;

  if (amountCents <= 0 || amountCents > remainingCents || !Number.isInteger(amountCents)) {
    throw new PaymentAmountInvalidError();
  }
  return amountCents;
}

async function executeLoanPayment(context: PaymentContext): Promise<LoanPaymentOutcome> {
  const { tx, userId, validated, client } = context;

  // Idempotency pre-check inside the transaction (Rule 12).
  const idempotentOutcome = await resolvePaymentIdempotency(tx, userId, validated);
  if (idempotentOutcome) return idempotentOutcome;

  // Pre-lock read: authorization + currency traceability.
  const preLocked = await loadOwnedInstallment(tx, userId, validated.installmentId);
  const account = await lockOwnedAccount(tx, userId, validated.accountId, preLocked.loan.currency);

  // Lock the Loan before the installment. Two payments coming from DIFFERENT
  // accounts but targeting the SAME installment would otherwise read the same
  // `paidAmountCents` and lose one update (MAJOR 4 — lost update).
  await lockLoanAndInstallment(tx, preLocked.loan.id, validated.installmentId);

  // Re-read AFTER the locks to close the TOCTOU window and recompute the split
  // from the fresh values.
  const locked = await loadOwnedInstallment(tx, userId, validated.installmentId);
  assertInstallmentPayable(locked.status);

  const amountCents = resolvePaymentAmount(locked, validated.amountCents);

  const isPayable = locked.loan.direction === 'PAYABLE';
  if (isPayable) {
    await assertSufficientFunds(tx, account.id, amountCents);
  }

  const paidAt = validated.date ?? new Date();
  const signedAmount = isPayable ? -amountCents : amountCents;

  const transaction = await tx.transaction.create({
    data: {
      idempotencyKey: validated.idempotencyKey,
      userId,
      accountId: account.id,
      type: isPayable ? 'LOAN_PAYMENT' : 'LOAN_RECEIPT',
      amountCents: signedAmount,
      currency: locked.loan.currency,
      description: `${isPayable ? 'Pago' : 'Recibo'} cuota ${locked.installmentNumber}: ${locked.loan.name}`,
      date: paidAt,
      loanInstallmentId: locked.id,
      createdBy: userId,
      lastModifiedBy: userId,
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
    },
  });

  await tx.account.update({
    where: { id: account.id },
    data: { balanceCents: { increment: signedAmount }, lastModifiedBy: userId },
  });

  const applied = await applyLoanInstallmentPayment(tx, {
    installment: locked,
    loan: locked.loan,
    amountCents,
    paidAt,
    notes: validated.notes ?? null,
    idempotencyKey: validated.idempotencyKey,
    transactionId: transaction.id,
    userId,
    audit: client,
  });

  return { payment: applied.payment, wasIdempotent: applied.wasIdempotent };
}

async function registerLoanPaymentInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = PayLoanInstallmentSchema.parse(input);
  const client = await getClientInfo();

  // Resolve the direction before rate limiting so the right counter is charged.
  const preloaded = await prisma.loanInstallment.findUnique({
    where: { id: validated.installmentId },
    include: { loan: { select: { direction: true } } },
  });
  if (!preloaded || !preloaded.isActive || !preloaded.loan) {
    throw new LoanNotFoundError();
  }

  const rateLimitAction: ApiAction =
    preloaded.loan.direction === 'PAYABLE' ? 'LOAN_PAYMENT' : 'LOAN_RECEIVE';
  await enforceRateLimit(session.userId, rateLimitAction, client.ipAddress);

  let outcome: LoanPaymentOutcome;
  try {
    outcome = await prisma.$transaction((tx) =>
      executeLoanPayment({ tx, userId: session.userId, validated, client })
    );
  } catch (error) {
    const resolved = await resolveLoanPaymentRace(error, session.userId, validated.idempotencyKey);
    if (!resolved) throw error;
    outcome = resolved;
  }

  await recordSuccessfulAttempt(session.userId, rateLimitAction, client.ipAddress);

  log.info(
    {
      action: 'loan.payment',
      installmentId: validated.installmentId,
      userId: session.userId,
      amountCents: Number(outcome.payment.amountCents),
      wasIdempotent: outcome.wasIdempotent,
    },
    'Loan installment payment recorded'
  );

  revalidateLoanViews();

  return {
    payment: serializePayment(outcome.payment),
    wasIdempotent: outcome.wasIdempotent,
  };
}

export const registerLoanPayment = safeAction(registerLoanPaymentInternal);

// ============================================================================
// 8. addLoanAdjustment
// ============================================================================

interface AdjustmentContext {
  tx: TxClient;
  userId: string;
  validated: AddLoanAdjustmentInput;
  loan: Loan;
  client: ClientAudit;
}

async function createAdjustmentRow(context: AdjustmentContext, transactionId: string | null) {
  const { tx, userId, validated, loan, client } = context;
  return tx.loanAdjustment.create({
    data: {
      loanId: loan.id,
      type: validated.type,
      effectiveDate: validated.effectiveDate,
      amountCents: validated.amountCents ?? null,
      newRateValue: validated.newRateValue != null ? new Decimal(validated.newRateValue) : null,
      newTermCount: validated.newTermCount ?? null,
      installmentNumber: validated.installmentNumber ?? null,
      notes: validated.notes ?? null,
      transactionId,
      idempotencyKey: validated.idempotencyKey,
      createdBy: userId,
      lastModifiedBy: userId,
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
    },
  });
}

async function findNextPendingInstallmentNumber(
  tx: TxClient,
  loanId: string
): Promise<number | null> {
  const next = await tx.loanInstallment.findFirst({
    where: { loanId, isActive: true, status: 'PENDING' },
    orderBy: { installmentNumber: 'asc' },
    select: { installmentNumber: true },
  });
  return next?.installmentNumber ?? null;
}

/** Map an extra-money adjustment to its ledger transaction type. */
function resolveAdjustmentTransactionType(
  type: AddLoanAdjustmentInput['type'],
  direction: Loan['direction']
): TransactionType {
  const isDisbursement = type === 'EXTRA_DISBURSEMENT';
  const isReceivable = direction === 'RECEIVABLE';
  if (isDisbursement) {
    return isReceivable ? 'EXPENSE' : 'INCOME';
  }
  return isReceivable ? 'LOAN_RECEIPT' : 'LOAN_PAYMENT';
}

function buildAdjustmentDescription(
  type: AddLoanAdjustmentInput['type'],
  loanName: string
): string {
  return type === 'EXTRA_DISBURSEMENT'
    ? `Desembolso extra: ${loanName}`
    : `Pago extra: ${loanName}`;
}

/**
 * Create the signed account transaction for an extra-money adjustment and move
 * the cached account balance. Returns the created transaction id.
 */
async function createAdjustmentAccountMovement(
  context: AdjustmentContext,
  accountId: string,
  amountCents: number,
  isAccountOutflow: boolean
): Promise<string> {
  const { tx, userId, validated, loan, client } = context;
  const signedAmount = isAccountOutflow ? -amountCents : amountCents;

  if (isAccountOutflow) {
    await assertSufficientFunds(tx, accountId, amountCents);
  }

  const transaction = await tx.transaction.create({
    data: {
      idempotencyKey: validated.idempotencyKey,
      userId,
      accountId,
      type: resolveAdjustmentTransactionType(validated.type, loan.direction),
      amountCents: signedAmount,
      currency: loan.currency,
      description: buildAdjustmentDescription(validated.type, loan.name),
      date: validated.effectiveDate,
      createdBy: userId,
      lastModifiedBy: userId,
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
    },
  });

  await tx.account.update({
    where: { id: accountId },
    data: { balanceCents: { increment: signedAmount }, lastModifiedBy: userId },
  });

  return transaction.id;
}

/** EXTRA_DISBURSEMENT: grows the debt and rebuilds the future schedule. */
async function applyExtraDisbursement(
  context: AdjustmentContext,
  transactionId: string | null
): Promise<Awaited<ReturnType<typeof createAdjustmentRow>>> {
  const { tx, userId, loan, client } = context;

  // CRITICAL 1 — `Loan.principalCents` is the IMMUTABLE ORIGINAL principal.
  // An extra disbursement is recorded ONLY as a LoanAdjustment and grows the
  // outstanding `balanceCents`; principalCents is never mutated again. The
  // ledger (`deriveLoanLedgerBalance`) is the single source of truth:
  //   balance = principal + Σ EXTRA_DISBURSEMENT − Σ paidPrincipal − Σ EXTRA_PAYMENT
  const adjustment = await createAdjustmentRow(context, transactionId);
  const ledgerBalance = await deriveLoanLedgerBalance(tx, loan.id);

  await tx.loan.update({
    where: { id: loan.id },
    data: {
      balanceCents: ledgerBalance,
      lastModifiedBy: userId,
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
    },
  });

  // An extra disbursement grows the debt, so the future schedule must be rebuilt
  // as well: otherwise Σ planned principal would no longer match the derived
  // balance (invariant documented in `regenerateFutureSchedule`).
  await regenerateScheduleAfterExtraPayment(tx, loan, ledgerBalance, client);
  return adjustment;
}

/** EXTRA_PAYMENT: reduces the ledger-derived debt and rebuilds the schedule. */
async function applyExtraPayment(
  context: AdjustmentContext,
  transactionId: string | null,
  amountCents: number
): Promise<Awaited<ReturnType<typeof createAdjustmentRow>>> {
  const { tx, userId, loan, client } = context;

  // CRITICAL 2 — validate the extra payment against the ledger-derived debt,
  // never against the possibly-stale `balanceCents` cache.
  const ledgerBalance = await deriveLoanLedgerBalance(tx, loan.id);
  if (amountCents > ledgerBalance) {
    throw new LoanOverpaymentError();
  }

  const adjustment = await createAdjustmentRow(context, transactionId);
  const remainingBalance = Math.max(0, subtractCents(ledgerBalance, amountCents));

  await tx.loan.update({
    where: { id: loan.id },
    data: {
      balanceCents: remainingBalance,
      lastModifiedBy: userId,
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
    },
  });

  // Rebuild the unpaid schedule so the planned future principal matches the
  // derived remaining debt; a zero balance marks the loan COMPLETED and
  // soft-deletes the remaining unpaid installments.
  await regenerateScheduleAfterExtraPayment(tx, loan, remainingBalance, client);

  return adjustment;
}

async function applyExtraMoneyMovement(
  context: AdjustmentContext
): Promise<Awaited<ReturnType<typeof createAdjustmentRow>>> {
  const { tx, userId, validated, loan } = context;
  const amountCents = validated.amountCents;
  if (amountCents == null) throw new PaymentAmountInvalidError();

  const isDisbursement = validated.type === 'EXTRA_DISBURSEMENT';
  const isReceivable = loan.direction === 'RECEIVABLE';

  const account = validated.accountId
    ? await lockOwnedAccount(tx, userId, validated.accountId, loan.currency)
    : null;

  let transactionId: string | null = null;

  if (account) {
    // SIGNED amount moving through the account:
    // - RECEIVABLE: lending out is an outflow; receiving a repayment is an inflow.
    // - PAYABLE: receiving a loan is an inflow; repaying is an outflow.
    const isAccountOutflow = isDisbursement ? isReceivable : !isReceivable;
    transactionId = await createAdjustmentAccountMovement(
      context,
      account.id,
      amountCents,
      isAccountOutflow
    );
  }

  // Serialize extra money movements on the same loan. The ledger is read and the
  // `balanceCents` cache is rewritten below, so concurrent adjustments must not
  // interleave (account is locked first, keeping a single lock order).
  await tx.$queryRaw`SELECT id FROM "Loan" WHERE id = ${loan.id} FOR UPDATE`;

  if (isDisbursement) {
    return applyExtraDisbursement(context, transactionId);
  }

  return applyExtraPayment(context, transactionId, amountCents);
}

async function applyScheduleAdjustment(
  context: AdjustmentContext
): Promise<Awaited<ReturnType<typeof createAdjustmentRow>>> {
  const { tx, userId, validated, loan, client } = context;

  // GLOBAL lock order: Account → Loan → LoanInstallment. Schedule adjustments
  // never move money through an account, but they do touch installments, so the
  // Loan must be locked BEFORE them to stay deadlock-free against a concurrent
  // payment (which locks Account → Loan → LoanInstallment).
  await tx.$queryRaw`SELECT id FROM "Loan" WHERE id = ${loan.id} FOR UPDATE`;

  if (validated.type === 'RATE_CHANGE') {
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        interestRateValue: new Decimal(validated.newRateValue ?? 0),
        lastModifiedBy: userId,
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
      },
    });
  } else if (validated.type === 'RESCHEDULE') {
    const newTermCount = validated.newTermCount ?? loan.termCount;
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        termCount: newTermCount,
        lastModifiedBy: userId,
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
      },
    });

    if (newTermCount < loan.termCount) {
      // A reduced term must not leave orphan active installments beyond it.
      // Only PENDING/OVERDUE rows can be removed safely: PAID rows are history
      // and a PARTIAL row (already carrying payments) is rejected by the
      // regeneration guard below rather than silently discarded.
      const now = new Date();
      await tx.loanInstallment.updateMany({
        where: {
          loanId: loan.id,
          installmentNumber: { gt: newTermCount },
          isActive: true,
          status: { in: ['PENDING', 'OVERDUE'] as LoanInstallmentStatus[] },
        },
        data: {
          isActive: false,
          deletedAt: now,
          lastModifiedBy: userId,
          ipAddress: client.ipAddress,
          userAgent: client.userAgent,
        },
      });
    }
  } else if (validated.type === 'INTEREST_ONLY_PERIOD') {
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        interestOnlyInstallments: validated.installmentNumber ?? loan.interestOnlyInstallments,
        lastModifiedBy: userId,
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
      },
    });
  } else {
    // CUSTOM_INSTALLMENT
    const target = await tx.loanInstallment.findUnique({
      where: {
        loanId_installmentNumber: {
          loanId: loan.id,
          installmentNumber: validated.installmentNumber ?? 0,
        },
      },
    });
    if (!target?.isActive || target.status !== 'PENDING') {
      throw new LoanAdjustmentNotAllowedError();
    }
    await tx.loanInstallment.update({
      where: { id: target.id },
      data: {
        totalCents: validated.amountCents ?? target.totalCents,
        isCustomTotal: true,
        lastModifiedBy: userId,
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
      },
    });
    await recomputeLoanTotals(tx, loan);
    return createAdjustmentRow(context, null);
  }

  const refreshed = await tx.loan.findUniqueOrThrow({ where: { id: loan.id } });
  const from = await findNextPendingInstallmentNumber(tx, loan.id);
  if (from != null) {
    await regenerateFutureSchedule(tx, refreshed, from, client);
  } else {
    await recomputeLoanTotals(tx, refreshed);
  }

  return createAdjustmentRow(context, null);
}

async function executeLoanAdjustment(
  tx: TxClient,
  userId: string,
  validated: AddLoanAdjustmentInput,
  client: ClientAudit
): Promise<{ adjustmentId: string; wasIdempotent: boolean }> {
  const existing = await tx.loanAdjustment.findUnique({
    where: { idempotencyKey: validated.idempotencyKey },
  });
  if (existing) {
    const owner = await tx.loan.findUnique({
      where: { id: existing.loanId },
      select: { userId: true },
    });
    if (owner?.userId !== userId) throw new LoanNotFoundError();
    return { adjustmentId: existing.id, wasIdempotent: true };
  }

  const loan = await loadOwnedActiveLoan(tx, userId, validated.loanId);
  if (loan.status === 'COMPLETED') {
    throw new LoanAlreadyCompletedError();
  }

  const context: AdjustmentContext = { tx, userId, validated, loan, client };

  let adjustment: Awaited<ReturnType<typeof createAdjustmentRow>>;
  switch (validated.type) {
    case 'EXTRA_DISBURSEMENT':
    case 'EXTRA_PAYMENT':
      adjustment = await applyExtraMoneyMovement(context);
      break;
    case 'RATE_CHANGE':
    case 'RESCHEDULE':
    case 'CUSTOM_INSTALLMENT':
    case 'INTEREST_ONLY_PERIOD':
      adjustment = await applyScheduleAdjustment(context);
      break;
    default: {
      const exhaustive: never = validated.type;
      log.error({ type: String(exhaustive) }, '[LOAN] Unsupported adjustment type');
      throw new LoanAdjustmentNotAllowedError();
    }
  }

  return { adjustmentId: adjustment.id, wasIdempotent: false };
}

async function addLoanAdjustmentInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = AddLoanAdjustmentSchema.parse(input);
  const client = await getClientInfo();

  await enforceRateLimit(session.userId, 'LOAN_ADJUSTMENT', client.ipAddress);

  let outcome: { adjustmentId: string; wasIdempotent: boolean };
  try {
    outcome = await prisma.$transaction((tx) =>
      executeLoanAdjustment(tx, session.userId, validated, client)
    );
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await prisma.loanAdjustment.findUnique({
      where: { idempotencyKey: validated.idempotencyKey },
    });
    if (!existing) throw error;
    const owner = await prisma.loan.findUnique({
      where: { id: existing.loanId },
      select: { userId: true },
    });
    if (owner?.userId !== session.userId) throw error;
    outcome = { adjustmentId: existing.id, wasIdempotent: true };
  }

  await recordSuccessfulAttempt(session.userId, 'LOAN_ADJUSTMENT', client.ipAddress);

  const adjustment = await prisma.loanAdjustment.findUniqueOrThrow({
    where: { id: outcome.adjustmentId },
  });

  log.info(
    {
      action: 'loan.adjustment',
      adjustmentId: adjustment.id,
      loanId: adjustment.loanId,
      type: adjustment.type,
      userId: session.userId,
      wasIdempotent: outcome.wasIdempotent,
    },
    'Loan adjustment applied'
  );

  revalidateLoanViews();

  return { adjustment: serializeAdjustment(adjustment), wasIdempotent: outcome.wasIdempotent };
}

export const addLoanAdjustment = safeAction(addLoanAdjustmentInternal);

// ============================================================================
// 9. getLoansSummary
// ============================================================================

async function getLoansSummaryInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  GetLoansSummarySchema.parse(input ?? {});
  return getLoansSummaryService(session.userId);
}

export const getLoansSummary = safeAction(getLoansSummaryInternal);
