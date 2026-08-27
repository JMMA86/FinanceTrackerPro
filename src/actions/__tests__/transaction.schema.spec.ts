/**
 * Transaction Schemas Unit Tests
 * Tests validation rules for GetAllTransactionsSchema,
 * CreateTransactionActionSchema, DeleteTransactionSchema,
 * and GetTransactionByIdSchema
 */

import { describe, it, expect } from 'vitest';
import {
  GetAllTransactionsSchema,
  CreateTransactionActionSchema,
  DeleteTransactionSchema,
  GetTransactionByIdSchema,
} from '../transaction.schema';

// ============================================================================
// Helpers
// ============================================================================

const VALID_CUID = 'clh1234567890abcdefghij';
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

// ============================================================================
// GetAllTransactionsSchema
// ============================================================================

describe('GetAllTransactionsSchema', () => {
  it('should accept valid input with default page and pageSize', () => {
    const result = GetAllTransactionsSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    expect(result.search).toBeUndefined();
    expect(result.typeFilter).toBeUndefined();
  });

  it('should accept explicit page and pageSize', () => {
    const result = GetAllTransactionsSchema.parse({ page: 3, pageSize: 25 });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(25);
  });

  it('should reject page < 1', () => {
    expect(() => GetAllTransactionsSchema.parse({ page: 0 })).toThrow();
    expect(() => GetAllTransactionsSchema.parse({ page: -1 })).toThrow();
  });

  it('should reject pageSize > 100', () => {
    expect(() => GetAllTransactionsSchema.parse({ pageSize: 101 })).toThrow();
  });

  it('should reject pageSize < 1', () => {
    expect(() => GetAllTransactionsSchema.parse({ pageSize: 0 })).toThrow();
  });

  it('should accept search string within max length', () => {
    const result = GetAllTransactionsSchema.parse({ search: 'groceries' });
    expect(result.search).toBe('groceries');
  });

  it('should reject search exceeding 100 characters', () => {
    expect(() => GetAllTransactionsSchema.parse({ search: 'x'.repeat(101) })).toThrow();
  });

  it('should accept valid typeFilter', () => {
    const result = GetAllTransactionsSchema.parse({ typeFilter: 'INCOME' });
    expect(result.typeFilter).toBe('INCOME');
  });

  it('should reject invalid typeFilter', () => {
    expect(() => GetAllTransactionsSchema.parse({ typeFilter: 'INVALID_TYPE' })).toThrow();
  });

  it('should accept dateFrom as string (coerced)', () => {
    const result = GetAllTransactionsSchema.parse({
      dateFrom: '2024-01-01T00:00:00.000Z',
    });
    expect(result.dateFrom).toBeInstanceOf(Date);
  });

  it('should accept dateTo as string (coerced)', () => {
    const result = GetAllTransactionsSchema.parse({
      dateTo: '2024-12-31T23:59:59.000Z',
    });
    expect(result.dateTo).toBeInstanceOf(Date);
  });

  it('should accept optional accountId', () => {
    const result = GetAllTransactionsSchema.parse({ accountId: VALID_CUID });
    expect(result.accountId).toBe(VALID_CUID);
  });

  it('should reject invalid accountId CUID', () => {
    expect(() => GetAllTransactionsSchema.parse({ accountId: 'not-a-cuid' })).toThrow();
  });

  it('should combine page and pageSize with all filters', () => {
    const result = GetAllTransactionsSchema.parse({
      page: 2,
      pageSize: 20,
      search: 'food',
      typeFilter: 'EXPENSE',
      dateFrom: '2024-06-01T00:00:00.000Z',
      dateTo: '2024-06-30T23:59:59.000Z',
    });
    expect(result.page).toBe(2);
    expect(result.search).toBe('food');
    expect(result.typeFilter).toBe('EXPENSE');
    expect(result.dateFrom).toBeInstanceOf(Date);
    expect(result.dateTo).toBeInstanceOf(Date);
  });
});

// ============================================================================
// CreateTransactionActionSchema
// ============================================================================

describe('CreateTransactionActionSchema', () => {
  const validBase = {
    idempotencyKey: VALID_UUID,
    accountId: VALID_CUID,
    currency: 'USD',
    description: 'Test transaction',
    date: new Date('2024-01-15'),
  };

  it('should accept INCOME with positive amountCents', () => {
    const result = CreateTransactionActionSchema.parse({
      ...validBase,
      type: 'INCOME',
      amountCents: 50000,
    });
    expect(result.type).toBe('INCOME');
    expect(result.amountCents).toBe(50000);
  });

  it('should accept EXPENSE with negative amountCents', () => {
    const result = CreateTransactionActionSchema.parse({
      ...validBase,
      type: 'EXPENSE',
      amountCents: -25000,
    });
    expect(result.type).toBe('EXPENSE');
    expect(result.amountCents).toBe(-25000);
  });

  it('should reject INCOME with amountCents <= 0', () => {
    expect(() =>
      CreateTransactionActionSchema.parse({
        ...validBase,
        type: 'INCOME',
        amountCents: 0,
      })
    ).toThrow('Amount must be positive for INCOME and negative for EXPENSE');

    expect(() =>
      CreateTransactionActionSchema.parse({
        ...validBase,
        type: 'INCOME',
        amountCents: -100,
      })
    ).toThrow('Amount must be positive for INCOME and negative for EXPENSE');
  });

  it('should reject EXPENSE with amountCents >= 0', () => {
    expect(() =>
      CreateTransactionActionSchema.parse({
        ...validBase,
        type: 'EXPENSE',
        amountCents: 0,
      })
    ).toThrow('Amount must be positive for INCOME and negative for EXPENSE');

    expect(() =>
      CreateTransactionActionSchema.parse({
        ...validBase,
        type: 'EXPENSE',
        amountCents: 100,
      })
    ).toThrow('Amount must be positive for INCOME and negative for EXPENSE');
  });

  it('should reject types other than INCOME and EXPENSE', () => {
    expect(() =>
      CreateTransactionActionSchema.parse({
        ...validBase,
        type: 'TRANSFER_IN',
        amountCents: 50000,
      })
    ).toThrow('Only INCOME and EXPENSE transactions are allowed');

    expect(() =>
      CreateTransactionActionSchema.parse({
        ...validBase,
        type: 'TRANSFER_OUT',
        amountCents: -50000,
      })
    ).toThrow('Only INCOME and EXPENSE transactions are allowed');

    expect(() =>
      CreateTransactionActionSchema.parse({
        ...validBase,
        type: 'INVESTMENT',
        amountCents: -50000,
      })
    ).toThrow('Only INCOME and EXPENSE transactions are allowed');
  });

  it('should validate idempotencyKey as UUID v4', () => {
    expect(() =>
      CreateTransactionActionSchema.parse({
        ...validBase,
        idempotencyKey: 'not-a-uuid',
        type: 'INCOME',
        amountCents: 50000,
      })
    ).toThrow();
  });

  it('should reject missing required fields', () => {
    // Missing accountId
    expect(() =>
      CreateTransactionActionSchema.parse({
        idempotencyKey: VALID_UUID,
        type: 'INCOME',
        amountCents: 50000,
        currency: 'USD',
      })
    ).toThrow();

    // Missing idempotencyKey
    expect(() =>
      CreateTransactionActionSchema.parse({
        accountId: VALID_CUID,
        type: 'INCOME',
        amountCents: 50000,
        currency: 'USD',
      })
    ).toThrow();
  });

  it('should reject invalid currency', () => {
    expect(() =>
      CreateTransactionActionSchema.parse({
        ...validBase,
        type: 'INCOME',
        amountCents: 50000,
        currency: 'GBP',
      })
    ).toThrow();
  });

  it('should reject amountCents exceeding MAX_SAFE_CENTS', () => {
    expect(() =>
      CreateTransactionActionSchema.parse({
        ...validBase,
        type: 'INCOME',
        amountCents: 99999999999999, // Exceeds MAX_SAFE_CENTS
      })
    ).toThrow();
  });

  it('should accept optional description up to 500 characters', () => {
    const result = CreateTransactionActionSchema.parse({
      ...validBase,
      type: 'EXPENSE',
      amountCents: -1000,
      description: 'A'.repeat(500),
    });
    expect(result.description).toBe('A'.repeat(500));
  });

  it('should reject description exceeding 500 characters', () => {
    expect(() =>
      CreateTransactionActionSchema.parse({
        ...validBase,
        type: 'EXPENSE',
        amountCents: -1000,
        description: 'A'.repeat(501),
      })
    ).toThrow();
  });

  it('should accept optional originalAmountCents, originalCurrency, exchangeRate', () => {
    const result = CreateTransactionActionSchema.parse({
      ...validBase,
      type: 'INCOME',
      amountCents: 50000,
      originalAmountCents: 100000,
      originalCurrency: 'COP',
      exchangeRate: 0.5,
    });
    expect(result.originalAmountCents).toBe(100000);
    expect(result.originalCurrency).toBe('COP');
    expect(result.exchangeRate).toBe(0.5);
  });
});

// ============================================================================
// DeleteTransactionSchema
// ============================================================================

describe('DeleteTransactionSchema', () => {
  it('should accept valid CUID', () => {
    const result = DeleteTransactionSchema.parse({
      transactionId: VALID_CUID,
    });
    expect(result.transactionId).toBe(VALID_CUID);
  });

  it('should reject non-CUID string', () => {
    expect(() => DeleteTransactionSchema.parse({ transactionId: 'not-a-cuid' })).toThrow();

    expect(() => DeleteTransactionSchema.parse({ transactionId: '' })).toThrow();

    expect(() => DeleteTransactionSchema.parse({ transactionId: 'abc' })).toThrow();
  });

  it('should reject non-string input', () => {
    expect(() => DeleteTransactionSchema.parse({ transactionId: 12345 })).toThrow();
  });
});

// ============================================================================
// GetTransactionByIdSchema
// ============================================================================

describe('GetTransactionByIdSchema', () => {
  it('should accept valid CUID', () => {
    const result = GetTransactionByIdSchema.parse({
      transactionId: VALID_CUID,
    });
    expect(result.transactionId).toBe(VALID_CUID);
  });

  it('should reject non-CUID string', () => {
    expect(() => GetTransactionByIdSchema.parse({ transactionId: 'invalid' })).toThrow();
  });

  it('should reject missing transactionId', () => {
    expect(() => GetTransactionByIdSchema.parse({})).toThrow();
  });
});
