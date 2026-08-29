/**
 * DeleteConfirmModal Component Tests
 *
 * Uses the REAL Zustand UI store. The modal is opened via
 * `useUIStore.getState().openModal('delete-confirm', data)` before rendering.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useUIStore } from '@/store/ui.store';
import { DeleteConfirmModal } from '../DeleteConfirmModal';

const mockDeleteBankAccount = vi.fn();

vi.mock('@/actions/account.actions', () => ({
  deleteBankAccount: (...args: unknown[]) => mockDeleteBankAccount(...args),
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

const ACCOUNT_ID = 'clh1234567890abcdefghij';

function getLastNotification() {
  const notifications = useUIStore.getState().notifications;
  return notifications[notifications.length - 1];
}

describe('DeleteConfirmModal', () => {
  const dictionary = {};
  const renderModal = () => render(<DeleteConfirmModal dictionary={dictionary} />);

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

  it('should render the account deletion confirm when open', () => {
    useUIStore.getState().openModal('delete-confirm', {
      accountId: ACCOUNT_ID,
      accountName: 'Mi Cuenta',
      isPocket: false,
    });
    renderModal();

    expect(screen.getByText('deleteAccountTitle')).toBeInTheDocument();
    expect(screen.getByText(/Mi Cuenta/)).toBeInTheDocument();
    expect(screen.getByText('deleteAccountMessage')).toBeInTheDocument();
    expect(screen.getByText('cancel')).toBeInTheDocument();
    expect(screen.getByText('delete')).toBeInTheDocument();
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  });

  it('should render the pocket deletion confirm variant', () => {
    useUIStore.getState().openModal('delete-confirm', {
      accountId: ACCOUNT_ID,
      accountName: 'Bolsillo',
      isPocket: true,
    });
    renderModal();

    expect(screen.getByText('deletePocketTitle')).toBeInTheDocument();
    expect(screen.getByText('deletePocketMessage')).toBeInTheDocument();
  });

  it('should not call the action when accountId is missing', () => {
    useUIStore.getState().openModal('delete-confirm', {
      accountId: null,
      accountName: 'X',
      isPocket: false,
    });
    renderModal();

    fireEvent.click(screen.getByText('delete'));
    expect(mockDeleteBankAccount).not.toHaveBeenCalled();
  });

  it('should delete an account successfully, notify, close and dispatch event', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    mockDeleteBankAccount.mockResolvedValue({ success: true, data: {} });

    const deletedListener = vi.fn();
    document.addEventListener('finance:account-deleted', deletedListener);

    useUIStore.getState().openModal('delete-confirm', {
      accountId: ACCOUNT_ID,
      accountName: 'Mi Cuenta',
      isPocket: false,
    });
    renderModal();

    fireEvent.click(screen.getByText('delete'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mockDeleteBankAccount).toHaveBeenCalledWith({ accountId: ACCOUNT_ID });
    expect(getLastNotification()?.type).toBe('success');
    expect(getLastNotification()?.message).toBe('deleteAccountSuccess');
    expect(useUIStore.getState().activeModal).toBeNull();
    expect(deletedListener).toHaveBeenCalled();
    const event = deletedListener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ accountId: ACCOUNT_ID });

    document.removeEventListener('finance:account-deleted', deletedListener);
  });

  it('should dispatch pocket-deleted and account-deleted events for a pocket', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    mockDeleteBankAccount.mockResolvedValue({ success: true, data: {} });

    const pocketDeletedListener = vi.fn();
    const accountDeletedListener = vi.fn();
    document.addEventListener('finance:pocket-deleted', pocketDeletedListener);
    document.addEventListener('finance:account-deleted', accountDeletedListener);

    useUIStore.getState().openModal('delete-confirm', {
      accountId: ACCOUNT_ID,
      accountName: 'Bolsillo',
      isPocket: true,
    });
    renderModal();

    fireEvent.click(screen.getByText('delete'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(getLastNotification()?.message).toBe('deletePocketSuccess');
    expect(pocketDeletedListener).toHaveBeenCalled();
    expect(accountDeletedListener).toHaveBeenCalled();
    const pocketEvent = pocketDeletedListener.mock.calls[0][0] as CustomEvent;
    expect(pocketEvent.detail).toEqual({ pocketId: ACCOUNT_ID });

    document.removeEventListener('finance:pocket-deleted', pocketDeletedListener);
    document.removeEventListener('finance:account-deleted', accountDeletedListener);
  });

  it('should show error notification when deletion fails', async () => {
    mockDeleteBankAccount.mockResolvedValue({ success: false, code: 'X', error: 'boom' });
    useUIStore.getState().openModal('delete-confirm', {
      accountId: ACCOUNT_ID,
      accountName: 'Mi Cuenta',
      isPocket: false,
    });
    renderModal();

    fireEvent.click(screen.getByText('delete'));

    await waitFor(() => {
      expect(getLastNotification()?.type).toBe('error');
      expect(getLastNotification()?.message).toBe('errors.deleteFailed');
    });
    // Modal stays open and delete button is re-enabled
    expect(useUIStore.getState().activeModal).toBe('delete-confirm');
    expect(screen.getByText('delete')).toBeEnabled();
  });

  it('should close the modal when the dialog close event fires', () => {
    useUIStore.getState().openModal('delete-confirm', {
      accountId: ACCOUNT_ID,
      accountName: 'Mi Cuenta',
      isPocket: false,
    });
    const { container } = renderModal();

    const dialog = container.querySelector('dialog')!;
    act(() => {
      dialog.dispatchEvent(new Event('close'));
    });
    expect(useUIStore.getState().activeModal).toBeNull();
  });

  it('should close the dialog via the close button after animation', () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    useUIStore.getState().openModal('delete-confirm', {
      accountId: ACCOUNT_ID,
      accountName: 'Mi Cuenta',
      isPocket: false,
    });
    const { container } = renderModal();

    const dialog = container.querySelector('dialog')!;
    expect(dialog).toHaveAttribute('open');

    fireEvent.click(screen.getByLabelText('Cerrar'));

    act(() => {
      vi.advanceTimersByTime(220);
    });
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();
    expect(dialog).not.toHaveAttribute('open');
  });

  it('should show a spinner while deleting', () => {
    let resolveFn: (v: unknown) => void = () => undefined;
    mockDeleteBankAccount.mockReturnValue(
      new Promise((resolve) => {
        resolveFn = resolve;
      })
    );
    useUIStore.getState().openModal('delete-confirm', {
      accountId: ACCOUNT_ID,
      accountName: 'Mi Cuenta',
      isPocket: false,
    });
    renderModal();

    fireEvent.click(screen.getByText('delete'));

    // Spinner replaces the delete label while pending
    expect(screen.queryByText('delete')).not.toBeInTheDocument();
    const deleteBtn = screen.getAllByRole('button').find((b) =>
      b.querySelector('.animate-spin')
    );
    expect(deleteBtn).toBeDefined();
    expect(deleteBtn).toBeDisabled();

    act(() => {
      resolveFn({ success: false, code: 'X', error: 'boom' });
    });
  });
});