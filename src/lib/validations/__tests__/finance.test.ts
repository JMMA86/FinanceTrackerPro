/**
 * Financial Validation Schemas Test Suite
 * Tests Zod validation schemas for finance operations
 */

import { describe, it, expect } from 'vitest';
import {
  CurrencySchema,
  AccountTypeSchema,
  TransactionTypeSchema,
  TransferSchema,
  CreateAccountSchema,
  CurrencyConversionSchema,
} from '../finance';

describe('finance.ts - CurrencySchema', () => {
  it('should accept valid currency codes', () => {
    expect(() => CurrencySchema.parse('USD')).not.toThrow();
    expect(() => CurrencySchema.parse('EUR')).not.toThrow();
    expect(() => CurrencySchema.parse('GBP')).not.toThrow();
    expect(() => CurrencySchema.parse('COP')).not.toThrow();
    expect(() => CurrencySchema.parse('MXN')).not.toThrow();
  });

  it('should reject invalid currency codes', () => {
    expect(() => CurrencySchema.parse('XXX')).toThrow();
    expect(() => CurrencySchema.parse('INVALID')).toThrow();
  });
});

describe('finance.ts - AccountTypeSchema', () => {
  it('should accept valid account types', () => {
    expect(() => AccountTypeSchema.parse('SAVINGS')).not.toThrow();
    expect(() => AccountTypeSchema.parse('INVESTMENT')).not.toThrow();
    expect(() => AccountTypeSchema.parse('CREDIT_CARD')).not.toThrow();
    expect(() => AccountTypeSchema.parse('POCKET')).not.toThrow();
  });

  it('should reject invalid account types', () => {
    expect(() => AccountTypeSchema.parse('INVALID')).toThrow();
  });
});

describe('finance.ts - TransactionTypeSchema', () => {
  it('should accept valid transaction types', () => {
    expect(() => TransactionTypeSchema.parse('INCOME')).not.toThrow();
    expect(() => TransactionTypeSchema.parse('EXPENSE')).not.toThrow();
    expect(() => TransactionTypeSchema.parse('TRANSFER_OUT')).not.toThrow();
    expect(() => TransactionTypeSchema.parse('TRANSFER_IN')).not.toThrow();
    expect(() => TransactionTypeSchema.parse('INVESTMENT')).not.toThrow();
    expect(() => TransactionTypeSchema.parse('LOAN_PAYMENT')).not.toThrow();
    expect(() => TransactionTypeSchema.parse('CREDIT_PAYMENT')).not.toThrow();
  });

  it('should reject invalid transaction types', () => {
    expect(() => TransactionTypeSchema.parse('INVALID')).toThrow();
  });
});

describe('finance.ts - TransferSchema', () => {
  const validTransfer = {
    idempotencyKey: crypto.randomUUID(),
    fromAccountId: 'clh1234567890abcdefghij',
    toAccountId: 'clh1234567890abcdefghik',
    amountCents: 10000,
    currency: 'USD',
    userId: 'clh1234567890abcdefghil',
  };

  it('should accept valid transfer', () => {
    expect(() => TransferSchema.parse(validTransfer)).not.toThrow();
  });

  it('should reject same fromAccountId and toAccountId', () => {
    const invalid = {
      ...validTransfer,
      toAccountId: validTransfer.fromAccountId,
    };
    expect(() => TransferSchema.parse(invalid)).toThrow('Cannot transfer to the same account');
  });

  it('should reject negative amount', () => {
    const invalid = { ...validTransfer, amountCents: -100 };
    expect(() => TransferSchema.parse(invalid)).toThrow();
  });

  it('should reject zero amount', () => {
    const invalid = { ...validTransfer, amountCents: 0 };
    expect(() => TransferSchema.parse(invalid)).toThrow();
  });

  it('should reject invalid UUID format', () => {
    const invalid = { ...validTransfer, idempotencyKey: 'not-a-uuid' };
    expect(() => TransferSchema.parse(invalid)).toThrow();
  });

  it('should reject invalid CUID format', () => {
    const invalid = { ...validTransfer, fromAccountId: 'invalid-cuid' };
    expect(() => TransferSchema.parse(invalid)).toThrow();
  });
});

describe('finance.ts - CreateAccountSchema', () => {
  const validAccount = {
    userId: 'clh1234567890abcdefghij',
    name: 'Test Account',
    type: 'SAVINGS',
    currency: 'USD',
  };

  it('should accept valid account', () => {
    expect(() => CreateAccountSchema.parse(validAccount)).not.toThrow();
  });

  it('should use default currency COP', () => {
    const { currency: _currency, ...withoutCurrency } = validAccount;
    const parsed = CreateAccountSchema.parse(withoutCurrency);
    expect(parsed.currency).toBe('COP');
  });

  it('should use default initialBalanceCents 0', () => {
    const parsed = CreateAccountSchema.parse(validAccount);
    expect(parsed.initialBalanceCents).toBe(0);
  });

  it('should reject empty name', () => {
    const invalid = { ...validAccount, name: '' };
    expect(() => CreateAccountSchema.parse(invalid)).toThrow();
  });

  it('should reject invalid account type', () => {
    const invalid = { ...validAccount, type: 'INVALID' };
    expect(() => CreateAccountSchema.parse(invalid)).toThrow();
  });
});

describe('finance.ts - CurrencyConversionSchema', () => {
  const validConversion = {
    amountCents: 10000,
    fromCurrency: 'USD',
    toCurrency: 'EUR',
    exchangeRate: 0.85,
  };

  it('should accept valid conversion', () => {
    expect(() => CurrencyConversionSchema.parse(validConversion)).not.toThrow();
  });

  it('should reject same fromCurrency and toCurrency', () => {
    const invalid = {
      ...validConversion,
      toCurrency: 'USD',
    };
    expect(() => CurrencyConversionSchema.parse(invalid)).toThrow(
      'Source and destination currencies must be different'
    );
  });

  it('should reject negative amount', () => {
    const invalid = { ...validConversion, amountCents: -100 };
    expect(() => CurrencyConversionSchema.parse(invalid)).toThrow();
  });

  it('should reject zero amount', () => {
    const invalid = { ...validConversion, amountCents: 0 };
    expect(() => CurrencyConversionSchema.parse(invalid)).toThrow();
  });

  it('should reject negative exchange rate', () => {
    const invalid = { ...validConversion, exchangeRate: -0.5 };
    expect(() => CurrencyConversionSchema.parse(invalid)).toThrow();
  });

  it('should reject zero exchange rate', () => {
    const invalid = { ...validConversion, exchangeRate: 0 };
    expect(() => CurrencyConversionSchema.parse(invalid)).toThrow();
  });
});
