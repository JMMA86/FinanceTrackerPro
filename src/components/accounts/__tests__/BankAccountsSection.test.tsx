/**
 * BankAccountsSection Component Tests
 *
 * Renders the real AccountCard / AccountFullDetail / EditPocketModal children.
 * next/navigation and the account/transactions actions are mocked; the UI store is real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useUIStore } from '@/store/ui.store';
import { BankAccountsSection } from '../BankAccountsSection';
import type { AccountCardData } from '../AccountCard';

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
}));

const mockGetAccountTransactions = vi.fn();
vi.mock('@/actions/account-transactions.actions', () => ({
  getAccountTransactions: (...args: unknown[]) => mockGetAccountTransactions(...args),
}));

// EditPocketModal (rendered by this section) imports the real server actions module,
// which pulls in prisma/next — mock it so only the UI is exercised.
vi.mock('@/actions/account.actions', () => ({
  updateBankAccount: vi.fn().mockResolvedValue({ success: true, data: {} }),
  createBankAccount: vi.fn().mockResolvedValue({ success: true, data: {} }),
  deleteBankAccount: vi.fn().mockResolvedValue({ success: true, data: {} }),
  getBankAccounts: vi.fn().mockResolvedValue({ success: true, data: [] }),
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

const PARENT: AccountCardData = {
  id: 'clh1234567890abcdefghij',
  name: 'Cuenta Principal',
  type: 'CHECKING',
  currency: 'COP',
  balanceCents: 100000,
  interestRateEA: null,
  parentAccountId: null,
  cardColor: null,
  cardNetwork: 'VISA',
  createdAt: new Date('2024-01-01'),
  transactions: [],
};

const POCKET: AccountCardData = {
  id: 'clhzyxwvutsrqponmlkjihgf',
  name: 'Bolsillo Uno',
  type: 'POCKET',
  currency: 'COP',
  balanceCents: 25000,
  interestRateEA: 2,
  parentAccountId: PARENT.id,
  cardColor: null,
  cardNetwork: null,
  createdAt: new Date('2024-02-01'),
  transactions: [],
};

function mockTxPage() {
  mockGetAccountTransactions.mockResolvedValue({
    success: true,
    data: { transactions: [], totalPages: 1, total: 0 },
  });
}

describe('BankAccountsSection', () => {
  const dictionary = {};

  const renderSection = (accounts: AccountCardData[]) =>
    render(<BankAccountsSection accounts={accounts} dictionary={dictionary} locale="es-CO" />);

  beforeEach(() => {
    useUIStore.setState({ activeModal: null, modalData: null, notifications: [] });
    vi.clearAllMocks();
    mockTxPage();
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
  });

  it('should render the section heading and the add account button', () => {
    renderSection([PARENT]);
    expect(screen.getByText('sections.bank')).toBeInTheDocument();
    expect(screen.getByText('addAccount')).toBeInTheDocument();
  });

  it('should show the empty state when there are no parent accounts', () => {
    renderSection([]);
    expect(screen.getByText('noAccounts')).toBeInTheDocument();
    expect(screen.getByText('noAccountsDesc')).toBeInTheDocument();
  });

  it('should render a card per parent account and exclude pockets from the grid', () => {
    renderSection([PARENT, POCKET]);
    expect(screen.getByRole('button', { name: 'Cuenta Principal' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bolsillo Uno' })).not.toBeInTheDocument();
  });

  it('should open the create-account modal from the header button', () => {
    renderSection([PARENT]);
    fireEvent.click(screen.getByText('addAccount'));
    expect(useUIStore.getState().activeModal).toBe('create-account');
  });

  it('should open the create-account modal from the empty state button', () => {
    renderSection([]);
    const buttons = screen.getAllByText('addAccount');
    fireEvent.click(buttons[buttons.length - 1]);
    expect(useUIStore.getState().activeModal).toBe('create-account');
  });

  it('should open the account detail when a card is clicked', async () => {
    renderSection([PARENT, POCKET]);

    fireEvent.click(screen.getByRole('button', { name: 'Cuenta Principal' }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Cuenta Principal' })
      ).toBeInTheDocument();
    });
    expect(mockGetAccountTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: PARENT.id, page: 1 })
    );
  });

  it('should open create-account with pocket prefill from the detail', async () => {
    renderSection([PARENT, POCKET]);

    fireEvent.click(screen.getByRole('button', { name: 'Cuenta Principal' }));
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Cuenta Principal' })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('detail.addPocket'));

    expect(useUIStore.getState().activeModal).toBe('create-account');
    expect(useUIStore.getState().modalData).toMatchObject({
      prefillType: 'POCKET',
      prefillParentId: PARENT.id,
    });
  });

  it('should open the edit-account modal from the detail', async () => {
    renderSection([PARENT, POCKET]);

    fireEvent.click(screen.getByRole('button', { name: 'Cuenta Principal' }));
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Cuenta Principal' })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('detail.edit'));

    expect(useUIStore.getState().activeModal).toBe('edit-account');
    expect(useUIStore.getState().modalData).toMatchObject({ accountId: PARENT.id });
  });

  it('should open the delete-confirm modal from the detail', async () => {
    renderSection([PARENT, POCKET]);

    fireEvent.click(screen.getByRole('button', { name: 'Cuenta Principal' }));
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Cuenta Principal' })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('detail.delete'));

    expect(useUIStore.getState().activeModal).toBe('delete-confirm');
    expect(useUIStore.getState().modalData).toMatchObject({
      accountId: PARENT.id,
      accountName: 'Cuenta Principal',
      isPocket: false,
    });
  });

  it('should open edit-pocket and delete-pocket modals from the pocket detail', async () => {
    renderSection([PARENT, POCKET]);

    fireEvent.click(screen.getByRole('button', { name: 'Cuenta Principal' }));
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Cuenta Principal' })
      ).toBeInTheDocument();
    });

    const pocketCard = document.querySelector('[data-pocket-id]') as HTMLButtonElement;
    expect(pocketCard).toBeInTheDocument();
    fireEvent.click(pocketCard);

    await waitFor(() => {
      expect(screen.getByLabelText('pocketDetail.edit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('pocketDetail.edit'));
    expect(useUIStore.getState().activeModal).toBe('edit-pocket');
    expect(useUIStore.getState().modalData).toMatchObject({ pocketId: POCKET.id });

    // Re-open the pocket detail after the edit modal is dismissed
    useUIStore.setState({ activeModal: null, modalData: null });
    fireEvent.click(pocketCard);

    await waitFor(() => {
      expect(screen.getByLabelText('pocketDetail.delete')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('pocketDetail.delete'));
    expect(useUIStore.getState().activeModal).toBe('delete-confirm');
    expect(useUIStore.getState().modalData).toMatchObject({
      accountId: POCKET.id,
      accountName: 'Bolsillo Uno',
      isPocket: true,
    });
  });

  it('should refresh the router when the detail is closed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    renderSection([PARENT, POCKET]);

    fireEvent.click(screen.getByRole('button', { name: 'Cuenta Principal' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /detail.back/ }));

    act(() => {
      vi.advanceTimersByTime(240);
    });
    expect(mockRefresh).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should run the deletion animation and refresh the router when an account is deleted', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    renderSection([PARENT, POCKET]);

    fireEvent.click(screen.getByRole('button', { name: 'Cuenta Principal' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    document.dispatchEvent(
      new CustomEvent('finance:account-deleted', { detail: { accountId: PARENT.id } })
    );

    // Close animation (240ms) → card fade (420ms) → collapse/onDone (380ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(mockRefresh).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
