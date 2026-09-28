/**
 * EditInvestmentTradeModal + ReverseInvestmentTradeDialog component tests.
 *
 * Renders the trade editor with a persisted transaction row, verifies the
 * pre-fill, the submission payload to `updateInvestmentTrade`, error mapping and
 * the reverse confirmation dialog.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import {
  EditInvestmentTradeModal,
  ReverseInvestmentTradeDialog,
  type InvestmentTransactionRow,
} from '../EditInvestmentTradeModal';
import { useUIStore } from '@/store/ui.store';

// ============================================================================
// Mocks
// ============================================================================

const mockUpdateInvestmentTrade = vi.fn();
const mockReverseInvestmentTrade = vi.fn();

vi.mock('@/actions/investment.actions', () => ({
  updateInvestmentTrade: (...args: unknown[]) => mockUpdateInvestmentTrade(...args),
  reverseInvestmentTrade: (...args: unknown[]) => mockReverseInvestmentTrade(...args),
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

const flushRaf = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

describe('EditInvestmentTradeModal', () => {
  const buyRow: InvestmentTransactionRow = {
    id: 't-buy',
    type: 'INVESTMENT',
    amountCents: -75000,
    currency: 'USD',
    description: 'Buy 5 AAPL',
    date: new Date('2024-03-01T10:00:00'),
    assetSymbol: 'AAPL',
    assetQuantity: 5,
    assetPricePerShareCents: 15000,
    assetTradeType: 'BUY',
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

  it('should render a closed dialog (without the form) when transaction is null', () => {
    const { container } = render(
      <EditInvestmentTradeModal
        transaction={null}
        dictionary={dictionary}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).not.toHaveAttribute('open');
    expect(screen.queryByLabelText('quantity')).not.toBeInTheDocument();
  });

  it('should prefill the form from the trade and show the symbol/type', async () => {
    render(
      <EditInvestmentTradeModal
        transaction={buyRow}
        dictionary={dictionary}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(await screen.findByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('buyLabel')).toBeInTheDocument();

    await flushRaf();
    await waitFor(() => {
      expect(screen.getByLabelText('quantity')).toHaveValue('5');
      expect(screen.getByLabelText('pricePerShare')).toHaveValue('150,00');
      // base cost = 5 * 15000 = 75000 → "750,00"
      expect(screen.getByLabelText('baseCost')).toHaveValue('750,00');
      expect(screen.getByLabelText('tradeDescriptionOptional')).toHaveValue('Buy 5 AAPL');
    });
  });

  it('should recouple the price when the base cost is edited', async () => {
    render(
      <EditInvestmentTradeModal
        transaction={buyRow}
        dictionary={dictionary}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await flushRaf();
    await waitFor(() => expect(screen.getByLabelText('baseCost')).toHaveValue('750,00'));

    const baseCost = screen.getByLabelText('baseCost');
    for (let i = 0; i < 6; i++) fireEvent.keyDown(baseCost, { key: 'Backspace' });
    for (const key of ['8', '0', '0', '0', '0']) fireEvent.keyDown(baseCost, { key });

    // price = 80000 / 5 = 16000 cents → "160,00"
    await waitFor(() => {
      expect(baseCost).toHaveValue('800,00');
      expect(screen.getByLabelText('pricePerShare')).toHaveValue('160,00');
    });
  });

  it('should recouple the base cost when the price is edited', async () => {
    render(
      <EditInvestmentTradeModal
        transaction={buyRow}
        dictionary={dictionary}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await flushRaf();
    await waitFor(() => expect(screen.getByLabelText('pricePerShare')).toHaveValue('150,00'));

    const price = screen.getByLabelText('pricePerShare');
    for (let i = 0; i < 6; i++) fireEvent.keyDown(price, { key: 'Backspace' });
    for (const key of ['1', '0', '0', '0', '0']) fireEvent.keyDown(price, { key });

    // base = 100,00 * 5 = 500,00
    await waitFor(() => {
      expect(price).toHaveValue('100,00');
      expect(screen.getByLabelText('baseCost')).toHaveValue('500,00');
    });
  });

  it('should submit an edited date', async () => {
    mockUpdateInvestmentTrade.mockResolvedValue({ success: true });

    render(
      <EditInvestmentTradeModal
        transaction={buyRow}
        dictionary={dictionary}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await flushRaf();
    expect(await screen.findByLabelText('tradeDate')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('tradeDate'), { target: { value: '2024-04-05T09:30' } });
    fireEvent.click(screen.getByText('saveChanges'));

    await waitFor(() => {
      expect(mockUpdateInvestmentTrade).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: 't-buy' })
      );
    });
    const arg = mockUpdateInvestmentTrade.mock.calls[0][0] as { date: Date };
    expect(arg.date).toBeInstanceOf(Date);
  });

  it('should reject a non-positive price without calling the action', async () => {
    render(
      <EditInvestmentTradeModal
        transaction={buyRow}
        dictionary={dictionary}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await flushRaf();
    await waitFor(() => expect(screen.getByLabelText('pricePerShare')).toHaveValue('150,00'));
    const price = screen.getByLabelText('pricePerShare');
    for (let i = 0; i < 6; i++) fireEvent.keyDown(price, { key: 'Backspace' });
    fireEvent.click(screen.getByText('saveChanges'));

    expect(await screen.findByText('pricePositive')).toBeInTheDocument();
    expect(mockUpdateInvestmentTrade).not.toHaveBeenCalled();
  });

  it('should submit the edited trade via updateInvestmentTrade', async () => {
    mockUpdateInvestmentTrade.mockResolvedValue({ success: true });
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <EditInvestmentTradeModal
        transaction={buyRow}
        dictionary={dictionary}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    await flushRaf();
    await waitFor(() => expect(screen.getByLabelText('quantity')).toHaveValue('5'));

    fireEvent.change(screen.getByLabelText('quantity'), { target: { value: '8' } });
    fireEvent.click(screen.getByText('saveChanges'));

    await waitFor(() => {
      expect(mockUpdateInvestmentTrade).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: 't-buy',
          quantity: '8',
          pricePerShareCents: 15000,
        })
      );
    });

    await waitFor(() => {
      expect(useUIStore.getState().notifications.some((n) => n.message === 'tradeUpdated')).toBe(
        true
      );
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('should map VALIDATION_ERROR to the invalid quantity message', async () => {
    mockUpdateInvestmentTrade.mockResolvedValue({ success: false, code: 'VALIDATION_ERROR' });

    render(
      <EditInvestmentTradeModal
        transaction={buyRow}
        dictionary={dictionary}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await flushRaf();
    await waitFor(() => expect(screen.getByLabelText('quantity')).toHaveValue('5'));
    fireEvent.click(screen.getByText('saveChanges'));

    await waitFor(() => {
      expect(screen.getByText('errors.invalidQuantity')).toBeInTheDocument();
    });
  });

  it('should map INVESTMENT_LEDGER_INCOMPLETE to its message', async () => {
    mockUpdateInvestmentTrade.mockResolvedValue({
      success: false,
      code: 'INVESTMENT_LEDGER_INCOMPLETE',
    });

    render(
      <EditInvestmentTradeModal
        transaction={buyRow}
        dictionary={dictionary}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await flushRaf();
    await waitFor(() => expect(screen.getByLabelText('quantity')).toHaveValue('5'));
    fireEvent.click(screen.getByText('saveChanges'));

    await waitFor(() => {
      expect(screen.getByText('errors.investmentLedgerIncomplete')).toBeInTheDocument();
    });
  });

  it('should reject a quantity above maxQuantity without calling the action', async () => {
    render(
      <EditInvestmentTradeModal
        transaction={buyRow}
        dictionary={dictionary}
        maxQuantity={6}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await flushRaf();
    await waitFor(() => expect(screen.getByLabelText('quantity')).toHaveValue('5'));
    fireEvent.change(screen.getByLabelText('quantity'), { target: { value: '10' } });
    fireEvent.click(screen.getByText('saveChanges'));

    await waitFor(() => {
      expect(screen.getByText('maxQuantity')).toBeInTheDocument();
    });
    expect(mockUpdateInvestmentTrade).not.toHaveBeenCalled();
  });

  it('should show an unexpected error when the action throws', async () => {
    mockUpdateInvestmentTrade.mockRejectedValue(new Error('network'));

    render(
      <EditInvestmentTradeModal
        transaction={buyRow}
        dictionary={dictionary}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await flushRaf();
    await waitFor(() => expect(screen.getByLabelText('quantity')).toHaveValue('5'));
    fireEvent.click(screen.getByText('saveChanges'));

    await waitFor(() => {
      expect(screen.getByText('unexpectedError')).toBeInTheDocument();
    });
  });

  it('should ask for confirmation on PRICE_MISMATCH and retry with allowPriceOverride', async () => {
    mockUpdateInvestmentTrade
      .mockResolvedValueOnce({ success: false, code: 'PRICE_MISMATCH' })
      .mockResolvedValueOnce({ success: true });

    render(
      <EditInvestmentTradeModal
        transaction={buyRow}
        dictionary={dictionary}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await flushRaf();
    await waitFor(() => expect(screen.getByLabelText('quantity')).toHaveValue('5'));
    fireEvent.click(screen.getByText('saveChanges'));

    await waitFor(() => {
      expect(screen.getByText('priceOverrideConfirmTitle')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('priceOverrideConfirmCta'));

    await waitFor(() => {
      expect(mockUpdateInvestmentTrade).toHaveBeenCalledTimes(2);
      expect(mockUpdateInvestmentTrade).toHaveBeenLastCalledWith(
        expect.objectContaining({ allowPriceOverride: true })
      );
    });
  });
});

describe('ReverseInvestmentTradeDialog', () => {
  const sellRow: InvestmentTransactionRow = {
    id: 't-sell',
    type: 'INVESTMENT',
    amountCents: 75000,
    currency: 'USD',
    description: 'Sell 5 AAPL',
    date: new Date('2024-03-02T10:00:00'),
    assetSymbol: 'AAPL',
    assetQuantity: 5,
    assetPricePerShareCents: 15000,
    assetTradeType: 'SELL',
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

  it('should render a closed dialog when transaction is null', () => {
    const { container } = render(
      <ReverseInvestmentTradeDialog
        transaction={null}
        dictionary={dictionary}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).not.toHaveAttribute('open');
    expect(screen.queryByText('reverseTradeCta')).not.toBeInTheDocument();
  });

  it('should confirm and call reverseInvestmentTrade', async () => {
    mockReverseInvestmentTrade.mockResolvedValue({ success: true });
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <ReverseInvestmentTradeDialog
        transaction={sellRow}
        dictionary={dictionary}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    fireEvent.click(await screen.findByText('reverseTradeCta'));

    await waitFor(() => {
      expect(mockReverseInvestmentTrade).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: 't-sell' })
      );
    });
    await waitFor(() => {
      expect(useUIStore.getState().notifications.some((n) => n.message === 'tradeReversed')).toBe(
        true
      );
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('should show a specific error when the reverse fails', async () => {
    mockReverseInvestmentTrade.mockResolvedValue({
      success: false,
      code: 'INVESTMENT_LEDGER_INCOMPLETE',
    });

    render(
      <ReverseInvestmentTradeDialog
        transaction={sellRow}
        dictionary={dictionary}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByText('reverseTradeCta'));

    await waitFor(() => {
      expect(screen.getByText('errors.investmentLedgerIncomplete')).toBeInTheDocument();
    });
  });
});
