/**
 * Investment Schemas Unit Tests
 * Tests validation rules for all investment-related Zod schemas
 */
import { describe, it, expect } from 'vitest';
import {
  CreateInvestmentAccountSchema,
  DepositToInvestmentSchema,
  BuyAssetSchema,
  SellAssetSchema,
  UpdateAssetPriceSchema,
  GetInvestmentTransactionsSchema,
  GetStockPriceSchema,
} from '../investment.schema';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_CUID = 'clh1234567890abcdefghij';

// ============================================================================
// CreateInvestmentAccountSchema
// ============================================================================
describe('CreateInvestmentAccountSchema', () => {
  const validInput = {
    idempotencyKey: VALID_UUID,
    name: 'My Investment Account',
    currency: 'USD' as const,
    initialBalanceCents: 10000,
  };

  it('should accept valid input with USD', () => {
    const result = CreateInvestmentAccountSchema.parse(validInput);
    expect(result.name).toBe('My Investment Account');
    expect(result.currency).toBe('USD');
    expect(result.initialBalanceCents).toBe(10000);
  });

  it('should accept valid input with EUR', () => {
    const result = CreateInvestmentAccountSchema.parse({
      ...validInput,
      currency: 'EUR',
    });
    expect(result.currency).toBe('EUR');
  });

  it('should reject COP as currency', () => {
    expect(() =>
      CreateInvestmentAccountSchema.parse({
        ...validInput,
        currency: 'COP',
      })
    ).toThrow();
  });

  it('should reject invalid UUID for idempotencyKey', () => {
    expect(() =>
      CreateInvestmentAccountSchema.parse({
        ...validInput,
        idempotencyKey: 'not-a-uuid',
      })
    ).toThrow();
  });

  it('should reject negative initialBalanceCents', () => {
    expect(() =>
      CreateInvestmentAccountSchema.parse({
        ...validInput,
        initialBalanceCents: -100,
      })
    ).toThrow('Balance cannot be negative');
  });

  it('should reject empty name', () => {
    expect(() =>
      CreateInvestmentAccountSchema.parse({
        ...validInput,
        name: '',
      })
    ).toThrow();
  });

  it('should default initialBalanceCents to 0 when omitted', () => {
    const { initialBalanceCents: _, ...rest } = validInput;
    const result = CreateInvestmentAccountSchema.parse(rest);
    expect(result.initialBalanceCents).toBe(0);
  });

  it('should reject name exceeding 100 characters', () => {
    expect(() =>
      CreateInvestmentAccountSchema.parse({
        ...validInput,
        name: 'x'.repeat(101),
      })
    ).toThrow();
  });

  it('should reject non-integer initialBalanceCents', () => {
    expect(() =>
      CreateInvestmentAccountSchema.parse({
        ...validInput,
        initialBalanceCents: 100.5,
      })
    ).toThrow('Balance must be an integer');
  });
});

// ============================================================================
// DepositToInvestmentSchema
// ============================================================================
describe('DepositToInvestmentSchema', () => {
  const validInput = {
    idempotencyKey: VALID_UUID,
    investmentAccountId: VALID_CUID,
    fromBankAccountId: VALID_CUID,
    amountCents: 500000,
    exchangeRate: 4000,
    description: 'Deposit to investment',
  };

  it('should accept valid input', () => {
    const result = DepositToInvestmentSchema.parse(validInput);
    expect(result.amountCents).toBe(500000);
    expect(result.exchangeRate).toBe(4000);
    expect(result.description).toBe('Deposit to investment');
  });

  it('should accept input without optional description', () => {
    const { description: _, ...rest } = validInput;
    const result = DepositToInvestmentSchema.parse(rest);
    expect(result.description).toBeUndefined();
  });

  it('should reject negative exchangeRate', () => {
    expect(() =>
      DepositToInvestmentSchema.parse({
        ...validInput,
        exchangeRate: -1,
      })
    ).toThrow('Exchange rate must be positive');
  });

  it('should reject zero exchangeRate', () => {
    expect(() =>
      DepositToInvestmentSchema.parse({
        ...validInput,
        exchangeRate: 0,
      })
    ).toThrow('Exchange rate must be positive');
  });

  it('should reject exchangeRate exceeding 10000', () => {
    expect(() =>
      DepositToInvestmentSchema.parse({
        ...validInput,
        exchangeRate: 10001,
      })
    ).toThrow('Exchange rate seems unrealistic');
  });

  it('should reject amountCents of 0', () => {
    expect(() =>
      DepositToInvestmentSchema.parse({
        ...validInput,
        amountCents: 0,
      })
    ).toThrow('Amount must be at least 1 cent');
  });

  it('should reject negative amountCents', () => {
    expect(() =>
      DepositToInvestmentSchema.parse({
        ...validInput,
        amountCents: -100,
      })
    ).toThrow();
  });

  it('should reject non-integer amountCents', () => {
    expect(() =>
      DepositToInvestmentSchema.parse({
        ...validInput,
        amountCents: 100.5,
      })
    ).toThrow('Amount must be an integer');
  });

  it('should reject invalid investmentAccountId CUID', () => {
    expect(() =>
      DepositToInvestmentSchema.parse({
        ...validInput,
        investmentAccountId: 'not-a-cuid',
      })
    ).toThrow();
  });

  it('should reject invalid fromBankAccountId CUID', () => {
    expect(() =>
      DepositToInvestmentSchema.parse({
        ...validInput,
        fromBankAccountId: 'invalid',
      })
    ).toThrow();
  });

  it('should reject invalid UUID idempotencyKey', () => {
    expect(() =>
      DepositToInvestmentSchema.parse({
        ...validInput,
        idempotencyKey: 'bad-uuid',
      })
    ).toThrow();
  });

  it('should reject description exceeding 500 characters', () => {
    expect(() =>
      DepositToInvestmentSchema.parse({
        ...validInput,
        description: 'x'.repeat(501),
      })
    ).toThrow();
  });

  it('should reject amountCents exceeding MAX_SAFE_CENTS', () => {
    expect(() =>
      DepositToInvestmentSchema.parse({
        ...validInput,
        amountCents: 99999999999999,
      })
    ).toThrow();
  });
});

// ============================================================================
// BuyAssetSchema
// ============================================================================
describe('BuyAssetSchema', () => {
  const validInput = {
    idempotencyKey: VALID_UUID,
    accountId: VALID_CUID,
    symbol: 'AAPL',
    name: 'Apple Inc.',
    quantity: '1.5',
    pricePerShareCents: 18950,
    description: 'Buy Apple stock',
  };

  it('should accept valid input with decimal quantity string', () => {
    const result = BuyAssetSchema.parse(validInput);
    expect(result.symbol).toBe('AAPL');
    expect(result.quantity).toBe('1.5');
    expect(result.pricePerShareCents).toBe(18950);
  });

  it('should accept integer quantity string', () => {
    const result = BuyAssetSchema.parse({
      ...validInput,
      quantity: '10',
    });
    expect(result.quantity).toBe('10');
  });

  it('should uppercase the symbol automatically', () => {
    const result = BuyAssetSchema.parse({
      ...validInput,
      symbol: 'aapl',
    });
    expect(result.symbol).toBe('AAPL');
  });

  it('should reject quantity "0"', () => {
    expect(() =>
      BuyAssetSchema.parse({
        ...validInput,
        quantity: '0',
      })
    ).toThrow('Quantity must be positive and finite');
  });

  it('should reject negative quantity', () => {
    expect(() =>
      BuyAssetSchema.parse({
        ...validInput,
        quantity: '-1',
      })
    ).toThrow('Quantity must be positive and finite');
  });

  it('should reject non-numeric quantity "abc"', () => {
    expect(() =>
      BuyAssetSchema.parse({
        ...validInput,
        quantity: 'abc',
      })
    ).toThrow('Must be a valid positive decimal number');
  });

  it('should reject empty symbol', () => {
    expect(() =>
      BuyAssetSchema.parse({
        ...validInput,
        symbol: '',
      })
    ).toThrow();
  });

  it('should reject symbol exceeding 20 characters', () => {
    expect(() =>
      BuyAssetSchema.parse({
        ...validInput,
        symbol: 'A'.repeat(21),
      })
    ).toThrow();
  });

  it('should reject pricePerShareCents of 0', () => {
    expect(() =>
      BuyAssetSchema.parse({
        ...validInput,
        pricePerShareCents: 0,
      })
    ).toThrow('Price must be at least 1 cent');
  });

  it('should reject negative pricePerShareCents', () => {
    expect(() =>
      BuyAssetSchema.parse({
        ...validInput,
        pricePerShareCents: -100,
      })
    ).toThrow();
  });

  it('should reject non-integer pricePerShareCents', () => {
    expect(() =>
      BuyAssetSchema.parse({
        ...validInput,
        pricePerShareCents: 100.5,
      })
    ).toThrow('Price must be an integer');
  });

  it('should reject empty name', () => {
    expect(() =>
      BuyAssetSchema.parse({
        ...validInput,
        name: '',
      })
    ).toThrow();
  });

  it('should reject name exceeding 200 characters', () => {
    expect(() =>
      BuyAssetSchema.parse({
        ...validInput,
        name: 'x'.repeat(201),
      })
    ).toThrow();
  });

  it('should reject description exceeding 500 characters', () => {
    expect(() =>
      BuyAssetSchema.parse({
        ...validInput,
        description: 'x'.repeat(501),
      })
    ).toThrow();
  });

  it('should accept input without optional description', () => {
    const { description: _, ...rest } = validInput;
    const result = BuyAssetSchema.parse(rest);
    expect(result.description).toBeUndefined();
  });

  it('should reject invalid accountId CUID', () => {
    expect(() =>
      BuyAssetSchema.parse({
        ...validInput,
        accountId: 'bad-cuid',
      })
    ).toThrow();
  });
});

// ============================================================================
// SellAssetSchema
// ============================================================================
describe('SellAssetSchema', () => {
  const validInput = {
    idempotencyKey: VALID_UUID,
    holdingId: VALID_CUID,
    quantity: '2.5',
    pricePerShareCents: 19500,
    description: 'Sell some shares',
  };

  it('should accept valid input', () => {
    const result = SellAssetSchema.parse(validInput);
    expect(result.quantity).toBe('2.5');
    expect(result.pricePerShareCents).toBe(19500);
    expect(result.holdingId).toBe(VALID_CUID);
  });

  it('should reject quantity "0"', () => {
    expect(() =>
      SellAssetSchema.parse({
        ...validInput,
        quantity: '0',
      })
    ).toThrow();
  });

  it('should reject negative quantity', () => {
    expect(() =>
      SellAssetSchema.parse({
        ...validInput,
        quantity: '-1',
      })
    ).toThrow();
  });

  it('should reject non-numeric quantity', () => {
    expect(() =>
      SellAssetSchema.parse({
        ...validInput,
        quantity: 'abc',
      })
    ).toThrow();
  });

  it('should reject pricePerShareCents of 0', () => {
    expect(() =>
      SellAssetSchema.parse({
        ...validInput,
        pricePerShareCents: 0,
      })
    ).toThrow();
  });

  it('should reject negative pricePerShareCents', () => {
    expect(() =>
      SellAssetSchema.parse({
        ...validInput,
        pricePerShareCents: -100,
      })
    ).toThrow();
  });

  it('should reject invalid holdingId CUID', () => {
    expect(() =>
      SellAssetSchema.parse({
        ...validInput,
        holdingId: 'not-a-cuid',
      })
    ).toThrow();
  });

  it('should reject invalid UUID', () => {
    expect(() =>
      SellAssetSchema.parse({
        ...validInput,
        idempotencyKey: 'bad',
      })
    ).toThrow();
  });

  it('should accept input without optional description', () => {
    const { description: _, ...rest } = validInput;
    const result = SellAssetSchema.parse(rest);
    expect(result.description).toBeUndefined();
  });

  it('should reject description exceeding 500 characters', () => {
    expect(() =>
      SellAssetSchema.parse({
        ...validInput,
        description: 'x'.repeat(501),
      })
    ).toThrow();
  });
});

// ============================================================================
// UpdateAssetPriceSchema
// ============================================================================
describe('UpdateAssetPriceSchema', () => {
  const validInput = {
    holdingId: VALID_CUID,
    currentPriceCents: 20000,
  };

  it('should accept valid price', () => {
    const result = UpdateAssetPriceSchema.parse(validInput);
    expect(result.currentPriceCents).toBe(20000);
  });

  it('should accept price of 0', () => {
    const result = UpdateAssetPriceSchema.parse({
      ...validInput,
      currentPriceCents: 0,
    });
    expect(result.currentPriceCents).toBe(0);
  });

  it('should reject negative price', () => {
    expect(() =>
      UpdateAssetPriceSchema.parse({
        ...validInput,
        currentPriceCents: -1,
      })
    ).toThrow('Price cannot be negative');
  });

  it('should reject non-integer price', () => {
    expect(() =>
      UpdateAssetPriceSchema.parse({
        ...validInput,
        currentPriceCents: 100.5,
      })
    ).toThrow('Price must be an integer');
  });

  it('should reject invalid holdingId CUID', () => {
    expect(() =>
      UpdateAssetPriceSchema.parse({
        ...validInput,
        holdingId: 'invalid',
      })
    ).toThrow();
  });

  it('should reject price exceeding MAX_SAFE_CENTS', () => {
    expect(() =>
      UpdateAssetPriceSchema.parse({
        ...validInput,
        currentPriceCents: 99999999999999,
      })
    ).toThrow();
  });
});

// ============================================================================
// GetInvestmentTransactionsSchema
// ============================================================================
describe('GetInvestmentTransactionsSchema', () => {
  const validInput = {
    accountId: VALID_CUID,
  };

  it('should default page to 1 and pageSize to 50', () => {
    const result = GetInvestmentTransactionsSchema.parse(validInput);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
  });

  it('should accept explicit page and pageSize', () => {
    const result = GetInvestmentTransactionsSchema.parse({
      ...validInput,
      page: 3,
      pageSize: 25,
    });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(25);
  });

  it('should reject pageSize > 100', () => {
    expect(() =>
      GetInvestmentTransactionsSchema.parse({
        ...validInput,
        pageSize: 101,
      })
    ).toThrow();
  });

  it('should reject pageSize < 1', () => {
    expect(() =>
      GetInvestmentTransactionsSchema.parse({
        ...validInput,
        pageSize: 0,
      })
    ).toThrow();
  });

  it('should reject page < 1', () => {
    expect(() =>
      GetInvestmentTransactionsSchema.parse({
        ...validInput,
        page: 0,
      })
    ).toThrow();
    expect(() =>
      GetInvestmentTransactionsSchema.parse({
        ...validInput,
        page: -1,
      })
    ).toThrow();
  });

  it('should reject invalid accountId CUID', () => {
    expect(() =>
      GetInvestmentTransactionsSchema.parse({
        accountId: 'bad-cuid',
      })
    ).toThrow();
  });

  it('should reject non-integer page', () => {
    expect(() =>
      GetInvestmentTransactionsSchema.parse({
        ...validInput,
        page: 1.5,
      })
    ).toThrow();
  });
});

// ============================================================================
// GetStockPriceSchema
// ============================================================================
describe('GetStockPriceSchema', () => {
  it('should accept valid symbol', () => {
    const result = GetStockPriceSchema.parse({ symbol: 'AAPL' });
    expect(result.symbol).toBe('AAPL');
  });

  it('should uppercase the symbol', () => {
    const result = GetStockPriceSchema.parse({ symbol: 'aapl' });
    expect(result.symbol).toBe('AAPL');
  });

  it('should reject empty symbol', () => {
    expect(() => GetStockPriceSchema.parse({ symbol: '' })).toThrow();
  });

  it('should reject symbol exceeding 20 characters', () => {
    expect(() =>
      GetStockPriceSchema.parse({ symbol: 'A'.repeat(21) })
    ).toThrow();
  });
});
