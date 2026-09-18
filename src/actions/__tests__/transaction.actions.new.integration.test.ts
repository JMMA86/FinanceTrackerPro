/**
 * Transaction Actions Integration Tests — New Features
 * Tests dateTo fix (inclusive) and rate limiting
 *
 * Run with: npm run test:coverage
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import {
  PrismaClient,
  Currency,
  AccountType,
  Language,
  Theme,
  VariableExpenseCategory,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ZodError } from 'zod';
import { AppError } from '@/lib/errors/api-errors';

const TEST_DB_URL = process.env.DATABASE_URL!;
const TEST_USER_ID = 'tx-new-test-user-' + Date.now();

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
      email: `tx-new-test-${Date.now()}@example.com`,
      name: 'Transaction Test User',
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

vi.mock('@/lib/repositories', () => ({
  getTransactionRepository: vi.fn(() => ({
    findMany: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('@/services/reconciliation.service', () => ({
  getTrueBalance: vi.fn().mockResolvedValue(1000000),
}));

// ============================================================================
// Rate limit mock (controlled per test)
// ============================================================================

let rateLimitAllowed = true;

vi.mock('@/services/rate-limit.service', () => ({
  checkApiRateLimit: vi.fn(() => Promise.resolve({ allowed: rateLimitAllowed })),
  recordApiAttempt: vi.fn().mockResolvedValue('attempt-1'),
  markApiAttemptSuccess: vi.fn().mockResolvedValue(undefined),
}));

// ============================================================================
// Test helpers
// ============================================================================

async function createTestUser() {
  return prisma.user.create({
    data: {
      id: TEST_USER_ID,
      email: `tx-new-test-${Date.now()}@example.com`,
      name: 'Transaction Test User',
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
  overrides: Partial<{ balanceCents: number }> = {}
) {
  return prisma.account.create({
    data: {
      userId,
      name: 'Test Account',
      type: AccountType.SAVINGS,
      balanceCents: overrides.balanceCents ?? 100000,
      currency: Currency.COP,
      isActive: true,
      createdBy: userId,
      lastModifiedBy: userId,
    },
  });
}

async function cleanupTestData() {
  await prisma.transaction.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.account.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
}

import * as transactionActions from '../transaction.actions';

// ============================================================================
// Tests
// ============================================================================

describe('Transaction Actions — New Features', () => {
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
    await cleanupTestData();
    await createTestUser();
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // dateTo inclusive fix (B1)
  // ==========================================================================

  describe('getAllTransactions dateTo filter', () => {
    it('should include transactions on the dateTo day', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      const targetDate = new Date('2024-06-15T23:59:00.000Z');

      await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: 'EXPENSE',
          amountCents: -5000,
          currency: Currency.COP,
          description: 'Late night expense',
          date: targetDate,
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      const result = await transactionActions.getAllTransactions({
        page: 1,
        pageSize: 10,
        dateFrom: new Date('2024-06-15'),
        dateTo: new Date('2024-06-15'),
      });

      expect(result.success).toBe(true);
      expect(result.data!.transactions).toHaveLength(1);
      expect(result.data!.transactions[0].description).toBe('Late night expense');
    });

    it('should exclude transactions after dateTo', async () => {
      const account = await createTestAccount(TEST_USER_ID);

      await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: 'EXPENSE',
          amountCents: -5000,
          currency: Currency.COP,
          description: 'Next day expense',
          date: new Date('2024-06-16T00:00:01.000Z'),
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      const result = await transactionActions.getAllTransactions({
        page: 1,
        pageSize: 10,
        dateFrom: new Date('2024-06-15'),
        dateTo: new Date('2024-06-15'),
      });

      expect(result.success).toBe(true);
      expect(result.data!.transactions).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Rate limiting
  // ==========================================================================

  describe('createTransaction rate limit', () => {
    it('should allow transaction when under rate limit', async () => {
      const account = await createTestAccount(TEST_USER_ID);

      const result = await transactionActions.createTransaction({
        idempotencyKey: crypto.randomUUID(),
        accountId: account.id,
        type: 'EXPENSE',
        amountCents: -5000,
        currency: Currency.COP,
      });

      expect(result.success).toBe(true);
      expect(result.data!.wasIdempotent).toBe(false);
    });

    it('should reject transaction when rate limit is reached', async () => {
      rateLimitAllowed = false;
      const account = await createTestAccount(TEST_USER_ID);

      const result = await transactionActions.createTransaction({
        idempotencyKey: crypto.randomUUID(),
        accountId: account.id,
        type: 'EXPENSE',
        amountCents: -5000,
        currency: Currency.COP,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('RATE_LIMITED');
    });
  });

  describe('deleteTransaction rate limit', () => {
    it('should reject deletion when rate limit is reached', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: 'EXPENSE',
          amountCents: -5000,
          currency: Currency.COP,
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      rateLimitAllowed = false;

      const result = await transactionActions.deleteTransaction({ transactionId: tx.id });

      expect(result.success).toBe(false);
      expect(result.code).toBe('RATE_LIMITED');
    });
  });

  // ==========================================================================
  // INCOME auto-categorization (system SALARY category)
  // ==========================================================================

  describe('createTransaction INCOME auto-categorization', () => {
    let createdSystemCategoryId: string | null = null;

    // The test DB is not seeded, so make sure a system SALARY category exists
    // (the action resolves it by TYPE, never by a hardcoded id).
    beforeAll(async () => {
      const existing = await prisma.category.findFirst({
        where: { type: VariableExpenseCategory.SALARY, userId: null, isActive: true },
        select: { id: true },
      });
      if (!existing) {
        const created = await prisma.category.create({
          data: {
            name: `tx-new-system-${Date.now()}`,
            type: VariableExpenseCategory.SALARY,
            userId: null,
            isActive: true,
            createdBy: 'system',
            lastModifiedBy: 'system',
          },
        });
        createdSystemCategoryId = created.id;
      }
    });

    afterAll(async () => {
      if (createdSystemCategoryId) {
        await prisma.category
          .delete({ where: { id: createdSystemCategoryId } })
          .catch(() => undefined);
      }
    });

    async function configureSalary() {
      await prisma.salaryConfiguration.create({
        data: {
          userId: TEST_USER_ID,
          amountCents: BigInt(2_000_000),
          currency: Currency.COP,
          frequency: 'MONTHLY',
          payDays: [15],
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });
    }

    it('leaves the category null when the user has no active salary configuration', async () => {
      const account = await createTestAccount(TEST_USER_ID);

      const result = await transactionActions.createTransaction({
        idempotencyKey: crypto.randomUUID(),
        accountId: account.id,
        type: 'INCOME',
        amountCents: 10_000,
        currency: Currency.COP,
      });

      expect(result.success).toBe(true);
      const stored = await prisma.transaction.findUniqueOrThrow({
        where: { id: result.data!.transaction.id },
      });
      expect(stored.categoryId).toBeNull();
    });

    it('files an uncategorized INCOME under the system SALARY category when a salary is configured', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      await configureSalary();
      const salaryCategory = await prisma.category.findFirstOrThrow({
        where: { type: VariableExpenseCategory.SALARY, userId: null, isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      const result = await transactionActions.createTransaction({
        idempotencyKey: crypto.randomUUID(),
        accountId: account.id,
        type: 'INCOME',
        amountCents: 10_000,
        currency: Currency.COP,
      });

      expect(result.success).toBe(true);
      const stored = await prisma.transaction.findUniqueOrThrow({
        where: { id: result.data!.transaction.id },
      });
      expect(stored.categoryId).toBe(salaryCategory.id);
    });

    it('preserves an explicit category on an INCOME (never overrides it)', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      await configureSalary();
      const ownCategory = await prisma.category.create({
        data: {
          name: `tx-auto-${Date.now()}`,
          type: VariableExpenseCategory.OTHER,
          userId: TEST_USER_ID,
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      const result = await transactionActions.createTransaction({
        idempotencyKey: crypto.randomUUID(),
        accountId: account.id,
        type: 'INCOME',
        amountCents: 10_000,
        currency: Currency.COP,
        categoryId: ownCategory.id,
      });

      expect(result.success).toBe(true);
      const stored = await prisma.transaction.findUniqueOrThrow({
        where: { id: result.data!.transaction.id },
      });
      expect(stored.categoryId).toBe(ownCategory.id);
    });

    it('does NOT auto-categorize an EXPENSE even when a salary is configured', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      await configureSalary();

      const result = await transactionActions.createTransaction({
        idempotencyKey: crypto.randomUUID(),
        accountId: account.id,
        type: 'EXPENSE',
        amountCents: -5_000,
        currency: Currency.COP,
      });

      expect(result.success).toBe(true);
      const stored = await prisma.transaction.findUniqueOrThrow({
        where: { id: result.data!.transaction.id },
      });
      expect(stored.categoryId).toBeNull();
    });

    it('does NOT auto-categorize an INCOME when the salary configuration is inactive', async () => {
      const account = await createTestAccount(TEST_USER_ID);
      await prisma.salaryConfiguration.create({
        data: {
          userId: TEST_USER_ID,
          amountCents: BigInt(2_000_000),
          currency: Currency.COP,
          frequency: 'MONTHLY',
          payDays: [15],
          isActive: false,
          deletedAt: new Date(),
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      const result = await transactionActions.createTransaction({
        idempotencyKey: crypto.randomUUID(),
        accountId: account.id,
        type: 'INCOME',
        amountCents: 10_000,
        currency: Currency.COP,
      });

      expect(result.success).toBe(true);
      const stored = await prisma.transaction.findUniqueOrThrow({
        where: { id: result.data!.transaction.id },
      });
      expect(stored.categoryId).toBeNull();
    });
  });
});
