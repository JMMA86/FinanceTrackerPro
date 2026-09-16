/**
 * Loan Service (Business Logic — Fase B)
 *
 * RULE 1: All money math uses Decimal.js (via @/lib/money helpers) + the pure
 *         amortization engine in @/lib/loans/interest.
 * RULE 2: Money stored as integer cents (BigInt) — serialized to number on read.
 * RULE 3: Multi-record writes run inside prisma.$transaction() (caller-owned tx).
 * RULE 6: Loans/installments are soft-deleted, never physically removed.
 * RULE 11: Per-currency buckets — currencies are NEVER mixed.
 * RULE 13: Loan.balanceCents is a CACHE reconciled from installments +
 *          adjustments (source of truth).
 */

import 'server-only';
import { Decimal } from 'decimal.js';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { addCents, subtractCents } from '@/lib/money';
import {
  IdempotencyError,
  InternalServerError,
  LoanAdjustmentNotAllowedError,
  LoanInstallmentAlreadyPaidError,
  LoanNotFoundError,
  PaymentAmountInvalidError,
  ValidationError,
} from '@/lib/errors/api-errors';
import {
  addPeriods,
  buildAmortizationSchedule,
  computeLoanSummary,
  computeTermCountFromInstallment,
  LoanScheduleValidationError,
  type ScheduleRow,
} from '@/lib/loans/interest';
import type {
  Currency,
  Loan,
  LoanAdjustment,
  LoanAdjustmentType,
  LoanAmortizationType,
  LoanDayCountBasis,
  LoanDirection,
  LoanInstallment,
  LoanInstallmentPayment,
  LoanInstallmentStatus,
  LoanInterestAccrual,
  LoanInterestMode,
  LoanPaymentFrequency,
  LoanRateType,
  LoanStatus,
  LoanType,
  Prisma,
} from '@prisma/client';
import type {
  LoanAdjustmentSerialized,
  LoanDerivedSummary,
  LoanInstallmentPaymentSerialized,
  LoanInstallmentSerialized,
  LoanPaymentOption,
  LoanScheduleMode,
  LoanSerialized,
  LoanWithInstallments,
  LoansSummaryResponse,
  LoanSummaryPerCurrency,
  PendingLoanInstallment,
} from '@/types/loans';

// ============================================================================
// Audit + serialization helpers
// ============================================================================

/** Request metadata written on mutating rows (Rule 14). Reads omit it. */
export interface LoanAudit {
  ipAddress?: string | null;
  userAgent?: string | null;
}

function auditFields(audit?: LoanAudit): { ipAddress?: string | null; userAgent?: string | null } {
  if (!audit) return {};
  return { ipAddress: audit.ipAddress ?? null, userAgent: audit.userAgent ?? null };
}

const MAX_SAFE_CENTS_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_CENTS_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

/**
 * Convert a monetary BIGINT to a JS number, failing loudly if the value would
 * lose precision. Values are validation-bounded by MAX_SAFE_CENTS, so this is a
 * defensive guard against corrupted/legacy rows.
 */
export function toSafeCents(value: bigint, field: string): number {
  if (value > MAX_SAFE_CENTS_BIGINT || value < MIN_SAFE_CENTS_BIGINT) {
    log.error(
      { field, value: value.toString() },
      '[LOAN] Monetary BIGINT exceeds Number.MAX_SAFE_INTEGER'
    );
    throw new RangeError(`Monetary value out of safe integer range for ${field}`);
  }
  return Number(value);
}

function optionalCents(value: bigint | null, field: string): number | null {
  return value == null ? null : toSafeCents(value, field);
}

/**
 * Relations may be present at runtime only when the query included them (the
 * Prisma base model type does not declare them), so they are typed as optional
 * and stripped explicitly to keep responses JSON-safe.
 */
type LoanWithOptionalRelations = Loan & {
  installments?: unknown;
  adjustments?: unknown;
  user?: unknown;
};

/** Serialize a Prisma Loan (BigInt/Decimal → plain JSON-safe values). */
export function serializeLoan(loan: LoanWithOptionalRelations): LoanSerialized {
  const { installments: _installments, adjustments: _adjustments, user: _user, ...rest } = loan;

  return {
    ...rest,
    principalCents: toSafeCents(loan.principalCents, 'principalCents'),
    balanceCents: toSafeCents(loan.balanceCents, 'balanceCents'),
    installmentAmountCents: optionalCents(loan.installmentAmountCents, 'installmentAmountCents'),
    totalInterestCents: toSafeCents(loan.totalInterestCents, 'totalInterestCents'),
    totalPayableCents: toSafeCents(loan.totalPayableCents, 'totalPayableCents'),
    interestRateValue: loan.interestRateValue.toNumber(),
    effectiveYieldPct: loan.effectiveYieldPct == null ? null : loan.effectiveYieldPct.toNumber(),
  };
}

type PaymentWithOptionalRelations = LoanInstallmentPayment & {
  installment?: unknown;
  transaction?: unknown;
};

/** Serialize a LoanInstallmentPayment (BigInt → number). */
export function serializePayment(
  payment: PaymentWithOptionalRelations
): LoanInstallmentPaymentSerialized {
  const { installment: _installment, transaction: _transaction, ...rest } = payment;
  return {
    ...rest,
    amountCents: toSafeCents(payment.amountCents, 'amountCents'),
    principalCents: toSafeCents(payment.principalCents, 'principalCents'),
    interestCents: toSafeCents(payment.interestCents, 'interestCents'),
  };
}

type InstallmentWithOptionalRelations = LoanInstallment & {
  loan?: unknown;
  transactions?: unknown;
  payments?: LoanInstallmentPayment[];
};

/** Serialize a LoanInstallment, converting its payments as well. */
export function serializeInstallment(
  installment: InstallmentWithOptionalRelations
): LoanInstallmentSerialized {
  const { loan: _loan, transactions: _transactions, ...rest } = installment;
  return {
    ...rest,
    principalCents: toSafeCents(installment.principalCents, 'principalCents'),
    interestCents: toSafeCents(installment.interestCents, 'interestCents'),
    totalCents: toSafeCents(installment.totalCents, 'totalCents'),
    balanceCents: toSafeCents(installment.balanceCents, 'balanceCents'),
    paidAmountCents: optionalCents(installment.paidAmountCents, 'paidAmountCents'),
    paidPrincipalCents: toSafeCents(installment.paidPrincipalCents, 'paidPrincipalCents'),
    paidInterestCents: toSafeCents(installment.paidInterestCents, 'paidInterestCents'),
    payments: (installment.payments ?? []).map(serializePayment),
  };
}

type AdjustmentWithOptionalRelations = LoanAdjustment & {
  loan?: unknown;
  transaction?: unknown;
};

/** Serialize a LoanAdjustment (BigInt/Decimal → plain JSON-safe values). */
export function serializeAdjustment(
  adjustment: AdjustmentWithOptionalRelations
): LoanAdjustmentSerialized {
  const { loan: _loan, transaction: _transaction, ...rest } = adjustment;
  return {
    ...rest,
    amountCents: optionalCents(adjustment.amountCents, 'amountCents'),
    newRateValue: adjustment.newRateValue == null ? null : adjustment.newRateValue.toNumber(),
  };
}

// ============================================================================
// Per-currency helpers (Rule 11 — never mix currencies)
// ============================================================================

type MoneyByCurrency = Partial<Record<Currency, number>>;

const CURRENCY_ORDER: Record<Currency, number> = { COP: 0, USD: 1, EUR: 2 };

function addToCurrencyBucket(
  buckets: MoneyByCurrency,
  currency: Currency,
  amountCents: number
): void {
  buckets[currency] = addCents(buckets[currency] ?? 0, amountCents);
}

function collectCurrencies(...maps: MoneyByCurrency[]): Currency[] {
  const keys = new Set<Currency>();
  for (const map of maps) {
    for (const key of Object.keys(map) as Currency[]) {
      keys.add(key);
    }
  }
  return [...keys].sort((a, b) => CURRENCY_ORDER[a] - CURRENCY_ORDER[b]);
}

// ============================================================================
// Reconciliation (Rule 13)
// ============================================================================

/** The ledger fields required to derive the outstanding balance. */
interface LoanLedgerInput {
  principalCents: bigint;
  installments: Array<{ paidPrincipalCents: bigint }>;
  adjustments: Array<{ type: LoanAdjustmentType; amountCents: bigint | null }>;
}

/**
 * Recompute the outstanding balance from the ledger (Rule 13, source of truth).
 *
 * INVARIANT — `Loan.principalCents` is the IMMUTABLE ORIGINAL principal and is
 * never mutated after creation, including by an `EXTRA_DISBURSEMENT`. An extra
 * disbursement grows only the outstanding `Loan.balanceCents` cache; the
 * `LoanAdjustment` rows are the single source of truth for both extra movements.
 * Therefore the only valid reconciliation is:
 *
 *   balance = principalCents
 *           + Σ EXTRA_DISBURSEMENT
 *           − Σ paidPrincipalCents
 *           − Σ EXTRA_PAYMENT
 *
 * The result is clamped at zero so a defensive reload of a corrupt/stale
 * snapshot can never persist a negative outstanding balance.
 */
function computeLedgerBalance(loan: LoanLedgerInput): number {
  let balance = toSafeCents(loan.principalCents, 'principalCents');

  for (const adjustment of loan.adjustments) {
    if (adjustment.amountCents == null) continue;
    const amount = toSafeCents(adjustment.amountCents, 'adjustment.amountCents');
    if (adjustment.type === 'EXTRA_DISBURSEMENT') {
      balance = addCents(balance, amount);
    } else if (adjustment.type === 'EXTRA_PAYMENT') {
      balance = subtractCents(balance, amount);
    }
  }

  for (const installment of loan.installments) {
    balance = subtractCents(
      balance,
      toSafeCents(installment.paidPrincipalCents, 'paidPrincipalCents')
    );
  }

  return Decimal.max(0, balance).toNumber();
}

/** The installment fields required to decide whether it still owes money. */
interface InstallmentSettlementInput {
  status: LoanInstallmentStatus;
  principalCents: bigint;
  interestCents: bigint;
  paidPrincipalCents: bigint;
  paidInterestCents: bigint;
}

/**
 * An installment is settled when it has no unpaid principal NOR interest left.
 * WAIVED rows are treated as settled (the forgiven amount is never collected).
 *
 * This is the SINGLE completion criterion shared by payment completion,
 * extra-payment completion and reconciliation, so a loan with an outstanding
 * interest balance is never marked COMPLETED prematurely.
 */
function isInstallmentSettled(installment: InstallmentSettlementInput): boolean {
  if (installment.status === 'WAIVED') return true;
  const unpaidPrincipal = subtractCents(
    toSafeCents(installment.principalCents, 'principalCents'),
    toSafeCents(installment.paidPrincipalCents, 'paidPrincipalCents')
  );
  const unpaidInterest = subtractCents(
    toSafeCents(installment.interestCents, 'interestCents'),
    toSafeCents(installment.paidInterestCents, 'paidInterestCents')
  );
  return unpaidPrincipal <= 0 && unpaidInterest <= 0;
}

/** True when at least one active installment still has an amount pending. */
async function hasUnpaidActiveInstallments(
  tx: Prisma.TransactionClient,
  loanId: string
): Promise<boolean> {
  const installments = await tx.loanInstallment.findMany({
    where: { loanId, isActive: true },
    select: {
      status: true,
      principalCents: true,
      interestCents: true,
      paidPrincipalCents: true,
      paidInterestCents: true,
    },
  });
  return installments.some((installment) => !isInstallmentSettled(installment));
}

/**
 * Derive the outstanding balance from the ledger inside an open transaction.
 * Deliberately never reads the `balanceCents` cache (it may be stale mid-write).
 * Used both by reconciliation and by the adjustment action to validate an
 * `EXTRA_PAYMENT` against the true debt.
 */
export async function deriveLoanLedgerBalance(
  tx: Prisma.TransactionClient,
  loanId: string
): Promise<number> {
  const snapshot = await tx.loan.findUnique({
    where: { id: loanId },
    select: {
      principalCents: true,
      installments: {
        where: { isActive: true },
        select: { paidPrincipalCents: true },
      },
      adjustments: {
        where: { isActive: true },
        select: { type: true, amountCents: true },
      },
    },
  });
  if (!snapshot) throw new LoanNotFoundError();
  return computeLedgerBalance(snapshot);
}

/**
 * Reconcile a single loan cache. Conditional updateMany guards against a
 * concurrent write (the read snapshot is the WHERE predicate), so a parallel
 * payment is never silently overwritten.
 */
async function reconcileSingleLoan(loanId: string): Promise<void> {
  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    select: {
      id: true,
      userId: true,
      isActive: true,
      status: true,
      principalCents: true,
      balanceCents: true,
      installments: {
        where: { isActive: true },
        select: {
          status: true,
          principalCents: true,
          interestCents: true,
          paidPrincipalCents: true,
          paidInterestCents: true,
        },
      },
      adjustments: {
        where: { isActive: true },
        select: { type: true, amountCents: true },
      },
    },
  });

  if (!loan?.isActive) return;

  const trueBalance = computeLedgerBalance(loan);
  const cachedBalance = toSafeCents(loan.balanceCents, 'balanceCents');
  const allSettled = loan.installments.length > 0 && loan.installments.every(isInstallmentSettled);
  const shouldComplete = trueBalance === 0 && allSettled && loan.status === 'ACTIVE';
  const balanceDiffers = trueBalance !== cachedBalance;

  if (!balanceDiffers && !shouldComplete) return;

  await prisma.loan.updateMany({
    where: { id: loanId, balanceCents: loan.balanceCents },
    data: {
      ...(balanceDiffers ? { balanceCents: trueBalance } : {}),
      ...(shouldComplete ? { status: 'COMPLETED' as LoanStatus } : {}),
      lastReconciled: new Date(),
    },
  });
}

/**
 * Best-effort reconciliation of every active loan of a user. Never throws: a
 * reconciliation failure must not break a read path.
 */
export async function reconcileLoanBalance(userId: string): Promise<void> {
  try {
    const loans = await prisma.loan.findMany({
      where: { userId, isActive: true },
      select: { id: true },
    });

    for (const loan of loans) {
      try {
        await reconcileSingleLoan(loan.id);
      } catch (error) {
        log.error({ error, loanId: loan.id, userId }, '[LOAN] Single loan reconciliation failed');
      }
    }
  } catch (error) {
    log.error({ error, userId }, '[LOAN] Loan reconciliation failed on read');
  }
}

// ============================================================================
// Reads
// ============================================================================

export interface LoanListFilters {
  direction?: LoanDirection;
  status?: LoanStatus;
}

type LoanWithRelations = Loan & {
  installments: Array<LoanInstallment & { payments?: LoanInstallmentPayment[] }>;
  adjustments: LoanAdjustment[];
};

function deriveLoanSummary(
  loan: LoanSerialized,
  installments: LoanInstallmentSerialized[]
): LoanDerivedSummary {
  let paidCount = 0;
  let pendingCount = 0;
  let nextDueDate: Date | null = null;

  for (const installment of installments) {
    if (installment.status === 'PAID') {
      paidCount++;
      continue;
    }
    if (installment.status === 'WAIVED') continue;
    pendingCount++;
    if (nextDueDate == null || installment.dueDate < nextDueDate) {
      nextDueDate = installment.dueDate;
    }
  }

  const repaid = subtractCents(loan.principalCents, loan.balanceCents);
  const rawProgress =
    loan.principalCents > 0
      ? new Decimal(repaid)
          .dividedBy(loan.principalCents)
          .times(100)
          .toDecimalPlaces(1, Decimal.ROUND_HALF_EVEN)
          .toNumber()
      : 0;

  return {
    paidCount,
    pendingCount,
    nextDueDate,
    progressPct: Math.min(100, Math.max(0, rawProgress)),
  };
}

function buildLoanAggregate(loan: LoanWithRelations): LoanWithInstallments {
  const installments = loan.installments.map((installment) => serializeInstallment(installment));
  const adjustments = loan.adjustments.map((adjustment) => serializeAdjustment(adjustment));
  const serialized = serializeLoan(loan);

  return {
    ...serialized,
    installments,
    adjustments,
    ...deriveLoanSummary(serialized, installments),
  };
}

const loanAggregateInclude = {
  installments: {
    where: { isActive: true },
    orderBy: { installmentNumber: 'asc' as const },
    include: {
      payments: {
        where: { isActive: true },
        orderBy: { paidAt: 'desc' as const },
      },
    },
  },
  adjustments: {
    where: { isActive: true },
    orderBy: { effectiveDate: 'asc' as const },
  },
} satisfies Prisma.LoanInclude;

/**
 * Active loans of a user with their installments, payments, adjustments and a
 * derived summary. Reconciles caches before reading (Rule 13).
 */
export async function getLoansWithDetails(
  userId: string,
  filters?: LoanListFilters
): Promise<LoanWithInstallments[]> {
  await reconcileLoanBalance(userId);

  const loans = await prisma.loan.findMany({
    where: {
      userId,
      isActive: true,
      ...(filters?.direction ? { direction: filters.direction } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    include: loanAggregateInclude,
  });

  return loans.map((loan) => buildLoanAggregate(loan));
}

/**
 * A single loan aggregate. Returns null when it does not exist, is soft-deleted
 * or belongs to another user (callers map null to a generic NotFound).
 */
export async function getLoanDetail(
  userId: string,
  loanId: string
): Promise<LoanWithInstallments | null> {
  await reconcileLoanBalance(userId);

  const loan = await prisma.loan.findFirst({
    where: { id: loanId, userId, isActive: true },
    include: loanAggregateInclude,
  });

  return loan ? buildLoanAggregate(loan) : null;
}

/**
 * Pending/partial installments of ACTIVE loans, flattened for the transactions
 * modal selector.
 */
export async function getPendingLoanInstallments(
  userId: string,
  filters?: { currency?: Currency }
): Promise<PendingLoanInstallment[]> {
  const installments = await prisma.loanInstallment.findMany({
    where: {
      isActive: true,
      status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] as LoanInstallmentStatus[] },
      loan: {
        userId,
        isActive: true,
        status: 'ACTIVE',
        ...(filters?.currency ? { currency: filters.currency } : {}),
      },
    },
    orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
    include: {
      loan: { select: { id: true, name: true, direction: true, currency: true } },
    },
  });

  return installments.map((installment) => {
    const totalCents = toSafeCents(installment.totalCents, 'totalCents');
    const paidAmountCents =
      installment.paidAmountCents == null
        ? 0
        : toSafeCents(installment.paidAmountCents, 'paidAmountCents');

    return {
      loanId: installment.loan.id,
      loanName: installment.loan.name,
      direction: installment.loan.direction,
      currency: installment.loan.currency,
      installmentId: installment.id,
      installmentNumber: installment.installmentNumber,
      dueDate: installment.dueDate,
      totalCents,
      paidAmountCents,
      remainingCents: subtractCents(totalCents, paidAmountCents),
      expectedTransactionType:
        installment.loan.direction === 'PAYABLE' ? 'LOAN_PAYMENT' : 'LOAN_RECEIPT',
    };
  });
}

/** Optional filters for the transactions-modal loan selector. */
export interface LoanPaymentFilters {
  direction?: LoanDirection;
  currency?: Currency;
}

/**
 * Active loans flattened for the transactions modal, each annotated with the
 * state of its current-month installment and its next/overdue unpaid one.
 *
 * Only ACTIVE (non soft-deleted) loans are returned. All active installments
 * are included so `currentMonthInstallment` can report a PAID row; the
 * `overdue`/`next`/`pendingCount` fields consider only unpaid (PENDING/PARTIAL)
 * rows. `remainingCents` is Decimal-clamped at zero.
 */
export async function getLoansForPayment(
  userId: string,
  filters?: LoanPaymentFilters
): Promise<LoanPaymentOption[]> {
  const loans = await prisma.loan.findMany({
    where: {
      userId,
      isActive: true,
      status: 'ACTIVE' as LoanStatus,
      ...(filters?.direction ? { direction: filters.direction } : {}),
      ...(filters?.currency ? { currency: filters.currency } : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      name: true,
      direction: true,
      currency: true,
      balanceCents: true,
      installments: {
        where: { isActive: true },
        orderBy: { installmentNumber: 'asc' },
        select: {
          id: true,
          installmentNumber: true,
          dueDate: true,
          totalCents: true,
          paidAmountCents: true,
          status: true,
        },
      },
    },
  });

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  return loans.map((loan) => {
    const installments = loan.installments.map((installment) => {
      const totalCents = toSafeCents(installment.totalCents, 'totalCents');
      const paidAmountCents =
        installment.paidAmountCents == null
          ? 0
          : toSafeCents(installment.paidAmountCents, 'paidAmountCents');
      const remainingCents = Decimal.max(0, subtractCents(totalCents, paidAmountCents)).toNumber();

      return {
        installmentId: installment.id,
        installmentNumber: installment.installmentNumber,
        dueDate: installment.dueDate,
        totalCents,
        paidAmountCents,
        remainingCents,
        status: installment.status,
      };
    });

    // Installments are ordered by number, so filter() preserves that order.
    const unpaid = installments.filter(
      (installment) => installment.status === 'PENDING' || installment.status === 'PARTIAL'
    );
    const overdueInstallment =
      unpaid.find((installment) => installment.dueDate < startOfToday) ?? null;
    const nextInstallment = unpaid[0] ?? null;
    const currentMonthInstallment =
      installments.find(
        (installment) => installment.dueDate >= monthStart && installment.dueDate <= monthEnd
      ) ?? null;
    const currentMonthPaid = currentMonthInstallment?.status === 'PAID';

    return {
      loanId: loan.id,
      loanName: loan.name,
      direction: loan.direction,
      currency: loan.currency,
      balanceCents: toSafeCents(loan.balanceCents, 'balanceCents'),
      expectedTransactionType: loan.direction === 'PAYABLE' ? 'LOAN_PAYMENT' : 'LOAN_RECEIPT',
      overdueInstallment,
      nextInstallment,
      currentMonthInstallment,
      currentMonthPaid,
      pendingCount: unpaid.length,
    };
  });
}

/**
 * Aggregated loans summary per currency (never mixed).
 */
export async function getLoansSummary(userId: string): Promise<LoansSummaryResponse> {
  await reconcileLoanBalance(userId);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const loans = await prisma.loan.findMany({
    where: { userId, isActive: true, status: { not: 'CANCELLED' as LoanStatus } },
    select: {
      currency: true,
      principalCents: true,
      totalInterestCents: true,
      balanceCents: true,
      direction: true,
      status: true,
      installments: {
        where: {
          isActive: true,
          status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] as LoanInstallmentStatus[] },
          dueDate: { gte: monthStart, lte: monthEnd },
        },
        select: { totalCents: true, paidAmountCents: true },
      },
    },
  });

  const principalBy: MoneyByCurrency = {};
  const interestBy: MoneyByCurrency = {};
  const receivableBy: MoneyByCurrency = {};
  const payableBy: MoneyByCurrency = {};
  const monthlyDueBy: MoneyByCurrency = {};
  const activeCountBy: Partial<Record<Currency, number>> = {};

  for (const loan of loans) {
    const currency = loan.currency;
    addToCurrencyBucket(principalBy, currency, toSafeCents(loan.principalCents, 'principalCents'));
    addToCurrencyBucket(
      interestBy,
      currency,
      toSafeCents(loan.totalInterestCents, 'totalInterestCents')
    );

    const balance = toSafeCents(loan.balanceCents, 'balanceCents');
    if (loan.direction === 'PAYABLE') {
      addToCurrencyBucket(payableBy, currency, balance);
    } else {
      addToCurrencyBucket(receivableBy, currency, balance);
    }

    if (loan.status === 'ACTIVE') {
      activeCountBy[currency] = (activeCountBy[currency] ?? 0) + 1;
    }

    for (const installment of loan.installments) {
      const totalCents = toSafeCents(installment.totalCents, 'totalCents');
      const paidAmountCents =
        installment.paidAmountCents == null
          ? 0
          : toSafeCents(installment.paidAmountCents, 'paidAmountCents');
      addToCurrencyBucket(monthlyDueBy, currency, subtractCents(totalCents, paidAmountCents));
    }
  }

  const currencies = collectCurrencies(
    principalBy,
    interestBy,
    receivableBy,
    payableBy,
    monthlyDueBy
  );

  const byCurrency: LoanSummaryPerCurrency[] = currencies.map((currency) => ({
    currency,
    totalPrincipalCents: principalBy[currency] ?? 0,
    totalInterestCents: interestBy[currency] ?? 0,
    totalReceivableCents: receivableBy[currency] ?? 0,
    totalPayableCents: payableBy[currency] ?? 0,
    monthlyDueCents: monthlyDueBy[currency] ?? 0,
    activeCount: activeCountBy[currency] ?? 0,
  }));

  log.info({ userId, byCurrency }, '[LOAN] Summary calculated per currency');

  return { byCurrency };
}

// ============================================================================
// Writes (caller-owned transactions)
// ============================================================================

export interface CreateLoanWithScheduleInput {
  name: string;
  type: LoanType;
  direction: LoanDirection;
  counterpartyContact?: string | null;
  notes?: string | null;
  principalCents: number;
  currency: Currency;
  rateType: LoanRateType;
  interestRateValue: number;
  interestMode: LoanInterestMode;
  interestAccrual: LoanInterestAccrual;
  dayCountBasis: LoanDayCountBasis;
  amortizationType: LoanAmortizationType;
  paymentFrequency: LoanPaymentFrequency;
  /** TERM: termCount is authoritative. INSTALLMENT: termCount is derived. */
  scheduleMode: LoanScheduleMode;
  termCount?: number | null;
  installmentAmountCents?: number | null;
  interestOnlyInstallments?: number;
  customTotals?: Array<number | null> | null;
  startDate: Date;
  firstPaymentDate: Date;
  color?: string | null;
  icon?: string | null;
  idempotencyKey: string;
}

/** Upper bound for a derived term count (mirrors the schema sanity bound). */
const MAX_LOAN_TERM_COUNT = 1200;

/**
 * Resolve the TOTAL number of installments from the schedule mode.
 *
 * - `TERM`        → require an explicit `termCount`.
 * - `INSTALLMENT` → derive the AMORTIZING periods from the fixed installment
 *   (`computeTermCountFromInstallment`) and add the interest-only periods, which
 *   pay interest without reducing the principal.
 *
 * @throws LoanScheduleValidationError on missing inputs or when the derived term
 * exceeds the allowed maximum.
 */
function resolveScheduleTermCount(input: CreateLoanWithScheduleInput): number {
  const interestOnly = input.interestOnlyInstallments ?? 0;

  if (input.scheduleMode === 'INSTALLMENT') {
    if (input.installmentAmountCents == null) {
      throw new LoanScheduleValidationError(
        'installmentAmountCents is required when scheduleMode is INSTALLMENT'
      );
    }
    const amortizingTermCount = computeTermCountFromInstallment({
      principalCents: input.principalCents,
      rateType: input.rateType,
      interestRateValue: input.interestRateValue,
      paymentFrequency: input.paymentFrequency,
      installmentCents: input.installmentAmountCents,
      interestAccrual: input.interestAccrual,
      dayCountBasis: input.dayCountBasis,
      interestMode: input.interestMode,
    });
    const totalTermCount = interestOnly + amortizingTermCount;
    if (totalTermCount > MAX_LOAN_TERM_COUNT) {
      throw new LoanScheduleValidationError(
        `Derived term count (${totalTermCount}) exceeds the allowed maximum (${MAX_LOAN_TERM_COUNT})`
      );
    }
    return totalTermCount;
  }

  if (input.termCount == null || input.termCount <= 0) {
    throw new LoanScheduleValidationError('termCount is required when scheduleMode is TERM');
  }
  return input.termCount;
}

/**
 * Create a loan plus its amortization schedule inside the caller transaction.
 * The loan balance starts at the principal (adjustments applied later).
 *
 * The persisted `termCount` is the RESOLVED value (for `INSTALLMENT` it is the
 * derived count). `installmentAmountCents` is persisted for traceability so the
 * fixed installment can be shown/reproduced later.
 */
export async function createLoanWithSchedule(
  tx: Prisma.TransactionClient,
  input: CreateLoanWithScheduleInput,
  userId: string,
  audit?: LoanAudit
): Promise<Loan> {
  const termCount = resolveScheduleTermCount(input);

  const schedule = buildAmortizationSchedule({
    principalCents: input.principalCents,
    rateType: input.rateType,
    interestRateValue: input.interestRateValue,
    interestMode: input.interestMode,
    interestAccrual: input.interestAccrual,
    dayCountBasis: input.dayCountBasis,
    amortizationType: input.amortizationType,
    paymentFrequency: input.paymentFrequency,
    termCount,
    installmentAmountCents: input.installmentAmountCents ?? null,
    interestOnlyInstallments: input.interestOnlyInstallments ?? 0,
    customTotals: input.customTotals ?? undefined,
    startDate: input.startDate,
    firstPaymentDate: input.firstPaymentDate,
  });

  const summary = computeLoanSummary(schedule, input.principalCents);

  // INSTALLMENT mode: a fixed installment larger than the total payable
  // (principal + interest) would be silently ignored by the engine, which caps
  // the derived term at a single installment over the real balance. Reject it
  // with a generic i18n key instead of persisting a misleading schedule.
  if (
    input.scheduleMode === 'INSTALLMENT' &&
    input.installmentAmountCents != null &&
    input.installmentAmountCents > summary.totalPayableCents
  ) {
    throw new ValidationError('validation.installmentExceedsTotal');
  }

  const loan = await tx.loan.create({
    data: {
      userId,
      name: input.name,
      type: input.type,
      direction: input.direction,
      status: 'ACTIVE',
      counterpartyContact: input.counterpartyContact ?? null,
      notes: input.notes ?? null,
      principalCents: input.principalCents,
      currency: input.currency,
      interestRateValue: new Decimal(input.interestRateValue),
      rateType: input.rateType,
      interestMode: input.interestMode,
      interestAccrual: input.interestAccrual,
      dayCountBasis: input.dayCountBasis,
      amortizationType: input.amortizationType,
      paymentFrequency: input.paymentFrequency,
      termCount,
      installmentAmountCents: input.installmentAmountCents ?? null,
      interestOnlyInstallments: input.interestOnlyInstallments ?? 0,
      totalInterestCents: summary.totalInterestCents,
      totalPayableCents: summary.totalPayableCents,
      effectiveYieldPct: new Decimal(summary.effectiveYieldPct),
      startDate: input.startDate,
      firstPaymentDate: input.firstPaymentDate,
      balanceCents: input.principalCents,
      color: input.color ?? null,
      icon: input.icon ?? null,
      idempotencyKey: input.idempotencyKey,
      createdBy: userId,
      lastModifiedBy: userId,
      ...auditFields(audit),
    },
  });

  await tx.loanInstallment.createMany({
    data: schedule.map((row) => ({
      loanId: loan.id,
      installmentNumber: row.installmentNumber,
      dueDate: row.dueDate,
      principalCents: row.principalCents,
      interestCents: row.interestCents,
      totalCents: row.totalCents,
      balanceCents: row.balanceCents,
      currency: input.currency,
      isCustomTotal: row.isCustomTotal,
      isInterestOnly: row.isInterestOnly,
      status: 'PENDING',
      source: 'SCHEDULE',
      createdBy: userId,
      lastModifiedBy: userId,
      ...auditFields(audit),
    })),
  });

  return loan;
}

/**
 * Recompute the derived totals from the active installments. Used after a
 * regeneration/adjustment changes the schedule.
 */
export async function recomputeLoanTotals(tx: Prisma.TransactionClient, loan: Loan): Promise<void> {
  const installments = await tx.loanInstallment.findMany({
    where: { loanId: loan.id, isActive: true },
    select: { interestCents: true, totalCents: true },
  });

  let totalInterestCents = 0;
  let totalPayableCents = 0;
  for (const installment of installments) {
    totalInterestCents = addCents(
      totalInterestCents,
      toSafeCents(installment.interestCents, 'interestCents')
    );
    totalPayableCents = addCents(
      totalPayableCents,
      toSafeCents(installment.totalCents, 'totalCents')
    );
  }

  const principal = toSafeCents(loan.principalCents, 'principalCents');
  const effectiveYieldPct =
    principal > 0
      ? new Decimal(totalInterestCents)
          .dividedBy(principal)
          .times(100)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN)
          .toNumber()
      : 0;

  await tx.loan.update({
    where: { id: loan.id },
    data: {
      totalInterestCents,
      totalPayableCents,
      effectiveYieldPct: new Decimal(effectiveYieldPct),
      lastModifiedBy: loan.userId,
    },
  });
}

/**
 * Soft-delete the unpaid (PENDING/OVERDUE) installments from
 * `fromInstallmentNumber` onward and regenerate them against the current
 * balance. PAID/PARTIAL/WAIVED history is never touched.
 *
 * The remaining balance is always derived from the ledger
 * (`deriveLoanLedgerBalance`), never from the possibly-stale `Loan.balanceCents`
 * cache (Rule 13). This keeps the regenerated future principal aligned with
 * `principal + Σ EXTRA_DISBURSEMENT − Σ paidPrincipal − Σ EXTRA_PAYMENT`.
 */
export async function regenerateFutureSchedule(
  tx: Prisma.TransactionClient,
  loan: Loan,
  fromInstallmentNumber: number,
  audit?: LoanAudit
): Promise<void> {
  if (fromInstallmentNumber < 1) {
    throw new RangeError('fromInstallmentNumber must be >= 1');
  }
  if (fromInstallmentNumber > loan.termCount) {
    await recomputeLoanTotals(tx, loan);
    return;
  }

  const blocking = await tx.loanInstallment.count({
    where: {
      loanId: loan.id,
      installmentNumber: { gte: fromInstallmentNumber },
      isActive: true,
      status: { in: ['PAID', 'PARTIAL', 'WAIVED'] as LoanInstallmentStatus[] },
    },
  });
  if (blocking > 0) {
    throw new LoanAdjustmentNotAllowedError();
  }

  const now = new Date();
  await tx.loanInstallment.updateMany({
    where: {
      loanId: loan.id,
      installmentNumber: { gte: fromInstallmentNumber },
      isActive: true,
      status: { in: ['PENDING', 'OVERDUE'] as LoanInstallmentStatus[] },
    },
    data: {
      isActive: false,
      deletedAt: now,
      lastModifiedBy: loan.userId,
      ...auditFields(audit),
    },
  });

  // Rule 13: the ledger is the source of truth, not the `balanceCents` cache.
  const ledgerBalance = await deriveLoanLedgerBalance(tx, loan.id);
  const remainingCount = loan.termCount - fromInstallmentNumber + 1;

  // CRITICAL — Active installments BEFORE `fromInstallmentNumber` (typically
  // PARTIAL ones) are preserved and their UNPAID principal is ALREADY included
  // in `ledgerBalance`. Rebuilding the future rows for the full derived balance
  // would count that carried principal twice: once in the still-active old row
  // and once in the regenerated future rows. Paying both then drives
  // `Loan.balanceCents` negative (and now trips the CHECK constraint).
  //
  //   basePrincipal = ledgerBalance
  //                 − Σ_{active, installmentNumber < from}
  //                     (principalCents − paidPrincipalCents)
  //
  // INVARIANT preserved by this function:
  //   Σ (principalCents − paidPrincipalCents) over ACTIVE installments
  //     === deriveLoanLedgerBalance(loanId)
  const carried = await tx.loanInstallment.findMany({
    where: {
      loanId: loan.id,
      isActive: true,
      installmentNumber: { lt: fromInstallmentNumber },
    },
    select: { principalCents: true, paidPrincipalCents: true },
  });

  let carriedUnpaidPrincipal = 0;
  for (const installment of carried) {
    carriedUnpaidPrincipal = addCents(
      carriedUnpaidPrincipal,
      subtractCents(
        toSafeCents(installment.principalCents, 'principalCents'),
        toSafeCents(installment.paidPrincipalCents, 'paidPrincipalCents')
      )
    );
  }

  // Clamp with Decimal: an over-amortized ledger (e.g. an EXTRA_PAYMENT larger
  // than the carried principal) must never produce a negative base schedule.
  const basePrincipal = Decimal.max(
    0,
    subtractCents(ledgerBalance, carriedUnpaidPrincipal)
  ).toNumber();

  const previous = await tx.loanInstallment.findFirst({
    where: { loanId: loan.id, isActive: true, installmentNumber: { lt: fromInstallmentNumber } },
    orderBy: { installmentNumber: 'desc' },
    select: { dueDate: true },
  });

  const baseStartDate = previous?.dueDate ?? loan.startDate;
  const firstPaymentDueDate = addPeriods(
    loan.firstPaymentDate,
    loan.paymentFrequency,
    fromInstallmentNumber - 1
  );

  const interestOnlyOffset = Math.max(
    0,
    loan.interestOnlyInstallments - (fromInstallmentNumber - 1)
  );

  let schedule: ScheduleRow[] = [];
  if (basePrincipal > 0 && remainingCount > 0) {
    schedule = buildAmortizationSchedule({
      principalCents: basePrincipal,
      rateType: loan.rateType,
      interestRateValue: loan.interestRateValue.toNumber(),
      interestMode: loan.interestMode,
      interestAccrual: loan.interestAccrual,
      dayCountBasis: loan.dayCountBasis,
      amortizationType: loan.amortizationType,
      paymentFrequency: loan.paymentFrequency,
      termCount: remainingCount,
      installmentAmountCents:
        loan.installmentAmountCents == null
          ? null
          : toSafeCents(loan.installmentAmountCents, 'installmentAmountCents'),
      interestOnlyInstallments: Math.min(interestOnlyOffset, remainingCount - 1),
      startDate: baseStartDate,
      firstPaymentDate: firstPaymentDueDate,
    });
  }

  for (const row of schedule) {
    const installmentNumber = fromInstallmentNumber + row.installmentNumber - 1;
    const scheduleData = {
      dueDate: row.dueDate,
      principalCents: row.principalCents,
      interestCents: row.interestCents,
      totalCents: row.totalCents,
      balanceCents: row.balanceCents,
      currency: loan.currency,
      isCustomTotal: row.isCustomTotal,
      isInterestOnly: row.isInterestOnly,
      status: 'PENDING' as LoanInstallmentStatus,
      source: 'RESCHEDULE' as const,
      isActive: true,
      deletedAt: null,
      lastModifiedBy: loan.userId,
      ...auditFields(audit),
    };

    // The (loanId, installmentNumber) unique index is unconditional, so a plain
    // INSERT would collide with the soft-deleted history row just deactivated
    // above (Rule 6 forbids physically removing it). Reuse that slot by
    // reactivating it; only create a brand-new row when no slot exists.
    const reused = await tx.loanInstallment.updateMany({
      where: { loanId: loan.id, installmentNumber, isActive: false },
      data: scheduleData,
    });

    if (reused.count === 0) {
      await tx.loanInstallment.create({
        data: {
          loanId: loan.id,
          installmentNumber,
          createdBy: loan.userId,
          ...scheduleData,
        },
      });
    }
  }

  await recomputeLoanTotals(tx, loan);
}

/** First active unpaid installment (PENDING/OVERDUE) of a loan, or null. */
async function findFirstUnpaidInstallmentNumber(
  tx: Prisma.TransactionClient,
  loanId: string
): Promise<number | null> {
  const next = await tx.loanInstallment.findFirst({
    where: {
      loanId,
      isActive: true,
      status: { in: ['PENDING', 'OVERDUE'] as LoanInstallmentStatus[] },
    },
    orderBy: { installmentNumber: 'asc' },
    select: { installmentNumber: true },
  });
  return next?.installmentNumber ?? null;
}

/**
 * Rebuild the unpaid schedule after an EXTRA_PAYMENT so the planned future
 * principal matches the derived remaining balance:
 *
 *   Σ principal planificado (futuro) + Σ paidPrincipal = saldo pendiente
 *
 * When the derived balance reaches zero the remaining unpaid installments are
 * soft-deleted (payment history is never physically removed — Rule 6) and the
 * loan is marked COMPLETED ONLY IF no active installment still owes principal or
 * interest; otherwise it stays ACTIVE so a pending PARTIAL can still be settled.
 */
export async function regenerateScheduleAfterExtraPayment(
  tx: Prisma.TransactionClient,
  loan: Loan,
  remainingBalanceCents: number,
  audit?: LoanAudit
): Promise<void> {
  if (remainingBalanceCents <= 0) {
    const now = new Date();
    await tx.loanInstallment.updateMany({
      where: {
        loanId: loan.id,
        isActive: true,
        status: { in: ['PENDING', 'OVERDUE'] as LoanInstallmentStatus[] },
      },
      data: {
        isActive: false,
        deletedAt: now,
        lastModifiedBy: loan.userId,
        ...auditFields(audit),
      },
    });

    // Consistency — COMPLETED requires the derived balance to be zero AND no
    // active installment to still owe principal OR interest. A PARTIAL
    // installment with outstanding interest keeps the loan ACTIVE so it can
    // still be settled (same criterion as `reconcileSingleLoan`).
    const stillUnpaid = await hasUnpaidActiveInstallments(tx, loan.id);
    const nextStatus: LoanStatus = stillUnpaid ? loan.status : 'COMPLETED';

    await tx.loan.update({
      where: { id: loan.id },
      data: {
        balanceCents: 0,
        status: nextStatus,
        lastModifiedBy: loan.userId,
        ...auditFields(audit),
      },
    });

    await recomputeLoanTotals(tx, loan);
    return;
  }

  const from = await findFirstUnpaidInstallmentNumber(tx, loan.id);
  if (from == null) {
    await recomputeLoanTotals(tx, loan);
    return;
  }

  const refreshed = await tx.loan.findUniqueOrThrow({ where: { id: loan.id } });
  await regenerateFutureSchedule(tx, refreshed, from, audit);
}

/**
 * Mark a loan COMPLETED when its balance is zero and every active installment
 * is settled (no pending principal nor interest). Audit metadata is propagated
 * uniformly (Rule 14).
 */
async function maybeCompleteLoan(
  tx: Prisma.TransactionClient,
  loanId: string,
  userId: string,
  audit?: LoanAudit
): Promise<void> {
  const loan = await tx.loan.findUnique({
    where: { id: loanId },
    select: { balanceCents: true, status: true },
  });
  if (!loan || loan.balanceCents > BigInt(0) || loan.status !== 'ACTIVE') return;

  if (await hasUnpaidActiveInstallments(tx, loanId)) return;

  await tx.loan.update({
    where: { id: loanId },
    data: {
      status: 'COMPLETED',
      lastModifiedBy: userId,
      ...auditFields(audit),
    },
  });
}

export interface ApplyLoanInstallmentPaymentParams {
  installment: LoanInstallment;
  loan: Loan;
  amountCents: number;
  paidAt: Date;
  notes?: string | null;
  idempotencyKey: string;
  transactionId?: string | null;
  userId: string;
  audit?: LoanAudit;
}

export interface ApplyLoanInstallmentPaymentResult {
  payment: LoanInstallmentPayment;
  wasIdempotent: boolean;
}

/**
 * Core reusable payment/receipt kernel. Splits the amount interest-first, then
 * principal, records the bridge payment and keeps the loan cache in sync.
 * Idempotent via the unique `LoanInstallmentPayment.idempotencyKey`.
 */
export async function applyLoanInstallmentPayment(
  tx: Prisma.TransactionClient,
  params: ApplyLoanInstallmentPaymentParams
): Promise<ApplyLoanInstallmentPaymentResult> {
  const existing = await tx.loanInstallmentPayment.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });
  if (existing) {
    if (existing.installmentId !== params.installment.id) {
      throw new IdempotencyError(params.idempotencyKey);
    }
    return { payment: existing, wasIdempotent: true };
  }

  const { installment, loan } = params;
  const totalCents = toSafeCents(installment.totalCents, 'totalCents');
  const paidAmountCents =
    installment.paidAmountCents == null
      ? 0
      : toSafeCents(installment.paidAmountCents, 'paidAmountCents');
  const paidInterestCents = toSafeCents(installment.paidInterestCents, 'paidInterestCents');
  const remainingCents = subtractCents(totalCents, paidAmountCents);

  if (
    !Number.isInteger(params.amountCents) ||
    params.amountCents <= 0 ||
    params.amountCents > remainingCents
  ) {
    throw new PaymentAmountInvalidError();
  }

  const interestDueCents = subtractCents(
    toSafeCents(installment.interestCents, 'interestCents'),
    paidInterestCents
  );
  const interestPortion = Math.min(params.amountCents, Math.max(0, interestDueCents));
  const principalPortion = subtractCents(params.amountCents, interestPortion);

  const newPaidAmountCents = addCents(paidAmountCents, params.amountCents);
  const newPaidPrincipalCents = addCents(
    toSafeCents(installment.paidPrincipalCents, 'paidPrincipalCents'),
    principalPortion
  );
  const newPaidInterestCents = addCents(paidInterestCents, interestPortion);
  const newStatus: LoanInstallmentStatus = newPaidAmountCents >= totalCents ? 'PAID' : 'PARTIAL';

  // Optimistic predicate on the exact values read inside the caller's
  // `SELECT ... FOR UPDATE` lock: a concurrent payment against the SAME
  // installment (potentially from a different account) can never overwrite this
  // read-modify-write (MAJOR 4 — lost update).
  const updateResult = await tx.loanInstallment.updateMany({
    where: {
      id: installment.id,
      isActive: true,
      status: installment.status,
      paidAmountCents: installment.paidAmountCents,
      paidPrincipalCents: installment.paidPrincipalCents,
      paidInterestCents: installment.paidInterestCents,
    },
    data: {
      paidAmountCents: newPaidAmountCents,
      paidPrincipalCents: newPaidPrincipalCents,
      paidInterestCents: newPaidInterestCents,
      paidDate: newStatus === 'PAID' ? params.paidAt : installment.paidDate,
      status: newStatus,
      lastModifiedBy: params.userId,
      ...auditFields(params.audit),
    },
  });

  if (updateResult.count !== 1) {
    throw new LoanInstallmentAlreadyPaidError();
  }

  const payment = await tx.loanInstallmentPayment.create({
    data: {
      installmentId: installment.id,
      transactionId: params.transactionId ?? null,
      amountCents: params.amountCents,
      principalCents: principalPortion,
      interestCents: interestPortion,
      currency: loan.currency,
      paidAt: params.paidAt,
      notes: params.notes ?? null,
      idempotencyKey: params.idempotencyKey,
      createdBy: params.userId,
      lastModifiedBy: params.userId,
      ...auditFields(params.audit),
    },
  });

  // MAJOR — write the loan balance as an ABSOLUTE value clamped at zero in a
  // SINGLE statement. A DB-level `decrement` would momentarily produce a
  // negative value (or fail outright on the `Loan_balanceCents_nonnegative`
  // CHECK, code 23514) before any JS clamp could run. The optimistic predicate
  // on the balance read guarantees no concurrent cache write is overwritten.
  const freshLoan = await tx.loan.findUniqueOrThrow({
    where: { id: loan.id },
    select: { balanceCents: true },
  });
  const currentBalanceCents = toSafeCents(freshLoan.balanceCents, 'balanceCents');
  const nextBalanceCents = Decimal.max(
    0,
    subtractCents(currentBalanceCents, principalPortion)
  ).toNumber();

  const balanceUpdate = await tx.loan.updateMany({
    where: { id: loan.id, balanceCents: freshLoan.balanceCents },
    data: {
      balanceCents: nextBalanceCents,
      lastModifiedBy: params.userId,
      ...auditFields(params.audit),
    },
  });

  if (balanceUpdate.count !== 1) {
    throw new InternalServerError('Loan balance changed concurrently');
  }

  await maybeCompleteLoan(tx, loan.id, params.userId, params.audit);

  return { payment, wasIdempotent: false };
}
