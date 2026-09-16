/**
 * WithdrawModal Component Tests
 *
 * Modal opened via `useUIStore.getState().openModal('withdraw-investment')`.
 * Uses the real Zustand store; actions are mocked:
 *   - withdrawFromInvestment, getInvestmentAccounts, getCurrentExchangeRate (investment.actions)
 *   - getBankAccounts (account.actions)
 *
 * Account pickers use the shared AccountSelect combobox (role="combobox").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WithdrawModal } from '../WithdrawModal';
import { useUIStore } from '@/store/ui.store';

// ============================================================================
// Mocks
// ============================================================================

const mockWithdrawFromInvestment = vi.fn();
const mockGetInvestmentAccounts = vi.fn();
const mockGetBankAccounts = vi.fn();
const mockGetCurrentExchangeRate = vi.fn();

vi.mock('@/actions/investment.actions', () => ({
  withdrawFromInvestment: (...args: unknown[]) => mockWithdrawFromInvestment(...args),
  getInvestmentAccounts: (...args: unknown[]) => mockGetInvestmentAccounts(...args),
  getCurrentExchangeRate: (...args: unknown[]) => mockGetCurrentExchangeRate(...args),
}));

vi.mock('@/actions/account.actions', () => ({
  getBankAccounts: (...args: unknown[]) => mockGetBankAccounts(...args),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_d: Record<string, unknown>, key: string) => key),
}));

// Keep the real Decimal.js helpers (multiplyCents) for the COP estimate.
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

vi.mock('@/components/ui/FormattedNumericInput', () => ({
  FormattedNumericInput: ({
    id,
    value,
    onChange,
    'aria-invalid': ariaInvalid,
    className,
  }: {
    id?: string;
    value: number;
    onChange: (v: number) => void;
    'aria-invalid'?: boolean;
    className?: string;
  }) => (
    <input
      id={id}
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      data-testid={`numeric-input-${id}`}
      aria-invalid={ariaInvalid}
      className={className}
    />
  ),
}));

const flushRaf = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

describe('WithdrawModal', () => {
  const investmentAccounts = [
    {
      id: 'inv-1',
      name: 'USD Growth',
      currency: 'USD',
      balanceCents: 50000,
      assetHoldings: [],
      createdAt: new Date('2024-01-01'),
    },
    {
      id: 'inv-2',
      name: 'EUR Value',
      currency: 'EUR',
      balanceCents: 30000,
      assetHoldings: [],
      createdAt: new Date('2024-01-02'),
    },
  ];

  const bankAccounts = [
    {
      id: 'bank-1',
      name: 'Checking COP',
      type: 'CHECKING',
      currency: 'COP',
      balanceCents: 1000000,
      interestRateEA: null,
      parentAccountId: null,
      cardColor: null,
      cardNetwork: null,
      createdAt: new Date('2024-01-01'),
      transactions: [],
    },
  ];

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
    mockGetInvestmentAccounts.mockResolvedValue({ success: true, data: investmentAccounts });
    mockGetBankAccounts.mockResolvedValue({ success: true, data: bankAccounts });
    mockGetCurrentExchangeRate.mockResolvedValue({
      success: true,
      data: { rate: 4000, currency: 'USD', source: 'live' },
    });
  });

  it('should render a closed dialog when the modal is not active', () => {
    const { container } = render(<WithdrawModal dictionary={dictionary} />);
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).not.toHaveAttribute('open');
  });

  it('should open and show the withdraw title', async () => {
    useUIStore.getState().openModal('withdraw-investment');
    const { container } = render(<WithdrawModal dictionary={dictionary} />);
    const dialog = container.querySelector('dialog');
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAttribute('aria-labelledby', 'withdraw-investment-title');
    await waitFor(() => {
      expect(screen.getByText('withdrawTitle')).toBeInTheDocument();
    });
  });

  it('should load accounts into the comboboxes and auto-select the first ones', async () => {
    useUIStore.getState().openModal('withdraw-investment');
    render(<WithdrawModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(mockGetInvestmentAccounts).toHaveBeenCalled();
      expect(mockGetBankAccounts).toHaveBeenCalled();
    });

    // Source investment account (from) and destination bank (to) are selected.
    await waitFor(() => {
      expect(screen.getByLabelText('toAccount')).toHaveTextContent('USD Growth');
      expect(screen.getByLabelText('fromAccount')).toHaveTextContent('Checking COP');
    });
  });

  it('should prefill the investment account from modalData.accountId', async () => {
    useUIStore.getState().openModal('withdraw-investment', { accountId: 'inv-2' });
    render(<WithdrawModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByLabelText('toAccount')).toHaveTextContent('EUR Value');
    });
  });

  it('should prefill the exchange rate from the live FX service', async () => {
    useUIStore.getState().openModal('withdraw-investment');
    render(<WithdrawModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByLabelText('exchangeRate')).toHaveValue(4000);
    });
    expect(mockGetCurrentExchangeRate).toHaveBeenCalledWith({ currency: 'USD' });
    expect(screen.getByText('liveRate')).toBeInTheDocument();
  });

  it('should show the estimated COP amount when amount and rate are set', async () => {
    useUIStore.getState().openModal('withdraw-investment');
    render(<WithdrawModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByTestId('numeric-input-wd-amount')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByLabelText('exchangeRate')).toHaveValue(4000);
    });

    fireEvent.change(screen.getByTestId('numeric-input-wd-amount'), {
      target: { value: '10000' },
    });

    await waitFor(() => {
      expect(screen.getByText('estimatedReceiveCOP')).toBeInTheDocument();
      // 10000 USD-cents * 4000 = 40000000 COP-cents = $400000.00 COP
      expect(screen.getByText('$400000.00 COP')).toBeInTheDocument();
    });
  });

  it('should show validation error when amount is zero', async () => {
    useUIStore.getState().openModal('withdraw-investment');
    const { container } = render(<WithdrawModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByText('withdraw')).toBeInTheDocument();
    });
    await flushRaf();

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('amountPositive')).toBeInTheDocument();
    });
  });

  it('should call withdrawFromInvestment with correct data and close on success', async () => {
    useUIStore.getState().openModal('withdraw-investment');
    mockWithdrawFromInvestment.mockResolvedValue({ success: true });

    const { container } = render(<WithdrawModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByTestId('numeric-input-wd-amount')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByLabelText('exchangeRate')).toHaveValue(4000);
    });

    fireEvent.change(screen.getByTestId('numeric-input-wd-amount'), {
      target: { value: '10000' },
    });

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockWithdrawFromInvestment).toHaveBeenCalledWith(
        expect.objectContaining({
          investmentAccountId: 'inv-1',
          toBankAccountId: 'bank-1',
          amountCents: 10000,
          exchangeRate: 4000,
        })
      );
    });

    await waitFor(() => {
      expect(useUIStore.getState().notifications.some((n) => n.message === 'withdraw')).toBe(true);
      expect(useUIStore.getState().activeModal).toBeNull();
    });
  });

  it('should map RATE_MISMATCH errors to errors.rateMismatch', async () => {
    useUIStore.getState().openModal('withdraw-investment');
    mockWithdrawFromInvestment.mockResolvedValue({
      success: false,
      code: 'RATE_MISMATCH',
      error: 'Exchange rate has moved significantly.',
    });

    const { container } = render(<WithdrawModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByTestId('numeric-input-wd-amount')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByLabelText('exchangeRate')).toHaveValue(4000);
    });
    fireEvent.change(screen.getByTestId('numeric-input-wd-amount'), {
      target: { value: '10000' },
    });

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('errors.rateMismatch')).toBeInTheDocument();
    });
  });

  it('should show the withdrawal-specific generic error fallback', async () => {
    useUIStore.getState().openModal('withdraw-investment');
    mockWithdrawFromInvestment.mockResolvedValue({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'nope',
    });

    const { container } = render(<WithdrawModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByTestId('numeric-input-wd-amount')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByLabelText('exchangeRate')).toHaveValue(4000);
    });
    fireEvent.change(screen.getByTestId('numeric-input-wd-amount'), {
      target: { value: '10000' },
    });

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('errors.withdrawFailed')).toBeInTheDocument();
    });
  });

  it('should close the dialog via the close button', async () => {
    useUIStore.getState().openModal('withdraw-investment');
    const { container } = render(<WithdrawModal dictionary={dictionary} />);
    expect(await screen.findByText('withdrawTitle')).toBeInTheDocument();

    const dialog = container.querySelector('dialog')!;
    const closeButtons = screen.getAllByLabelText('Close');
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    await waitFor(() => {
      expect(dialog).not.toHaveAttribute('open');
    });
  });
});
