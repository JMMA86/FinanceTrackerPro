/**
 * SellAssetModal Component Tests
 *
 * Modal opened via `useUIStore.getState().openModal('sell-asset')`.
 * Requires a `holding` prop; returns null when holding is null.
 *
 * NOTE: on open the component schedules a requestAnimationFrame callback that
 * pre-fills the price and resets the quantity. Tests call `flushRaf()` before
 * interacting so the state is stable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SellAssetModal } from '../SellAssetModal';
import { useUIStore } from '@/store/ui.store';

// ============================================================================
// Mocks
// ============================================================================

const mockSellAsset = vi.fn();

vi.mock('@/actions/investment.actions', () => ({
  sellAsset: (...args: unknown[]) => mockSellAsset(...args),
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

// Wait for any pending requestAnimationFrame callback to run
const flushRaf = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

describe('SellAssetModal', () => {
  const holding = {
    id: 'h-1',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    quantity: 10,
    avgCostCents: 14000,
    currentPriceCents: 15000,
    currency: 'USD',
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

  it('should render nothing when holding is null', () => {
    useUIStore.getState().openModal('sell-asset');
    const { container } = render(
      <SellAssetModal holding={null} currency="USD" dictionary={dictionary} />
    );
    expect(container.querySelector('dialog')).not.toBeInTheDocument();
  });

  it('should open and render the holding info', async () => {
    useUIStore.getState().openModal('sell-asset');
    const { container } = render(
      <SellAssetModal holding={holding} currency="USD" dictionary={dictionary} />
    );
    const dialog = container.querySelector('dialog');
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAttribute('aria-labelledby', 'sell-asset-title');

    await waitFor(() => {
      expect(screen.getByText('sellAsset')).toBeInTheDocument();
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      // Quantity is rendered via formatQuantity (trailing zeros trimmed).
      expect(screen.getByText('10 shares · Avg $140.00 USD')).toBeInTheDocument();
    });
  });

  it('should prefill the price with the holding current price', async () => {
    useUIStore.getState().openModal('sell-asset');
    render(<SellAssetModal holding={holding} currency="USD" dictionary={dictionary} />);

    expect(await screen.findByLabelText('pricePerShare')).toBeInTheDocument();
    await flushRaf();
    await waitFor(() => {
      // Price is a FormattedNumericInput (localized text, es-CO "150,00").
      expect(screen.getByLabelText('pricePerShare')).toHaveValue('150,00');
    });
  });

  it('should accept a comma decimal quantity', async () => {
    useUIStore.getState().openModal('sell-asset');
    render(<SellAssetModal holding={holding} currency="USD" dictionary={dictionary} />);

    const qty = await screen.findByLabelText('quantity');
    await flushRaf();
    fireEvent.change(qty, { target: { value: '2,5' } });

    // Total proceeds: 2.5 * 15000 = 37500 cents → "$375.00 USD"
    await waitFor(() => {
      expect(qty).toHaveValue('2,5');
      expect(screen.getByText('$375.00 USD')).toBeInTheDocument();
    });
  });

  it('should show validation error when quantity exceeds available shares', async () => {
    useUIStore.getState().openModal('sell-asset');
    render(<SellAssetModal holding={holding} currency="USD" dictionary={dictionary} />);

    expect(await screen.findByLabelText('quantity')).toBeInTheDocument();
    await flushRaf();
    fireEvent.change(screen.getByLabelText('quantity'), { target: { value: '12' } });
    fireEvent.click(screen.getByText('confirmSell'));

    await waitFor(() => {
      expect(screen.getByText('maxQuantity')).toBeInTheDocument();
    });
  });

  it('should show the total proceeds when quantity is set', async () => {
    useUIStore.getState().openModal('sell-asset');
    render(<SellAssetModal holding={holding} currency="USD" dictionary={dictionary} />);

    expect(await screen.findByLabelText('quantity')).toBeInTheDocument();
    await flushRaf();
    fireEvent.change(screen.getByLabelText('quantity'), { target: { value: '2' } });

    await waitFor(() => {
      expect(screen.getByText('totalProceeds')).toBeInTheDocument();
      // 2 * 15000 = 30000 cents
      expect(screen.getByText('$300.00 USD')).toBeInTheDocument();
    });
  });

  it('should call sellAsset with correct data and close on success', async () => {
    useUIStore.getState().openModal('sell-asset');
    mockSellAsset.mockResolvedValue({ success: true });

    render(<SellAssetModal holding={holding} currency="USD" dictionary={dictionary} />);

    expect(await screen.findByLabelText('quantity')).toBeInTheDocument();
    await flushRaf();
    await waitFor(() => expect(screen.getByLabelText('pricePerShare')).toHaveValue('150,00'));

    fireEvent.change(screen.getByLabelText('quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('confirmSell'));

    await waitFor(() => {
      expect(mockSellAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          holdingId: 'h-1',
          quantity: '2',
          pricePerShareCents: 15000,
        })
      );
    });

    await waitFor(() => {
      expect(useUIStore.getState().notifications.some((n) => n.message === 'soldAsset')).toBe(true);
      expect(useUIStore.getState().activeModal).toBeNull();
    });
  });

  it('should show session invalid error', async () => {
    useUIStore.getState().openModal('sell-asset');
    mockSellAsset.mockResolvedValue({ success: false, code: 'SESSION_INVALID', error: 'bad' });

    render(<SellAssetModal holding={holding} currency="USD" dictionary={dictionary} />);

    expect(await screen.findByLabelText('quantity')).toBeInTheDocument();
    await flushRaf();
    fireEvent.change(screen.getByLabelText('quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('confirmSell'));

    await waitFor(() => {
      expect(screen.getByText('errors.sessionInvalid')).toBeInTheDocument();
    });
  });

  it('should map VALIDATION_ERROR to the invalid quantity error', async () => {
    useUIStore.getState().openModal('sell-asset');
    mockSellAsset.mockResolvedValue({ success: false, code: 'VALIDATION_ERROR', error: 'no' });

    render(<SellAssetModal holding={holding} currency="USD" dictionary={dictionary} />);

    expect(await screen.findByLabelText('quantity')).toBeInTheDocument();
    await flushRaf();
    fireEvent.change(screen.getByLabelText('quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('confirmSell'));

    await waitFor(() => {
      expect(screen.getByText('errors.invalidQuantity')).toBeInTheDocument();
    });
  });

  it('should show generic sell error for an unknown error code', async () => {
    useUIStore.getState().openModal('sell-asset');
    mockSellAsset.mockResolvedValue({ success: false, code: 'SOMETHING_ELSE', error: 'no' });

    render(<SellAssetModal holding={holding} currency="USD" dictionary={dictionary} />);

    expect(await screen.findByLabelText('quantity')).toBeInTheDocument();
    await flushRaf();
    fireEvent.change(screen.getByLabelText('quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('confirmSell'));

    await waitFor(() => {
      expect(screen.getByText('errors.sellFailed')).toBeInTheDocument();
    });
  });

  it('should map the remaining sell error codes to their localized messages', async () => {
    const cases: Array<[string, string]> = [
      ['INSUFFICIENT_QUANTITY', 'errors.insufficientQuantity'],
      ['PRICE_UNAVAILABLE', 'errors.priceUnavailable'],
      ['RATE_LIMITED', 'errors.rateLimited'],
      ['CURRENCY_MISMATCH', 'errors.currencyMismatch'],
      ['INVESTMENT_LEDGER_INCOMPLETE', 'errors.investmentLedgerIncomplete'],
      ['INVALID_FORMAT', 'errors.invalidQuantity'],
    ];

    for (const [code, message] of cases) {
      useUIStore.getState().openModal('sell-asset');
      mockSellAsset.mockResolvedValueOnce({ success: false, code, error: 'x' });
      const { unmount } = render(
        <SellAssetModal holding={holding} currency="USD" dictionary={dictionary} />
      );
      await flushRaf();
      fireEvent.change(screen.getByLabelText('quantity'), { target: { value: '2' } });
      fireEvent.click(screen.getByText('confirmSell'));
      expect(await screen.findByText(message)).toBeInTheDocument();
      unmount();
    }
  });

  it('should confirm a server PRICE_MISMATCH and retry with the same idempotency key', async () => {
    useUIStore.getState().openModal('sell-asset');
    mockSellAsset
      .mockResolvedValueOnce({ success: false, code: 'PRICE_MISMATCH' })
      .mockResolvedValueOnce({ success: true });

    render(<SellAssetModal holding={holding} currency="USD" dictionary={dictionary} />);

    expect(await screen.findByLabelText('quantity')).toBeInTheDocument();
    await flushRaf();
    fireEvent.change(screen.getByLabelText('quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('confirmSell'));

    await waitFor(() => {
      expect(screen.getByText('priceOverrideConfirmTitle')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('priceOverrideConfirmCta'));

    await waitFor(() => expect(mockSellAsset).toHaveBeenCalledTimes(2));
    const first = mockSellAsset.mock.calls[0][0] as { idempotencyKey: string };
    const second = mockSellAsset.mock.calls[1][0] as {
      idempotencyKey: string;
      allowPriceOverride: boolean;
    };
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(second.allowPriceOverride).toBe(true);
  });

  it('should show unexpected error when sellAsset throws', async () => {
    useUIStore.getState().openModal('sell-asset');
    mockSellAsset.mockRejectedValue(new Error('network'));

    render(<SellAssetModal holding={holding} currency="USD" dictionary={dictionary} />);

    expect(await screen.findByLabelText('quantity')).toBeInTheDocument();
    await flushRaf();
    fireEvent.change(screen.getByLabelText('quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('confirmSell'));

    await waitFor(() => {
      expect(screen.getByText('unexpectedError')).toBeInTheDocument();
    });
  });

  it('should close the dialog via the close button', async () => {
    useUIStore.getState().openModal('sell-asset');
    const { container } = render(
      <SellAssetModal holding={holding} currency="USD" dictionary={dictionary} />
    );
    expect(await screen.findByText('sellAsset')).toBeInTheDocument();

    const dialog = container.querySelector('dialog')!;
    const closeButtons = screen.getAllByLabelText('Close');
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    await waitFor(() => {
      expect(dialog).not.toHaveAttribute('open');
    });
  });
});
