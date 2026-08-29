/**
 * InvestmentTransactionsList Component Tests
 *
 * Fetches paginated transactions via getInvestmentTransactions on mount.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { InvestmentTransactionsList } from '../InvestmentTransactionsList';

// ============================================================================
// Mocks
// ============================================================================

const mockGetInvestmentTransactions = vi.fn();

vi.mock('@/actions/investment.actions', () => ({
  getInvestmentTransactions: (...args: unknown[]) => mockGetInvestmentTransactions(...args),
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

describe('InvestmentTransactionsList', () => {
  const buyTx = {
    id: 't1',
    type: 'INVESTMENT',
    amountCents: -500000,
    currency: 'USD',
    description: null,
    date: new Date('2024-03-01T10:00:00'),
  };
  const sellTx = {
    id: 't2',
    type: 'INVESTMENT',
    amountCents: 300000,
    currency: 'USD',
    description: null,
    date: new Date('2024-03-02T11:00:00'),
  };
  const otherTx = {
    id: 't3',
    type: 'DEPOSIT',
    amountCents: 100000,
    currency: 'USD',
    description: null,
    date: new Date('2024-03-03T12:00:00'),
  };

  const dictionary = {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show a loading spinner while fetching', () => {
    mockGetInvestmentTransactions.mockImplementation(() => new Promise(() => {}));
    const { container } = render(
      <InvestmentTransactionsList
        accountId="acc-1"
        currency="USD"
        dictionary={dictionary}
      />
    );

    expect(container.querySelector('svg.animate-spin')).toBeInTheDocument();
    expect(mockGetInvestmentTransactions).toHaveBeenCalledWith({
      accountId: 'acc-1',
      page: 1,
      pageSize: 20,
    });
  });

  it('should show the error message when the request fails', async () => {
    mockGetInvestmentTransactions.mockResolvedValue({
      success: false,
      error: 'Failed to load transactions',
    });

    render(<InvestmentTransactionsList accountId="acc-1" currency="USD" dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load transactions')).toBeInTheDocument();
    });
  });

  it('should show unexpected error when the request throws', async () => {
    mockGetInvestmentTransactions.mockRejectedValue(new Error('boom'));

    render(<InvestmentTransactionsList accountId="acc-1" currency="USD" dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByText('Unexpected error loading transactions')).toBeInTheDocument();
    });
  });

  it('should show the empty state when there are no transactions', async () => {
    mockGetInvestmentTransactions.mockResolvedValue({
      success: true,
      data: { transactions: [], totalPages: 1, total: 0, page: 1, pageSize: 20 },
    });

    render(<InvestmentTransactionsList accountId="acc-1" currency="USD" dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByText('noTransactions')).toBeInTheDocument();
    });
  });

  it('should render transaction labels for buy/sell/other types', async () => {
    mockGetInvestmentTransactions.mockResolvedValue({
      success: true,
      data: { transactions: [buyTx, sellTx, otherTx], totalPages: 1, total: 3, page: 1, pageSize: 20 },
    });

    render(<InvestmentTransactionsList accountId="acc-1" currency="USD" dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByText('recentActivity')).toBeInTheDocument();
      expect(screen.getByText('buyLabel')).toBeInTheDocument();
      expect(screen.getByText('sellLabel')).toBeInTheDocument();
      expect(screen.getByText('DEPOSIT')).toBeInTheDocument();
    });
  });

  it('should prefer description over the type label', async () => {
    const described = { ...buyTx, id: 't4', description: 'Bought 5 AAPL' };
    mockGetInvestmentTransactions.mockResolvedValue({
      success: true,
      data: { transactions: [described], totalPages: 1, total: 1, page: 1, pageSize: 20 },
    });

    render(<InvestmentTransactionsList accountId="acc-1" currency="USD" dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByText('Bought 5 AAPL')).toBeInTheDocument();
      expect(screen.queryByText('buyLabel')).not.toBeInTheDocument();
    });
  });

  it('should render amounts with sign and original currency traceability', async () => {
    const txWithOriginal = {
      id: 't5',
      type: 'INVESTMENT',
      amountCents: 100000,
      currency: 'USD',
      description: null,
      date: new Date('2024-03-04T13:00:00'),
      originalAmountCents: 1950000,
      originalCurrency: 'COP',
    };
    mockGetInvestmentTransactions.mockResolvedValue({
      success: true,
      data: { transactions: [txWithOriginal], totalPages: 1, total: 1, page: 1, pageSize: 20 },
    });

    render(<InvestmentTransactionsList accountId="acc-1" currency="USD" dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByText('+$1000.00 USD')).toBeInTheDocument();
      expect(screen.getByText('$19500.00 COP')).toBeInTheDocument();
    });
  });

  it('should show negative sign for buy transactions', async () => {
    mockGetInvestmentTransactions.mockResolvedValue({
      success: true,
      data: { transactions: [buyTx], totalPages: 1, total: 1, page: 1, pageSize: 20 },
    });

    render(<InvestmentTransactionsList accountId="acc-1" currency="USD" dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByText('-$5000.00 USD')).toBeInTheDocument();
    });
  });

  it('should render pagination controls when there is more than one page', async () => {
    mockGetInvestmentTransactions.mockResolvedValue({
      success: true,
      data: { transactions: [sellTx], totalPages: 2, total: 21, page: 1, pageSize: 20 },
    });

    render(<InvestmentTransactionsList accountId="acc-1" currency="USD" dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByText('1 / 2')).toBeInTheDocument();
    });

    const prev = screen.getByRole('button', { name: 'Previous page' });
    const next = screen.getByRole('button', { name: 'Next page' });
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();

    fireEvent.click(next);

    await waitFor(() => {
      expect(mockGetInvestmentTransactions).toHaveBeenLastCalledWith({
        accountId: 'acc-1',
        page: 2,
        pageSize: 20,
      });
    });
    await waitFor(() => {
      expect(screen.getByText('2 / 2')).toBeInTheDocument();
    });
  });

  it('should hide pagination when there is only one page', async () => {
    mockGetInvestmentTransactions.mockResolvedValue({
      success: true,
      data: { transactions: [sellTx], totalPages: 1, total: 1, page: 1, pageSize: 20 },
    });

    render(<InvestmentTransactionsList accountId="acc-1" currency="USD" dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByText('sellLabel')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument();
  });

  it('should render the transaction date', async () => {
    mockGetInvestmentTransactions.mockResolvedValue({
      success: true,
      data: { transactions: [sellTx], totalPages: 1, total: 1, page: 1, pageSize: 20 },
    });

    render(<InvestmentTransactionsList accountId="acc-1" currency="USD" dictionary={dictionary} />);

    await waitFor(() => {
      // date rendered via toLocaleDateString('es-CO') → "2 de mar de 2024, ..."
      expect(screen.getByText(/mar de 2024/)).toBeInTheDocument();
    });
  });
});