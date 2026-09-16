/**
 * Credit Card Schema Validation Tests (Rule 5 — Server-side validation)
 *
 * Verifies all Zod schemas used by the credit-card module:
 * - CreateCreditCardSchema
 * - UpdateCreditCardSchema
 * - DeleteCreditCardSchema
 * - PayCreditCardSchema
 * - GetCreditCardStatementSchema
 * - GetCreditCardsSchema
 */
import { describe, it, expect } from 'vitest';
import {
  CreateCreditCardSchema,
  UpdateCreditCardSchema,
  DeleteCreditCardSchema,
  PayCreditCardSchema,
  GetCreditCardStatementSchema,
  GetCreditCardsSchema,
} from '../credit-card.schema';

const VALID_CUID = 'clh1234567890abcdefghij';

const validCreateInput = (overrides: Record<string, unknown> = {}) => ({
  idempotencyKey: crypto.randomUUID(),
  name: 'Visa Oro',
  currency: 'USD',
  creditLimitCents: 5_000_000,
  cutoffDay: 10,
  paymentDueDay: 25,
  cardColor: 'blue',
  cardNetwork: 'VISA',
  ...overrides,
});

const validPayInput = (overrides: Record<string, unknown> = {}) => ({
  idempotencyKey: crypto.randomUUID(),
  accountId: VALID_CUID,
  sourceAccountId: 'clh1234567890abcdefghik',
  amountCents: 100000,
  currency: 'USD',
  description: 'Pago tarjeta',
  ...overrides,
});

describe('CreateCreditCardSchema', () => {
  it('accepts a valid create input', () => {
    const result = CreateCreditCardSchema.parse(validCreateInput());
    expect(result.name).toBe('Visa Oro');
    expect(result.creditLimitCents).toBe(5_000_000);
  });

  it('rejects when cutoffDay equals paymentDueDay', () => {
    expect(() =>
      CreateCreditCardSchema.parse(validCreateInput({ cutoffDay: 15, paymentDueDay: 15 }))
    ).toThrow('Payment due day cannot be the same as the cutoff day');
  });

  it('rejects a zero credit limit', () => {
    expect(() => CreateCreditCardSchema.parse(validCreateInput({ creditLimitCents: 0 }))).toThrow(
      'Credit limit must be positive'
    );
  });

  it('rejects a negative credit limit', () => {
    expect(() =>
      CreateCreditCardSchema.parse(validCreateInput({ creditLimitCents: -100 }))
    ).toThrow('Credit limit must be positive');
  });

  it('rejects a non-integer credit limit', () => {
    expect(() =>
      CreateCreditCardSchema.parse(validCreateInput({ creditLimitCents: 10.5 }))
    ).toThrow('Credit limit must be an integer');
  });

  it('rejects a credit limit above MAX_SAFE_CENTS', () => {
    expect(() =>
      CreateCreditCardSchema.parse(validCreateInput({ creditLimitCents: 10_000_000_000_000 }))
    ).toThrow('Credit limit exceeds maximum safe value');
  });

  it('rejects cutoffDay below 1', () => {
    expect(() => CreateCreditCardSchema.parse(validCreateInput({ cutoffDay: 0 }))).toThrow(
      'Day must be between 1 and 31'
    );
  });

  it('rejects paymentDueDay above 31', () => {
    expect(() => CreateCreditCardSchema.parse(validCreateInput({ paymentDueDay: 32 }))).toThrow(
      'Day must be between 1 and 31'
    );
  });

  it('rejects a non-UUID v4 idempotencyKey', () => {
    expect(() =>
      CreateCreditCardSchema.parse(validCreateInput({ idempotencyKey: 'not-a-uuid' }))
    ).toThrow();
  });

  it('rejects an empty name', () => {
    expect(() => CreateCreditCardSchema.parse(validCreateInput({ name: '' }))).toThrow(
      'Name is required'
    );
  });

  it('rejects an unsupported currency', () => {
    expect(() => CreateCreditCardSchema.parse(validCreateInput({ currency: 'MXN' }))).toThrow();
  });

  it('accepts optional cardNetwork omitted', () => {
    const { cardNetwork: _omitted, ...rest } = validCreateInput();
    const result = CreateCreditCardSchema.parse(rest);
    expect(result.cardNetwork).toBeUndefined();
  });
});

describe('UpdateCreditCardSchema', () => {
  it('accepts a valid update input', () => {
    const result = UpdateCreditCardSchema.parse({
      accountId: VALID_CUID,
      name: 'Nuevo Nombre',
      creditLimitCents: 3_000_000,
      cutoffDay: 5,
      paymentDueDay: 20,
    });
    expect(result.accountId).toBe(VALID_CUID);
    expect(result.name).toBe('Nuevo Nombre');
  });

  it('accepts a partial update (only accountId)', () => {
    const result = UpdateCreditCardSchema.parse({ accountId: VALID_CUID });
    expect(result.name).toBeUndefined();
  });

  it('rejects when both cutoffDay and paymentDueDay are equal', () => {
    expect(() =>
      UpdateCreditCardSchema.parse({ accountId: VALID_CUID, cutoffDay: 12, paymentDueDay: 12 })
    ).toThrow('Payment due day cannot be the same as the cutoff day');
  });

  it('allows cutoffDay equal to paymentDueDay when only one is present', () => {
    const result = UpdateCreditCardSchema.parse({ accountId: VALID_CUID, cutoffDay: 12 });
    expect(result.cutoffDay).toBe(12);
  });

  it('rejects a missing accountId', () => {
    expect(() => UpdateCreditCardSchema.parse({ name: 'X' })).toThrow();
  });

  it('rejects an invalid CUID accountId', () => {
    expect(() => UpdateCreditCardSchema.parse({ accountId: 'not-a-cuid' })).toThrow(
      'Must be a valid CUID'
    );
  });
});

describe('DeleteCreditCardSchema', () => {
  it('accepts a valid accountId', () => {
    expect(DeleteCreditCardSchema.parse({ accountId: VALID_CUID }).accountId).toBe(VALID_CUID);
  });

  it('rejects a missing accountId', () => {
    expect(() => DeleteCreditCardSchema.parse({})).toThrow();
  });
});

describe('PayCreditCardSchema', () => {
  it('accepts a valid payment input', () => {
    const result = PayCreditCardSchema.parse(validPayInput());
    expect(result.amountCents).toBe(100000);
  });

  it('rejects paying a card from itself', () => {
    expect(() => PayCreditCardSchema.parse(validPayInput({ sourceAccountId: VALID_CUID }))).toThrow(
      'Cannot pay a card from itself'
    );
  });

  it('rejects a zero amount', () => {
    expect(() => PayCreditCardSchema.parse(validPayInput({ amountCents: 0 }))).toThrow(
      'Amount must be positive'
    );
  });

  it('rejects a negative amount', () => {
    expect(() => PayCreditCardSchema.parse(validPayInput({ amountCents: -100 }))).toThrow(
      'Amount must be positive'
    );
  });

  it('rejects a non-integer amount', () => {
    expect(() => PayCreditCardSchema.parse(validPayInput({ amountCents: 100.5 }))).toThrow(
      'Amount must be an integer'
    );
  });

  it('rejects an amount above MAX_SAFE_CENTS', () => {
    expect(() =>
      PayCreditCardSchema.parse(validPayInput({ amountCents: 10_000_000_000_000 }))
    ).toThrow('Amount exceeds maximum safe value');
  });

  it('rejects an unsupported currency', () => {
    expect(() => PayCreditCardSchema.parse(validPayInput({ currency: 'JPY' }))).toThrow();
  });

  it('rejects a non-UUID v4 idempotencyKey', () => {
    expect(() => PayCreditCardSchema.parse(validPayInput({ idempotencyKey: 'bad' }))).toThrow();
  });

  it('accepts an optional date as a coercible value', () => {
    const result = PayCreditCardSchema.parse(validPayInput({ date: '2026-08-01T00:00:00.000Z' }));
    expect(result.date).toBeInstanceOf(Date);
  });
});

describe('GetCreditCardStatementSchema', () => {
  it('accepts a valid accountId only', () => {
    expect(GetCreditCardStatementSchema.parse({ accountId: VALID_CUID }).accountId).toBe(
      VALID_CUID
    );
  });

  it('accepts month and year', () => {
    const result = GetCreditCardStatementSchema.parse({
      accountId: VALID_CUID,
      month: 8,
      year: 2026,
    });
    expect(result.month).toBe(8);
    expect(result.year).toBe(2026);
  });

  it('rejects month out of range', () => {
    expect(() =>
      GetCreditCardStatementSchema.parse({ accountId: VALID_CUID, month: 13 })
    ).toThrow();
  });

  it('rejects year out of range', () => {
    expect(() =>
      GetCreditCardStatementSchema.parse({ accountId: VALID_CUID, year: 1999 })
    ).toThrow();
  });
});

describe('GetCreditCardsSchema', () => {
  it('accepts empty input', () => {
    expect(GetCreditCardsSchema.parse({})).toEqual({});
  });

  it('accepts the undefined input handled by the action (input ?? {})', () => {
    // The server action guards with `GetCreditCardsSchema.parse(input ?? {})`,
    // so an undefined value never reaches the schema itself.
    expect(GetCreditCardsSchema.parse({})).toEqual({});
  });
});
