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
import { log } from '@/lib/logger';

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
  // Contributions first: SavingsContribution.goal is ON DELETE RESTRICT, so
  // goals cannot be removed while active contributions exist.
  await prisma.savingsContribution.deleteMany({
    where: { OR: [{ createdBy: TEST_USER_ID }, { createdBy: TEST_USER_ID_2 }] },
  });
  await prisma.savingsGoal.deleteMany({
    where: { OR: [{ userId: TEST_USER_ID }, { userId: TEST_USER_ID_2 }] },
  });
  await prisma.transaction.deleteMany({
    where: { OR: [{ userId: TEST_USER_ID }, { userId: TEST_USER_ID_2 }] },
  });
  await prisma.account.deleteMany({
    where: { OR: [{ userId: TEST_USER_ID }, { userId: TEST_USER_ID_2 }] },
  });
  await prisma.user.deleteMany({ where: { OR: [{ id: TEST_USER_ID }, { id: TEST_USER_ID_2 }] } });
}

import * as transactionActions from '../transaction.actions';
import * as savingsActions from '../savings.actions';

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
      expect(Number(unchangedAccount?.balanceCents)).toBe(100000);
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
      expect(Number(updatedAccount?.balanceCents)).toBe(0);
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
      expect(Number(updatedAccount?.balanceCents)).toBe(-150000);
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

  // ==========================================================================
  // Rule 11/13 — deleteTransaction cascades to linked savings contribution
  // ==========================================================================

  describe('deleteTransaction savings contribution cascade', () => {
    async function createContributionLinkedTx(
      goalStatus: 'ACTIVE' | 'COMPLETED',
      goalCurrentCents: number,
      contributionAmount: number
    ) {
      const account = await createTestAccount(TEST_USER_ID, {
        type: AccountType.SAVINGS,
        balanceCents: 100000,
      });

      const goal = await prisma.savingsGoal.create({
        data: {
          userId: TEST_USER_ID,
          name: 'Cascade Test Goal',
          targetAmountCents: 50000,
          currency: Currency.COP,
          currentAmountCents: goalCurrentCents,
          status: goalStatus,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: 'EXPENSE',
          amountCents: -contributionAmount,
          currency: Currency.COP,
          description: 'Contribution expense',
          date: new Date(),
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      const contribution = await prisma.savingsContribution.create({
        data: {
          goalId: goal.id,
          amountCents: contributionAmount,
          currency: Currency.COP,
          transactionId: tx.id,
          idempotencyKey: crypto.randomUUID(),
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
          isActive: true,
        },
      });

      return { account, goal, tx, contribution };
    }

    it('should soft-delete the linked contribution and revert the goal cache', async () => {
      const { account, goal, tx, contribution } = await createContributionLinkedTx(
        'ACTIVE',
        15000,
        15000
      );

      const result = await transactionActions.deleteTransaction({ transactionId: tx.id });

      expect(result.success).toBe(true);

      // Transaction soft-deleted
      const deletedTx = await prisma.transaction.findUnique({ where: { id: tx.id } });
      expect(deletedTx?.isActive).toBe(false);
      expect(deletedTx?.deletedAt).not.toBeNull();

      // Linked contribution soft-deleted
      const deletedContribution = await prisma.savingsContribution.findUnique({
        where: { id: contribution.id },
      });
      expect(deletedContribution?.isActive).toBe(false);
      expect(deletedContribution?.deletedAt).not.toBeNull();

      // Goal cache reverted from the ledger (source of truth)
      const updatedGoal = await prisma.savingsGoal.findUnique({ where: { id: goal.id } });
      expect(Number(updatedGoal?.currentAmountCents)).toBe(0);
      expect(updatedGoal?.status).toBe('ACTIVE');

      // Account balance cache reversed (EXPENSE negative reverted by adding back)
      const updatedAccount = await prisma.account.findUnique({ where: { id: account.id } });
      expect(Number(updatedAccount?.balanceCents)).toBe(115000);
    });

    it('should revert a COMPLETED goal to ACTIVE when the cache drops below target', async () => {
      const { goal, tx, contribution } = await createContributionLinkedTx(
        'COMPLETED',
        50000,
        20000
      );

      const result = await transactionActions.deleteTransaction({ transactionId: tx.id });
      expect(result.success).toBe(true);

      const updatedGoal = await prisma.savingsGoal.findUnique({ where: { id: goal.id } });
      expect(Number(updatedGoal?.currentAmountCents)).toBe(30000);
      expect(updatedGoal?.status).toBe('ACTIVE');

      const deletedContribution = await prisma.savingsContribution.findUnique({
        where: { id: contribution.id },
      });
      expect(deletedContribution?.isActive).toBe(false);
    });

    it('should keep a COMPLETED goal COMPLETED when the cache stays at target', async () => {
      const { goal, tx } = await createContributionLinkedTx('COMPLETED', 60000, 10000);

      const result = await transactionActions.deleteTransaction({ transactionId: tx.id });
      expect(result.success).toBe(true);

      // 60000 - 10000 = 50000 == target → stays COMPLETED
      const updatedGoal = await prisma.savingsGoal.findUnique({ where: { id: goal.id } });
      expect(Number(updatedGoal?.currentAmountCents)).toBe(50000);
      expect(updatedGoal?.status).toBe('COMPLETED');
    });

    it('should NOT revert a COMPLETED goal whose cache stays above target after the cascade', async () => {
      // Goal cache exceeds the target because a previous contribution already
      // completed it. Deleting the linked contribution (10000) leaves the cache
      // at 60000, still > target (50000), so the conditional revert (WHERE
      // currentAmountCents < target) must not match and the goal stays COMPLETED.
      const { goal, tx, contribution } = await createContributionLinkedTx(
        'COMPLETED',
        70000,
        10000
      );

      const result = await transactionActions.deleteTransaction({ transactionId: tx.id });
      expect(result.success).toBe(true);

      // 70000 - 10000 = 60000 > target 50000 → stays COMPLETED
      const updatedGoal = await prisma.savingsGoal.findUnique({ where: { id: goal.id } });
      expect(Number(updatedGoal?.currentAmountCents)).toBe(60000);
      expect(updatedGoal?.status).toBe('COMPLETED');

      // Contribution still soft-deleted by the cascade
      const deletedContribution = await prisma.savingsContribution.findUnique({
        where: { id: contribution.id },
      });
      expect(deletedContribution?.isActive).toBe(false);
    });
  });

  // ==========================================================================
  // deleteTransaction contribution cascade — audit-finance edge cases
  // ==========================================================================

  describe('deleteTransaction contribution cascade — audit-finance edge cases', () => {
    async function createEdgeFixture(options: {
      goalStatus?: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
      goalCurrentCents: number;
      goalTargetCents?: number;
      contributionAmount: number;
      txType?: 'INCOME' | 'EXPENSE';
      txAmountCents?: number;
      accountBalanceCents?: number;
      extraTransactions?: Array<{ type: 'INCOME' | 'EXPENSE'; amountCents: number }>;
      secondContributionAmount?: number;
      userId?: string;
    }) {
      const userId = options.userId ?? TEST_USER_ID;
      const account = await createTestAccount(userId, {
        type: AccountType.SAVINGS,
        balanceCents: options.accountBalanceCents ?? 100000,
      });

      const goal = await prisma.savingsGoal.create({
        data: {
          userId,
          name: 'Edge Case Goal',
          targetAmountCents: options.goalTargetCents ?? 50000,
          currency: Currency.COP,
          currentAmountCents: options.goalCurrentCents,
          status: options.goalStatus ?? 'ACTIVE',
          createdBy: userId,
          lastModifiedBy: userId,
        },
      });

      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId,
          accountId: account.id,
          type: options.txType ?? 'EXPENSE',
          amountCents: options.txAmountCents ?? -options.contributionAmount,
          currency: Currency.COP,
          description: 'Contribution linked transaction',
          date: new Date(),
          isActive: true,
          createdBy: userId,
          lastModifiedBy: userId,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
        },
      });

      const contribution = await prisma.savingsContribution.create({
        data: {
          goalId: goal.id,
          amountCents: options.contributionAmount,
          currency: Currency.COP,
          transactionId: tx.id,
          idempotencyKey: crypto.randomUUID(),
          createdBy: userId,
          lastModifiedBy: userId,
          isActive: true,
        },
      });

      if (options.secondContributionAmount) {
        await prisma.savingsContribution.create({
          data: {
            goalId: goal.id,
            amountCents: options.secondContributionAmount,
            currency: Currency.COP,
            transactionId: tx.id,
            idempotencyKey: crypto.randomUUID(),
            createdBy: userId,
            lastModifiedBy: userId,
            isActive: true,
          },
        });
      }

      for (const extra of options.extraTransactions ?? []) {
        await prisma.transaction.create({
          data: {
            idempotencyKey: crypto.randomUUID(),
            userId,
            accountId: account.id,
            type: extra.type,
            amountCents: extra.amountCents,
            currency: Currency.COP,
            description: 'Extra transaction',
            date: new Date(),
            isActive: true,
            createdBy: userId,
            lastModifiedBy: userId,
            ipAddress: '127.0.0.1',
            userAgent: 'vitest',
          },
        });
      }

      return { account, goal, tx, contribution };
    }

    it('should survive goal cache drift (0 rows matched) without forcing a negative cache', async () => {
      const { account, goal, tx, contribution } = await createEdgeFixture({
        goalStatus: 'ACTIVE',
        goalCurrentCents: 5000, // drift: below the contribution amount
        contributionAmount: 15000,
      });

      const result = await transactionActions.deleteTransaction({ transactionId: tx.id });

      // The conditional updateMany must not fail on 0 matched rows — it logs a
      // drift warning and leaves reconciliation to correct the cache on read.
      expect(result.success).toBe(true);

      // The contribution is still cascade soft-deleted.
      const deletedContribution = await prisma.savingsContribution.findUnique({
        where: { id: contribution.id },
      });
      expect(deletedContribution?.isActive).toBe(false);
      expect(deletedContribution?.deletedAt).not.toBeNull();

      // The cache is preserved (never forced negative by the cascade).
      const preservedGoal = await prisma.savingsGoal.findUnique({ where: { id: goal.id } });
      expect(Number(preservedGoal?.currentAmountCents)).toBe(5000);

      // Drift warning emitted and did not break the flow.
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ contributionId: contribution.id }),
        expect.stringContaining('drift')
      );

      // Transaction soft-deleted and balance reverted as usual.
      const deletedTx = await prisma.transaction.findUnique({ where: { id: tx.id } });
      expect(deletedTx?.isActive).toBe(false);
      const updatedAccount = await prisma.account.findUnique({ where: { id: account.id } });
      expect(Number(updatedAccount?.balanceCents)).toBe(115000);
    });

    it('should cascade soft-delete ALL active contributions sharing the transaction and decrement the goal by the sum', async () => {
      const { account, goal, tx } = await createEdgeFixture({
        goalStatus: 'ACTIVE',
        goalCurrentCents: 30000,
        contributionAmount: 10000,
        secondContributionAmount: 20000,
        txAmountCents: -30000, // linked transaction matches the SUM of contributions
      });

      // Defensive setup: two active contributions on the SAME transaction.
      const activeBefore = await prisma.savingsContribution.count({
        where: { transactionId: tx.id, isActive: true },
      });
      expect(activeBefore).toBe(2);

      const result = await transactionActions.deleteTransaction({ transactionId: tx.id });
      expect(result.success).toBe(true);

      // BOTH contributions soft-deleted by the cascade.
      const allContributions = await prisma.savingsContribution.findMany({
        where: { transactionId: tx.id },
      });
      expect(allContributions).toHaveLength(2);
      expect(allContributions.every((c) => !c.isActive)).toBe(true);
      expect(allContributions.every((c) => c.deletedAt !== null)).toBe(true);

      // Goal cache decremented by the SUM (30000 → 0).
      const updatedGoal = await prisma.savingsGoal.findUnique({ where: { id: goal.id } });
      expect(Number(updatedGoal?.currentAmountCents)).toBe(0);
      expect(updatedGoal?.status).toBe('ACTIVE');

      // Transaction soft-deleted and balance reverted by the full amount.
      const deletedTx = await prisma.transaction.findUnique({ where: { id: tx.id } });
      expect(deletedTx?.isActive).toBe(false);
      const updatedAccount = await prisma.account.findUnique({ where: { id: account.id } });
      expect(Number(updatedAccount?.balanceCents)).toBe(130000);
    });

    it('should reject with UNAUTHORIZED when a different user deletes a linked transaction and leave everything untouched', async () => {
      // User A (TEST_USER_ID_2) owns account/goal/transaction/contribution;
      // the session mock always resolves to TEST_USER_ID (user B).
      await createTestUser(TEST_USER_ID_2, 'user2');
      const fixture = await createEdgeFixture({
        userId: TEST_USER_ID_2,
        goalStatus: 'ACTIVE',
        goalCurrentCents: 20000,
        contributionAmount: 15000,
        accountBalanceCents: 100000,
      });

      const result = await transactionActions.deleteTransaction({
        transactionId: fixture.tx.id,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');

      // No cascade happened: contribution stays active.
      const contribution = await prisma.savingsContribution.findUnique({
        where: { id: fixture.contribution.id },
      });
      expect(contribution?.isActive).toBe(true);
      expect(contribution?.deletedAt).toBeNull();

      // Goal cache untouched.
      const goal = await prisma.savingsGoal.findUnique({ where: { id: fixture.goal.id } });
      expect(Number(goal?.currentAmountCents)).toBe(20000);

      // Transaction and account untouched.
      const tx = await prisma.transaction.findUnique({ where: { id: fixture.tx.id } });
      expect(tx?.isActive).toBe(true);
      const account = await prisma.account.findUnique({ where: { id: fixture.account.id } });
      expect(Number(account?.balanceCents)).toBe(100000);
    });

    it('should atomically rollback the contribution soft-delete when the balance reversal would go negative', async () => {
      const { account, goal, tx, contribution } = await createEdgeFixture({
        goalStatus: 'ACTIVE',
        goalCurrentCents: 15000,
        contributionAmount: 15000,
        txType: 'INCOME', // defensive: contribution linked to an INCOME
        txAmountCents: 300000,
        accountBalanceCents: 100000,
        extraTransactions: [{ type: 'EXPENSE', amountCents: -250000 }],
      });

      // trueBalance = 300000 - 250000 = 50000. Deleting the INCOME projects
      // 50000 - 300000 = -250000 < 0 → NegativeBalanceError AFTER the cascade
      // loop, so Prisma must roll back the contribution soft-delete.
      const result = await transactionActions.deleteTransaction({ transactionId: tx.id });

      expect(result.success).toBe(false);
      expect(result.code).toBe('BALANCE_NEGATIVE');

      // NO contribution remains soft-deleted (full rollback).
      const contributionAfter = await prisma.savingsContribution.findUnique({
        where: { id: contribution.id },
      });
      expect(contributionAfter?.isActive).toBe(true);
      expect(contributionAfter?.deletedAt).toBeNull();

      // Goal cache untouched.
      const goalAfter = await prisma.savingsGoal.findUnique({ where: { id: goal.id } });
      expect(Number(goalAfter?.currentAmountCents)).toBe(15000);
      expect(goalAfter?.status).toBe('ACTIVE');

      // Transaction still active, account balance unchanged.
      const txAfter = await prisma.transaction.findUnique({ where: { id: tx.id } });
      expect(txAfter?.isActive).toBe(true);
      const accountAfter = await prisma.account.findUnique({ where: { id: account.id } });
      expect(Number(accountAfter?.balanceCents)).toBe(100000);
    });

    it('should keep savings metrics coherent after deleting a contribution of the month', async () => {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const { goal, tx } = await createEdgeFixture({
        goalStatus: 'ACTIVE',
        goalCurrentCents: 15000,
        goalTargetCents: 50000,
        contributionAmount: 15000,
        accountBalanceCents: 100000,
        extraTransactions: [{ type: 'INCOME', amountCents: 100000 }],
      });

      // BEFORE delete: the money is committed exactly once (savings commitment
      // bucket) and the linked EXPENSE is excluded from the variable bucket.
      const summaryBefore = await savingsActions.getSavingsSummary({ month, year });
      const bucketBefore = summaryBefore.data!.byCurrency.find((b) => b.currency === 'COP')!;
      expect(bucketBefore.monthlyContributedCents).toBe(15000);

      const spendBefore = await savingsActions.calculateMaxSpendable({ month, year });
      const spendBucketBefore = spendBefore.data!.byCurrency.find((b) => b.currency === 'COP')!;
      expect(spendBucketBefore.totalIncomeCents).toBe(100000);
      expect(spendBucketBefore.totalSavingsCommitmentsCents).toBe(15000);
      expect(spendBucketBefore.totalVariableExpensesCents).toBe(0);
      expect(spendBucketBefore.maxSpendableCents).toBe(85000);

      const result = await transactionActions.deleteTransaction({ transactionId: tx.id });
      expect(result.success).toBe(true);

      // AFTER delete: (a) the month no longer counts the contribution.
      const summaryAfter = await savingsActions.getSavingsSummary({ month, year });
      const bucketAfter = summaryAfter.data!.byCurrency.find((b) => b.currency === 'COP')!;
      expect(bucketAfter.monthlyContributedCents).toBe(0);

      // (b) getMaxSpendable does not double-count: the linked EXPENSE is gone
      // from the variable bucket (soft-deleted) and the inactive contribution
      // adds no savings commitment.
      const spendAfter = await savingsActions.calculateMaxSpendable({ month, year });
      const spendBucketAfter = spendAfter.data!.byCurrency.find((b) => b.currency === 'COP')!;
      expect(spendBucketAfter.totalSavingsCommitmentsCents).toBe(0);
      expect(spendBucketAfter.totalVariableExpensesCents).toBe(0);
      expect(spendBucketAfter.maxSpendableCents).toBe(100000);

      // (c) goal reads reconcile to the new cache (0 from the ledger).
      const goals = await savingsActions.getSavingsGoals({});
      const goalRow = goals.data!.find((g) => g.id === goal.id)!;
      expect(goalRow.currentAmountCents).toBe(0);
    });

    it('should cascade a CANCELLED goal contribution without reverting its status', async () => {
      const { goal, tx, contribution } = await createEdgeFixture({
        goalStatus: 'CANCELLED',
        goalCurrentCents: 20000,
        contributionAmount: 15000,
      });

      const result = await transactionActions.deleteTransaction({ transactionId: tx.id });
      expect(result.success).toBe(true);

      // Contribution soft-deleted.
      const deletedContribution = await prisma.savingsContribution.findUnique({
        where: { id: contribution.id },
      });
      expect(deletedContribution?.isActive).toBe(false);
      expect(deletedContribution?.deletedAt).not.toBeNull();

      // Cache decremented (20000 - 15000 = 5000) but the status is NOT
      // reverted: the conditional revert only matches COMPLETED goals.
      const updatedGoal = await prisma.savingsGoal.findUnique({ where: { id: goal.id } });
      expect(Number(updatedGoal?.currentAmountCents)).toBe(5000);
      expect(updatedGoal?.status).toBe('CANCELLED');
    });
  });
});
