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

vi.mock('@/lib/money', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/money')>();
  return {
    ...actual,
    formatMoney: vi.fn((cents: number, currency: string) => {
      const sign = cents < 0 ? '-' : '';
      return `${sign}$${(Math.abs(cents) / 100).toFixed(2)} ${currency}`;
    }),
  };
});

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
      // Price is a FormattedNumericInput (localized text, es-CO "150,00").
      expect(screen.getByLabelText('pricePerShare')).toHaveValue('150,00');
      expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
      // The new layout exposes the base cost (purchase total) as well.
      expect(screen.getByLabelText('baseCost')).toBeInTheDocument();
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

  it('should render the single buy layout (quantity + price + base cost) without the removed amount mode', async () => {
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
    fireEvent.click(await screen.findByRole('button', { name: /AAPL/i }, { timeout: 3000 }));

    // The three coupled fields of the new layout are all present.
    expect(await screen.findByLabelText('quantity')).toBeInTheDocument();
    expect(screen.getByLabelText('pricePerShare')).toBeInTheDocument();
    expect(screen.getByLabelText('baseCost')).toBeInTheDocument();
    // The trade date field is part of the layout too.
    expect(screen.getByLabelText('tradeDate')).toBeInTheDocument();
    // The old "Por monto" toggle / amount input no longer exists.
    expect(screen.queryByText('byAmount')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('amountToInvest')).not.toBeInTheDocument();
  });

  it('should accept a comma decimal quantity and derive the base cost', async () => {
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
    fireEvent.click(await screen.findByRole('button', { name: /AAPL/i }, { timeout: 3000 }));

    const qty = await screen.findByLabelText('quantity');
    fireEvent.change(qty, { target: { value: '2,5' } });

    // 2.5 shares * 15000 cents = 37500 cents → "375,00"
    await waitFor(() => {
      expect(qty).toHaveValue('2,5');
      expect(screen.getByLabelText('baseCost')).toHaveValue('375,00');
    });
  });

  it('should recalculate the price when the base cost is edited (precio = costo ÷ acciones)', async () => {
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
    fireEvent.click(await screen.findByRole('button', { name: /AAPL/i }, { timeout: 3000 }));

    // Quantity 2 seeds base cost = 2 * 150,00 = 300,00.
    fireEvent.change(await screen.findByLabelText('quantity'), { target: { value: '2' } });
    const baseCost = screen.getByLabelText('baseCost');
    await waitFor(() => expect(baseCost).toHaveValue('300,00'));

    // Clear 30000 → 0 (5 backspaces) and type 40000 cents ($400.00).
    for (let i = 0; i < 5; i++) fireEvent.keyDown(baseCost, { key: 'Backspace' });
    for (const key of ['4', '0', '0', '0', '0']) fireEvent.keyDown(baseCost, { key });

    // price = 40000 / 2 = 20000 cents → "200,00"
    await waitFor(() => {
      expect(baseCost).toHaveValue('400,00');
      expect(screen.getByLabelText('pricePerShare')).toHaveValue('200,00');
    });
  });

  it('should recalculate the base cost when the price is edited', async () => {
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
    fireEvent.click(await screen.findByRole('button', { name: /AAPL/i }, { timeout: 3000 }));

    fireEvent.change(await screen.findByLabelText('quantity'), { target: { value: '2' } });
    const price = screen.getByLabelText('pricePerShare');

    // Clear 15000 → 0 (5 backspaces) and type 20000 cents ($200.00).
    for (let i = 0; i < 5; i++) fireEvent.keyDown(price, { key: 'Backspace' });
    for (const key of ['2', '0', '0', '0', '0']) fireEvent.keyDown(price, { key });

    // base cost = 200,00 * 2 = 400,00
    await waitFor(() => {
      expect(price).toHaveValue('200,00');
      expect(screen.getByLabelText('baseCost')).toHaveValue('400,00');
    });
  });

  it('should disable the buy button when funds are insufficient', async () => {
    useUIStore.getState().openModal('buy-asset');
    mockSearchStocksAction.mockResolvedValue({
      success: true,
      data: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
    });
    mockGetStockPrice.mockResolvedValue({
      success: true,
      data: { symbol: 'AAPL', price: 150, priceCents: 15000, currency: 'USD' },
    });
    const lowFundsAccount = { ...account, balanceCents: 10000 }; // only $100 available

    render(<AssetSearchModal account={lowFundsAccount} dictionary={dictionary} />);

    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'AAPL' } });
    fireEvent.click(await screen.findByRole('button', { name: /AAPL/i }, { timeout: 3000 }));

    // 10 shares @ $150 = $1500 > $100 balance
    const qtyInput = await screen.findByLabelText('quantity');
    fireEvent.change(qtyInput, { target: { value: '10' } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('errors.insufficientFunds')).toBeInTheDocument();
    });
    const buyButton = screen.getByText('confirmBuy').closest('button')!;
    expect(buyButton).toBeDisabled();
  });

  it('should set the base cost (purchase total) once quantity and price are present', async () => {
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

    // 2 shares * 15000 cents = 30000 cents → formatted "300,00". The base cost
    // IS the purchase total (the standalone "totalCost" panel was removed).
    await waitFor(() => {
      expect(screen.queryByText('totalCost')).not.toBeInTheDocument();
      expect(screen.getByLabelText('baseCost')).toHaveValue('300,00');
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
      expect(useUIStore.getState().notifications.some((n) => n.message === 'boughtAsset')).toBe(
        true
      );
      expect(useUIStore.getState().activeModal).toBeNull();
    });
  });

  it('should map every buy error code to its localized message', async () => {
    useUIStore.getState().openModal('buy-asset');
    mockSearchStocksAction.mockResolvedValue({
      success: true,
      data: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
    });
    mockGetStockPrice.mockResolvedValue({
      success: true,
      data: { symbol: 'AAPL', price: 150, priceCents: 15000, currency: 'USD' },
    });

    const cases: Array<[string, string]> = [
      ['INSUFFICIENT_FUNDS', 'errors.insufficientFunds'],
      ['PRICE_UNAVAILABLE', 'errors.priceUnavailable'],
      ['RATE_LIMITED', 'errors.rateLimited'],
      ['INSUFFICIENT_QUANTITY', 'errors.insufficientQuantity'],
      ['CURRENCY_MISMATCH', 'errors.currencyMismatch'],
      ['INVESTMENT_LEDGER_INCOMPLETE', 'errors.investmentLedgerIncomplete'],
      ['INVALID_FORMAT', 'errors.invalidQuantity'],
    ];

    for (const [code, message] of cases) {
      mockBuyAsset.mockResolvedValueOnce({ success: false, code, error: 'x' });
      const { unmount } = render(<AssetSearchModal account={account} dictionary={dictionary} />);
      expect(await screen.findByRole('combobox')).toBeInTheDocument();
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'AAPL' } });
      fireEvent.click(await screen.findByRole('button', { name: /AAPL/i }, { timeout: 3000 }));
      fireEvent.change(await screen.findByLabelText('quantity'), { target: { value: '2' } });
      fireEvent.click(screen.getByText('confirmBuy'));
      expect(await screen.findByText(message)).toBeInTheDocument();
      unmount();
      useUIStore.getState().openModal('buy-asset');
    }
  });

  it('should reject buying a non-positive quantity without calling the action', async () => {
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
    fireEvent.click(await screen.findByRole('button', { name: /AAPL/i }, { timeout: 3000 }));

    // The buy button is disabled while the quantity is empty.
    const buyButton = (await screen.findByText('confirmBuy')).closest('button')!;
    expect(buyButton).toBeDisabled();
    expect(mockBuyAsset).not.toHaveBeenCalled();
  });

  it('should confirm a server PRICE_MISMATCH and retry with the same idempotency key', async () => {
    useUIStore.getState().openModal('buy-asset');
    mockSearchStocksAction.mockResolvedValue({
      success: true,
      data: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
    });
    mockGetStockPrice.mockResolvedValue({
      success: true,
      data: { symbol: 'AAPL', price: 150, priceCents: 15000, currency: 'USD' },
    });
    mockBuyAsset
      .mockResolvedValueOnce({ success: false, code: 'PRICE_MISMATCH' })
      .mockResolvedValueOnce({ success: true });

    render(<AssetSearchModal account={account} dictionary={dictionary} />);

    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'AAPL' } });
    fireEvent.click(await screen.findByRole('button', { name: /AAPL/i }, { timeout: 3000 }));
    fireEvent.change(await screen.findByLabelText('quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('confirmBuy'));

    await waitFor(() => {
      expect(screen.getByText('priceOverrideConfirmTitle')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('priceOverrideConfirmCta'));

    await waitFor(() => expect(mockBuyAsset).toHaveBeenCalledTimes(2));
    // The override retry reuses the SAME idempotency key as the first attempt.
    const first = mockBuyAsset.mock.calls[0][0] as { idempotencyKey: string };
    const second = mockBuyAsset.mock.calls[1][0] as {
      idempotencyKey: string;
      allowPriceOverride: boolean;
    };
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(second.allowPriceOverride).toBe(true);
  });

  it('should show a non-blocking advisory when the price differs more than ±2%', async () => {
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
    fireEvent.click(await screen.findByRole('button', { name: /AAPL/i }, { timeout: 3000 }));

    // Edit the base cost so price = base/qty drifts > 2% from the quote.
    fireEvent.change(await screen.findByLabelText('quantity'), { target: { value: '1' } });
    const baseCost = screen.getByLabelText('baseCost');
    for (let i = 0; i < 5; i++) fireEvent.keyDown(baseCost, { key: 'Backspace' });
    for (const key of ['2', '0', '0', '0', '0']) fireEvent.keyDown(baseCost, { key });

    await waitFor(() => {
      expect(baseCost).toHaveValue('200,00');
      expect(screen.getByText('priceOverrideWarning')).toBeInTheDocument();
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

  it('should map VALIDATION_ERROR to the invalid quantity error', async () => {
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
      expect(screen.getByText('errors.invalidQuantity')).toBeInTheDocument();
    });
  });

  it('should show generic buy error when buyAsset returns an unknown error code', async () => {
    useUIStore.getState().openModal('buy-asset');
    mockSearchStocksAction.mockResolvedValue({
      success: true,
      data: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
    });
    mockGetStockPrice.mockResolvedValue({
      success: true,
      data: { symbol: 'AAPL', price: 150, priceCents: 15000, currency: 'USD' },
    });
    mockBuyAsset.mockResolvedValue({ success: false, code: 'SOMETHING_ELSE', error: 'no' });

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
