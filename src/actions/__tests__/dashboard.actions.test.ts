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
    transaction: { findMany: vi.fn() },
    fixedExpensePayment: { findMany: vi.fn() },
  },
}));

vi.mock('@/services/reconciliation.service', () => ({
  getTrueBalance: vi.fn(),
}));

vi.mock('@/lib/repositories', () => ({
  getTransactionRepository: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn().mockImplementation((cents: number, currency: string) => `${currency}:${cents}`),
  addCents: vi.fn().mockImplementation((a: number, b: number) => a + b),
  subtractCents: vi.fn().mockImplementation((a: number, b: number) => a - b),
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
const mockFixed = vi.mocked(prisma.fixedExpensePayment.findMany);
const mockGetTrueBalance = vi.mocked(getTrueBalance);
const mockFormatMoney = vi.mocked(formatMoney);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2024-06-15T12:00:00.000Z');

const USER_ID = 'user-test-123';

type AccountRow = {
  id: string;
  name: string;
  balanceCents: number;
  currency: 'COP' | 'USD' | 'EUR' | 'GBP' | 'MXN';
  type: string;
  creditLimitCents: number | null;
  interestRateEA: number | Decimal | null;
};

function makeAccount(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acc-1',
    name: 'Test Account',
    balanceCents: 100_000,
    currency: 'COP',
    type: 'SAVINGS',
    creditLimitCents: null,
    interestRateEA: null,
    ...overrides,
  };
}

function makeLoanRow(overrides: Partial<{ id: string; name: string; balanceCents: number }> = {}) {
  return { id: 'loan-1', name: 'Test Loan', balanceCents: 500_000, ...overrides };
}

function makeTxRow(overrides: Partial<{
  id: string;
  description: string | null;
  amountCents: number;
  currency: 'COP' | 'USD';
  type: string;
  date: Date;
}> = {}) {
  return {
    id: 'tx-1',
    description: 'Test',
    amountCents: 10_000,
    currency: 'COP' as const,
    type: 'INCOME',
    date: new Date('2024-06-10T00:00:00.000Z'),
    ...overrides,
  };
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
      mockGetSession.mockResolvedValue({} as ReturnType<typeof getSession> extends Promise<infer T> ? T : never);

      const result = await getDashboardMetrics('en');

      expect(result.netWorth.amount).toBe(0);
      expect(mockAccount).not.toHaveBeenCalled();
    });

    it('queries the database with the correct userId when session exists', async () => {
      mockGetSession.mockResolvedValue({ userId: USER_ID });

      await getDashboardMetrics('en');

      expect(mockAccount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID, isActive: true } }),
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
      ['de', 'de-DE'],
      ['en', 'en-US'],
      ['fr', 'en-US'], // default branch
    ])('maps lang=%s → locale=%s passed to formatMoney', async (lang, expectedLocale) => {
      await getDashboardMetricsByUser(USER_ID, lang);

      expect(mockFormatMoney).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(String),
        expectedLocale,
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
      mockAccount.mockResolvedValue([makeAccount({ id: 'cc', type: 'CREDIT_CARD', creditLimitCents: 5_000_000 })]);
      mockGetTrueBalance.mockResolvedValue(-200_000);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.creditCardDebt.amount).toBe(200_000);
    });

    it('calculates creditAvailable as limit minus debt', async () => {
      mockAccount.mockResolvedValue([makeAccount({ id: 'cc', type: 'CREDIT_CARD', creditLimitCents: 5_000_000 })]);
      mockGetTrueBalance.mockResolvedValue(-1_000_000);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.creditAvailable.amount).toBe(4_000_000);
    });

    it('adds positive credit card balance to netWorth without affecting debt', async () => {
      mockAccount.mockResolvedValue([makeAccount({ id: 'cc', type: 'CREDIT_CARD', creditLimitCents: null })]);
      mockGetTrueBalance.mockResolvedValue(50_000);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.creditCardDebt.amount).toBe(0);
      expect(result.creditAvailable.amount).toBe(0); // no limit set
    });

    it('does not add to creditLimitTotal when creditLimitCents is null', async () => {
      mockAccount.mockResolvedValue([makeAccount({ id: 'cc', type: 'CREDIT_CARD', creditLimitCents: null })]);
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
      mockAccount.mockResolvedValue([makeAccount({ type: 'SAVINGS', interestRateEA: new Decimal('12.5') })]);
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
    const juneTx = (overrides = {}) => makeTxRow({ date: new Date('2024-06-10T00:00:00.000Z'), ...overrides });
    const mayTx = (overrides = {}) => makeTxRow({ date: new Date('2024-05-10T00:00:00.000Z'), ...overrides });
    const aprilTx = (overrides = {}) => makeTxRow({ date: new Date('2024-04-10T00:00:00.000Z'), ...overrides });

    it('accumulates current-month INCOME into monthlyIncome', async () => {
      mockTx.mockResolvedValue([juneTx({ id: 'i1', amountCents: 5_000_000, type: 'INCOME' })]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      const savingsTarget = Math.floor(5_000_000 * 0.2);
      expect(result.maxSpendable.amount).toBe(5_000_000 - 0 - savingsTarget);
    });

    it('accumulates current-month TRANSFER_IN into monthlyIncome', async () => {
      mockTx.mockResolvedValue([juneTx({ id: 'ti', amountCents: 1_000_000, type: 'TRANSFER_IN' })]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      const savingsTarget = Math.floor(1_000_000 * 0.2);
      expect(result.maxSpendable.amount).toBe(1_000_000 - 0 - savingsTarget);
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

  // ── formatMetricsResult — savings comparison ──────────────────────────────

  describe('formatMetricsResult — savings comparison', () => {
    const juneTx = (overrides = {}) => makeTxRow({ date: new Date('2024-06-10T00:00:00.000Z'), ...overrides });
    const mayTx = (overrides = {}) => makeTxRow({ date: new Date('2024-05-10T00:00:00.000Z'), ...overrides });

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
      mockGetTrueBalance
        .mockResolvedValueOnce(750_000)
        .mockResolvedValueOnce(250_000);

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
        makeTxRow({ id: `tx-${i}`, date: new Date('2024-06-10T00:00:00.000Z') }),
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
