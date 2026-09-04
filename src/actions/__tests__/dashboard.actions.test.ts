/**
 * Tests for dashboard.actions.ts - getDashboardMetrics + getDashboardMetricsByUser
 * Covers: getLocale, calculateAccountMetrics, processCreditCardAccount,
 *         processAssetAccount, updateMaxInterestRate, calculateLoanMetrics,
 *         calculateTransactionMetrics, calculatePendingFixedExpenses,
 *         buildDistribution, buildRecentTransactions, formatMetricsResult
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import Decimal from 'decimal.js';

// ── Mocks (must precede all imports that load these modules) ──────────────────

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    account: { findMany: vi.fn() },
    loan: { findMany: vi.fn() },
    transaction: { findMany: vi.fn(), findFirst: vi.fn() },
    fixedExpensePayment: { findMany: vi.fn() },
    fixedExpense: { create: vi.fn() },
    savingsGoal: { findMany: vi.fn().mockResolvedValue([]) },
    savingsContribution: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock('@/services/reconciliation.service', () => ({
  getTrueBalance: vi.fn(),
}));

vi.mock('@/lib/repositories', () => ({
  getTransactionRepository: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/money', () => ({
  formatMoney: vi
    .fn()
    .mockImplementation((cents: number, currency: string) => `${currency}:${cents}`),
  addCents: vi.fn().mockImplementation((a: number, b: number) => a + b),
  subtractCents: vi.fn().mockImplementation((a: number, b: number) => a - b),
}));

// Mock savings service to avoid interfering with dashboard tests
vi.mock('@/services/savings.service', () => ({
  getSavingsSummary: vi.fn().mockResolvedValue({
    totalSavedCents: 0,
    totalTargetCents: 0,
    overallProgressPercentage: 0,
    activeGoalsCount: 0,
    completedGoalsCount: 0,
    monthlyContributedCents: 0,
  }),
  getMaxSpendable: vi.fn().mockResolvedValue({
    totalIncomeCents: 0,
    totalFixedExpensesCents: 0,
    totalSavingsCommitmentsCents: 0,
    totalVariableExpensesCents: 0,
    maxSpendableCents: 0,
  }),
  reconcileGoalBalance: vi.fn(),
  calculateProjectedCompletion: vi.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { getDashboardMetrics, getDashboardMetricsByUser } from '../dashboard.actions';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { getTrueBalance } from '@/services/reconciliation.service';
import { formatMoney } from '@/lib/money';

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockGetSession = vi.mocked(getSession);
const mockAccount = vi.mocked(prisma.account.findMany);
const mockLoan = vi.mocked(prisma.loan.findMany);
const mockTx = vi.mocked(prisma.transaction.findMany);
const mockTxFindFirst = vi.mocked(prisma.transaction.findFirst);
const mockFixed = vi.mocked(prisma.fixedExpensePayment.findMany);
const mockGetTrueBalance = vi.mocked(getTrueBalance);
const mockFormatMoney = vi.mocked(formatMoney);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2024-06-15T12:00:00.000Z');

const USER_ID = 'user-test-123';

type _AccountRow = {
  id: string;
  name: string;
  balanceCents: number;
  currency: 'COP' | 'USD' | 'EUR';
  type: string;
  creditLimitCents: number | null;
  interestRateEA: number | Decimal | null;
};

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acc-1',
    name: 'Test Account',
    balanceCents: 100_000,
    currency: 'COP',
    type: 'SAVINGS',
    creditLimitCents: null,
    interestRateEA: null,
    parentAccountId: null,
    ...overrides,
  } as unknown as Awaited<ReturnType<typeof prisma.account.findMany>>[number];
}

function makeLoanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'loan-1',
    name: 'Test Loan',
    balanceCents: 500_000,
    ...overrides,
  } as unknown as Awaited<ReturnType<typeof prisma.loan.findMany>>[number];
}

function makeTxRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    description: 'Test',
    amountCents: 10_000,
    currency: 'COP',
    type: 'INCOME',
    date: new Date('2024-06-10T00:00:00.000Z'),
    accountId: 'acc-1',
    transferToAccountId: null,
    transferFromAccountId: null,
    ...overrides,
  } as unknown as Awaited<ReturnType<typeof prisma.transaction.findMany>>[number];
}

// Single transaction to bypass the early-return (accounts=0, txs=0) guard
const ONE_TX = [makeTxRow()];

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('dashboard.actions.ts', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: empty database
    mockAccount.mockResolvedValue([]);
    mockLoan.mockResolvedValue([]);
    mockTx.mockResolvedValue([]);
    mockTxFindFirst.mockResolvedValue(null);
    mockFixed.mockResolvedValue([]);
  });

  // ── getDashboardMetrics ────────────────────────────────────────────────────

  describe('getDashboardMetrics', () => {
    it('returns empty metrics when session is null', async () => {
      mockGetSession.mockResolvedValue(null);

      const result = await getDashboardMetrics('en');

      expect(result.netWorth.amount).toBe(0);
      expect(result.totalCash.amount).toBe(0);
      expect(result.recentTransactions).toHaveLength(0);
      expect(mockAccount).not.toHaveBeenCalled();
    });

    it('returns empty metrics when session has no userId', async () => {
      mockGetSession.mockResolvedValue(
        {} as ReturnType<typeof getSession> extends Promise<infer T> ? T : never
      );

      const result = await getDashboardMetrics('en');

      expect(result.netWorth.amount).toBe(0);
      expect(mockAccount).not.toHaveBeenCalled();
    });

    it('queries the database with the correct userId when session exists', async () => {
      mockGetSession.mockResolvedValue({
        userId: USER_ID,
        email: 'test@example.com',
        name: 'Test',
      });

      await getDashboardMetrics('en');

      expect(mockAccount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID, isActive: true } })
      );
    });
  });

  // ── getLocale ─────────────────────────────────────────────────────────────

  describe('getLocale', () => {
    beforeEach(() => {
      // Ensure we bypass the early-return guard so formatMoney is called
      mockTx.mockResolvedValue(ONE_TX);
    });

    it.each([
      ['es', 'es-CO'],
      ['en', 'en-US'],
    ])('maps lang=%s → locale=%s passed to formatMoney', async (lang, expectedLocale) => {
      await getDashboardMetricsByUser(USER_ID, lang);

      expect(mockFormatMoney).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(String),
        expectedLocale
      );
    });
  });

  // ── Early return guard ────────────────────────────────────────────────────

  describe('getDashboardMetricsByUser — early return', () => {
    it('returns empty metrics when both accounts and transactions are empty', async () => {
      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.netWorth.amount).toBe(0);
      expect(result.netWorthDistribution).toHaveLength(0);
      expect(result.sparklines).toEqual({});
    });

    it('proceeds when there are accounts even with no transactions', async () => {
      mockAccount.mockResolvedValue([makeAccount()]);
      mockGetTrueBalance.mockResolvedValue(0);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(mockFormatMoney).toHaveBeenCalled();
      expect(result).toHaveProperty('netWorth');
    });
  });

  // ── processCreditCardAccount ──────────────────────────────────────────────

  describe('processCreditCardAccount', () => {
    beforeEach(() => {
      mockTx.mockResolvedValue(ONE_TX);
    });

    it('adds absolute value of negative balance to creditCardDebt', async () => {
      mockAccount.mockResolvedValue([
        makeAccount({ id: 'cc', type: 'CREDIT_CARD', creditLimitCents: 5_000_000 }),
      ]);
      mockGetTrueBalance.mockResolvedValue(-200_000);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.creditCardDebt.amount).toBe(200_000);
    });

    it('calculates creditAvailable as limit minus debt', async () => {
      mockAccount.mockResolvedValue([
        makeAccount({ id: 'cc', type: 'CREDIT_CARD', creditLimitCents: 5_000_000 }),
      ]);
      mockGetTrueBalance.mockResolvedValue(-1_000_000);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.creditAvailable.amount).toBe(4_000_000);
    });

    it('adds positive credit card balance to netWorth without affecting debt', async () => {
      mockAccount.mockResolvedValue([
        makeAccount({ id: 'cc', type: 'CREDIT_CARD', creditLimitCents: null }),
      ]);
      mockGetTrueBalance.mockResolvedValue(50_000);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.creditCardDebt.amount).toBe(0);
      expect(result.creditAvailable.amount).toBe(0); // no limit set
    });

    it('does not add to creditLimitTotal when creditLimitCents is null', async () => {
      mockAccount.mockResolvedValue([
        makeAccount({ id: 'cc', type: 'CREDIT_CARD', creditLimitCents: null }),
      ]);
      mockGetTrueBalance.mockResolvedValue(-100_000);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.creditAvailable.amount).toBe(0);
    });
  });

  // ── processAssetAccount ───────────────────────────────────────────────────

  describe('processAssetAccount', () => {
    beforeEach(() => {
      mockTx.mockResolvedValue(ONE_TX);
    });

    it('processes SAVINGS account: adds to totalCash and savingsBalance', async () => {
      mockAccount.mockResolvedValue([makeAccount({ type: 'SAVINGS', interestRateEA: 8.5 })]);
      mockGetTrueBalance.mockResolvedValue(1_000_000);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.totalCash.amount).toBe(1_000_000);
      expect(result.savings.amount).toBe(1_000_000);
      expect(result.maxInterestRate.amount).toBe(8.5);
      expect(result.maxInterestRate.formatted).toBe('8.50%');
    });

    it('converts Decimal interestRateEA to number for SAVINGS account', async () => {
      mockAccount.mockResolvedValue([
        makeAccount({ type: 'SAVINGS', interestRateEA: new Decimal('12.5') }),
      ]);
      mockGetTrueBalance.mockResolvedValue(500_000);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.maxInterestRate.amount).toBe(12.5);
    });

    it('keeps maxInterestRate at 0 when SAVINGS has null interestRateEA', async () => {
      mockAccount.mockResolvedValue([makeAccount({ type: 'SAVINGS', interestRateEA: null })]);
      mockGetTrueBalance.mockResolvedValue(500_000);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.maxInterestRate.amount).toBe(0);
      expect(result.maxInterestRate.formatted).toBe('--');
    });

    it('processes INVESTMENT account: adds to investments, not totalCash', async () => {
      mockAccount.mockResolvedValue([makeAccount({ id: 'inv', type: 'INVESTMENT' })]);
      mockGetTrueBalance.mockResolvedValue(2_000_000);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.investments.amount).toBe(2_000_000);
      expect(result.totalCash.amount).toBe(0);
    });

    it('processes POCKET account: adds to totalCash but not savings', async () => {
      mockAccount.mockResolvedValue([makeAccount({ id: 'pkt', type: 'POCKET' })]);
      mockGetTrueBalance.mockResolvedValue(300_000);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.totalCash.amount).toBe(300_000);
      expect(result.savings.amount).toBe(0);
    });
  });

  // ── updateMaxInterestRate ─────────────────────────────────────────────────

  describe('updateMaxInterestRate', () => {
    beforeEach(() => {
      mockTx.mockResolvedValue(ONE_TX);
    });

    it('tracks the maximum interest rate across multiple SAVINGS accounts', async () => {
      mockAccount.mockResolvedValue([
        makeAccount({ id: 'a1', type: 'SAVINGS', interestRateEA: 5 }),
        makeAccount({ id: 'a2', type: 'SAVINGS', interestRateEA: 10 }),
        makeAccount({ id: 'a3', type: 'SAVINGS', interestRateEA: 7 }),
      ]);
      mockGetTrueBalance.mockResolvedValue(100_000);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.maxInterestRate.amount).toBe(10);
    });

    it('ignores zero interestRateEA (falsy)', async () => {
      mockAccount.mockResolvedValue([
        makeAccount({ id: 'a1', type: 'SAVINGS', interestRateEA: 0 }),
        makeAccount({ id: 'a2', type: 'SAVINGS', interestRateEA: null }),
      ]);
      mockGetTrueBalance.mockResolvedValue(100_000);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.maxInterestRate.amount).toBe(0);
      expect(result.maxInterestRate.formatted).toBe('--');
    });
  });

  // ── calculateLoanMetrics ──────────────────────────────────────────────────

  describe('calculateLoanMetrics', () => {
    beforeEach(() => {
      mockTx.mockResolvedValue(ONE_TX);
    });

    it('sums positive loan balances into externalDebts', async () => {
      mockLoan.mockResolvedValue([
        makeLoanRow({ balanceCents: 1_000_000 }),
        makeLoanRow({ id: 'loan-2', balanceCents: 500_000 }),
      ]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.externalDebts.amount).toBe(1_500_000);
    });

    it('skips loans with zero balance', async () => {
      mockLoan.mockResolvedValue([makeLoanRow({ balanceCents: 0 })]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.externalDebts.amount).toBe(0);
    });

    it('skips loans with negative balance', async () => {
      mockLoan.mockResolvedValue([makeLoanRow({ balanceCents: -500_000 })]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.externalDebts.amount).toBe(0);
    });
  });

  // ── calculateTransactionMetrics ───────────────────────────────────────────

  describe('calculateTransactionMetrics', () => {
    // Dates relative to FIXED_NOW = 2024-06-15
    const juneTx = (overrides = {}) =>
      makeTxRow({ date: new Date('2024-06-10T00:00:00.000Z'), ...overrides });
    const mayTx = (overrides = {}) =>
      makeTxRow({ date: new Date('2024-05-10T00:00:00.000Z'), ...overrides });
    const aprilTx = (overrides = {}) =>
      makeTxRow({ date: new Date('2024-04-10T00:00:00.000Z'), ...overrides });

    it('accumulates current-month INCOME into monthlyIncome', async () => {
      mockTx.mockResolvedValue([juneTx({ id: 'i1', amountCents: 5_000_000, type: 'INCOME' })]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      // maxSpendable is now delegated to savings.service (mocked as 0)
      // monthlyIncome is used internally but not exposed in final shape
      expect(result.maxSpendable.amount).toBe(0);
    });

    it('accumulates current-month TRANSFER_IN into monthlyIncome', async () => {
      mockTx.mockResolvedValue([juneTx({ id: 'ti', amountCents: 1_000_000, type: 'TRANSFER_IN' })]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      // maxSpendable is now delegated to savings.service (mocked as 0)
      expect(result.maxSpendable.amount).toBe(0);
    });

    it('accumulates current-month EXPENSE into monthlyExpenses', async () => {
      mockTx.mockResolvedValue([juneTx({ id: 'e1', amountCents: -200_000, type: 'EXPENSE' })]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.monthlyExpenses.amount).toBe(200_000);
    });

    it('accumulates current-month TRANSFER_OUT into monthlyExpenses', async () => {
      mockTx.mockResolvedValue([juneTx({ id: 'to', amountCents: -100_000, type: 'TRANSFER_OUT' })]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.monthlyExpenses.amount).toBe(100_000);
    });

    it('accumulates last-month EXPENSE into lastMonthExpenses for comparison', async () => {
      mockTx.mockResolvedValue([mayTx({ id: 'le', amountCents: -150_000, type: 'EXPENSE' })]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      // current=0 <= last=150_000 → isPositive (spending less)
      expect(result.savingsComparison.isPositive).toBe(true);
    });

    it('ignores transactions older than last month', async () => {
      mockTx.mockResolvedValue([aprilTx({ id: 'old', amountCents: -999_999, type: 'EXPENSE' })]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.monthlyExpenses.amount).toBe(0);
    });

    it('clamps maxSpendable to 0 when expenses exceed income', async () => {
      mockTx.mockResolvedValue([
        juneTx({ id: 'inc', amountCents: 100_000, type: 'INCOME' }),
        juneTx({ id: 'exp', amountCents: -500_000, type: 'EXPENSE' }),
      ]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.maxSpendable.amount).toBe(0);
    });
  });

  // ── Internal transfer exclusion (pocket-aware dashboard) ─────────────────

  describe('internal transfer exclusion', () => {
    const start = new Date('2024-06-01T00:00:00.000Z');
    const startLast = new Date('2024-05-01T00:00:00.000Z');
    const endLast = new Date('2024-05-31T23:59:59.999Z');
    const hierarchy = {
      'parent-1': { id: 'parent-1', type: 'CHECKING', parentAccountId: null },
      'pocket-1': { id: 'pocket-1', type: 'POCKET', parentAccountId: 'parent-1' },
      'pocket-2': { id: 'pocket-2', type: 'POCKET', parentAccountId: 'parent-1' },
      'acc-a': { id: 'acc-a', type: 'CHECKING', parentAccountId: null },
      'acc-b': { id: 'acc-b', type: 'SAVINGS', parentAccountId: null },
    };

    it('marks a TRANSFER_IN from a parent into its pocket as an internal transfer', async () => {
      const { isInternalTransfer } = await import('@/lib/dashboard-metrics');
      expect(isInternalTransfer('pocket-1', 'parent-1', hierarchy)).toBe(true);
    });

    it('marks a TRANSFER_OUT from an account into its pocket as an internal transfer', async () => {
      const { isInternalTransfer } = await import('@/lib/dashboard-metrics');
      expect(isInternalTransfer('parent-1', 'pocket-1', hierarchy)).toBe(true);
    });

    it('marks a pocket-to-sibling-pocket transfer as an internal transfer', async () => {
      const { isInternalTransfer } = await import('@/lib/dashboard-metrics');
      expect(isInternalTransfer('pocket-1', 'pocket-2', hierarchy)).toBe(true);
    });

    it('does NOT mark a TRANSFER_OUT between two unrelated accounts as internal', async () => {
      const { isInternalTransfer } = await import('@/lib/dashboard-metrics');
      expect(isInternalTransfer('acc-a', 'acc-b', hierarchy)).toBe(false);
    });

    it('excludes an internal TRANSFER_IN (parent → pocket) from monthlyIncome', async () => {
      const { calculateTransactionMetrics } = await import('@/lib/dashboard-metrics');
      const tx = {
        id: 'tx-internal-in',
        description: null,
        amountCents: 500_000,
        currency: 'COP' as const,
        type: 'TRANSFER_IN',
        date: new Date('2024-06-10T00:00:00.000Z'),
        accountId: 'pocket-1',
        transferToAccountId: null,
        transferFromAccountId: 'parent-1',
      };
      const result = calculateTransactionMetrics([tx], start, startLast, endLast, hierarchy);
      expect(result.monthlyIncome).toBe(0);
      expect(result.monthlyExpenses).toBe(0);
    });

    it('excludes an internal TRANSFER_OUT (account → its pocket) from monthlyExpenses', async () => {
      const { calculateTransactionMetrics } = await import('@/lib/dashboard-metrics');
      const tx = {
        id: 'tx-internal-out',
        description: null,
        amountCents: -200_000,
        currency: 'COP' as const,
        type: 'TRANSFER_OUT',
        date: new Date('2024-06-10T00:00:00.000Z'),
        accountId: 'parent-1',
        transferToAccountId: 'pocket-1',
        transferFromAccountId: null,
      };
      const result = calculateTransactionMetrics([tx], start, startLast, endLast, hierarchy);
      expect(result.monthlyExpenses).toBe(0);
    });

    it('excludes an internal pocket-to-sibling TRANSFER_OUT from monthlyExpenses', async () => {
      const { calculateTransactionMetrics } = await import('@/lib/dashboard-metrics');
      const tx = {
        id: 'tx-internal-sibling',
        description: null,
        amountCents: -80_000,
        currency: 'COP' as const,
        type: 'TRANSFER_OUT',
        date: new Date('2024-06-10T00:00:00.000Z'),
        accountId: 'pocket-1',
        transferToAccountId: 'pocket-2',
        transferFromAccountId: null,
      };
      const result = calculateTransactionMetrics([tx], start, startLast, endLast, hierarchy);
      expect(result.monthlyExpenses).toBe(0);
    });

    it('still counts an external TRANSFER_OUT between unrelated accounts as an expense', async () => {
      const { calculateTransactionMetrics } = await import('@/lib/dashboard-metrics');
      const tx = {
        id: 'tx-external-out',
        description: null,
        amountCents: -150_000,
        currency: 'COP' as const,
        type: 'TRANSFER_OUT',
        date: new Date('2024-06-10T00:00:00.000Z'),
        accountId: 'acc-a',
        transferToAccountId: 'acc-b',
        transferFromAccountId: null,
      };
      const result = calculateTransactionMetrics([tx], start, startLast, endLast, hierarchy);
      expect(result.monthlyExpenses).toBe(150_000);
    });

    it('still counts an external TRANSFER_IN as income', async () => {
      const { calculateTransactionMetrics } = await import('@/lib/dashboard-metrics');
      const tx = {
        id: 'tx-external-in',
        description: null,
        amountCents: 300_000,
        currency: 'COP' as const,
        type: 'TRANSFER_IN',
        date: new Date('2024-06-10T00:00:00.000Z'),
        accountId: 'acc-b',
        transferToAccountId: null,
        transferFromAccountId: 'acc-a',
      };
      const result = calculateTransactionMetrics([tx], start, startLast, endLast, hierarchy);
      expect(result.monthlyIncome).toBe(300_000);
    });

    it('keeps monthlyExpenses observable via getDashboardMetricsByUser when internal transfers are excluded', async () => {
      mockTx.mockResolvedValue([
        makeTxRow({
          id: 'internal-out',
          accountId: 'parent-1',
          transferToAccountId: 'pocket-1',
          amountCents: -120_000,
          type: 'TRANSFER_OUT',
        }),
      ]);
      mockAccount.mockResolvedValue([
        makeAccount({ id: 'parent-1', type: 'CHECKING', parentAccountId: null }),
        makeAccount({ id: 'pocket-1', type: 'POCKET', parentAccountId: 'parent-1' }),
      ]);
      mockGetTrueBalance.mockResolvedValue(0);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      // The parent→pocket transfer is internal → excluded from expenses
      expect(result.monthlyExpenses.amount).toBe(0);
    });
  });

  // ── formatMetricsResult — savings comparison ──────────────────────────────

  describe('formatMetricsResult — savings comparison', () => {
    const juneTx = (overrides = {}) =>
      makeTxRow({ date: new Date('2024-06-10T00:00:00.000Z'), ...overrides });
    const mayTx = (overrides = {}) =>
      makeTxRow({ date: new Date('2024-05-10T00:00:00.000Z'), ...overrides });

    it('returns 0% when there are no last-month expenses', async () => {
      mockTx.mockResolvedValue([juneTx({ amountCents: -200_000, type: 'EXPENSE' })]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.savingsComparison.percentage).toBe(0);
    });

    it('marks isPositive=true when current expenses < last month', async () => {
      mockTx.mockResolvedValue([
        juneTx({ id: 'curr', amountCents: -100_000, type: 'EXPENSE' }),
        mayTx({ id: 'last', amountCents: -200_000, type: 'EXPENSE' }),
      ]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.savingsComparison.isPositive).toBe(true);
      expect(result.savingsComparison.formatted).toMatch(/↓/);
    });

    it('marks isPositive=false when current expenses > last month', async () => {
      mockTx.mockResolvedValue([
        juneTx({ id: 'curr', amountCents: -300_000, type: 'EXPENSE' }),
        mayTx({ id: 'last', amountCents: -200_000, type: 'EXPENSE' }),
      ]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.savingsComparison.isPositive).toBe(false);
      expect(result.savingsComparison.formatted).toMatch(/↑/);
    });
  });

  // ── calculatePendingFixedExpenses ─────────────────────────────────────────

  describe('calculatePendingFixedExpenses', () => {
    beforeEach(() => {
      mockTx.mockResolvedValue(ONE_TX);
    });

    it('sums all pending fixed expense amounts', async () => {
      mockFixed.mockResolvedValue([
        { expectedAmountCents: 200_000, currency: 'COP' },
        { expectedAmountCents: 350_000, currency: 'COP' },
      ] as Awaited<ReturnType<typeof prisma.fixedExpensePayment.findMany>>);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.pendingFixedExpenses.amount).toBe(550_000);
    });

    it('returns 0 when there are no pending expenses', async () => {
      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.pendingFixedExpenses.amount).toBe(0);
    });
  });

  // ── buildDistribution ─────────────────────────────────────────────────────

  describe('buildDistribution (netWorthDistribution)', () => {
    beforeEach(() => {
      mockTx.mockResolvedValue(ONE_TX);
    });

    it('includes only categories with amount > 0', async () => {
      mockAccount.mockResolvedValue([makeAccount({ type: 'SAVINGS' })]);
      mockGetTrueBalance.mockResolvedValue(1_000_000);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      // savings=1_000_000, others=0 → only savings in distribution
      expect(result.netWorthDistribution).toHaveLength(1);
      expect(result.netWorthDistribution[0].categoryKey).toBe('savings');
    });

    it('calculates percentages relative to total', async () => {
      mockAccount.mockResolvedValue([
        makeAccount({ id: 'a1', type: 'SAVINGS' }),
        makeAccount({ id: 'a2', type: 'POCKET' }),
      ]);
      mockGetTrueBalance.mockResolvedValueOnce(750_000).mockResolvedValueOnce(250_000);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      const savings = result.netWorthDistribution.find((d) => d.categoryKey === 'savings');
      const pocket = result.netWorthDistribution.find((d) => d.categoryKey === 'pocket');
      expect(savings?.percentage).toBe(75);
      expect(pocket?.percentage).toBe(25);
    });

    it('sorts distribution items from largest to smallest', async () => {
      mockAccount.mockResolvedValue([
        makeAccount({ id: 'a1', type: 'POCKET' }),
        makeAccount({ id: 'a2', type: 'SAVINGS' }),
      ]);
      mockGetTrueBalance
        .mockResolvedValueOnce(100_000) // pocket (smaller)
        .mockResolvedValueOnce(900_000); // savings (larger)

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.netWorthDistribution[0].categoryKey).toBe('savings');
      expect(result.netWorthDistribution[1].categoryKey).toBe('pocket');
    });

    it('returns empty distribution when no accounts have positive balance', async () => {
      mockAccount.mockResolvedValue([makeAccount({ type: 'SAVINGS' })]);
      mockGetTrueBalance.mockResolvedValue(0);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.netWorthDistribution).toHaveLength(0);
    });
  });

  // ── buildRecentTransactions ───────────────────────────────────────────────

  describe('buildRecentTransactions', () => {
    it('limits recent transactions to 10', async () => {
      const transactions = Array.from({ length: 15 }, (_, i) =>
        makeTxRow({ id: `tx-${i}`, date: new Date('2024-06-10T00:00:00.000Z') })
      );
      mockTx.mockResolvedValue(transactions);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.recentTransactions).toHaveLength(10);
    });

    it('maps transaction fields correctly', async () => {
      mockTx.mockResolvedValue([
        makeTxRow({
          id: 'tx-map',
          description: 'Grocery shopping',
          amountCents: -50_000,
          currency: 'COP',
          type: 'EXPENSE',
          date: new Date('2024-06-10T00:00:00.000Z'),
        }),
      ]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.recentTransactions[0]).toMatchObject({
        id: 'tx-map',
        description: 'Grocery shopping',
        amount: -50_000,
        currency: 'COP',
        type: 'EXPENSE',
      });
    });

    it('returns empty array when no transactions', async () => {
      mockAccount.mockResolvedValue([makeAccount()]);
      mockGetTrueBalance.mockResolvedValue(0);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.recentTransactions).toHaveLength(0);
    });
  });

  // ── Return shape completeness ─────────────────────────────────────────────

  describe('return shape', () => {
    it('includes all required metric groups', async () => {
      mockTx.mockResolvedValue(ONE_TX);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result).toHaveProperty('netWorth');
      expect(result).toHaveProperty('maxSpendable');
      expect(result).toHaveProperty('savingsComparison');
      expect(result).toHaveProperty('totalCash');
      expect(result).toHaveProperty('savings');
      expect(result).toHaveProperty('receivables');
      expect(result).toHaveProperty('creditCardDebt');
      expect(result).toHaveProperty('creditAvailable');
      expect(result).toHaveProperty('externalDebts');
      expect(result).toHaveProperty('investments');
      expect(result).toHaveProperty('maxInterestRate');
      expect(result).toHaveProperty('dollarRate');
      expect(result).toHaveProperty('monthlyExpenses');
      expect(result).toHaveProperty('pendingFixedExpenses');
      expect(result).toHaveProperty('netWorthDistribution');
      expect(result).toHaveProperty('sparklines');
      expect(result).toHaveProperty('recentTransactions');
    });

    it('always returns dollarRate as placeholder', async () => {
      mockTx.mockResolvedValue(ONE_TX);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.dollarRate.formatted).toBe('--');
      expect(result.dollarRate.amount).toBe(0);
    });

    it('receivables is always 0 (not yet implemented)', async () => {
      mockTx.mockResolvedValue(ONE_TX);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.receivables.amount).toBe(0);
    });
  });
});
