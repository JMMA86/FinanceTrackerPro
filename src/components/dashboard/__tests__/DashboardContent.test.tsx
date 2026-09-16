/**
 * DashboardContent Tests
 *
 * Focused coverage of the orchestrator:
 * - Every module section heading is rendered.
 * - The net-worth donut center uses `netWorthAssetsTotal` (not the slice sum).
 * - The asset/liability legends render their lists.
 * - Alerts render and the privacy mask toggles money values.
 *
 * Heavy children (modals, transaction list, Next Link) are stubbed so the test
 * stays focused on DashboardContent's own composition logic.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DashboardContent } from '../DashboardContent';
import type { DashboardMetrics } from '@/types/dashboard';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: unknown;
    children?: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={typeof href === 'string' ? href : '#'} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/transactions/TransactionList', () => ({
  TransactionList: () => <div data-testid="transaction-list" />,
}));
vi.mock('@/components/transactions/CreateTransactionModal', () => ({
  CreateTransactionModal: () => null,
}));
vi.mock('@/components/transactions/TransferModal', () => ({
  TransferModal: () => null,
}));
vi.mock('@/components/credit-cards/PayCreditCardModal', () => ({
  PayCreditCardModal: () => null,
}));

// i18n is mocked to return the dictionary key, so assertions can target keys
// (stable) instead of locale copy.
vi.mock('@/lib/i18n', () => ({
  get: (_dictionary: unknown, key: string) => key,
}));

function makeMetrics(overrides: Partial<DashboardMetrics> = {}): DashboardMetrics {
  const zero = (formatted: string) => ({ amount: 0, formatted, currency: 'COP' as const });
  const base: DashboardMetrics = {
    netWorth: { amount: 100_000, formatted: 'NW_TOTAL', currency: 'COP' },
    maxSpendable: zero('MAX_SPENDABLE'),
    savingsComparison: { amount: 0, formatted: '↓ 0.0%', isPositive: true, percentage: 0 },
    expensesComparison: { amount: 0, formatted: '↓ 0.0%', isPositive: true, percentage: 0 },
    monthlyIncome: zero('MONTHLY_INCOME'),
    totalCash: zero('TOTAL_CASH'),
    savings: { amount: 100_000, formatted: 'SAVINGS', currency: 'COP' },
    receivables: zero('RECEIVABLES'),
    creditCardDebt: { amount: 50_000, formatted: 'CARD_DEBT', currency: 'COP' },
    creditAvailable: zero('CREDIT_AVAILABLE'),
    externalDebts: zero('EXTERNAL_DEBTS'),
    investments: zero('INVESTMENTS'),
    maxInterestRate: { amount: 0, formatted: '--' },
    dollarRate: { amount: 0, formatted: '--', source: 'unavailable' },
    euroRate: { amount: 0, formatted: '--', source: 'unavailable' },
    monthlyExpenses: zero('MONTHLY_EXPENSES'),
    pendingFixedExpenses: zero('PENDING_FIXED'),
    activeSavingsGoals: 0,
    totalSavedCents: zero('TOTAL_SAVED'),
    savingsProgress: 0,
    netWorthDistribution: [
      { categoryKey: 'savings', amount: 100_000, percentage: 66.7, color: '#2f7cf6' },
      { categoryKey: 'checking', amount: 50_000, percentage: 33.3, color: '#0ea5e9' },
    ],
    netWorthLiabilities: [
      { categoryKey: 'creditCards', amount: 50_000, percentage: 100, color: '#ef4444' },
    ],
    netWorthAssetsTotal: { amount: 150_000, formatted: 'ASSETS_TOTAL', currency: 'COP' },
    netWorthLiabilitiesTotal: { amount: 50_000, formatted: 'LIABILITIES_TOTAL', currency: 'COP' },
    netWorthUnconverted: false,
    exchangeRatesUsed: {},
    netWorthUnconvertedByCurrency: {},
    netWorthDistributionCurrency: 'COP',
    sparklines: {},
    recentTransactions: [],
    byCurrency: {
      netWorth: [],
      totalCash: [],
      savings: [],
      receivables: [],
      creditCardDebt: [],
      creditAvailable: [],
      externalDebts: [],
      monthlyExpenses: [],
      monthlyIncome: [],
      investments: [],
      maxSpendable: [],
      pendingFixedExpenses: [],
      totalSavedCents: [],
    },
    investmentsBreakdown: { byCurrency: [], accounts: [] },
    loans: { byCurrency: [], totalOverdueCount: 0, nextDueDate: null },
    creditCards: {
      byCurrency: [],
      totalDebt: zero('CARDS_DEBT'),
      totalAvailableCredit: zero('CARDS_AVAILABLE'),
    },
    fixedExpenses: { byCurrency: [], upcoming: [] },
    variableExpenses: { byCurrency: [] },
    savingsGoals: [],
    alerts: [],
  };
  return { ...base, ...overrides };
}

function renderDashboard(metrics: DashboardMetrics = makeMetrics()) {
  return render(
    <DashboardContent
      metrics={metrics}
      lang="es"
      dashboard={{}}
      transactionsDictionary={{}}
      creditCardsDictionary={{}}
      accounts={[]}
      creditCards={[]}
      categories={[]}
      userId="user-1"
      locale="es-CO"
    />
  );
}

describe('DashboardContent', () => {
  it('renders every module section heading', () => {
    renderDashboard();

    expect(screen.getByRole('heading', { name: 'netWorthDistribution' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'liquidity' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'debts' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'creditCards' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'expenses' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'fxRates' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'savingsGoalsTitle' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'recentTransactions' })).toBeInTheDocument();
  });

  it('renders the donut center from netWorthAssetsTotal, not the slice sum', () => {
    renderDashboard();

    const donut = screen.getByRole('img', { name: /totalAssets/ });
    expect(donut.getAttribute('aria-label')).toBe('totalAssets: ASSETS_TOTAL');
    // The slice sum would be 150_000 cents formatted by the component; the
    // explicit server-formatted total must win.
    expect(donut.getAttribute('aria-label')).not.toContain('1.500');
  });

  it('renders the asset and liability legends as lists', () => {
    renderDashboard();

    const assetsList = screen.getByRole('list', { name: 'assets' });
    expect(within(assetsList).getByText('savings')).toBeInTheDocument();
    expect(within(assetsList).getByText('checking')).toBeInTheDocument();

    const liabilitiesList = screen.getByRole('list', { name: 'liabilities' });
    expect(within(liabilitiesList).getByText('creditCards')).toBeInTheDocument();
  });

  it('shows the assets total and the net worth in the distribution panel', () => {
    renderDashboard();

    // ASSETS_TOTAL also appears in the donut center (pre-formatted override).
    expect(screen.getAllByText('ASSETS_TOTAL').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('LIABILITIES_TOTAL').length).toBeGreaterThanOrEqual(1);
    // Hero + distribution panel both show netWorth.
    expect(screen.getAllByText('NW_TOTAL').length).toBeGreaterThanOrEqual(2);
  });

  it('renders alerts when present', () => {
    renderDashboard(
      makeMetrics({
        alerts: [
          {
            severity: 'warning',
            kind: 'FIXED_EXPENSES_OVERDUE',
            count: 2,
            amount: { amount: 50_000, currency: 'COP' },
          },
        ],
      })
    );

    expect(screen.getByText('alerts.FIXED_EXPENSES_OVERDUE')).toBeInTheDocument();
    expect(screen.getByText('×2')).toBeInTheDocument();
  });

  it('masks every money value when the privacy toggle is pressed', () => {
    renderDashboard();

    const toggle = screen.getByRole('button', { name: 'hideValues' });
    fireEvent.click(toggle);

    // Re-query: the button label flips to showValues.
    expect(screen.getByRole('button', { name: 'showValues' })).toBeInTheDocument();
    expect(screen.getAllByText('***').length).toBeGreaterThan(0);
  });
});
