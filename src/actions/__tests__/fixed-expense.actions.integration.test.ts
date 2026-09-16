/**
 * Fixed Expenses Actions Integration Tests
 *
 * Runs against the dedicated test database (port 5434) and verifies:
 * - create → template + idempotent materialization + audit trail
 * - update → unpaid amount/currency sync, reschedule, date validation, ownership
 * - delete → soft delete of the template + future pending payments, paid history kept
 * - payFixedExpense → atomic EXPENSE ledger entry, cache update, funds/currency/
 *   ownership/paid guards and UUID v4 idempotency (Rule 12)
 * - coherence with savings#getMaxSpendable (fixed vs variable bucket)
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
  TransactionType,
  FixedExpenseFrequency,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ZodError } from 'zod';
import { AppError } from '@/lib/errors/api-errors';

// ============================================================================
// Test constants
// ============================================================================

const TEST_DB_URL = process.env.DATABASE_URL!;
const TEST_USER_ID = 'fix-test-user-' + Date.now();
const FOREIGN_USER_ID = 'fix-test-foreign-' + Date.now();
const VALID_CUID = 'clh1234567890abcdefghij';

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

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_noStore: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(() =>
    Promise.resolve({
      userId: TEST_USER_ID,
      email: `fix-test-${Date.now()}@example.com`,
      name: 'Fixed Expense Test User',
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

// Rate limiting: always allow, but keep the recorder spied on (FIXED_EXPENSE_PAY).
vi.mock('@/services/rate-limit.service', () => ({
  checkApiRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
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
      email: `fix-test-${Date.now()}@example.com`,
      name: 'Fixed Expense Test User',
      passwordHash: 'hashed_test_password',
      language: Language.SPANISH,
      theme: Theme.LIGHT,
      baseCurrency: Currency.COP,
      isActive: true,
    },
  });
}

async function createForeignUser() {
  return prisma.user.create({
    data: {
      id: FOREIGN_USER_ID,
      email: `fix-test-foreign-${Date.now()}@example.com`,
      name: 'Foreign Fixed Expense User',
      passwordHash: 'hashed_test_password',
      language: Language.SPANISH,
      theme: Theme.LIGHT,
      baseCurrency: Currency.COP,
      isActive: true,
    },
  });
}

async function createBankAccount(
  overrides: { name?: string; balanceCents?: number; currency?: Currency } = {},
  ownerId: string = TEST_USER_ID
) {
  const balanceCents = overrides.balanceCents ?? 500000;
  const currency = overrides.currency ?? Currency.COP;
  const account = await prisma.account.create({
    data: {
      userId: ownerId,
      name: overrides.name ?? 'Source Account',
      type: AccountType.SAVINGS,
      balanceCents,
      currency,
      isActive: true,
      createdBy: ownerId,
      lastModifiedBy: ownerId,
    },
  });

  // payFixedExpense checks funds from the transactional ledger (Rule 13), so the
  // account needs an opening INCOME transaction matching its cached balance.
  if (balanceCents > 0) {
    await prisma.transaction.create({
      data: {
        idempotencyKey: genUUID(),
        userId: ownerId,
        accountId: account.id,
        type: TransactionType.INCOME,
        amountCents: balanceCents,
        currency,
        description: 'Opening balance',
        date: new Date(),
        openingBalance: true,
        isActive: true,
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
        createdBy: ownerId,
        lastModifiedBy: ownerId,
      },
    });
  }

  return account;
}

/** Creates a template directly (ownership fixtures) plus one materialized payment. */
async function createForeignExpense() {
  const today = new Date();
  const expense = await prisma.fixedExpense.create({
    data: {
      userId: FOREIGN_USER_ID,
      name: 'Foreign Rent',
      amountCents: 20000,
      currency: Currency.COP,
      frequency: FixedExpenseFrequency.MONTHLY,
      startDate: today,
      createdBy: FOREIGN_USER_ID,
      lastModifiedBy: FOREIGN_USER_ID,
    },
  });
  const payment = await prisma.fixedExpensePayment.create({
    data: {
      fixedExpenseId: expense.id,
      dueDate: today,
      expectedAmountCents: 20000,
      currency: Currency.COP,
      createdBy: FOREIGN_USER_ID,
      lastModifiedBy: FOREIGN_USER_ID,
    },
  });
  return { expense, payment };
}

async function cleanupUserData(userId: string) {
  await prisma.transaction.deleteMany({ where: { userId } });
  // FixedExpensePayment.fixedExpenseId is ON DELETE RESTRICT → delete payments
  // before templates so the user cascade never trips the FK.
  await prisma.fixedExpensePayment.deleteMany({ where: { fixedExpense: { userId } } });
  await prisma.fixedExpense.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

async function cleanupTestData() {
  await cleanupUserData(TEST_USER_ID);
  await cleanupUserData(FOREIGN_USER_ID);
}

import * as fixedExpenseActions from '../fixed-expense.actions';
import { getMaxSpendable } from '@/services/savings.service';

// ============================================================================
// Tests
// ============================================================================

describe('Fixed Expenses Actions Integration', () => {
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
    await createTestUser();
    await createForeignUser();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const firstOfMonth = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  };

  async function createMonthlyExpense(
    amountCents = 1500000,
    overrides: Record<string, unknown> = {}
  ) {
    return fixedExpenseActions.createFixedExpense({
      name: 'Arriendo',
      amountCents,
      currency: 'COP',
      frequency: 'MONTHLY',
      dayOfPayment: 1,
      startDate: firstOfMonth(),
      ...overrides,
    });
  }

  // ==========================================================================
  // createFixedExpense
  // ==========================================================================

  describe('createFixedExpense', () => {
    it('creates the template, materializes payments and records the audit trail', async () => {
      const result = await createMonthlyExpense();

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('Arriendo');
      expect(result.data!.amountCents).toBe(1500000);

      const expense = await prisma.fixedExpense.findUnique({ where: { id: result.data!.id } });
      expect(expense).toBeDefined();
      expect(expense!.createdBy).toBe(TEST_USER_ID);
      expect(expense!.lastModifiedBy).toBe(TEST_USER_ID);
      expect(expense!.ipAddress).toBe('127.0.0.1');
      expect(expense!.userAgent).toBe('vitest');

      const payments = await prisma.fixedExpensePayment.findMany({
        where: { fixedExpenseId: expense!.id },
        orderBy: { dueDate: 'asc' },
      });
      // Rolling 12-month horizon (current month + 11) anchored on startDate.
      expect(payments).toHaveLength(12);
      expect(payments[0].createdBy).toBe(TEST_USER_ID);
      expect(payments[0].ipAddress).toBe('127.0.0.1');
      expect(payments[0].userAgent).toBe('vitest');
      expect(Number(payments[0].expectedAmountCents)).toBe(1500000);
    });

    it('rejects invalid input with VALIDATION_ERROR', async () => {
      const result = await fixedExpenseActions.createFixedExpense({
        name: '',
        amountCents: 0,
        frequency: 'MONTHLY',
        startDate: firstOfMonth(),
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an endDate not after startDate with VALIDATION_ERROR', async () => {
      const result = await fixedExpenseActions.createFixedExpense({
        name: 'Invalid range',
        amountCents: 1000,
        frequency: 'MONTHLY',
        startDate: new Date(2026, 5, 1),
        endDate: new Date(2026, 4, 1),
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });
  });

  // ==========================================================================
  // getFixedExpenses
  // ==========================================================================

  describe('getFixedExpenses', () => {
    it('returns the user templates with their materialized payments', async () => {
      await createMonthlyExpense();

      const result = await fixedExpenseActions.getFixedExpenses({});

      expect(result.success).toBe(true);
      expect(result.data!).toHaveLength(1);
      expect(result.data![0].name).toBe('Arriendo');
      expect(result.data![0].payments.length).toBeGreaterThan(0);
      expect(typeof result.data![0].amountCents).toBe('number');
    });

    it('excludes soft-deleted templates by default and includes them on demand', async () => {
      const created = await createMonthlyExpense();
      await prisma.fixedExpense.update({
        where: { id: created.data!.id },
        data: { isActive: false, deletedAt: new Date() },
      });

      const active = await fixedExpenseActions.getFixedExpenses({});
      expect(active.data!).toHaveLength(0);

      const all = await fixedExpenseActions.getFixedExpenses({ includeInactive: true });
      expect(all.data!).toHaveLength(1);
    });
  });

  // ==========================================================================
  // getFixedExpensePayments / getFixedExpensesSummary
  // ==========================================================================

  describe('getFixedExpensePayments', () => {
    it('returns the template and its materialized payments for the owner', async () => {
      const created = await createMonthlyExpense();

      const result = await fixedExpenseActions.getFixedExpensePayments({
        fixedExpenseId: created.data!.id,
      });

      expect(result.success).toBe(true);
      expect(result.data!.expense.id).toBe(created.data!.id);
      expect(result.data!.payments.length).toBeGreaterThan(0);
    });

    it('returns NOT_FOUND for another user template', async () => {
      const { expense } = await createForeignExpense();

      const result = await fixedExpenseActions.getFixedExpensePayments({
        fixedExpenseId: expense.id,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });

    it('requires a fixedExpenseId', async () => {
      const result = await fixedExpenseActions.getFixedExpensePayments({});
      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('getFixedExpensesSummary', () => {
    it('returns the per-currency buckets for the requested month', async () => {
      const now = new Date();
      // createMonthlyExpense anchors the first occurrence on the 1st of the
      // current month, so the current-month summary must include it.
      await createMonthlyExpense();

      const result = await fixedExpenseActions.getFixedExpensesSummary({
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      });

      expect(result.success).toBe(true);
      const cop = result.data!.byCurrency.find((bucket) => bucket.currency === 'COP');
      expect(cop).toBeDefined();
      expect(cop!.activeCount).toBe(1);
      expect(cop!.totalCommittedCents).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // updateFixedExpense
  // ==========================================================================

  describe('updateFixedExpense', () => {
    it('syncs amount/currency on unpaid payments and preserves paid history', async () => {
      const created = await createMonthlyExpense(100000);
      const payments = await prisma.fixedExpensePayment.findMany({
        where: { fixedExpenseId: created.data!.id },
        orderBy: { dueDate: 'asc' },
      });
      const paidPayment = payments[0];
      await prisma.fixedExpensePayment.update({
        where: { id: paidPayment.id },
        data: { paidDate: new Date(), paidAmountCents: 100000 },
      });

      const result = await fixedExpenseActions.updateFixedExpense({
        fixedExpenseId: created.data!.id,
        amountCents: 250000,
      });

      expect(result.success).toBe(true);
      expect(result.data!.amountCents).toBe(250000);

      const after = await prisma.fixedExpensePayment.findMany({
        where: { fixedExpenseId: created.data!.id },
      });
      const stillPaid = after.find((payment) => payment.id === paidPayment.id)!;
      expect(Number(stillPaid.expectedAmountCents)).toBe(100000); // untouched
      for (const payment of after.filter((row) => row.paidDate === null)) {
        expect(Number(payment.expectedAmountCents)).toBe(250000);
      }
    });

    it('reschedules materialized payments when the frequency changes', async () => {
      const created = await createMonthlyExpense(100000);

      const result = await fixedExpenseActions.updateFixedExpense({
        fixedExpenseId: created.data!.id,
        frequency: 'WEEKLY',
      });

      expect(result.success).toBe(true);
      expect(result.data!.frequency).toBe('WEEKLY');

      const activePayments = await prisma.fixedExpensePayment.count({
        where: { fixedExpenseId: created.data!.id, isActive: true },
      });
      // A weekly schedule far outnumbers the previous 12 monthly occurrences.
      expect(activePayments).toBeGreaterThan(12);
    });

    it('rejects endDate before the stored startDate with VALIDATION_ERROR', async () => {
      const created = await createMonthlyExpense(100000, {
        startDate: new Date(2026, 5, 1),
        dayOfPayment: 1,
      });

      const result = await fixedExpenseActions.updateFixedExpense({
        fixedExpenseId: created.data!.id,
        endDate: new Date(2026, 0, 1),
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('returns UNAUTHORIZED when updating another user template', async () => {
      const { expense } = await createForeignExpense();

      const result = await fixedExpenseActions.updateFixedExpense({
        fixedExpenseId: expense.id,
        name: 'Hijacked',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('returns NOT_FOUND for a missing template', async () => {
      const result = await fixedExpenseActions.updateFixedExpense({
        fixedExpenseId: VALID_CUID,
        name: 'Ghost',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });
  });

  // ==========================================================================
  // deleteFixedExpense
  // ==========================================================================

  describe('deleteFixedExpense', () => {
    it('soft-deletes the template and future pending payments but keeps paid history', async () => {
      const created = await createMonthlyExpense(100000);
      const payments = await prisma.fixedExpensePayment.findMany({
        where: { fixedExpenseId: created.data!.id },
        orderBy: { dueDate: 'asc' },
      });
      const paidPayment = payments[0];
      await prisma.fixedExpensePayment.update({
        where: { id: paidPayment.id },
        data: { paidDate: new Date(), paidAmountCents: 100000 },
      });

      const result = await fixedExpenseActions.deleteFixedExpense({
        fixedExpenseId: created.data!.id,
      });

      expect(result.success).toBe(true);

      const expense = await prisma.fixedExpense.findUnique({ where: { id: created.data!.id } });
      expect(expense!.isActive).toBe(false);
      expect(expense!.deletedAt).not.toBeNull();

      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const after = await prisma.fixedExpensePayment.findMany({
        where: { fixedExpenseId: created.data!.id },
      });
      const stillPaid = after.find((payment) => payment.id === paidPayment.id)!;
      expect(stillPaid.isActive).toBe(true); // paid history preserved
      expect(stillPaid.paidDate).not.toBeNull();

      // Every future pending occurrence is soft-deleted; only the paid row lives.
      const futurePending = after.filter(
        (payment) =>
          payment.paidDate === null && new Date(payment.dueDate).getTime() >= startOfToday.getTime()
      );
      expect(futurePending.length).toBeGreaterThan(0);
      for (const payment of futurePending) {
        expect(payment.isActive).toBe(false);
        expect(payment.deletedAt).not.toBeNull();
      }
    });

    it('returns UNAUTHORIZED when deleting another user template', async () => {
      const { expense } = await createForeignExpense();

      const result = await fixedExpenseActions.deleteFixedExpense({
        fixedExpenseId: expense.id,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('returns NOT_FOUND when deleting an already soft-deleted template', async () => {
      const created = await createMonthlyExpense(100000);
      await fixedExpenseActions.deleteFixedExpense({ fixedExpenseId: created.data!.id });

      const result = await fixedExpenseActions.deleteFixedExpense({
        fixedExpenseId: created.data!.id,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });
  });

  // ==========================================================================
  // payFixedExpense
  // ==========================================================================

  describe('payFixedExpense', () => {
    async function setupPayable(
      options: {
        balanceCents?: number;
        accountCurrency?: Currency;
        amountCents?: number;
      } = {}
    ) {
      const account = await createBankAccount({
        balanceCents: options.balanceCents ?? 500000,
        currency: options.accountCurrency ?? Currency.COP,
      });
      const now = new Date();
      const created = await fixedExpenseActions.createFixedExpense({
        name: 'Netflix',
        amountCents: options.amountCents ?? 20000,
        currency: 'COP',
        frequency: 'MONTHLY',
        dayOfPayment: now.getDate(),
        startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      });
      const payments = await prisma.fixedExpensePayment.findMany({
        where: { fixedExpenseId: created.data!.id },
        orderBy: { dueDate: 'asc' },
      });
      return { account, expenseId: created.data!.id, payment: payments[0] };
    }

    it('creates a linked EXPENSE transaction, marks the payment paid and reduces the account cache', async () => {
      const { account, payment } = await setupPayable();
      const key = genUUID();

      const result = await fixedExpenseActions.payFixedExpense({
        paymentId: payment.id,
        accountId: account.id,
        idempotencyKey: key,
      });

      expect(result.success).toBe(true);
      expect(result.data!.wasIdempotent).toBe(false);

      const tx = await prisma.transaction.findUnique({ where: { idempotencyKey: key } });
      expect(tx).not.toBeNull();
      expect(tx!.type).toBe('EXPENSE');
      expect(Number(tx!.amountCents)).toBe(-20000);
      expect(tx!.currency).toBe('COP');
      expect(tx!.fixedExpensePaymentId).toBe(payment.id);
      expect(tx!.accountId).toBe(account.id);

      const updatedPayment = await prisma.fixedExpensePayment.findUnique({
        where: { id: payment.id },
      });
      expect(updatedPayment!.paidDate).not.toBeNull();
      expect(Number(updatedPayment!.paidAmountCents)).toBe(20000);
      expect(updatedPayment!.idempotencyKey).toBe(key);

      const updatedAccount = await prisma.account.findUnique({ where: { id: account.id } });
      expect(Number(updatedAccount!.balanceCents)).toBe(480000);

      const { recordApiAttempt } = await import('@/services/rate-limit.service');
      expect(recordApiAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'FIXED_EXPENSE_PAY' })
      );
    });

    it('rejects insufficient funds from the ledger with INSUFFICIENT_FUNDS', async () => {
      const { account, payment } = await setupPayable({ balanceCents: 100 });

      const result = await fixedExpenseActions.payFixedExpense({
        paymentId: payment.id,
        accountId: account.id,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('INSUFFICIENT_FUNDS');

      const unchanged = await prisma.fixedExpensePayment.findUnique({ where: { id: payment.id } });
      expect(unchanged!.paidDate).toBeNull();
    });

    it('rejects a source account with a different currency with CURRENCY_MISMATCH', async () => {
      const { account, payment } = await setupPayable({
        accountCurrency: Currency.USD,
        balanceCents: 500000,
      });

      const result = await fixedExpenseActions.payFixedExpense({
        paymentId: payment.id,
        accountId: account.id,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('CURRENCY_MISMATCH');
    });

    it("rejects paying another user's payment with UNAUTHORIZED", async () => {
      const account = await createBankAccount();
      const { payment } = await createForeignExpense();

      const result = await fixedExpenseActions.payFixedExpense({
        paymentId: payment.id,
        accountId: account.id,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('rejects a payment already settled with a different key with FIXED_EXPENSE_ALREADY_PAID', async () => {
      const { account, payment } = await setupPayable();
      await fixedExpenseActions.payFixedExpense({
        paymentId: payment.id,
        accountId: account.id,
        idempotencyKey: genUUID(),
      });

      const result = await fixedExpenseActions.payFixedExpense({
        paymentId: payment.id,
        accountId: account.id,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('FIXED_EXPENSE_ALREADY_PAID');
    });

    it('is idempotent: the same key returns wasIdempotent:true and moves money once', async () => {
      const { account, payment } = await setupPayable();
      const key = genUUID();

      const first = await fixedExpenseActions.payFixedExpense({
        paymentId: payment.id,
        accountId: account.id,
        idempotencyKey: key,
      });
      expect(first.success).toBe(true);
      expect(first.data!.wasIdempotent).toBe(false);

      const second = await fixedExpenseActions.payFixedExpense({
        paymentId: payment.id,
        accountId: account.id,
        idempotencyKey: key,
      });
      expect(second.success).toBe(true);
      expect(second.data!.wasIdempotent).toBe(true);
      expect(second.data!.payment.id).toBe(payment.id);

      const transactions = await prisma.transaction.count({ where: { idempotencyKey: key } });
      expect(transactions).toBe(1);

      const updatedAccount = await prisma.account.findUnique({ where: { id: account.id } });
      expect(Number(updatedAccount!.balanceCents)).toBe(480000); // debited once
    });

    it('allows overriding the payment amount', async () => {
      const { account, payment } = await setupPayable();

      const result = await fixedExpenseActions.payFixedExpense({
        paymentId: payment.id,
        accountId: account.id,
        amountCents: 25000,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(true);
      const updatedPayment = await prisma.fixedExpensePayment.findUnique({
        where: { id: payment.id },
      });
      expect(Number(updatedPayment!.paidAmountCents)).toBe(25000);
      const updatedAccount = await prisma.account.findUnique({ where: { id: account.id } });
      expect(Number(updatedAccount!.balanceCents)).toBe(475000);
    });

    it('rejects a non-positive amount override at the schema level (VALIDATION_ERROR)', async () => {
      const { account, payment } = await setupPayable();

      const result = await fixedExpenseActions.payFixedExpense({
        paymentId: payment.id,
        accountId: account.id,
        amountCents: 0,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a non-v4 idempotency key with VALIDATION_ERROR', async () => {
      const { account, payment } = await setupPayable();

      const result = await fixedExpenseActions.payFixedExpense({
        paymentId: payment.id,
        accountId: account.id,
        idempotencyKey: 'not-a-uuid',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('returns NOT_FOUND for a missing payment', async () => {
      const account = await createBankAccount();

      const result = await fixedExpenseActions.payFixedExpense({
        paymentId: VALID_CUID,
        accountId: account.id,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });
  });

  // ==========================================================================
  // Coherence with savings#getMaxSpendable
  // ==========================================================================

  describe('coherence with getMaxSpendable', () => {
    it('excludes the linked EXPENSE from the variable bucket and uses the payment currency for fixed', async () => {
      const account = await createBankAccount({ balanceCents: 500000 });
      const now = new Date();
      const created = await fixedExpenseActions.createFixedExpense({
        name: 'Netflix',
        amountCents: 20000,
        currency: 'COP',
        frequency: 'MONTHLY',
        dayOfPayment: now.getDate(),
        startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      });
      const payment = await prisma.fixedExpensePayment.findFirst({
        where: { fixedExpenseId: created.data!.id },
        orderBy: { dueDate: 'asc' },
      });

      await fixedExpenseActions.payFixedExpense({
        paymentId: payment!.id,
        accountId: account.id,
        idempotencyKey: genUUID(),
      });

      const breakdown = await getMaxSpendable(TEST_USER_ID, now.getMonth() + 1, now.getFullYear());
      const cop = breakdown.byCurrency.find((bucket) => bucket.currency === 'COP')!;

      expect(cop.totalIncomeCents).toBe(500000);
      expect(cop.totalFixedExpensesCents).toBe(20000); // grouped by payment.currency
      expect(cop.totalVariableExpensesCents).toBe(0); // linked EXPENSE excluded
      expect(cop.maxSpendableCents).toBe(480000);
    });
  });
});
