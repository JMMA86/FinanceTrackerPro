/**
 * Fixed Expenses Schemas Unit Tests
 *
 * Covers the Zod contract of src/actions/fixed-expense.schema.ts: required
 * fields, defaults, monetary bounds (Rule 2 / overflow), the endDate > startDate
 * refinement and the UUID v4 idempotency key (Rule 12).
 */
import { describe, it, expect } from 'vitest';
import { MAX_SAFE_CENTS } from '@/lib/validations/finance';
import {
  CreateFixedExpenseSchema,
  UpdateFixedExpenseSchema,
  DeleteFixedExpenseSchema,
  GetFixedExpensesSchema,
  GetFixedExpensePaymentsSchema,
  GetFixedExpensesSummarySchema,
  PayFixedExpenseSchema,
  FixedExpenseFrequencySchema,
} from '../fixed-expense.schema';

const VALID_CUID = 'clh1234567890abcdefghij';
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

// ============================================================================
// FixedExpenseFrequencySchema
// ============================================================================
describe('FixedExpenseFrequencySchema', () => {
  it.each(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'])(
    'accepts the %s frequency',
    (frequency) => {
      expect(FixedExpenseFrequencySchema.parse(frequency)).toBe(frequency);
    }
  );

  it('rejects an unknown frequency', () => {
    expect(() => FixedExpenseFrequencySchema.parse('HOURLY')).toThrow();
  });
});

// ============================================================================
// CreateFixedExpenseSchema
// ============================================================================
describe('CreateFixedExpenseSchema', () => {
  const startDate = new Date('2026-01-10T00:00:00.000Z');
  const validInput = {
    name: 'Arriendo',
    amountCents: 1500000,
    frequency: 'MONTHLY' as const,
    startDate,
  };

  it('accepts the minimum required fields and applies currency default COP', () => {
    const result = CreateFixedExpenseSchema.parse(validInput);
    expect(result.name).toBe('Arriendo');
    expect(result.amountCents).toBe(1500000);
    expect(result.frequency).toBe('MONTHLY');
    expect(result.currency).toBe('COP'); // default
  });

  it('accepts all optional fields', () => {
    const result = CreateFixedExpenseSchema.parse({
      ...validInput,
      description: 'Pago mensual del apartamento',
      currency: 'USD',
      dayOfPayment: 31,
      endDate: new Date('2027-01-10T00:00:00.000Z'),
      color: '#f59e0b',
      icon: 'home',
    });
    expect(result.description).toBe('Pago mensual del apartamento');
    expect(result.currency).toBe('USD');
    expect(result.dayOfPayment).toBe(31);
    expect(result.color).toBe('#f59e0b');
    expect(result.icon).toBe('home');
  });

  it('coerces ISO string dates', () => {
    const result = CreateFixedExpenseSchema.parse({
      ...validInput,
      startDate: '2026-03-01T00:00:00.000Z',
    });
    expect(result.startDate).toBeInstanceOf(Date);
  });

  it('rejects a missing name', () => {
    const { name: _name, ...withoutName } = validInput;
    expect(() => CreateFixedExpenseSchema.parse(withoutName)).toThrow();
  });

  it('rejects an empty name', () => {
    expect(() => CreateFixedExpenseSchema.parse({ ...validInput, name: '' })).toThrow(
      'Name is required'
    );
  });

  it('trims whitespace from the name', () => {
    const result = CreateFixedExpenseSchema.parse({ ...validInput, name: '  Arriendo  ' });
    expect(result.name).toBe('Arriendo');
  });

  it('rejects a name longer than 100 characters', () => {
    expect(() => CreateFixedExpenseSchema.parse({ ...validInput, name: 'x'.repeat(101) })).toThrow(
      'Name too long'
    );
  });

  it('rejects a missing frequency', () => {
    const { frequency: _frequency, ...withoutFrequency } = validInput;
    expect(() => CreateFixedExpenseSchema.parse(withoutFrequency)).toThrow();
  });

  it('rejects an invalid frequency', () => {
    expect(() => CreateFixedExpenseSchema.parse({ ...validInput, frequency: 'HOURLY' })).toThrow();
  });

  it('rejects a missing startDate', () => {
    const { startDate: _startDate, ...withoutStart } = validInput;
    expect(() => CreateFixedExpenseSchema.parse(withoutStart)).toThrow();
  });

  it('rejects zero amountCents', () => {
    expect(() => CreateFixedExpenseSchema.parse({ ...validInput, amountCents: 0 })).toThrow(
      'Amount must be positive'
    );
  });

  it('rejects negative amountCents', () => {
    expect(() => CreateFixedExpenseSchema.parse({ ...validInput, amountCents: -100 })).toThrow(
      'Amount must be positive'
    );
  });

  it('rejects a non-integer amountCents', () => {
    expect(() => CreateFixedExpenseSchema.parse({ ...validInput, amountCents: 100.5 })).toThrow(
      'Amount must be an integer'
    );
  });

  it('rejects amountCents above MAX_SAFE_CENTS', () => {
    expect(() =>
      CreateFixedExpenseSchema.parse({ ...validInput, amountCents: MAX_SAFE_CENTS + 1 })
    ).toThrow('Amount exceeds maximum safe value');
  });

  it('accepts amountCents equal to MAX_SAFE_CENTS (boundary)', () => {
    expect(
      CreateFixedExpenseSchema.parse({ ...validInput, amountCents: MAX_SAFE_CENTS }).amountCents
    ).toBe(MAX_SAFE_CENTS);
  });

  it('rejects an invalid currency', () => {
    expect(() => CreateFixedExpenseSchema.parse({ ...validInput, currency: 'GBP' })).toThrow();
  });

  it('rejects dayOfPayment below 1 and above 31', () => {
    expect(() => CreateFixedExpenseSchema.parse({ ...validInput, dayOfPayment: 0 })).toThrow();
    expect(() => CreateFixedExpenseSchema.parse({ ...validInput, dayOfPayment: 32 })).toThrow();
  });

  it('accepts an endDate strictly after startDate', () => {
    const result = CreateFixedExpenseSchema.parse({
      ...validInput,
      endDate: new Date('2026-02-10T00:00:00.000Z'),
    });
    expect(result.endDate).toBeInstanceOf(Date);
  });

  it('rejects an endDate equal to startDate', () => {
    expect(() =>
      CreateFixedExpenseSchema.parse({ ...validInput, endDate: new Date(startDate) })
    ).toThrow('End date must be after start date');
  });

  it('rejects an endDate before startDate', () => {
    expect(() =>
      CreateFixedExpenseSchema.parse({
        ...validInput,
        endDate: new Date('2025-12-31T00:00:00.000Z'),
      })
    ).toThrow('End date must be after start date');
  });
});

// ============================================================================
// UpdateFixedExpenseSchema
// ============================================================================
describe('UpdateFixedExpenseSchema', () => {
  const validInput = { fixedExpenseId: VALID_CUID };

  it('accepts only the id (every field is optional)', () => {
    const result = UpdateFixedExpenseSchema.parse(validInput);
    expect(result.fixedExpenseId).toBe(VALID_CUID);
    expect(result.name).toBeUndefined();
    expect(result.endDate).toBeUndefined();
  });

  it('rejects a missing id', () => {
    expect(() => UpdateFixedExpenseSchema.parse({})).toThrow();
  });

  it('rejects an invalid CUID id', () => {
    expect(() => UpdateFixedExpenseSchema.parse({ fixedExpenseId: 'not-a-cuid' })).toThrow(
      'Must be a valid CUID'
    );
  });

  it('accepts endDate null to clear the end date', () => {
    const result = UpdateFixedExpenseSchema.parse({ ...validInput, endDate: null });
    expect(result.endDate).toBeNull();
  });

  it('accepts an endDate strictly after startDate when both are provided', () => {
    const result = UpdateFixedExpenseSchema.parse({
      ...validInput,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-06-01T00:00:00.000Z'),
    });
    expect(result.endDate).toBeInstanceOf(Date);
  });

  it('rejects an endDate before startDate when both are provided', () => {
    expect(() =>
      UpdateFixedExpenseSchema.parse({
        ...validInput,
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        endDate: new Date('2026-01-01T00:00:00.000Z'),
      })
    ).toThrow('End date must be after start date');
  });

  it('rejects an endDate equal to startDate when both are provided', () => {
    const same = new Date('2026-01-01T00:00:00.000Z');
    expect(() =>
      UpdateFixedExpenseSchema.parse({ ...validInput, startDate: same, endDate: new Date(same) })
    ).toThrow('End date must be after start date');
  });

  it('only validates endDate when startDate is also provided', () => {
    // Only endDate in the past: the schema has no reference startDate, so it is
    // accepted here and validated server-side against the stored startDate.
    const result = UpdateFixedExpenseSchema.parse({
      ...validInput,
      endDate: new Date('2000-01-01T00:00:00.000Z'),
    });
    expect(result.endDate).toBeInstanceOf(Date);
  });

  it('rejects an empty name when provided', () => {
    expect(() => UpdateFixedExpenseSchema.parse({ ...validInput, name: '' })).toThrow(
      'Name is required'
    );
  });

  it('rejects zero or negative amountCents when provided', () => {
    expect(() => UpdateFixedExpenseSchema.parse({ ...validInput, amountCents: 0 })).toThrow(
      'Amount must be positive'
    );
    expect(() => UpdateFixedExpenseSchema.parse({ ...validInput, amountCents: -1 })).toThrow(
      'Amount must be positive'
    );
  });

  it('rejects amountCents above MAX_SAFE_CENTS', () => {
    expect(() =>
      UpdateFixedExpenseSchema.parse({ ...validInput, amountCents: MAX_SAFE_CENTS + 1 })
    ).toThrow();
  });

  it('rejects an invalid frequency when provided', () => {
    expect(() => UpdateFixedExpenseSchema.parse({ ...validInput, frequency: 'HOURLY' })).toThrow();
  });
});

// ============================================================================
// PayFixedExpenseSchema
// ============================================================================
describe('PayFixedExpenseSchema', () => {
  const validInput = {
    paymentId: VALID_CUID,
    accountId: VALID_CUID,
    idempotencyKey: VALID_UUID,
  };

  it('accepts valid input with amountCents optional', () => {
    const result = PayFixedExpenseSchema.parse(validInput);
    expect(result.paymentId).toBe(VALID_CUID);
    expect(result.accountId).toBe(VALID_CUID);
    expect(result.amountCents).toBeUndefined();
    expect(result.idempotencyKey).toBe(VALID_UUID);
  });

  it('accepts an amount override and optional metadata', () => {
    const result = PayFixedExpenseSchema.parse({
      ...validInput,
      amountCents: 25000,
      notes: 'Pagado con descuento',
      date: '2026-09-13T00:00:00.000Z',
    });
    expect(result.amountCents).toBe(25000);
    expect(result.notes).toBe('Pagado con descuento');
    expect(result.date).toBeInstanceOf(Date);
  });

  it('rejects an invalid paymentId CUID', () => {
    expect(() => PayFixedExpenseSchema.parse({ ...validInput, paymentId: 'bad' })).toThrow(
      'Must be a valid CUID'
    );
  });

  it('rejects an invalid accountId CUID', () => {
    expect(() => PayFixedExpenseSchema.parse({ ...validInput, accountId: 'bad' })).toThrow(
      'Must be a valid CUID'
    );
  });

  it('rejects zero amountCents when provided', () => {
    expect(() => PayFixedExpenseSchema.parse({ ...validInput, amountCents: 0 })).toThrow(
      'Amount must be positive'
    );
  });

  it('rejects negative amountCents when provided', () => {
    expect(() => PayFixedExpenseSchema.parse({ ...validInput, amountCents: -100 })).toThrow(
      'Amount must be positive'
    );
  });

  it('rejects amountCents above MAX_SAFE_CENTS', () => {
    expect(() =>
      PayFixedExpenseSchema.parse({ ...validInput, amountCents: MAX_SAFE_CENTS + 1 })
    ).toThrow();
  });

  it('rejects a non-v4 UUID idempotencyKey', () => {
    // Version nibble is 1 (v1) and the variant nibble is invalid.
    expect(() =>
      PayFixedExpenseSchema.parse({
        ...validInput,
        idempotencyKey: '550e8400-e29b-11d4-a716-446655440000',
      })
    ).toThrow('Must be a valid UUID v4');
  });

  it('rejects a non-UUID idempotencyKey', () => {
    expect(() =>
      PayFixedExpenseSchema.parse({ ...validInput, idempotencyKey: 'not-a-uuid' })
    ).toThrow('Must be a valid UUID v4');
  });

  it('rejects a missing idempotencyKey', () => {
    const { idempotencyKey: _key, ...withoutKey } = validInput;
    expect(() => PayFixedExpenseSchema.parse(withoutKey)).toThrow();
  });

  it('rejects notes longer than 500 characters', () => {
    expect(() => PayFixedExpenseSchema.parse({ ...validInput, notes: 'x'.repeat(501) })).toThrow();
  });
});

// ============================================================================
// Delete / Get schemas
// ============================================================================
describe('DeleteFixedExpenseSchema', () => {
  it('accepts a valid CUID', () => {
    expect(DeleteFixedExpenseSchema.parse({ fixedExpenseId: VALID_CUID }).fixedExpenseId).toBe(
      VALID_CUID
    );
  });

  it('rejects an invalid CUID', () => {
    expect(() => DeleteFixedExpenseSchema.parse({ fixedExpenseId: 'nope' })).toThrow(
      'Must be a valid CUID'
    );
  });
});

describe('GetFixedExpensesSchema', () => {
  it('accepts an empty object and a boolean includeInactive', () => {
    expect(GetFixedExpensesSchema.parse({}).includeInactive).toBeUndefined();
    expect(GetFixedExpensesSchema.parse({ includeInactive: true }).includeInactive).toBe(true);
  });
});

describe('GetFixedExpensePaymentsSchema', () => {
  it('accepts an empty object', () => {
    const result = GetFixedExpensePaymentsSchema.parse({});
    expect(result.fixedExpenseId).toBeUndefined();
    expect(result.month).toBeUndefined();
    expect(result.year).toBeUndefined();
  });

  it('accepts a valid month/year and CUID', () => {
    const result = GetFixedExpensePaymentsSchema.parse({
      fixedExpenseId: VALID_CUID,
      month: 12,
      year: 2100,
    });
    expect(result.month).toBe(12);
    expect(result.year).toBe(2100);
  });

  it('rejects out-of-range month/year', () => {
    expect(() => GetFixedExpensePaymentsSchema.parse({ month: 0 })).toThrow();
    expect(() => GetFixedExpensePaymentsSchema.parse({ month: 13 })).toThrow();
    expect(() => GetFixedExpensePaymentsSchema.parse({ year: 1999 })).toThrow();
    expect(() => GetFixedExpensePaymentsSchema.parse({ year: 2101 })).toThrow();
  });
});

describe('GetFixedExpensesSummarySchema', () => {
  it('accepts an empty object (current month)', () => {
    expect(GetFixedExpensesSummarySchema.parse({})).toEqual({});
  });

  it('rejects a month greater than 12', () => {
    expect(() => GetFixedExpensesSummarySchema.parse({ month: 13 })).toThrow();
  });
});
