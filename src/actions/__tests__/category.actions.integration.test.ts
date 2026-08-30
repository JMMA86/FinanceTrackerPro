/**
 * Category Actions Integration Tests
 * Tests CRUD for user-defined + system categories
 *
 * Run with: npm run test:coverage
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient, Currency, Language, Theme, VariableExpenseCategory } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ZodError } from 'zod';
import { AppError } from '@/lib/errors/api-errors';

const TEST_DB_URL = process.env.DATABASE_URL!;
const TEST_USER_ID = 'cat-test-user-' + Date.now();
const TEST_USER_ID_2 = 'cat-test-user-2-' + Date.now();

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
      email: `cat-test-${Date.now()}@example.com`,
      name: 'Category Test User',
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

vi.mock('@/services/reconciliation.service', () => ({
  getTrueBalance: vi.fn().mockResolvedValue(1000000),
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

// ============================================================================
// Test helpers
// ============================================================================

async function createTestUser(id: string) {
  return prisma.user.create({
    data: {
      id,
      email: `cat-test-${id}@example.com`,
      name: 'Category Test User',
      passwordHash: 'hashed_test_password',
      language: Language.SPANISH,
      theme: Theme.LIGHT,
      baseCurrency: Currency.COP,
      isActive: true,
    },
  });
}

async function createSystemCategory(name: string, type: VariableExpenseCategory) {
  return prisma.category.create({
    data: {
      name,
      type,
      color: '#3B82F6',
      icon: 'test-icon',
      isActive: true,
    },
  });
}

async function createUserCategory(
  userId: string,
  overrides: Partial<{
    name: string;
    type: VariableExpenseCategory;
    color: string;
    icon: string;
  }> = {}
) {
  return prisma.category.create({
    data: {
      name: overrides.name ?? 'User Category',
      type: overrides.type ?? 'OTHER',
      color: overrides.color ?? '#EC4899',
      icon: overrides.icon ?? 'tag',
      userId,
      isActive: true,
      createdBy: userId,
      lastModifiedBy: userId,
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
  await prisma.category.deleteMany({
    where: { OR: [{ userId: TEST_USER_ID }, { userId: TEST_USER_ID_2 }] },
  });
  await prisma.user.deleteMany({
    where: { OR: [{ id: TEST_USER_ID }, { id: TEST_USER_ID_2 }] },
  });
}

import * as categoryActions from '../category.actions';
import { createTransaction } from '../transaction.actions';

// ============================================================================
// Tests
// ============================================================================

describe('Category Actions Integration', () => {
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
    await createTestUser(TEST_USER_ID);
    await createTestUser(TEST_USER_ID_2);
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // getCategories
  // ==========================================================================

  describe('getCategories', () => {
    it('should return system categories + own categories', async () => {
      const _sysCat = await createSystemCategory('System Cat', 'GROCERIES');
      const _userCat = await createUserCategory(TEST_USER_ID, { name: 'My Cat' });
      const _otherCat = await createUserCategory(TEST_USER_ID_2, { name: 'Other Cat' });

      const result = await categoryActions.getCategories({});

      expect(result.success).toBe(true);
      const names = result.data!.map((c) => c.name);
      expect(names).toContain('System Cat');
      expect(names).toContain('My Cat');
      expect(names).not.toContain('Other Cat');
    });

    it('should not return soft-deleted categories', async () => {
      await createSystemCategory('Active Sys', 'GROCERIES');
      await createUserCategory(TEST_USER_ID, { name: 'Deleted Cat' });
      await prisma.category.updateMany({
        where: { name: 'Deleted Cat' },
        data: { isActive: false, deletedAt: new Date() },
      });

      const result = await categoryActions.getCategories({});

      expect(result.success).toBe(true);
      const names = result.data!.map((c) => c.name);
      expect(names).toContain('Active Sys');
      expect(names).not.toContain('Deleted Cat');
    });
  });

  // ==========================================================================
  // createCategory
  // ==========================================================================

  describe('createCategory', () => {
    it('should create a user category', async () => {
      const result = await categoryActions.createCategory({
        name: 'New Category',
        type: 'ENTERTAINMENT',
        color: '#F59E0B',
        icon: 'film',
      });

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('New Category');
      expect(result.data!.type).toBe('ENTERTAINMENT');
      expect(result.data!.color).toBe('#F59E0B');
      expect(result.data!.userId).toBe(TEST_USER_ID);
    });

    it('should apply defaults when optional fields omitted', async () => {
      const result = await categoryActions.createCategory({
        name: 'Minimal Cat',
      });

      expect(result.success).toBe(true);
      expect(result.data!.type).toBe('OTHER');
      expect(result.data!.color).toBeNull();
      expect(result.data!.icon).toBeNull();
    });

    it('should reject invalid hex color', async () => {
      const result = await categoryActions.createCategory({
        name: 'Bad Color',
        color: 'not-a-color',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });
  });

  // ==========================================================================
  // updateCategory
  // ==========================================================================

  describe('updateCategory', () => {
    it('should update own category', async () => {
      const cat = await createUserCategory(TEST_USER_ID, { name: 'Old Name' });

      const result = await categoryActions.updateCategory({
        categoryId: cat.id,
        name: 'New Name',
        color: '#10B981',
      });

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('New Name');
      expect(result.data!.color).toBe('#10B981');
    });

    it('should reject updating a system category', async () => {
      const sysCat = await createSystemCategory('System Cat', 'GROCERIES');

      const result = await categoryActions.updateCategory({
        categoryId: sysCat.id,
        name: 'Hacked',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('should reject updating another users category', async () => {
      const otherCat = await createUserCategory(TEST_USER_ID_2, { name: 'Other Cat' });

      const result = await categoryActions.updateCategory({
        categoryId: otherCat.id,
        name: 'Stolen',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('should return NotFound for non-existent category', async () => {
      const result = await categoryActions.updateCategory({
        categoryId: 'clh1234567890abcdefghij',
        name: 'Ghost',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });
  });

  // ==========================================================================
  // deleteCategory
  // ==========================================================================

  describe('deleteCategory', () => {
    it('should soft-delete own category', async () => {
      const cat = await createUserCategory(TEST_USER_ID, { name: 'To Delete' });

      const result = await categoryActions.deleteCategory({ categoryId: cat.id });

      expect(result.success).toBe(true);

      const deleted = await prisma.category.findUnique({ where: { id: cat.id } });
      expect(deleted!.isActive).toBe(false);
      expect(deleted!.deletedAt).not.toBeNull();
    });

    it('should reject deleting a system category', async () => {
      const sysCat = await createSystemCategory('System Cat', 'GROCERIES');

      const result = await categoryActions.deleteCategory({ categoryId: sysCat.id });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('should reject deleting another users category', async () => {
      const otherCat = await createUserCategory(TEST_USER_ID_2, { name: 'Other Cat' });

      const result = await categoryActions.deleteCategory({ categoryId: otherCat.id });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('should return NotFound for already deleted category', async () => {
      const cat = await createUserCategory(TEST_USER_ID, { name: 'Already Deleted' });
      await prisma.category.update({
        where: { id: cat.id },
        data: { isActive: false, deletedAt: new Date() },
      });

      const result = await categoryActions.deleteCategory({ categoryId: cat.id });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });
  });

  // ==========================================================================
  // Category ownership in transactions
  // ==========================================================================

  describe('transaction category validation', () => {
    it('should reject transaction with category from another user', async () => {
      const otherCat = await createUserCategory(TEST_USER_ID_2, { name: 'Other Cat' });
      const account = await prisma.account.create({
        data: {
          userId: TEST_USER_ID,
          name: 'Test Account',
          type: 'SAVINGS',
          balanceCents: 100000,
          currency: 'COP',
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      const result = await createTransaction({
        idempotencyKey: crypto.randomUUID(),
        accountId: account.id,
        type: 'EXPENSE',
        amountCents: -5000,
        currency: 'COP',
        categoryId: otherCat.id,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('should allow transaction with system category', async () => {
      const sysCat = await createSystemCategory('System Cat', 'GROCERIES');
      const account = await prisma.account.create({
        data: {
          userId: TEST_USER_ID,
          name: 'Test Account',
          type: 'SAVINGS',
          balanceCents: 100000,
          currency: 'COP',
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      const result = await createTransaction({
        idempotencyKey: crypto.randomUUID(),
        accountId: account.id,
        type: 'EXPENSE',
        amountCents: -5000,
        currency: 'COP',
        categoryId: sysCat.id,
      });

      expect(result.success).toBe(true);
      expect(result.data!.transaction.categoryId).toBe(sysCat.id);
    });
  });
});
