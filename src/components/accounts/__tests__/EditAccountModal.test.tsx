/**
 * EditAccountModal Component Tests
 *
 * Uses the REAL Zustand UI store. The modal is opened via
 * `useUIStore.getState().openModal('edit-account', { accountId })`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useUIStore } from '@/store/ui.store';
import { EditAccountModal } from '../EditAccountModal';
import type { AccountCardData } from '../AccountCard';

const mockUpdateBankAccount = vi.fn();

vi.mock('@/actions/account.actions', () => ({
  updateBankAccount: (...args: unknown[]) => mockUpdateBankAccount(...args),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => key),
}));

vi.mock('@/lib/logger', () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
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

const SAVINGS_ACCOUNT: AccountCardData = {
  id: 'clh1234567890abcdefghij',
  name: 'Mi Ahorro',
  type: 'SAVINGS',
  currency: 'COP',
  balanceCents: 100000,
  interestRateEA: 5,
  parentAccountId: null,
  cardColor: 'blue',
  cardNetwork: 'VISA',
  createdAt: new Date('2024-01-01'),
  transactions: [],
};

const CHECKING_ACCOUNT: AccountCardData = {
  ...SAVINGS_ACCOUNT,
  id: 'clhzyxwvutsrqponmlkjihgf',
  name: 'Mi Corriente',
  type: 'CHECKING',
  interestRateEA: null,
  cardColor: null,
  cardNetwork: 'NONE',
};

const MOCK_ACCOUNTS = [SAVINGS_ACCOUNT, CHECKING_ACCOUNT];

function getLastNotification() {
  const notifications = useUIStore.getState().notifications;
  return notifications[notifications.length - 1];
}

describe('EditAccountModal', () => {
  const dictionary = {};
  const renderModal = () => render(<EditAccountModal accounts={MOCK_ACCOUNTS} dictionary={dictionary} />);

  beforeEach(() => {
    useUIStore.setState({ activeModal: null, modalData: null, notifications: [] });
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return null when the modal is not open', () => {
    const { container } = renderModal();
    expect(container).toBeEmptyDOMElement();
  });

  it('should return null when no account matches the modal data', () => {
    useUIStore.getState().openModal('edit-account', { accountId: 'clhdoesnotexist12345' });
    const { container } = renderModal();
    expect(container).toBeEmptyDOMElement();
  });

  it('should render the prefilled account form for a savings account', async () => {
    useUIStore.getState().openModal('edit-account', { accountId: SAVINGS_ACCOUNT.id });
    renderModal();

    expect(screen.getByText('edit')).toBeInTheDocument();
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
    expect(screen.getByLabelText('accountName')).toHaveValue('Mi Ahorro');
    // Rate field visible for SAVINGS and prefilled with 5% (500 hundredths).
    // The value is set inside a requestAnimationFrame callback, so wait for it.
    await waitFor(() => {
      expect(screen.getByTestId('numeric-input-edit-rate')).toHaveValue(500);
    });

    // Network prefilled as VISA and card design prefilled as blue (also rAF-driven)
    await waitFor(() => {
      const visaBtn = screen.getByText('visa').closest('button')!;
      expect(visaBtn).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('blue')).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('should hide the rate field for a checking account', () => {
    useUIStore.getState().openModal('edit-account', { accountId: CHECKING_ACCOUNT.id });
    renderModal();

    expect(screen.getByLabelText('accountName')).toHaveValue('Mi Corriente');
    expect(screen.queryByLabelText('interestRate')).not.toBeInTheDocument();
  });

  it('should update the rate when the numeric input changes', async () => {
    useUIStore.getState().openModal('edit-account', { accountId: SAVINGS_ACCOUNT.id });
    const { container } = renderModal();

    // Wait for the rAF-driven prefill (rate, network, color) to be applied
    await waitFor(() => {
      expect(screen.getByTestId('numeric-input-edit-rate')).toHaveValue(500);
    });

    fireEvent.change(screen.getByTestId('numeric-input-edit-rate'), { target: { value: '600' } });
    mockUpdateBankAccount.mockResolvedValue({ success: true, data: { account: SAVINGS_ACCOUNT } });

    fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);

    await waitFor(() => {
      expect(mockUpdateBankAccount).toHaveBeenCalled();
    });
    const arg = mockUpdateBankAccount.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      accountId: SAVINGS_ACCOUNT.id,
      name: 'Mi Ahorro',
      interestRateEA: 6,
      cardColor: 'blue',
      cardNetwork: 'VISA',
    });
  });

  it('should allow selecting a different network and color', () => {
    useUIStore.getState().openModal('edit-account', { accountId: SAVINGS_ACCOUNT.id });
    renderModal();

    const mcBtn = screen.getByText('mastercard').closest('button')!;
    fireEvent.click(mcBtn);
    expect(mcBtn).toHaveAttribute('aria-pressed', 'true');

    const whiteBtn = screen.getByLabelText('white');
    fireEvent.click(whiteBtn);
    expect(whiteBtn).toHaveAttribute('aria-pressed', 'true');
    // Clicking again toggles back to null
    fireEvent.click(whiteBtn);
    expect(whiteBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('should submit successfully, notify, dispatch updated event and close', async () => {
    mockUpdateBankAccount.mockResolvedValue({ success: true, data: { account: SAVINGS_ACCOUNT } });
    const updatedListener = vi.fn();
    document.addEventListener('finance:account-updated', updatedListener);

    useUIStore.getState().openModal('edit-account', { accountId: SAVINGS_ACCOUNT.id });
    const { container } = renderModal();

    // Wait for rAF-driven prefill so cardColor/cardNetwork are set
    await waitFor(() => {
      expect(screen.getByTestId('numeric-input-edit-rate')).toHaveValue(500);
    });
    fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);

    await waitFor(() => {
      expect(mockUpdateBankAccount).toHaveBeenCalled();
    });
    expect(getLastNotification()?.type).toBe('success');
    expect(getLastNotification()?.message).toBe('updateSuccess');
    expect(useUIStore.getState().activeModal).toBeNull();
    expect(updatedListener).toHaveBeenCalled();
    const event = updatedListener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toMatchObject({ accountId: SAVINGS_ACCOUNT.id, cardColor: 'blue', cardNetwork: 'VISA' });

    document.removeEventListener('finance:account-updated', updatedListener);
  });

  it('should show error notification when update fails', async () => {
    mockUpdateBankAccount.mockResolvedValue({ success: false, code: 'X', error: 'boom' });
    useUIStore.getState().openModal('edit-account', { accountId: SAVINGS_ACCOUNT.id });
    const { container } = renderModal();

    fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);

    await waitFor(() => {
      expect(getLastNotification()?.type).toBe('error');
      expect(getLastNotification()?.message).toBe('errors.updateFailed');
    });
    expect(useUIStore.getState().activeModal).toBe('edit-account');
  });

  it('should show validation error when the name is emptied', async () => {
    useUIStore.getState().openModal('edit-account', { accountId: SAVINGS_ACCOUNT.id });
    const { container } = renderModal();

    fireEvent.change(screen.getByLabelText('accountName'), { target: { value: '' } });
    fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
    expect(mockUpdateBankAccount).not.toHaveBeenCalled();
  });

  it('should close the modal when the dialog close event fires', () => {
    useUIStore.getState().openModal('edit-account', { accountId: SAVINGS_ACCOUNT.id });
    const { container } = renderModal();

    const dialog = container.querySelector('dialog')!;
    act(() => {
      dialog.dispatchEvent(new Event('close'));
    });
    expect(useUIStore.getState().activeModal).toBeNull();
  });

  it('should call dialog.close after cancel animation', () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    useUIStore.getState().openModal('edit-account', { accountId: SAVINGS_ACCOUNT.id });
    const { container } = renderModal();

    const dialog = container.querySelector('dialog')!;
    expect(dialog).toHaveAttribute('open');

    const closeBtn = screen.getAllByLabelText('Close')[0];
    fireEvent.click(closeBtn);

    act(() => {
      vi.advanceTimersByTime(240);
    });
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();
  });
});