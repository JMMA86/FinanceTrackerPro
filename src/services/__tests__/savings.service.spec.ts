/**
 * Savings Service Unit Tests
 *
 * Unit tests for src/services/savings.service.ts with prisma + logger mocked.
 * These complement the integration suite (savings.actions.integration.test.ts)
 * and lock the per-currency aggregation (C1), the conditional reconciliation
 * write (Rule 13) and the projection math WITHOUT requiring a database.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  reconcileGoalBalance,
  reconcileGoalBalances,
  calculateProjectedCompletion,
  getMaxSpendable,
  getSavingsSummary,
} from '../savings.service';

// ---------------------------------------------------------------------------
// Mocked prisma + logger (pattern mirrors rate-limit.service.test.ts)
// ---------------------------------------------------------------------------

const { mockPrisma, mockLog } = vi.hoisted(() => ({
  mockPrisma: {
    savingsGoal: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    savingsContribution: {
      findMany: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
    },
    fixedExpensePayment: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({ log: mockLog }));
vi.mock('server-only', () => ({}));

describe('savings.service (unit)', () => {
  beforeEach(() => {
    // resetAllMocks wipes any leftover mockResolvedValueOnce queues and
    // implementations from the previous test.
    vi.resetAllMocks();
    // Defaults that make reconcile no-ops / queries resolve cleanly.
    mockPrisma.savingsContribution.findMany.mockResolvedValue([]);
    mockPrisma.fixedExpensePayment.findMany.mockResolvedValue([]);
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.savingsGoal.findMany.mockResolvedValue([]);
    mockPrisma.savingsGoal.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.$transaction.mockImplementation((input: unknown) =>
      Promise.resolve(Array.isArray(input) ? input.map(() => ({ count: 1 })) : input)
    );
  });

  // ==========================================================================
  // reconcileGoalBalances (plural — read path reconciliation, Rule 13)
  // ==========================================================================

  describe('reconcileGoalBalances', () => {
    it('returns early without touching contributions when the user has no ACTIVE/COMPLETED goals', async () => {
      mockPrisma.savingsGoal.findMany.mockResolvedValue([]);

      await expect(reconcileGoalBalances('user-1')).resolves.toBeUndefined();

      expect(mockPrisma.savingsGoal.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          isActive: true,
          status: { in: ['ACTIVE', 'COMPLETED'] },
        },
        select: { id: true, currentAmountCents: true },
      });
      expect(mockPrisma.savingsContribution.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.savingsGoal.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('does NOT update when the cached amount already matches the ledger', async () => {
      mockPrisma.savingsGoal.findMany.mockResolvedValue([
        { id: 'goal-1', currentAmountCents: 30000 },
        { id: 'goal-2', currentAmountCents: 10000 },
      ]);
      mockPrisma.savingsContribution.findMany.mockResolvedValue([
        { goalId: 'goal-1', amountCents: 30000 },
        { goalId: 'goal-2', amountCents: 10000 },
      ]);

      await reconcileGoalBalances('user-1');

      expect(mockPrisma.savingsGoal.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockLog.warn).not.toHaveBeenCalled();
    });

    it('writes a CONDITIONAL updateMany with the ledger true amount when a discrepancy exists', async () => {
      // Cache says 50 000, but the ledger (active contributions) totals 70 000.
      mockPrisma.savingsGoal.findMany.mockResolvedValue([
        { id: 'goal-1', currentAmountCents: 50000 },
        { id: 'goal-2', currentAmountCents: 20000 }, // no discrepancy
      ]);
      mockPrisma.savingsContribution.findMany.mockResolvedValue([
        { goalId: 'goal-1', amountCents: 70000 },
        { goalId: 'goal-2', amountCents: 20000 },
      ]);

      await reconcileGoalBalances('user-1');

      expect(mockPrisma.savingsGoal.updateMany).toHaveBeenCalledTimes(1);
      // The snapshot cached value is the guard so a concurrent increment that
      // changed currentAmountCents makes this write a no-op.
      expect(mockPrisma.savingsGoal.updateMany).toHaveBeenCalledWith({
        where: { id: 'goal-1', currentAmountCents: 50000 },
        data: { currentAmountCents: 70000 },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockLog.warn).toHaveBeenCalled();
    });

    it('does not throw nor clobber when the conditional update matches 0 rows (cache changed concurrently)', async () => {
      mockPrisma.savingsGoal.findMany.mockResolvedValue([{ id: 'goal-1', currentAmountCents: 0 }]);
      mockPrisma.savingsContribution.findMany.mockResolvedValue([
        { goalId: 'goal-1', amountCents: 10000 },
      ]);
      mockPrisma.savingsGoal.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.$transaction.mockResolvedValue([{ count: 0 }]);

      await expect(reconcileGoalBalances('user-1')).resolves.toBeUndefined();

      expect(mockPrisma.savingsGoal.updateMany).toHaveBeenCalledWith({
        where: { id: 'goal-1', currentAmountCents: 0 },
        data: { currentAmountCents: 10000 },
      });
      // A guard miss is NOT an error: the goal is simply left for the next read.
      expect(mockLog.error).not.toHaveBeenCalled();
    });

    it('aggregates multiple contributions into a single true ledger amount per goal', async () => {
      mockPrisma.savingsGoal.findMany.mockResolvedValue([{ id: 'goal-1', currentAmountCents: 0 }]);
      mockPrisma.savingsContribution.findMany.mockResolvedValue([
        { goalId: 'goal-1', amountCents: 10000 },
        { goalId: 'goal-1', amountCents: 25000 },
        { goalId: 'goal-1', amountCents: 5000 },
      ]);

      await reconcileGoalBalances('user-1');

      expect(mockPrisma.savingsGoal.updateMany).toHaveBeenCalledWith({
        where: { id: 'goal-1', currentAmountCents: 0 },
        data: { currentAmountCents: 40000 },
      });
    });

    it('never throws — reconciliation failures are logged and swallowed on read paths', async () => {
      mockPrisma.savingsGoal.findMany.mockRejectedValue(new Error('db down'));

      await expect(reconcileGoalBalances('user-1')).resolves.toBeUndefined();
      expect(mockLog.error).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // reconcileGoalBalance (singular — one-off reconciliation)
  // ==========================================================================

  describe('reconcileGoalBalance', () => {
    it('throws when the goal does not exist', async () => {
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(null);

      await expect(reconcileGoalBalance('missing-goal')).rejects.toThrow(
        'SavingsGoal missing-goal not found'
      );
    });

    it('returns wasUpdated:false when cache matches the ledger', async () => {
      mockPrisma.savingsGoal.findUnique.mockResolvedValue({
        id: 'goal-1',
        currentAmountCents: 5000,
      });
      mockPrisma.savingsContribution.findMany.mockResolvedValue([
        { amountCents: 2000 },
        { amountCents: 3000 },
      ]);

      const result = await reconcileGoalBalance('goal-1');

      expect(result).toMatchObject({
        success: true,
        cachedAmount: 5000,
        trueAmount: 5000,
        discrepancy: 0,
        wasUpdated: false,
      });
      expect(mockPrisma.savingsGoal.update).not.toHaveBeenCalled();
    });

    it('updates the cached amount and reports the discrepancy when found', async () => {
      mockPrisma.savingsGoal.findUnique.mockResolvedValue({
        id: 'goal-1',
        currentAmountCents: 9000,
      });
      mockPrisma.savingsContribution.findMany.mockResolvedValue([{ amountCents: 15000 }]);
      mockPrisma.savingsGoal.update.mockResolvedValue({
        id: 'goal-1',
        currentAmountCents: 15000,
      });

      const result = await reconcileGoalBalance('goal-1');

      expect(mockPrisma.savingsGoal.update).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
        data: { currentAmountCents: 15000 },
      });
      expect(result).toMatchObject({
        success: true,
        cachedAmount: 9000,
        trueAmount: 15000,
        discrepancy: -6000,
        wasUpdated: true,
      });
    });
  });

  // ==========================================================================
  // calculateProjectedCompletion
  // ==========================================================================

  describe('calculateProjectedCompletion', () => {
    // Prisma money fields are BIGINT — mirror that shape in the fixtures.
    const baseGoal = {
      targetAmountCents: BigInt(100000),
      currentAmountCents: BigInt(0),
      monthlyContributionCents: BigInt(50000),
      deadline: null,
    };

    it('returns null when there is no monthly contribution plan', () => {
      expect(
        calculateProjectedCompletion({ ...baseGoal, monthlyContributionCents: null })
      ).toBeNull();
      expect(
        calculateProjectedCompletion({ ...baseGoal, monthlyContributionCents: BigInt(0) })
      ).toBeNull();
      expect(
        calculateProjectedCompletion({ ...baseGoal, monthlyContributionCents: BigInt(-1) })
      ).toBeNull();
    });

    it('returns a completion date (today) when the goal is already reached', () => {
      const result = calculateProjectedCompletion({
        ...baseGoal,
        currentAmountCents: BigInt(120000), // already above target
      });
      expect(result).not.toBeNull();
      expect(typeof result).toBe('string');
    });

    it('returns null when the projected date falls after the deadline', () => {
      // Remaining 100 000 / 10 000 = 10 months from today — force a deadline
      // that is closer than the projection so the goal "cannot meet" it.
      const nearDeadline = new Date();
      nearDeadline.setMonth(nearDeadline.getMonth() + 2);

      const result = calculateProjectedCompletion({
        ...baseGoal,
        currentAmountCents: BigInt(0),
        monthlyContributionCents: BigInt(10000),
        deadline: nearDeadline,
      });
      expect(result).toBeNull();
    });

    it('returns a projected date string for a feasible plan without deadline', () => {
      const result = calculateProjectedCompletion(baseGoal);
      expect(result).not.toBeNull();
      expect(typeof result).toBe('string');
    });
  });

  // ==========================================================================
  // getMaxSpendable (per-currency aggregation — C1/C2)
  // ==========================================================================

  describe('getMaxSpendable', () => {
    it('groups COP and USD into separate buckets and NEVER mixes currencies', async () => {
      // income (per currency)
      mockPrisma.transaction.findMany
        .mockResolvedValueOnce([
          { amountCents: 1000000, currency: 'COP' },
          { amountCents: 100000, currency: 'USD' },
        ])
        // variable expenses
        .mockResolvedValueOnce([
          { id: 'tx-linked', amountCents: -60000, currency: 'COP' }, // linked to a contribution → skipped
          { id: 'tx-var-cop', amountCents: -50000, currency: 'COP' },
          { id: 'tx-var-usd', amountCents: -7000, currency: 'USD' },
        ]);

      // fixed expense payments: grouped by the FIXED EXPENSE currency
      mockPrisma.fixedExpensePayment.findMany.mockResolvedValue([
        { expectedAmountCents: 200000, fixedExpense: { currency: 'COP' } },
        { expectedAmountCents: 10000, fixedExpense: { currency: 'USD' } },
      ]);

      // active goals
      mockPrisma.savingsGoal.findMany.mockResolvedValue([
        { id: 'g1', currency: 'COP', monthlyContributionCents: 50000 },
        { id: 'g2', currency: 'USD', monthlyContributionCents: 1000 },
      ]);

      // realized contributions this month (goals ACTIVE/COMPLETED/CANCELLED).
      // g3 is NOT active anymore (auto-completed / cancelled mid-month) but its
      // realized money already left the budget → it must still be counted.
      mockPrisma.savingsContribution.findMany
        .mockResolvedValueOnce([
          { goalId: 'g1', amountCents: 60000, goal: { currency: 'COP' } },
          { goalId: 'g2', amountCents: 5000, goal: { currency: 'USD' } },
          { goalId: 'g3', amountCents: 800, goal: { currency: 'USD' } },
        ])
        // contribution-linked transaction ids (excluded from the variable bucket)
        .mockResolvedValueOnce([{ transactionId: 'tx-linked' }]);

      const result = await getMaxSpendable('user-1', 9, 2026);

      expect(result.byCurrency).toHaveLength(2);

      const cop = result.byCurrency.find((b) => b.currency === 'COP')!;
      const usd = result.byCurrency.find((b) => b.currency === 'USD')!;

      // COP: income 1M - fixed 200k - commitment max(50k plan, 60k realized) - variable 50k
      expect(cop.totalIncomeCents).toBe(1000000);
      expect(cop.totalFixedExpensesCents).toBe(200000);
      expect(cop.totalSavingsCommitmentsCents).toBe(60000);
      expect(cop.totalVariableExpensesCents).toBe(50000);
      expect(cop.maxSpendableCents).toBe(690000);

      // USD: income 100k - fixed 10k - commitments (5k g2 + 800 g3) - variable 7k
      expect(usd.totalIncomeCents).toBe(100000);
      expect(usd.totalFixedExpensesCents).toBe(10000);
      expect(usd.totalSavingsCommitmentsCents).toBe(5800);
      expect(usd.totalVariableExpensesCents).toBe(7000);
      expect(usd.maxSpendableCents).toBe(77200);
    });

    it('excludes fixed-expense and contribution-linked EXPENSE transactions from the variable bucket at query level', async () => {
      mockPrisma.transaction.findMany
        .mockResolvedValueOnce([{ amountCents: 500000, currency: 'COP' }])
        .mockResolvedValueOnce([{ id: 'tx-var', amountCents: -20000, currency: 'COP' }]);
      mockPrisma.savingsGoal.findMany.mockResolvedValue([]);
      mockPrisma.savingsContribution.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await getMaxSpendable('user-1', 9, 2026);

      const variableQuery = mockPrisma.transaction.findMany.mock.calls[1][0];
      expect(variableQuery.where).toMatchObject({
        userId: 'user-1',
        isActive: true,
        type: 'EXPENSE',
        // Rows with a fixedExpensePaymentId are already covered by the fixed
        // expense bucket — the query asks the DB to exclude them.
        fixedExpensePaymentId: null,
      });
      expect(variableQuery.where.date).toBeDefined();
    });

    it('uses the planned monthly amount when it exceeds the realized contributions', async () => {
      mockPrisma.transaction.findMany
        .mockResolvedValueOnce([{ amountCents: 1000000, currency: 'COP' }])
        .mockResolvedValueOnce([]);
      mockPrisma.savingsGoal.findMany.mockResolvedValue([
        { id: 'g1', currency: 'COP', monthlyContributionCents: 200000 },
      ]);
      // Realized 50 000 < planned 200 000 → commitment = planned.
      mockPrisma.savingsContribution.findMany
        .mockResolvedValueOnce([{ goalId: 'g1', amountCents: 50000, goal: { currency: 'COP' } }])
        .mockResolvedValueOnce([]);

      const result = await getMaxSpendable('user-1', 9, 2026);

      const cop = result.byCurrency.find((b) => b.currency === 'COP')!;
      expect(cop.totalSavingsCommitmentsCents).toBe(200000);
      expect(cop.maxSpendableCents).toBe(800000);
    });

    it('allows a negative maxSpendable (overdraft) to be returned for the frontend to warn about', async () => {
      mockPrisma.transaction.findMany
        .mockResolvedValueOnce([{ amountCents: 50000, currency: 'COP' }])
        .mockResolvedValueOnce([]);
      mockPrisma.savingsGoal.findMany.mockResolvedValue([
        { id: 'g1', currency: 'COP', monthlyContributionCents: 200000 },
      ]);
      mockPrisma.savingsContribution.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await getMaxSpendable('user-1', 9, 2026);

      const cop = result.byCurrency.find((b) => b.currency === 'COP')!;
      expect(cop.maxSpendableCents).toBe(-150000);
    });
  });

  // ==========================================================================
  // getSavingsSummary (per-currency aggregation + clamp)
  // ==========================================================================

  describe('getSavingsSummary', () => {
    it('returns an empty byCurrency when the user has no ACTIVE/COMPLETED goals', async () => {
      mockPrisma.savingsGoal.findMany.mockResolvedValue([]);

      const result = await getSavingsSummary('user-1', 9, 2026);

      expect(result.byCurrency).toEqual([]);
    });

    it('splits totals per currency and only counts ACTIVE/COMPLETED goals', async () => {
      // Reconcile pass (first savingsGoal.findMany): cache === ledger.
      mockPrisma.savingsGoal.findMany
        .mockResolvedValueOnce([
          { id: 'g1', currentAmountCents: 30000 },
          { id: 'g2', currentAmountCents: 10000 },
        ])
        // Summary pass (second savingsGoal.findMany)
        .mockResolvedValueOnce([
          {
            currentAmountCents: 30000,
            targetAmountCents: 100000,
            status: 'ACTIVE',
            currency: 'COP',
          },
          {
            currentAmountCents: 10000,
            targetAmountCents: 20000,
            status: 'COMPLETED',
            currency: 'USD',
          },
        ]);
      // Reconcile contributions + monthly contributions.
      mockPrisma.savingsContribution.findMany
        .mockResolvedValueOnce([
          { goalId: 'g1', amountCents: 30000 },
          { goalId: 'g2', amountCents: 10000 },
        ])
        .mockResolvedValueOnce([
          { amountCents: 30000, currency: 'COP' },
          { amountCents: 10000, currency: 'USD' },
        ]);

      const result = await getSavingsSummary('user-1', 9, 2026);

      expect(result.byCurrency).toHaveLength(2);
      const cop = result.byCurrency.find((b) => b.currency === 'COP')!;
      const usd = result.byCurrency.find((b) => b.currency === 'USD')!;

      expect(cop).toMatchObject({
        totalSavedCents: 30000,
        totalTargetCents: 100000,
        overallProgressPercentage: 30,
        activeGoalsCount: 1,
        completedGoalsCount: 0,
        monthlyContributedCents: 30000,
      });
      expect(usd).toMatchObject({
        totalSavedCents: 10000,
        totalTargetCents: 20000,
        overallProgressPercentage: 50,
        activeGoalsCount: 0,
        completedGoalsCount: 1,
        monthlyContributedCents: 10000,
      });
    });

    it('filters CANCELLED goals out at the query level (summary + monthly contributions)', async () => {
      mockPrisma.savingsGoal.findMany.mockResolvedValue([]);

      await getSavingsSummary('user-1', 9, 2026);

      // First findMany (reconcile) + second findMany (summary) both restrict to
      // ACTIVE/COMPLETED. CANCELLED goals are never aggregated.
      const calls = mockPrisma.savingsGoal.findMany.mock.calls;
      expect(calls).toHaveLength(2);
      for (const args of calls) {
        expect(args[0].where.status).toEqual({ in: ['ACTIVE', 'COMPLETED'] });
      }
    });

    it('clamps overall progress to 100 when saved exceeds the target', async () => {
      mockPrisma.savingsGoal.findMany
        .mockResolvedValueOnce([{ id: 'g1', currentAmountCents: 200000 }])
        .mockResolvedValueOnce([
          {
            currentAmountCents: 200000,
            targetAmountCents: 100000,
            status: 'ACTIVE',
            currency: 'COP',
          },
        ]);
      mockPrisma.savingsContribution.findMany
        .mockResolvedValueOnce([{ goalId: 'g1', amountCents: 200000 }])
        .mockResolvedValueOnce([]);

      const result = await getSavingsSummary('user-1', 9, 2026);

      expect(result.byCurrency[0].overallProgressPercentage).toBe(100);
    });

    it('uses Decimal ROUND_HALF_EVEN (2 dp) for the overall progress percentage', async () => {
      mockPrisma.savingsGoal.findMany
        .mockResolvedValueOnce([{ id: 'g1', currentAmountCents: 3333 }])
        .mockResolvedValueOnce([
          { currentAmountCents: 3333, targetAmountCents: 10000, status: 'ACTIVE', currency: 'COP' },
        ]);
      mockPrisma.savingsContribution.findMany
        .mockResolvedValueOnce([{ goalId: 'g1', amountCents: 3333 }])
        .mockResolvedValueOnce([]);

      const result = await getSavingsSummary('user-1', 9, 2026);

      // 33.33% → 33.33 (no IEEE-754 drift on the stored percentage).
      expect(result.byCurrency[0].overallProgressPercentage).toBe(33.33);
    });

    it('returns progress 0 when the aggregated target is 0', async () => {
      mockPrisma.savingsGoal.findMany
        .mockResolvedValueOnce([]) // reconcile pass
        .mockResolvedValueOnce([]); // summary pass: no goals
      // Only a stray monthly contribution creates a currency bucket.
      mockPrisma.savingsContribution.findMany.mockResolvedValueOnce([
        { amountCents: 10000, currency: 'COP' },
      ]);

      const result = await getSavingsSummary('user-1', 9, 2026);

      expect(result.byCurrency).toHaveLength(1);
      expect(result.byCurrency[0].currency).toBe('COP');
      expect(result.byCurrency[0].totalTargetCents).toBe(0);
      expect(result.byCurrency[0].overallProgressPercentage).toBe(0);
      expect(result.byCurrency[0].monthlyContributedCents).toBe(10000);
    });
  });
});
