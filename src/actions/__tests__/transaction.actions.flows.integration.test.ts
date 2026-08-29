/**
 * Transaction Actions Integration Tests (real actions)
 * Exercises the actual Server Actions (createTransaction, getAllTransactions,
 * deleteTransaction, getTransactionById) against the dedicated test database.
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
const TEST_USER_ID = 'tx-flow-user-' + Date.now();

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
      email: `tx-flow-${Date.now()}@example.com`,
      name: 'Transaction Flow Test User',
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

import {
  createTransaction,
  getAllTransactions,
  deleteTransaction,
  getTransactionById,
} from '../transaction.actions';

// ============================================================================
// Test helpers
// ============================================================================

async function createUser() {
  return prisma.user.create({
    data: {
      id: TEST_USER_ID,
      email: `tx-flow-${Date.now()}@example.com`,
      name: 'Transaction Flow Test User',
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
      name: 'Corriente',
      type: AccountType.CHECKING,
      balanceCents,
      currency: Currency.COP,
      isActive: true,
      createdBy: TEST_USER_ID,
      lastModifiedBy: TEST_USER_ID,
    },
  });
  // Fund via INCOME so getTrueBalance() sees the funds (Rule 13).
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

// ============================================================================
// Setup / Teardown
// ============================================================================

describe('Transaction Actions (real actions)', () => {
  let accountId: string;

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
    await prisma.transaction.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.account.deleteMany({ where: { userId: TEST_USER_ID } });
    const account = await createBankAccount();
    accountId = account.id;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // createTransaction
  // ==========================================================================

  it('creates an INCOME transaction and updates the balance', async () => {
    const result = await createTransaction({
      idempotencyKey: genUUID(),
      accountId,
      type: 'INCOME',
      amountCents: 250000,
      currency: 'COP',
      description: 'Freelance',
    });

    expect(result.data!.wasIdempotent).toBe(false);
    expect(result.data!.transaction.type).toBe('INCOME');
    expect(result.data!.transaction.amountCents).toBe(250000);
    expect(result.data!.transaction.currency).toBe('COP');

    const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.balanceCents).toBe(1250000); // 1000000 + 250000
  });

  it('creates an EXPENSE transaction with a negative amount', async () => {
    const result = await createTransaction({
      idempotencyKey: genUUID(),
      accountId,
      type: 'EXPENSE',
      amountCents: -50000,
      currency: 'COP',
      description: 'Mercado',
    });

    expect(result.data!.transaction.amountCents).toBe(-50000);
    const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.balanceCents).toBe(950000);
  });

  it('is idempotent for repeated idempotency keys', async () => {
    const key = genUUID();
    await createTransaction({
      idempotencyKey: key,
      accountId,
      type: 'INCOME',
      amountCents: 1000,
      currency: 'COP',
    });

    const second = await createTransaction({
      idempotencyKey: key,
      accountId,
      type: 'INCOME',
      amountCents: 1000,
      currency: 'COP',
    });

    expect(second.data!.wasIdempotent).toBe(true);
    const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.balanceCents).toBe(1001000); // only applied once
  });

  it('rejects wrong amount sign for the type', async () => {
    const result = await createTransaction({
      idempotencyKey: genUUID(),
      accountId,
      type: 'EXPENSE',
      amountCents: 5000,
      currency: 'COP',
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('rejects EXPENSE exceeding the true balance', async () => {
    const result = await createTransaction({
      idempotencyKey: genUUID(),
      accountId,
      type: 'EXPENSE',
      amountCents: -2000000,
      currency: 'COP',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient funds');
  });

  it('rejects currency mismatch with the account', async () => {
    const result = await createTransaction({
      idempotencyKey: genUUID(),
      accountId,
      type: 'INCOME',
      amountCents: 1000,
      currency: 'USD',
    });
    expect(result.success).toBe(false);
  });

  it('rejects transactions for inactive accounts', async () => {
    await prisma.account.update({ where: { id: accountId }, data: { isActive: false } });

    const result = await createTransaction({
      idempotencyKey: genUUID(),
      accountId,
      type: 'INCOME',
      amountCents: 1000,
      currency: 'COP',
    });
    expect(result.success).toBe(false);
  });

  // ==========================================================================
  // getAllTransactions
  // ==========================================================================

  it('lists transactions with search and type filters', async () => {
    await createTransaction({
      idempotencyKey: genUUID(),
      accountId,
      type: 'INCOME',
      amountCents: 100000,
      currency: 'COP',
      description: 'Salario Enero',
    });
    await createTransaction({
      idempotencyKey: genUUID(),
      accountId,
      type: 'EXPENSE',
      amountCents: -20000,
      currency: 'COP',
      description: 'Mercado',
    });

    const all = await getAllTransactions({ page: 1, pageSize: 10 });
    expect(all.data!.transactions).toHaveLength(3); // funding INCOME + 2
    expect(all.data!.total).toBe(3);

    const searched = await getAllTransactions({ page: 1, pageSize: 10, search: 'mercado' });
    expect(searched.data!.transactions).toHaveLength(1);
    expect(searched.data!.transactions[0].description).toBe('Mercado');

    const expenses = await getAllTransactions({ page: 1, pageSize: 10, typeFilter: 'EXPENSE' });
    expect(expenses.data!.transactions).toHaveLength(1);

    const page2 = await getAllTransactions({ page: 2, pageSize: 2 });
    expect(page2.data!.transactions.length).toBe(1);
    expect(page2.data!.totalPages).toBe(2);
  });

  // ==========================================================================
  // getTransactionById
  // ==========================================================================

  it('returns the transaction by id', async () => {
    const created = await createTransaction({
      idempotencyKey: genUUID(),
      accountId,
      type: 'INCOME',
      amountCents: 5000,
      currency: 'COP',
    });

    const found = await getTransactionById({ transactionId: created.data!.transaction.id });
    expect(found.data!.id).toBe(created.data!.transaction.id);
    expect(found.data!.amountCents).toBe(5000);
  });

  it('throws for a deleted (soft) transaction', async () => {
    const created = await createTransaction({
      idempotencyKey: genUUID(),
      accountId,
      type: 'INCOME',
      amountCents: 5000,
      currency: 'COP',
    });
    await deleteTransaction({ transactionId: created.data!.transaction.id });

    const result = await getTransactionById({ transactionId: created.data!.transaction.id });
    expect(result.success).toBe(false);
  });

  // ==========================================================================
  // deleteTransaction
  // ==========================================================================

  it('soft-deletes the transaction and reverses the balance', async () => {
    const created = await createTransaction({
      idempotencyKey: genUUID(),
      accountId,
      type: 'INCOME',
      amountCents: 300000,
      currency: 'COP',
    });

    await deleteTransaction({ transactionId: created.data!.transaction.id });

    const stored = await prisma.transaction.findUniqueOrThrow({
      where: { id: created.data!.transaction.id },
    });
    expect(stored.isActive).toBe(false);
    expect(stored.deletedAt).not.toBeNull();

    const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.balanceCents).toBe(1000000); // reversed
  });

  it("throws when deleting another user's transaction", async () => {
    const otherUser = await prisma.user.create({
      data: {
        id: 'tx-flow-other-' + Date.now(),
        email: `tx-other-${Date.now()}@example.com`,
        name: 'Other User',
        passwordHash: 'x',
        language: Language.SPANISH,
        theme: Theme.LIGHT,
      },
    });
    const foreignTx = await prisma.transaction.create({
      data: {
        idempotencyKey: genUUID(),
        userId: otherUser.id,
        accountId,
        type: 'INCOME',
        amountCents: 1000,
        currency: 'COP',
        isActive: true,
        createdBy: otherUser.id,
        lastModifiedBy: otherUser.id,
      },
    });

    const result = await deleteTransaction({ transactionId: foreignTx.id });
    expect(result.success).toBe(false);
  });
});
