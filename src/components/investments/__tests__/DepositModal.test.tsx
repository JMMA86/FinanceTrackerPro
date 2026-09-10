/**
 * DepositModal Component Tests
 *
 * Modal opened via `useUIStore.getState().openModal('deposit-investment')`.
 * Uses the real Zustand store; actions are mocked:
 *   - getInvestmentAccounts, depositToInvestment, getCurrentExchangeRate (investment.actions)
 *   - getBankAccounts (account.actions)
 *
 * The account pickers are the shared AccountSelect combobox (WAI-ARIA APG:
 * button role="combobox" + listbox/option), not native <select> elements.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DepositModal } from '../DepositModal';
import { useUIStore } from '@/store/ui.store';

// ============================================================================
// Mocks
// ============================================================================

const mockDepositToInvestment = vi.fn();
const mockGetInvestmentAccounts = vi.fn();
const mockGetBankAccounts = vi.fn();
const mockGetCurrentExchangeRate = vi.fn();

vi.mock('@/actions/investment.actions', () => ({
  depositToInvestment: (...args: unknown[]) => mockDepositToInvestment(...args),
  getInvestmentAccounts: (...args: unknown[]) => mockGetInvestmentAccounts(...args),
  getCurrentExchangeRate: (...args: unknown[]) => mockGetCurrentExchangeRate(...args),
}));

vi.mock('@/actions/account.actions', () => ({
  getBankAccounts: (...args: unknown[]) => mockGetBankAccounts(...args),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_d: Record<string, unknown>, key: string) => key),
}));

// Keep the real Decimal.js helpers (divideCents) so the estimated receive and
// the modal math stay exact; only formatMoney is stubbed.
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

// Wait for any pending requestAnimationFrame callback to run. The DepositModal
// schedules a rAF callback on open that resets amount/exchange rate/submitError
// and the FX auto-prefill effect also runs via rAF.
const flushRaf = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

describe('DepositModal', () => {
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
    {
      id: 'bank-2',
      name: 'Savings COP',
      type: 'SAVINGS',
      currency: 'COP',
      balanceCents: 2000000,
      interestRateEA: 2,
      parentAccountId: null,
      cardColor: null,
      cardNetwork: null,
      createdAt: new Date('2024-01-02'),
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
    const { container } = render(<DepositModal dictionary={dictionary} />);
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).not.toHaveAttribute('open');
  });

  it('should open and show the deposit title', async () => {
    useUIStore.getState().openModal('deposit-investment');
    const { container } = render(<DepositModal dictionary={dictionary} />);
    const dialog = container.querySelector('dialog');
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAttribute('aria-labelledby', 'deposit-investment-title');
    await waitFor(() => {
      expect(screen.getByText('depositTitle')).toBeInTheDocument();
    });
  });

  it('should show loading state while accounts are being fetched', () => {
    useUIStore.getState().openModal('deposit-investment');
    mockGetInvestmentAccounts.mockImplementation(() => new Promise(() => {}));
    mockGetBankAccounts.mockImplementation(() => new Promise(() => {}));

    render(<DepositModal dictionary={dictionary} />);
    expect(screen.getByText('loadingAccounts')).toBeInTheDocument();
  });

  it('should load bank and investment accounts into the comboboxes', async () => {
    useUIStore.getState().openModal('deposit-investment');
    render(<DepositModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(mockGetInvestmentAccounts).toHaveBeenCalled();
      expect(mockGetBankAccounts).toHaveBeenCalled();
    });

    // Let the modalSession rAF remount settle before interacting with the
    // comboboxes (avoids a race where the click lands on a stale button).
    await flushRaf();

    // Both pickers auto-select the first account of each group.
    await waitFor(() => {
      expect(screen.getByLabelText('fromAccount')).toHaveTextContent('Checking COP');
      expect(screen.getByLabelText('toAccount')).toHaveTextContent('USD Growth');
    });

    // Open the bank combobox and verify both options are listed.
    fireEvent.click(screen.getByLabelText('fromAccount'));
    await waitFor(() => {
      const options = screen.getAllByRole('option');
      const labels = options.map((o) => o.textContent ?? '');
      expect(labels.some((t) => t.includes('Checking COP'))).toBe(true);
      expect(labels.some((t) => t.includes('Savings COP'))).toBe(true);
    });

    // Open the investment combobox and verify both options are listed.
    fireEvent.click(screen.getByLabelText('toAccount'));
    await waitFor(() => {
      const options = screen.getAllByRole('option');
      const labels = options.map((o) => o.textContent ?? '');
      expect(labels.some((t) => t.includes('USD Growth'))).toBe(true);
      expect(labels.some((t) => t.includes('EUR Value'))).toBe(true);
    });
  });

  it('should show a message when no COP bank accounts are available', async () => {
    useUIStore.getState().openModal('deposit-investment');
    mockGetBankAccounts.mockResolvedValue({
      success: true,
      data: [{ ...bankAccounts[0], currency: 'USD' }],
    });

    render(<DepositModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByText('noBankAccountsCOP')).toBeInTheDocument();
    });
  });

  it('should keep the form working when account loading fails silently', async () => {
    useUIStore.getState().openModal('deposit-investment');
    mockGetInvestmentAccounts.mockRejectedValue(new Error('boom'));
    mockGetBankAccounts.mockRejectedValue(new Error('boom'));

    render(<DepositModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByText('noBankAccountsCOP')).toBeInTheDocument();
    });
    expect(screen.queryByText('loadingAccounts')).not.toBeInTheDocument();
  });

  it('should prefill the investment account from modalData.accountId', async () => {
    useUIStore.getState().openModal('deposit-investment', { accountId: 'inv-2' });
    render(<DepositModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByLabelText('toAccount')).toHaveTextContent('EUR Value');
    });
  });

  it('should show validation error when amount is zero', async () => {
    useUIStore.getState().openModal('deposit-investment');
    const { container } = render(<DepositModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByText('deposit')).toBeInTheDocument();
    });
    await flushRaf();

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('amountPositive')).toBeInTheDocument();
    });
  });

  it('should show validation error when exchange rate is not positive', async () => {
    useUIStore.getState().openModal('deposit-investment');
    const { container } = render(<DepositModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByTestId('numeric-input-dep-amount')).toBeInTheDocument();
    });
    // Wait for the live-rate auto-prefill so we can reliably override it.
    await waitFor(() => {
      expect(screen.getByLabelText('exchangeRate')).toHaveValue(4000);
    });

    fireEvent.change(screen.getByTestId('numeric-input-dep-amount'), {
      target: { value: '3900000' },
    });
    fireEvent.change(screen.getByLabelText('exchangeRate'), { target: { value: '0' } });

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('ratePositive')).toBeInTheDocument();
    });
  });

  it('should prefill the exchange rate from the live FX service', async () => {
    useUIStore.getState().openModal('deposit-investment');
    render(<DepositModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByTestId('numeric-input-dep-amount')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByLabelText('exchangeRate')).toHaveValue(4000);
    });
    expect(mockGetCurrentExchangeRate).toHaveBeenCalledWith({ currency: 'USD' });
    expect(screen.getByText('liveRate')).toBeInTheDocument();
  });

  it('should show the estimated receive amount when amount and rate are set', async () => {
    useUIStore.getState().openModal('deposit-investment');
    render(<DepositModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByTestId('numeric-input-dep-amount')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByLabelText('exchangeRate')).toHaveValue(4000);
    });

    fireEvent.change(screen.getByTestId('numeric-input-dep-amount'), {
      target: { value: '4000000' },
    });

    await waitFor(() => {
      expect(screen.getByText('estimatedReceive')).toBeInTheDocument();
      // 4000000 COP / 4000 = 1000 cents USD
      expect(screen.getByText('$10.00 USD')).toBeInTheDocument();
    });
  });

  it('should call depositToInvestment with correct data and close on success', async () => {
    useUIStore.getState().openModal('deposit-investment');
    mockDepositToInvestment.mockResolvedValue({ success: true });

    const { container } = render(<DepositModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByTestId('numeric-input-dep-amount')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByLabelText('exchangeRate')).toHaveValue(4000);
    });

    fireEvent.change(screen.getByTestId('numeric-input-dep-amount'), {
      target: { value: '4000000' },
    });

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockDepositToInvestment).toHaveBeenCalledWith(
        expect.objectContaining({
          investmentAccountId: 'inv-1',
          fromBankAccountId: 'bank-1',
          amountCents: 4000000,
          exchangeRate: 4000,
        })
      );
    });

    await waitFor(() => {
      expect(
        useUIStore.getState().notifications.some((n) => n.message === 'depositCompleted')
      ).toBe(true);
      expect(useUIStore.getState().activeModal).toBeNull();
    });
  });

  it('should show session invalid error', async () => {
    useUIStore.getState().openModal('deposit-investment');
    mockDepositToInvestment.mockResolvedValue({
      success: false,
      code: 'SESSION_INVALID',
      error: 'bad session',
    });

    const { container } = render(<DepositModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByTestId('numeric-input-dep-amount')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByLabelText('exchangeRate')).toHaveValue(4000);
    });
    fireEvent.change(screen.getByTestId('numeric-input-dep-amount'), {
      target: { value: '4000000' },
    });

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('errors.sessionInvalid')).toBeInTheDocument();
    });
  });

  it('should map RATE_MISMATCH errors to errors.rateMismatch', async () => {
    useUIStore.getState().openModal('deposit-investment');
    mockDepositToInvestment.mockResolvedValue({
      success: false,
      code: 'RATE_MISMATCH',
      error: 'Exchange rate has moved significantly.',
    });

    const { container } = render(<DepositModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByTestId('numeric-input-dep-amount')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByLabelText('exchangeRate')).toHaveValue(4000);
    });
    fireEvent.change(screen.getByTestId('numeric-input-dep-amount'), {
      target: { value: '4000000' },
    });

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('errors.rateMismatch')).toBeInTheDocument();
    });
  });

  it('should map INSUFFICIENT_FUNDS errors to errors.insufficientFunds', async () => {
    useUIStore.getState().openModal('deposit-investment');
    mockDepositToInvestment.mockResolvedValue({
      success: false,
      code: 'INSUFFICIENT_FUNDS',
      error: 'Insufficient funds',
    });

    const { container } = render(<DepositModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByTestId('numeric-input-dep-amount')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByLabelText('exchangeRate')).toHaveValue(4000);
    });
    fireEvent.change(screen.getByTestId('numeric-input-dep-amount'), {
      target: { value: '4000000' },
    });

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('errors.insufficientFunds')).toBeInTheDocument();
    });
  });

  it('should show generic deposit error', async () => {
    useUIStore.getState().openModal('deposit-investment');
    mockDepositToInvestment.mockResolvedValue({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'nope',
    });

    const { container } = render(<DepositModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByTestId('numeric-input-dep-amount')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByLabelText('exchangeRate')).toHaveValue(4000);
    });
    fireEvent.change(screen.getByTestId('numeric-input-dep-amount'), {
      target: { value: '4000000' },
    });

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('errors.depositFailed')).toBeInTheDocument();
    });
  });

  it('should close the dialog via the close button', async () => {
    useUIStore.getState().openModal('deposit-investment');
    const { container } = render(<DepositModal dictionary={dictionary} />);
    expect(await screen.findByText('depositTitle')).toBeInTheDocument();

    const dialog = container.querySelector('dialog')!;
    const closeButtons = screen.getAllByLabelText('Close');
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    await waitFor(() => {
      expect(dialog).not.toHaveAttribute('open');
    });
  });
});
