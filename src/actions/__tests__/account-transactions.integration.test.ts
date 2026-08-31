/**
 * Account Transactions Integration Tests
 * Tests getAccountTransactions action for pagination, filtering, permissions, and soft-delete
 *
 * Run with: npx vitest run src/actions/__tests__/account-transactions.integration.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import {
  PrismaClient,
  Currency,
  AccountType,
  TransactionType,
  Language,
  Theme,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AppError } from '@/lib/errors/api-errors';

const TEST_DB_URL = process.env.DATABASE_URL!;
const TEST_USER_ID = 'acct-tx-test-user-' + Date.now();
const TEST_USER_ID_2 = 'acct-tx-test-user-2-' + Date.now();

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
      email: `acct-tx-test-${Date.now()}@example.com`,
      name: 'Account Transactions Test User',
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

// ============================================================================
// Test helpers
// ============================================================================

async function createTestUser(id: string, emailSuffix: string) {
  return prisma.user.create({
    data: {
      id,
      email: `acct-tx-${emailSuffix}-${Date.now()}@example.com`,
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
    balanceCents: number;
    currency: Currency;
    isActive: boolean;
  }> = {}
) {
  return prisma.account.create({
    data: {
      userId,
      name: overrides.name ?? 'Test Account',
      type: AccountType.SAVINGS,
      balanceCents: overrides.balanceCents ?? 100000,
      currency: overrides.currency ?? Currency.COP,
      isActive: overrides.isActive ?? true,
      createdBy: userId,
      lastModifiedBy: userId,
    },
  });
}

async function createTestTransaction(
  accountId: string,
  userId: string,
  overrides: Partial<{
    type: TransactionType;
    amountCents: number;
    description: string;
    date: Date;
    isActive: boolean;
  }> = {}
) {
  return prisma.transaction.create({
    data: {
      idempotencyKey: crypto.randomUUID(),
      userId,
      accountId,
      type: overrides.type ?? TransactionType.EXPENSE,
      amountCents: overrides.amountCents ?? -5000,
      currency: Currency.COP,
      description: overrides.description ?? 'Test transaction',
      date: overrides.date ?? new Date(),
      isActive: overrides.isActive ?? true,
      createdBy: userId,
      lastModifiedBy: userId,
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    },
  });
}

async function cleanupTestData() {
  await prisma.transaction.deleteMany({
    where: { OR: [{ userId: TEST_USER_ID }, { userId: TEST_USER_ID_2 }] },
  });
  await prisma.account.deleteMany({
    where: { OR: [{ userId: TEST_USER_ID }, { userId: TEST_USER_ID_2 }] },
  });
  await prisma.user.deleteMany({ where: { OR: [{ id: TEST_USER_ID }, { id: TEST_USER_ID_2 }] } });
}

import * as accountTxActions from '../account-transactions.actions';

// ============================================================================
// Tests
// ============================================================================

describe('Account Transactions Integration', () => {
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
  // Pagination
  // ==========================================================================

  describe('pagination', () => {
    it('should return 10 transactions on page 1 and 2 on page 2 (total 12)', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      for (let i = 0; i < 12; i++) {
        await createTestTransaction(account.id, TEST_USER_ID, {
          description: `Transaction ${i + 1}`,
          date: new Date(2024, 0, i + 1),
        });
      }

      const page1 = await accountTxActions.getAccountTransactions({
        accountId: account.id,
        page: 1,
      });

      expect(page1.success).toBe(true);
      expect(page1.data!.transactions).toHaveLength(10);
      expect(page1.data!.total).toBe(12);
      expect(page1.data!.page).toBe(1);
      expect(page1.data!.totalPages).toBe(2);

      const page2 = await accountTxActions.getAccountTransactions({
        accountId: account.id,
        page: 2,
      });

      expect(page2.success).toBe(true);
      expect(page2.data!.transactions).toHaveLength(2);
      expect(page2.data!.total).toBe(12);
      expect(page2.data!.page).toBe(2);
    });
  });

  // ==========================================================================
  // Search
  // ==========================================================================

  describe('search', () => {
    it('should filter transactions by description substring case-insensitively', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      await createTestTransaction(account.id, TEST_USER_ID, {
        description: 'Grocery shopping at Walmart',
        date: new Date('2024-06-01'),
      });
      await createTestTransaction(account.id, TEST_USER_ID, {
        description: 'Monthly Rent Payment',
        date: new Date('2024-06-02'),
      });
      await createTestTransaction(account.id, TEST_USER_ID, {
        description: 'GAS station fill-up',
        date: new Date('2024-06-03'),
      });

      const result = await accountTxActions.getAccountTransactions({
        accountId: account.id,
        search: 'grocery',
      });

      expect(result.success).toBe(true);
      expect(result.data!.transactions).toHaveLength(1);
      expect(result.data!.transactions[0].description).toBe('Grocery shopping at Walmart');
      expect(result.data!.total).toBe(1);
    });
  });

  // ==========================================================================
  // Type filter
  // ==========================================================================

  describe('typeFilter', () => {
    it('should return only EXPENSE transactions when filtered', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      await createTestTransaction(account.id, TEST_USER_ID, {
        type: TransactionType.EXPENSE,
        amountCents: -5000,
        description: 'Expense 1',
        date: new Date('2024-06-01'),
      });
      await createTestTransaction(account.id, TEST_USER_ID, {
        type: TransactionType.INCOME,
        amountCents: 10000,
        description: 'Income 1',
        date: new Date('2024-06-02'),
      });
      await createTestTransaction(account.id, TEST_USER_ID, {
        type: TransactionType.EXPENSE,
        amountCents: -3000,
        description: 'Expense 2',
        date: new Date('2024-06-03'),
      });

      const result = await accountTxActions.getAccountTransactions({
        accountId: account.id,
        typeFilter: 'EXPENSE',
      });

      expect(result.success).toBe(true);
      expect(result.data!.transactions).toHaveLength(2);
      expect(result.data!.transactions.every((t) => t.type === 'EXPENSE')).toBe(true);
      expect(result.data!.total).toBe(2);
    });
  });

  // ==========================================================================
  // Permissions
  // ==========================================================================

  describe('permissions', () => {
    it('should return UNAUTHORIZED for account belonging to another user', async () => {
      await createTestUser(TEST_USER_ID_2, 'user2');
      const otherAccount = await createTestAccount(TEST_USER_ID_2);
      await createTestTransaction(otherAccount.id, TEST_USER_ID_2, {
        description: 'Other user tx',
      });

      const result = await accountTxActions.getAccountTransactions({
        accountId: otherAccount.id,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('should return NOT_FOUND for non-existent account', async () => {
      const result = await accountTxActions.getAccountTransactions({
        accountId: 'cnonexistent0000000001',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });
  });

  // ==========================================================================
  // Soft delete
  // ==========================================================================

  describe('soft delete', () => {
    it('should exclude transactions with isActive=false', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      await createTestTransaction(account.id, TEST_USER_ID, {
        description: 'Active tx',
        isActive: true,
      });
      await createTestTransaction(account.id, TEST_USER_ID, {
        description: 'Deleted tx',
        isActive: false,
      });

      const result = await accountTxActions.getAccountTransactions({
        accountId: account.id,
      });

      expect(result.success).toBe(true);
      expect(result.data!.transactions).toHaveLength(1);
      expect(result.data!.transactions[0].description).toBe('Active tx');
      expect(result.data!.total).toBe(1);
    });
  });

  // ==========================================================================
  // Ordering
  // ==========================================================================

  describe('ordering', () => {
    it('should return transactions ordered by date desc (most recent first)', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      await createTestTransaction(account.id, TEST_USER_ID, {
        description: 'Older tx',
        date: new Date('2024-01-01'),
      });
      await createTestTransaction(account.id, TEST_USER_ID, {
        description: 'Newer tx',
        date: new Date('2024-12-31'),
      });
      await createTestTransaction(account.id, TEST_USER_ID, {
        description: 'Middle tx',
        date: new Date('2024-06-15'),
      });

      const result = await accountTxActions.getAccountTransactions({
        accountId: account.id,
      });

      expect(result.success).toBe(true);
      expect(result.data!.transactions).toHaveLength(3);
      expect(result.data!.transactions[0].description).toBe('Newer tx');
      expect(result.data!.transactions[1].description).toBe('Middle tx');
      expect(result.data!.transactions[2].description).toBe('Older tx');
    });
  });

  // ==========================================================================
  // Defaults
  // ==========================================================================

  describe('defaults', () => {
    it('should default to page 1 and pageSize 10 when no params provided', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      for (let i = 0; i < 5; i++) {
        await createTestTransaction(account.id, TEST_USER_ID, {
          description: `Tx ${i + 1}`,
        });
      }

      const result = await accountTxActions.getAccountTransactions({
        accountId: account.id,
      });

      expect(result.success).toBe(true);
      expect(result.data!.transactions).toHaveLength(5);
      expect(result.data!.page).toBe(1);
      expect(result.data!.pageSize).toBe(10);
      expect(result.data!.total).toBe(5);
      expect(result.data!.totalPages).toBe(1);
    });
  });
});
