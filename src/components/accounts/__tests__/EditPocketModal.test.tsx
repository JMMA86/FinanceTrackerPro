/**
 * EditPocketModal Component Tests
 *
 * Uses the REAL Zustand UI store. The modal is opened via
 * `useUIStore.getState().openModal('edit-pocket', { pocketId })`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useUIStore } from '@/store/ui.store';
import { EditPocketModal } from '../EditPocketModal';
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
    className,
  }: {
    id?: string;
    value: number;
    onChange: (v: number) => void;
    className?: string;
  }) => (
    <input
      id={id}
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      data-testid={`numeric-input-${id}`}
      className={className}
    />
  ),
}));

const POCKET: AccountCardData = {
  id: 'clh1234567890abcdefghij',
  name: 'Bolsillo Viaje',
  type: 'POCKET',
  currency: 'COP',
  balanceCents: 50000,
  interestRateEA: 3,
  parentAccountId: 'clhzyxwvutsrqponmlkjihgf',
  cardColor: null,
  cardNetwork: null,
  createdAt: new Date('2024-01-01'),
  transactions: [],
};

function getLastNotification() {
  const notifications = useUIStore.getState().notifications;
  return notifications[notifications.length - 1];
}

describe('EditPocketModal', () => {
  const dictionary = {};
  const renderModal = () => render(<EditPocketModal pockets={[POCKET]} dictionary={dictionary} />);

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

  it('should return null when no pocket matches the modal data', () => {
    useUIStore.getState().openModal('edit-pocket', { pocketId: 'clhdoesnotexist12345' });
    const { container } = renderModal();
    expect(container).toBeEmptyDOMElement();
  });

  it('should render the prefilled pocket form with name and rate', async () => {
    useUIStore.getState().openModal('edit-pocket', { pocketId: POCKET.id });
    renderModal();

    expect(screen.getByText('edit')).toBeInTheDocument();
    expect(screen.getByText('pocket')).toBeInTheDocument();
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
    expect(screen.getByLabelText('accountName')).toHaveValue('Bolsillo Viaje');
    expect(screen.getByLabelText('interestRatePocket')).toBeInTheDocument();
    // The rate value is applied inside a requestAnimationFrame callback
    await waitFor(() => {
      expect(screen.getByTestId('numeric-input-edit-pocket-rate')).toHaveValue(300);
    });
  });

  it('should update the rate when the numeric input changes and submit', async () => {
    mockUpdateBankAccount.mockResolvedValue({ success: true, data: { account: POCKET } });
    useUIStore.getState().openModal('edit-pocket', { pocketId: POCKET.id });
    const { container } = renderModal();

    fireEvent.change(screen.getByTestId('numeric-input-edit-pocket-rate'), {
      target: { value: '250' },
    });
    fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);

    await waitFor(() => {
      expect(mockUpdateBankAccount).toHaveBeenCalled();
    });
    const arg = mockUpdateBankAccount.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      accountId: POCKET.id,
      name: 'Bolsillo Viaje',
      interestRateEA: 2.5,
    });
  });

  it('should submit successfully, dispatch updated event and close', async () => {
    mockUpdateBankAccount.mockResolvedValue({ success: true, data: { account: POCKET } });
    const updatedListener = vi.fn();
    document.addEventListener('finance:account-updated', updatedListener);

    useUIStore.getState().openModal('edit-pocket', { pocketId: POCKET.id });
    const { container } = renderModal();

    fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);

    await waitFor(() => {
      expect(mockUpdateBankAccount).toHaveBeenCalled();
    });
    expect(getLastNotification()?.type).toBe('success');
    expect(getLastNotification()?.message).toBe('updateSuccess');
    expect(useUIStore.getState().activeModal).toBeNull();
    expect(updatedListener).toHaveBeenCalled();
    const event = updatedListener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toMatchObject({
      accountId: POCKET.id,
      name: 'Bolsillo Viaje',
      interestRateEA: 3,
    });

    document.removeEventListener('finance:account-updated', updatedListener);
  });

  it('should show error notification when update fails', async () => {
    mockUpdateBankAccount.mockResolvedValue({ success: false, code: 'X', error: 'boom' });
    useUIStore.getState().openModal('edit-pocket', { pocketId: POCKET.id });
    const { container } = renderModal();

    fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);

    await waitFor(() => {
      expect(getLastNotification()?.type).toBe('error');
      expect(getLastNotification()?.message).toBe('errors.updateFailed');
    });
    expect(useUIStore.getState().activeModal).toBe('edit-pocket');
  });

  it('should show validation error when the name is emptied', async () => {
    useUIStore.getState().openModal('edit-pocket', { pocketId: POCKET.id });
    const { container } = renderModal();

    fireEvent.change(screen.getByLabelText('accountName'), { target: { value: '' } });
    fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
    expect(mockUpdateBankAccount).not.toHaveBeenCalled();
  });

  it('should close the modal when the dialog close event fires', () => {
    useUIStore.getState().openModal('edit-pocket', { pocketId: POCKET.id });
    const { container } = renderModal();

    const dialog = container.querySelector('dialog')!;
    act(() => {
      dialog.dispatchEvent(new Event('close'));
    });
    expect(useUIStore.getState().activeModal).toBeNull();
  });

  it('should call dialog.close after cancel animation', () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    useUIStore.getState().openModal('edit-pocket', { pocketId: POCKET.id });
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