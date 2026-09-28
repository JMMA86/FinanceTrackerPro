/**
 * Transaction Investment Guard Integration Tests
 *
 * Decision #5: INVESTMENT trades are managed exclusively from the investments
 * module (their edit/reverse actions recompute the holding ledger). The generic
 * `updateTransaction` / `deleteTransaction` must reject INVESTMENT rows with
 * `INVESTMENT_MANAGED_ELSEWHERE`.
 *
 * Run with: npm run test:coverage
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient, Currency, AccountType, Language, Theme } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AppError } from '@/lib/errors/api-errors';

const TEST_DB_URL = process.env.DATABASE_URL!;
const TEST_USER_ID = 'tx-inv-guard-user-' + Date.now();

const genUUID = (): string => crypto.randomUUID();

let pool: Pool;
let prisma: PrismaClient;

// ============================================================================
// Mocks
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
      email: `tx-inv-guard-${Date.now()}@example.com`,
      name: 'Investment Guard Test User',
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

vi.mock('@/lib/utils/action-wrapper', () => ({
  safeAction: vi.fn((fn) => {
    return async (...args: unknown[]) => {
      try {
        const result = await fn(...args);
        return { success: true, data: result };
      } catch (error) {
        if (error instanceof AppError) {
          return { success: false, error: error.message, code: error.code };
        }
        return { success: false, error: (error as Error).message, code: 'INTERNAL_SERVER_ERROR' };
      }
    };
  }),
}));

vi.mock('@/services/rate-limit.service', () => ({
  checkApiRateLimit: vi.fn(() => Promise.resolve({ allowed: true })),
  recordApiAttempt: vi.fn().mockResolvedValue('attempt-1'),
  markApiAttemptSuccess: vi.fn().mockResolvedValue(undefined),
}));

import { updateTransaction, deleteTransaction } from '../transaction.actions';
import { getSession } from '@/lib/auth/session';

const mockGetSession = vi.mocked(getSession);

// ============================================================================
// Test helpers
// ============================================================================

async function createUser() {
  return prisma.user.create({
    data: {
      id: TEST_USER_ID,
      email: `tx-inv-guard-${Date.now()}@example.com`,
      name: 'Test User',
      passwordHash: 'hashed_test_password',
      language: Language.SPANISH,
      theme: Theme.LIGHT,
      baseCurrency: Currency.COP,
      isActive: true,
    },
  });
}

async function createInvestmentAccount() {
  return prisma.account.create({
    data: {
      userId: TEST_USER_ID,
      name: 'Investment',
      type: AccountType.INVESTMENT,
      balanceCents: 0,
      currency: Currency.USD,
      isActive: true,
      createdBy: TEST_USER_ID,
      lastModifiedBy: TEST_USER_ID,
    },
  });
}

async function createInvestmentTrade(accountId: string) {
  return prisma.transaction.create({
    data: {
      idempotencyKey: genUUID(),
      userId: TEST_USER_ID,
      accountId,
      type: 'INVESTMENT',
      amountCents: -5000,
      currency: Currency.USD,
      description: 'Buy 5 AAPL @ 10.00',
      assetSymbol: 'AAPL',
      assetQuantity: 5,
      assetPricePerShareCents: 1000,
      assetTradeType: 'BUY',
      date: new Date(),
      isActive: true,
      createdBy: TEST_USER_ID,
      lastModifiedBy: TEST_USER_ID,
    },
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('Transaction Investment Guard Integration', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
    await prisma.transaction.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.account.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await createUser();
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.account.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.$disconnect();
    await pool.end();
  });

  beforeEach(async () => {
    await prisma.transaction.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.account.deleteMany({ where: { userId: TEST_USER_ID } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects updateTransaction on an INVESTMENT trade', async () => {
    const account = await createInvestmentAccount();
    const trade = await createInvestmentTrade(account.id);

    const result = await updateTransaction({
      transactionId: trade.id,
      description: 'Should not be editable here',
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('INVESTMENT_MANAGED_ELSEWHERE');

    // The trade is untouched and still active.
    const unchanged = await prisma.transaction.findUniqueOrThrow({ where: { id: trade.id } });
    expect(unchanged.description).toBe('Buy 5 AAPL @ 10.00');
    expect(unchanged.isActive).toBe(true);
  });

  it('rejects updateTransaction without a session', async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const result = await updateTransaction({ transactionId: 'clh1234567890abcdefghij' });

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
  });

  it('rejects deleteTransaction on an INVESTMENT trade', async () => {
    const account = await createInvestmentAccount();
    const trade = await createInvestmentTrade(account.id);

    const result = await deleteTransaction({ transactionId: trade.id });

    expect(result.success).toBe(false);
    expect(result.code).toBe('INVESTMENT_MANAGED_ELSEWHERE');

    const unchanged = await prisma.transaction.findUniqueOrThrow({ where: { id: trade.id } });
    expect(unchanged.isActive).toBe(true);
  });
});
