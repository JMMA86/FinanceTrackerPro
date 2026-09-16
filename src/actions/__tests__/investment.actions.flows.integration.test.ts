/**
 * Investment Actions Integration Tests (real actions)
 * Exercises the actual Server Actions (createInvestmentAccount, depositToInvestment,
 * buyAsset, sellAsset, withdrawFromInvestment, getCurrentExchangeRate,
 * getInvestmentPerformance, getInvestmentAccounts, getInvestmentTransactions)
 * against the dedicated test database.
 *
 * The FX provider and stock quote provider are mocked deterministically:
 *   - getExchangeRate returns null (API unavailable) so the actions fall back to
 *     the schema range validation (no live ±5% RATE_MISMATCH).
 *   - getStockQuote returns the exact price used by each test (±2% passes).
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
const TEST_USER_ID = 'inv-flow-user-' + Date.now();

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
  cookies: vi.fn(() => ({
    get: vi.fn(() => undefined),
    set: vi.fn(),
    delete: vi.fn(),
  })),
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
      email: `inv-flow-${Date.now()}@example.com`,
      name: 'Investment Flow Test User',
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

// Mock rate limiting service (always allow in tests)
vi.mock('@/services/rate-limit.service', () => ({
  checkApiRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  recordApiAttempt: vi.fn().mockResolvedValue('attempt-1'),
  markApiAttemptSuccess: vi.fn().mockResolvedValue(undefined),
}));

// Mirrors the real safeAction envelope (ActionResponse) so types line up.
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

// FX provider: deterministic "API unavailable" (null) so the actions fall back to
// the schema range validation (exchangeRate 1000–6000) instead of hitting the
// real open.er-api.com endpoint.
const { mockGetExchangeRate } = vi.hoisted(() => ({
  mockGetExchangeRate: vi.fn(async (_from: string, _to: string): Promise<number | null> => null),
}));
vi.mock('@/services/exchange-rate.service', () => ({
  getExchangeRate: mockGetExchangeRate,
  getExchangeRateCached: vi.fn(async () => null),
}));

// Stock quotes: mutable so each test can align the mocked price with the price
// used in the buy/sell payload (the ±2% validation must pass).
const { mockGetStockQuote, mockSearchStocks } = vi.hoisted(() => ({
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
  mockSearchStocks: vi.fn(async () => [
    { symbol: 'AAPL', name: 'Apple Inc.', priceCents: 1500, currency: 'USD' },
  ]),
}));
vi.mock('@/services/stock-price.service', () => ({
  getStockQuote: mockGetStockQuote,
  searchStocks: mockSearchStocks,
}));

import {
  createInvestmentAccount,
  depositToInvestment,
  buyAsset,
  sellAsset,
  withdrawFromInvestment,
  getCurrentExchangeRate,
  getInvestmentPerformance,
  getStockPrice,
  searchStocksAction,
  updateAllAssetPrices,
  getInvestmentAccounts,
  getInvestmentTransactions,
} from '../investment.actions';
import { checkApiRateLimit } from '@/services/rate-limit.service';

// ============================================================================
// Test helpers
// ============================================================================

async function createUser() {
  return prisma.user.create({
    data: {
      id: TEST_USER_ID,
      email: `inv-flow-${Date.now()}@example.com`,
      name: 'Investment Flow Test User',
      passwordHash: 'hashed_test_password',
      language: Language.SPANISH,
      theme: Theme.LIGHT,
      baseCurrency: Currency.COP,
      isActive: true,
    },
  });
}

async function createBankAccount(balanceCents = 1000000) {
  const account = await prisma.account.create({
    data: {
      userId: TEST_USER_ID,
      name: 'Source Bank',
      type: AccountType.SAVINGS,
      balanceCents,
      currency: Currency.COP,
      isActive: true,
      createdBy: TEST_USER_ID,
      lastModifiedBy: TEST_USER_ID,
    },
  });
  // Rule 13: the actions reconcile balances from the transaction history —
  // fund the account with an INCOME transaction so getTrueBalance() sees it.
  await prisma.transaction.create({
    data: {
      idempotencyKey: genUUID(),
      userId: TEST_USER_ID,
      accountId: account.id,
      type: 'INCOME',
      amountCents: balanceCents,
      currency: Currency.COP,
      date: new Date(),
      isActive: true,
      createdBy: TEST_USER_ID,
      lastModifiedBy: TEST_USER_ID,
    },
  });
  return account;
}

async function createInvestmentAccountRow(balanceCents = 0) {
  const account = await prisma.account.create({
    data: {
      userId: TEST_USER_ID,
      name: 'Inv USA',
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
        type: 'INVESTMENT',
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

async function getBankAccount() {
  return prisma.account.findFirstOrThrow({
    where: { userId: TEST_USER_ID, type: 'SAVINGS' },
  });
}

async function createOtherUserAccount(currency: Currency = Currency.USD, balanceCents = 20000) {
  const otherId = 'other-user-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  await prisma.user.create({
    data: {
      id: otherId,
      email: `other-${otherId}@example.com`,
      name: 'Other Test User',
      passwordHash: 'hashed_test_password',
      language: Language.SPANISH,
      theme: Theme.LIGHT,
      baseCurrency: Currency.COP,
      isActive: true,
    },
  });
  const account = await prisma.account.create({
    data: {
      userId: otherId,
      name: 'Other Inv',
      type: AccountType.INVESTMENT,
      currency,
      balanceCents,
      isActive: true,
      createdBy: otherId,
      lastModifiedBy: otherId,
    },
  });
  return { otherId, account };
}

// ============================================================================
// Setup / Teardown
// ============================================================================

describe('Investment Actions (real actions)', () => {
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
    await createBankAccount();
    mockGetStockQuote.mockImplementation(async (symbol: string) => ({
      symbol,
      price: 15,
      priceCents: 1500,
      currency: 'USD',
    }));
    mockGetExchangeRate.mockImplementation(async () => null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // createInvestmentAccount
  // ==========================================================================

  it('creates an investment account with initial balance', async () => {
    const result = await createInvestmentAccount({
      idempotencyKey: genUUID(),
      name: 'Portafolio USD',
      currency: 'USD',
      initialBalanceCents: 500000,
    });

    expect(result.success).toBe(true);
    expect(result.data!.wasIdempotent).toBe(false);
    expect(result.data!.account.name).toBe('Portafolio USD');
    expect(result.data!.account.type).toBe('INVESTMENT');
    expect(result.data!.account.currency).toBe('USD');
    expect(result.data!.account.balanceCents).toBe(500000);

    const stored = await prisma.account.findUnique({ where: { id: result.data!.account.id } });
    expect(stored?.isActive).toBe(true);
    expect(stored?.createdBy).toBe(TEST_USER_ID);
  });

  it('is idempotent for repeated idempotency keys', async () => {
    const key = genUUID();
    await createInvestmentAccount({ idempotencyKey: key, name: 'Dupe', currency: 'USD' });

    const second = await createInvestmentAccount({
      idempotencyKey: key,
      name: 'Dupe',
      currency: 'USD',
    });

    expect(second.success).toBe(true);
    expect(second.data!.wasIdempotent).toBe(true);
    expect(second.data!.account.name).toBe('Dupe');
  });

  it('rejects invalid input with a validation error', async () => {
    const result = await createInvestmentAccount({
      idempotencyKey: 'not-a-uuid',
      name: '',
      currency: 'XXX' as 'USD',
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  // ==========================================================================
  // getInvestmentAccounts
  // ==========================================================================

  it("lists only the user's active investment accounts", async () => {
    await createInvestmentAccount({ idempotencyKey: genUUID(), name: 'A', currency: 'USD' });
    await createInvestmentAccount({ idempotencyKey: genUUID(), name: 'B', currency: 'EUR' });
    await createInvestmentAccountRow(); // direct row, same user

    const result = await getInvestmentAccounts({});

    expect(result.success).toBe(true);
    const names = result.data!.map((a: { name: string }) => a.name);
    expect(names).toContain('A');
    expect(names).toContain('B');
  });

  // ==========================================================================
  // depositToInvestment
  // ==========================================================================

  it('converts COP to USD and updates both balances', async () => {
    const inv = await createInvestmentAccountRow();
    const bank = await getBankAccount();

    const result = await depositToInvestment({
      idempotencyKey: genUUID(),
      investmentAccountId: inv.id,
      fromBankAccountId: bank.id,
      amountCents: 800000,
      exchangeRate: 4000,
    });

    expect(result.success).toBe(true);
    // 800000 COP-cents / 4000 (COP per USD) = 200 USD-cents = $2.00
    expect(result.data!.transaction.amountCents).toBe(200);
    expect(result.data!.transaction.currency).toBe('USD');
    // Deposits are booked as a double-entry pair: TRANSFER_IN on the investment
    // account (mirroring TRANSFER_OUT on the bank account).
    expect(result.data!.transaction.type).toBe('TRANSFER_IN');

    const invAfter = await prisma.account.findUniqueOrThrow({ where: { id: inv.id } });
    const bankAfter = await prisma.account.findUniqueOrThrow({ where: { id: bank.id } });
    expect(Number(invAfter.balanceCents)).toBe(200);
    expect(Number(bankAfter.balanceCents)).toBe(200000);

    const txs = await prisma.transaction.findMany({ where: { userId: TEST_USER_ID } });
    const transferTxs = txs.filter((t) => t.type !== 'INCOME');
    expect(transferTxs).toHaveLength(2);
    const debit = transferTxs.find((t) => t.type === 'TRANSFER_OUT');
    const credit = transferTxs.find((t) => t.type === 'TRANSFER_IN');
    expect(Number(debit?.amountCents)).toBe(-800000);
    expect(debit?.currency).toBe('COP');
    expect(Number(credit?.amountCents)).toBe(200);
    expect(credit?.currency).toBe('USD');
    expect(debit?.transferId).toBe(credit?.transferId);
    expect(credit?.exchangeRate?.toString()).toBe('4000');
    expect(credit?.originalCurrency).toBe('COP');
    expect(Number(credit?.originalAmountCents)).toBe(800000);
  });

  it('is idempotent for repeated deposit keys', async () => {
    const inv = await createInvestmentAccountRow();
    const bank = await getBankAccount();
    const key = genUUID();

    const first = await depositToInvestment({
      idempotencyKey: key,
      investmentAccountId: inv.id,
      fromBankAccountId: bank.id,
      amountCents: 400000,
      exchangeRate: 4000,
    });
    expect(first.success).toBe(true);

    const second = await depositToInvestment({
      idempotencyKey: key,
      investmentAccountId: inv.id,
      fromBankAccountId: bank.id,
      amountCents: 400000,
      exchangeRate: 4000,
    });
    expect(second.success).toBe(true);
    expect(second.data!.wasIdempotent).toBe(true);

    const transferTxs = await prisma.transaction.findMany({
      where: { userId: TEST_USER_ID, type: { in: ['TRANSFER_IN', 'TRANSFER_OUT'] } },
    });
    expect(transferTxs).toHaveLength(2);
  });

  it('rejects deposits without sufficient funds', async () => {
    const inv = await createInvestmentAccountRow();
    const bank = await getBankAccount();

    const result = await depositToInvestment({
      idempotencyKey: genUUID(),
      investmentAccountId: inv.id,
      fromBankAccountId: bank.id,
      amountCents: 99999999,
      exchangeRate: 4000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient funds');
  });

  it('rejects deposits from non-bank accounts', async () => {
    const inv = await createInvestmentAccountRow();
    const result = await depositToInvestment({
      idempotencyKey: genUUID(),
      investmentAccountId: inv.id,
      fromBankAccountId: inv.id,
      amountCents: 1000,
      exchangeRate: 4000,
    });

    expect(result.success).toBe(false);
  });

  // ==========================================================================
  // buyAsset / sellAsset
  // ==========================================================================

  it('buys an asset and updates the holding and balance', async () => {
    const inv = await createInvestmentAccountRow(20000); // $200 USD

    const result = await buyAsset({
      idempotencyKey: genUUID(),
      accountId: inv.id,
      symbol: 'AAPL',
      name: 'Apple Inc.',
      quantity: '5',
      pricePerShareCents: 1500,
    });

    expect(result.success).toBe(true);
    expect(result.data!.transaction.type).toBe('INVESTMENT');
    expect(result.data!.transaction.amountCents).toBe(-7500); // negative = outflow

    const invAfter = await prisma.account.findUniqueOrThrow({ where: { id: inv.id } });
    expect(Number(invAfter.balanceCents)).toBe(12500); // 20000 - 5*1500

    const holding = await prisma.investmentAssetHolding.findFirstOrThrow({
      where: { accountId: inv.id },
    });
    expect(holding.quantity.toString()).toBe('5');
    expect(Number(holding.avgCostCents)).toBe(1500);
  });

  it('rejects buying with insufficient balance', async () => {
    const inv = await createInvestmentAccountRow(1000); // $10 USD
    mockGetStockQuote.mockImplementation(async (symbol: string) => ({
      symbol,
      price: 50,
      priceCents: 5000,
      currency: 'USD',
    }));

    const result = await buyAsset({
      idempotencyKey: genUUID(),
      accountId: inv.id,
      symbol: 'TSLA',
      name: 'Tesla',
      quantity: '10',
      pricePerShareCents: 5000, // $500 per share
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient funds');
  });

  it('rejects buying when the market price has moved beyond ±2%', async () => {
    const inv = await createInvestmentAccountRow(20000);
    mockGetStockQuote.mockImplementation(async (symbol: string) => ({
      symbol,
      price: 50,
      priceCents: 5000,
      currency: 'USD',
    }));

    const result = await buyAsset({
      idempotencyKey: genUUID(),
      accountId: inv.id,
      symbol: 'AAPL',
      name: 'Apple Inc.',
      quantity: '1',
      pricePerShareCents: 1500, // quote is 5000 → 233% off
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('PRICE_MISMATCH');
  });

  it('sells an asset and credits the balance', async () => {
    const inv = await createInvestmentAccountRow(20000);
    await buyAsset({
      idempotencyKey: genUUID(),
      accountId: inv.id,
      symbol: 'AAPL',
      name: 'Apple Inc.',
      quantity: '5',
      pricePerShareCents: 1500,
    });

    const holding = await prisma.investmentAssetHolding.findFirstOrThrow({
      where: { accountId: inv.id },
    });

    // The sell payload uses 1600; align the quote so the ±2% check passes.
    mockGetStockQuote.mockImplementation(async (symbol: string) => ({
      symbol,
      price: 16,
      priceCents: 1600,
      currency: 'USD',
    }));

    const result = await sellAsset({
      idempotencyKey: genUUID(),
      holdingId: holding.id,
      quantity: '2',
      pricePerShareCents: 1600,
    });

    expect(result.success).toBe(true);
    expect(result.data!.transaction.type).toBe('INVESTMENT');
    expect(result.data!.transaction.amountCents).toBe(3200); // positive = inflow
    const holdingAfter = await prisma.investmentAssetHolding.findFirstOrThrow({
      where: { accountId: inv.id },
    });
    expect(holdingAfter.quantity.toString()).toBe('3');
    const invAfter = await prisma.account.findUniqueOrThrow({ where: { id: inv.id } });
    expect(Number(invAfter.balanceCents)).toBe(12500 + 3200); // +2*1600
  });

  it('rejects selling more quantity than the holding owns', async () => {
    const inv = await createInvestmentAccountRow(20000);
    await buyAsset({
      idempotencyKey: genUUID(),
      accountId: inv.id,
      symbol: 'AAPL',
      name: 'Apple Inc.',
      quantity: '2',
      pricePerShareCents: 1500,
    });

    const holding = await prisma.investmentAssetHolding.findFirstOrThrow({
      where: { accountId: inv.id },
    });

    const result = await sellAsset({
      idempotencyKey: genUUID(),
      holdingId: holding.id,
      quantity: '5', // only 2 owned
      pricePerShareCents: 1500,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('INSUFFICIENT_QUANTITY');
  });

  // ==========================================================================
  // withdrawFromInvestment
  // ==========================================================================

  it('withdraws USD to COP and updates both balances', async () => {
    const inv = await createInvestmentAccountRow(20000); // $200 USD
    const bank = await getBankAccount();

    const result = await withdrawFromInvestment({
      idempotencyKey: genUUID(),
      investmentAccountId: inv.id,
      toBankAccountId: bank.id,
      amountCents: 10000, // $100 USD
      exchangeRate: 4000,
    });

    expect(result.success).toBe(true);
    // credit on the bank account (COP): 10000 * 4000 = 40000000 cents
    expect(result.data!.transaction.amountCents).toBe(40000000);
    expect(result.data!.transaction.currency).toBe('COP');
    expect(result.data!.transaction.type).toBe('TRANSFER_IN');

    const invAfter = await prisma.account.findUniqueOrThrow({ where: { id: inv.id } });
    const bankAfter = await prisma.account.findUniqueOrThrow({ where: { id: bank.id } });
    expect(Number(invAfter.balanceCents)).toBe(10000);
    expect(Number(bankAfter.balanceCents)).toBe(1000000 + 40000000);

    // The investment account also carries its INVESTMENT funding tx (20000);
    // only the double-entry transfer pair is counted here.
    const txs = await prisma.transaction.findMany({ where: { userId: TEST_USER_ID } });
    const transferTxs = txs.filter((t) => t.type === 'TRANSFER_IN' || t.type === 'TRANSFER_OUT');
    expect(transferTxs).toHaveLength(2);
    const debit = transferTxs.find((t) => t.type === 'TRANSFER_OUT');
    const credit = transferTxs.find((t) => t.type === 'TRANSFER_IN');
    expect(Number(debit?.amountCents)).toBe(-10000);
    expect(debit?.currency).toBe('USD');
    expect(Number(credit?.amountCents)).toBe(40000000);
    expect(credit?.currency).toBe('COP');
    expect(debit?.transferId).toBe(credit?.transferId);
    expect(credit?.exchangeRate?.toString()).toBe('4000');
    expect(credit?.originalCurrency).toBe('USD');
    expect(Number(credit?.originalAmountCents)).toBe(10000);
  });

  it('rejects withdrawals without sufficient investment funds', async () => {
    const inv = await createInvestmentAccountRow(10000); // $100 USD
    const bank = await getBankAccount();

    const result = await withdrawFromInvestment({
      idempotencyKey: genUUID(),
      investmentAccountId: inv.id,
      toBankAccountId: bank.id,
      amountCents: 20000,
      exchangeRate: 4000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient funds');
  });

  it('rejects withdrawals from a non-investment source account', async () => {
    const bank = await getBankAccount();
    const anotherBank = await createBankAccount(500000);

    const result = await withdrawFromInvestment({
      idempotencyKey: genUUID(),
      investmentAccountId: bank.id, // SAVINGS — not an investment account
      toBankAccountId: anotherBank.id,
      amountCents: 1000,
      exchangeRate: 4000,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
    expect(result.error).toContain('Source must be an investment account');
  });

  it('is idempotent for repeated withdrawal keys', async () => {
    const inv = await createInvestmentAccountRow(20000);
    const bank = await getBankAccount();
    const key = genUUID();

    const first = await withdrawFromInvestment({
      idempotencyKey: key,
      investmentAccountId: inv.id,
      toBankAccountId: bank.id,
      amountCents: 1000,
      exchangeRate: 4000,
    });
    expect(first.success).toBe(true);

    const second = await withdrawFromInvestment({
      idempotencyKey: key,
      investmentAccountId: inv.id,
      toBankAccountId: bank.id,
      amountCents: 1000,
      exchangeRate: 4000,
    });
    expect(second.success).toBe(true);
    expect(second.data!.wasIdempotent).toBe(true);

    const transferTxs = await prisma.transaction.findMany({
      where: { userId: TEST_USER_ID, type: { in: ['TRANSFER_IN', 'TRANSFER_OUT'] } },
    });
    expect(transferTxs).toHaveLength(2);
  });

  // ==========================================================================
  // getCurrentExchangeRate
  // ==========================================================================

  it('returns an unavailable source when the FX provider is down', async () => {
    mockGetExchangeRate.mockImplementation(async () => null);

    const result = await getCurrentExchangeRate({ currency: 'USD' });

    expect(result.success).toBe(true);
    expect(result.data!.rate).toBeNull();
    expect(result.data!.currency).toBe('USD');
    expect(result.data!.source).toBe('unavailable');
  });

  it('returns the inverted live rate when the FX provider responds', async () => {
    // getExchangeRate('COP','USD') returns "foreign units per 1 COP" (~0.00025);
    // the action inverts it to "COP per 1 USD" (~4000).
    mockGetExchangeRate.mockImplementation(async () => 0.00025);

    const result = await getCurrentExchangeRate({ currency: 'USD' });

    expect(result.success).toBe(true);
    expect(result.data!.rate).toBe(4000);
    expect(result.data!.source).toBe('live');
  });

  // ==========================================================================
  // getInvestmentPerformance
  // ==========================================================================

  it('computes a coherent performance series for an investment account', async () => {
    const created = await createInvestmentAccount({
      idempotencyKey: genUUID(),
      name: 'Perf',
      currency: 'USD',
      initialBalanceCents: 100000,
    });
    const accountId = created.data!.account.id;

    await buyAsset({
      idempotencyKey: genUUID(),
      accountId,
      symbol: 'AAPL',
      name: 'Apple Inc.',
      quantity: '5',
      pricePerShareCents: 1500,
    });

    const result = await getInvestmentPerformance({ accountId });

    expect(result.success).toBe(true);
    expect(result.data!.accountId).toBe(accountId);
    expect(result.data!.name).toBe('Perf');
    expect(result.data!.currency).toBe('USD');
    // Net invested = initial INCOME (100000); INVESTMENT buy is not funding.
    expect(result.data!.totalInvestedCents).toBe(100000);
    // Cash = cached balance after the buy; holdings = 5 * 1500.
    expect(result.data!.cashBalanceCents).toBe(92500);
    expect(result.data!.holdingsMarketValueCents).toBe(7500);
    expect(result.data!.totalValueCents).toBe(100000);
    // Coherency invariant: return = market value − invested.
    expect(result.data!.totalReturnCents).toBe(
      result.data!.totalValueCents - result.data!.totalInvestedCents
    );
    expect(result.data!.totalReturnCents).toBe(0);
    // Series includes each funding tx plus the final "today" point.
    expect(result.data!.series.length).toBeGreaterThanOrEqual(2);
    expect(result.data!.series[0].investedCents).toBe(100000);
  });

  it('rejects performance lookups for non-investment accounts', async () => {
    const bank = await getBankAccount();

    const result = await getInvestmentPerformance({ accountId: bank.id });

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
  });

  // ==========================================================================
  // Error paths: rate limiting, ownership, inactive/not-found accounts
  // ==========================================================================

  it('rejects investment creation when rate limited', async () => {
    vi.mocked(checkApiRateLimit).mockResolvedValueOnce({ allowed: false });

    const result = await createInvestmentAccount({
      idempotencyKey: genUUID(),
      name: 'Limited',
      currency: 'USD',
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('RATE_LIMITED');
  });

  it('rejects deposits when rate limited', async () => {
    const inv = await createInvestmentAccountRow();
    const bank = await getBankAccount();
    vi.mocked(checkApiRateLimit).mockResolvedValueOnce({ allowed: false });

    const result = await depositToInvestment({
      idempotencyKey: genUUID(),
      investmentAccountId: inv.id,
      fromBankAccountId: bank.id,
      amountCents: 1000,
      exchangeRate: 4000,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('RATE_LIMITED');
  });

  it('rejects buy orders when rate limited', async () => {
    const inv = await createInvestmentAccountRow(20000);
    vi.mocked(checkApiRateLimit).mockResolvedValueOnce({ allowed: false });

    const result = await buyAsset({
      idempotencyKey: genUUID(),
      accountId: inv.id,
      symbol: 'AAPL',
      name: 'Apple Inc.',
      quantity: '1',
      pricePerShareCents: 1500,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('RATE_LIMITED');
  });

  it('rejects sell orders when rate limited', async () => {
    const inv = await createInvestmentAccountRow(20000);
    await buyAsset({
      idempotencyKey: genUUID(),
      accountId: inv.id,
      symbol: 'AAPL',
      name: 'Apple Inc.',
      quantity: '1',
      pricePerShareCents: 1500,
    });
    const holding = await prisma.investmentAssetHolding.findFirstOrThrow({
      where: { accountId: inv.id },
    });
    vi.mocked(checkApiRateLimit).mockResolvedValueOnce({ allowed: false });

    const result = await sellAsset({
      idempotencyKey: genUUID(),
      holdingId: holding.id,
      quantity: '1',
      pricePerShareCents: 1500,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('RATE_LIMITED');
  });

  it('rejects stock price lookups when rate limited', async () => {
    vi.mocked(checkApiRateLimit).mockResolvedValueOnce({ allowed: false });

    const result = await getStockPrice({ symbol: 'AAPL' });

    expect(result.success).toBe(false);
    expect(result.code).toBe('RATE_LIMITED');
  });

  it('rejects stock search when rate limited', async () => {
    vi.mocked(checkApiRateLimit).mockResolvedValueOnce({ allowed: false });

    const result = await searchStocksAction({ symbol: 'AAPL' });

    expect(result.success).toBe(false);
    expect(result.code).toBe('RATE_LIMITED');
  });

  it('rejects deposits into an inactive investment account', async () => {
    const inv = await createInvestmentAccountRow();
    await prisma.account.update({
      where: { id: inv.id },
      data: { isActive: false },
    });
    const bank = await getBankAccount();

    const result = await depositToInvestment({
      idempotencyKey: genUUID(),
      investmentAccountId: inv.id,
      fromBankAccountId: bank.id,
      amountCents: 1000,
      exchangeRate: 4000,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('INACTIVE_ACCOUNT');
  });

  it('rejects deposits into another user investment account', async () => {
    const { account: otherInv } = await createOtherUserAccount();
    const bank = await getBankAccount();

    const result = await depositToInvestment({
      idempotencyKey: genUUID(),
      investmentAccountId: otherInv.id,
      fromBankAccountId: bank.id,
      amountCents: 1000,
      exchangeRate: 4000,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
  });

  it('rejects deposits from a missing bank account', async () => {
    const inv = await createInvestmentAccountRow();

    const result = await depositToInvestment({
      idempotencyKey: genUUID(),
      investmentAccountId: inv.id,
      fromBankAccountId: 'cmissingaccount123456789',
      amountCents: 1000,
      exchangeRate: 4000,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
  });

  it('rejects buy orders on a non-investment account', async () => {
    const bank = await getBankAccount();

    const result = await buyAsset({
      idempotencyKey: genUUID(),
      accountId: bank.id,
      symbol: 'AAPL',
      name: 'Apple Inc.',
      quantity: '1',
      pricePerShareCents: 1500,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
  });

  it('rejects buy orders on another user investment account', async () => {
    const { account: otherInv } = await createOtherUserAccount();

    const result = await buyAsset({
      idempotencyKey: genUUID(),
      accountId: otherInv.id,
      symbol: 'AAPL',
      name: 'Apple Inc.',
      quantity: '1',
      pricePerShareCents: 1500,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
  });

  it('rejects sells of another user holding', async () => {
    const { otherId, account: otherInv } = await createOtherUserAccount();
    const holding = await prisma.investmentAssetHolding.create({
      data: {
        accountId: otherInv.id,
        symbol: 'AAPL',
        name: 'Apple Inc.',
        quantity: 5,
        avgCostCents: 1500,
        currency: 'USD',
        currentPriceCents: 1500,
        createdBy: otherId,
        lastModifiedBy: otherId,
      },
    });

    const result = await sellAsset({
      idempotencyKey: genUUID(),
      holdingId: holding.id,
      quantity: '1',
      pricePerShareCents: 1500,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
  });

  it('rejects transaction listings for a non-investment account', async () => {
    const bank = await getBankAccount();

    const result = await getInvestmentTransactions({ accountId: bank.id, page: 1, pageSize: 10 });

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
  });

  it('rejects withdrawals to a non-COP destination', async () => {
    const inv = await createInvestmentAccountRow(20000);
    const otherInv = await createInvestmentAccountRow(1000);

    const result = await withdrawFromInvestment({
      idempotencyKey: genUUID(),
      investmentAccountId: inv.id,
      toBankAccountId: otherInv.id, // INVESTMENT USD, not a COP bank account
      amountCents: 1000,
      exchangeRate: 4000,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
  });

  it('returns the current stock quote on success', async () => {
    const result = await getStockPrice({ symbol: 'AAPL' });

    expect(result.success).toBe(true);
    expect(result.data!.symbol).toBe('AAPL');
    expect(result.data!.priceCents).toBe(1500);
  });

  it('returns stock search matches', async () => {
    const result = await searchStocksAction({ symbol: 'AAPL' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ symbol: 'AAPL' })])
    );
  });

  it('returns an empty update summary when there are no holdings', async () => {
    const result = await updateAllAssetPrices({});

    expect(result.success).toBe(true);
    expect(result.data!.updated).toBe(0);
    expect(result.data!.failed).toBe(0);
    expect(result.data!.prices).toEqual([]);
  });

  it('updates all active holdings prices in one transaction', async () => {
    const inv = await createInvestmentAccountRow(20000);
    await buyAsset({
      idempotencyKey: genUUID(),
      accountId: inv.id,
      symbol: 'AAPL',
      name: 'Apple Inc.',
      quantity: '2',
      pricePerShareCents: 1500,
    });

    const result = await updateAllAssetPrices({});

    expect(result.success).toBe(true);
    expect(result.data!.updated).toBe(1);
    expect(result.data!.failed).toBe(0);
    expect(result.data!.prices[0].symbol).toBe('AAPL');
  });

  // ==========================================================================
  // getInvestmentTransactions
  // ==========================================================================

  it('lists transactions of the investment account with pagination', async () => {
    const inv = await createInvestmentAccountRow(20000);
    const bank = await getBankAccount();

    await depositToInvestment({
      idempotencyKey: genUUID(),
      investmentAccountId: inv.id,
      fromBankAccountId: bank.id,
      amountCents: 400000,
      exchangeRate: 4000,
    });
    await buyAsset({
      idempotencyKey: genUUID(),
      accountId: inv.id,
      symbol: 'AAPL',
      name: 'Apple Inc.',
      quantity: '2',
      pricePerShareCents: 1500,
    });

    const result = await getInvestmentTransactions({ accountId: inv.id, page: 1, pageSize: 10 });

    expect(result.success).toBe(true);
    expect(result.data!.transactions.length).toBeGreaterThanOrEqual(3);
    const amounts = result.data!.transactions.map((t: { amountCents: number }) => t.amountCents);
    expect(amounts).toContain(-3000); // buy outflow (2 shares @ 1500)
    expect(amounts).toContain(100); // deposit credit (400000/4000)
    expect(result.data!.page).toBe(1);
    expect(result.data!.total).toBeGreaterThanOrEqual(3);
  });
});
