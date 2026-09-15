/**
 * Tests for the server-only dashboard read path
 * (`src/app/[lang]/(dashboard)/dashboard/data.ts`).
 *
 * `data.ts` composes every KPI from the shared services and the transaction
 * ledger. Here we mock the session, Prisma and every service so we can assert
 * the COMPOSITION contract (currency buckets, FX conversion, distribution,
 * liabilities, alerts…), never the internals of the re-used services.
 *
 * Coverage note: `src/app/**` is excluded from coverage in `vitest.config.ts`,
 * so this file exists to protect the read-path behaviour, not to move the
 * coverage number.
 */
import { describe, it, expect, vi, beforeEach, afterAll, beforeAll, type Mock } from 'vitest';

// ── Mocks (must precede every import that loads these modules) ────────────────

vi.mock('server-only', () => ({}));

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    account: { findMany: vi.fn() },
    transaction: { findMany: vi.fn(), groupBy: vi.fn() },
    fixedExpensePayment: { groupBy: vi.fn() },
  },
}));

vi.mock('@/services/savings.service', () => ({
  getSavingsSummary: vi.fn(),
  getMaxSpendable: vi.fn(),
  getSavingsGoalsWithProgress: vi.fn(),
}));

vi.mock('@/services/fixed-expense.service', () => ({
  ensureUpcomingPayments: vi.fn(),
  getFixedExpensesSummary: vi.fn(),
  getFixedExpensesWithPayments: vi.fn(),
}));

vi.mock('@/services/loan.service', () => ({
  getLoansSummary: vi.fn(),
  getLoansForPayment: vi.fn(),
}));

vi.mock('@/services/investment-performance.service', () => ({
  getInvestmentPerformance: vi.fn(),
}));

vi.mock('@/services/variable-expense.service', () => ({
  getVariableExpensesOverview: vi.fn(),
}));

vi.mock('@/services/exchange-rate.service', () => ({
  getExchangeRate: vi.fn(),
}));

// Keep the real Decimal-based money helpers (addCents/subtractCents/…) so the
// composition arithmetic is exercised for real; only spy on `formatMoney`.
vi.mock('@/lib/money', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/money')>();
  return { ...actual, formatMoney: vi.fn(actual.formatMoney) };
});

// ── Imports ───────────────────────────────────────────────────────────────────

import {
  getDashboardMetrics,
  getDashboardMetricsByUser,
} from '@/app/[lang]/(dashboard)/dashboard/data';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import {
  getSavingsSummary,
  getMaxSpendable,
  getSavingsGoalsWithProgress,
} from '@/services/savings.service';
import {
  ensureUpcomingPayments,
  getFixedExpensesSummary,
  getFixedExpensesWithPayments,
} from '@/services/fixed-expense.service';
import { getLoansSummary, getLoansForPayment } from '@/services/loan.service';
import { getInvestmentPerformance } from '@/services/investment-performance.service';
import { getVariableExpensesOverview } from '@/services/variable-expense.service';
import { getExchangeRate } from '@/services/exchange-rate.service';
import { formatMoney } from '@/lib/money';
import type { Currency } from '@prisma/client';

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockGetSession = vi.mocked(getSession);
const mockFormatMoney = vi.mocked(formatMoney);

const mockUserFindUnique = prisma.user.findUnique as unknown as Mock;
const mockAccountFindMany = prisma.account.findMany as unknown as Mock;
const mockTransactionFindMany = prisma.transaction.findMany as unknown as Mock;
const mockTransactionGroupBy = prisma.transaction.groupBy as unknown as Mock;
const mockFixedPaymentGroupBy = prisma.fixedExpensePayment.groupBy as unknown as Mock;

const mockGetSavingsSummary = vi.mocked(getSavingsSummary);
const mockGetMaxSpendable = vi.mocked(getMaxSpendable);
const mockGetSavingsGoalsWithProgress = vi.mocked(getSavingsGoalsWithProgress);
const mockEnsureUpcomingPayments = vi.mocked(ensureUpcomingPayments);
const mockGetFixedExpensesSummary = vi.mocked(getFixedExpensesSummary);
const mockGetFixedExpensesWithPayments = vi.mocked(getFixedExpensesWithPayments);
const mockGetLoansSummary = vi.mocked(getLoansSummary);
const mockGetLoansForPayment = vi.mocked(getLoansForPayment);
const mockGetInvestmentPerformance = vi.mocked(getInvestmentPerformance);
const mockGetVariableExpensesOverview = vi.mocked(getVariableExpensesOverview);
const mockGetExchangeRate = vi.mocked(getExchangeRate);

// ── Fixtures helpers ──────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2024-06-15T12:00:00.000Z');
const USER_ID = 'user-dashboard-1';

type SavingsSummaryData = Awaited<ReturnType<typeof getSavingsSummary>>;
type MaxSpendableData = Awaited<ReturnType<typeof getMaxSpendable>>;
type SavingsGoalsData = Awaited<ReturnType<typeof getSavingsGoalsWithProgress>>;
type FixedSummaryData = Awaited<ReturnType<typeof getFixedExpensesSummary>>;
type FixedWithPaymentsData = Awaited<ReturnType<typeof getFixedExpensesWithPayments>>;
type LoansSummaryData = Awaited<ReturnType<typeof getLoansSummary>>;
type LoansForPaymentData = Awaited<ReturnType<typeof getLoansForPayment>>;
type VariableOverviewData = Awaited<ReturnType<typeof getVariableExpensesOverview>>;
type PerformanceData = Awaited<ReturnType<typeof getInvestmentPerformance>>;

interface RawAccount {
  id: string;
  name: string;
  currency: Currency;
  type: string;
  creditLimitCents: number | null;
  interestRateEA: number | null;
  parentAccountId: string | null;
  paymentDueDay: number | null;
}

function makeAccount(
  overrides: { id: string; type: string } & Partial<Omit<RawAccount, 'id' | 'type'>>
): RawAccount {
  return {
    id: overrides.id,
    name: overrides.name ?? `Account ${overrides.id}`,
    currency: overrides.currency ?? 'COP',
    type: overrides.type,
    creditLimitCents: overrides.creditLimitCents ?? null,
    interestRateEA: overrides.interestRateEA ?? null,
    parentAccountId: overrides.parentAccountId ?? null,
    paymentDueDay: overrides.paymentDueDay ?? null,
  };
}

interface RawTx {
  id: string;
  description: string | null;
  amountCents: number;
  currency: Currency;
  type: string;
  date: Date;
  accountId: string;
  transferToAccountId: string | null;
  transferFromAccountId: string | null;
  exchangeRate: number | null;
}

function makeTx(overrides: Partial<RawTx> & { id: string }): RawTx {
  return {
    id: overrides.id,
    description: overrides.description ?? 'Transaction',
    amountCents: overrides.amountCents ?? 0,
    currency: overrides.currency ?? 'COP',
    type: overrides.type ?? 'EXPENSE',
    date: overrides.date ?? new Date('2024-06-10T00:00:00.000Z'),
    accountId: overrides.accountId ?? 'acc-1',
    transferToAccountId: overrides.transferToAccountId ?? null,
    transferFromAccountId: overrides.transferFromAccountId ?? null,
    exchangeRate: overrides.exchangeRate ?? null,
  };
}

const DEFAULT_RATES: Record<string, number> = {
  'COP->USD': 0.00025,
  'COP->EUR': 0.0002,
  'USD->COP': 4000,
  'EUR->COP': 5000,
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('dashboard/data.ts', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetSession.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({ baseCurrency: 'COP' });
    mockAccountFindMany.mockResolvedValue([]);
    mockTransactionFindMany.mockResolvedValue([]);
    mockTransactionGroupBy.mockResolvedValue([]);
    mockFixedPaymentGroupBy.mockResolvedValue([]);

    mockGetSavingsSummary.mockResolvedValue({ byCurrency: [] } as SavingsSummaryData);
    mockGetMaxSpendable.mockResolvedValue({ byCurrency: [] } as MaxSpendableData);
    mockGetSavingsGoalsWithProgress.mockResolvedValue([] as SavingsGoalsData);
    mockEnsureUpcomingPayments.mockResolvedValue(undefined);
    mockGetFixedExpensesSummary.mockResolvedValue({ byCurrency: [] } as FixedSummaryData);
    mockGetFixedExpensesWithPayments.mockResolvedValue([] as FixedWithPaymentsData);
    mockGetLoansSummary.mockResolvedValue({ byCurrency: [] } as LoansSummaryData);
    mockGetLoansForPayment.mockResolvedValue([] as LoansForPaymentData);
    mockGetVariableExpensesOverview.mockResolvedValue({
      month: 6,
      year: 2024,
      byCurrency: [],
    } as VariableOverviewData);

    // Investments default: market value == ledger cash (no holdings) so a ledger
    // balance is never silently replaced by the mock.
    mockGetInvestmentPerformance.mockImplementation(async (_client, accountId, options) => {
      const cash = options?.cashBalanceCents ?? 0;
      return {
        accountId,
        name: `Investment ${accountId}`,
        currency: 'COP',
        totalInvestedCents: cash,
        cashBalanceCents: cash,
        holdingsMarketValueCents: 0,
        totalValueCents: cash,
        totalReturnCents: 0,
        totalReturnPct: 0,
        series: [],
      } as PerformanceData;
    });

    mockGetExchangeRate.mockImplementation(async (from, to) => {
      if (from === to) return 1;
      return DEFAULT_RATES[`${from}->${to}`] ?? null;
    });
  });

  // ── getDashboardMetrics (session resolution) ──────────────────────────────

  describe('getDashboardMetrics', () => {
    it('returns the empty state when there is no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const result = await getDashboardMetrics('en');

      expect(result.netWorth.amount).toBe(0);
      expect(result.totalCash.amount).toBe(0);
      expect(result.netWorthDistribution).toEqual([]);
      expect(result.netWorthLiabilities).toEqual([]);
      expect(result.sparklines).toEqual({});
      expect(mockAccountFindMany).not.toHaveBeenCalled();
    });

    it('returns the empty state when the session has no userId', async () => {
      mockGetSession.mockResolvedValue({} as never);

      const result = await getDashboardMetrics('en');

      expect(result.netWorth.amount).toBe(0);
      expect(mockAccountFindMany).not.toHaveBeenCalled();
    });

    it('reads the accounts of the session user', async () => {
      mockGetSession.mockResolvedValue({
        userId: USER_ID,
        email: 'user@example.com',
        name: 'User',
      });

      await getDashboardMetrics('en');

      expect(mockAccountFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID, isActive: true } })
      );
      expect(mockEnsureUpcomingPayments).toHaveBeenCalledWith(USER_ID);
    });
  });

  // ── Contract / empty user ─────────────────────────────────────────────────

  describe('getDashboardMetricsByUser — contract', () => {
    it('always exposes the full DashboardMetrics shape', async () => {
      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result).toHaveProperty('netWorth');
      expect(result).toHaveProperty('maxSpendable');
      expect(result).toHaveProperty('expensesComparison');
      expect(result).toHaveProperty('monthlyIncome');
      expect(result).toHaveProperty('totalCash');
      expect(result).toHaveProperty('savings');
      expect(result).toHaveProperty('receivables');
      expect(result).toHaveProperty('creditCardDebt');
      expect(result).toHaveProperty('creditAvailable');
      expect(result).toHaveProperty('externalDebts');
      expect(result).toHaveProperty('investments');
      expect(result).toHaveProperty('netWorthDistribution');
      expect(result).toHaveProperty('netWorthLiabilities');
      expect(result).toHaveProperty('netWorthAssetsTotal');
      expect(result).toHaveProperty('netWorthLiabilitiesTotal');
      expect(result).toHaveProperty('exchangeRatesUsed');
      expect(result).toHaveProperty('netWorthUnconvertedByCurrency');
      expect(result).toHaveProperty('byCurrency');
      expect(result).toHaveProperty('investmentsBreakdown');
      expect(result).toHaveProperty('loans');
      expect(result).toHaveProperty('creditCards');
      expect(result).toHaveProperty('fixedExpenses');
      expect(result).toHaveProperty('variableExpenses');
      expect(result).toHaveProperty('savingsGoals');
      expect(result).toHaveProperty('alerts');
    });

    it('returns zeroed scalars and 6-month zeroed sparklines for an empty user', async () => {
      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.netWorth).toEqual({
        amount: 0,
        formatted: expect.any(String),
        currency: 'COP',
      });
      expect(result.netWorthDistribution).toEqual([]);
      expect(result.netWorthLiabilities).toEqual([]);
      expect(result.netWorthUnconverted).toBe(false);
      expect(result.byCurrency.totalCash).toEqual([]);
      expect(result.sparklines.monthlyExpenses).toHaveLength(6);
      expect(result.sparklines.monthlyIncome).toHaveLength(6);
      expect(result.sparklines.monthlyExpenses?.every((value) => value === 0)).toBe(true);
      expect(result.recentTransactions).toEqual([]);
    });

    it.each([
      ['es', 'es-CO'],
      ['en', 'en-US'],
    ])('maps lang=%s to locale=%s', async (lang, locale) => {
      await getDashboardMetricsByUser(USER_ID, lang);

      expect(mockFormatMoney).toHaveBeenCalledWith(expect.any(Number), expect.any(String), locale);
    });
  });

  // ── Asset distribution ────────────────────────────────────────────────────

  describe('netWorthDistribution (asset categories)', () => {
    beforeEach(() => {
      mockAccountFindMany.mockResolvedValue([
        makeAccount({ id: 'a-checking', type: 'CHECKING', name: 'Checking' }),
        makeAccount({ id: 'a-cash', type: 'CASH' }),
        makeAccount({ id: 'a-savings', type: 'SAVINGS' }),
        makeAccount({ id: 'a-pocket', type: 'POCKET' }),
        makeAccount({ id: 'a-inv', type: 'INVESTMENT' }),
      ]);
      mockTransactionGroupBy.mockResolvedValue([
        { accountId: 'a-checking', _sum: { amountCents: 100_000 } },
        { accountId: 'a-cash', _sum: { amountCents: 200_000 } },
        { accountId: 'a-savings', _sum: { amountCents: 300_000 } },
        { accountId: 'a-pocket', _sum: { amountCents: 400_000 } },
        { accountId: 'a-inv', _sum: { amountCents: 500_000 } },
      ]);
    });

    it('maps every asset AccountType to its distribution bucket', async () => {
      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.netWorthDistribution.map((item) => item.categoryKey)).toEqual([
        'investments',
        'pocket',
        'savings',
        'cash',
        'checking',
      ]);
    });

    it('renders percentages that add up to exactly 100', async () => {
      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      const total = result.netWorthDistribution.reduce((sum, item) => sum + item.percentage, 0);
      expect(total).toBeCloseTo(100, 5);
    });

    it('feeds the scalar KPIs from the per-category balances', async () => {
      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.totalCash.amount).toBe(1_000_000); // checking + cash + savings + pocket
      expect(result.savings.amount).toBe(300_000);
      expect(result.investments.amount).toBe(500_000);
    });

    it('includes receivables (money lent out) as an asset slice', async () => {
      mockGetLoansSummary.mockResolvedValue({
        byCurrency: [
          {
            currency: 'COP',
            totalPrincipalCents: 0,
            totalInterestCents: 0,
            totalReceivableCents: 50_000,
            totalPayableCents: 0,
            monthlyDueCents: 0,
            activeCount: 1,
          },
        ],
      } as unknown as LoansSummaryData);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.netWorthDistribution.map((item) => item.categoryKey)).toContain('receivables');
      expect(result.receivables.amount).toBe(50_000);
    });

    it('absorbs the rounding residual so three equal slices sum to 100', async () => {
      mockAccountFindMany.mockResolvedValue([
        makeAccount({ id: 'a-checking', type: 'CHECKING' }),
        makeAccount({ id: 'a-cash', type: 'CASH' }),
        makeAccount({ id: 'a-savings', type: 'SAVINGS' }),
      ]);
      mockTransactionGroupBy.mockResolvedValue([
        { accountId: 'a-checking', _sum: { amountCents: 100_000 } },
        { accountId: 'a-cash', _sum: { amountCents: 100_000 } },
        { accountId: 'a-savings', _sum: { amountCents: 100_000 } },
      ]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      const percentages = result.netWorthDistribution.map((item) => item.percentage);
      expect(percentages.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 5);
      expect(Math.max(...percentages)).toBe(33.4);
    });

    it('never emits NaN when the asset total is zero', async () => {
      mockAccountFindMany.mockResolvedValue([makeAccount({ id: 'a-savings', type: 'SAVINGS' })]);
      mockTransactionGroupBy.mockResolvedValue([
        { accountId: 'a-savings', _sum: { amountCents: 0 } },
      ]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.netWorthDistribution).toEqual([]);
      expect(Number.isNaN(result.netWorthAssetsTotal.amount)).toBe(false);
      expect(Number.isNaN(result.netWorth.amount)).toBe(false);
    });
  });

  // ── Liabilities ───────────────────────────────────────────────────────────

  describe('netWorthLiabilities', () => {
    it('separates credit-card debt and payable loans from the asset pie', async () => {
      mockAccountFindMany.mockResolvedValue([
        makeAccount({ id: 'a-checking', type: 'CHECKING' }),
        makeAccount({
          id: 'a-cc',
          type: 'CREDIT_CARD',
          creditLimitCents: 200_000,
          paymentDueDay: 1,
        }),
      ]);
      mockTransactionGroupBy.mockResolvedValue([
        { accountId: 'a-checking', _sum: { amountCents: 100_000 } },
        { accountId: 'a-cc', _sum: { amountCents: -40_000 } },
      ]);
      mockGetLoansSummary.mockResolvedValue({
        byCurrency: [
          {
            currency: 'COP',
            totalPrincipalCents: 60_000,
            totalInterestCents: 0,
            totalReceivableCents: 0,
            totalPayableCents: 60_000,
            monthlyDueCents: 0,
            activeCount: 1,
          },
        ],
      } as unknown as LoansSummaryData);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.netWorthAssetsTotal.amount).toBe(100_000);
      expect(result.netWorthLiabilitiesTotal.amount).toBe(100_000);
      expect(result.netWorth.amount).toBe(0);
      expect(result.netWorthLiabilities.map((item) => item.categoryKey)).toEqual([
        'loansPayable',
        'creditCards',
      ]);
      expect(result.creditCardDebt.amount).toBe(40_000);
      expect(result.creditAvailable.amount).toBe(160_000);
      expect(result.externalDebts.amount).toBe(60_000);
    });

    it('treats a positive credit-card balance as an asset (not a pie slice)', async () => {
      mockAccountFindMany.mockResolvedValue([makeAccount({ id: 'a-cc', type: 'CREDIT_CARD' })]);
      mockTransactionGroupBy.mockResolvedValue([
        { accountId: 'a-cc', _sum: { amountCents: 25_000 } },
      ]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.netWorthAssetsTotal.amount).toBe(25_000);
      expect(result.netWorthLiabilitiesTotal.amount).toBe(0);
      expect(result.netWorth.amount).toBe(25_000);
      expect(result.netWorthDistribution).toEqual([]);
      expect(result.byCurrency.netWorth[0]).toMatchObject({ currency: 'COP', amount: 25_000 });
    });
  });

  // ── FX conversion of the base-currency composition ────────────────────────

  describe('base-currency FX composition', () => {
    function usdCheckingAccount() {
      mockAccountFindMany.mockResolvedValue([
        makeAccount({ id: 'a-usd', type: 'CHECKING', currency: 'USD' }),
      ]);
      mockTransactionGroupBy.mockResolvedValue([
        { accountId: 'a-usd', _sum: { amountCents: 10_000 } },
      ]);
    }

    it('converts a foreign asset with a LIVE rate and records the rate used', async () => {
      usdCheckingAccount();

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.netWorthAssetsTotal).toMatchObject({
        currency: 'COP',
        amount: 40_000_000,
      });
      expect(result.netWorth.amount).toBe(40_000_000);
      expect(result.netWorthDistribution[0]).toMatchObject({
        categoryKey: 'checking',
        amount: 40_000_000,
      });
      expect(result.exchangeRatesUsed.USD).toEqual({ rate: 4_000, source: 'live' });
      expect(result.netWorthUnconverted).toBe(false);
    });

    it('keeps the per-currency bucket un-converted (never mixes currencies)', async () => {
      usdCheckingAccount();

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.byCurrency.totalCash).toHaveLength(1);
      expect(result.byCurrency.totalCash[0]).toMatchObject({ currency: 'USD', amount: 10_000 });
    });

    it('falls back to a stored plausible rate when the live rate is unavailable', async () => {
      usdCheckingAccount();
      mockGetExchangeRate.mockResolvedValue(null);
      mockTransactionFindMany.mockResolvedValue([
        makeTx({
          id: 'fallback',
          currency: 'USD',
          type: 'ADJUSTMENT',
          amountCents: 4_000,
          exchangeRate: 4_000,
        }),
      ]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.exchangeRatesUsed.USD).toEqual({ rate: 4_000, source: 'fallback' });
      expect(result.netWorthAssetsTotal.amount).toBe(40_000_000);
      expect(result.netWorthUnconverted).toBe(false);
    });

    it('flags and excludes an unconvertible balance (never invents a rate)', async () => {
      usdCheckingAccount();
      mockGetExchangeRate.mockResolvedValue(null);
      mockTransactionFindMany.mockResolvedValue([]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.netWorthUnconverted).toBe(true);
      expect(result.netWorthUnconvertedByCurrency.USD).toEqual({
        count: 1,
        amountCents: 10_000,
      });
      expect(result.exchangeRatesUsed.USD).toEqual({ rate: 0, source: 'unavailable' });
      expect(result.netWorthAssetsTotal.amount).toBe(0);
      expect(result.netWorth.amount).toBe(0);
    });

    it('rejects an inverted/out-of-band stored fallback rate', async () => {
      usdCheckingAccount();
      mockGetExchangeRate.mockResolvedValue(null);
      mockTransactionFindMany.mockResolvedValue([
        makeTx({
          id: 'inverted',
          currency: 'USD',
          type: 'ADJUSTMENT',
          amountCents: 1,
          exchangeRate: 0.00025,
        }),
      ]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.netWorthUnconverted).toBe(true);
      expect(result.exchangeRatesUsed.USD).toEqual({ rate: 0, source: 'unavailable' });
    });
  });

  // ── byCurrency (no currency mixing) ───────────────────────────────────────

  describe('byCurrency', () => {
    it('keeps COP and USD totals in distinct buckets', async () => {
      mockAccountFindMany.mockResolvedValue([
        makeAccount({ id: 'a-cop', type: 'CHECKING', currency: 'COP' }),
        makeAccount({ id: 'a-usd', type: 'CHECKING', currency: 'USD' }),
      ]);
      mockTransactionGroupBy.mockResolvedValue([
        { accountId: 'a-cop', _sum: { amountCents: 100_000 } },
        { accountId: 'a-usd', _sum: { amountCents: 20_000 } },
      ]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.byCurrency.totalCash).toHaveLength(2);
      expect(result.byCurrency.totalCash.map((bucket) => bucket.currency)).toEqual(['COP', 'USD']);
      expect(result.byCurrency.totalCash.find((b) => b.currency === 'USD')?.amount).toBe(20_000);
      // Hero netWorth converts to COP: 100_000 + 20_000 * 4_000
      expect(result.netWorth.amount).toBe(80_100_000);
    });
  });

  // ── Module sections ───────────────────────────────────────────────────────

  describe('module sections', () => {
    it('reports savings summary, goals and max spendable', async () => {
      mockGetSavingsSummary.mockResolvedValue({
        byCurrency: [
          {
            currency: 'COP',
            totalSavedCents: 50_000,
            totalTargetCents: 100_000,
            overallProgressPercentage: 50,
            activeGoalsCount: 2,
            completedGoalsCount: 0,
            monthlyContributedCents: 10_000,
          },
        ],
      } as SavingsSummaryData);
      mockGetMaxSpendable.mockResolvedValue({
        byCurrency: [
          {
            currency: 'COP',
            totalIncomeCents: 200_000,
            totalFixedExpensesCents: 50_000,
            totalSavingsCommitmentsCents: 20_000,
            totalVariableExpensesCents: 7_000,
            maxSpendableCents: 123_000,
          },
        ],
      } as MaxSpendableData);
      mockGetSavingsGoalsWithProgress.mockResolvedValue([
        {
          id: 'goal-1',
          name: 'Vacaciones',
          currency: 'COP',
          currentAmountCents: 10_000,
          targetAmountCents: 100_000,
          progressPercentage: 10,
          deadline: new Date('2024-01-01T00:00:00.000Z'),
          projectedCompletion: null,
        },
      ] as unknown as SavingsGoalsData);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.totalSavedCents.amount).toBe(50_000);
      expect(result.activeSavingsGoals).toBe(2);
      expect(result.savingsProgress).toBe(50);
      expect(result.maxSpendable.amount).toBe(123_000);
      expect(result.savingsGoals[0]).toMatchObject({ id: 'goal-1', atRisk: true });
    });

    it('aggregates credit cards and derives the available credit from the limit', async () => {
      mockAccountFindMany.mockResolvedValue([
        makeAccount({
          id: 'cc-1',
          type: 'CREDIT_CARD',
          creditLimitCents: 100_000,
          paymentDueDay: 1,
        }),
        makeAccount({
          id: 'cc-2',
          type: 'CREDIT_CARD',
          creditLimitCents: 50_000,
          paymentDueDay: 1,
        }),
      ]);
      mockTransactionGroupBy.mockResolvedValue([
        { accountId: 'cc-1', _sum: { amountCents: -10_000 } },
        { accountId: 'cc-2', _sum: { amountCents: -20_000 } },
      ]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.creditCards.byCurrency).toHaveLength(1);
      expect(result.creditCards.byCurrency[0]).toMatchObject({
        currency: 'COP',
        debtCents: 30_000,
        availableCreditCents: 120_000,
        cardsCount: 2,
      });
      expect(result.creditCardDebt.amount).toBe(30_000);
      expect(result.creditAvailable.amount).toBe(120_000);
    });

    it('sorts and limits upcoming fixed expenses to 10', async () => {
      const payments = Array.from({ length: 12 }, (_, index) => ({
        id: `pay-${index}`,
        paidDate: null,
        dueDate: new Date(2024, 5, 16 + index),
        expectedAmountCents: 1_000 + index,
        currency: 'COP',
      }));
      mockGetFixedExpensesWithPayments.mockResolvedValue([
        { id: 'fe-1', name: 'Internet', payments },
      ] as unknown as FixedWithPaymentsData);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.fixedExpenses.upcoming).toHaveLength(10);
      const dates = result.fixedExpenses.upcoming.map((item) => item.dueDate.getTime());
      expect([...dates].sort((a, b) => a - b)).toEqual(dates);
    });

    it('builds variable-expense buckets and keeps the top 5 definitions', async () => {
      const stats = Array.from({ length: 6 }, (_, index) => ({
        variableExpenseId: `ve-${index}`,
        name: `Expense ${index}`,
        currency: 'COP' as Currency,
        totalCents: 1_000 * (index + 1),
        expectedTotalCents: index < 3 ? 500 : null,
        deltaAmountPct: index,
        count: 1,
      }));
      mockGetVariableExpensesOverview.mockResolvedValue({
        month: 6,
        year: 2024,
        byCurrency: [
          {
            currency: 'COP',
            totalCents: 21_000,
            transactionCount: 6,
            definitionsCount: 6,
            stats,
          },
        ],
      } as unknown as VariableOverviewData);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.variableExpenses.byCurrency[0].topExpenses).toHaveLength(5);
      expect(result.variableExpenses.byCurrency[0].expectedTotalCents).toBe(1_500);
    });
  });

  // ── Alerts ────────────────────────────────────────────────────────────────

  describe('alerts', () => {
    it('emits FIXED_EXPENSES_OVERDUE from the shared groupBy count and amount', async () => {
      mockFixedPaymentGroupBy.mockResolvedValue([
        { currency: 'COP', _count: { _all: 2 }, _sum: { expectedAmountCents: BigInt(50_000) } },
      ]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      const alert = result.alerts.find((item) => item.kind === 'FIXED_EXPENSES_OVERDUE');
      expect(alert).toMatchObject({ severity: 'warning', count: 2 });
      expect(alert?.amount).toEqual({ currency: 'COP', amount: 50_000 });
    });

    it('emits CREDIT_CARD_OVERDUE when the due day has passed with debt', async () => {
      mockAccountFindMany.mockResolvedValue([
        makeAccount({ id: 'cc-1', type: 'CREDIT_CARD', paymentDueDay: 1 }),
      ]);
      mockTransactionGroupBy.mockResolvedValue([
        { accountId: 'cc-1', _sum: { amountCents: -40_000 } },
      ]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.alerts.some((item) => item.kind === 'CREDIT_CARD_OVERDUE')).toBe(true);
    });

    it('emits CREDIT_CARD_DUE_SOON when the due day is within 7 days with debt', async () => {
      mockAccountFindMany.mockResolvedValue([
        makeAccount({ id: 'cc-1', type: 'CREDIT_CARD', paymentDueDay: 20 }),
      ]);
      mockTransactionGroupBy.mockResolvedValue([
        { accountId: 'cc-1', _sum: { amountCents: -40_000 } },
      ]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.alerts.some((item) => item.kind === 'CREDIT_CARD_DUE_SOON')).toBe(true);
      expect(result.alerts.some((item) => item.kind === 'CREDIT_CARD_OVERDUE')).toBe(false);
    });

    it('emits LOANS_OVERDUE when a loan has an overdue installment', async () => {
      mockGetLoansSummary.mockResolvedValue({
        byCurrency: [
          {
            currency: 'COP',
            totalPrincipalCents: 100_000,
            totalInterestCents: 0,
            totalReceivableCents: 0,
            totalPayableCents: 100_000,
            monthlyDueCents: 20_000,
            activeCount: 1,
          },
        ],
      } as unknown as LoansSummaryData);
      mockGetLoansForPayment.mockResolvedValue([
        {
          currency: 'COP',
          overdueInstallment: { dueDate: new Date(2024, 4, 1) },
          nextInstallment: { dueDate: new Date(2024, 4, 1) },
        },
      ] as unknown as LoansForPaymentData);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      const alert = result.alerts.find((item) => item.kind === 'LOANS_OVERDUE');
      expect(alert).toMatchObject({ severity: 'warning', count: 1 });
      expect(result.loans.totalOverdueCount).toBe(1);
    });

    it('emits SAVINGS_GOALS_AT_RISK when an active goal is at risk', async () => {
      mockGetSavingsGoalsWithProgress.mockResolvedValue([
        {
          id: 'goal-1',
          name: 'Viaje',
          currency: 'COP',
          currentAmountCents: 10_000,
          targetAmountCents: 100_000,
          progressPercentage: 10,
          deadline: new Date('2024-01-01T00:00:00.000Z'),
          projectedCompletion: null,
        },
      ] as unknown as SavingsGoalsData);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.alerts.some((item) => item.kind === 'SAVINGS_GOALS_AT_RISK')).toBe(true);
    });
  });

  // ── Exchange rates display ────────────────────────────────────────────────

  describe('dollarRate / euroRate', () => {
    it('exposes a LIVE rate with its provenance', async () => {
      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.dollarRate.source).toBe('live');
      expect(result.dollarRate.amount).toBe(4_000);
      expect(result.euroRate.amount).toBe(5_000);
    });

    it('exposes a FALLBACK rate when the live lookup fails', async () => {
      mockAccountFindMany.mockResolvedValue([
        makeAccount({ id: 'a-usd', type: 'CHECKING', currency: 'USD' }),
      ]);
      mockTransactionGroupBy.mockResolvedValue([
        { accountId: 'a-usd', _sum: { amountCents: 10_000 } },
      ]);
      mockGetExchangeRate.mockResolvedValue(null);
      mockTransactionFindMany.mockResolvedValue([
        makeTx({
          id: 'fallback',
          currency: 'USD',
          type: 'ADJUSTMENT',
          amountCents: 1,
          exchangeRate: 4_000,
        }),
      ]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.dollarRate).toMatchObject({ source: 'fallback', amount: 4_000 });
    });

    it('exposes an UNAVAILABLE rate as "--" when there is no source', async () => {
      mockGetExchangeRate.mockResolvedValue(null);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.dollarRate).toMatchObject({
        source: 'unavailable',
        amount: 0,
        formatted: '--',
      });
      expect(result.euroRate).toMatchObject({ source: 'unavailable', amount: 0, formatted: '--' });
    });
  });

  // ── Recent transactions & sparklines ──────────────────────────────────────

  describe('recentTransactions & sparklines', () => {
    it('limits recent transactions to 10 and preserves their fields', async () => {
      const transactions = Array.from({ length: 15 }, (_, index) =>
        makeTx({
          id: `tx-${index}`,
          description: `Transaction ${index}`,
          amountCents: -1_000 - index,
          type: 'EXPENSE',
        })
      );
      mockTransactionFindMany.mockResolvedValue(transactions);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.recentTransactions).toHaveLength(10);
      expect(result.recentTransactions[0]).toMatchObject({
        id: 'tx-0',
        description: 'Transaction 0',
        amount: -1_000,
        currency: 'COP',
        type: 'EXPENSE',
      });
    });

    it('builds a 6-month income/expense series in the primary currency', async () => {
      mockTransactionFindMany.mockResolvedValue([
        makeTx({
          id: 'income-june',
          amountCents: 500_000,
          type: 'INCOME',
          date: new Date('2024-06-10T00:00:00.000Z'),
        }),
      ]);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.sparklines.monthlyIncome).toHaveLength(6);
      expect(result.sparklines.monthlyIncome?.at(-1)).toBe(500_000);
      expect(result.sparklines.monthlyExpenses).toHaveLength(6);
    });

    it('builds the investments sparkline from the performance series', async () => {
      mockAccountFindMany.mockResolvedValue([makeAccount({ id: 'a-inv', type: 'INVESTMENT' })]);
      mockTransactionGroupBy.mockResolvedValue([
        { accountId: 'a-inv', _sum: { amountCents: 1_000_000 } },
      ]);
      mockGetInvestmentPerformance.mockResolvedValue({
        accountId: 'a-inv',
        name: 'Portafolio',
        currency: 'COP',
        totalInvestedCents: 1_000_000,
        cashBalanceCents: 1_000_000,
        holdingsMarketValueCents: 0,
        totalValueCents: 1_000_000,
        totalReturnCents: 0,
        totalReturnPct: 0,
        series: [{ date: new Date('2024-01-15T00:00:00.000Z'), investedCents: 1_000_000 }],
      } as PerformanceData);

      const result = await getDashboardMetricsByUser(USER_ID, 'en');

      expect(result.sparklines.investments).toHaveLength(6);
    });
  });
});
