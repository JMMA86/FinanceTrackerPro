/**
 * End-of-period projection engine (PURE).
 *
 * This module owns the recurrence expansion and the projection arithmetic. It
 * deliberately has NO Prisma and NO `server-only` import so the math can be unit
 * tested in isolation and reused from any layer. All monetary arithmetic goes
 * through Decimal.js helpers (`@/lib/money`, Rule 1) and every amount is an
 * integer number of cents (Rule 2).
 *
 * ── Product decisions encoded here ──────────────────────────────────────────
 * - The projection is expressed in COP. Amounts held in USD/EUR are converted
 *   with an EXPLICIT, traceable rate supplied by the caller (`rates`); an amount
 *   without a usable rate is EXCLUDED and flagged (`unconvertedByCurrency`), a
 *   rate is never invented (Rule 9).
 * - Breakdown lines are emitted per component AND per source currency so a
 *   single `originalAmountCents` never mixes currencies. One line per component
 *   is the common case (the demo data is COP-only).
 * - Salary recurrences are driven by `payDays`, interpreted PER `frequency`:
 *     WEEKLY   = every day of the window whose ISO weekday (1=Monday … 7=Sunday)
 *                equals `payDays[0]` (exactly 1 value 1..7).
 *     BIWEEKLY = `payDays[0]` and `payDays[1]` of every month touched by the
 *                window (exactly 2 values 1..31), each CLAMPED to the end of the
 *                month (30 → 28/29 in February). A clamped collision is emitted
 *                once (deduplicated by date).
 *     MONTHLY  = `payDays[0]` of every month touched by the window (exactly 1
 *                value 1..31), clamped to the end of the month.
 *   Bonuses are anchored on `anchorMonth` (1-12) with an interval in months
 *   (MONTHLY=1, BIMONTHLY=2, QUARTERLY=3, SEMIANNUAL=6, ANNUAL=12) and
 *   `dayOfMonth` (default 1, clamped to the end of the month).
 * - Salary RECEIVED vs PENDING: the caller expands ONLY occurrences from today to
 *   the end of the period, so a past payday is never pending. An occurrence is
 *   `received` when the real salary INCOME transactions of the window match it by
 *   NEAREST OCCURRENCE (smallest absolute calendar-day distance, within a 15-day
 *   tolerance; each occurrence is matched at most once) — done by the service. A
 *   received occurrence is NOT counted again as an expected inflow (it is already
 *   inside `currentCashCents`) — this prevents double counting. See
 *   `projectPeriod`.
 */

import { Decimal } from 'decimal.js';
import { addCents, divideCents, multiplyCents, subtractCents } from '@/lib/money';
import type { BonusFrequency, Currency, SalaryFrequency } from '@prisma/client';
import type {
  ExchangeRateSource,
  ExchangeRateUsed,
  ProjectionBreakdownLine,
  ProjectionPeriod,
  ProjectionSalaryOccurrence,
  ProjectionSalaryStatus,
  UnconvertedCurrencyBucket,
} from '@/types/dashboard';

/** Safety cap so a malformed recurrence can never loop unbounded. */
const MAX_OCCURRENCES = 1_000;

/** Number of past months used by the unmonitored-variable moving average. */
export const VARIABLE_AVERAGE_WINDOW_MONTHS = 3;

type MoneyByCurrency = Partial<Record<Currency, number>>;

// ============================================================================
// Date helpers (local-time, noon-anchored to dodge DST edge cases)
// ============================================================================

function addDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, 12, 0, 0, 0);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Day `day` of (year, monthIndex) clamped to the last day of that month. */
function clampToMonth(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, Math.min(day, daysInMonth(year, monthIndex)), 12, 0, 0, 0);
}

/** ISO weekday of a date: 1=Monday … 7=Sunday (JS `getDay()` is 0=Sunday). */
function isoWeekday(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1;
}

/** Materialize a salary occurrence (label is always "Salario"). */
function makeSalaryOccurrence(date: Date, config: IncomeScheduleConfig): IncomeOccurrence {
  return {
    date,
    amountCents: config.amountCents,
    currency: config.currency,
    label: 'Salario',
  };
}

// ============================================================================
// Recurrence expansion
// ============================================================================

export interface IncomeScheduleConfig {
  amountCents: number;
  currency: Currency;
  frequency: SalaryFrequency;
  /**
   * Payment days, interpreted per `frequency` (see the module header):
   * WEEKLY -> [1..7] (ISO weekday); BIWEEKLY -> [1..31, 1..31];
   * MONTHLY -> [1..31]. An EMPTY array means "no salary schedule" (no occurrences).
   */
  payDays: readonly number[];
}

export interface BonusScheduleConfig {
  name: string;
  amountCents: number;
  currency: Currency;
  frequency: BonusFrequency;
  /** First occurrence month of the year (1-12). */
  anchorMonth: number;
  dayOfMonth: number | null;
}

/** One materialized income/bonus occurrence inside the requested window. */
export interface IncomeOccurrence {
  date: Date;
  amountCents: number;
  currency: Currency;
  label: string;
}

/**
 * Expand a salary schedule into concrete occurrences inside `[from, to]`.
 *
 * The series is fully described by `payDays`, interpreted per `frequency`:
 *
 * - WEEKLY   → iterate every day of the window (noon-anchored) and emit the dates
 *              whose ISO weekday (`1=Monday … 7=Sunday`) equals `payDays[0]`.
 * - BIWEEKLY → for every month touched by the window, emit `payDays[0]` and
 *              `payDays[1]`, each CLAMPED to the last day of that month
 *              (e.g. day 30 → 28/29 in February).
 * - MONTHLY  → for every month touched by the window, emit `payDays[0]`, clamped
 *              to the last day of that month.
 *
 * Boundaries `[from, to]` are respected (inclusive) and clamped collisions are
 * deduplicated, so the result never contains two occurrences on the same date.
 * The result is sorted ascending. An empty `payDays` yields no occurrences.
 */
export function expandIncomeOccurrences(
  config: IncomeScheduleConfig,
  from: Date,
  to: Date
): IncomeOccurrence[] {
  if (to.getTime() < from.getTime()) return [];
  if (config.payDays.length === 0) return [];

  const occurrences: IncomeOccurrence[] = [];

  if (config.frequency === 'WEEKLY') {
    expandWeeklyOccurrences(config, from, to, occurrences);
    return occurrences;
  }

  expandMonthlyLikeOccurrences(config, from, to, occurrences);
  occurrences.sort((a, b) => a.date.getTime() - b.date.getTime());
  return occurrences;
}

/**
 * WEEKLY expansion: iterate every day of `[from, to]` and emit the dates whose
 * ISO weekday equals `payDays[0]`. Occurrences are appended to `occurrences`.
 */
function expandWeeklyOccurrences(
  config: IncomeScheduleConfig,
  from: Date,
  to: Date,
  occurrences: IncomeOccurrence[]
): void {
  const targetWeekday = config.payDays[0];
  // Noon-anchored cursor: adding whole days keeps the calendar day stable and
  // dodges DST edge cases (the ISO weekday is time-of-day independent).
  let cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12, 0, 0, 0);
  while (cursor.getTime() <= to.getTime() && occurrences.length < MAX_OCCURRENCES) {
    if (cursor.getTime() >= from.getTime() && isoWeekday(cursor) === targetWeekday) {
      occurrences.push(makeSalaryOccurrence(new Date(cursor), config));
    }
    cursor = addDays(cursor, 1);
  }
}

/**
 * BIWEEKLY (2 days) / MONTHLY (1 day) expansion: one pass per month overlapped by
 * the window, emitting `payDays[0]` (MONTHLY) or `payDays[0..1]` (BIWEEKLY), each
 * clamped to the end of the month. `seen` deduplicates clamped collisions (30 & 31
 * in February both clamp to 28/29 and must produce a SINGLE occurrence).
 * Occurrences are appended to `occurrences`.
 */
function expandMonthlyLikeOccurrences(
  config: IncomeScheduleConfig,
  from: Date,
  to: Date,
  occurrences: IncomeOccurrence[]
): void {
  const days =
    config.frequency === 'BIWEEKLY' ? config.payDays.slice(0, 2) : config.payDays.slice(0, 1);
  const startIndex = from.getFullYear() * 12 + from.getMonth();
  const endIndex = to.getFullYear() * 12 + to.getMonth();
  const seen = new Set<number>();

  for (
    let index = startIndex;
    index <= endIndex && occurrences.length < MAX_OCCURRENCES;
    index += 1
  ) {
    const year = Math.floor(index / 12);
    const monthIndex = index % 12;
    for (const day of days) {
      const date = clampToMonth(year, monthIndex, day);
      const time = date.getTime();
      if (time < from.getTime() || time > to.getTime()) continue;
      if (seen.has(time)) continue;
      seen.add(time);
      occurrences.push(makeSalaryOccurrence(date, config));
    }
  }
}

const BONUS_INTERVAL_MONTHS: Record<BonusFrequency, number> = {
  MONTHLY: 1,
  BIMONTHLY: 2,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
};

/**
 * Expand a bonus schedule into concrete occurrences inside `[from, to]`,
 * anchored on `anchorMonth` (1-12) with the frequency's month interval.
 */
export function expandBonusOccurrences(
  bonus: BonusScheduleConfig,
  from: Date,
  to: Date
): IncomeOccurrence[] {
  if (to.getTime() < from.getTime()) return [];
  const interval = BONUS_INTERVAL_MONTHS[bonus.frequency];
  const anchorIndex = bonus.anchorMonth - 1;
  const day = bonus.dayOfMonth ?? 1;
  const occurrences: IncomeOccurrence[] = [];

  const startYear = from.getFullYear();
  const endYear = to.getFullYear();

  for (let year = startYear; year <= endYear; year += 1) {
    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      const offset = (((monthIndex - anchorIndex) % interval) + interval) % interval;
      if (offset !== 0) continue;
      const date = clampToMonth(year, monthIndex, day);
      if (date.getTime() < from.getTime() || date.getTime() > to.getTime()) continue;
      occurrences.push({
        date,
        amountCents: bonus.amountCents,
        currency: bonus.currency,
        label: bonus.name,
      });
      if (occurrences.length >= MAX_OCCURRENCES) break;
    }
    if (occurrences.length >= MAX_OCCURRENCES) break;
  }

  occurrences.sort((a, b) => a.date.getTime() - b.date.getTime());
  return occurrences;
}

// ============================================================================
// Variable expense estimate
// ============================================================================

/**
 * Estimate the monthly variable spend per currency:
 *
 *   estimate = Σ(expectedAmountCents × (expectedTimesPerMonth ?? 1))
 *            + moving average of the last `VARIABLE_AVERAGE_WINDOW_MONTHS`
 *              months of UNMONITORED EXPENSE transactions
 *
 * `recentMonthlyByCurrency` is chronological and every entry is a full month of
 * magnitudes (positive cents). The average divides by the number of supplied
 * months (a missing month genuinely contributes 0).
 */
export function estimateMonthlyVariableCents(
  expectedByCurrency: MoneyByCurrency,
  recentMonthlyByCurrency: ReadonlyArray<MoneyByCurrency>
): MoneyByCurrency {
  const currencies = new Set<Currency>([
    ...(Object.keys(expectedByCurrency) as Currency[]),
    ...recentMonthlyByCurrency.flatMap((month) => Object.keys(month) as Currency[]),
  ]);

  const divisor = recentMonthlyByCurrency.length > 0 ? recentMonthlyByCurrency.length : 1;
  const result: MoneyByCurrency = {};

  for (const currency of currencies) {
    let recentTotal = 0;
    for (const month of recentMonthlyByCurrency) {
      recentTotal = addCents(recentTotal, month[currency] ?? 0);
    }
    const average = divideCents(recentTotal, divisor);
    result[currency] = addCents(expectedByCurrency[currency] ?? 0, average);
  }

  return result;
}

// ============================================================================
// Projection
// ============================================================================

export type ProjectionPeriodKey = 'month' | 'year';

/** A resolved "COP cents per 1 unit of currency" rate with its provenance. */
export interface ProjectionRate {
  copPerUnit: number;
  source: ExchangeRateSource;
}

export type ProjectionRates = Partial<Record<Currency, ProjectionRate>>;

export interface ProjectionFixedItem {
  amountCents: number;
  currency: Currency;
}

/**
 * One REAL salary INCOME transaction already recorded in the window. The engine
 * converts it to COP with the same traceable FX rules and sums it into
 * `salaryReceivedCents`; it is NEVER added to the projected inflows because it is
 * already part of `currentCashCents` (double-counting guard).
 */
export interface ProjectionIncomeItem {
  amountCents: number;
  currency: Currency;
  date: Date;
}

/**
 * A remaining loan installment, already split into principal/interest. Used for
 * BOTH directions: PAYABLE (money the user owes, an OUTFLOW) and RECEIVABLE
 * (money the user lent out and will COLLECT, an INFLOW). The caller (service)
 * performs the proportional split from the persisted `paid*` fields; this module
 * only aggregates and converts.
 */
export interface ProjectionLoanItem {
  currency: Currency;
  remainingPrincipalCents: number;
  remainingInterestCents: number;
}

export interface ProjectionPeriodInput {
  period: ProjectionPeriodKey;
  asOf: Date;
  periodStart: Date;
  periodEnd: Date;
  /** Ledger cash per currency (CHECKING + CASH + SAVINGS + POCKET). */
  currentCashByCurrency: MoneyByCurrency;
  /** Number of liquid accounts that contributed to each currency bucket. */
  currentCashAccountsByCurrency: MoneyByCurrency;
  /**
   * Current value of the INVESTMENT accounts per currency: ledger cash of the
   * account + market value of its active holdings (Σ quantity × currentPrice).
   * Mirrors `getInvestmentPerformance`'s `totalValueCents` (Rule 13 — the cash
   * component comes from the ledger, never from the cached balance).
   */
  investmentByCurrency: MoneyByCurrency;
  /** Number of investment accounts that contributed to each currency bucket. */
  investmentAccountsByCurrency: MoneyByCurrency;
  /**
   * Salary occurrences that are STILL RELEVANT in the window (from today to the
   * end of the period), each carrying its `received` flag: the engine derives the
   * pending aggregates, the next payment and the status from this single source,
   * so "received" and "pending" can never disagree. Occurrences BEFORE today are
   * NOT passed by the caller — a past payday must never be reported as pending.
   *
   * Only the occurrences with `received === false` become expected inflows —
   * an already-received salary is inside the ledger `currentCashCents`.
   */
  salaryOccurrences: readonly ProjectionSalaryOccurrence[];
  /** REAL salary INCOME transactions of the window (already recorded). */
  salaryReceivedIncome: readonly ProjectionIncomeItem[];
  /** `true` when the user has an ACTIVE salary configuration. */
  salaryConfigured: boolean;
  /** Bonus occurrences inside the remaining window. */
  bonusOccurrences: readonly IncomeOccurrence[];
  /** Unpaid fixed-expense payments due in the remaining window. */
  fixedPayments: readonly ProjectionFixedItem[];
  /** Remaining PAYABLE installments due in the remaining window (OUTFLOW). */
  loanInstallments: readonly ProjectionLoanItem[];
  /**
   * Remaining RECEIVABLE installments due in the remaining window (INFLOW): money
   * the user lent out and will COLLECT, including principal + interest. Counted as
   * cash income by product decision (see `remainingIncomeCents`).
   */
  loanReceivableInstallments: readonly ProjectionLoanItem[];
  /** Monthly variable estimate per currency (COP included). */
  monthlyVariableByCurrency: MoneyByCurrency;
  /** Number of VariableExpense definitions used by the estimate (`count`). */
  variableDefinitionsCount: number;
  /** Fraction of the current month still ahead + full remaining months. */
  remainingMonthsFraction: number;
  /** How many months of savings target remain (month: 1; year: remaining incl. current). */
  savingsTargetMonths: number;
  /** Monthly savings target in COP cents. */
  monthlySavingsTargetCents: number;
  /** Resolved "COP per unit" rates for every foreign currency involved. */
  rates: ProjectionRates;
}

export interface ProjectionPeriodResult {
  period: ProjectionPeriod;
  exchangeRatesUsed: Partial<Record<Currency, ExchangeRateUsed>>;
  unconverted: boolean;
  unconvertedByCurrency: Partial<Record<Currency, UnconvertedCurrencyBucket>>;
}

interface FxTracker {
  ratesUsed: Partial<Record<Currency, ExchangeRateUsed>>;
  unconverted: Partial<Record<Currency, UnconvertedCurrencyBucket>>;
}

function recordUnconverted(tracker: FxTracker, currency: Currency, amountCents: number): void {
  const current = tracker.unconverted[currency] ?? { count: 0, amountCents: 0 };
  tracker.unconverted[currency] = {
    count: current.count + 1,
    // Magnitude in the ORIGINAL currency (Decimal abs, Rule 1).
    amountCents: addCents(current.amountCents, new Decimal(amountCents).abs().toNumber()),
  };
}

/**
 * Convert cents from `currency` into COP cents using an explicit multiplier,
 * recording the applied rate (or the failure) in `tracker`. Returns null when no
 * plausible rate is available (caller flags & excludes).
 */
function convertToCop(
  amountCents: number,
  currency: Currency,
  rates: ProjectionRates,
  tracker: FxTracker
): number | null {
  if (currency === 'COP') return amountCents;

  const rate = rates[currency];
  if (rate == null || !Number.isFinite(rate.copPerUnit) || rate.copPerUnit <= 0) {
    tracker.ratesUsed[currency] = { rate: 0, source: 'unavailable' };
    recordUnconverted(tracker, currency, amountCents);
    return null;
  }

  tracker.ratesUsed[currency] = { rate: rate.copPerUnit, source: rate.source };
  return multiplyCents(amountCents, rate.copPerUnit);
}

/**
 * Convert cents to COP using an already-resolved rate WITHOUT touching the FX
 * tracker. Used to report a SINGLE value (the next salary) whose currency was
 * already recorded while aggregating the pending-salary component, so the
 * rate/unconverted buckets are never counted twice for the same occurrence.
 */
function convertToCopWithoutTracking(
  amountCents: number,
  currency: Currency,
  rates: ProjectionRates
): number | null {
  if (currency === 'COP') return amountCents;
  const rate = rates[currency];
  if (rate == null || !Number.isFinite(rate.copPerUnit) || rate.copPerUnit <= 0) return null;
  return multiplyCents(amountCents, rate.copPerUnit);
}

interface SalaryStatusInput {
  configured: boolean;
  /** Number of occurrences with `received === false` (FUTURE, still pending). */
  pendingCount: number;
  /** COP cents of real salary INCOME transactions of the period. */
  receivedCents: number;
}

/**
 * Derive the salary status for ONE period from the PENDING occurrences only
 * (past occurrences are never expanded by the caller, so they never inflate the
 * pending side):
 * - NOT_CONFIGURED: no ACTIVE salary configuration.
 * - PENDING: future occurrences remain and NONE was received yet.
 * - PARTIAL: future occurrences remain and SOME salary was already received.
 * - RECEIVED: no occurrence remains pending and at least one was received.
 * - NO_PENDING: no occurrence remains pending and none was received (e.g. the
 *   account was created after this period's payday) — avoids showing a
 *   misleading "pending $0" or a false "received".
 */
function resolveSalaryStatus(input: SalaryStatusInput): ProjectionSalaryStatus {
  if (!input.configured) return 'NOT_CONFIGURED';
  if (input.pendingCount > 0) return input.receivedCents > 0 ? 'PARTIAL' : 'PENDING';
  return input.receivedCents > 0 ? 'RECEIVED' : 'NO_PENDING';
}

interface ComponentItem {
  currency: Currency;
  amountCents: number;
  count: number;
  detail: string;
}

interface BuiltComponent {
  lines: ProjectionBreakdownLine[];
  totalCopCents: number;
}

/**
 * Convert + assemble one logical component. Emits ONE line per source currency
 * (so `originalAmountCents` never mixes currencies). An unconvertible item
 * contributes 0 and is emitted with a rate-less line flagged in `detail`.
 */
function buildComponent(
  key: string,
  source: string,
  items: readonly ComponentItem[],
  rates: ProjectionRates,
  tracker: FxTracker
): BuiltComponent {
  const lines: ProjectionBreakdownLine[] = [];
  let totalCopCents = 0;

  for (const item of items) {
    // Zero amounts are skipped entirely: a zero balance in an unconvertible
    // currency must NOT be reported as an unconvertible amount (mirrors the
    // dashboard's `accumulateConverted`).
    if (item.amountCents === 0) continue;

    const converted = convertToCop(item.amountCents, item.currency, rates, tracker);
    if (converted == null) {
      lines.push({
        key,
        amountCents: 0,
        currency: 'COP',
        sourceCurrency: item.currency,
        originalAmountCents: item.amountCents,
        exchangeRate: null,
        source,
        count: item.count,
        detail: `${item.detail} · excluido: sin tasa de cambio`,
      });
      continue;
    }

    totalCopCents = addCents(totalCopCents, converted);
    lines.push({
      key,
      amountCents: converted,
      currency: 'COP',
      sourceCurrency: item.currency,
      originalAmountCents: item.amountCents,
      exchangeRate: item.currency === 'COP' ? null : (rates[item.currency]?.copPerUnit ?? null),
      source,
      count: item.count,
      detail: item.detail,
    });
  }

  return { lines, totalCopCents };
}

function groupByCurrency(
  rows: ReadonlyArray<{ amountCents: number; currency: Currency }>,
  describe: (currency: Currency, count: number) => string
): ComponentItem[] {
  const map = new Map<Currency, { amountCents: number; count: number }>();
  for (const row of rows) {
    const current = map.get(row.currency) ?? { amountCents: 0, count: 0 };
    current.amountCents = addCents(current.amountCents, row.amountCents);
    current.count += 1;
    map.set(row.currency, current);
  }

  return [...map.entries()].map(([currency, value]) => ({
    currency,
    amountCents: value.amountCents,
    count: value.count,
    detail: describe(currency, value.count),
  }));
}

function occurrencesByCurrency(
  occurrences: readonly IncomeOccurrence[],
  describe: (currency: Currency, count: number) => string
): ComponentItem[] {
  return groupByCurrency(
    occurrences.map((occurrence) => ({
      amountCents: occurrence.amountCents,
      currency: occurrence.currency,
    })),
    describe
  );
}

/**
 * Compute one projection period (`month` or `year`).
 *
 * `income` = salary + bonus + RECEIVABLE loan collections (principal + interest),
 * i.e. every INFLOW of the window. `loanPayments` remains the PAYABLE outflow only.
 *
 * Formulas (Decimal.js, ROUND_HALF_EVEN, integer cents):
 *   projectedEnd       = currentCash + investmentValue + income − fixed
 *                        − loanPayments − variableBudget − savingsTarget
 *   remainingToSpend   = income − fixed − loanPayments − savingsTarget
 *   projectedSurplus   = remainingToSpend − variableBudget
 *   overBudget         = projectedSurplus < 0
 *
 * `investmentValue` (ledger cash + holdings market value of the investment
 * accounts) is added ONLY to `projectedEnd`: it is part of the end-of-period net
 * position but it is NOT spendable, so `remainingToSpend`/`projectedSurplus`
 * stay liquid-cash-only.
 */
export function projectPeriod(input: ProjectionPeriodInput): ProjectionPeriodResult {
  const tracker: FxTracker = { ratesUsed: {}, unconverted: {} };
  const lines: ProjectionBreakdownLine[] = [];

  const cash = buildComponent(
    'cash',
    'CURRENT_CASH',
    (Object.keys(input.currentCashByCurrency) as Currency[]).map((currency) => ({
      currency,
      amountCents: input.currentCashByCurrency[currency] ?? 0,
      count: input.currentCashAccountsByCurrency[currency] ?? 0,
      detail: `Saldo líquido actual (${input.currentCashAccountsByCurrency[currency] ?? 0} cuenta(s))`,
    })),
    input.rates,
    tracker
  );
  lines.push(...cash.lines);

  // INVESTMENT value INFLOW: current value of the investment accounts (ledger
  // cash + holdings market value), converted per source currency with the same
  // traceable FX rules. It is added ONLY to `projectedEndCents` (end-of-period
  // net worth) and NEVER to `remainingToSpendCents`: the value is not spendable
  // until liquidated, so it must not inflate the "left to spend" figure.
  const investments = buildComponent(
    'investments',
    'INVESTMENT_VALUE',
    (Object.keys(input.investmentByCurrency) as Currency[]).map((currency) => ({
      currency,
      amountCents: input.investmentByCurrency[currency] ?? 0,
      count: input.investmentAccountsByCurrency[currency] ?? 0,
      detail: `Inversiones a valor de mercado (${
        input.investmentAccountsByCurrency[currency] ?? 0
      } cuenta(s))`,
    })),
    input.rates,
    tracker
  );
  lines.push(...investments.lines);

  // Salary INFLOW = ONLY the occurrences NOT yet received. A salary that the
  // user already registered as a transaction is part of `currentCashCents`, so
  // counting it here again would DOUBLE COUNT it (documented product decision).
  const pendingSalaryOccurrences: IncomeOccurrence[] = input.salaryOccurrences
    .filter((occurrence) => !occurrence.received)
    .map((occurrence) => ({
      date: occurrence.date,
      amountCents: occurrence.amountCents,
      currency: occurrence.currency,
      label: 'Salario',
    }));
  const salary = buildComponent(
    'salary',
    'SALARY_SCHEDULE',
    occurrencesByCurrency(
      pendingSalaryOccurrences,
      (_currency, count) => `${count} pago(s) de sueldo pendientes`
    ),
    input.rates,
    tracker
  );

  // REAL salary INCOME transactions of the window: converted (Rule 9) to feed
  // `salaryReceivedCents` and the status. Their lines are intentionally NOT
  // pushed into the breakdown because the money is already in `currentCashCents`
  // (adding an inflow line would misrepresent the projection totals).
  const salaryReceived = buildComponent(
    'salary-received',
    'SALARY_RECEIVED',
    groupByCurrency(
      input.salaryReceivedIncome,
      (_currency, count) => `${count} pago(s) de sueldo ya recibidos`
    ),
    input.rates,
    tracker
  );
  const bonus = buildComponent(
    'bonus',
    'BONUS_SCHEDULE',
    occurrencesByCurrency(
      input.bonusOccurrences,
      (_currency, count) => `${count} prima(s)/bono(s) restantes`
    ),
    input.rates,
    tracker
  );

  const fixed = buildComponent(
    'fixed',
    'FIXED_EXPENSES_PENDING',
    groupByCurrency(
      input.fixedPayments,
      (_currency, count) => `${count} pago(s) fijo(s) pendientes`
    ),
    input.rates,
    tracker
  );

  const loanPrincipal = buildComponent(
    'loan-principal',
    'LOAN_PRINCIPAL_REMAINING',
    groupByCurrency(
      input.loanInstallments.map((installment) => ({
        amountCents: installment.remainingPrincipalCents,
        currency: installment.currency,
      })),
      (_currency, count) => `Capital de ${count} cuota(s) de préstamo`
    ),
    input.rates,
    tracker
  );
  const loanInterest = buildComponent(
    'loan-interest',
    'LOAN_INTEREST_REMAINING',
    groupByCurrency(
      input.loanInstallments.map((installment) => ({
        amountCents: installment.remainingInterestCents,
        currency: installment.currency,
      })),
      (_currency, count) => `Interés de ${count} cuota(s) de préstamo`
    ),
    input.rates,
    tracker
  );

  // RECEIVABLE collections: money the user lent out and will collect. These are
  // INFLOWS, so they feed `remainingIncomeCents` (principal + interest).
  const loanReceivablePrincipal = buildComponent(
    'loan-receivable-principal',
    'LOAN_RECEIVABLE_PRINCIPAL',
    groupByCurrency(
      input.loanReceivableInstallments.map((installment) => ({
        amountCents: installment.remainingPrincipalCents,
        currency: installment.currency,
      })),
      (_currency, count) => `Capital de ${count} cuota(s) por cobrar`
    ),
    input.rates,
    tracker
  );
  const loanReceivableInterest = buildComponent(
    'loan-receivable-interest',
    'LOAN_RECEIVABLE_INTEREST',
    groupByCurrency(
      input.loanReceivableInstallments.map((installment) => ({
        amountCents: installment.remainingInterestCents,
        currency: installment.currency,
      })),
      (_currency, count) => `Interés de ${count} cuota(s) por cobrar`
    ),
    input.rates,
    tracker
  );

  // Variable estimate: prorated by the fraction of the period still ahead. The
  // monthly estimate is a single number per currency, so the `count` reflects
  // how many definitions (and months) contributed to it.
  const variable = buildComponent(
    'variable',
    'VARIABLE_ESTIMATE',
    (Object.keys(input.monthlyVariableByCurrency) as Currency[]).map((currency) => ({
      currency,
      amountCents: multiplyCents(
        input.monthlyVariableByCurrency[currency] ?? 0,
        input.remainingMonthsFraction
      ),
      count: input.variableDefinitionsCount,
      detail: `Estimación variable prorrateada (restante ${new Decimal(
        input.remainingMonthsFraction
      )
        .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN)
        .toString()} mes(es))`,
    })),
    input.rates,
    tracker
  );

  // Savings target is COP-only by product decision (no FX needed).
  const savingsTarget = buildComponent(
    'savings-target',
    'SAVINGS_TARGET',
    [
      {
        currency: 'COP',
        amountCents: multiplyCents(input.monthlySavingsTargetCents, input.savingsTargetMonths),
        count: input.savingsTargetMonths,
        detail: `Meta de ahorro COP × ${input.savingsTargetMonths} mes(es)`,
      },
    ],
    input.rates,
    tracker
  );

  lines.push(
    ...salary.lines,
    ...bonus.lines,
    ...fixed.lines,
    ...loanPrincipal.lines,
    ...loanInterest.lines,
    ...loanReceivablePrincipal.lines,
    ...loanReceivableInterest.lines,
    ...variable.lines,
    ...savingsTarget.lines
  );

  const currentCashCents = cash.totalCopCents;
  const investmentValueCents = investments.totalCopCents;
  const remainingFixedCents = fixed.totalCopCents;
  const remainingLoanPrincipalCents = loanPrincipal.totalCopCents;
  const remainingLoanInterestCents = loanInterest.totalCopCents;
  const remainingLoanPaymentsCents = addCents(
    remainingLoanPrincipalCents,
    remainingLoanInterestCents
  );
  const remainingLoanReceivablePrincipalCents = loanReceivablePrincipal.totalCopCents;
  const remainingLoanReceivableInterestCents = loanReceivableInterest.totalCopCents;
  const remainingLoanReceivableCents = addCents(
    remainingLoanReceivablePrincipalCents,
    remainingLoanReceivableInterestCents
  );
  // INFLOWS = salary + bonus + RECEIVABLE collections (principal + interest).
  const remainingIncomeCents = addCents(
    addCents(salary.totalCopCents, bonus.totalCopCents),
    remainingLoanReceivableCents
  );
  const remainingVariableBudgetCents = variable.totalCopCents;
  const remainingSavingsTargetCents = savingsTarget.totalCopCents;

  const remainingToSpendCents = subtractCents(
    subtractCents(
      subtractCents(remainingIncomeCents, remainingFixedCents),
      remainingLoanPaymentsCents
    ),
    remainingSavingsTargetCents
  );
  const projectedSurplusCents = subtractCents(remainingToSpendCents, remainingVariableBudgetCents);
  // End-of-period NET POSITION = liquid cash + investment value + remaining
  // income − every remaining outflow. Investment value is INCLUDED here only:
  // `remainingToSpendCents` above deliberately EXCLUDES it (not spendable).
  const projectedEndCents = subtractCents(
    addCents(addCents(currentCashCents, investmentValueCents), remainingIncomeCents),
    addCents(
      addCents(
        addCents(remainingFixedCents, remainingLoanPaymentsCents),
        remainingVariableBudgetCents
      ),
      remainingSavingsTargetCents
    )
  );

  // ── Salary received vs pending (public contract) ──────────────────────────
  const salaryReceivedCents = salaryReceived.totalCopCents;
  // Pending = Σ expected occurrences NOT received. Every occurrence handed by the
  // caller is >= today, so past paydays can never leak into this total.
  const salaryPendingCents = salary.totalCopCents;
  const salaryPendingCount = pendingSalaryOccurrences.length;

  // FX traceability (Rule 9): the expected occurrences flagged as received are
  // still converted once so their currency is recorded in the tracker, exactly as
  // before — they are NOT summed into any total (the REAL received amounts
  // already feed `salaryReceivedCents`). Pending occurrences were converted while
  // building the salary component, so no amount is FX-counted twice.
  for (const occurrence of input.salaryOccurrences) {
    if (!occurrence.received) continue;
    convertToCop(occurrence.amountCents, occurrence.currency, input.rates, tracker);
  }

  const salaryStatus = resolveSalaryStatus({
    configured: input.salaryConfigured,
    pendingCount: salaryPendingCount,
    receivedCents: salaryReceivedCents,
  });

  const sortedSalaryOccurrences = [...input.salaryOccurrences].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  const pendingSalary = sortedSalaryOccurrences.filter((occurrence) => !occurrence.received);
  // Next payment: first pending occurrence at/after `asOf` (all of them are >=
  // today); the OLDEST pending fallback is kept for safety when none qualifies.
  const nextSalaryOccurrence =
    pendingSalary.find((occurrence) => occurrence.date.getTime() >= input.asOf.getTime()) ??
    pendingSalary[0] ??
    null;
  const nextSalaryDate = nextSalaryOccurrence ? new Date(nextSalaryOccurrence.date) : null;
  const nextSalaryAmountCents = nextSalaryOccurrence
    ? convertToCopWithoutTracking(
        nextSalaryOccurrence.amountCents,
        nextSalaryOccurrence.currency,
        input.rates
      )
    : null;

  return {
    period: {
      period: input.period,
      asOf: input.asOf,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      currentCashCents,
      investmentValueCents,
      salaryReceivedCents,
      salaryPendingCents,
      salaryStatus,
      nextSalaryDate,
      nextSalaryAmountCents,
      salaryOccurrences: sortedSalaryOccurrences.map((occurrence) => ({
        date: new Date(occurrence.date),
        amountCents: occurrence.amountCents,
        currency: occurrence.currency,
        received: occurrence.received,
      })),
      remainingIncomeCents,
      remainingFixedCents,
      remainingLoanPaymentsCents,
      remainingLoanPrincipalCents,
      remainingLoanInterestCents,
      remainingLoanReceivableCents,
      remainingLoanReceivablePrincipalCents,
      remainingLoanReceivableInterestCents,
      remainingVariableBudgetCents,
      remainingSavingsTargetCents,
      projectedEndCents,
      remainingToSpendCents,
      projectedSurplusCents,
      overBudget: new Decimal(projectedSurplusCents).isNegative(),
      breakdown: lines,
    },
    exchangeRatesUsed: tracker.ratesUsed,
    unconverted: Object.keys(tracker.unconverted).length > 0,
    unconvertedByCurrency: tracker.unconverted,
  };
}

// ============================================================================
// Proration helpers (shared with the service)
// ============================================================================

/** Fraction of the current month still ahead (includes the remainder of today). */
export function remainingMonthFraction(now: Date): number {
  const lastDay = daysInMonth(now.getFullYear(), now.getMonth());
  const remainingDays = lastDay - now.getDate() + 1;
  if (remainingDays <= 0) return 0;
  return new Decimal(remainingDays)
    .dividedBy(lastDay)
    .toDecimalPlaces(6, Decimal.ROUND_HALF_EVEN)
    .toNumber();
}

/** Months remaining in the calendar year INCLUDING the current one (1..12). */
export function remainingMonthsInYear(now: Date): number {
  return 12 - now.getMonth();
}
