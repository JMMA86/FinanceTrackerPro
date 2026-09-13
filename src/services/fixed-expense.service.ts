/**
 * Fixed Expenses Service (Business Logic)
 * Materialization of recurring payments, rescheduling, per-currency summaries
 * and BigInt serialization.
 *
 * RULE 1: All financial calculations use Decimal.js (via @/lib/money helpers)
 * RULE 2: Money stored as integer cents (BigInt) — serialized to number on read
 * RULE 13: payments are materialized from the template; the transaction ledger
 *          remains the source of truth for account balances.
 *
 * Materialization (Decision D1): a rolling 12-month horizon starting at the
 * first day of the current month, plus a 3-month overdue lookback, bounded by
 * the template endDate. Generation is idempotent via the
 * UNIQUE(fixedExpenseId, dueDate) constraint.
 */

import 'server-only';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { addCents } from '@/lib/money';
import {
  computeDueDates as computeRecurrenceDueDates,
  endOfDay,
  getMaterializationHorizon,
  startOfDay,
  type RecurrenceExpense,
} from '@/lib/fixed-expense-recurrence';
import type { Currency, FixedExpense, Prisma } from '@prisma/client';
import type {
  FixedExpenseSerialized,
  FixedExpensePaymentSerialized,
  FixedExpensesSummaryPerCurrency,
  FixedExpensesSummaryResponse,
  FixedExpenseWithPayments,
} from '@/types/fixed-expense';

// Keep the public surface stable for existing consumers/tests.
export { MAX_PAYMENTS_PER_TEMPLATE } from '@/lib/fixed-expense-recurrence';

// ============================================================================
// Due date computation (delegates to the shared pure recurrence module)
// ============================================================================

/**
 * Service-side `computeDueDates`. Same signature as before, but routes the
 * defensive cap warning to the structured logger. The pure implementation lives
 * in `@/lib/fixed-expense-recurrence` so the seed scripts share the exact same
 * series and can never drift.
 */
export function computeDueDates(expense: RecurrenceExpense, from: Date, to: Date): Date[] {
  return computeRecurrenceDueDates(expense, from, to, (event) => {
    log.warn(event, '[FIXED_EXPENSE] Due-date generation truncated at cap');
  });
}

// ============================================================================
// Materialization
// ============================================================================

type GeneratableExpense = Pick<
  FixedExpense,
  | 'id'
  | 'userId'
  | 'amountCents'
  | 'currency'
  | 'frequency'
  | 'dayOfPayment'
  | 'startDate'
  | 'endDate'
>;

/**
 * Request metadata written on materialized/reactivated payment rows (Rule 14).
 * Reads (system side-effects) pass `undefined` so no fake IP is ever persisted.
 */
export interface FixedExpenseAudit {
  ipAddress?: string | null;
  userAgent?: string | null;
}

function horizonBounds(now: Date): { from: Date; to: Date } {
  return getMaterializationHorizon(now);
}

/**
 * Idempotently materialize the payments of a template over the rolling horizon.
 * Existing active payments are never touched (paid history is preserved).
 *
 * @param options.reactivate when true, soft-deleted unpaid payments that fall on
 *   a valid due date are reactivated with refreshed amount/currency. Used by the
 *   reschedule flow (frequency/start/end/day changed); reads pass false so an
 *   intentionally removed occurrence is never resurrected.
 * @param audit request metadata persisted on created/reactivated rows (Rule 14).
 *   Omitted on the read-side materialization (system actor, no fabricated IP).
 * @returns number of payment rows created or reactivated.
 */
export async function generatePayments(
  tx: Prisma.TransactionClient,
  expense: GeneratableExpense,
  now: Date = new Date(),
  options?: { reactivate?: boolean },
  audit?: FixedExpenseAudit
): Promise<number> {
  const { from, to } = horizonBounds(now);
  const dueDates = computeDueDates(expense, from, to);
  if (dueDates.length === 0) return 0;

  const rangeStart = dueDates[0];
  const rangeEnd = dueDates.at(-1) ?? dueDates[0];

  const existing = await tx.fixedExpensePayment.findMany({
    where: {
      fixedExpenseId: expense.id,
      dueDate: { gte: rangeStart, lte: rangeEnd },
    },
    select: { dueDate: true, isActive: true, paidDate: true },
  });

  const activeKeys = new Set(
    existing.filter((p) => p.isActive).map((p) => startOfDay(p.dueDate).getTime())
  );
  const reactivatableKeys = new Set(
    existing
      .filter((p) => !p.isActive && p.paidDate == null)
      .map((p) => startOfDay(p.dueDate).getTime())
  );

  let affected = 0;
  for (const dueDate of dueDates) {
    const key = dueDate.getTime();
    if (activeKeys.has(key)) continue;
    if (reactivatableKeys.has(key) && !options?.reactivate) continue;

    await tx.fixedExpensePayment.upsert({
      where: { fixedExpenseId_dueDate: { fixedExpenseId: expense.id, dueDate } },
      update: options?.reactivate
        ? {
            isActive: true,
            deletedAt: null,
            expectedAmountCents: expense.amountCents,
            currency: expense.currency,
            lastModifiedBy: expense.userId,
            ...(audit
              ? { ipAddress: audit.ipAddress ?? null, userAgent: audit.userAgent ?? null }
              : {}),
          }
        : {},
      create: {
        fixedExpenseId: expense.id,
        dueDate,
        expectedAmountCents: expense.amountCents,
        currency: expense.currency,
        createdBy: expense.userId,
        lastModifiedBy: expense.userId,
        ...(audit
          ? { ipAddress: audit.ipAddress ?? null, userAgent: audit.userAgent ?? null }
          : {}),
      },
    });
    affected++;
  }
  return affected;
}

/**
 * Recompute the future schedule of a template after a scheduling change:
 * future unpaid payments no longer part of the schedule are soft-deleted, and
 * the new occurrences are materialized (reactivating soft-deleted matches).
 */
export async function reschedulePayments(
  tx: Prisma.TransactionClient,
  expense: GeneratableExpense,
  now: Date = new Date(),
  audit?: FixedExpenseAudit
): Promise<void> {
  const { from, to } = horizonBounds(now);
  const validKeys = new Set(computeDueDates(expense, from, to).map((d) => d.getTime()));

  const futurePending = await tx.fixedExpensePayment.findMany({
    where: {
      fixedExpenseId: expense.id,
      isActive: true,
      paidDate: null,
      dueDate: { gte: startOfDay(now) },
    },
    select: { id: true, dueDate: true },
  });

  const obsoleteIds = futurePending
    .filter((payment) => !validKeys.has(startOfDay(payment.dueDate).getTime()))
    .map((payment) => payment.id);

  if (obsoleteIds.length > 0) {
    // Re-assert `isActive: true, paidDate: null` in the WHERE so a payment that
    // was concurrently paid (or already deactivated) is never soft-deleted.
    await tx.fixedExpensePayment.updateMany({
      where: { id: { in: obsoleteIds }, isActive: true, paidDate: null },
      data: {
        isActive: false,
        deletedAt: now,
        lastModifiedBy: expense.userId,
        ...(audit
          ? { ipAddress: audit.ipAddress ?? null, userAgent: audit.userAgent ?? null }
          : {}),
      },
    });
  }

  await generatePayments(tx, expense, now, { reactivate: true }, audit);
}

/**
 * Materialize upcoming (and recently overdue) payments for every active
 * template of a user. Best-effort: a generation failure for one template never
 * breaks the read path.
 */
export async function ensureUpcomingPayments(
  userId: string,
  now: Date = new Date()
): Promise<void> {
  const expenses = await prisma.fixedExpense.findMany({
    where: { userId, isActive: true },
    select: {
      id: true,
      userId: true,
      amountCents: true,
      currency: true,
      frequency: true,
      dayOfPayment: true,
      startDate: true,
      endDate: true,
    },
  });

  for (const expense of expenses) {
    try {
      await prisma.$transaction((tx) => generatePayments(tx, expense, now));
    } catch (error) {
      log.error(
        { error, fixedExpenseId: expense.id, userId },
        '[FIXED_EXPENSE] Payment materialization failed'
      );
    }
  }
}

// ============================================================================
// Serialization (BigInt -> number, RSC-safe)
// ============================================================================

const MAX_SAFE_CENTS_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_CENTS_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

/**
 * Convert a monetary BIGINT to a JS number, failing loudly if the value would
 * lose precision. Values are validation-bounded by MAX_SAFE_CENTS, so this is a
 * defensive guard against corrupted/legacy rows rather than an expected path.
 */
function toSafeCents(value: bigint, field: string): number {
  if (value > MAX_SAFE_CENTS_BIGINT || value < MIN_SAFE_CENTS_BIGINT) {
    log.error(
      { field, value: value.toString() },
      '[FIXED_EXPENSE] Monetary BIGINT exceeds Number.MAX_SAFE_INTEGER'
    );
    throw new RangeError(`Monetary value out of safe integer range for ${field}`);
  }
  return Number(value);
}

export function serializeFixedExpense<T extends { amountCents: bigint }>(
  expense: T
): Omit<T, 'amountCents'> & { amountCents: number } {
  return { ...expense, amountCents: toSafeCents(expense.amountCents, 'amountCents') };
}

export function serializePayment<
  T extends { expectedAmountCents: bigint; paidAmountCents: bigint | null },
>(
  payment: T
): Omit<T, 'expectedAmountCents' | 'paidAmountCents'> & {
  expectedAmountCents: number;
  paidAmountCents: number | null;
} {
  return {
    ...payment,
    expectedAmountCents: toSafeCents(payment.expectedAmountCents, 'expectedAmountCents'),
    paidAmountCents:
      payment.paidAmountCents == null
        ? null
        : toSafeCents(payment.paidAmountCents, 'paidAmountCents'),
  };
}

// ============================================================================
// Reads
// ============================================================================

export interface FixedExpensePaymentsRange {
  from?: Date;
  to?: Date;
}

/**
 * Active (or optionally all) templates of a user with their materialized
 * payments, optionally range-filtered by dueDate.
 */
export async function getFixedExpensesWithPayments(
  userId: string,
  range?: FixedExpensePaymentsRange,
  options?: { includeInactive?: boolean }
): Promise<FixedExpenseWithPayments[]> {
  await ensureUpcomingPayments(userId);

  const paymentWhere: Prisma.FixedExpensePaymentWhereInput = { isActive: true };
  if (range?.from || range?.to) {
    paymentWhere.dueDate = {
      ...(range.from ? { gte: startOfDay(range.from) } : {}),
      ...(range.to ? { lte: endOfDay(range.to) } : {}),
    };
  }

  const expenses = await prisma.fixedExpense.findMany({
    where: {
      userId,
      ...(options?.includeInactive ? {} : { isActive: true }),
    },
    include: {
      payments: {
        where: paymentWhere,
        orderBy: { dueDate: 'asc' },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
  });

  return expenses.map((expense) => ({
    ...serializeFixedExpense(expense),
    payments: expense.payments.map((payment) => serializePayment(payment)),
  }));
}

/**
 * A single template with its materialized payments (optionally range-filtered).
 * Returns null when the template does not exist, is soft-deleted or belongs to
 * another user (the caller maps null to a generic NotFound to avoid leaking
 * ownership).
 */
export async function getFixedExpensePaymentsForUser(
  userId: string,
  fixedExpenseId: string,
  range?: FixedExpensePaymentsRange
): Promise<{ expense: FixedExpenseSerialized; payments: FixedExpensePaymentSerialized[] } | null> {
  const expense = await prisma.fixedExpense.findFirst({
    where: { id: fixedExpenseId, userId, isActive: true },
    include: {
      payments: {
        where: {
          isActive: true,
          ...(range?.from || range?.to
            ? {
                dueDate: {
                  ...(range.from ? { gte: startOfDay(range.from) } : {}),
                  ...(range.to ? { lte: endOfDay(range.to) } : {}),
                },
              }
            : {}),
        },
        orderBy: { dueDate: 'asc' },
      },
    },
  });

  if (!expense) return null;

  return {
    expense: serializeFixedExpense(expense),
    payments: expense.payments.map((payment) => serializePayment(payment)),
  };
}

// ============================================================================
// Summary (per currency — NEVER mixed)
// ============================================================================

type MoneyByCurrency = Partial<Record<Currency, number>>;

/** Canonical deterministic currency order (matches the Prisma enum declaration). */
const CURRENCY_ORDER: Record<Currency, number> = { COP: 0, USD: 1, EUR: 2 };

function addToCurrencyBucket(
  buckets: MoneyByCurrency,
  currency: Currency,
  amountCents: number
): void {
  buckets[currency] = addCents(buckets[currency] ?? 0, amountCents);
}

function collectCurrencies(...maps: Array<Partial<Record<Currency, unknown>>>): Currency[] {
  const keys = new Set<Currency>();
  for (const map of maps) {
    for (const key of Object.keys(map) as Currency[]) {
      keys.add(key);
    }
  }
  return [...keys].sort((a, b) => CURRENCY_ORDER[a] - CURRENCY_ORDER[b]);
}

interface SummaryPaymentRow {
  dueDate: Date;
  paidDate: Date | null;
  expectedAmountCents: bigint;
  paidAmountCents: bigint | null;
  currency: Currency;
}

interface SummaryBuckets {
  committed: MoneyByCurrency;
  paid: MoneyByCurrency;
  pending: MoneyByCurrency;
  overdue: MoneyByCurrency;
}

function isPaidInMonth(payment: SummaryPaymentRow, monthStart: Date, monthEnd: Date): boolean {
  if (payment.paidDate == null) return false;
  return payment.paidDate >= monthStart && payment.paidDate <= monthEnd;
}

function resolvePaymentPaidAmount(payment: SummaryPaymentRow): number {
  if (payment.paidAmountCents == null) {
    return toSafeCents(payment.expectedAmountCents, 'expectedAmountCents');
  }
  return toSafeCents(payment.paidAmountCents, 'paidAmountCents');
}

function accumulatePaymentIntoBuckets(
  buckets: SummaryBuckets,
  payment: SummaryPaymentRow,
  monthStart: Date,
  monthEnd: Date,
  now: Date
): void {
  // Snapshot currency (FIX-1): do NOT use the template's current currency.
  const currency = payment.currency;
  const dueInMonth = payment.dueDate >= monthStart && payment.dueDate <= monthEnd;

  if (dueInMonth) {
    const expected = toSafeCents(payment.expectedAmountCents, 'expectedAmountCents');
    addToCurrencyBucket(buckets.committed, currency, expected);

    if (payment.paidDate == null) {
      addToCurrencyBucket(buckets.pending, currency, expected);
      if (payment.dueDate < now) {
        addToCurrencyBucket(buckets.overdue, currency, expected);
      }
    }
  }

  if (isPaidInMonth(payment, monthStart, monthEnd)) {
    addToCurrencyBucket(buckets.paid, currency, resolvePaymentPaidAmount(payment));
  }
}

function accumulateSummaryBuckets(
  payments: ReadonlyArray<SummaryPaymentRow>,
  monthStart: Date,
  monthEnd: Date,
  now: Date
): SummaryBuckets {
  const buckets: SummaryBuckets = { committed: {}, paid: {}, pending: {}, overdue: {} };
  for (const payment of payments) {
    accumulatePaymentIntoBuckets(buckets, payment, monthStart, monthEnd, now);
  }
  return buckets;
}

function countActiveTemplatesByCurrency(
  templates: ReadonlyArray<{ currency: Currency }>
): Partial<Record<Currency, number>> {
  const counts: Partial<Record<Currency, number>> = {};
  for (const template of templates) {
    counts[template.currency] = (counts[template.currency] ?? 0) + 1;
  }
  return counts;
}

/**
 * Aggregated fixed expenses summary for a month, grouped by currency.
 *
 * - totalCommittedCents: expected amounts due in the month (paid or not).
 * - totalPaidCents: amounts paid during the month (paidAmountCents ?? expected).
 * - totalPendingCents: unpaid payments due in the month (includes overdue ones).
 * - totalOverdueCents: unpaid payments due in the month whose dueDate < now.
 * - activeCount: number of active templates in that currency.
 */
export async function getFixedExpensesSummary(
  userId: string,
  month?: number,
  year?: number
): Promise<FixedExpensesSummaryResponse> {
  const now = new Date();
  const targetMonth = month ?? now.getMonth() + 1;
  const targetYear = year ?? now.getFullYear();
  const monthStart = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

  const [payments, templates] = await Promise.all([
    prisma.fixedExpensePayment.findMany({
      where: {
        fixedExpense: { userId, isActive: true },
        isActive: true,
        OR: [
          { dueDate: { gte: monthStart, lte: monthEnd } },
          { paidDate: { gte: monthStart, lte: monthEnd } },
        ],
      },
      select: {
        dueDate: true,
        paidDate: true,
        expectedAmountCents: true,
        paidAmountCents: true,
        // Immutable snapshot of the currency at materialization time — NEVER the
        // template's current currency, so a template currency change cannot
        // re-classify historical payments (FIX-1).
        currency: true,
      },
    }),
    prisma.fixedExpense.findMany({
      where: { userId, isActive: true },
      select: { currency: true },
    }),
  ]);

  const { committed, paid, pending, overdue } = accumulateSummaryBuckets(
    payments,
    monthStart,
    monthEnd,
    now
  );
  const activeByCurrency = countActiveTemplatesByCurrency(templates);

  const currencies = collectCurrencies(committed, paid, pending, overdue, activeByCurrency);

  const byCurrency: FixedExpensesSummaryPerCurrency[] = currencies.map((currency) => ({
    currency,
    totalCommittedCents: committed[currency] ?? 0,
    totalPaidCents: paid[currency] ?? 0,
    totalPendingCents: pending[currency] ?? 0,
    totalOverdueCents: overdue[currency] ?? 0,
    activeCount: activeByCurrency[currency] ?? 0,
  }));

  log.info(
    { userId, month: targetMonth, year: targetYear, byCurrency },
    '[FIXED_EXPENSE] Summary calculated per currency'
  );

  return { byCurrency };
}
