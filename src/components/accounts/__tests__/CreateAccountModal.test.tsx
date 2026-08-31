/**
 * CreateAccountModal Component Tests
 *
 * Uses the REAL Zustand UI store. The modal is opened via
 * `useUIStore.getState().openModal('create-account')` before rendering.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useUIStore } from '@/store/ui.store';
import { CreateAccountModal } from '../CreateAccountModal';
import type { AccountCardData } from '../AccountCard';

const mockCreateBankAccount = vi.fn();

vi.mock('@/actions/account.actions', () => ({
  createBankAccount: (...args: unknown[]) => mockCreateBankAccount(...args),
}));

// Mock i18n get — returns the key itself for predictable assertions
vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => key),
}));

// Mock logger
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

// Mock FormattedNumericInput
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

const MOCK_PARENT: AccountCardData = {
  id: 'clh1234567890abcdefghij',
  name: 'Cuenta Principal',
  type: 'CHECKING',
  currency: 'USD',
  balanceCents: 100000,
  interestRateEA: null,
  parentAccountId: null,
  cardColor: null,
  cardNetwork: 'VISA',
  createdAt: new Date('2024-01-01'),
  transactions: [],
};

const MOCK_ACCOUNTS = [MOCK_PARENT];

function getLastNotification() {
  const notifications = useUIStore.getState().notifications;
  return notifications[notifications.length - 1];
}

describe('CreateAccountModal', () => {
  const dictionary = {};
  const renderModal = () =>
    render(<CreateAccountModal accounts={MOCK_ACCOUNTS} dictionary={dictionary} />);

  beforeEach(() => {
    useUIStore.setState({ activeModal: null, modalData: null, notifications: [] });
    // jsdom dialogs are inert unless open — mirror the browser so content inside
    // the dialog is exposed to role/accessibility queries.
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

  it('should render the dialog and call showModal when activeModal is create-account', () => {
    useUIStore.getState().openModal('create-account');
    const { container } = renderModal();

    expect(screen.getByText('addAccount')).toBeInTheDocument();
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('open');
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  });

  it('should render account fields for a regular account', () => {
    useUIStore.getState().openModal('create-account');
    renderModal();

    expect(screen.getByLabelText('accountName')).toBeInTheDocument();
    expect(screen.getByLabelText('accountType')).toBeInTheDocument();
    expect(screen.getByLabelText('currency')).toBeInTheDocument();
    expect(screen.getByLabelText('initialBalance')).toBeInTheDocument();
    expect(screen.getByText('paymentNetwork')).toBeInTheDocument();

    const typeSelect = screen.getByLabelText('accountType') as HTMLSelectElement;
    const options = Array.from(typeSelect.querySelectorAll('option'));
    // placeholder + SAVINGS/CHECKING/CASH
    expect(options).toHaveLength(4);

    const currencySelect = screen.getByLabelText('currency') as HTMLSelectElement;
    const currencyValues = Array.from(currencySelect.querySelectorAll('option')).map((o) =>
      o.textContent?.trim()
    );
    expect(currencyValues).toEqual(expect.arrayContaining(['COP', 'USD', 'EUR']));
  });

  it('should not show interest rate field until a rate-bearing type is selected', async () => {
    useUIStore.getState().openModal('create-account');
    renderModal();

    expect(screen.queryByLabelText('interestRate')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('accountType'), { target: { value: 'SAVINGS' } });

    await waitFor(() => {
      expect(screen.getByLabelText('interestRate')).toBeInTheDocument();
    });
  });

  it('should render pocket variant when prefillType is POCKET', async () => {
    useUIStore.getState().openModal('create-account', {
      prefillType: 'POCKET',
      prefillParentId: MOCK_PARENT.id,
    });
    renderModal();

    expect(screen.getByText('newPocket')).toBeInTheDocument();
    expect(screen.getByLabelText('pocketName')).toBeInTheDocument();
    expect(screen.getByLabelText('interestRatePocket')).toBeInTheDocument();
    // Regular account fields must be hidden
    expect(screen.queryByLabelText('accountType')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('paymentNetwork')).not.toBeInTheDocument();

    // Hidden fields carry the pocket prefill data (currency inherited from parent)
    await waitFor(() => {
      expect((document.querySelector('input[name="type"]') as HTMLInputElement)?.value).toBe(
        'POCKET'
      );
      expect(
        (document.querySelector('input[name="parentAccountId"]') as HTMLInputElement)?.value
      ).toBe(MOCK_PARENT.id);
      expect((document.querySelector('input[name="currency"]') as HTMLInputElement)?.value).toBe(
        'USD'
      );
    });
  });

  it('should submit a pocket with parent reference', async () => {
    mockCreateBankAccount.mockResolvedValue({ success: true, data: { account: { id: 'p-1' } } });
    useUIStore.getState().openModal('create-account', {
      prefillType: 'POCKET',
      prefillParentId: MOCK_PARENT.id,
    });
    const { container } = renderModal();

    fireEvent.change(screen.getByLabelText('pocketName'), { target: { value: 'Bolsillo Viaje' } });

    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateBankAccount).toHaveBeenCalled();
    });
    const arg = mockCreateBankAccount.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      name: 'Bolsillo Viaje',
      type: 'POCKET',
      parentAccountId: MOCK_PARENT.id,
      currency: 'USD',
      cardNetwork: 'NONE',
    });
  });

  it('should show inline validation error when submitting with empty required fields', async () => {
    useUIStore.getState().openModal('create-account');
    const { container } = renderModal();

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
  });

  it('should submit valid data and close the modal on success', async () => {
    mockCreateBankAccount.mockResolvedValue({ success: true, data: { account: { id: 'acc-1' } } });
    useUIStore.getState().openModal('create-account');
    const { container } = renderModal();

    fireEvent.change(screen.getByLabelText('accountName'), { target: { value: 'Mi Cuenta' } });
    fireEvent.change(screen.getByLabelText('accountType'), { target: { value: 'SAVINGS' } });
    fireEvent.change(screen.getByTestId('numeric-input-acc-balance'), {
      target: { value: '5000' },
    });

    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateBankAccount).toHaveBeenCalled();
    });
    const arg = mockCreateBankAccount.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      name: 'Mi Cuenta',
      type: 'SAVINGS',
      currency: 'COP',
      initialBalanceCents: 5000,
      cardNetwork: 'NONE',
    });
    expect(arg.idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/);

    // Success notification + modal closed
    await waitFor(() => {
      expect(getLastNotification()?.type).toBe('success');
      expect(getLastNotification()?.message).toBe('createSuccess');
    });
    expect(useUIStore.getState().activeModal).toBeNull();
  });

  it('should send selected network and card color on submit', async () => {
    mockCreateBankAccount.mockResolvedValue({ success: true, data: { account: { id: 'acc-1' } } });
    useUIStore.getState().openModal('create-account');
    const { container } = renderModal();

    fireEvent.change(screen.getByLabelText('accountName'), { target: { value: 'Mi Cuenta' } });
    fireEvent.change(screen.getByLabelText('accountType'), { target: { value: 'CHECKING' } });

    fireEvent.click(screen.getByText('visa'));
    fireEvent.click(screen.getByLabelText('blue'));

    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateBankAccount).toHaveBeenCalled();
    });
    const arg = mockCreateBankAccount.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.cardNetwork).toBe('VISA');
    expect(arg.cardColor).toBe('blue');
  });

  it('should show session invalid notification when server returns SESSION_INVALID', async () => {
    mockCreateBankAccount.mockResolvedValue({
      success: false,
      code: 'SESSION_INVALID',
      error: 'Sesión inválida',
    });
    useUIStore.getState().openModal('create-account');
    const { container } = renderModal();

    fireEvent.change(screen.getByLabelText('accountName'), { target: { value: 'Mi Cuenta' } });
    fireEvent.change(screen.getByLabelText('accountType'), { target: { value: 'CHECKING' } });
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const notif = getLastNotification();
      expect(notif?.type).toBe('error');
      expect(notif?.message).toBe('errors.sessionInvalid');
    });
  });

  it('should show generic create failed notification on other errors', async () => {
    mockCreateBankAccount.mockResolvedValue({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'invalid',
    });
    useUIStore.getState().openModal('create-account');
    const { container } = renderModal();

    fireEvent.change(screen.getByLabelText('accountName'), { target: { value: 'Mi Cuenta' } });
    fireEvent.change(screen.getByLabelText('accountType'), { target: { value: 'CHECKING' } });
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const notif = getLastNotification();
      expect(notif?.type).toBe('error');
      expect(notif?.message).toBe('errors.createFailed');
    });
  });

  it('should not close the modal when server fails', async () => {
    mockCreateBankAccount.mockResolvedValue({ success: false, code: 'X', error: 'boom' });
    useUIStore.getState().openModal('create-account');
    const { container } = renderModal();

    fireEvent.change(screen.getByLabelText('accountName'), { target: { value: 'Mi Cuenta' } });
    fireEvent.change(screen.getByLabelText('accountType'), { target: { value: 'CHECKING' } });
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(getLastNotification()?.type).toBe('error');
    });
    expect(useUIStore.getState().activeModal).toBe('create-account');
  });

  it('should render an inline server error alert and keep the modal open on failure', async () => {
    mockCreateBankAccount.mockResolvedValue({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'invalid',
    });
    useUIStore.getState().openModal('create-account');
    const { container } = renderModal();

    fireEvent.change(screen.getByLabelText('accountName'), { target: { value: 'Mi Cuenta' } });
    fireEvent.change(screen.getByLabelText('accountType'), { target: { value: 'CHECKING' } });
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);

    // Inline alert with the localized message is visible inside the dialog
    // (the toast below the <dialog> top layer is not), and the modal stays open.
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('errors.createFailed');
    });
    expect(useUIStore.getState().activeModal).toBe('create-account');
  });

  it('should clear the inline server error on the next successful submit', async () => {
    mockCreateBankAccount.mockResolvedValueOnce({
      success: false,
      code: 'X',
      error: 'boom',
    });
    mockCreateBankAccount.mockResolvedValueOnce({
      success: true,
      data: { account: { id: 'acc-1' } },
    });
    useUIStore.getState().openModal('create-account');
    const { container } = renderModal();

    fireEvent.change(screen.getByLabelText('accountName'), { target: { value: 'Mi Cuenta' } });
    fireEvent.change(screen.getByLabelText('accountType'), { target: { value: 'CHECKING' } });
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;

    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('errors.createFailed');
    });

    // Second attempt succeeds: the alert disappears and the modal closes.
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(useUIStore.getState().activeModal).toBeNull();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should close the modal when the dialog close event fires', () => {
    useUIStore.getState().openModal('create-account');
    const { container } = renderModal();

    const dialog = container.querySelector('dialog')!;
    act(() => {
      dialog.dispatchEvent(new Event('close'));
    });
    expect(useUIStore.getState().activeModal).toBeNull();
  });

  it('should call dialog.close after cancel animation', () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    useUIStore.getState().openModal('create-account');
    const { container } = renderModal();

    const dialog = container.querySelector('dialog')!;
    expect(dialog).toHaveAttribute('open');

    const closeBtn = screen.getAllByLabelText('Close')[0];
    fireEvent.click(closeBtn);

    act(() => {
      vi.advanceTimersByTime(240);
    });
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();
    expect(dialog).not.toHaveAttribute('open');
  });

  it('should render network selector buttons with aria-pressed state', () => {
    useUIStore.getState().openModal('create-account');
    renderModal();

    const visaBtn = screen.getByText('visa').closest('button')!;
    expect(visaBtn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(visaBtn);
    expect(visaBtn).toHaveAttribute('aria-pressed', 'true');
  });
});
