/**
 * Variable Expense Actions Integration Tests
 * Tests CRUD for monitored variable-expense definitions against a real DB.
 *
 * These tests verify:
 * - createVariableExpense (required category, system/own category validation,
 *   duplicate active name, audit trail)
 * - updateVariableExpense (ownership, target clearing, currency change guard)
 * - deleteVariableExpense (soft delete only)
 * - getVariableExpenses / overview / detail / movements (ownership + filters)
 *
 * Run with: npm run test:coverage
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import {
  PrismaClient,
  Currency,
  Language,
  Theme,
  AccountType,
  VariableExpenseCategory,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ZodError } from 'zod';
import { AppError } from '@/lib/errors/api-errors';

// ============================================================================
// Test constants
// ============================================================================

const TEST_DB_URL = process.env.DATABASE_URL!;
const TEST_USER_ID = 'vtx-test-user-' + Date.now();
const FOREIGN_USER_ID = 'vtx-test-foreign-' + Date.now();
const VALID_CUID = 'clh1234567890abcdefghij';

const genUUID = (): string => crypto.randomUUID();

let pool: Pool;
let prisma: PrismaClient;

// Track every created category (system + user) so cleanup can remove the
// system ones too (user-owned ones also cascade with the user delete).
const createdCategoryIds: string[] = [];

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
      email: `vtx-test-${Date.now()}@example.com`,
      name: 'Variable Expense Test User',
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

// Mirrors the real safeAction envelope (ActionResponse) so result.success/data
// line up with production.
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

async function createTestUser(id: string, label: string) {
  return prisma.user.create({
    data: {
      id,
      email: `${id}@example.com`,
      name: label,
      passwordHash: 'hashed_test_password',
      language: Language.SPANISH,
      theme: Theme.LIGHT,
      baseCurrency: Currency.COP,
      isActive: true,
    },
  });
}

async function createCategory(
  ownerId: string | null,
  overrides: {
    name?: string;
    type?: VariableExpenseCategory;
    color?: string;
    isActive?: boolean;
  } = {}
) {
  const category = await prisma.category.create({
    data: {
      name: overrides.name ?? `vtx-cat-${genUUID()}`,
      type: overrides.type ?? VariableExpenseCategory.OTHER,
      color: overrides.color ?? '#22c55e',
      icon: 'tag',
      userId: ownerId,
      isActive: overrides.isActive ?? true,
      createdBy: ownerId,
      lastModifiedBy: ownerId,
    },
  });
  createdCategoryIds.push(category.id);
  return category;
}

async function createDefinition(
  ownerId: string,
  overrides: {
    name?: string;
    categoryId?: string | null;
    expectedTimesPerMonth?: number | null;
    expectedAmountCents?: number | null;
    currency?: Currency;
    isActive?: boolean;
  } = {}
) {
  return prisma.variableExpense.create({
    data: {
      userId: ownerId,
      name: overrides.name ?? `vtx-def-${genUUID()}`,
      description: null,
      color: null,
      icon: null,
      categoryId: overrides.categoryId ?? null,
      expectedTimesPerMonth: overrides.expectedTimesPerMonth ?? null,
      expectedAmountCents: overrides.expectedAmountCents ?? null,
      currency: overrides.currency ?? Currency.COP,
      isActive: overrides.isActive ?? true,
      createdBy: ownerId,
      lastModifiedBy: ownerId,
    },
  });
}

async function createAccount(
  ownerId: string,
  overrides: { currency?: Currency; balanceCents?: number; name?: string } = {}
) {
  return prisma.account.create({
    data: {
      userId: ownerId,
      name: overrides.name ?? 'Cuenta',
      type: AccountType.SAVINGS,
      balanceCents: overrides.balanceCents ?? 1_000_000,
      currency: overrides.currency ?? Currency.COP,
      isActive: true,
      createdBy: ownerId,
      lastModifiedBy: ownerId,
    },
  });
}

async function createExpense(
  ownerId: string,
  accountId: string,
  overrides: {
    variableExpenseId?: string | null;
    categoryId?: string | null;
    amountCents?: number;
    currency?: Currency;
    date?: Date;
    isActive?: boolean;
    description?: string;
  } = {}
) {
  return prisma.transaction.create({
    data: {
      idempotencyKey: genUUID(),
      userId: ownerId,
      accountId,
      type: 'EXPENSE',
      amountCents: overrides.amountCents ?? -5000,
      currency: overrides.currency ?? Currency.COP,
      description: overrides.description ?? 'Gasto variable',
      date: overrides.date ?? new Date(),
      categoryId: overrides.categoryId ?? null,
      variableExpenseId: overrides.variableExpenseId ?? null,
      isActive: overrides.isActive ?? true,
      createdBy: ownerId,
      lastModifiedBy: ownerId,
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    },
  });
}

async function cleanupUserData(userId: string) {
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.variableExpense.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

async function cleanupTestData() {
  await cleanupUserData(TEST_USER_ID);
  await cleanupUserData(FOREIGN_USER_ID);
  // System categories (userId null) are not cascaded by the user delete.
  if (createdCategoryIds.length > 0) {
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    createdCategoryIds.length = 0;
  }
}

import * as variableExpenseActions from '../variable-expense.actions';

// ============================================================================
// Tests
// ============================================================================

describe('Variable Expense Actions Integration', () => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

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
    await createTestUser(TEST_USER_ID, 'Variable Expense Test User');
    await createTestUser(FOREIGN_USER_ID, 'Foreign Variable Expense User');
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // createVariableExpense
  // ==========================================================================

  describe('createVariableExpense', () => {
    it('creates a definition with a user category and records the audit trail', async () => {
      const category = await createCategory(TEST_USER_ID, { name: 'Deporte' });

      const result = await variableExpenseActions.createVariableExpense({
        name: 'Fútbol',
        description: 'Partidos',
        categoryId: category.id,
        currency: 'COP',
        expectedTimesPerMonth: 4,
        expectedAmountCents: 5000,
      });

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('Fútbol');
      expect(result.data!.categoryId).toBe(category.id);
      expect(result.data!.category?.name).toBe('Deporte');
      expect(result.data!.expectedAmountCents).toBe(5000);
      expect(result.data!.currency).toBe('COP');

      const stored = await prisma.variableExpense.findUnique({
        where: { id: result.data!.id },
      });
      expect(stored!.createdBy).toBe(TEST_USER_ID);
      expect(stored!.lastModifiedBy).toBe(TEST_USER_ID);
      expect(stored!.ipAddress).toBe('127.0.0.1');
      expect(stored!.userAgent).toBe('vitest');
    });

    it('accepts a system category (userId null)', async () => {
      const systemCategory = await createCategory(null, { name: 'Sistema' });

      const result = await variableExpenseActions.createVariableExpense({
        name: 'Salidas',
        categoryId: systemCategory.id,
      });

      expect(result.success).toBe(true);
      expect(result.data!.categoryId).toBe(systemCategory.id);
      expect(result.data!.currency).toBe('COP'); // default
    });

    it('rejects a category owned by another user with UNAUTHORIZED', async () => {
      const foreignCategory = await createCategory(FOREIGN_USER_ID, { name: 'Ajena' });

      const result = await variableExpenseActions.createVariableExpense({
        name: 'Fútbol',
        categoryId: foreignCategory.id,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('rejects an inactive category with NOT_FOUND', async () => {
      const inactiveCategory = await createCategory(TEST_USER_ID, {
        name: 'Inactiva',
        isActive: false,
      });

      const result = await variableExpenseActions.createVariableExpense({
        name: 'Fútbol',
        categoryId: inactiveCategory.id,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });

    it('rejects a duplicate active name with VALIDATION_ERROR', async () => {
      const category = await createCategory(TEST_USER_ID);
      await createDefinition(TEST_USER_ID, { name: 'Fútbol', categoryId: category.id });

      const result = await variableExpenseActions.createVariableExpense({
        name: 'Fútbol',
        categoryId: category.id,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('requires a categoryId', async () => {
      const result = await variableExpenseActions.createVariableExpense({ name: 'Sin categoría' });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });
  });

  // ==========================================================================
  // updateVariableExpense
  // ==========================================================================

  describe('updateVariableExpense', () => {
    it('updates the name and monitoring targets', async () => {
      const category = await createCategory(TEST_USER_ID);
      const definition = await createDefinition(TEST_USER_ID, {
        name: 'Old',
        categoryId: category.id,
      });

      const result = await variableExpenseActions.updateVariableExpense({
        variableExpenseId: definition.id,
        name: 'New',
        expectedTimesPerMonth: 6,
        expectedAmountCents: 1200,
      });

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('New');
      expect(result.data!.expectedTimesPerMonth).toBe(6);
      expect(result.data!.expectedAmountCents).toBe(1200);

      const stored = await prisma.variableExpense.findUnique({ where: { id: definition.id } });
      expect(stored!.lastModifiedBy).toBe(TEST_USER_ID);
    });

    it('clears the monitoring targets when null is sent', async () => {
      const definition = await createDefinition(TEST_USER_ID, {
        expectedTimesPerMonth: 4,
        expectedAmountCents: 5000,
      });

      const result = await variableExpenseActions.updateVariableExpense({
        variableExpenseId: definition.id,
        expectedTimesPerMonth: null,
        expectedAmountCents: null,
      });

      expect(result.success).toBe(true);
      expect(result.data!.expectedTimesPerMonth).toBeNull();
      expect(result.data!.expectedAmountCents).toBeNull();
    });

    it("rejects another user's definition with UNAUTHORIZED", async () => {
      const foreignDefinition = await createDefinition(FOREIGN_USER_ID, { name: 'Ajena' });

      const result = await variableExpenseActions.updateVariableExpense({
        variableExpenseId: foreignDefinition.id,
        name: 'Hijacked',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('returns NOT_FOUND for an unknown definition', async () => {
      const result = await variableExpenseActions.updateVariableExpense({
        variableExpenseId: VALID_CUID,
        name: 'Ghost',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });

    it('rejects a currency change while active transactions are linked', async () => {
      const definition = await createDefinition(TEST_USER_ID, { currency: Currency.COP });
      const account = await createAccount(TEST_USER_ID, { currency: Currency.COP });
      await createExpense(TEST_USER_ID, account.id, {
        variableExpenseId: definition.id,
        currency: Currency.COP,
      });

      const result = await variableExpenseActions.updateVariableExpense({
        variableExpenseId: definition.id,
        currency: 'USD',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('allows a currency change when no active transactions are linked', async () => {
      const definition = await createDefinition(TEST_USER_ID, { currency: Currency.COP });

      const result = await variableExpenseActions.updateVariableExpense({
        variableExpenseId: definition.id,
        currency: 'USD',
      });

      expect(result.success).toBe(true);
      expect(result.data!.currency).toBe('USD');
    });

    it('validates the new category ownership', async () => {
      const definition = await createDefinition(TEST_USER_ID, { name: 'Own' });
      const foreignCategory = await createCategory(FOREIGN_USER_ID, { name: 'Ajena' });

      const result = await variableExpenseActions.updateVariableExpense({
        variableExpenseId: definition.id,
        categoryId: foreignCategory.id,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });
  });

  // ==========================================================================
  // deleteVariableExpense
  // ==========================================================================

  describe('deleteVariableExpense', () => {
    it('soft-deletes the definition without removing the row', async () => {
      const definition = await createDefinition(TEST_USER_ID, { name: 'To delete' });

      const result = await variableExpenseActions.deleteVariableExpense({
        variableExpenseId: definition.id,
      });

      expect(result.success).toBe(true);
      const stored = await prisma.variableExpense.findUnique({ where: { id: definition.id } });
      expect(stored).not.toBeNull();
      expect(stored!.isActive).toBe(false);
      expect(stored!.deletedAt).not.toBeNull();
      expect(stored!.lastModifiedBy).toBe(TEST_USER_ID);
    });

    it("rejects another user's definition with UNAUTHORIZED", async () => {
      const foreignDefinition = await createDefinition(FOREIGN_USER_ID, { name: 'Ajena' });

      const result = await variableExpenseActions.deleteVariableExpense({
        variableExpenseId: foreignDefinition.id,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('returns NOT_FOUND for an already deleted definition', async () => {
      const definition = await createDefinition(TEST_USER_ID, { isActive: false });

      const result = await variableExpenseActions.deleteVariableExpense({
        variableExpenseId: definition.id,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });
  });

  // ==========================================================================
  // getVariableExpenses
  // ==========================================================================

  describe('getVariableExpenses', () => {
    it('returns only active definitions by default and includes the category', async () => {
      const category = await createCategory(TEST_USER_ID, { name: 'Deporte' });
      await createDefinition(TEST_USER_ID, { name: 'Activa', categoryId: category.id });
      await createDefinition(TEST_USER_ID, { name: 'Inactiva', isActive: false });
      await createDefinition(FOREIGN_USER_ID, { name: 'Ajena' });

      const result = await variableExpenseActions.getVariableExpenses({});

      expect(result.success).toBe(true);
      expect(result.data!.map((definition) => definition.name)).toEqual(['Activa']);
      expect(result.data![0].category?.name).toBe('Deporte');
    });

    it('includes inactive definitions when includeInactive is true', async () => {
      await createDefinition(TEST_USER_ID, { name: 'Activa' });
      await createDefinition(TEST_USER_ID, { name: 'Inactiva', isActive: false });

      const result = await variableExpenseActions.getVariableExpenses({ includeInactive: true });

      expect(result.success).toBe(true);
      expect(result.data!.map((definition) => definition.name).sort()).toEqual([
        'Activa',
        'Inactiva',
      ]);
    });
  });

  // ==========================================================================
  // getVariableExpensesOverview
  // ==========================================================================

  describe('getVariableExpensesOverview', () => {
    it('aggregates only the session user transactions', async () => {
      const definition = await createDefinition(TEST_USER_ID, { name: 'Fútbol' });
      const account = await createAccount(TEST_USER_ID);
      await createExpense(TEST_USER_ID, account.id, {
        variableExpenseId: definition.id,
        amountCents: -5000,
        date: new Date(currentYear, currentMonth - 1, 10),
      });

      // Foreign data that must never leak into the aggregation.
      const foreignDefinition = await createDefinition(FOREIGN_USER_ID, { name: 'Ajena' });
      const foreignAccount = await createAccount(FOREIGN_USER_ID);
      await createExpense(FOREIGN_USER_ID, foreignAccount.id, {
        variableExpenseId: foreignDefinition.id,
        amountCents: -9000,
        date: new Date(currentYear, currentMonth - 1, 10),
      });

      const result = await variableExpenseActions.getVariableExpensesOverview({
        month: currentMonth,
        year: currentYear,
      });

      expect(result.success).toBe(true);
      const bucket = result.data!.byCurrency.find((item) => item.currency === 'COP')!;
      expect(bucket.definitionsCount).toBe(1);
      expect(bucket.transactionCount).toBe(1);
      expect(bucket.totalCents).toBe(5000);
      expect(bucket.stats[0].name).toBe('Fútbol');
    });
  });

  // ==========================================================================
  // getVariableExpenseDetail
  // ==========================================================================

  describe('getVariableExpenseDetail', () => {
    it('returns the monitored detail for an owned definition', async () => {
      const definition = await createDefinition(TEST_USER_ID, { name: 'Fútbol' });
      const account = await createAccount(TEST_USER_ID);
      await createExpense(TEST_USER_ID, account.id, {
        variableExpenseId: definition.id,
        amountCents: -4000,
        date: new Date(currentYear, currentMonth - 1, 5),
      });

      const result = await variableExpenseActions.getVariableExpenseDetail({
        variableExpenseId: definition.id,
        month: currentMonth,
        year: currentYear,
      });

      expect(result.success).toBe(true);
      expect(result.data!.definition.name).toBe('Fútbol');
      expect(result.data!.scope).toBe('month');
      expect(result.data!.count).toBe(1);
      expect(result.data!.totalCents).toBe(4000);
    });

    it("returns NOT_FOUND for another user's definition", async () => {
      const foreignDefinition = await createDefinition(FOREIGN_USER_ID, { name: 'Ajena' });

      const result = await variableExpenseActions.getVariableExpenseDetail({
        variableExpenseId: foreignDefinition.id,
        month: currentMonth,
        year: currentYear,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });
  });

  // ==========================================================================
  // getVariableExpenseMovements
  // ==========================================================================

  describe('getVariableExpenseMovements', () => {
    it('returns movements for a definition and month', async () => {
      const definition = await createDefinition(TEST_USER_ID, { name: 'Fútbol' });
      const account = await createAccount(TEST_USER_ID);
      await createExpense(TEST_USER_ID, account.id, {
        variableExpenseId: definition.id,
        amountCents: -2500,
        date: new Date(currentYear, currentMonth - 1, 12),
      });

      const result = await variableExpenseActions.getVariableExpenseMovements({
        variableExpenseId: definition.id,
        month: currentMonth,
        year: currentYear,
      });

      expect(result.success).toBe(true);
      expect(result.data!.variableExpenseId).toBe(definition.id);
      expect(result.data!.scope).toBe('month');
      expect(result.data!.count).toBe(1);
      expect(result.data!.totalCents).toBe(2500);
    });

    it('returns every definition ("Todos") when no id is provided', async () => {
      const definition = await createDefinition(TEST_USER_ID, { name: 'Fútbol' });
      const account = await createAccount(TEST_USER_ID);
      await createExpense(TEST_USER_ID, account.id, {
        variableExpenseId: definition.id,
        amountCents: -1000,
        date: new Date(currentYear, currentMonth - 1, 12),
      });

      const result = await variableExpenseActions.getVariableExpenseMovements({});

      expect(result.success).toBe(true);
      expect(result.data!.variableExpenseId).toBeNull();
      expect(result.data!.scope).toBe('all');
      expect(result.data!.count).toBe(1);
    });

    it('omits a movement whose currency differs from its definition currency', async () => {
      const definition = await createDefinition(TEST_USER_ID, { currency: Currency.COP });
      const account = await createAccount(TEST_USER_ID, { currency: Currency.USD });
      await createExpense(TEST_USER_ID, account.id, {
        variableExpenseId: definition.id,
        amountCents: -9999,
        currency: Currency.USD,
      });

      const result = await variableExpenseActions.getVariableExpenseMovements({
        variableExpenseId: definition.id,
      });

      expect(result.success).toBe(true);
      expect(result.data!.count).toBe(0);
      expect(result.data!.totalCents).toBe(0);
    });

    it("returns NOT_FOUND for another user's definition", async () => {
      const foreignDefinition = await createDefinition(FOREIGN_USER_ID, { name: 'Ajena' });

      const result = await variableExpenseActions.getVariableExpenseMovements({
        variableExpenseId: foreignDefinition.id,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });
  });
});
