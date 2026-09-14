/**
 * Loan Interest & Amortization Engine (Rule 1 — Decimal.js, integer cents)
 *
 * Pure functions with NO database access. They convert a loan configuration
 * (rate type, accrual, day-count basis, amortization type, frequency) into an
 * amortization schedule and summary totals.
 *
 * All money math is performed with Decimal.js and ROUND_HALF_EVEN (Banker's
 * rounding). Native floating point arithmetic is never used for money.
 *
 * Rate semantics:
 * - EA       → Efectiva Anual (%):        i_period = (1 + EA/100)^(1/ppy) - 1
 * - NAMV     → Nominal Anual Mes Vencido: monthly = NAMV/1200, then to the
 *              target frequency via the equivalent effective annual rate.
 * - PERIODIC → already a rate for one frequency period (%).
 * - DAILY    → daily rate (%); the period rate compounds it over the period.
 *
 * Fase A note: these functions are intentionally free of Zod/schema concerns so
 * they can be reused by the loan service in Fase B.
 */

import { Decimal } from 'decimal.js';
import { addMonths, addWeeks, differenceInCalendarDays } from 'date-fns';
import type {
  LoanAmortizationType,
  LoanDayCountBasis,
  LoanInterestAccrual,
  LoanInterestMode,
  LoanPaymentFrequency,
  LoanRateType,
} from '@prisma/client';

// Keep parity with the global Decimal configuration in src/lib/money.ts (Rule 1).
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

/** Upper bound for a single money amount (matches MAX_SAFE_CENTS elsewhere). */
const MAX_SAFE_CENTS = 9_999_999_999_999;

const MONTHS_PER_YEAR = 12;
const BIWEEKLY_WEEKS = 2;

/** Number of periods per year for each supported payment frequency. */
const PERIODS_PER_YEAR: Record<LoanPaymentFrequency, number> = {
  WEEKLY: 52,
  BIWEEKLY: 24,
  MONTHLY: 12,
};

/** Nominal days per period per frequency (used with THIRTY_360). */
const DAYS_PER_PERIOD: Record<LoanPaymentFrequency, number> = {
  WEEKLY: 7,
  BIWEEKLY: 15,
  MONTHLY: 30,
};

/** Thrown when the schedule cannot be computed from the given configuration. */
export class LoanScheduleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoanScheduleValidationError';
  }
}

export interface LoanScheduleInput {
  principalCents: number;
  rateType: LoanRateType;
  /** Rate value in % interpreted according to `rateType`. */
  interestRateValue: number | Decimal;
  interestMode: LoanInterestMode;
  interestAccrual: LoanInterestAccrual;
  dayCountBasis: LoanDayCountBasis;
  amortizationType: LoanAmortizationType;
  paymentFrequency: LoanPaymentFrequency;
  termCount: number;
  /** Optional fixed installment (used by FRENCH as an override). */
  installmentAmountCents?: number | null;
  /** First N installments pay interest only (saldo stays constant). */
  interestOnlyInstallments?: number;
  /** Per-installment total override (used by CUSTOM). */
  customTotals?: (number | null)[];
  startDate: Date;
  firstPaymentDate: Date;
}

export interface ScheduleRow {
  installmentNumber: number;
  dueDate: Date;
  principalCents: number;
  interestCents: number;
  totalCents: number;
  balanceCents: number;
  isInterestOnly: boolean;
  isCustomTotal: boolean;
}

export interface LoanSummary {
  totalInterestCents: number;
  totalPayableCents: number;
  /**
   * SIMPLE yield over the loan life: totalInterest / principal * 100, rounded to
   * 2 decimals with ROUND_HALF_EVEN. It is NOT an annualized/TIR measure.
   */
  effectiveYieldPct: number;
}

/** Signals an unreachable branch while keeping exhaustive switch checks. */
function assertNever(value: never, label: string): never {
  throw new LoanScheduleValidationError(`Unsupported ${label}: ${String(value)}`);
}

function roundCents(value: Decimal): Decimal {
  return value.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
}

/** Year length in days for the configured day-count basis. */
function basisYearDays(basis: LoanDayCountBasis): number {
  switch (basis) {
    case 'ACTUAL_365':
      return 365;
    case 'ACTUAL_360':
      return 360;
    case 'THIRTY_360':
      return 360;
    default:
      return assertNever(basis, 'day count basis');
  }
}

/**
 * Days in an accrual period.
 * ACTUAL conventions use the real calendar distance; THIRTY_360 uses the
 * conventional 7 / 15 / 30 days per week / biweek / month.
 */
function periodDays(
  previous: Date,
  current: Date,
  frequency: LoanPaymentFrequency,
  basis: LoanDayCountBasis
): number {
  if (basis === 'THIRTY_360') {
    return DAYS_PER_PERIOD[frequency];
  }

  const actual = differenceInCalendarDays(current, previous);
  return actual > 0 ? actual : DAYS_PER_PERIOD[frequency];
}

/**
 * Convert a rate expressed according to `rateType` into an equivalent PERIODIC
 * rate (a fraction, not a percentage) for the given payment frequency.
 *
 * For DAILY the rate is compounded across `daysInPeriod` (or the nominal days of
 * the frequency when omitted). IMPORTANT: the schedule engine never uses this
 * branch for a DAILY rate type — `computePeriodInterest` always routes DAILY
 * rate types through the real daily path (`toDailyRate` + actual calendar days
 * from `periodDays`). This DAILY branch is therefore a frequency-nominal
 * fallback that is only reachable by external callers of this exported helper;
 * it is kept consistent with `toDailyRate` (daily fraction compounded over the
 * period's nominal days). The SIMPLE daily path is handled by the engine.
 */
export function toPeriodicRate(
  rateType: LoanRateType,
  rateValue: number | Decimal,
  frequency: LoanPaymentFrequency,
  daysInPeriod?: number
): Decimal {
  const rate = new Decimal(rateValue);
  const periodsPerYear = new Decimal(PERIODS_PER_YEAR[frequency]);
  const days = new Decimal(daysInPeriod ?? DAYS_PER_PERIOD[frequency]);

  switch (rateType) {
    case 'EA':
      return rate.dividedBy(100).plus(1).pow(new Decimal(1).dividedBy(periodsPerYear)).minus(1);
    case 'NAMV': {
      const monthly = rate.dividedBy(100).dividedBy(MONTHS_PER_YEAR);
      const effectiveAnnual = monthly.plus(1).pow(MONTHS_PER_YEAR).minus(1);
      return effectiveAnnual.plus(1).pow(new Decimal(1).dividedBy(periodsPerYear)).minus(1);
    }
    case 'PERIODIC':
      return rate.dividedBy(100);
    case 'DAILY':
      return rate.dividedBy(100).plus(1).pow(days).minus(1);
    default:
      return assertNever(rateType, 'rate type');
  }
}

/**
 * Number of amortization periods required to repay `principalCents` with a
 * constant installment of `installmentCents` (FRENCH / cuota fija).
 *
 * This is the inverse of the French quota formula and lets the UI offer an
 * "INSTALLMENT" schedule mode (fijar la cuota y derivar el número de cuotas)
 * instead of the classic "TERM" mode (fijar el número de cuotas).
 *
 * Algorithm (periodic rate `i` from `toPeriodicRate`):
 * - `i == 0`  → `n = ceil(P / A)`.
 * - `A <= P·i` → the installment does not even cover the periodic interest, so
 *   the debt would never amortize; throws `LoanScheduleValidationError`.
 * - otherwise → `n = ceil( ln( A / (A − P·i) ) / ln(1 + i) )`, clamped to `n >= 1`.
 *
 * Because `n` is rounded UP, the LAST schedule row (built by
 * `buildAmortizationSchedule`) absorbs the small residual so the closing balance
 * is exactly zero. The returned count is the number of AMORTIZING periods; when
 * `interestOnlyInstallments > 0` the caller must add them to obtain the total
 * term count (the interest-only periods do not reduce the principal).
 *
 * NOTE: the optional `interestAccrual` / `dayCountBasis` / `interestMode` fields
 * are accepted for API symmetry with `LoanScheduleInput` and future daily-accrual
 * support. The documented formula uses the periodic rate, so those fields do not
 * alter the result today.
 *
 * @throws LoanScheduleValidationError when the principal/installment are not
 * positive integers or the installment cannot cover the periodic interest.
 */
export function computeTermCountFromInstallment(params: {
  principalCents: number;
  rateType: LoanRateType;
  interestRateValue: number | Decimal;
  paymentFrequency: LoanPaymentFrequency;
  installmentCents: number;
  interestAccrual?: LoanInterestAccrual;
  dayCountBasis?: LoanDayCountBasis;
  interestMode?: LoanInterestMode;
}): number {
  const { principalCents, rateType, interestRateValue, paymentFrequency, installmentCents } =
    params;

  const principal = new Decimal(principalCents);
  if (!principal.isInteger() || !principal.greaterThan(0)) {
    throw new LoanScheduleValidationError(
      `principalCents must be a positive integer amount in cents, got ${principalCents}`
    );
  }
  if (principal.greaterThan(MAX_SAFE_CENTS)) {
    throw new LoanScheduleValidationError(
      `principalCents exceeds MAX_SAFE_CENTS (${MAX_SAFE_CENTS}), got ${principalCents}`
    );
  }

  const installment = new Decimal(installmentCents);
  if (!installment.isInteger() || !installment.greaterThan(0)) {
    throw new LoanScheduleValidationError(
      `installmentCents must be a positive integer amount in cents, got ${installmentCents}`
    );
  }

  const periodicRate = toPeriodicRate(rateType, interestRateValue, paymentFrequency);

  if (periodicRate.isZero()) {
    return Math.max(1, principal.dividedBy(installment).ceil().toNumber());
  }

  const periodicInterest = principal.times(periodicRate);
  if (installment.lessThanOrEqualTo(periodicInterest)) {
    throw new LoanScheduleValidationError(
      `installmentCents (${installmentCents}) does not cover the periodic interest ` +
        `(${roundCents(periodicInterest).toString()}) and would never amortize the principal`
    );
  }

  const ratio = installment.dividedBy(installment.minus(periodicInterest));
  const periods = ratio.ln().dividedBy(periodicRate.plus(1).ln()).ceil();

  return Math.max(1, periods.toNumber());
}

/**
 * Add `n` whole periods to a base date, honoring the day of the base date and
 * clamping at end-of-month without drifting across months (date-fns semantics).
 */
export function addPeriods(date: Date, frequency: LoanPaymentFrequency, n: number): Date {
  switch (frequency) {
    case 'WEEKLY':
      return addWeeks(date, n);
    case 'BIWEEKLY':
      return addWeeks(date, n * BIWEEKLY_WEEKS);
    case 'MONTHLY':
      return addMonths(date, n);
    default:
      return assertNever(frequency, 'payment frequency');
  }
}

/** Derive the DAILY rate (fraction) implied by the configured rate type. */
function toDailyRate(input: LoanScheduleInput, daysInPeriod: number): Decimal {
  const rate = new Decimal(input.interestRateValue);
  const yearDays = new Decimal(basisYearDays(input.dayCountBasis));

  switch (input.rateType) {
    case 'EA':
      return rate.dividedBy(100).plus(1).pow(new Decimal(1).dividedBy(yearDays)).minus(1);
    case 'NAMV': {
      const monthly = rate.dividedBy(100).dividedBy(MONTHS_PER_YEAR);
      const daysPerMonth = yearDays.dividedBy(MONTHS_PER_YEAR);
      return monthly.plus(1).pow(new Decimal(1).dividedBy(daysPerMonth)).minus(1);
    }
    case 'DAILY':
      return rate.dividedBy(100);
    case 'PERIODIC': {
      const periodic = rate.dividedBy(100);
      return periodic.plus(1).pow(new Decimal(1).dividedBy(daysInPeriod)).minus(1);
    }
    default:
      return assertNever(input.rateType, 'rate type');
  }
}

/**
 * Interest accrued during one period.
 * - PERIODIC accrual: balance × periodicRate.
 * - DAILY accrual (or a DAILY rate type): compounded or simple across the days.
 *
 * When `interestAccrual` is PERIODIC (and the rate type is not DAILY) the period
 * rate is ALREADY the effective per-period rate, so `interestMode === 'SIMPLE'`
 * behaves identically to `'COMPOUND'`. The mode only differentiates the daily
 * accrual path; the combination SIMPLE + PERIODIC is intentionally accepted and
 * documented rather than rejected, preserving existing calculation behavior.
 */
function computePeriodInterest(
  balance: Decimal,
  input: LoanScheduleInput,
  periodicRate: Decimal,
  days: number
): Decimal {
  const usesDailyAccrual = input.interestAccrual === 'DAILY' || input.rateType === 'DAILY';

  if (!usesDailyAccrual) {
    return balance.times(periodicRate);
  }

  const dailyRate = toDailyRate(input, days);
  const dayCount = new Decimal(days);

  if (input.interestMode === 'SIMPLE') {
    return balance.times(dailyRate).times(dayCount);
  }

  return balance.times(dailyRate.plus(1).pow(dayCount).minus(1));
}

/** French constant installment: P·i·(1+i)^n / ((1+i)^n − 1). */
function computeFrenchQuota(principal: Decimal, periodicRate: Decimal, termCount: number): Decimal {
  if (periodicRate.isZero()) {
    return roundCents(principal.dividedBy(termCount));
  }

  const onePlusRate = periodicRate.plus(1);
  const compound = onePlusRate.pow(termCount);
  return roundCents(principal.times(periodicRate).times(compound).dividedBy(compound.minus(1)));
}

/** Validate the schedule input and return the parsed principal/term. */
function assertValidInput(input: LoanScheduleInput): { principal: Decimal; interestOnly: number } {
  const principal = new Decimal(input.principalCents);

  if (!principal.isInteger() || !principal.greaterThan(0)) {
    throw new LoanScheduleValidationError(
      `principalCents must be a positive integer amount in cents, got ${input.principalCents}`
    );
  }
  if (principal.greaterThan(MAX_SAFE_CENTS)) {
    throw new LoanScheduleValidationError(
      `principalCents exceeds MAX_SAFE_CENTS (${MAX_SAFE_CENTS}), got ${input.principalCents}`
    );
  }
  if (!new Decimal(input.termCount).isInteger() || input.termCount <= 0) {
    throw new LoanScheduleValidationError(
      `termCount must be a positive integer, got ${input.termCount}`
    );
  }

  const interestOnly = input.interestOnlyInstallments ?? 0;
  if (
    !new Decimal(interestOnly).isInteger() ||
    interestOnly < 0 ||
    interestOnly >= input.termCount
  ) {
    throw new LoanScheduleValidationError(
      `interestOnlyInstallments must be an integer in [0, termCount), got ${interestOnly}`
    );
  }

  return { principal, interestOnly };
}

interface RowContext {
  balance: Decimal;
  interest: Decimal;
  isLast: boolean;
  isInterestOnlyRow: boolean;
}

/** Principal portion for one non-interest-only row, per amortization type. */
function resolvePrincipalPortion(
  input: LoanScheduleInput,
  context: RowContext,
  installmentNumber: number,
  amortizingTerm: number,
  frenchQuota: Decimal | null,
  germanPrincipal: Decimal | null
): { principal: Decimal; isCustomTotal: boolean } {
  if (context.isInterestOnlyRow) {
    return { principal: new Decimal(0), isCustomTotal: false };
  }

  switch (input.amortizationType) {
    case 'FRENCH': {
      if (context.isLast) {
        // Last row absorbs the residual so the closing balance is exactly zero.
        return { principal: context.balance, isCustomTotal: false };
      }
      const portion = frenchQuota!.minus(context.interest);
      return { principal: clampPrincipal(portion, context.balance), isCustomTotal: false };
    }
    case 'GERMAN': {
      if (context.isLast) {
        return { principal: context.balance, isCustomTotal: false };
      }
      return { principal: clampPrincipal(germanPrincipal!, context.balance), isCustomTotal: false };
    }
    case 'AMERICAN': {
      // All rows pay interest only; the last row also repays the full principal.
      return { principal: context.isLast ? context.balance : new Decimal(0), isCustomTotal: false };
    }
    case 'CUSTOM':
      return resolveCustomPrincipal(input, context, installmentNumber, amortizingTerm);
    default:
      return assertNever(input.amortizationType, 'amortization type');
  }
}

/**
 * CUSTOM rows use `customTotals[i]` as the total; the excess over interest
 * amortizes principal. Missing totals fall back to an equal principal share.
 */
function resolveCustomPrincipal(
  input: LoanScheduleInput,
  context: RowContext,
  installmentNumber: number,
  amortizingTerm: number
): { principal: Decimal; isCustomTotal: boolean } {
  if (context.isLast) {
    return { principal: context.balance, isCustomTotal: false };
  }

  const customTotal = input.customTotals?.[installmentNumber - 1];
  if (customTotal != null) {
    return {
      principal: clampPrincipal(new Decimal(customTotal).minus(context.interest), context.balance),
      isCustomTotal: true,
    };
  }

  return {
    principal: roundCents(context.balance.dividedBy(amortizingTerm)),
    isCustomTotal: false,
  };
}

/** Clamp principal into [0, balance] to avoid negative or over-amortization. */
function clampPrincipal(portion: Decimal, balance: Decimal): Decimal {
  if (portion.isNegative()) {
    return new Decimal(0);
  }
  if (portion.greaterThan(balance)) {
    return balance;
  }
  return portion;
}

/**
 * Build the full amortization schedule.
 *
 * @throws LoanScheduleValidationError when principalCents <= 0 or termCount <= 0.
 */
export function buildAmortizationSchedule(input: LoanScheduleInput): ScheduleRow[] {
  const { principal, interestOnly } = assertValidInput(input);
  const amortizingTerm = input.termCount - interestOnly;
  const periodicRate = toPeriodicRate(
    input.rateType,
    input.interestRateValue,
    input.paymentFrequency
  );

  let frenchQuota: Decimal | null = null;
  if (input.amortizationType === 'FRENCH') {
    frenchQuota =
      input.installmentAmountCents != null && input.installmentAmountCents > 0
        ? new Decimal(input.installmentAmountCents)
        : computeFrenchQuota(principal, periodicRate, amortizingTerm);
  }

  let germanPrincipal: Decimal | null = null;
  if (input.amortizationType === 'GERMAN') {
    germanPrincipal = roundCents(principal.dividedBy(amortizingTerm));
  }

  const rows: ScheduleRow[] = [];
  let balance = principal;
  let previousDueDate = input.startDate;

  for (let installmentNumber = 1; installmentNumber <= input.termCount; installmentNumber++) {
    const dueDate = addPeriods(
      input.firstPaymentDate,
      input.paymentFrequency,
      installmentNumber - 1
    );
    const days = periodDays(previousDueDate, dueDate, input.paymentFrequency, input.dayCountBasis);
    const interest = roundCents(computePeriodInterest(balance, input, periodicRate, days));
    const isLast = installmentNumber === input.termCount;
    const isInterestOnlyRow =
      installmentNumber <= interestOnly || (input.amortizationType === 'AMERICAN' && !isLast);

    const { principal: rawPrincipal, isCustomTotal } = resolvePrincipalPortion(
      input,
      { balance, interest, isLast, isInterestOnlyRow },
      installmentNumber,
      amortizingTerm,
      frenchQuota,
      germanPrincipal
    );

    const principalPortion = roundCents(rawPrincipal);
    const total = principalPortion.plus(interest);
    balance = balance.minus(principalPortion);
    if (balance.isNegative() && balance.abs().lessThan(0.5)) {
      balance = new Decimal(0);
    }

    rows.push({
      installmentNumber,
      dueDate,
      principalCents: principalPortion.toNumber(),
      interestCents: interest.toNumber(),
      totalCents: total.toNumber(),
      balanceCents: balance.toNumber(),
      isInterestOnly: isInterestOnlyRow,
      isCustomTotal,
    });

    previousDueDate = dueDate;
  }

  return rows;
}

/**
 * Aggregate a schedule into the loan totals.
 * `effectiveYieldPct` is a SIMPLE (non-annualized) yield: interest/principal.
 */
export function computeLoanSummary(rows: ScheduleRow[], principalCents: number): LoanSummary {
  const principal = new Decimal(principalCents);
  if (!principal.isInteger() || !principal.greaterThan(0)) {
    throw new LoanScheduleValidationError(
      `principalCents must be a positive integer amount in cents, got ${principalCents}`
    );
  }

  let interestSum = new Decimal(0);
  for (const row of rows) {
    interestSum = interestSum.plus(row.interestCents);
  }

  const totalInterest = roundCents(interestSum);
  const totalPayable = principal.plus(totalInterest);
  const effectiveYieldPct = totalInterest
    .dividedBy(principal)
    .times(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);

  return {
    totalInterestCents: totalInterest.toNumber(),
    totalPayableCents: totalPayable.toNumber(),
    effectiveYieldPct: effectiveYieldPct.toNumber(),
  };
}
