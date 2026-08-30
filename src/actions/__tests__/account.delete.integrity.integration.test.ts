/**
 * Account Delete Integrity Integration Tests
 * Tests Rule 2: deleteBankAccount only with balance 0
 * Tests pocket balance checks and investment holding checks
 *
 * Run with: npm run test:coverage
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient, Currency, AccountType, Language, Theme } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AppError } from '@/lib/errors/api-errors';

const TEST_DB_URL = process.env.DATABASE_URL!;
const TEST_USER_ID = 'acct-delete-int-test-user-' + Date.now();
const TEST_USER_ID_2 = 'acct-delete-int-test-user-2-' + Date.now();

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
  return { revalidatePath };
});

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(() =>
    Promise.resolve({
      userId: TEST_USER_ID,
      email: `acct-delete-int-test-${Date.now()}@example.com`,
      name: 'Account Delete Integrity Test User',
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

// NOTE: no rate-limit mock needed — deleteBankAccount has no rate limiting
// NOTE: we do NOT mock @/services/reconciliation.service — getTrueBalance is REAL

// ============================================================================
// Test helpers
// ============================================================================

async function createTestUser(id: string, emailSuffix: string) {
  return prisma.user.create({
    data: {
      id,
      email: `acct-delete-int-${emailSuffix}-${Date.now()}@example.com`,
      name: 'Test User',
      passwordHash: 'hashed_test_password',
      language: Language.SPANISH,
      theme: Theme.LIGHT,
      baseCurrency: Currency.COP,
      isActive: true,
    },
  });
}

async function createTestAccount(
  userId: string,
  overrides: Partial<{
    name: string;
    type: AccountType;
    balanceCents: number;
    currency: Currency;
    isActive: boolean;
    parentAccountId: string;
  }> = {}
) {
  return prisma.account.create({
    data: {
      userId,
      name: overrides.name ?? 'Test Account',
      type: overrides.type ?? AccountType.SAVINGS,
      balanceCents: overrides.balanceCents ?? 0,
      currency: overrides.currency ?? Currency.COP,
      isActive: overrides.isActive ?? true,
      parentAccountId: overrides.parentAccountId ?? null,
      createdBy: userId,
      lastModifiedBy: userId,
    },
  });
}

async function createTestTransaction(
  accountId: string,
  overrides: Partial<{
    type: 'INCOME' | 'EXPENSE';
    amountCents: number;
    description: string;
    isActive: boolean;
  }> = {}
) {
  return prisma.transaction.create({
    data: {
      idempotencyKey: crypto.randomUUID(),
      userId: TEST_USER_ID,
      accountId,
      type: overrides.type ?? 'INCOME',
      amountCents: overrides.amountCents ?? 10000,
      currency: Currency.COP,
      description: overrides.description ?? 'Test transaction',
      date: new Date(),
      isActive: overrides.isActive ?? true,
      createdBy: TEST_USER_ID,
      lastModifiedBy: TEST_USER_ID,
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    },
  });
}

async function createTestHolding(accountId: string, symbol: string) {
  return prisma.investmentAssetHolding.create({
    data: {
      accountId,
      symbol,
      name: symbol,
      quantity: 10,
      avgCostCents: 10000,
      currency: Currency.USD,
      currentPriceCents: 12000,
      isActive: true,
      createdBy: TEST_USER_ID,
      lastModifiedBy: TEST_USER_ID,
    },
  });
}

async function cleanupTestData() {
  await prisma.investmentAssetHolding.deleteMany({
    where: { account: { userId: { in: [TEST_USER_ID, TEST_USER_ID_2] } } },
  });
  await prisma.transaction.deleteMany({
    where: { OR: [{ userId: TEST_USER_ID }, { userId: TEST_USER_ID_2 }] },
  });
  await prisma.account.deleteMany({
    where: { OR: [{ userId: TEST_USER_ID }, { userId: TEST_USER_ID_2 }] },
  });
  await prisma.user.deleteMany({ where: { OR: [{ id: TEST_USER_ID }, { id: TEST_USER_ID_2 }] } });
}

import * as accountActions from '../account.actions';

// ============================================================================
// Tests
// ============================================================================

describe('Account Delete Integrity Integration', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
    await pool.end();
  });

  beforeEach(async () => {
    await cleanupTestData();
    await createTestUser(TEST_USER_ID, 'user1');
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Rule 2 — deleteBankAccount only with zero balance
  // ==========================================================================

  describe('deleteBankAccount balance validation', () => {
    it('should reject deleting account with non-zero balance', async () => {
      const account = await createTestAccount(TEST_USER_ID, {
        name: 'Account With Money',
        balanceCents: 100000,
      });

      // Create a transaction so trueBalance != 0
      await createTestTransaction(account.id, {
        type: 'INCOME',
        amountCents: 100000,
        description: 'Deposit',
      });

      const result = await accountActions.deleteBankAccount({ accountId: account.id });

      expect(result.success).toBe(false);
      expect(result.code).toBe('ACCOUNT_HAS_BALANCE');

      // Account still active
      const stillActive = await prisma.account.findUnique({ where: { id: account.id } });
      expect(stillActive?.isActive).toBe(true);
    });

    it('should soft-delete account with zero balance and preserve transactions', async () => {
      const account = await createTestAccount(TEST_USER_ID, {
        name: 'Empty Account',
        balanceCents: 0,
      });

      // Create a transaction but balance is 0 (e.g., INCOME + EXPENSE cancel out)
      await createTestTransaction(account.id, {
        type: 'INCOME',
        amountCents: 50000,
        description: 'Income',
      });
      await createTestTransaction(account.id, {
        type: 'EXPENSE',
        amountCents: -50000,
        description: 'Expense',
      });

      const result = await accountActions.deleteBankAccount({ accountId: account.id });

      expect(result.success).toBe(true);

      // Account soft-deleted
      const deletedAccount = await prisma.account.findUnique({ where: { id: account.id } });
      expect(deletedAccount?.isActive).toBe(false);
      expect(deletedAccount?.deletedAt).not.toBeNull();

      // Transactions still exist
      const txCount = await prisma.transaction.count({
        where: { accountId: account.id },
      });
      expect(txCount).toBe(2);
    });
  });

  describe('deleteBankAccount pocket validation', () => {
    it('should reject deleting parent account when a pocket has balance', async () => {
      const parentAccount = await createTestAccount(TEST_USER_ID, {
        name: 'Parent Account',
        type: AccountType.CHECKING,
        balanceCents: 0,
      });

      const pocket = await createTestAccount(TEST_USER_ID, {
        name: 'Pocket With Funds',
        type: AccountType.POCKET,
        balanceCents: 25000,
        parentAccountId: parentAccount.id,
      });

      // Transaction in pocket so trueBalance != 0
      await createTestTransaction(pocket.id, {
        type: 'INCOME',
        amountCents: 25000,
        description: 'Pocket deposit',
      });

      const result = await accountActions.deleteBankAccount({ accountId: parentAccount.id });

      expect(result.success).toBe(false);
      expect(result.code).toBe('POCKET_HAS_BALANCE');

      // Parent still active
      const stillActive = await prisma.account.findUnique({ where: { id: parentAccount.id } });
      expect(stillActive?.isActive).toBe(true);
    });

    it('should allow deleting parent account when all pockets have zero balance', async () => {
      const parentAccount = await createTestAccount(TEST_USER_ID, {
        name: 'Parent Account',
        type: AccountType.CHECKING,
        balanceCents: 0,
      });

      await createTestAccount(TEST_USER_ID, {
        name: 'Empty Pocket',
        type: AccountType.POCKET,
        balanceCents: 0,
        parentAccountId: parentAccount.id,
      });

      const result = await accountActions.deleteBankAccount({ accountId: parentAccount.id });

      expect(result.success).toBe(true);

      const deletedParent = await prisma.account.findUnique({
        where: { id: parentAccount.id },
      });
      expect(deletedParent?.isActive).toBe(false);
    });
  });

  describe('deleteBankAccount investment holding validation', () => {
    it('should reject deleting investment account with active holdings', async () => {
      const investmentAccount = await createTestAccount(TEST_USER_ID, {
        name: 'Investment Account',
        type: AccountType.INVESTMENT,
        balanceCents: 0,
      });

      await createTestHolding(investmentAccount.id, 'AAPL');

      const result = await accountActions.deleteBankAccount({ accountId: investmentAccount.id });

      expect(result.success).toBe(false);
      expect(result.code).toBe('ACCOUNT_HAS_HOLDINGS');

      // Account still active
      const stillActive = await prisma.account.findUnique({
        where: { id: investmentAccount.id },
      });
      expect(stillActive?.isActive).toBe(true);
    });
  });
});
