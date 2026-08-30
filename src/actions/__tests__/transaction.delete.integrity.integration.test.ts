/**
 * Transaction Delete Integrity Integration Tests
 * Tests Rule 1: deleteTransaction never leaves negative balance (excl. CREDIT_CARD)
 * Tests Rule 3: getAllTransactions includes account.name
 *
 * Run with: npm run test:coverage
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient, Currency, AccountType, Language, Theme } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AppError } from '@/lib/errors/api-errors';

const TEST_DB_URL = process.env.DATABASE_URL!;
const TEST_USER_ID = 'tx-delete-int-test-user-' + Date.now();
const TEST_USER_ID_2 = 'tx-delete-int-test-user-2-' + Date.now();

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
      email: `tx-delete-int-test-${Date.now()}@example.com`,
      name: 'Transaction Delete Integrity Test User',
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

vi.mock('@/services/rate-limit.service', () => ({
  checkApiRateLimit: vi.fn(() => Promise.resolve({ allowed: rateLimitAllowed })),
  recordApiAttempt: vi.fn().mockResolvedValue('attempt-1'),
  markApiAttemptSuccess: vi.fn().mockResolvedValue(undefined),
}));

// NOTE: we do NOT mock @/services/reconciliation.service — getTrueBalance is REAL
// to validate the math with actual transaction data (per briefing).

// ============================================================================
// Test helpers
// ============================================================================

async function createTestUser(id: string, emailSuffix: string) {
  return prisma.user.create({
    data: {
      id,
      email: `tx-delete-int-${emailSuffix}-${Date.now()}@example.com`,
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

async function cleanupTestData() {
  await prisma.transaction.deleteMany({
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

describe('Transaction Delete Integrity Integration', () => {
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
    await createTestUser(TEST_USER_ID, 'user1');
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Rule 1 — deleteTransaction never leaves negative balance
  // ==========================================================================

  describe('deleteTransaction negative balance guard', () => {
    it('should reject deleting opening INCOME when it would leave balance negative', async () => {
      const account = await createTestAccount(TEST_USER_ID, {
        type: AccountType.SAVINGS,
        balanceCents: 100000,
      });

      // Opening INCOME +300000
      const openingTx = await createTestTransaction(account.id, {
        type: 'INCOME',
        amountCents: 300000,
        description: 'Opening balance',
      });

      // EXPENSE -200000
      await createTestTransaction(account.id, {
        type: 'EXPENSE',
        amountCents: -200000,
        description: 'Some expense',
      });

      // trueBalance = 300000 + (-200000) = 100000
      // projected after deleting opening = 100000 - 300000 = -200000 < 0
      const result = await transactionActions.deleteTransaction({
        transactionId: openingTx.id,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('BALANCE_NEGATIVE');

      // Verify transaction is still active
      const txStillActive = await prisma.transaction.findUnique({
        where: { id: openingTx.id },
      });
      expect(txStillActive?.isActive).toBe(true);

      // Verify balance unchanged
      const unchangedAccount = await prisma.account.findUnique({
        where: { id: account.id },
      });
      expect(unchangedAccount?.balanceCents).toBe(100000);
    });

    it('should allow deleting opening INCOME when balance remains non-negative', async () => {
      const account = await createTestAccount(TEST_USER_ID, {
        type: AccountType.SAVINGS,
        balanceCents: 300000,
      });

      // Opening INCOME +300000 (only transaction)
      const openingTx = await createTestTransaction(account.id, {
        type: 'INCOME',
        amountCents: 300000,
        description: 'Opening balance',
      });

      // trueBalance = 300000
      // projected after deleting opening = 300000 - 300000 = 0 → OK
      const result = await transactionActions.deleteTransaction({
        transactionId: openingTx.id,
      });

      expect(result.success).toBe(true);

      // Transaction is soft-deleted
      const deletedTx = await prisma.transaction.findUnique({
        where: { id: openingTx.id },
      });
      expect(deletedTx?.isActive).toBe(false);
      expect(deletedTx?.deletedAt).not.toBeNull();

      // Balance updated to 0
      const updatedAccount = await prisma.account.findUnique({
        where: { id: account.id },
      });
      expect(updatedAccount?.balanceCents).toBe(0);
    });

    it('should allow deleting transaction that leaves CREDIT_CARD balance negative', async () => {
      const account = await createTestAccount(TEST_USER_ID, {
        type: AccountType.CREDIT_CARD,
        balanceCents: -50000,
      });

      // Payment (INCOME) +100000
      const openingTx = await createTestTransaction(account.id, {
        type: 'INCOME',
        amountCents: 100000,
        description: 'Card payment',
      });

      // Purchase (EXPENSE) -150000
      await createTestTransaction(account.id, {
        type: 'EXPENSE',
        amountCents: -150000,
        description: 'Purchase',
      });

      // trueBalance = 100000 + (-150000) = -50000
      // projected after deleting payment = -50000 - 100000 = -150000 < 0
      // But CREDIT_CARD is exempt → allowed
      const result = await transactionActions.deleteTransaction({
        transactionId: openingTx.id,
      });

      expect(result.success).toBe(true);

      // Transaction is soft-deleted
      const deletedTx = await prisma.transaction.findUnique({
        where: { id: openingTx.id },
      });
      expect(deletedTx?.isActive).toBe(false);

      // Balance updated (reverted)
      const updatedAccount = await prisma.account.findUnique({
        where: { id: account.id },
      });
      // original balance -50000, reversing +100000 (removing the INCOME) → -150000
      expect(updatedAccount?.balanceCents).toBe(-150000);
    });
  });

  // ==========================================================================
  // Rule 3 — getAllTransactions includes account.name
  // ==========================================================================

  describe('getAllTransactions includes account name', () => {
    it('should include account.name for transactions with active accounts', async () => {
      const account = await createTestAccount(TEST_USER_ID, {
        name: 'My Savings Account',
        balanceCents: 50000,
      });

      await createTestTransaction(account.id, {
        type: 'INCOME',
        amountCents: 50000,
        description: 'Salary',
      });

      const result = await transactionActions.getAllTransactions({
        page: 1,
        pageSize: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data!.transactions).toHaveLength(1);
      expect(result.data!.transactions[0].account).toBeDefined();
      expect(result.data!.transactions[0].account.name).toBe('My Savings Account');
    });

    it('should include account.name even when account is inactive', async () => {
      const account = await createTestAccount(TEST_USER_ID, {
        name: 'Closed Account',
        balanceCents: 0,
        isActive: false,
      });

      await createTestTransaction(account.id, {
        type: 'INCOME',
        amountCents: 30000,
        description: 'Old income',
      });

      const result = await transactionActions.getAllTransactions({
        page: 1,
        pageSize: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data!.transactions).toHaveLength(1);
      expect(result.data!.transactions[0].account).toBeDefined();
      expect(result.data!.transactions[0].account.name).toBe('Closed Account');
    });
  });
});
