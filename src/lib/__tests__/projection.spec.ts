/**
 * Pure end-of-period projection engine tests (`src/lib/projection.ts`).
 *
 * These lock the recurrence expansion (WEEKLY / BIWEEKLY / MONTHLY with
 * end-of-month clamping and dedup, bonuses anchored on a month), the variable
 * moving average, the projection arithmetic (projectedEnd / remainingToSpend /
 * projectedSurplus), the salary status resolution and the traceable FX rules
 * (Rule 9: an unconvertible amount is excluded and flagged, never invented).
 *
 * The module is PURE (no Prisma, no `server-only`), so these tests need no mocks
 * and no database.
 */

import { describe, it, expect } from 'vitest';
import type { Currency } from '@prisma/client';
import {
  estimateMonthlyVariableCents,
  expandBonusOccurrences,
  expandIncomeOccurrences,
  projectPeriod,
  remainingMonthFraction,
  remainingMonthsInYear,
  type BonusScheduleConfig,
  type IncomeScheduleConfig,
  type ProjectionPeriodInput,
} from '../projection';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COP_RATE = { COP: { copPerUnit: 1, source: 'live' as const } };

function occ(date: Date, amountCents: number, currency: Currency = 'COP', label = 'Salario') {
  return { date, amountCents, currency, label };
}

function baseInput(overrides: Partial<ProjectionPeriodInput> = {}): ProjectionPeriodInput {
  return {
    period: 'month',
    asOf: new Date(2026, 0, 15, 12),
    periodStart: new Date(2026, 0, 1),
    periodEnd: new Date(2026, 0, 31, 23, 59, 59, 999),
    currentCashByCurrency: {},
    currentCashAccountsByCurrency: {},
    investmentByCurrency: {},
    investmentAccountsByCurrency: {},
    salaryOccurrences: [],
    salaryReceivedIncome: [],
    salaryConfigured: false,
    bonusOccurrences: [],
    fixedPayments: [],
    loanInstallments: [],
    loanReceivableInstallments: [],
    monthlyVariableByCurrency: {},
    variableDefinitionsCount: 0,
    remainingMonthsFraction: 1,
    savingsTargetMonths: 1,
    monthlySavingsTargetCents: 0,
    rates: COP_RATE,
    ...overrides,
  };
}

const MONTHLY_COP: IncomeScheduleConfig = {
  amountCents: 2_000_000,
  currency: 'COP',
  frequency: 'MONTHLY',
  payDays: [15],
};

// ---------------------------------------------------------------------------
// expandIncomeOccurrences
// ---------------------------------------------------------------------------

describe('expandIncomeOccurrences', () => {
  it('returns nothing for an empty payDays schedule', () => {
    const result = expandIncomeOccurrences(
      { ...MONTHLY_COP, payDays: [] },
      new Date(2026, 0, 1),
      new Date(2026, 11, 31)
    );
    expect(result).toEqual([]);
  });

  it('returns nothing when the window is inverted', () => {
    const result = expandIncomeOccurrences(MONTHLY_COP, new Date(2026, 1, 1), new Date(2026, 0, 1));
    expect(result).toEqual([]);
  });

  describe('MONTHLY (one day of the month, clamped)', () => {
    it('emits one occurrence per overlapped month on the configured day', () => {
      const result = expandIncomeOccurrences(
        { ...MONTHLY_COP, payDays: [10] },
        new Date(2026, 0, 5),
        new Date(2026, 2, 20)
      );

      expect(result.map((o) => o.date.getMonth())).toEqual([0, 1, 2]);
      expect(result.map((o) => o.date.getDate())).toEqual([10, 10, 10]);
      expect(result.every((o) => o.amountCents === 2_000_000)).toBe(true);
      expect(result.every((o) => o.label === 'Salario')).toBe(true);
    });

    it('clamps day 31 to the end of February (28 in a non-leap year)', () => {
      const result = expandIncomeOccurrences(
        { ...MONTHLY_COP, payDays: [31] },
        new Date(2026, 1, 1),
        new Date(2026, 1, 28, 23, 59, 59)
      );

      expect(result).toHaveLength(1);
      expect(result[0].date.getMonth()).toBe(1);
      expect(result[0].date.getDate()).toBe(28);
    });

    it('clamps day 30 to 29 in a leap February', () => {
      const result = expandIncomeOccurrences(
        { ...MONTHLY_COP, payDays: [30] },
        new Date(2028, 1, 1),
        new Date(2028, 1, 29, 23, 59, 59)
      );

      expect(result).toHaveLength(1);
      expect(result[0].date.getDate()).toBe(29);
    });

    it('respects the [from, to] boundaries inclusively', () => {
      const result = expandIncomeOccurrences(
        { ...MONTHLY_COP, payDays: [1] },
        new Date(2026, 0, 1),
        new Date(2026, 0, 1, 23, 59, 59)
      );

      expect(result).toHaveLength(1);
      expect(result[0].date.getDate()).toBe(1);
    });

    it('skips a month whose clamped day falls before `from`', () => {
      const result = expandIncomeOccurrences(
        { ...MONTHLY_COP, payDays: [5] },
        new Date(2026, 0, 10),
        new Date(2026, 0, 31)
      );

      expect(result).toEqual([]);
    });
  });

  describe('BIWEEKLY (two days of the month)', () => {
    it('emits both configured days for every month in the window', () => {
      const result = expandIncomeOccurrences(
        { ...MONTHLY_COP, frequency: 'BIWEEKLY', payDays: [15, 30] },
        new Date(2026, 0, 1),
        new Date(2026, 0, 31, 23, 59, 59)
      );

      expect(result.map((o) => o.date.getDate())).toEqual([15, 30]);
    });

    it('deduplicates a clamped collision (days 30 & 31 in February)', () => {
      const result = expandIncomeOccurrences(
        { ...MONTHLY_COP, frequency: 'BIWEEKLY', payDays: [30, 31] },
        new Date(2026, 1, 1),
        new Date(2026, 1, 28, 23, 59, 59)
      );

      // Both 30 and 31 clamp to Feb 28 → a single occurrence, never two.
      expect(result).toHaveLength(1);
      expect(result[0].date.getDate()).toBe(28);
    });

    it('sorts the occurrences ascending even when the days are unsorted', () => {
      const result = expandIncomeOccurrences(
        { ...MONTHLY_COP, frequency: 'BIWEEKLY', payDays: [25, 5] },
        new Date(2026, 0, 1),
        new Date(2026, 0, 31, 23, 59, 59)
      );

      expect(result.map((o) => o.date.getDate())).toEqual([5, 25]);
    });
  });

  describe('WEEKLY (ISO weekday)', () => {
    it('emits every matching weekday inside the window', () => {
      // 2026-01-05 is a Monday; the window covers two Mondays (5 and 12).
      const result = expandIncomeOccurrences(
        { ...MONTHLY_COP, frequency: 'WEEKLY', payDays: [1] },
        new Date(2026, 0, 5),
        new Date(2026, 0, 18, 23, 59, 59)
      );

      expect(result.map((o) => o.date.getDate())).toEqual([5, 12]);
    });

    it('treats Sunday as ISO weekday 7', () => {
      // 2026-01-04 is a Sunday.
      const result = expandIncomeOccurrences(
        { ...MONTHLY_COP, frequency: 'WEEKLY', payDays: [7] },
        new Date(2026, 0, 4),
        new Date(2026, 0, 4, 23, 59, 59)
      );

      expect(result).toHaveLength(1);
      expect(result[0].date.getDay()).toBe(0);
    });

    it('caps the series at MAX_OCCURRENCES (1000) for an absurdly long window', () => {
      const result = expandIncomeOccurrences(
        { ...MONTHLY_COP, frequency: 'WEEKLY', payDays: [1] },
        new Date(2000, 0, 3),
        new Date(2030, 0, 1)
      );

      expect(result).toHaveLength(1000);
    });
  });
});

// ---------------------------------------------------------------------------
// expandBonusOccurrences
// ---------------------------------------------------------------------------

describe('expandBonusOccurrences', () => {
  function bonus(overrides: Partial<BonusScheduleConfig> = {}): BonusScheduleConfig {
    return {
      name: 'Prima',
      amountCents: 500_000,
      currency: 'COP',
      frequency: 'ANNUAL',
      anchorMonth: 12,
      dayOfMonth: null,
      ...overrides,
    };
  }

  it('returns nothing when the window is inverted', () => {
    expect(expandBonusOccurrences(bonus(), new Date(2026, 5, 1), new Date(2026, 0, 1))).toEqual([]);
  });

  it('emits the annual occurrence on the anchored month (day defaults to 1)', () => {
    const result = expandBonusOccurrences(
      bonus(),
      new Date(2026, 0, 1),
      new Date(2026, 11, 31, 23, 59, 59)
    );

    expect(result).toHaveLength(1);
    expect(result[0].date.getMonth()).toBe(11);
    expect(result[0].date.getDate()).toBe(1);
    expect(result[0].label).toBe('Prima');
    expect(result[0].amountCents).toBe(500_000);
  });

  it('emits quarterly occurrences on anchor month ± interval', () => {
    const result = expandBonusOccurrences(
      bonus({ frequency: 'QUARTERLY', anchorMonth: 1 }),
      new Date(2026, 0, 1),
      new Date(2026, 11, 31, 23, 59, 59)
    );

    expect(result.map((o) => o.date.getMonth())).toEqual([0, 3, 6, 9]);
  });

  it('emits a monthly occurrence for every month of the window', () => {
    const result = expandBonusOccurrences(
      bonus({ frequency: 'MONTHLY', anchorMonth: 1 }),
      new Date(2026, 0, 1),
      new Date(2026, 2, 31, 23, 59, 59)
    );

    expect(result).toHaveLength(3);
  });

  it('clamps a day-of-month beyond the end of February', () => {
    const result = expandBonusOccurrences(
      bonus({ frequency: 'ANNUAL', anchorMonth: 2, dayOfMonth: 31 }),
      new Date(2026, 1, 1),
      new Date(2026, 1, 28, 23, 59, 59)
    );

    expect(result).toHaveLength(1);
    expect(result[0].date.getDate()).toBe(28);
  });

  it('caps the series at MAX_OCCURRENCES (1000)', () => {
    const result = expandBonusOccurrences(
      bonus({ frequency: 'MONTHLY', anchorMonth: 1 }),
      new Date(1900, 0, 1),
      new Date(2100, 11, 31)
    );

    expect(result).toHaveLength(1000);
  });
});

// ---------------------------------------------------------------------------
// estimateMonthlyVariableCents
// ---------------------------------------------------------------------------

describe('estimateMonthlyVariableCents', () => {
  it('adds the expected amounts to the moving average of the recent months', () => {
    const result = estimateMonthlyVariableCents({ COP: 10_000 }, [
      { COP: 3_000 },
      { COP: 6_000 },
      { COP: 0 },
    ]);

    // average = (3000 + 6000 + 0) / 3 = 3000 → 10000 + 3000
    expect(result).toEqual({ COP: 13_000 });
  });

  it('treats a missing month as a genuine 0 (divides by the number of supplied months)', () => {
    const result = estimateMonthlyVariableCents({ COP: 10_000 }, [{ COP: 9_000 }, {}, {}]);

    expect(result.COP).toBe(13_000);
  });

  it('returns the expected amounts unchanged when no recent months are supplied', () => {
    expect(estimateMonthlyVariableCents({ COP: 7_000 }, [])).toEqual({ COP: 7_000 });
    expect(estimateMonthlyVariableCents({}, [])).toEqual({});
  });

  it('unions the currencies of the expected map and the recent months', () => {
    const result = estimateMonthlyVariableCents({ USD: 1_000 }, [{ COP: 3_000 }, { COP: 3_000 }]);

    expect(result).toEqual({ USD: 1_000, COP: 3_000 });
  });

  it('keeps currencies in independent buckets (never mixes them)', () => {
    const result = estimateMonthlyVariableCents({ COP: 0, USD: 0 }, [{ COP: 100_000, USD: 10 }]);

    expect(result).toEqual({ COP: 100_000, USD: 10 });
  });
});

// ---------------------------------------------------------------------------
// projectPeriod
// ---------------------------------------------------------------------------

describe('projectPeriod', () => {
  it('applies the documented formulas exactly (COP-only happy path)', () => {
    const result = projectPeriod(
      baseInput({
        currentCashByCurrency: { COP: 1_000_000 },
        currentCashAccountsByCurrency: { COP: 2 },
        investmentByCurrency: { COP: 500_000 },
        investmentAccountsByCurrency: { COP: 1 },
        salaryConfigured: true,
        salaryOccurrences: [
          {
            date: new Date(2026, 0, 20, 12),
            amountCents: 2_000_000,
            currency: 'COP',
            received: false,
          },
        ],
        bonusOccurrences: [occ(new Date(2026, 0, 25, 12), 400_000, 'COP', 'Prima')],
        fixedPayments: [{ amountCents: 300_000, currency: 'COP' }],
        loanInstallments: [
          { currency: 'COP', remainingPrincipalCents: 100_000, remainingInterestCents: 20_000 },
        ],
        loanReceivableInstallments: [
          { currency: 'COP', remainingPrincipalCents: 50_000, remainingInterestCents: 5_000 },
        ],
        monthlyVariableByCurrency: { COP: 200_000 },
        remainingMonthsFraction: 1,
        savingsTargetMonths: 1,
        monthlySavingsTargetCents: 100_000,
      })
    );

    const p = result.period;
    expect(p.currentCashCents).toBe(1_000_000);
    expect(p.investmentValueCents).toBe(500_000);
    // income = salary 2.0M + bonus 0.4M + receivable (50k + 5k) = 2.455M
    expect(p.remainingIncomeCents).toBe(2_455_000);
    expect(p.remainingFixedCents).toBe(300_000);
    expect(p.remainingLoanPaymentsCents).toBe(120_000);
    expect(p.remainingLoanPrincipalCents).toBe(100_000);
    expect(p.remainingLoanInterestCents).toBe(20_000);
    expect(p.remainingLoanReceivableCents).toBe(55_000);
    expect(p.remainingVariableBudgetCents).toBe(200_000);
    expect(p.remainingSavingsTargetCents).toBe(100_000);
    // remainingToSpend = income − fixed − loanPayments − savingsTarget
    expect(p.remainingToSpendCents).toBe(1_935_000);
    // projectedSurplus = remainingToSpend − variableBudget
    expect(p.projectedSurplusCents).toBe(1_735_000);
    expect(p.overBudget).toBe(false);
    // projectedEnd = cash + investment + income − (fixed + loans + variable + savings)
    expect(p.projectedEndCents).toBe(3_235_000);
    expect(p.salaryStatus).toBe('PENDING');
    expect(p.salaryPendingCents).toBe(2_000_000);
    expect(p.salaryReceivedCents).toBe(0);
    expect(p.nextSalaryDate?.getDate()).toBe(20);
    expect(p.nextSalaryAmountCents).toBe(2_000_000);
    expect(result.unconverted).toBe(false);
    expect(result.exchangeRatesUsed.COP).toBeUndefined(); // COP never needs a rate
  });

  it('prorates the variable budget by the remaining month fraction', () => {
    const result = projectPeriod(
      baseInput({
        monthlyVariableByCurrency: { COP: 300_000 },
        remainingMonthsFraction: 0.5,
      })
    );

    expect(result.period.remainingVariableBudgetCents).toBe(150_000);
    expect(result.period.projectedSurplusCents).toBe(-150_000);
    expect(result.period.overBudget).toBe(true);
  });

  it('does NOT double count a salary already received (it is in currentCash)', () => {
    const result = projectPeriod(
      baseInput({
        currentCashByCurrency: { COP: 2_000_000 },
        currentCashAccountsByCurrency: { COP: 1 },
        salaryConfigured: true,
        salaryOccurrences: [
          {
            date: new Date(2026, 0, 5, 12),
            amountCents: 2_000_000,
            currency: 'COP',
            received: true,
          },
        ],
        salaryReceivedIncome: [
          { amountCents: 2_000_000, currency: 'COP', date: new Date(2026, 0, 5, 12) },
        ],
      })
    );

    expect(result.period.salaryStatus).toBe('RECEIVED');
    expect(result.period.salaryReceivedCents).toBe(2_000_000);
    expect(result.period.salaryPendingCents).toBe(0);
    expect(result.period.remainingIncomeCents).toBe(0);
    expect(result.period.nextSalaryDate).toBeNull();
    expect(result.period.nextSalaryAmountCents).toBeNull();
  });

  it('reports PARTIAL when a future payday remains and some salary was received', () => {
    const result = projectPeriod(
      baseInput({
        salaryConfigured: true,
        salaryOccurrences: [
          {
            date: new Date(2026, 0, 20, 12),
            amountCents: 1_000_000,
            currency: 'COP',
            received: false,
          },
        ],
        salaryReceivedIncome: [
          { amountCents: 1_000_000, currency: 'COP', date: new Date(2026, 0, 2, 12) },
        ],
      })
    );

    expect(result.period.salaryStatus).toBe('PARTIAL');
    expect(result.period.salaryPendingCents).toBe(1_000_000);
    expect(result.period.salaryReceivedCents).toBe(1_000_000);
  });

  it('reports NO_PENDING when configured but nothing is pending or received', () => {
    const result = projectPeriod(baseInput({ salaryConfigured: true }));

    expect(result.period.salaryStatus).toBe('NO_PENDING');
    expect(result.period.salaryPendingCents).toBe(0);
  });

  it('reports NOT_CONFIGURED when no salary configuration exists', () => {
    const result = projectPeriod(baseInput({ salaryConfigured: false }));

    expect(result.period.salaryStatus).toBe('NOT_CONFIGURED');
  });

  it('converts a foreign amount with the explicit rate and records its provenance', () => {
    const result = projectPeriod(
      baseInput({
        currentCashByCurrency: { USD: 100 },
        currentCashAccountsByCurrency: { USD: 1 },
        rates: {
          COP: { copPerUnit: 1, source: 'live' },
          USD: { copPerUnit: 4_000, source: 'live' },
        },
      })
    );

    expect(result.period.currentCashCents).toBe(400_000);
    expect(result.unconverted).toBe(false);
    expect(result.exchangeRatesUsed.USD).toEqual({ rate: 4_000, source: 'live' });

    const cashLine = result.period.breakdown.find((line) => line.key === 'cash');
    expect(cashLine).toMatchObject({
      amountCents: 400_000,
      sourceCurrency: 'USD',
      originalAmountCents: 100,
      exchangeRate: 4_000,
    });
    // Rule 9: a single breakdown line never mixes currencies.
    expect(cashLine?.currency).toBe('COP');
  });

  it('excludes and flags an amount with no usable rate (never invents a rate)', () => {
    const result = projectPeriod(
      baseInput({
        currentCashByCurrency: { USD: 1_500 },
        currentCashAccountsByCurrency: { USD: 1 },
        rates: {
          COP: { copPerUnit: 1, source: 'live' },
          USD: { copPerUnit: 0, source: 'unavailable' },
        },
      })
    );

    expect(result.period.currentCashCents).toBe(0);
    expect(result.unconverted).toBe(true);
    expect(result.unconvertedByCurrency.USD).toEqual({ count: 1, amountCents: 1_500 });
    expect(result.exchangeRatesUsed.USD).toEqual({ rate: 0, source: 'unavailable' });

    const cashLine = result.period.breakdown.find((line) => line.key === 'cash');
    expect(cashLine).toMatchObject({
      amountCents: 0,
      originalAmountCents: 1_500,
      exchangeRate: null,
    });
    expect(cashLine?.detail).toContain('excluido');
  });

  it('does NOT flag a zero balance in an unconvertible currency', () => {
    const result = projectPeriod(
      baseInput({
        currentCashByCurrency: { USD: 0 },
        currentCashAccountsByCurrency: { USD: 1 },
        rates: { COP: { copPerUnit: 1, source: 'live' } },
      })
    );

    expect(result.unconverted).toBe(false);
    expect(result.period.currentCashCents).toBe(0);
  });

  it('converts the next pending salary with the resolved rate but never re-counts the FX bucket', () => {
    const result = projectPeriod(
      baseInput({
        salaryConfigured: true,
        salaryOccurrences: [
          {
            date: new Date(2026, 0, 20, 12),
            amountCents: 1_000,
            currency: 'USD',
            received: false,
          },
        ],
        rates: {
          COP: { copPerUnit: 1, source: 'live' },
          USD: { copPerUnit: 4_000, source: 'fallback' },
        },
      })
    );

    expect(result.period.nextSalaryAmountCents).toBe(4_000_000);
    // The pending occurrence was converted exactly once while building salary.
    expect(result.unconvertedByCurrency.USD).toBeUndefined();
  });

  it('keeps salary + bonus + receivable in independent per-currency lines', () => {
    const result = projectPeriod(
      baseInput({
        salaryConfigured: true,
        salaryOccurrences: [
          { date: new Date(2026, 0, 20, 12), amountCents: 1_000, currency: 'USD', received: false },
        ],
        bonusOccurrences: [occ(new Date(2026, 0, 25, 12), 300_000, 'COP', 'Prima')],
        loanReceivableInstallments: [
          { currency: 'COP', remainingPrincipalCents: 10_000, remainingInterestCents: 1_000 },
        ],
        rates: {
          COP: { copPerUnit: 1, source: 'live' },
          USD: { copPerUnit: 4_000, source: 'live' },
        },
      })
    );

    // 1,000 USD × 4,000 + 300,000 + 11,000 = 4,311,000
    expect(result.period.remainingIncomeCents).toBe(4_311_000);
    const salaryLine = result.period.breakdown.find((line) => line.key === 'salary');
    expect(salaryLine).toMatchObject({ amountCents: 4_000_000, sourceCurrency: 'USD' });
    const bonusLine = result.period.breakdown.find((line) => line.key === 'bonus');
    expect(bonusLine).toMatchObject({ amountCents: 300_000, sourceCurrency: 'COP' });
  });
});

// ---------------------------------------------------------------------------
// Proration helpers
// ---------------------------------------------------------------------------

describe('remainingMonthFraction', () => {
  it('returns 1 on the first day of a 31-day month', () => {
    expect(remainingMonthFraction(new Date(2026, 0, 1))).toBe(1);
  });

  it('returns the remaining share including the current day', () => {
    // January has 31 days; from the 16th there are 16 days left → 16/31.
    expect(remainingMonthFraction(new Date(2026, 0, 16))).toBeCloseTo(16 / 31, 6);
  });

  it('scales with the actual month length (February)', () => {
    expect(remainingMonthFraction(new Date(2026, 1, 15))).toBeCloseTo(14 / 28, 6);
  });
});

describe('remainingMonthsInYear', () => {
  it('counts the current month and every month after it', () => {
    expect(remainingMonthsInYear(new Date(2026, 0, 1))).toBe(12);
    expect(remainingMonthsInYear(new Date(2026, 5, 15))).toBe(7);
    expect(remainingMonthsInYear(new Date(2026, 11, 31))).toBe(1);
  });
});
