import { describe, it, expect } from 'vitest';
import {
  CurrencySchema,
  AccountTypeSchema,
  TransactionTypeSchema,
  TransferSchema,
  CreateAccountSchema,
  CurrencyConversionSchema,
  ReversalSchema,
  CreateTransactionSchema,
} from '../finance';

describe('finance.ts validation schemas', () => {
  describe('CurrencySchema', () => {
    it('should accept COP, USD and EUR', () => {
      // Given / When / Then
      expect(() => CurrencySchema.parse('COP')).not.toThrow();
      expect(() => CurrencySchema.parse('USD')).not.toThrow();
      expect(() => CurrencySchema.parse('EUR')).not.toThrow();
    });

    it('should reject unsupported currency codes', () => {
      // Given / When / Then
      expect(() => CurrencySchema.parse('GBP')).toThrow();
      expect(() => CurrencySchema.parse('MXN')).toThrow();
      expect(() => CurrencySchema.parse('XXX')).toThrow();
      expect(() => CurrencySchema.parse('INVALID')).toThrow();
    });
  });

  describe('AccountTypeSchema', () => {
    it('should accept all valid account types', () => {
      // Given / When / Then
      expect(() => AccountTypeSchema.parse('SAVINGS')).not.toThrow();
      expect(() => AccountTypeSchema.parse('INVESTMENT')).not.toThrow();
      expect(() => AccountTypeSchema.parse('CREDIT_CARD')).not.toThrow();
      expect(() => AccountTypeSchema.parse('POCKET')).not.toThrow();
    });

    it('should reject unknown account types', () => {
      // Given / When / Then
      expect(() => AccountTypeSchema.parse('INVALID')).toThrow();
    });
  });

  describe('TransactionTypeSchema', () => {
    it('should accept all valid transaction types', () => {
      // Given / When / Then
      expect(() => TransactionTypeSchema.parse('INCOME')).not.toThrow();
      expect(() => TransactionTypeSchema.parse('EXPENSE')).not.toThrow();
      expect(() => TransactionTypeSchema.parse('TRANSFER_OUT')).not.toThrow();
      expect(() => TransactionTypeSchema.parse('TRANSFER_IN')).not.toThrow();
      expect(() => TransactionTypeSchema.parse('INVESTMENT')).not.toThrow();
      expect(() => TransactionTypeSchema.parse('LOAN_PAYMENT')).not.toThrow();
      expect(() => TransactionTypeSchema.parse('CREDIT_PAYMENT')).not.toThrow();
    });

    it('should reject unknown transaction types', () => {
      // Given / When / Then
      expect(() => TransactionTypeSchema.parse('INVALID')).toThrow();
    });
  });

  describe('TransferSchema', () => {
    const validTransfer = {
      idempotencyKey: crypto.randomUUID(),
      fromAccountId: 'clh1234567890abcdefghij',
      toAccountId: 'clh1234567890abcdefghik',
      amountCents: 10000,
      currency: 'USD',
      userId: 'clh1234567890abcdefghil',
    };

    it('should accept a valid transfer', () => {
      // Given / When / Then
      expect(() => TransferSchema.parse(validTransfer)).not.toThrow();
    });

    it('should reject when fromAccountId equals toAccountId', () => {
      // Given
      const invalid = { ...validTransfer, toAccountId: validTransfer.fromAccountId };

      // When / Then
      expect(() => TransferSchema.parse(invalid)).toThrow('Cannot transfer to the same account');
    });

    it('should reject negative amount', () => {
      // Given
      const invalid = { ...validTransfer, amountCents: -100 };

      // When / Then
      expect(() => TransferSchema.parse(invalid)).toThrow();
    });

    it('should reject zero amount', () => {
      // Given
      const invalid = { ...validTransfer, amountCents: 0 };

      // When / Then
      expect(() => TransferSchema.parse(invalid)).toThrow();
    });

    it('should reject invalid UUID idempotency key', () => {
      // Given
      const invalid = { ...validTransfer, idempotencyKey: 'not-a-uuid' };

      // When / Then
      expect(() => TransferSchema.parse(invalid)).toThrow();
    });

    it('should reject invalid CUID account id', () => {
      // Given
      const invalid = { ...validTransfer, fromAccountId: 'invalid-cuid' };

      // When / Then
      expect(() => TransferSchema.parse(invalid)).toThrow();
    });
  });

  describe('CreateAccountSchema', () => {
    const validAccount = {
      userId: 'clh1234567890abcdefghij',
      name: 'Test Account',
      type: 'SAVINGS',
      currency: 'USD',
    };

    it('should accept a valid account', () => {
      // Given / When / Then
      expect(() => CreateAccountSchema.parse(validAccount)).not.toThrow();
    });

    it('should default currency to COP when not provided', () => {
      // Given
      const { currency: _currency, ...withoutCurrency } = validAccount;

      // When
      const parsed = CreateAccountSchema.parse(withoutCurrency);

      // Then
      expect(parsed.currency).toBe('COP');
    });

    it('should default initialBalanceCents to 0', () => {
      // Given / When
      const parsed = CreateAccountSchema.parse(validAccount);

      // Then
      expect(parsed.initialBalanceCents).toBe(0);
    });

    it('should reject empty account name', () => {
      // Given
      const invalid = { ...validAccount, name: '' };

      // When / Then
      expect(() => CreateAccountSchema.parse(invalid)).toThrow();
    });

    it('should reject invalid account type', () => {
      // Given
      const invalid = { ...validAccount, type: 'INVALID' };

      // When / Then
      expect(() => CreateAccountSchema.parse(invalid)).toThrow();
    });
  });

  describe('CurrencyConversionSchema', () => {
    const validConversion = {
      amountCents: 10000,
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      exchangeRate: 0.85,
    };

    it('should accept a valid conversion', () => {
      // Given / When / Then
      expect(() => CurrencyConversionSchema.parse(validConversion)).not.toThrow();
    });

    it('should reject when source and destination currencies are equal', () => {
      // Given
      const invalid = { ...validConversion, toCurrency: 'USD' };

      // When / Then
      expect(() => CurrencyConversionSchema.parse(invalid)).toThrow(
        'Source and destination currencies must be different'
      );
    });

    it('should reject negative amount', () => {
      // Given
      const invalid = { ...validConversion, amountCents: -100 };

      // When / Then
      expect(() => CurrencyConversionSchema.parse(invalid)).toThrow();
    });

    it('should reject zero amount', () => {
      // Given
      const invalid = { ...validConversion, amountCents: 0 };

      // When / Then
      expect(() => CurrencyConversionSchema.parse(invalid)).toThrow();
    });

    it('should reject negative exchange rate', () => {
      // Given
      const invalid = { ...validConversion, exchangeRate: -0.5 };

      // When / Then
      expect(() => CurrencyConversionSchema.parse(invalid)).toThrow();
    });

    it('should reject zero exchange rate', () => {
      // Given
      const invalid = { ...validConversion, exchangeRate: 0 };

      // When / Then
      expect(() => CurrencyConversionSchema.parse(invalid)).toThrow();
    });
  });

  describe('ReversalSchema', () => {
    it('should accept a valid reversal', () => {
      // Given
      const validReversal = {
        transferId: 'clh1234567890abcdefghij',
        userId: 'clh1234567890abcdefghik',
      };

      // When / Then
      expect(() => ReversalSchema.parse(validReversal)).not.toThrow();
    });
  });

  describe('CreateTransactionSchema', () => {
    const validTransaction = {
      idempotencyKey: crypto.randomUUID(),
      userId: 'clh1234567890abcdefghij',
      accountId: 'clh1234567890abcdefghik',
      type: 'INCOME',
      amountCents: 10000,
      currency: 'USD',
    };

    it('should accept a valid transaction', () => {
      // Given / When / Then
      expect(() => CreateTransactionSchema.parse(validTransaction)).not.toThrow();
    });

    it('should reject when TRANSFER_OUT amount is positive', () => {
      // Given
      const invalid = {
        ...validTransaction,
        type: 'TRANSFER_OUT',
        amountCents: 100,
      };

      // When / Then
      expect(() => CreateTransactionSchema.parse(invalid)).toThrow();
    });

    it('should reject when TRANSFER_IN amount is negative', () => {
      // Given
      const invalid = {
        ...validTransaction,
        type: 'TRANSFER_IN',
        amountCents: -100,
      };

      // When / Then
      expect(() => CreateTransactionSchema.parse(invalid)).toThrow();
    });
  });
});
