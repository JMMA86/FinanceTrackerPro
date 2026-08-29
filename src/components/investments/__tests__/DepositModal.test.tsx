/**
 * DepositModal Component Tests
 *
 * Modal opened via `useUIStore.getState().openModal('deposit-investment')`.
 * Uses the real Zustand store; actions are mocked:
 *   - getInvestmentAccounts, depositToInvestment (investment.actions)
 *   - getBankAccounts (account.actions)
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

vi.mock('@/actions/investment.actions', () => ({
  depositToInvestment: (...args: unknown[]) => mockDepositToInvestment(...args),
  getInvestmentAccounts: (...args: unknown[]) => mockGetInvestmentAccounts(...args),
}));

vi.mock('@/actions/account.actions', () => ({
  getBankAccounts: (...args: unknown[]) => mockGetBankAccounts(...args),
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
// schedules a rAF callback on open that resets amount/exchange rate/submitError,
// so interactions must wait for it to avoid race conditions.
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
    expect(screen.getByText('Loading accounts...')).toBeInTheDocument();
  });

  it('should load bank and investment accounts into the selects', async () => {
    useUIStore.getState().openModal('deposit-investment');
    render(<DepositModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(mockGetInvestmentAccounts).toHaveBeenCalled();
      expect(mockGetBankAccounts).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText('Checking COP — $10000.00 COP')).toBeInTheDocument();
      expect(screen.getByText('Savings COP — $20000.00 COP')).toBeInTheDocument();
      expect(screen.getByText('USD Growth (USD)')).toBeInTheDocument();
      expect(screen.getByText('EUR Value (EUR)')).toBeInTheDocument();
    });

    // First accounts auto-selected
    const fromSelect = screen.getByLabelText('fromAccount') as HTMLSelectElement;
    const toSelect = screen.getByLabelText('toAccount') as HTMLSelectElement;
    expect(fromSelect.value).toBe('bank-1');
    expect(toSelect.value).toBe('inv-1');
  });

  it('should show a message when no COP bank accounts are available', async () => {
    useUIStore.getState().openModal('deposit-investment');
    mockGetBankAccounts.mockResolvedValue({
      success: true,
      data: [{ ...bankAccounts[0], currency: 'USD' }],
    });

    render(<DepositModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByText('No bank accounts available in COP.')).toBeInTheDocument();
    });
  });

  it('should keep the form working when account loading fails silently', async () => {
    useUIStore.getState().openModal('deposit-investment');
    mockGetInvestmentAccounts.mockRejectedValue(new Error('boom'));
    mockGetBankAccounts.mockRejectedValue(new Error('boom'));

    render(<DepositModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByText('No bank accounts available in COP.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Loading accounts...')).not.toBeInTheDocument();
  });

  it('should prefill the investment account from modalData.accountId', async () => {
    useUIStore.getState().openModal('deposit-investment', { accountId: 'inv-2' });
    render(<DepositModal dictionary={dictionary} />);

    await waitFor(() => {
      const toSelect = screen.getByLabelText('toAccount') as HTMLSelectElement;
      expect(toSelect.value).toBe('inv-2');
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
      expect(screen.getByText('Amount must be greater than 0.')).toBeInTheDocument();
    });
  });

  it('should show validation error when exchange rate is not positive', async () => {
    useUIStore.getState().openModal('deposit-investment');
    const { container } = render(<DepositModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByTestId('numeric-input-dep-amount')).toBeInTheDocument();
    });
    await flushRaf();

    fireEvent.change(screen.getByTestId('numeric-input-dep-amount'), {
      target: { value: '3900000' },
    });
    fireEvent.change(screen.getByLabelText('exchangeRate'), { target: { value: '0' } });

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Exchange rate must be positive.')).toBeInTheDocument();
    });
  });

  it('should show the estimated receive amount when amount and rate are set', async () => {
    useUIStore.getState().openModal('deposit-investment');
    render(<DepositModal dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByTestId('numeric-input-dep-amount')).toBeInTheDocument();
    });
    await flushRaf();

    fireEvent.change(screen.getByTestId('numeric-input-dep-amount'), {
      target: { value: '3900000' },
    });

    await waitFor(() => {
      expect(screen.getByText('estimatedReceive')).toBeInTheDocument();
      // 3900000 COP / 3900 = 1000 cents USD
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
    await flushRaf();

    fireEvent.change(screen.getByTestId('numeric-input-dep-amount'), {
      target: { value: '3900000' },
    });

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockDepositToInvestment).toHaveBeenCalledWith(
        expect.objectContaining({
          investmentAccountId: 'inv-1',
          fromBankAccountId: 'bank-1',
          amountCents: 3900000,
          exchangeRate: 3900,
        })
      );
    });

    await waitFor(() => {
      expect(
        useUIStore
          .getState()
          .notifications.some((n) => n.message === 'Deposit completed successfully')
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
    await flushRaf();
    fireEvent.change(screen.getByTestId('numeric-input-dep-amount'), {
      target: { value: '3900000' },
    });

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('errors.sessionInvalid')).toBeInTheDocument();
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
    await flushRaf();
    fireEvent.change(screen.getByTestId('numeric-input-dep-amount'), {
      target: { value: '3900000' },
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
