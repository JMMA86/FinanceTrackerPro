/**
 * End-of-period projection service (server-only).
 *
 * GATHERS the raw inputs (ledger cash, salary/bonus schedules, pending fixed
 * payments, remaining PAYABLE + RECEIVABLE loan installments, variable-spend
 * estimate) and delegates ALL arithmetic and recurrence expansion to the pure
 * engine in `@/lib/projection`.
 *
 * Financial rules:
 * - Rule 1: every monetary operation uses the Decimal.js helpers (direct
 *   `Decimal` for ratios like the loan principal/interest split).
 * - Rule 2/4: amounts are integer cents; `currency` travels with every amount.
 * - Rule 9: foreign-currency amounts are converted to COP with an EXPLICIT,
 *   traceable rate (live → stored fallback → unavailable). Unconvertible amounts
 *   are EXCLUDED and flagged — a rate is never invented.
 * - Rule 13: current cash is derived from the transaction ledger
 *   (`groupBy` over active transactions), NEVER from `Account.balanceCents`.
 *
 * The projection is COP-only by product decision: the scalar projection and the
 * savings target are COP, and USD/EUR amounts are converted with the same
 * "live + plausible stored fallback" pattern the dashboard uses.
 */

import 'server-only';

import { Decimal } from 'decimal.js';
import {
  differenceInCalendarDays,
  endOfMonth,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfYear,
  subMonths,
} from 'date-fns';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { addCents, bigintToNumber, multiplyCents } from '@/lib/money';
import { getExchangeRate } from '@/services/exchange-rate.service';
import {
  estimateMonthlyVariableCents,
  expandBonusOccurrences,
  expandIncomeOccurrences,
  projectPeriod,
  remainingMonthFraction,
  remainingMonthsInYear,
  VARIABLE_AVERAGE_WINDOW_MONTHS,
  type BonusScheduleConfig,
  type IncomeOccurrence,
  type IncomeScheduleConfig,
  type ProjectionFixedItem,
  type ProjectionIncomeItem,
  type ProjectionLoanItem,
  type ProjectionPeriodInput,
  type ProjectionRates,
} from '@/lib/projection';
import type { Currency, LoanDirection } from '@prisma/client';
import type {
  DashboardProjection,
  ExchangeRateSource,
  ExchangeRateUsed,
  ProjectionSalaryOccurrence,
} from '@/types/dashboard';

type MoneyByCurrency = Partial<Record<Currency, number>>;

// ============================================================================
// FX resolution (COP per 1 foreign unit) — same pattern as the dashboard
// ============================================================================

/**
 * Plausible "COP per 1 USD/EUR" band for a rate. Supported pairs live in the
 * thousands; the band rejects zero, NaN, Infinity and inverted/absurd values
 * (e.g. the reciprocal ~0.00025) without discarding a real rate.
 */
const COP_PER_FOREIGN_BOUNDS: Partial<Record<Currency, { min: number; max: number }>> = {
  USD: { min: 1_000, max: 10_000 },
  EUR: { min: 1_000, max: 10_000 },
};

function isPlausibleCopPerUnit(currency: Currency, value: number | null | undefined): boolean {
  if (value == null || !Number.isFinite(value)) return false;
  if (currency === 'COP') return value === 1;
  const bounds = COP_PER_FOREIGN_BOUNDS[currency];
  if (!bounds) return false;
  return value >= bounds.min && value <= bounds.max;
}

/**
 * Last stored `exchangeRate` per foreign currency, restricted to
 * investment-linked transfers whose convention is KNOWN ("COP per 1 foreign
 * unit", validated at deposit/withdraw time). Rows arrive newest-first: the first
 * in-band value per currency wins, so an out-of-band/inverted row is rejected
 * instead of trusted.
 */
async function loadStoredCopPerForeign(userId: string): Promise<MoneyByCurrency> {
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      isActive: true,
      exchangeRate: { not: null },
      originalCurrency: 'COP',
      currency: { in: ['USD', 'EUR'] },
      type: { in: ['TRANSFER_IN', 'TRANSFER_OUT'] },
      account: { type: 'INVESTMENT' },
    },
    orderBy: { date: 'desc' },
    take: 100,
    select: { currency: true, exchangeRate: true },
  });

  const rates: MoneyByCurrency = {};
  for (const row of rows) {
    if (row.exchangeRate == null) continue;
    if (rates[row.currency] !== undefined) continue;
    const rate = Number(row.exchangeRate);
    if (isPlausibleCopPerUnit(row.currency, rate)) {
      rates[row.currency] = rate;
    }
  }
  return rates;
}

/**
 * Resolve "COP cents per 1 unit" for each supported foreign currency:
 * LIVE `getExchangeRate('COP', currency)` (its reciprocal) → stored fallback →
 * unavailable. Never invents a rate (Rule 9).
 */
async function resolveProjectionRates(userId: string): Promise<ProjectionRates> {
  const fallback = await loadStoredCopPerForeign(userId);
  const rates: ProjectionRates = { COP: { copPerUnit: 1, source: 'live' as ExchangeRateSource } };

  await Promise.all(
    (['USD', 'EUR'] as Currency[]).map(async (currency) => {
      const live = await getExchangeRate('COP', currency);
      if (live != null && live > 0) {
        // getExchangeRate('COP', foreign) = foreign per 1 COP, so "COP per
        // foreign" is its reciprocal (Decimal, Rule 1).
        const copPerUnit = new Decimal(1).dividedBy(live).toNumber();
        if (isPlausibleCopPerUnit(currency, copPerUnit)) {
          rates[currency] = { copPerUnit, source: 'live' };
          return;
        }
      }

      const stored = fallback[currency];
      if (stored != null && isPlausibleCopPerUnit(currency, stored)) {
        rates[currency] = { copPerUnit: stored, source: 'fallback' };
        return;
      }

      rates[currency] = { copPerUnit: 0, source: 'unavailable' };
    })
  );

  return rates;
}

// ============================================================================
// Current liquid cash (Rule 13 — ledger is the source of truth)
// ============================================================================

/**
 * A value accumulated per currency plus how many accounts contributed to each
 * bucket (used for both the liquid-cash and the investment components).
 */
interface ValueByCurrency {
  byCurrency: MoneyByCurrency;
  accountsByCurrency: MoneyByCurrency;
}

async function loadCurrentCash(userId: string): Promise<ValueByCurrency> {
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      isActive: true,
      type: { in: ['CHECKING', 'CASH', 'SAVINGS', 'POCKET'] },
    },
    select: { id: true, currency: true },
  });

  if (accounts.length === 0) {
    return { byCurrency: {}, accountsByCurrency: {} };
  }

  const grouped = await prisma.transaction.groupBy({
    by: ['accountId'],
    where: { accountId: { in: accounts.map((account) => account.id) }, isActive: true },
    _sum: { amountCents: true },
  });
  const balanceByAccount = new Map(
    grouped.map((row) => [row.accountId, bigintToNumber(row._sum.amountCents)])
  );

  const byCurrency: MoneyByCurrency = {};
  const accountsByCurrency: MoneyByCurrency = {};
  for (const account of accounts) {
    const balance = balanceByAccount.get(account.id) ?? 0;
    byCurrency[account.currency] = addCents(byCurrency[account.currency] ?? 0, balance);
    accountsByCurrency[account.currency] = (accountsByCurrency[account.currency] ?? 0) + 1;
  }

  return { byCurrency, accountsByCurrency };
}

// ============================================================================
// Investment value (ledger cash + holdings market value) — Rule 13
// ============================================================================

/**
 * Current value of the user's INVESTMENT accounts:
 *
 *   total = ledgerCash + Σ(quantity × currentPriceCents)
 *
 * - `ledgerCash` is the Σ of active `Transaction.amountCents` of the account
 *   (Rule 13 — the transaction ledger is the source of truth, NEVER the cached
 *   `Account.balanceCents`).
 * - The holdings market value is `Σ quantity × currentPriceCents` over active
 *   holdings, computed with `multiplyCents` (Decimal.js, Rule 1).
 *
 * This REPLICATES the `totalValueCents` formula of
 * `investment-performance.service.ts` (`cashBalanceCents + holdingsMarketValue`,
 * with the dashboard feeding the ledger-derived cash) WITHOUT computing its
 * per-date series. Every account total is accumulated by the ACCOUNT currency,
 * so a USD/EUR account travels with its own currency and is later converted to
 * COP by the pure engine with a traceable rate (Rule 9).
 *
 * Query cost: the account list plus TWO aggregate queries (one `groupBy` for the
 * ledger and one `findMany` for the holdings) — no per-account N+1.
 */
async function loadInvestmentValue(userId: string): Promise<ValueByCurrency> {
  const accounts = await prisma.account.findMany({
    where: { userId, isActive: true, type: 'INVESTMENT' },
    select: { id: true, currency: true },
  });

  if (accounts.length === 0) {
    return { byCurrency: {}, accountsByCurrency: {} };
  }

  const accountIds = accounts.map((account) => account.id);

  const [grouped, holdings] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['accountId'],
      where: { accountId: { in: accountIds }, isActive: true },
      _sum: { amountCents: true },
    }),
    prisma.investmentAssetHolding.findMany({
      where: { accountId: { in: accountIds }, isActive: true },
      select: { accountId: true, quantity: true, currentPriceCents: true },
    }),
  ]);

  const cashByAccount = new Map(
    grouped.map((row) => [row.accountId, bigintToNumber(row._sum.amountCents)])
  );

  const holdingsByAccount = new Map<string, number>();
  for (const holding of holdings) {
    // Decimal.js (Rule 1): quantity is fractional, price is integer cents.
    const marketValueCents = multiplyCents(
      Number(holding.currentPriceCents),
      Number(holding.quantity)
    );
    holdingsByAccount.set(
      holding.accountId,
      addCents(holdingsByAccount.get(holding.accountId) ?? 0, marketValueCents)
    );
  }

  const byCurrency: MoneyByCurrency = {};
  const accountsByCurrency: MoneyByCurrency = {};
  for (const account of accounts) {
    const ledgerCash = cashByAccount.get(account.id) ?? 0;
    const holdingsMarket = holdingsByAccount.get(account.id) ?? 0;
    const total = addCents(ledgerCash, holdingsMarket);
    byCurrency[account.currency] = addCents(byCurrency[account.currency] ?? 0, total);
    accountsByCurrency[account.currency] = (accountsByCurrency[account.currency] ?? 0) + 1;
  }

  return { byCurrency, accountsByCurrency };
}

// ============================================================================
// Pending fixed expenses
// ============================================================================

/**
 * Every UNPAID fixed-expense payment due up to `to` (the engine does the FX
 * conversion, Rule 9).
 *
 * ASYMMETRIC WINDOW (obligation side, documented): there is deliberately NO
 * lower `dueDate` bound. A payment with `paidDate: null` whose `dueDate` lies
 * BEFORE today is OVERDUE, and an overdue debt is still owed: excluding it would
 * understate the fixed outflow and overstate the projected closing balance. The
 * conservative rule is therefore "everything not settled with `dueDate <= to`",
 * which also naturally includes a payment due TODAY at 00:00 when `to` is the
 * end of the month/year.
 *
 * The dashboard's `fixedOverdueByCurrency` alert is computed by its OWN query in
 * `data.ts` and is intentionally NOT derived from this loader, so changing this
 * window never affects that route.
 */
async function loadPendingFixedPayments(userId: string, to: Date): Promise<ProjectionFixedItem[]> {
  const rows = await prisma.fixedExpensePayment.findMany({
    where: {
      fixedExpense: { userId, isActive: true },
      isActive: true,
      paidDate: null,
      // Obligation: NO `gte` bound — overdue payments remain pending (Rule 6/13).
      dueDate: { lte: to },
    },
    select: { expectedAmountCents: true, currency: true },
  });

  return rows.map((row) => ({
    amountCents: bigintToNumber(row.expectedAmountCents),
    currency: row.currency,
  }));
}

// ============================================================================
// Real salary income (RECEIVED) — matched against the expected occurrences
// ============================================================================

/**
 * REAL salary INCOME transactions of the window: active INCOME rows linked (by
 * relation) to a system `SALARY` category AND to an ACTIVE account. Returns raw
 * amounts + currencies so the pure engine performs the traceable FX conversion
 * (Rule 9).
 *
 * The `account.isActive: true` filter is required for cash coherence: an INCOME
 * booked on a soft-deleted account is NOT part of `currentCashCents` (which only
 * reads active accounts, Rule 6/13), so counting it as "received" would flag an
 * occurrence as received while the money is absent from the projection's cash
 * base.
 */
async function loadSalaryIncomeTransactions(
  userId: string,
  from: Date,
  to: Date
): Promise<ProjectionIncomeItem[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      isActive: true,
      type: 'INCOME',
      date: { gte: from, lte: to },
      category: { type: 'SALARY' },
      account: { isActive: true },
    },
    orderBy: { date: 'asc' },
    select: { id: true, amountCents: true, currency: true, date: true },
  });

  return rows.map((row) => ({
    amountCents: bigintToNumber(row.amountCents),
    currency: row.currency,
    date: row.date,
  }));
}

interface SalaryPeriodData {
  salaryOccurrences: ProjectionSalaryOccurrence[];
  salaryReceivedIncome: ProjectionIncomeItem[];
}

/**
 * Maximum |occurrence date − real transaction date| (in CALENDAR days) for a
 * real salary transaction to still be matched to an occurrence.
 */
const SALARY_MATCH_TOLERANCE_DAYS = 15;

/**
 * Match the EXPECTED salary occurrences of a window against the REAL salary
 * INCOME transactions recorded in it by NEAREST OCCURRENCE.
 *
 * Rule (documented): real transactions are processed in chronological order and,
 * for each one, the CLOSEST not-yet-received occurrence is marked `received`,
 * provided the absolute calendar-day distance is within
 * `SALARY_MATCH_TOLERANCE_DAYS` (15). An occurrence is marked AT MOST ONCE, so
 * two transactions can never consume the same occurrence and a transaction can
 * never flag two occurrences. A transaction farther than the tolerance from any
 * remaining occurrence simply marks nothing.
 *
 * Why not a fixed ±1 day window: an income registered 2+ days before/after the
 * scheduled payday (or booked under a non-SALARY category) would stay
 * `received: false` and be counted AGAIN as pending while its real amount is
 * already inside `currentCashCents` — a double count. The tolerant
 * nearest-occurrence match absorbs early/late registration while still refusing
 * a transaction too far from every occurrence.
 *
 * The engine always sums the REAL amounts (`salaryReceivedCents`), never the
 * expected ones; unmatched occurrences stay `received: false` (pending).
 */
function matchSalaryOccurrences(
  expected: readonly IncomeOccurrence[],
  received: readonly ProjectionIncomeItem[]
): SalaryPeriodData {
  const occurrences: ProjectionSalaryOccurrence[] = expected.map((occurrence) => ({
    date: occurrence.date,
    amountCents: occurrence.amountCents,
    currency: occurrence.currency,
    received: false,
  }));

  const sortedReceived = [...received].sort((a, b) => a.date.getTime() - b.date.getTime());

  for (const item of sortedReceived) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < occurrences.length; index += 1) {
      const candidate = occurrences[index];
      if (candidate.received) continue;
      const distance = Math.abs(differenceInCalendarDays(item.date, candidate.date));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    if (bestIndex >= 0 && bestDistance <= SALARY_MATCH_TOLERANCE_DAYS) {
      occurrences[bestIndex] = { ...occurrences[bestIndex], received: true };
    }
  }

  return {
    salaryOccurrences: occurrences,
    salaryReceivedIncome: [...received],
  };
}

// ============================================================================
// Remaining loan installments (principal/interest split) — PAYABLE & RECEIVABLE
// ============================================================================

type LoanInstallmentRow = {
  totalCents: bigint;
  paidAmountCents: bigint | null;
  principalCents: bigint;
  interestCents: bigint;
  paidPrincipalCents: bigint;
  paidInterestCents: bigint;
  currency: Currency;
};

/**
 * Split the REMAINING amount of an installment into principal and interest.
 *
 * `remaining = total − paidAmount`. The split is PROPORTIONAL to the scheduled
 * amounts still outstanding (`principal − paidPrincipal`, `interest −
 * paidInterest`) so a partial payment recorded without a matching split is
 * distributed correctly. Interest absorbs the rounding residual to keep
 * `principal + interest === remaining` exactly (integer cents, Rule 1).
 */
function splitRemainingLoan(row: LoanInstallmentRow): ProjectionLoanItem {
  const remaining = Decimal.max(
    0,
    new Decimal(bigintToNumber(row.totalCents)).minus(bigintToNumber(row.paidAmountCents))
  );
  if (remaining.isZero()) {
    return { currency: row.currency, remainingPrincipalCents: 0, remainingInterestCents: 0 };
  }

  const scheduledPrincipal = Decimal.max(
    0,
    new Decimal(bigintToNumber(row.principalCents)).minus(bigintToNumber(row.paidPrincipalCents))
  );
  const scheduledInterest = Decimal.max(
    0,
    new Decimal(bigintToNumber(row.interestCents)).minus(bigintToNumber(row.paidInterestCents))
  );
  const scheduledRemaining = scheduledPrincipal.plus(scheduledInterest);

  if (scheduledRemaining.isZero()) {
    // No usable schedule split: treat the whole remainder as principal.
    return {
      currency: row.currency,
      remainingPrincipalCents: remaining.toNumber(),
      remainingInterestCents: 0,
    };
  }

  const principal = Decimal.min(
    remaining,
    scheduledPrincipal
      .times(remaining)
      .dividedBy(scheduledRemaining)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
  );
  const interest = remaining.minus(principal);

  return {
    currency: row.currency,
    remainingPrincipalCents: principal.toNumber(),
    remainingInterestCents: interest.toNumber(),
  };
}

/**
 * Remaining installments of the user's ACTIVE loans for ONE direction.
 *
 * ASYMMETRIC WINDOW (documented, mirrors `loadPendingFixedPayments`):
 *
 * - PAYABLE (an OBLIGATION of the user): EVERY not-settled installment with
 *   `dueDate <= to`, with NO lower bound. `OVERDUE` (`dueDate < now`), `PENDING`
 *   and `PARTIAL` rows are all money the user still owes, so they must be
 *   subtracted; dropping the overdue ones would understate the outflow and
 *   overstate the projected closing balance (conservative rule). Note this also
 *   makes the `OVERDUE` status reachable — with a `gte: from` bound next to
 *   `dueDate` it was dead: an overdue row is by definition `< now <= from`.
 *
 * - RECEIVABLE (a COLLECTION the user will receive): ONLY installments due from
 *   `startOfDay(now)` onwards (`gte: from`) up to `to`. Product rule: a
 *   collection whose due date already passed is NOT counted as pending (the user
 *   was supposed to have collected it already; it is not a reliable future
 *   inflow), consistent with the salary rule that past paydays never count. The
 *   caller therefore passes `from = startOfDay(now)`.
 */
async function loadRemainingLoanInstallments(
  userId: string,
  from: Date,
  to: Date,
  direction: LoanDirection
): Promise<ProjectionLoanItem[]> {
  const rows = await prisma.loanInstallment.findMany({
    where: {
      loan: { userId, isActive: true, status: 'ACTIVE', direction },
      isActive: true,
      // Obligations include overdue rows (no lower bound); collections future-only.
      dueDate: direction === 'RECEIVABLE' ? { gte: from, lte: to } : { lte: to },
      status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
    },
    select: {
      totalCents: true,
      paidAmountCents: true,
      principalCents: true,
      interestCents: true,
      paidPrincipalCents: true,
      paidInterestCents: true,
      currency: true,
    },
  });

  return rows.map(splitRemainingLoan);
}

// ============================================================================
// Variable-spend estimate
// ============================================================================

interface VariableEstimate {
  byCurrency: MoneyByCurrency;
  definitionsCount: number;
}

/**
 * Monthly variable estimate:
 *   1. Σ expectedAmountCents × (expectedTimesPerMonth ?? 1) over active
 *      definitions that declare an expected amount.
 *   2. Moving average of the last `VARIABLE_AVERAGE_WINDOW_MONTHS` COMPLETE months
 *      of UNMONITORED EXPENSE rows (no `variableExpenseId`, no
 *      `fixedExpensePaymentId`, no active linked savings contribution), mirroring
 *      the dashboard's "monitored" exclusions.
 *
 * The window size, the bucket count, the offset bound and the divisor all derive
 * from the SINGLE `VARIABLE_AVERAGE_WINDOW_MONTHS` constant imported from the
 * pure engine, so the service and the documented average can never drift.
 */
async function loadVariableEstimate(userId: string, now: Date): Promise<VariableEstimate> {
  const windowStart = startOfMonth(subMonths(now, VARIABLE_AVERAGE_WINDOW_MONTHS));
  const windowEnd = endOfMonth(subMonths(now, 1));

  const [definitions, rows] = await Promise.all([
    prisma.variableExpense.findMany({
      where: { userId, isActive: true, expectedAmountCents: { not: null } },
      select: { expectedAmountCents: true, expectedTimesPerMonth: true, currency: true },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        isActive: true,
        type: 'EXPENSE',
        variableExpenseId: null,
        fixedExpensePaymentId: null,
        savingsContributions: { none: { isActive: true } },
        date: { gte: windowStart, lte: windowEnd },
      },
      select: { amountCents: true, currency: true, date: true },
    }),
  ]);

  const expectedByCurrency: MoneyByCurrency = {};
  for (const definition of definitions) {
    const monthly = new Decimal(bigintToNumber(definition.expectedAmountCents))
      .times(definition.expectedTimesPerMonth ?? 1)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
      .toNumber();
    expectedByCurrency[definition.currency] = addCents(
      expectedByCurrency[definition.currency] ?? 0,
      monthly
    );
  }

  // One bucket per month of the configured window, chronological.
  const monthly: MoneyByCurrency[] = Array.from(
    { length: VARIABLE_AVERAGE_WINDOW_MONTHS },
    () => ({})
  );
  for (const row of rows) {
    const offset =
      (row.date.getFullYear() - windowStart.getFullYear()) * 12 +
      (row.date.getMonth() - windowStart.getMonth());
    if (offset < 0 || offset > VARIABLE_AVERAGE_WINDOW_MONTHS - 1) continue;
    // EXPENSE amounts are stored negative: magnitude via Decimal abs (Rule 1).
    const magnitude = new Decimal(bigintToNumber(row.amountCents)).abs().toNumber();
    monthly[offset][row.currency] = addCents(monthly[offset][row.currency] ?? 0, magnitude);
  }

  return {
    byCurrency: estimateMonthlyVariableCents(expectedByCurrency, monthly),
    definitionsCount: definitions.length,
  };
}

// ============================================================================
// Public read
// ============================================================================

/** Merge two per-currency FX trackers (month + year) without losing context. */
function mergeRatesUsed(
  a: Partial<Record<Currency, ExchangeRateUsed>>,
  b: Partial<Record<Currency, ExchangeRateUsed>>
): Partial<Record<Currency, ExchangeRateUsed>> {
  return { ...a, ...b };
}

/**
 * Build the month + year end-of-period projection for a user in COP.
 *
 * This is a plain server-only read (NOT a Server Action): it takes an explicit
 * `userId` and must never be exposed as a client-invocable RPC.
 */
export async function getNetProjection(
  userId: string,
  now: Date = new Date()
): Promise<DashboardProjection> {
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const yearStart = startOfYear(now);
  const yearEnd = endOfYear(now);
  // Start of TODAY: the lower bound for FUTURE-only windows (salary/bonus
  // occurrences and RECEIVABLE collections). OBLIGATIONS (fixed payments and
  // PAYABLE installments) deliberately ignore this bound and include overdue
  // rows — see `loadPendingFixedPayments` / `loadRemainingLoanInstallments`.
  const windowStart = startOfDay(now);

  const [
    salaryConfig,
    projectionSettings,
    rates,
    cash,
    investment,
    variable,
    fixedMonth,
    fixedYear,
    loansPayableMonth,
    loansPayableYear,
    loansReceivableMonth,
    loansReceivableYear,
    salaryIncomeMonth,
    salaryIncomeYear,
  ] = await Promise.all([
    prisma.salaryConfiguration.findUnique({
      where: { userId },
      include: { bonuses: { where: { isActive: true } } },
    }),
    prisma.projectionSettings.findUnique({ where: { userId } }),
    resolveProjectionRates(userId),
    loadCurrentCash(userId),
    loadInvestmentValue(userId),
    loadVariableEstimate(userId, now),
    // Obligations: no lower bound (overdue payments are still owed).
    loadPendingFixedPayments(userId, monthEnd),
    loadPendingFixedPayments(userId, yearEnd),
    // PAYABLE: no lower bound (overdue installments are still owed).
    loadRemainingLoanInstallments(userId, windowStart, monthEnd, 'PAYABLE'),
    loadRemainingLoanInstallments(userId, windowStart, yearEnd, 'PAYABLE'),
    // RECEIVABLE: future-only (`from = startOfDay(now)`).
    loadRemainingLoanInstallments(userId, windowStart, monthEnd, 'RECEIVABLE'),
    loadRemainingLoanInstallments(userId, windowStart, yearEnd, 'RECEIVABLE'),
    loadSalaryIncomeTransactions(userId, monthStart, monthEnd),
    loadSalaryIncomeTransactions(userId, yearStart, yearEnd),
  ]);

  const configured = salaryConfig?.isActive === true;
  const targetConfigured = projectionSettings?.isActive === true;
  // The stored target is the MONTHLY figure the projection spreads over the
  // period's months; no frequency derivation is involved.
  const monthlySavingsTargetCents = targetConfigured
    ? bigintToNumber(projectionSettings.monthlySavingsTargetCents)
    : 0;

  const incomeConfig: IncomeScheduleConfig | null = configured
    ? {
        amountCents: bigintToNumber(salaryConfig.amountCents),
        currency: salaryConfig.currency,
        frequency: salaryConfig.frequency,
        payDays: salaryConfig.payDays,
      }
    : null;
  const bonusConfigs: BonusScheduleConfig[] = configured
    ? salaryConfig.bonuses.map((bonus) => ({
        name: bonus.name,
        amountCents: bigintToNumber(bonus.amountCents),
        currency: bonus.currency,
        frequency: bonus.frequency,
        anchorMonth: bonus.anchorMonth,
        dayOfMonth: bonus.dayOfMonth,
      }))
    : [];

  // Expected occurrences are expanded from the START OF TODAY (`windowStart`,
  // defined with the query window) to the end of the period: an occurrence BEFORE
  // today already happened and must NEVER be reported as pending. Matching is by
  // NEAREST OCCURRENCE within `SALARY_MATCH_TOLERANCE_DAYS` (see
  // `matchSalaryOccurrences`); the REAL salary transactions of the period stay
  // loaded from the full calendar window (monthStart/yearStart) so
  // `salaryReceivedIncome` keeps ALL of them.
  const monthSalary = matchSalaryOccurrences(
    incomeConfig ? expandIncomeOccurrences(incomeConfig, windowStart, monthEnd) : [],
    salaryIncomeMonth
  );
  const yearSalary = matchSalaryOccurrences(
    incomeConfig ? expandIncomeOccurrences(incomeConfig, windowStart, yearEnd) : [],
    salaryIncomeYear
  );

  const monthInput: ProjectionPeriodInput = {
    period: 'month',
    asOf: now,
    periodStart: monthStart,
    periodEnd: monthEnd,
    currentCashByCurrency: cash.byCurrency,
    currentCashAccountsByCurrency: cash.accountsByCurrency,
    investmentByCurrency: investment.byCurrency,
    investmentAccountsByCurrency: investment.accountsByCurrency,
    salaryOccurrences: monthSalary.salaryOccurrences,
    salaryReceivedIncome: monthSalary.salaryReceivedIncome,
    salaryConfigured: configured,
    bonusOccurrences: bonusConfigs.flatMap((bonus) =>
      expandBonusOccurrences(bonus, windowStart, monthEnd)
    ),
    fixedPayments: fixedMonth,
    loanInstallments: loansPayableMonth,
    loanReceivableInstallments: loansReceivableMonth,
    monthlyVariableByCurrency: variable.byCurrency,
    variableDefinitionsCount: variable.definitionsCount,
    remainingMonthsFraction: remainingMonthFraction(now),
    savingsTargetMonths: 1,
    monthlySavingsTargetCents,
    rates,
  };

  const remainingFullMonths = remainingMonthsInYear(now) - 1;
  const yearInput: ProjectionPeriodInput = {
    period: 'year',
    asOf: now,
    periodStart: yearStart,
    periodEnd: yearEnd,
    currentCashByCurrency: cash.byCurrency,
    currentCashAccountsByCurrency: cash.accountsByCurrency,
    investmentByCurrency: investment.byCurrency,
    investmentAccountsByCurrency: investment.accountsByCurrency,
    salaryOccurrences: yearSalary.salaryOccurrences,
    salaryReceivedIncome: yearSalary.salaryReceivedIncome,
    salaryConfigured: configured,
    bonusOccurrences: bonusConfigs.flatMap((bonus) =>
      expandBonusOccurrences(bonus, windowStart, yearEnd)
    ),
    fixedPayments: fixedYear,
    loanInstallments: loansPayableYear,
    loanReceivableInstallments: loansReceivableYear,
    monthlyVariableByCurrency: variable.byCurrency,
    variableDefinitionsCount: variable.definitionsCount,
    // Current (partial) month + every full month left in the calendar year.
    remainingMonthsFraction: remainingMonthFraction(now) + remainingFullMonths,
    savingsTargetMonths: remainingMonthsInYear(now),
    monthlySavingsTargetCents,
    rates,
  };

  const monthResult = projectPeriod(monthInput);
  const yearResult = projectPeriod(yearInput);

  // `unconvertedByCurrency`: the ANNUAL period is a strict SUPERSET of the monthly
  // one (identical cash/investments/variable/savings base plus a wider set of
  // occurrences), so every amount the month failed to convert is ALSO present in
  // the year buckets. Summing month + year would DOUBLE COUNT the same amounts,
  // so the year buckets are the single source of truth. `unconverted` stays the
  // OR of both periods (defensive: a month-only unconvertible amount is not
  // expected, but it must never be silently dropped).
  const unconvertedByCurrency = yearResult.unconvertedByCurrency;

  // Non-monetary observability only: amounts are deliberately NOT logged (PII /
  // financial-integrity hygiene) and the event is `debug` because it fires on
  // every dashboard render. Audit logging of MUTATIONS is untouched.
  log.debug(
    {
      action: 'projection.get',
      userId,
      configured,
      targetConfigured,
      month: {
        overBudget: monthResult.period.overBudget,
        salaryStatus: monthResult.period.salaryStatus,
      },
      year: {
        overBudget: yearResult.period.overBudget,
        salaryStatus: yearResult.period.salaryStatus,
      },
      unconverted: monthResult.unconverted || yearResult.unconverted,
    },
    '[PROJECTION] End-of-period projection calculated'
  );

  return {
    configured,
    targetConfigured,
    currency: 'COP',
    month: monthResult.period,
    year: yearResult.period,
    exchangeRatesUsed: mergeRatesUsed(monthResult.exchangeRatesUsed, yearResult.exchangeRatesUsed),
    unconverted: monthResult.unconverted || yearResult.unconverted,
    unconvertedByCurrency,
  };
}
