/**
 * Investment Actions Integration Tests (real actions)
 * Exercises the actual Server Actions (createInvestmentAccount, depositToInvestment,
 * buyAsset, sellAsset, getInvestmentAccounts, getInvestmentTransactions) against the
 * dedicated test database — unlike investment.actions.integration.test.ts which
 * reimplements the logic with direct Prisma calls.
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

vi.mock('@/services/stock-price.service', () => ({
  getStockQuote: vi.fn(async () => ({ symbol: 'AAPL', priceCents: 1500000, currency: 'USD' })),
  searchStocks: vi.fn(async () => [
    { symbol: 'AAPL', name: 'Apple Inc.', priceCents: 1500000, currency: 'USD' },
  ]),
}));

import {
  createInvestmentAccount,
  depositToInvestment,
  buyAsset,
  sellAsset,
  getInvestmentAccounts,
  getInvestmentTransactions,
} from '../investment.actions';

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
    const bank = await prisma.account.findFirstOrThrow({
      where: { userId: TEST_USER_ID, type: 'SAVINGS' },
    });

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
    expect(result.data!.transaction.type).toBe('INVESTMENT');

    const invAfter = await prisma.account.findUniqueOrThrow({ where: { id: inv.id } });
    const bankAfter = await prisma.account.findUniqueOrThrow({ where: { id: bank.id } });
    expect(invAfter.balanceCents).toBe(200);
    expect(bankAfter.balanceCents).toBe(200000);

    const txs = await prisma.transaction.findMany({ where: { userId: TEST_USER_ID } });
    const transferTxs = txs.filter((t) => t.type !== 'INCOME');
    expect(transferTxs).toHaveLength(2);
    const debit = transferTxs.find((t) => t.type === 'TRANSFER_OUT');
    const credit = transferTxs.find((t) => t.type === 'INVESTMENT');
    expect(debit?.amountCents).toBe(-800000);
    expect(debit?.currency).toBe('COP');
    expect(credit?.amountCents).toBe(200);
    expect(credit?.currency).toBe('USD');
    expect(debit?.transferId).toBe(credit?.transferId);
    expect(credit?.exchangeRate?.toString()).toBe('4000');
  });

  it('rejects deposits without sufficient funds', async () => {
    const inv = await createInvestmentAccountRow();
    const bank = await prisma.account.findFirstOrThrow({
      where: { userId: TEST_USER_ID, type: 'SAVINGS' },
    });

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
    expect(invAfter.balanceCents).toBe(12500); // 20000 - 5*1500

    const holding = await prisma.investmentAssetHolding.findFirstOrThrow({
      where: { accountId: inv.id },
    });
    expect(holding.quantity.toString()).toBe('5');
    expect(holding.avgCostCents).toBe(1500);
  });

  it('rejects buying with insufficient balance', async () => {
    const inv = await createInvestmentAccountRow(1000); // $10 USD

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
    expect(invAfter.balanceCents).toBe(12500 + 3200); // +2*1600
  });

  // ==========================================================================
  // getInvestmentTransactions
  // ==========================================================================

  it('lists transactions of the investment account with pagination', async () => {
    const inv = await createInvestmentAccountRow(20000);
    const bank = await prisma.account.findFirstOrThrow({
      where: { userId: TEST_USER_ID, type: 'SAVINGS' },
    });

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
