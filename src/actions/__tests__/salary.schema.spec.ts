/**
 * Salary & projection validation schema tests (`src/actions/salary.schema.ts`).
 *
 * Rule 5 (server-side validation): every Server Action re-validates here. These
 * lock the cross-field `payDays` contract per frequency (the core of the new
 * recurrence model), the safe-cents bounds, the bonus shape and the COP-only
 * projection settings.
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_SALARY_BONUSES,
  ProjectionSettingsSchema,
  SalaryBonusSchema,
  SalaryConfigurationSchema,
  SaveSalaryConfigurationSchema,
} from '../salary.schema';
import { MAX_SAFE_CENTS } from '@/lib/validations/finance';

const VALID_CUID = 'clh' + 'a'.repeat(20);

function salaryInput(overrides: Record<string, unknown> = {}) {
  return {
    amountCents: 3_000_000,
    currency: 'COP',
    frequency: 'MONTHLY',
    payDays: [30],
    ...overrides,
  };
}

function bonusInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Prima de servicios',
    amountCents: 1_000_000,
    currency: 'COP',
    frequency: 'ANNUAL',
    anchorMonth: 12,
    dayOfMonth: 20,
    ...overrides,
  };
}

describe('SalaryConfigurationSchema', () => {
  it('accepts a valid MONTHLY configuration and applies the defaults', () => {
    const result = SalaryConfigurationSchema.parse({
      amountCents: 3_000_000,
      payDays: [30],
    });

    expect(result.currency).toBe('COP');
    expect(result.frequency).toBe('MONTHLY');
    expect(result.payDays).toEqual([30]);
  });

  describe('amountCents bounds (Rule 2)', () => {
    it('rejects zero, negative and non-integer amounts', () => {
      expect(() => SalaryConfigurationSchema.parse(salaryInput({ amountCents: 0 }))).toThrow();
      expect(() => SalaryConfigurationSchema.parse(salaryInput({ amountCents: -1 }))).toThrow();
      expect(() => SalaryConfigurationSchema.parse(salaryInput({ amountCents: 1.5 }))).toThrow();
    });

    it('rejects an amount above MAX_SAFE_CENTS', () => {
      expect(() =>
        SalaryConfigurationSchema.parse(salaryInput({ amountCents: MAX_SAFE_CENTS + 1 }))
      ).toThrow();
    });
  });

  describe('payDays per frequency', () => {
    it('requires exactly one ISO weekday (1..7) for WEEKLY', () => {
      expect(
        SalaryConfigurationSchema.parse(salaryInput({ frequency: 'WEEKLY', payDays: [5] })).payDays
      ).toEqual([5]);

      expect(() =>
        SalaryConfigurationSchema.parse(salaryInput({ frequency: 'WEEKLY', payDays: [1, 2] }))
      ).toThrow(/semanal.*exactamente 1/i);
      // 8 passes the generic 1..31 bound but is an invalid ISO weekday.
      expect(() =>
        SalaryConfigurationSchema.parse(salaryInput({ frequency: 'WEEKLY', payDays: [8] }))
      ).toThrow(/lunes.*domingo/i);
      expect(() =>
        SalaryConfigurationSchema.parse(salaryInput({ frequency: 'WEEKLY', payDays: [0] }))
      ).toThrow();
    });

    it('requires exactly two days of the month (1..31) for BIWEEKLY', () => {
      expect(
        SalaryConfigurationSchema.parse(salaryInput({ frequency: 'BIWEEKLY', payDays: [15, 30] }))
          .payDays
      ).toEqual([15, 30]);

      expect(() =>
        SalaryConfigurationSchema.parse(salaryInput({ frequency: 'BIWEEKLY', payDays: [15] }))
      ).toThrow(/quincenal.*exactamente 2/i);
    });

    it('requires exactly one day of the month (1..31) for MONTHLY', () => {
      expect(() =>
        SalaryConfigurationSchema.parse(salaryInput({ frequency: 'MONTHLY', payDays: [15, 30] }))
      ).toThrow(/mensual.*exactamente 1/i);
    });

    it('rejects an empty payDays and more than two entries', () => {
      expect(() => SalaryConfigurationSchema.parse(salaryInput({ payDays: [] }))).toThrow();
      expect(() => SalaryConfigurationSchema.parse(salaryInput({ payDays: [1, 2, 3] }))).toThrow();
    });

    it('rejects days outside 1..31', () => {
      expect(() => SalaryConfigurationSchema.parse(salaryInput({ payDays: [32] }))).toThrow();
    });
  });
});

describe('SalaryBonusSchema', () => {
  it('accepts a complete bonus with a valid id and a null day', () => {
    const result = SalaryBonusSchema.parse(bonusInput({ id: VALID_CUID, dayOfMonth: null }));

    expect(result.id).toBe(VALID_CUID);
    expect(result.dayOfMonth).toBeNull();
  });

  it('accepts an omitted day and trims the name', () => {
    const result = SalaryBonusSchema.parse(
      bonusInput({ name: '  Prima  ', dayOfMonth: undefined })
    );

    expect(result.name).toBe('Prima');
    expect(result.dayOfMonth).toBeUndefined();
  });

  it('rejects a blank name, an invalid amount and an out-of-range anchor month', () => {
    expect(() => SalaryBonusSchema.parse(bonusInput({ name: '' }))).toThrow();
    expect(() => SalaryBonusSchema.parse(bonusInput({ amountCents: 0 }))).toThrow();
    expect(() => SalaryBonusSchema.parse(bonusInput({ anchorMonth: 0 }))).toThrow();
    expect(() => SalaryBonusSchema.parse(bonusInput({ anchorMonth: 13 }))).toThrow();
  });

  it('rejects a non-CUID id', () => {
    expect(() => SalaryBonusSchema.parse(bonusInput({ id: 'not-a-cuid' }))).toThrow();
  });
});

describe('SaveSalaryConfigurationSchema', () => {
  it('defaults bonuses to an empty array', () => {
    const result = SaveSalaryConfigurationSchema.parse(salaryInput());

    expect(result.bonuses).toEqual([]);
  });

  it('accepts a full payload with bonuses', () => {
    const result = SaveSalaryConfigurationSchema.parse({
      ...salaryInput(),
      bonuses: [bonusInput(), bonusInput({ name: 'Bono' })],
    });

    expect(result.bonuses).toHaveLength(2);
  });

  it('rejects more than MAX_SALARY_BONUSES bonuses', () => {
    const bonuses = Array.from({ length: MAX_SALARY_BONUSES + 1 }, (_, index) =>
      bonusInput({ name: `Prima ${index}` })
    );

    expect(() => SaveSalaryConfigurationSchema.parse({ ...salaryInput(), bonuses })).toThrow();
  });
});

describe('ProjectionSettingsSchema', () => {
  it('accepts a monthly COP target (zero allowed) and defaults the currency', () => {
    const zero = ProjectionSettingsSchema.parse({ monthlySavingsTargetCents: 0 });
    expect(zero).toEqual({ monthlySavingsTargetCents: 0, currency: 'COP' });

    expect(ProjectionSettingsSchema.parse({ monthlySavingsTargetCents: 500_000 })).toMatchObject({
      monthlySavingsTargetCents: 500_000,
      currency: 'COP',
    });
  });

  it('rejects a negative, fractional or overflowing target', () => {
    expect(() => ProjectionSettingsSchema.parse({ monthlySavingsTargetCents: -1 })).toThrow();
    expect(() => ProjectionSettingsSchema.parse({ monthlySavingsTargetCents: 10.5 })).toThrow();
    expect(() =>
      ProjectionSettingsSchema.parse({ monthlySavingsTargetCents: MAX_SAFE_CENTS + 1 })
    ).toThrow();
  });

  it('forces the currency to COP (the projection is COP-only)', () => {
    expect(() =>
      ProjectionSettingsSchema.parse({ monthlySavingsTargetCents: 1000, currency: 'USD' })
    ).toThrow();
  });
});
