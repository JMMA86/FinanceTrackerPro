/**
 * Loan Interest & Amortization Engine — Unit Tests
 *
 * Pure-function coverage for src/lib/loans/interest.ts: rate conversion,
 * period arithmetic, schedule generation (FRENCH/GERMAN/AMERICAN/CUSTOM,
 * interest-only, daily accrual), summaries and the inverse French term count.
 */

import { describe, it, expect } from 'vitest';
import {
  addPeriods,
  buildAmortizationSchedule,
  computeLoanSummary,
  computeTermCountFromInstallment,
  LoanScheduleValidationError,
  toPeriodicRate,
  type LoanScheduleInput,
  type ScheduleRow,
} from '../interest';

function baseInput(overrides: Partial<LoanScheduleInput> = {}): LoanScheduleInput {
  return {
    principalCents: 120000,
    rateType: 'PERIODIC',
    interestRateValue: 0,
    interestMode: 'COMPOUND',
    interestAccrual: 'PERIODIC',
    dayCountBasis: 'ACTUAL_365',
    amortizationType: 'FRENCH',
    paymentFrequency: 'MONTHLY',
    termCount: 12,
    startDate: new Date(2026, 0, 1),
    firstPaymentDate: new Date(2026, 1, 1),
    ...overrides,
  };
}

function sum(rows: ScheduleRow[], pick: (row: ScheduleRow) => number): number {
  return rows.reduce((acc, row) => acc + pick(row), 0);
}

describe('lib/loans/interest', () => {
  describe('toPeriodicRate', () => {
    it('convierte EA a tasa periódica mensual con (1+r)^(1/m)-1', () => {
      const rate = toPeriodicRate('EA', 12, 'MONTHLY').toNumber();
      expect(rate).toBeCloseTo(Math.pow(1.12, 1 / 12) - 1, 10);
    });

    it('convierte EA a tasas semanal y quincenal según la frecuencia', () => {
      const weekly = toPeriodicRate('EA', 12, 'WEEKLY').toNumber();
      const biweekly = toPeriodicRate('EA', 12, 'BIWEEKLY').toNumber();
      expect(weekly).toBeCloseTo(Math.pow(1.12, 1 / 52) - 1, 10);
      expect(biweekly).toBeCloseTo(Math.pow(1.12, 1 / 24) - 1, 10);
      expect(weekly).toBeLessThan(biweekly);
    });

    it('convierte NAMV a la tasa efectiva del período', () => {
      const monthly = toPeriodicRate('NAMV', 24, 'MONTHLY').toNumber();
      // NAMV/12 luego a efectiva anual y de vuelta a mensual.
      expect(monthly).toBeCloseTo(Math.pow(1 + (0.24 / 12) * 1, 12 / 12) - 1, 10);
      const expected = Math.pow(Math.pow(1 + 24 / 100 / 12, 12), 1 / 12) - 1;
      expect(monthly).toBeCloseTo(expected, 10);
    });

    it('interpreta PERIODIC como una tasa directa del período', () => {
      expect(toPeriodicRate('PERIODIC', 2.5, 'MONTHLY').toNumber()).toBeCloseTo(0.025, 12);
    });

    it('capitaliza DAILY sobre los días del período', () => {
      const rate = toPeriodicRate('DAILY', 0.1, 'MONTHLY', 30).toNumber();
      expect(rate).toBeCloseTo(Math.pow(1.001, 30) - 1, 12);
    });
  });

  describe('addPeriods', () => {
    it('suma meses, quincenas y semanas correctamente', () => {
      const base = new Date(2026, 0, 15);
      expect(addPeriods(base, 'WEEKLY', 2).getTime()).toBe(new Date(2026, 0, 29).getTime());
      expect(addPeriods(base, 'BIWEEKLY', 1).getTime()).toBe(new Date(2026, 0, 29).getTime());
      expect(addPeriods(base, 'MONTHLY', 1).getTime()).toBe(new Date(2026, 1, 15).getTime());
    });

    it('hace clamp al fin de mes sin desbordar de mes', () => {
      const result = addPeriods(new Date(2026, 0, 31), 'MONTHLY', 1);
      expect(result.getMonth()).toBe(1); // Febrero
      expect(result.getDate()).toBe(28); // 2026 no es bisiesto
    });
  });

  describe('buildAmortizationSchedule', () => {
    it('FRENCH cierra el saldo exactamente en 0 (la última cuota absorbe el residuo)', () => {
      const rows = buildAmortizationSchedule(
        baseInput({ rateType: 'EA', interestRateValue: 12, termCount: 12 })
      );

      expect(rows).toHaveLength(12);
      expect(rows.at(-1)!.balanceCents).toBe(0);
      expect(sum(rows, (r) => r.principalCents)).toBe(120000);
      // Todas las cuotas salvo la última (que absorbe el redondeo) son muy similares.
      const firstTotal = rows[0].totalCents;
      expect(Math.abs(rows[1].totalCents - firstTotal)).toBeLessThanOrEqual(1);
    });

    it('respeta installmentAmountCents como override de la cuota FRENCH', () => {
      const rows = buildAmortizationSchedule(
        baseInput({
          rateType: 'PERIODIC',
          interestRateValue: 0,
          termCount: 12,
          installmentAmountCents: 5000,
        })
      );

      // Las 11 primeras pagan la cuota fija; la última absorbe el residuo.
      expect(rows[0].principalCents).toBe(5000);
      expect(rows[10].principalCents).toBe(5000);
      expect(rows[11].principalCents).toBe(65000);
      expect(rows.at(-1)!.balanceCents).toBe(0);
    });

    it('GERMAN amortiza capital fijo', () => {
      const rows = buildAmortizationSchedule(
        baseInput({ amortizationType: 'GERMAN', termCount: 12 })
      );

      for (const row of rows) {
        expect(row.principalCents).toBe(10000);
      }
      expect(rows.at(-1)!.balanceCents).toBe(0);
    });

    it('AMERICAN paga solo interés y repone el capital en la última cuota', () => {
      const rows = buildAmortizationSchedule(
        baseInput({
          amortizationType: 'AMERICAN',
          rateType: 'PERIODIC',
          interestRateValue: 1,
          principalCents: 100000,
          termCount: 4,
        })
      );

      expect(rows).toHaveLength(4);
      for (const row of rows.slice(0, 3)) {
        expect(row.principalCents).toBe(0);
        expect(row.isInterestOnly).toBe(true);
        expect(row.interestCents).toBe(1000);
      }
      expect(rows[3].principalCents).toBe(100000);
      expect(rows[3].balanceCents).toBe(0);
    });

    it('CUSTOM usa customTotals fila a fila y la última absorbe el residuo', () => {
      const rows = buildAmortizationSchedule(
        baseInput({
          amortizationType: 'CUSTOM',
          termCount: 4,
          principalCents: 120000,
          customTotals: [20000, 40000, 30000, 30000],
        })
      );

      expect(rows.map((r) => r.principalCents)).toEqual([20000, 40000, 30000, 30000]);
      expect(rows[0].isCustomTotal).toBe(true);
      expect(rows[2].isCustomTotal).toBe(true);
      expect(rows.at(-1)!.balanceCents).toBe(0);
    });

    it('interestOnlyInstallments deja las primeras N cuotas solo con interés y saldo constante', () => {
      const rows = buildAmortizationSchedule(
        baseInput({
          rateType: 'PERIODIC',
          interestRateValue: 1,
          principalCents: 100000,
          termCount: 12,
          interestOnlyInstallments: 2,
        })
      );

      expect(rows[0].principalCents).toBe(0);
      expect(rows[0].isInterestOnly).toBe(true);
      expect(rows[0].interestCents).toBe(1000);
      expect(rows[0].balanceCents).toBe(100000);
      expect(rows[1].balanceCents).toBe(100000);
      expect(rows[2].balanceCents).toBeLessThan(100000);
      expect(rows.at(-1)!.balanceCents).toBe(0);
    });

    describe('causación DAILY', () => {
      function dailyInterest(overrides: Partial<LoanScheduleInput>): number {
        const rows = buildAmortizationSchedule(
          baseInput({
            amortizationType: 'AMERICAN',
            rateType: 'EA',
            interestRateValue: 12,
            interestAccrual: 'DAILY',
            principalCents: 100000,
            termCount: 2,
            startDate: new Date(2026, 0, 1),
            firstPaymentDate: new Date(2026, 1, 1),
            ...overrides,
          })
        );
        return rows[0].interestCents;
      }

      it('diferencia SIMPLE de COMPOUND en la causación diaria', () => {
        const simple = dailyInterest({ interestMode: 'SIMPLE' });
        const compound = dailyInterest({ interestMode: 'COMPOUND' });
        expect(simple).not.toBe(compound);
        expect(compound).toBeGreaterThan(simple);
      });

      it('produce intereses distintos según el dayCountBasis', () => {
        const actual365 = dailyInterest({ dayCountBasis: 'ACTUAL_365' });
        const actual360 = dailyInterest({ dayCountBasis: 'ACTUAL_360' });
        const thirty360 = dailyInterest({ dayCountBasis: 'THIRTY_360' });

        expect(actual360).toBeGreaterThan(actual365);
        expect(thirty360).not.toBe(actual365);
      });
    });

    it('lanza LoanScheduleValidationError con principalCents <= 0', () => {
      expect(() => buildAmortizationSchedule(baseInput({ principalCents: 0 }))).toThrow(
        LoanScheduleValidationError
      );
      expect(() => buildAmortizationSchedule(baseInput({ principalCents: -100 }))).toThrow(
        LoanScheduleValidationError
      );
    });

    it('lanza LoanScheduleValidationError con termCount <= 0', () => {
      expect(() => buildAmortizationSchedule(baseInput({ termCount: 0 }))).toThrow(
        LoanScheduleValidationError
      );
      expect(() => buildAmortizationSchedule(baseInput({ termCount: -3 }))).toThrow(
        LoanScheduleValidationError
      );
    });

    it('lanza LoanScheduleValidationError cuando interestOnlyInstallments >= termCount', () => {
      expect(() =>
        buildAmortizationSchedule(baseInput({ termCount: 3, interestOnlyInstallments: 3 }))
      ).toThrow(LoanScheduleValidationError);
      expect(() =>
        buildAmortizationSchedule(baseInput({ termCount: 3, interestOnlyInstallments: 4 }))
      ).toThrow(LoanScheduleValidationError);
    });
  });

  describe('computeLoanSummary', () => {
    it('suma intereses, calcula el total a pagar y el rendimiento simple a 2 decimales', () => {
      const rows = [
        { interestCents: 100, totalCents: 1100 },
        { interestCents: 200, totalCents: 1200 },
      ] as ScheduleRow[];

      const summary = computeLoanSummary(rows, 1000);

      expect(summary.totalInterestCents).toBe(300);
      expect(summary.totalPayableCents).toBe(1300);
      expect(summary.effectiveYieldPct).toBe(30);
    });

    it('devuelve rendimiento 0 cuando no hay intereses', () => {
      const summary = computeLoanSummary([], 5000);
      expect(summary.totalInterestCents).toBe(0);
      expect(summary.totalPayableCents).toBe(5000);
      expect(summary.effectiveYieldPct).toBe(0);
    });

    it('rechaza un principal no positivo', () => {
      expect(() => computeLoanSummary([], 0)).toThrow(LoanScheduleValidationError);
    });
  });

  describe('computeTermCountFromInstallment', () => {
    it('con tasa 0 devuelve ceil(P / A)', () => {
      expect(
        computeTermCountFromInstallment({
          principalCents: 120000,
          rateType: 'PERIODIC',
          interestRateValue: 0,
          paymentFrequency: 'MONTHLY',
          installmentCents: 30000,
        })
      ).toBe(4);

      expect(
        computeTermCountFromInstallment({
          principalCents: 100000,
          rateType: 'PERIODIC',
          interestRateValue: 0,
          paymentFrequency: 'MONTHLY',
          installmentCents: 30000,
        })
      ).toBe(4); // 3.33 → 4
    });

    it('deriva el número de cuotas correcto con interés y redondea hacia arriba', () => {
      expect(
        computeTermCountFromInstallment({
          principalCents: 100000,
          rateType: 'PERIODIC',
          interestRateValue: 1,
          paymentFrequency: 'MONTHLY',
          installmentCents: 8885,
        })
      ).toBe(12);

      // ln(1.2)/ln(1.01) ≈ 18.32 → 19.
      expect(
        computeTermCountFromInstallment({
          principalCents: 100000,
          rateType: 'PERIODIC',
          interestRateValue: 1,
          paymentFrequency: 'MONTHLY',
          installmentCents: 6000,
        })
      ).toBe(19);
    });

    it('lanza error cuando la cuota no cubre el interés periódico', () => {
      expect(() =>
        computeTermCountFromInstallment({
          principalCents: 100000,
          rateType: 'PERIODIC',
          interestRateValue: 1,
          paymentFrequency: 'MONTHLY',
          installmentCents: 1000,
        })
      ).toThrow(LoanScheduleValidationError);
    });

    it('lanza error con principal o cuota no positivos', () => {
      expect(() =>
        computeTermCountFromInstallment({
          principalCents: 0,
          rateType: 'PERIODIC',
          interestRateValue: 0,
          paymentFrequency: 'MONTHLY',
          installmentCents: 1000,
        })
      ).toThrow(LoanScheduleValidationError);

      expect(() =>
        computeTermCountFromInstallment({
          principalCents: 100000,
          rateType: 'PERIODIC',
          interestRateValue: 0,
          paymentFrequency: 'MONTHLY',
          installmentCents: 0,
        })
      ).toThrow(LoanScheduleValidationError);
    });
  });
});
