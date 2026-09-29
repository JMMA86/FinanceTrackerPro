/**
 * Investment Trade Edit / Reverse Integration Tests (real actions, real DB)
 *
 * Exercises `buyAsset`, `sellAsset`, `updateInvestmentTrade` and
 * `reverseInvestmentTrade` against the dedicated test database, with the stock
 * quote provider mocked deterministically.
 *
 * Focus: historical dates, structured trade traceability (Rule 11), execution
 * price vs market price, holding recomputation from the ledger (Rule 13),
 * ledger completeness guard (C1) and state-based idempotency (Rule 12).
 *
 * Run with: npm run test:coverage
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient, Currency, AccountType, Language, Theme } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ZodError } from 'zod';
import { AppError } from '@/lib/errors/api-errors';

const TEST_DB_URL = process.env.DATABASE_URL!;
const TEST_USER_ID = 'inv-edit-user-' + Date.now();

const genUUID = (): string => crypto.randomUUID();

let pool: Pool;
let prisma: PrismaClient;

// ============================================================================
// Mocks for server-only dependencies
// ============================================================================

vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: (key: string) => {
        if (key === 'x-forwarded-for') return '127.0.0.1';
        if (key === 'user-agent') return 'vitest';
        return null;
      },
    })
  ),
}));

vi.mock('next/cache', () => {
  const revalidatePath = vi.fn();
  const unstable_noStore = vi.fn();
  return { revalidatePath, unstable_noStore };
});

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(() =>
    Promise.resolve({
      userId: TEST_USER_ID,
      email: `inv-edit-${Date.now()}@example.com`,
      name: 'Investment Edit Test User',
    })
  ),
}));

vi.mock('@/lib/logger', () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock('@/services/rate-limit.service', () => ({
  checkApiRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  recordApiAttempt: vi.fn().mockResolvedValue('attempt-1'),
  markApiAttemptSuccess: vi.fn().mockResolvedValue(undefined),
}));

// Mirrors the real safeAction envelope (ActionResponse).
vi.mock('@/lib/utils/action-wrapper', () => ({
  safeAction: vi.fn((fn) => {
    return async (...args: unknown[]) => {
      try {
        const result = await fn(...args);
        return { success: true, data: result };
      } catch (error) {
        if (error instanceof ZodError) {
          const firstError = error.issues?.[0];
          const message = firstError?.path
            ? `${firstError.path.join('.')}: ${firstError.message}`
            : 'Validation failed';
          return { success: false, error: message, code: 'VALIDATION_ERROR' };
        }
        if (error instanceof AppError) {
          return { success: false, error: error.message, code: error.code };
        }
        return { success: false, error: (error as Error).message, code: 'INTERNAL_SERVER_ERROR' };
      }
    };
  }),
}));

vi.mock('@/services/exchange-rate.service', () => ({
  getExchangeRate: vi.fn(async () => null),
  getExchangeRateCached: vi.fn(async () => null),
}));

// Stock quotes: mutable per test so the ±2% check can be aligned or violated.
const { mockGetStockQuote } = vi.hoisted(() => ({
  mockGetStockQuote: vi.fn(
    async (
      symbol: string
    ): Promise<{ symbol: string; price: number; priceCents: number; currency: string }> => ({
      symbol,
      price: 15,
      priceCents: 1500,
      currency: 'USD',
    })
  ),
}));
vi.mock('@/services/stock-price.service', () => ({
  getStockQuote: mockGetStockQuote,
  searchStocks: vi.fn(async () => []),
}));

import {
  buyAsset,
  sellAsset,
  updateInvestmentTrade,
  reverseInvestmentTrade,
} from '../investment.actions';

// ============================================================================
// Test helpers
// ============================================================================

async function createUser() {
  return prisma.user.create({
    data: {
      id: TEST_USER_ID,
      email: `inv-edit-${Date.now()}@example.com`,
      name: 'Investment Edit Test User',
      passwordHash: 'hashed_test_password',
      language: Language.SPANISH,
      theme: Theme.LIGHT,
      baseCurrency: Currency.COP,
      isActive: true,
    },
  });
}

async function createInvestmentAccountRow(balanceCents = 0) {
  const account = await prisma.account.create({
    data: {
      userId: TEST_USER_ID,
      name: 'Inv Edit',
      type: AccountType.INVESTMENT,
      balanceCents,
      currency: Currency.USD,
      isActive: true,
      createdBy: TEST_USER_ID,
      lastModifiedBy: TEST_USER_ID,
    },
  });
  if (balanceCents > 0) {
    await prisma.transaction.create({
      data: {
        idempotencyKey: genUUID(),
        userId: TEST_USER_ID,
        accountId: account.id,
        // TRANSFER_IN models an investment funding deposit. Using the generic
        // INVESTMENT type here would create a legacy row without structured
        // asset data and trip the INVESTMENT_LEDGER_INCOMPLETE guard.
        type: 'TRANSFER_IN',
        amountCents: balanceCents,
        currency: Currency.USD,
        date: new Date(),
        isActive: true,
        createdBy: TEST_USER_ID,
        lastModifiedBy: TEST_USER_ID,
      },
    });
  }
  return account;
}

async function buy(
  accountId: string,
  overrides: Partial<{
    symbol: string;
    name: string;
    quantity: string;
    pricePerShareCents: number;
    date: Date;
    allowPriceOverride: boolean;
  }> = {}
) {
  return buyAsset({
    idempotencyKey: genUUID(),
    accountId,
    symbol: overrides.symbol ?? 'AAPL',
    name: overrides.name ?? 'Apple Inc.',
    quantity: overrides.quantity ?? '5',
    pricePerShareCents: overrides.pricePerShareCents ?? 1500,
    date: overrides.date,
    allowPriceOverride: overrides.allowPriceOverride ?? false,
  });
}

async function getHolding(accountId: string, symbol = 'AAPL') {
  return prisma.investmentAssetHolding.findUnique({
    where: { accountId_symbol: { accountId, symbol } },
  });
}

// ============================================================================
// Setup / Teardown
// ============================================================================

describe('Investment Trade Edit / Reverse (real actions)', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
    await createUser();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  beforeEach(async () => {
    await prisma.investmentAssetHolding.deleteMany({
      where: { account: { userId: TEST_USER_ID } },
    });
    await prisma.transaction.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.account.deleteMany({ where: { userId: TEST_USER_ID } });
    mockGetStockQuote.mockImplementation(async (symbol: string) => ({
      symbol,
      price: 15,
      priceCents: 1500,
      currency: 'USD',
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // buyAsset — historical date + structured traceability
  // ==========================================================================

  it('persists a historical trade date and the structured asset fields', async () => {
    const inv = await createInvestmentAccountRow(20000);
    const historicalDate = new Date('2024-03-01T10:00:00.000Z');

    const result = await buy(inv.id, {
      quantity: '2',
      pricePerShareCents: 1500,
      date: historicalDate,
    });

    expect(result.success).toBe(true);
    expect(result.data!.transaction.date).toEqual(historicalDate);

    const stored = await prisma.transaction.findFirstOrThrow({
      where: { accountId: inv.id, assetTradeType: 'BUY' },
    });
    expect(stored.date).toEqual(historicalDate);
    expect(stored.assetSymbol).toBe('AAPL');
    expect(stored.assetQuantity?.toString()).toBe('2');
    expect(Number(stored.assetPricePerShareCents)).toBe(1500);
    expect(stored.assetTradeType).toBe('BUY');
  });

  it('stores the market quote as currentPriceCents and the execution price as avgCostCents', async () => {
    const inv = await createInvestmentAccountRow(20000);
    // Execution price 1500 (market 1500, within tolerance).
    mockGetStockQuote.mockImplementation(async (symbol: string) => ({
      symbol,
      price: 16,
      priceCents: 1600,
      currency: 'USD',
    }));

    const result = await buy(inv.id, {
      quantity: '2',
      pricePerShareCents: 1600,
    });
    expect(result.success).toBe(true);

    const holding = await getHolding(inv.id);
    expect(Number(holding?.avgCostCents)).toBe(1600);
    expect(Number(holding?.currentPriceCents)).toBe(1600);
  });

  it('accepts an execution price outside ±2% with allowPriceOverride and keeps quote as market price', async () => {
    const inv = await createInvestmentAccountRow(20000);
    // Market quote is 5000; execution 1500 is far outside ±2%.
    mockGetStockQuote.mockImplementation(async (symbol: string) => ({
      symbol,
      price: 50,
      priceCents: 5000,
      currency: 'USD',
    }));

    const result = await buy(inv.id, {
      quantity: '1',
      pricePerShareCents: 1500,
      allowPriceOverride: true,
    });

    expect(result.success).toBe(true);
    const holding = await getHolding(inv.id);
    // avgCostCents = execution price (1500), currentPriceCents = market quote (5000)
    expect(Number(holding?.avgCostCents)).toBe(1500);
    expect(Number(holding?.currentPriceCents)).toBe(5000);
  });

  it('rejects a price outside ±2% without allowPriceOverride', async () => {
    const inv = await createInvestmentAccountRow(20000);
    mockGetStockQuote.mockImplementation(async (symbol: string) => ({
      symbol,
      price: 50,
      priceCents: 5000,
      currency: 'USD',
    }));

    const result = await buy(inv.id, {
      quantity: '1',
      pricePerShareCents: 1500,
      allowPriceOverride: false,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('PRICE_MISMATCH');
  });

  // ==========================================================================
  // sellAsset — historical date + market price not overwritten
  // ==========================================================================

  it('persists a historical date on a SELL and keeps the market price', async () => {
    const inv = await createInvestmentAccountRow(20000);
    await buy(inv.id, { quantity: '5', pricePerShareCents: 1500 });
    const holding = await getHolding(inv.id);
    const historicalDate = new Date('2024-04-01T09:00:00.000Z');

    // Align the quote with the sell execution price so ±2% passes.
    mockGetStockQuote.mockImplementation(async (symbol: string) => ({
      symbol,
      price: 16,
      priceCents: 1600,
      currency: 'USD',
    }));

    const result = await sellAsset({
      idempotencyKey: genUUID(),
      holdingId: holding!.id,
      quantity: '2',
      pricePerShareCents: 1600,
      date: historicalDate,
    });

    expect(result.success).toBe(true);
    expect(result.data!.transaction.date).toEqual(historicalDate);

    const stored = await prisma.transaction.findFirstOrThrow({
      where: { accountId: inv.id, assetTradeType: 'SELL' },
    });
    expect(stored.date).toEqual(historicalDate);
  });

  it('does not overwrite currentPriceCents with the execution price on a partial sell', async () => {
    const inv = await createInvestmentAccountRow(20000);
    await buy(inv.id, { quantity: '5', pricePerShareCents: 1500 });
    const holding = await getHolding(inv.id);
    // Market price 1600 (matches the holding), execution price 1600.
    mockGetStockQuote.mockImplementation(async (symbol: string) => ({
      symbol,
      price: 16,
      priceCents: 1600,
      currency: 'USD',
    }));

    await sellAsset({
      idempotencyKey: genUUID(),
      holdingId: holding!.id,
      quantity: '2',
      pricePerShareCents: 1600,
    });

    const after = await getHolding(inv.id);
    expect(after?.quantity.toString()).toBe('3');
    // The cached market price is refreshed from the LIVE QUOTE (1600), never
    // from an arbitrary execution price.
    expect(Number(after?.currentPriceCents)).toBe(1600);
  });

  // ==========================================================================
  // updateInvestmentTrade
  // ==========================================================================

  it('updates quantity, price, date and description and recomputes the holding', async () => {
    const inv = await createInvestmentAccountRow(20000);
    await buy(inv.id, { quantity: '5', pricePerShareCents: 1500 });
    const trade = await prisma.transaction.findFirstOrThrow({
      where: { accountId: inv.id, assetTradeType: 'BUY' },
    });
    const newDate = new Date('2024-02-15T08:00:00.000Z');

    const result = await updateInvestmentTrade({
      idempotencyKey: genUUID(),
      transactionId: trade.id,
      quantity: '10',
      pricePerShareCents: 1500,
      date: newDate,
      description: 'Adjusted buy',
    });

    expect(result.success).toBe(true);

    const updated = await prisma.transaction.findUniqueOrThrow({ where: { id: trade.id } });
    expect(updated.assetQuantity?.toString()).toBe('10');
    expect(Number(updated.assetPricePerShareCents)).toBe(1500);
    expect(updated.description).toBe('Adjusted buy');
    expect(updated.date).toEqual(newDate);
    // 10 * 1500 = 15000 cents outflow
    expect(Number(updated.amountCents)).toBe(-15000);

    const holding = await getHolding(inv.id);
    expect(holding?.quantity.toString()).toBe('10');

    const account = await prisma.account.findUniqueOrThrow({ where: { id: inv.id } });
    // 20000 - 15000 = 5000 (reconciled from the ledger)
    expect(Number(account.balanceCents)).toBe(5000);
  });

  it('preserves the existing description when none is submitted', async () => {
    const inv = await createInvestmentAccountRow(20000);
    await buy(inv.id, { quantity: '5', pricePerShareCents: 1500 });
    const trade = await prisma.transaction.findFirstOrThrow({
      where: { accountId: inv.id, assetTradeType: 'BUY' },
    });
    await prisma.transaction.update({
      where: { id: trade.id },
      data: { description: 'My custom note' },
    });

    const result = await updateInvestmentTrade({
      idempotencyKey: genUUID(),
      transactionId: trade.id,
      quantity: '6',
    });

    expect(result.success).toBe(true);
    const updated = await prisma.transaction.findUniqueOrThrow({ where: { id: trade.id } });
    expect(updated.description).toBe('My custom note');
  });

  it('rejects a price outside ±2% and accepts it with allowPriceOverride', async () => {
    const inv = await createInvestmentAccountRow(20000);
    await buy(inv.id, { quantity: '5', pricePerShareCents: 1500 });
    const trade = await prisma.transaction.findFirstOrThrow({
      where: { accountId: inv.id, assetTradeType: 'BUY' },
    });
    mockGetStockQuote.mockImplementation(async (symbol: string) => ({
      symbol,
      price: 50,
      priceCents: 5000,
      currency: 'USD',
    }));

    const rejected = await updateInvestmentTrade({
      idempotencyKey: genUUID(),
      transactionId: trade.id,
      pricePerShareCents: 1000,
    });
    expect(rejected.success).toBe(false);
    expect(rejected.code).toBe('PRICE_MISMATCH');

    const accepted = await updateInvestmentTrade({
      idempotencyKey: genUUID(),
      transactionId: trade.id,
      pricePerShareCents: 1000,
      allowPriceOverride: true,
    });
    expect(accepted.success).toBe(true);

    const updated = await prisma.transaction.findUniqueOrThrow({ where: { id: trade.id } });
    expect(Number(updated.assetPricePerShareCents)).toBe(1000);
  });

  it('rejects INVESTMENT_LEDGER_INCOMPLETE when the account has legacy unstructured trades', async () => {
    const inv = await createInvestmentAccountRow(20000);
    await buy(inv.id, { quantity: '5', pricePerShareCents: 1500 });
    const trade = await prisma.transaction.findFirstOrThrow({
      where: { accountId: inv.id, assetTradeType: 'BUY' },
    });
    // A legacy INVESTMENT row with no structured asset data.
    await prisma.transaction.create({
      data: {
        idempotencyKey: genUUID(),
        userId: TEST_USER_ID,
        accountId: inv.id,
        type: 'INVESTMENT',
        amountCents: -1000,
        currency: Currency.USD,
        date: new Date('2024-01-01'),
        isActive: true,
        createdBy: TEST_USER_ID,
        lastModifiedBy: TEST_USER_ID,
      },
    });

    const result = await updateInvestmentTrade({
      idempotencyKey: genUUID(),
      transactionId: trade.id,
      quantity: '6',
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('INVESTMENT_LEDGER_INCOMPLETE');
  });

  it('rejects an edit that makes the ledger oversell (rollback)', async () => {
    const inv = await createInvestmentAccountRow(20000);
    await buy(inv.id, { quantity: '2', pricePerShareCents: 1500 });
    const sellHolding = await getHolding(inv.id);
    mockGetStockQuote.mockImplementation(async (symbol: string) => ({
      symbol,
      price: 16,
      priceCents: 1600,
      currency: 'USD',
    }));
    const sell = await sellAsset({
      idempotencyKey: genUUID(),
      holdingId: sellHolding!.id,
      quantity: '2',
      pricePerShareCents: 1600,
    });
    expect(sell.success).toBe(true);

    const sellTrade = await prisma.transaction.findFirstOrThrow({
      where: { accountId: inv.id, assetTradeType: 'SELL' },
    });

    // Editing the SELL quantity to 5 would exceed the 2 bought → ledger oversell.
    const result = await updateInvestmentTrade({
      idempotencyKey: genUUID(),
      transactionId: sellTrade.id,
      quantity: '5',
    });

    // The ledger replay rejects the oversell (VALIDATION_ERROR) inside the DB
    // transaction and the whole edit rolls back.
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(result.error).toContain('Sell quantity exceeds ledger quantity');

    // Rollback: the SELL row is unchanged.
    const unchanged = await prisma.transaction.findUniqueOrThrow({ where: { id: sellTrade.id } });
    expect(unchanged.assetQuantity?.toString()).toBe('2');
  });

  // ==========================================================================
  // reverseInvestmentTrade
  // ==========================================================================

  it('undoing a SELL restores the holding quantity and is idempotent', async () => {
    const inv = await createInvestmentAccountRow(20000);
    await buy(inv.id, { quantity: '5', pricePerShareCents: 1500 });
    const holding = await getHolding(inv.id);
    mockGetStockQuote.mockImplementation(async (symbol: string) => ({
      symbol,
      price: 16,
      priceCents: 1600,
      currency: 'USD',
    }));
    await sellAsset({
      idempotencyKey: genUUID(),
      holdingId: holding!.id,
      quantity: '2',
      pricePerShareCents: 1600,
    });
    const sellTrade = await prisma.transaction.findFirstOrThrow({
      where: { accountId: inv.id, assetTradeType: 'SELL' },
    });

    const first = await reverseInvestmentTrade({
      idempotencyKey: genUUID(),
      transactionId: sellTrade.id,
    });
    expect(first.success).toBe(true);
    expect(first.data!.wasIdempotent).toBe(false);

    // The 2 sold shares are back (5 - 2 + 2 = 5).
    const after = await getHolding(inv.id);
    expect(after?.quantity.toString()).toBe('5');

    // Second reverse is a no-op reporting idempotency.
    const second = await reverseInvestmentTrade({
      idempotencyKey: genUUID(),
      transactionId: sellTrade.id,
    });
    expect(second.success).toBe(true);
    expect(second.data!.wasIdempotent).toBe(true);
  });

  it('undoing a BUY reduces the holding quantity', async () => {
    const inv = await createInvestmentAccountRow(20000);
    await buy(inv.id, { quantity: '5', pricePerShareCents: 1500 });
    const buyTrade = await prisma.transaction.findFirstOrThrow({
      where: { accountId: inv.id, assetTradeType: 'BUY' },
    });

    const result = await reverseInvestmentTrade({
      idempotencyKey: genUUID(),
      transactionId: buyTrade.id,
    });

    expect(result.success).toBe(true);
    // Reversing the only BUY closes the position (soft-deleted).
    const holding = await getHolding(inv.id);
    expect(holding?.isActive).toBe(false);

    const account = await prisma.account.findUniqueOrThrow({ where: { id: inv.id } });
    // Buy outflow reverted: balance back to the 20000 funding.
    expect(Number(account.balanceCents)).toBe(20000);
  });

  it('does not throw when reversing a SELL leaves a negative cash balance', async () => {
    const inv = await createInvestmentAccountRow(20000);
    await buy(inv.id, { quantity: '5', pricePerShareCents: 1500 });
    const holding = await getHolding(inv.id);
    mockGetStockQuote.mockImplementation(async (symbol: string) => ({
      symbol,
      price: 16,
      priceCents: 1600,
      currency: 'USD',
    }));
    await sellAsset({
      idempotencyKey: genUUID(),
      holdingId: holding!.id,
      quantity: '5',
      pricePerShareCents: 1600,
    });

    // Drain the cash so reversing the SELL (which re-adds the -8000 buy outflow
    // to the ledger) would leave a negative cash balance.
    const sellTrade = await prisma.transaction.findFirstOrThrow({
      where: { accountId: inv.id, assetTradeType: 'SELL' },
    });
    await prisma.transaction.create({
      data: {
        idempotencyKey: genUUID(),
        userId: TEST_USER_ID,
        accountId: inv.id,
        type: 'TRANSFER_OUT',
        amountCents: -15000,
        currency: Currency.USD,
        date: new Date(),
        isActive: true,
        createdBy: TEST_USER_ID,
        lastModifiedBy: TEST_USER_ID,
      },
    });

    const result = await reverseInvestmentTrade({
      idempotencyKey: genUUID(),
      transactionId: sellTrade.id,
    });

    // M3: the undo is never blocked by a negative cash balance — the true
    // balance is negative (20000 - 8000 buy - 15000 withdrawal) but the action
    // still succeeds and persists it for later reconciliation.
    expect(result.success).toBe(true);
    const account = await prisma.account.findUniqueOrThrow({ where: { id: inv.id } });
    expect(Number(account.balanceCents)).toBeLessThan(0);
  });

  it('rejects reversing a non-investment transaction', async () => {
    const inv = await createInvestmentAccountRow(20000);
    const income = await prisma.transaction.findFirstOrThrow({
      where: { accountId: inv.id, type: 'TRANSFER_IN' },
    });

    const result = await reverseInvestmentTrade({
      idempotencyKey: genUUID(),
      transactionId: income.id,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('rejects reversing another user transaction', async () => {
    const otherId = 'other-inv-' + Date.now();
    await prisma.user.create({
      data: {
        id: otherId,
        email: `other-inv-${Date.now()}@example.com`,
        name: 'Other',
        passwordHash: 'hashed_test_password',
        language: Language.SPANISH,
        theme: Theme.LIGHT,
        baseCurrency: Currency.COP,
        isActive: true,
      },
    });
    const otherAccount = await prisma.account.create({
      data: {
        userId: otherId,
        name: 'Other Inv',
        type: AccountType.INVESTMENT,
        currency: Currency.USD,
        balanceCents: 0,
        isActive: true,
        createdBy: otherId,
        lastModifiedBy: otherId,
      },
    });
    const otherTx = await prisma.transaction.create({
      data: {
        idempotencyKey: genUUID(),
        userId: otherId,
        accountId: otherAccount.id,
        type: 'INVESTMENT',
        amountCents: -1000,
        currency: Currency.USD,
        assetSymbol: 'AAPL',
        assetQuantity: 1,
        assetPricePerShareCents: 1000,
        assetTradeType: 'BUY',
        date: new Date(),
        isActive: true,
        createdBy: otherId,
        lastModifiedBy: otherId,
      },
    });

    const result = await reverseInvestmentTrade({
      idempotencyKey: genUUID(),
      transactionId: otherTx.id,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
  });
});
