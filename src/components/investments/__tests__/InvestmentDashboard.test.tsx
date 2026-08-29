/**
 * InvestmentDashboard Component Tests
 *
 * Receives `accounts` and `dictionary` as props. Child modals and the
 * transactions list are stubbed so the test focuses on the dashboard logic:
 * empty state, summary cards, account selection, price refresh and sell flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { InvestmentDashboard } from '../InvestmentDashboard';
import { useUIStore } from '@/store/ui.store';

// ============================================================================
// Mocks
// ============================================================================

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockUpdateAllAssetPrices = vi.fn();
vi.mock('@/actions/investment.actions', () => ({
  updateAllAssetPrices: (...args: unknown[]) => mockUpdateAllAssetPrices(...args),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_d: Record<string, unknown>, key: string) => key),
}));

vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn((cents: number, currency: string) => {
    const sign = cents < 0 ? '-' : '';
    return `${sign}$${(Math.abs(cents) / 100).toFixed(2)} ${currency}`;
  }),
}));

// Stub child modals / lists to isolate dashboard logic
vi.mock('@/components/investments/CreateInvestmentModal', () => ({
  CreateInvestmentModal: () => <div data-testid="create-investment-modal" />,
}));
vi.mock('@/components/investments/DepositModal', () => ({
  DepositModal: () => <div data-testid="deposit-modal" />,
}));
vi.mock('@/components/investments/AssetSearchModal', () => ({
  AssetSearchModal: ({ account }: { account: { id: string } | null }) => (
    <div data-testid="asset-search-modal" data-account={account?.id ?? 'null'} />
  ),
}));
vi.mock('@/components/investments/SellAssetModal', () => ({
  SellAssetModal: ({ holding }: { holding: { symbol: string } | null }) => (
    <div data-testid="sell-asset-modal" data-holding={holding?.symbol ?? 'null'} />
  ),
}));
vi.mock('@/components/investments/InvestmentTransactionsList', () => ({
  InvestmentTransactionsList: () => <div data-testid="transactions-list" />,
}));

describe('InvestmentDashboard', () => {
  const singleAccount = {
    id: 'acc-1',
    name: 'Tech Stocks',
    currency: 'USD',
    balanceCents: 200000,
    assetHoldings: [
      {
        id: 'h-1',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        quantity: 2,
        avgCostCents: 15000,
        currentPriceCents: 16000,
        currency: 'USD',
      },
      {
        id: 'h-2',
        symbol: 'TSLA',
        name: 'Tesla Inc.',
        quantity: 5,
        avgCostCents: 20000,
        currentPriceCents: 22000,
        currency: 'USD',
      },
    ],
    createdAt: new Date('2024-01-01'),
  };

  const mixedAccounts = [
    singleAccount,
    {
      id: 'acc-2',
      name: 'EUR Value',
      currency: 'EUR',
      balanceCents: 50000,
      assetHoldings: [],
      createdAt: new Date('2024-01-02'),
    },
  ];

  const dictionary = {};

  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({ activeModal: null, modalData: null });
  });

  it('should render the title header', () => {
    render(<InvestmentDashboard accounts={[]} dictionary={dictionary} />);
    expect(screen.getByText('title')).toBeInTheDocument();
  });

  it('should show the empty state when there are no accounts', () => {
    render(<InvestmentDashboard accounts={[]} dictionary={dictionary} />);

    expect(screen.getByText('noAccounts')).toBeInTheDocument();
    expect(screen.getByText('noAccountsDesc')).toBeInTheDocument();

    // Header actions are disabled without accounts
    expect(screen.getByRole('button', { name: 'updatePrices' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'deposit' })).toBeDisabled();
    // "add account" appears twice (header + empty state) and is always enabled
    const addAccountButtons = screen.getAllByRole('button', { name: 'addAccount' });
    expect(addAccountButtons).toHaveLength(2);
    addAccountButtons.forEach((btn) => expect(btn).toBeEnabled());
  });

  it('should open create-investment modal from empty state button', () => {
    render(<InvestmentDashboard accounts={[]} dictionary={dictionary} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'addAccount' })[0]);
    expect(useUIStore.getState().activeModal).toBe('create-investment');
  });

  it('should render summary cards and account cards when accounts exist', () => {
    render(<InvestmentDashboard accounts={[singleAccount]} dictionary={dictionary} />);

    // Summary cards (single currency path)
    expect(screen.getByText('totalInvested')).toBeInTheDocument();
    expect(screen.getByText('totalMarketValue')).toBeInTheDocument();
    expect(screen.getByText('holdings')).toBeInTheDocument();

    // Balance appears in both the summary card and the account card
    expect(screen.getAllByText('$2000.00 USD').length).toBeGreaterThanOrEqual(1);
    // Market value: 2*16000 + 5*22000 = 142000 cents
    expect(screen.getAllByText('$1420.00 USD').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('2 positions')).toBeInTheDocument();

    // Account card rendered with real InvestmentAccountCard
    expect(screen.getByText('Tech Stocks')).toBeInTheDocument();
  });

  it('should show mixedCurrencies label when accounts have different currencies', () => {
    render(<InvestmentDashboard accounts={mixedAccounts} dictionary={dictionary} />);

    expect(screen.getAllByText('mixedCurrencies').length).toBeGreaterThanOrEqual(2);
  });

  it('should render plural/singular holdings label correctly', () => {
    const singleHoldingAccount = {
      ...singleAccount,
      assetHoldings: [singleAccount.assetHoldings![0]],
    };
    render(<InvestmentDashboard accounts={[singleHoldingAccount]} dictionary={dictionary} />);
    expect(screen.getByText('1 position')).toBeInTheDocument();
  });

  it('should show account details when an account card is selected', async () => {
    render(<InvestmentDashboard accounts={[singleAccount]} dictionary={dictionary} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tech Stocks' }));

    await waitFor(() => {
      expect(screen.getByTestId('transactions-list')).toBeInTheDocument();
      expect(screen.getByText('buyAsset')).toBeInTheDocument();
      expect(screen.getAllByText('deposit').length).toBeGreaterThan(0);
    });

    // AssetSearchModal receives the selected account
    const assetSearch = screen.getByTestId('asset-search-modal');
    expect(assetSearch).toHaveAttribute('data-account', 'acc-1');
  });

  it('should open buy-asset modal when buy button is clicked', async () => {
    render(<InvestmentDashboard accounts={[singleAccount]} dictionary={dictionary} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tech Stocks' }));

    expect(await screen.findByText('buyAsset')).toBeInTheDocument();
    fireEvent.click(screen.getByText('buyAsset'));

    expect(useUIStore.getState().activeModal).toBe('buy-asset');
  });

  it('should open deposit-investment with the selected account id', async () => {
    render(<InvestmentDashboard accounts={[singleAccount]} dictionary={dictionary} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tech Stocks' }));

    await waitFor(() => {
      expect(screen.getAllByText('deposit').length).toBeGreaterThan(0);
    });
    // The selected-account deposit button passes the account id in modalData
    fireEvent.click(screen.getAllByText('deposit')[1]);

    expect(useUIStore.getState().activeModal).toBe('deposit-investment');
    expect(useUIStore.getState().modalData).toEqual({ accountId: 'acc-1' });
  });

  it('should refresh prices and show a success notification', async () => {
    mockUpdateAllAssetPrices.mockResolvedValue({ success: true, data: { updated: 2 } });

    render(<InvestmentDashboard accounts={[singleAccount]} dictionary={dictionary} />);

    fireEvent.click(screen.getByRole('button', { name: 'updatePrices' }));

    await waitFor(() => {
      expect(mockUpdateAllAssetPrices).toHaveBeenCalled();
      expect(
        useUIStore.getState().notifications.some((n) => n.message === 'Updated 2 price(s)')
      ).toBe(true);
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('should show "No holdings to update" notification when updated is 0', async () => {
    mockUpdateAllAssetPrices.mockResolvedValue({ success: true, data: { updated: 0 } });

    render(<InvestmentDashboard accounts={[singleAccount]} dictionary={dictionary} />);
    fireEvent.click(screen.getByRole('button', { name: 'updatePrices' }));

    await waitFor(() => {
      expect(
        useUIStore.getState().notifications.some((n) => n.message === 'No holdings to update')
      ).toBe(true);
    });
  });

  it('should show an error notification when price update fails', async () => {
    mockUpdateAllAssetPrices.mockResolvedValue({ success: false, error: 'Boom' });

    render(<InvestmentDashboard accounts={[singleAccount]} dictionary={dictionary} />);
    fireEvent.click(screen.getByRole('button', { name: 'updatePrices' }));

    await waitFor(() => {
      expect(useUIStore.getState().notifications.some((n) => n.message === 'Boom')).toBe(true);
    });
  });

  it('should show an error notification when price update throws', async () => {
    mockUpdateAllAssetPrices.mockRejectedValue(new Error('network'));

    render(<InvestmentDashboard accounts={[singleAccount]} dictionary={dictionary} />);
    fireEvent.click(screen.getByRole('button', { name: 'updatePrices' }));

    await waitFor(() => {
      expect(
        useUIStore.getState().notifications.some((n) => n.message === 'Failed to update prices')
      ).toBe(true);
    });
  });

  it('should open sell-asset modal with the selected holding', async () => {
    render(<InvestmentDashboard accounts={[singleAccount]} dictionary={dictionary} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tech Stocks' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Sell AAPL/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Sell AAPL/i }));

    expect(useUIStore.getState().activeModal).toBe('sell-asset');
    await waitFor(() => {
      expect(screen.getByTestId('sell-asset-modal')).toHaveAttribute('data-holding', 'AAPL');
    });
  });
});