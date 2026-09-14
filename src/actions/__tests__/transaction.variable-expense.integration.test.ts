/**
 * createTransaction + variableExpenseId Integration Tests
 *
 * Locks the monitored-expense creation contract:
 * - a valid variableExpenseId is persisted and the definition's category is
 *   inherited (unless an explicit categoryId is sent)
 * - another user's / inactive definition is rejected
 * - variableExpenseId is rejected for INCOME
 * - the account currency must match the definition currency (Rule 4)
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

// ============================================================================
// Test constants
// ============================================================================

const TEST_DB_URL = process.env.DATABASE_URL!;
const TEST_USER_ID = 'tx-vtx-user-' + Date.now();
const FOREIGN_USER_ID = 'tx-vtx-foreign-' + Date.now();

const genUUID = (): string => crypto.randomUUID();

let pool: Pool;
let prisma: PrismaClient;

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
      email: `tx-vtx-${Date.now()}@example.com`,
      name: 'Transaction Variable Test User',
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
  getTrueBalance: vi.fn().mockResolvedValue(1_000_000),
}));

vi.mock('@/services/rate-limit.service', () => ({
  checkApiRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  recordApiAttempt: vi.fn().mockResolvedValue('attempt-1'),
  markApiAttemptSuccess: vi.fn().mockResolvedValue(undefined),
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

async function createCategory(ownerId: string | null, name: string) {
  const category = await prisma.category.create({
    data: {
      name: name ?? `tx-vtx-cat-${genUUID()}`,
      type: VariableExpenseCategory.OTHER,
      color: '#22c55e',
      userId: ownerId,
      isActive: true,
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
    categoryId?: string | null;
    currency?: Currency;
    isActive?: boolean;
    name?: string;
  } = {}
) {
  return prisma.variableExpense.create({
    data: {
      userId: ownerId,
      name: overrides.name ?? `tx-vtx-def-${genUUID()}`,
      categoryId: overrides.categoryId ?? null,
      currency: overrides.currency ?? Currency.COP,
      isActive: overrides.isActive ?? true,
      createdBy: ownerId,
      lastModifiedBy: ownerId,
    },
  });
}

async function createAccount(ownerId: string, currency: Currency = Currency.COP) {
  return prisma.account.create({
    data: {
      userId: ownerId,
      name: 'Cuenta',
      type: AccountType.SAVINGS,
      balanceCents: 1_000_000,
      currency,
      isActive: true,
      createdBy: ownerId,
      lastModifiedBy: ownerId,
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
  if (createdCategoryIds.length > 0) {
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    createdCategoryIds.length = 0;
  }
}

import { createTransaction } from '../transaction.actions';

// ============================================================================
// Tests
// ============================================================================

describe('createTransaction with variableExpenseId', () => {
  let accountId: string;

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
    await createTestUser(TEST_USER_ID, 'Transaction Variable Test User');
    await createTestUser(FOREIGN_USER_ID, 'Foreign Transaction Variable User');
    const account = await createAccount(TEST_USER_ID, Currency.COP);
    accountId = account.id;
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  it('persists the variableExpenseId and inherits the configured category', async () => {
    const category = await createCategory(TEST_USER_ID, 'Deporte');
    const definition = await createDefinition(TEST_USER_ID, { categoryId: category.id });

    const result = await createTransaction({
      idempotencyKey: genUUID(),
      accountId,
      type: 'EXPENSE',
      amountCents: -5000,
      currency: 'COP',
      description: 'Partido',
      variableExpenseId: definition.id,
    });

    expect(result.success).toBe(true);
    expect(result.data!.transaction.variableExpenseId).toBe(definition.id);
    expect(result.data!.transaction.categoryId).toBe(category.id);

    const stored = await prisma.transaction.findUniqueOrThrow({
      where: { id: result.data!.transaction.id },
    });
    expect(stored.variableExpenseId).toBe(definition.id);
    expect(stored.categoryId).toBe(category.id);
  });

  it('respects an explicit categoryId over the definition category', async () => {
    const inherited = await createCategory(TEST_USER_ID, 'Deporte');
    const explicit = await createCategory(TEST_USER_ID, 'Salud');
    const definition = await createDefinition(TEST_USER_ID, { categoryId: inherited.id });

    const result = await createTransaction({
      idempotencyKey: genUUID(),
      accountId,
      type: 'EXPENSE',
      amountCents: -3000,
      currency: 'COP',
      categoryId: explicit.id,
      variableExpenseId: definition.id,
    });

    expect(result.success).toBe(true);
    expect(result.data!.transaction.categoryId).toBe(explicit.id);
  });

  it("rejects another user's definition with UNAUTHORIZED", async () => {
    const foreignDefinition = await createDefinition(FOREIGN_USER_ID);

    const result = await createTransaction({
      idempotencyKey: genUUID(),
      accountId,
      type: 'EXPENSE',
      amountCents: -5000,
      currency: 'COP',
      variableExpenseId: foreignDefinition.id,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
  });

  it('rejects an inactive definition with NOT_FOUND', async () => {
    const inactiveDefinition = await createDefinition(TEST_USER_ID, { isActive: false });

    const result = await createTransaction({
      idempotencyKey: genUUID(),
      accountId,
      type: 'EXPENSE',
      amountCents: -5000,
      currency: 'COP',
      variableExpenseId: inactiveDefinition.id,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
  });

  it('rejects variableExpenseId for an INCOME transaction', async () => {
    const definition = await createDefinition(TEST_USER_ID);

    const result = await createTransaction({
      idempotencyKey: genUUID(),
      accountId,
      type: 'INCOME',
      amountCents: 5000,
      currency: 'COP',
      variableExpenseId: definition.id,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('rejects when the account currency differs from the definition currency', async () => {
    const usdAccount = await createAccount(TEST_USER_ID, Currency.USD);
    const copDefinition = await createDefinition(TEST_USER_ID, { currency: Currency.COP });

    const result = await createTransaction({
      idempotencyKey: genUUID(),
      accountId: usdAccount.id,
      type: 'EXPENSE',
      amountCents: -5000,
      currency: 'USD',
      variableExpenseId: copDefinition.id,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('CURRENCY_MISMATCH');
  });
});
