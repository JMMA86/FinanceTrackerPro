/**
 * Transaction Update Integration Tests
 * Tests updateTransaction action for editing transactions atomically
 *
 * Run with: npm run test:coverage
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient, Currency, AccountType, Language, Theme } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AppError } from '@/lib/errors/api-errors';

const TEST_DB_URL = process.env.DATABASE_URL!;
const TEST_USER_ID = 'tx-update-test-user-' + Date.now();
const TEST_USER_ID_2 = 'tx-update-test-user-2-' + Date.now();

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
      email: `tx-update-test-${Date.now()}@example.com`,
      name: 'Transaction Update Test User',
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
// Rate limit mock (controlled per test)
// ============================================================================

let rateLimitAllowed = true;
let trueBalanceValue = 100000;

vi.mock('@/services/rate-limit.service', () => ({
  checkApiRateLimit: vi.fn(() => Promise.resolve({ allowed: rateLimitAllowed })),
  recordApiAttempt: vi.fn().mockResolvedValue('attempt-1'),
  markApiAttemptSuccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/reconciliation.service', () => ({
  getTrueBalance: vi.fn(() => Promise.resolve(trueBalanceValue)),
}));

// ============================================================================
// Test helpers
// ============================================================================

async function createTestUser(id: string, emailSuffix: string) {
  return prisma.user.create({
    data: {
      id,
      email: `tx-update-${emailSuffix}-${Date.now()}@example.com`,
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

async function createTestCategory(
  userId: string | null,
  overrides: Partial<{ name: string; isActive: boolean }> = {}
) {
  return prisma.category.create({
    data: {
      name: overrides.name ?? 'Test Category',
      isActive: overrides.isActive ?? true,
      userId,
      createdBy: userId ?? 'system',
      lastModifiedBy: userId ?? 'system',
    },
  });
}

async function cleanupTestData() {
  await prisma.transaction.deleteMany({
    where: { OR: [{ userId: TEST_USER_ID }, { userId: TEST_USER_ID_2 }] },
  });
  await prisma.category.deleteMany({
    where: { OR: [{ userId: TEST_USER_ID }, { userId: TEST_USER_ID_2 }] },
  });
  await prisma.account.deleteMany({
    where: { OR: [{ userId: TEST_USER_ID }, { userId: TEST_USER_ID_2 }] },
  });
  await prisma.user.deleteMany({ where: { OR: [{ id: TEST_USER_ID }, { id: TEST_USER_ID_2 }] } });
}

import * as transactionActions from '../transaction.actions';

// ============================================================================
// Tests
// ============================================================================

describe('Transaction Update Integration', () => {
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
    rateLimitAllowed = true;
    trueBalanceValue = 100000;
    await cleanupTestData();
    await createTestUser(TEST_USER_ID, 'user1');
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Basic update
  // ==========================================================================

  describe('updateTransaction basics', () => {
    it('should update only description without changing balance', async () => {
      const account = await createTestAccount(TEST_USER_ID, { balanceCents: 50000 });
      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: 'EXPENSE',
          amountCents: -5000,
          currency: Currency.COP,
          description: 'Original description',
          date: new Date('2024-06-01'),
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      const result = await transactionActions.updateTransaction({
        transactionId: tx.id,
        description: 'Updated description',
      });

      expect(result.success).toBe(true);
      expect(result.data!.transaction.description).toBe('Updated description');
      expect(result.data!.transaction.amountCents).toBe(-5000);

      const updatedAccount = await prisma.account.findUnique({ where: { id: account.id } });
      expect(updatedAccount?.balanceCents).toBe(50000);
    });

    it('should update EXPENSE amount and adjust balance correctly', async () => {
      const account = await createTestAccount(TEST_USER_ID, { balanceCents: 50000 });
      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: 'EXPENSE',
          amountCents: -5000,
          currency: Currency.COP,
          description: 'Original expense',
          date: new Date('2024-06-01'),
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      // trueBalance includes the -5000 expense
      trueBalanceValue = 45000;

      const result = await transactionActions.updateTransaction({
        transactionId: tx.id,
        amountCents: -8000,
      });

      expect(result.success).toBe(true);
      expect(result.data!.transaction.amountCents).toBe(-8000);

      const updatedAccount = await prisma.account.findUnique({ where: { id: account.id } });
      // balance = 50000 - (-5000) + (-8000) = 47000
      expect(updatedAccount?.balanceCents).toBe(47000);
    });

    it('should update INCOME amount and increase balance', async () => {
      const account = await createTestAccount(TEST_USER_ID, { balanceCents: 30000 });
      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: 'INCOME',
          amountCents: 10000,
          currency: Currency.COP,
          description: 'Original income',
          date: new Date('2024-06-01'),
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      const result = await transactionActions.updateTransaction({
        transactionId: tx.id,
        amountCents: 15000,
      });

      expect(result.success).toBe(true);
      expect(result.data!.transaction.amountCents).toBe(15000);

      const updatedAccount = await prisma.account.findUnique({ where: { id: account.id } });
      // balance = 30000 - 10000 + 15000 = 35000
      expect(updatedAccount?.balanceCents).toBe(35000);
    });

    it('should update date', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: 'EXPENSE',
          amountCents: -5000,
          currency: Currency.COP,
          description: 'Dated expense',
          date: new Date('2024-06-01'),
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      const newDate = new Date('2024-07-15');
      const result = await transactionActions.updateTransaction({
        transactionId: tx.id,
        date: newDate,
      });

      expect(result.success).toBe(true);
      expect(result.data!.transaction.date.toISOString()).toBe(newDate.toISOString());
    });
  });

  // ==========================================================================
  // Funds validation
  // ==========================================================================

  describe('updateTransaction funds validation', () => {
    it('should reject EXPENSE amount increase when funds are insufficient', async () => {
      const account = await createTestAccount(TEST_USER_ID, { balanceCents: 10000 });
      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: 'EXPENSE',
          amountCents: -5000,
          currency: Currency.COP,
          description: 'Original expense',
          date: new Date('2024-06-01'),
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      // trueBalance = 5000 (10000 - 5000), balanceWithoutTx = 5000 - (-5000) = 10000
      // projected with -12000 = 10000 + (-12000) = -2000 → insufficient
      trueBalanceValue = 5000;

      const result = await transactionActions.updateTransaction({
        transactionId: tx.id,
        amountCents: -12000,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('INSUFFICIENT_FUNDS');

      // Verify nothing changed
      const unchangedTx = await prisma.transaction.findUnique({ where: { id: tx.id } });
      expect(unchangedTx?.amountCents).toBe(-5000);
      expect(unchangedTx?.description).toBe('Original expense');

      const unchangedAccount = await prisma.account.findUnique({ where: { id: account.id } });
      expect(unchangedAccount?.balanceCents).toBe(10000);
    });

    it('should allow EXPENSE amount decrease even with low balance', async () => {
      const account = await createTestAccount(TEST_USER_ID, { balanceCents: 8000 });
      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: 'EXPENSE',
          amountCents: -5000,
          currency: Currency.COP,
          description: 'Original expense',
          date: new Date('2024-06-01'),
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      // trueBalance = 3000 (8000 - 5000), balanceWithoutTx = 3000 - (-5000) = 8000
      // projected with -3000 = 8000 + (-3000) = 5000 → sufficient
      trueBalanceValue = 3000;

      const result = await transactionActions.updateTransaction({
        transactionId: tx.id,
        amountCents: -3000,
      });

      expect(result.success).toBe(true);
      expect(result.data!.transaction.amountCents).toBe(-3000);

      const updatedAccount = await prisma.account.findUnique({ where: { id: account.id } });
      // balance = 8000 - (-5000) + (-3000) = 10000
      expect(updatedAccount?.balanceCents).toBe(10000);
    });
  });

  // ==========================================================================
  // Sign validation
  // ==========================================================================

  describe('updateTransaction sign validation', () => {
    it('should reject EXPENSE with positive amount', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: 'EXPENSE',
          amountCents: -5000,
          currency: Currency.COP,
          description: 'Expense',
          date: new Date('2024-06-01'),
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      const result = await transactionActions.updateTransaction({
        transactionId: tx.id,
        amountCents: 5000,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('should reject INCOME with negative amount', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: 'INCOME',
          amountCents: 5000,
          currency: Currency.COP,
          description: 'Income',
          date: new Date('2024-06-01'),
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      const result = await transactionActions.updateTransaction({
        transactionId: tx.id,
        amountCents: -5000,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });
  });

  // ==========================================================================
  // Category handling
  // ==========================================================================

  describe('updateTransaction category', () => {
    it('should assign own category to transaction', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      const category = await createTestCategory(TEST_USER_ID, { name: 'My Category' });
      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: 'EXPENSE',
          amountCents: -5000,
          currency: Currency.COP,
          description: 'Uncategorized',
          date: new Date('2024-06-01'),
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      const result = await transactionActions.updateTransaction({
        transactionId: tx.id,
        categoryId: category.id,
      });

      expect(result.success).toBe(true);
      expect(result.data!.transaction.categoryId).toBe(category.id);
    });

    it('should assign system category (null userId) to transaction', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      const category = await createTestCategory(null, { name: 'System Category' });
      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: 'EXPENSE',
          amountCents: -5000,
          currency: Currency.COP,
          description: 'Uncategorized',
          date: new Date('2024-06-01'),
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      const result = await transactionActions.updateTransaction({
        transactionId: tx.id,
        categoryId: category.id,
      });

      expect(result.success).toBe(true);
      expect(result.data!.transaction.categoryId).toBe(category.id);
    });

    it('should reject category belonging to another user', async () => {
      await createTestUser(TEST_USER_ID_2, 'user2');
      const otherCategory = await createTestCategory(TEST_USER_ID_2, { name: 'Other Category' });
      const account = await createTestAccount(TEST_USER_ID);
      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: 'EXPENSE',
          amountCents: -5000,
          currency: Currency.COP,
          description: 'Uncategorized',
          date: new Date('2024-06-01'),
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      const result = await transactionActions.updateTransaction({
        transactionId: tx.id,
        categoryId: otherCategory.id,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('should remove category when categoryId is null', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      const category = await createTestCategory(TEST_USER_ID, { name: 'To Remove' });
      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: 'EXPENSE',
          amountCents: -5000,
          currency: Currency.COP,
          description: 'Categorized',
          date: new Date('2024-06-01'),
          categoryId: category.id,
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      const result = await transactionActions.updateTransaction({
        transactionId: tx.id,
        categoryId: null,
      });

      expect(result.success).toBe(true);
      expect(result.data!.transaction.categoryId).toBeNull();
    });

    it('should reject inactive category', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      const category = await createTestCategory(TEST_USER_ID, {
        name: 'Inactive',
        isActive: false,
      });
      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: 'EXPENSE',
          amountCents: -5000,
          currency: Currency.COP,
          description: 'Uncategorized',
          date: new Date('2024-06-01'),
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      const result = await transactionActions.updateTransaction({
        transactionId: tx.id,
        categoryId: category.id,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });
  });

  // ==========================================================================
  // Permissions
  // ==========================================================================

  describe('updateTransaction permissions', () => {
    it('should reject updating transaction belonging to another user', async () => {
      await createTestUser(TEST_USER_ID_2, 'user2');
      const otherAccount = await createTestAccount(TEST_USER_ID_2);
      const otherTx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID_2,
          accountId: otherAccount.id,
          type: 'EXPENSE',
          amountCents: -5000,
          currency: Currency.COP,
          description: 'Other user expense',
          date: new Date('2024-06-01'),
          isActive: true,
          createdBy: TEST_USER_ID_2,
          lastModifiedBy: TEST_USER_ID_2,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      const result = await transactionActions.updateTransaction({
        transactionId: otherTx.id,
        description: 'Hacked description',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('should reject updating soft-deleted transaction', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: 'EXPENSE',
          amountCents: -5000,
          currency: Currency.COP,
          description: 'Deleted expense',
          date: new Date('2024-06-01'),
          isActive: false,
          deletedAt: new Date(),
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      const result = await transactionActions.updateTransaction({
        transactionId: tx.id,
        description: 'Updated description',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });

    it('should reject updating transaction in inactive account', async () => {
      const account = await createTestAccount(TEST_USER_ID, { isActive: false });
      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: 'EXPENSE',
          amountCents: -5000,
          currency: Currency.COP,
          description: 'Inactive account expense',
          date: new Date('2024-06-01'),
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      const result = await transactionActions.updateTransaction({
        transactionId: tx.id,
        description: 'Updated description',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('INACTIVE_ACCOUNT');
    });
  });

  // ==========================================================================
  // Rate limiting
  // ==========================================================================

  describe('updateTransaction rate limit', () => {
    it('should reject update when rate limit is reached', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: 'EXPENSE',
          amountCents: -5000,
          currency: Currency.COP,
          description: 'Rate limit test',
          date: new Date('2024-06-01'),
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      rateLimitAllowed = false;

      const result = await transactionActions.updateTransaction({
        transactionId: tx.id,
        description: 'Updated',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('RATE_LIMITED');
    });
  });
});
