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

vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn((cents: number, currency: string) => {
    const sign = cents < 0 ? '-' : '';
    return `${sign}$${(Math.abs(cents) / 100).toFixed(2)} ${currency}`;
  }),
}));

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
      expect(screen.getByText('10.0000 shares · Avg $140.00 USD')).toBeInTheDocument();
    });
  });

  it('should prefill the price with the holding current price', async () => {
    useUIStore.getState().openModal('sell-asset');
    render(<SellAssetModal holding={holding} currency="USD" dictionary={dictionary} />);

    expect(await screen.findByLabelText('pricePerShare')).toBeInTheDocument();
    await flushRaf();
    await waitFor(() => {
      // jsdom reports number inputs as numeric values
      expect(screen.getByLabelText('pricePerShare')).toHaveValue(150);
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
      expect(screen.getByText('You only have 10.0000 shares to sell.')).toBeInTheDocument();
    });
  });

  it('should show the total proceeds when quantity is set', async () => {
    useUIStore.getState().openModal('sell-asset');
    render(<SellAssetModal holding={holding} currency="USD" dictionary={dictionary} />);

    expect(await screen.findByLabelText('quantity')).toBeInTheDocument();
    await flushRaf();
    fireEvent.change(screen.getByLabelText('quantity'), { target: { value: '2' } });

    await waitFor(() => {
      expect(screen.getByText('Total proceeds')).toBeInTheDocument();
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
    await waitFor(() => expect(screen.getByLabelText('pricePerShare')).toHaveValue(150));

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
      expect(useUIStore.getState().notifications.some((n) => n.message === 'Sold 2 AAPL')).toBe(
        true
      );
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

  it('should show generic sell error', async () => {
    useUIStore.getState().openModal('sell-asset');
    mockSellAsset.mockResolvedValue({ success: false, code: 'VALIDATION_ERROR', error: 'no' });

    render(<SellAssetModal holding={holding} currency="USD" dictionary={dictionary} />);

    expect(await screen.findByLabelText('quantity')).toBeInTheDocument();
    await flushRaf();
    fireEvent.change(screen.getByLabelText('quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('confirmSell'));

    await waitFor(() => {
      expect(screen.getByText('errors.sellFailed')).toBeInTheDocument();
    });
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
      expect(screen.getByText('Unexpected error')).toBeInTheDocument();
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
