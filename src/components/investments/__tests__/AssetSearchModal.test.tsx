/**
 * AssetSearchModal Component Tests
 *
 * Two-phase search modal:
 *   1. searchStocksAction (debounced autocomplete)
 *   2. getStockPrice on selection → buy form
 *   3. buyAsset to execute the purchase
 *
 * Uses the real Zustand store (useUIStore). We open the modal with
 * `useUIStore.getState().openModal('buy-asset')` before rendering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AssetSearchModal } from '../AssetSearchModal';
import { useUIStore } from '@/store/ui.store';
import type { InvestmentAccountSummary } from '../InvestmentAccountCard';

// ============================================================================
// Mocks
// ============================================================================

const mockGetStockPrice = vi.fn();
const mockBuyAsset = vi.fn();
const mockSearchStocksAction = vi.fn();

vi.mock('@/actions/investment.actions', () => ({
  getStockPrice: (...args: unknown[]) => mockGetStockPrice(...args),
  buyAsset: (...args: unknown[]) => mockBuyAsset(...args),
  searchStocksAction: (...args: unknown[]) => mockSearchStocksAction(...args),
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

describe('AssetSearchModal', () => {
  const account: InvestmentAccountSummary = {
    id: 'acc-1',
    name: 'Tech Stocks',
    currency: 'USD',
    balanceCents: 100000,
    assetHoldings: [],
    createdAt: new Date('2024-01-01'),
  };
  const dictionary = {};

  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({ activeModal: null, modalData: null });
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
  });

  it('should render a closed dialog when activeModal is not buy-asset', () => {
    const { container } = render(<AssetSearchModal account={account} dictionary={dictionary} />);
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).not.toHaveAttribute('open');
  });

  it('should open the dialog and show title when activeModal is buy-asset', async () => {
    useUIStore.getState().openModal('buy-asset');
    const { container } = render(<AssetSearchModal account={account} dictionary={dictionary} />);
    const dialog = container.querySelector('dialog');
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAttribute('aria-labelledby', 'buy-asset-title');
    await waitFor(() => {
      expect(screen.getByText('buyAsset')).toBeInTheDocument();
    });
  });

  it('should display the account name and available balance', async () => {
    useUIStore.getState().openModal('buy-asset');
    render(<AssetSearchModal account={account} dictionary={dictionary} />);
    await waitFor(() => {
      expect(screen.getByText('Tech Stocks')).toBeInTheDocument();
      expect(screen.getByText('availableBalance: $1000.00 USD')).toBeInTheDocument();
    });
  });

  it('should show the search input with combobox semantics', async () => {
    useUIStore.getState().openModal('buy-asset');
    render(<AssetSearchModal account={account} dictionary={dictionary} />);
    await waitFor(() => {
      const input = screen.getByRole('combobox');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('aria-autocomplete', 'list');
      expect(input).toHaveAttribute('aria-controls', 'stock-results');
    });
  });

  it('should search stocks after debounce and show matches', async () => {
    useUIStore.getState().openModal('buy-asset');
    mockSearchStocksAction.mockResolvedValue({
      success: true,
      data: [
        { symbol: 'AAPL', name: 'Apple Inc.' },
        { symbol: 'TSLA', name: 'Tesla Inc.' },
      ],
    });

    render(<AssetSearchModal account={account} dictionary={dictionary} />);

    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'A' } });

    await waitFor(
      () => {
        expect(mockSearchStocksAction).toHaveBeenCalledWith({ symbol: 'A' });
        expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
        expect(screen.getByText('Tesla Inc.')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('should show stockNotFound error when no matches are returned', async () => {
    useUIStore.getState().openModal('buy-asset');
    mockSearchStocksAction.mockResolvedValue({ success: true, data: [] });

    render(<AssetSearchModal account={account} dictionary={dictionary} />);

    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ZZZ' } });

    await waitFor(
      () => {
        expect(screen.getByText('stockNotFound')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('should show stockNotFound error when the search request fails', async () => {
    useUIStore.getState().openModal('buy-asset');
    mockSearchStocksAction.mockRejectedValue(new Error('network'));

    render(<AssetSearchModal account={account} dictionary={dictionary} />);

    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'AAPL' } });

    await waitFor(
      () => {
        expect(screen.getByText('stockNotFound')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('should fetch price and render the buy form when a stock is picked', async () => {
    useUIStore.getState().openModal('buy-asset');
    mockSearchStocksAction.mockResolvedValue({
      success: true,
      data: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
    });
    mockGetStockPrice.mockResolvedValue({
      success: true,
      data: { symbol: 'AAPL', price: 150, priceCents: 15000, currency: 'USD' },
    });

    render(<AssetSearchModal account={account} dictionary={dictionary} />);

    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'AAPL' } });
    expect(
      await screen.findByRole('button', { name: /AAPL/i }, { timeout: 3000 })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /AAPL/i }));

    await waitFor(() => {
      expect(mockGetStockPrice).toHaveBeenCalledWith({ symbol: 'AAPL' });
    });

    await waitFor(() => {
      expect(screen.getByLabelText('quantity')).toBeInTheDocument();
      // jsdom reports number inputs as numeric values
      expect(screen.getByLabelText('pricePerShare')).toHaveValue(150);
      expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    });
  });

  it('should not show the buy form when the price fetch fails', async () => {
    useUIStore.getState().openModal('buy-asset');
    mockSearchStocksAction.mockResolvedValue({
      success: true,
      data: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
    });
    mockGetStockPrice.mockResolvedValue({ success: false, data: null });

    render(<AssetSearchModal account={account} dictionary={dictionary} />);

    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'AAPL' } });
    expect(
      await screen.findByRole('button', { name: /AAPL/i }, { timeout: 3000 })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /AAPL/i }));

    await waitFor(() => {
      expect(mockGetStockPrice).toHaveBeenCalledWith({ symbol: 'AAPL' });
    });
    // No buy form because the price lookup failed.
    expect(screen.queryByLabelText('quantity')).not.toBeInTheDocument();
  });

  it('should show total cost once quantity and price are present', async () => {
    useUIStore.getState().openModal('buy-asset');
    mockSearchStocksAction.mockResolvedValue({
      success: true,
      data: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
    });
    mockGetStockPrice.mockResolvedValue({
      success: true,
      data: { symbol: 'AAPL', price: 150, priceCents: 15000, currency: 'USD' },
    });

    render(<AssetSearchModal account={account} dictionary={dictionary} />);

    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'AAPL' } });
    expect(
      await screen.findByRole('button', { name: /AAPL/i }, { timeout: 3000 })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /AAPL/i }));

    expect(await screen.findByLabelText('quantity')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('quantity'), { target: { value: '2' } });

    await waitFor(() => {
      expect(screen.getByText('totalCost')).toBeInTheDocument();
      // 2 shares * 15000 cents = 30000 cents
      expect(screen.getByText('$300.00 USD')).toBeInTheDocument();
    });
  });

  it('should call buyAsset with correct payload and close on success', async () => {
    useUIStore.getState().openModal('buy-asset');
    mockSearchStocksAction.mockResolvedValue({
      success: true,
      data: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
    });
    mockGetStockPrice.mockResolvedValue({
      success: true,
      data: { symbol: 'AAPL', price: 150, priceCents: 15000, currency: 'USD' },
    });
    mockBuyAsset.mockResolvedValue({ success: true });

    render(<AssetSearchModal account={account} dictionary={dictionary} />);

    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'AAPL' } });
    expect(
      await screen.findByRole('button', { name: /AAPL/i }, { timeout: 3000 })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /AAPL/i }));

    expect(await screen.findByLabelText('quantity')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('confirmBuy'));

    await waitFor(() => {
      expect(mockBuyAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acc-1',
          symbol: 'AAPL',
          name: 'Apple Inc.',
          quantity: '2',
          pricePerShareCents: 15000,
        })
      );
    });

    await waitFor(() => {
      expect(useUIStore.getState().notifications.some((n) => n.message === 'Bought 2 AAPL')).toBe(
        true
      );
      expect(useUIStore.getState().activeModal).toBeNull();
    });
  });

  it('should show session invalid error when buyAsset reports SESSION_INVALID', async () => {
    useUIStore.getState().openModal('buy-asset');
    mockSearchStocksAction.mockResolvedValue({
      success: true,
      data: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
    });
    mockGetStockPrice.mockResolvedValue({
      success: true,
      data: { symbol: 'AAPL', price: 150, priceCents: 15000, currency: 'USD' },
    });
    mockBuyAsset.mockResolvedValue({ success: false, code: 'SESSION_INVALID', error: 'bad' });

    render(<AssetSearchModal account={account} dictionary={dictionary} />);

    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'AAPL' } });
    expect(
      await screen.findByRole('button', { name: /AAPL/i }, { timeout: 3000 })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /AAPL/i }));
    expect(await screen.findByLabelText('quantity')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('confirmBuy'));

    await waitFor(() => {
      expect(screen.getByText('errors.sessionInvalid')).toBeInTheDocument();
    });
  });

  it('should show generic buy error when buyAsset fails', async () => {
    useUIStore.getState().openModal('buy-asset');
    mockSearchStocksAction.mockResolvedValue({
      success: true,
      data: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
    });
    mockGetStockPrice.mockResolvedValue({
      success: true,
      data: { symbol: 'AAPL', price: 150, priceCents: 15000, currency: 'USD' },
    });
    mockBuyAsset.mockResolvedValue({ success: false, code: 'VALIDATION_ERROR', error: 'no' });

    render(<AssetSearchModal account={account} dictionary={dictionary} />);

    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'AAPL' } });
    expect(
      await screen.findByRole('button', { name: /AAPL/i }, { timeout: 3000 })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /AAPL/i }));
    expect(await screen.findByLabelText('quantity')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('confirmBuy'));

    await waitFor(() => {
      expect(screen.getByText('errors.buyFailed')).toBeInTheDocument();
    });
  });

  it('should show generic buy error when buyAsset throws', async () => {
    useUIStore.getState().openModal('buy-asset');
    mockSearchStocksAction.mockResolvedValue({
      success: true,
      data: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
    });
    mockGetStockPrice.mockResolvedValue({
      success: true,
      data: { symbol: 'AAPL', price: 150, priceCents: 15000, currency: 'USD' },
    });
    mockBuyAsset.mockRejectedValue(new Error('network'));

    render(<AssetSearchModal account={account} dictionary={dictionary} />);

    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'AAPL' } });
    expect(
      await screen.findByRole('button', { name: /AAPL/i }, { timeout: 3000 })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /AAPL/i }));
    expect(await screen.findByLabelText('quantity')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('confirmBuy'));

    await waitFor(() => {
      expect(screen.getByText('errors.buyFailed')).toBeInTheDocument();
    });
  });

  it('should close the dialog when the close button is clicked', async () => {
    useUIStore.getState().openModal('buy-asset');
    const { container } = render(<AssetSearchModal account={account} dictionary={dictionary} />);
    expect(await screen.findByText('buyAsset')).toBeInTheDocument();

    const dialog = container.querySelector('dialog')!;
    const closeButtons = screen.getAllByLabelText('Close');
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    await waitFor(() => {
      expect(dialog).not.toHaveAttribute('open');
    });
  });
});
