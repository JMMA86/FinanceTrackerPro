/**
 * TransactionTable Component Tests
 * Tests responsive table rendering, formatting, accessibility, and delete flow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionTable } from '../TransactionTable';

// Mock i18n
vi.mock('@/lib/i18n', () => ({
  get: vi.fn((dict: Record<string, unknown>, key: string) => {
    const result = (dict as Record<string, string>)[key];
    return result ?? key;
  }),
}));

// Mock formatMoney to avoid locale issues in jsdom
vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn((cents: number, currency: string) => {
    const abs = Math.abs(cents);
    const dollars = Math.floor(abs / 100);
    const centsPart = abs % 100;
    return `${currency} ${dollars}.${centsPart.toString().padStart(2, '0')}`;
  }),
}));

// Mock next/navigation
const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Mock Zustand UI store (openModal + addNotification)
const mockOpenModal = vi.fn();
const mockAddNotification = vi.fn();
vi.mock('@/store/ui.store', () => ({
  useUIStore: vi.fn((selector) => {
    const state = {
      openModal: mockOpenModal,
      addNotification: mockAddNotification,
    };
    return selector(state);
  }),
}));

// Mock deleteTransaction action
const mockDeleteTransaction = vi.fn();
vi.mock('@/actions/transaction.actions', () => ({
  deleteTransaction: (...args: unknown[]) => mockDeleteTransaction(...args),
}));

// Mock HTMLDialogElement methods
HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
});
HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
  this.removeAttribute('open');
});

// ============================================================================
// Test data
// ============================================================================

const mockAccounts = [
  { id: 'acc-1', name: 'Main Account', currency: 'USD' },
  { id: 'acc-2', name: 'Savings', currency: 'USD' },
];

const mockTransactions = [
  {
    id: 'tx-1',
    description: 'Salary payment',
    amountCents: 500000,
    currency: 'USD',
    type: 'INCOME',
    date: new Date(2024, 5, 1, 10, 30), // Jun 1, 2024 10:30 AM local
    accountId: 'acc-1',
    categoryId: 'cat-1',
    category: { id: 'cat-1', name: 'Salary', color: '#10B981' },
    createdAt: new Date(2024, 5, 1, 10, 30),
  },
  {
    id: 'tx-2',
    description: 'Rent payment',
    amountCents: -150000,
    currency: 'USD',
    type: 'EXPENSE',
    date: new Date(2024, 5, 5, 14, 15), // Jun 5, 2024 02:15 PM local
    accountId: 'acc-1',
    categoryId: 'cat-2',
    category: { id: 'cat-2', name: 'Housing', color: '#EF4444' },
    createdAt: new Date(2024, 5, 5, 14, 15),
  },
  {
    id: 'tx-3',
    description: 'Transfer to savings',
    amountCents: -50000,
    currency: 'USD',
    type: 'TRANSFER_OUT',
    date: new Date(2024, 5, 10, 9, 45), // Jun 10, 2024 09:45 AM local
    accountId: 'acc-1',
    categoryId: null,
    category: null,
    createdAt: new Date(2024, 5, 10, 9, 45),
  },
  {
    id: 'tx-4',
    description: null,
    amountCents: 10000,
    currency: 'USD',
    type: 'INCOME',
    date: new Date(2024, 5, 15, 18, 5), // Jun 15, 2024 06:05 PM local
    accountId: 'acc-2',
    categoryId: null,
    category: null,
    createdAt: new Date(2024, 5, 15, 18, 5),
  },
];

const dictionary = {
  title: 'Transactions',
  date: 'Date',
  description: 'Description',
  type: 'Type',
  account: 'Account',
  category: 'Category',
  amount: 'Amount',
  actions: 'Actions',
  deleteTransaction: 'Delete transaction',
  editTransaction: 'Edit transaction',
  deleteConfirm: 'Are you sure you want to delete this transaction?',
  deleteSuccess: 'Transaction deleted',
  balanceNegative: 'Cannot delete: the account balance would become negative',
  createError: 'Error creating transaction',
  cancel: 'Cancel',
  delete: 'Delete',
  noTransactions: 'No transactions',
  noTransactionsDesc: 'Create your first transaction',
  income: 'Income',
  expense: 'Expense',
  transferIn: 'Transfer In',
  transferOut: 'Transfer Out',
  investment: 'Investment',
  loanPayment: 'Loan Payment',
  creditPayment: 'Credit Payment',
};

const renderTable = (transactions = mockTransactions) =>
  render(
    <TransactionTable
      transactions={transactions}
      accounts={mockAccounts}
      dictionary={dictionary}
      locale="en-US"
    />
  );

describe('TransactionTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render transaction rows in desktop table', () => {
    renderTable();

    // Main table
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();

    // Headers
    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(7);
    expect(headers[0]).toHaveTextContent('Date');
    expect(headers[1]).toHaveTextContent('Description');
    expect(headers[2]).toHaveTextContent('Type');
    expect(headers[3]).toHaveTextContent('Account');
    expect(headers[4]).toHaveTextContent('Category');
    expect(headers[5]).toHaveTextContent('Amount');
    expect(headers[6]).toHaveTextContent('Actions');
  });

  it('should render correct number of transaction rows', () => {
    renderTable();

    // All rows in table body
    const table = screen.getByRole('table');
    const rows = table.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(4);
  });

  it('should display formatted amounts with correct sign', () => {
    renderTable();

    // Income should have positive sign (appears in both desktop and mobile)
    const incomeAmounts = screen.getAllByText(/\+USD 5000\.00/);
    expect(incomeAmounts.length).toBeGreaterThanOrEqual(1);

    // Expense should have negative sign
    const expenseAmounts = screen.getAllByText(/-USD 1500\.00/);
    expect(expenseAmounts.length).toBeGreaterThanOrEqual(1);
  });

  it('should display type badges with correct styles', () => {
    renderTable();

    // Income appears in both desktop + mobile (2 transactions with INCOME type)
    const incomeBadges = screen.getAllByText('Income');
    expect(incomeBadges.length).toBeGreaterThanOrEqual(1);

    // Expense badge
    const expenseBadges = screen.getAllByText('Expense');
    expect(expenseBadges.length).toBeGreaterThanOrEqual(1);

    // Transfer Out badge
    const transferOutBadges = screen.getAllByText('Transfer Out');
    expect(transferOutBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('should display account names correctly', () => {
    renderTable();

    // Account names appear both in desktop table and mobile cards
    const mainAccountElements = screen.getAllByText('Main Account');
    expect(mainAccountElements.length).toBeGreaterThanOrEqual(1);

    const savingsElements = screen.getAllByText('Savings');
    expect(savingsElements.length).toBeGreaterThanOrEqual(1);
  });

  it('should prefer the account name from the server include over the account map', () => {
    const txWithInactiveAccount = {
      ...mockTransactions[0],
      id: 'tx-5',
      accountId: 'acc-inactive', // not present in mockAccounts
      account: { name: 'Inactive Account' },
    };
    renderTable([txWithInactiveAccount]);

    // The include name wins even though the account is missing from the map
    expect(screen.getAllByText('Inactive Account').length).toBeGreaterThanOrEqual(1);
    // No em dash fallback is used for this transaction
    const dashes = screen.queryAllByText('—');
    expect(dashes).toHaveLength(0);
  });

  it('should render fallback for null description', () => {
    renderTable();

    // The null description em dash appears in both desktop table and mobile cards
    const dashElements = screen.getAllByText('—');
    expect(dashElements.length).toBeGreaterThanOrEqual(1);
  });

  it('should render empty state when no transactions', () => {
    renderTable([]);

    expect(screen.getByText('No transactions')).toBeInTheDocument();
    expect(screen.getByText('Create your first transaction')).toBeInTheDocument();
    // aria-live="polite" replaces role="status" for SonarQube S6819 compliance
    const emptyState = screen.getByText('No transactions').closest('[aria-live="polite"]');
    expect(emptyState).toBeInTheDocument();
  });

  it('should be accessible with proper role and aria attributes', () => {
    renderTable();

    const table = screen.getByRole('table');
    expect(table).toHaveAttribute('aria-label', 'Transactions');

    // Headers should have scope="col"
    const headerCells = table.querySelectorAll('th');
    headerCells.forEach((th) => {
      expect(th).toHaveAttribute('scope', 'col');
    });
  });

  it('should render mobile card list (hidden on desktop)', () => {
    renderTable();

    // Mobile list
    const mobileList = screen.getByRole('list');
    expect(mobileList).toBeInTheDocument();
    expect(mobileList).toHaveAttribute('aria-label', 'Transactions');
  });

  it('should display transaction dates with time', () => {
    renderTable();

    // Desktop table shows "Jun 1, 2024 · 10:30 AM" (en-US, local Date fixtures)
    const table = screen.getByRole('table');
    expect(within(table).getAllByText(/Jun 1, 2024 · 10:30 AM/).length).toBeGreaterThanOrEqual(1);
    expect(within(table).getAllByText(/Jun 5, 2024 · 02:15 PM/).length).toBeGreaterThanOrEqual(1);
    expect(within(table).getAllByText(/Jun 10, 2024 · 09:45 AM/).length).toBeGreaterThanOrEqual(1);
    expect(within(table).getAllByText(/Jun 15, 2024 · 06:05 PM/).length).toBeGreaterThanOrEqual(1);

    // Mobile cards show the short date with time too
    const mobileList = screen.getByRole('list');
    expect(within(mobileList).getAllByText(/Jun 1 · 10:30 AM/).length).toBeGreaterThanOrEqual(1);
    expect(within(mobileList).getAllByText(/Jun 15 · 06:05 PM/).length).toBeGreaterThanOrEqual(1);

    // All transactions should have time elements
    const timeElements = document.querySelectorAll('time');
    expect(timeElements.length).toBeGreaterThan(0);
  });

  it('should render category names with a color dot when a category exists', () => {
    renderTable();

    // Category names appear in both desktop table and mobile cards
    const salaryCategories = screen.getAllByText('Salary');
    expect(salaryCategories.length).toBeGreaterThanOrEqual(1);

    const housingCategories = screen.getAllByText('Housing');
    expect(housingCategories.length).toBeGreaterThanOrEqual(1);

    // Each rendered category must include its color dot
    const dots = document.querySelectorAll('span.inline-block.w-2.h-2.rounded-full');
    // 2 categorized transactions × (desktop + mobile) = 4 dots
    expect(dots).toHaveLength(4);
  });

  it('should render an em dash fallback when a transaction has no category', () => {
    renderTable();

    // tx-3 and tx-4 have no category → em dash fallback (desktop + mobile)
    const dashes = screen.getAllByText('—');
    // 2 null-category rows × 2 (desktop + mobile) + 1 null description = 5
    expect(dashes.length).toBeGreaterThanOrEqual(5);
  });

  it('should handle empty accounts map gracefully', () => {
    render(
      <TransactionTable
        transactions={mockTransactions}
        accounts={[]}
        dictionary={dictionary}
        locale="en-US"
      />
    );

    // Should show fallback for account names
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(4); // One per transaction
  });

  // -------------------------------------------------------------------------
  // Delete flow tests
  // -------------------------------------------------------------------------

  it('should render a trash button per desktop row with delete aria-label', () => {
    renderTable();

    const table = screen.getByRole('table');
    const deleteButtons = within(table).getAllByRole('button', { name: 'Delete transaction' });
    expect(deleteButtons).toHaveLength(mockTransactions.length);
  });

  it('should render a trash button in mobile cards', () => {
    renderTable();

    const mobileList = screen.getByRole('list');
    const deleteButtons = within(mobileList).getAllByRole('button', { name: 'Delete transaction' });
    expect(deleteButtons).toHaveLength(mockTransactions.length);
  });

  // -------------------------------------------------------------------------
  // Edit flow tests
  // -------------------------------------------------------------------------

  it('should render an edit (pencil) button per desktop row with edit aria-label', () => {
    renderTable();

    const table = screen.getByRole('table');
    const editButtons = within(table).getAllByRole('button', { name: 'Edit transaction' });
    expect(editButtons).toHaveLength(mockTransactions.length);
  });

  it('should render an edit (pencil) button in mobile cards', () => {
    renderTable();

    const mobileList = screen.getByRole('list');
    const editButtons = within(mobileList).getAllByRole('button', { name: 'Edit transaction' });
    expect(editButtons).toHaveLength(mockTransactions.length);
  });

  it('should open the create-transaction modal with the transaction when edit is clicked', async () => {
    renderTable();

    const table = screen.getByRole('table');
    const editButtons = within(table).getAllByRole('button', { name: 'Edit transaction' });

    // Click edit on the second row (tx-2, EXPENSE with category)
    await userEvent.click(editButtons[1]);

    expect(mockOpenModal).toHaveBeenCalledWith('create-transaction', {
      editing: mockTransactions[1],
    });
  });

  it('should open the edit modal when edit is clicked from a mobile card', async () => {
    renderTable();

    const mobileList = screen.getByRole('list');
    const editButtons = within(mobileList).getAllByRole('button', { name: 'Edit transaction' });

    await userEvent.click(editButtons[3]);

    expect(mockOpenModal).toHaveBeenCalledWith('create-transaction', {
      editing: mockTransactions[3],
    });
  });

  it('should open the delete confirmation modal when trash is clicked', async () => {
    renderTable();

    const table = screen.getByRole('table');
    const deleteButtons = within(table).getAllByRole('button', { name: 'Delete transaction' });
    await userEvent.click(deleteButtons[0]);

    expect(
      screen.getByText('Are you sure you want to delete this transaction?')
    ).toBeInTheDocument();
    // Modal has cancel and delete buttons
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('should delete the transaction, notify success and refresh after confirm', async () => {
    mockDeleteTransaction.mockResolvedValue({ success: true });

    renderTable();

    const table = screen.getByRole('table');
    const deleteButtons = within(table).getAllByRole('button', { name: 'Delete transaction' });
    await userEvent.click(deleteButtons[0]);

    await userEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(mockDeleteTransaction).toHaveBeenCalledWith({ transactionId: 'tx-1' });
      expect(mockAddNotification).toHaveBeenCalledWith('success', 'Transaction deleted');
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('should notify with localized error when deletion fails', async () => {
    mockDeleteTransaction.mockResolvedValue({ success: false, code: 'X', error: 'boom' });

    renderTable();

    const table = screen.getByRole('table');
    const deleteButtons = within(table).getAllByRole('button', { name: 'Delete transaction' });
    await userEvent.click(deleteButtons[0]);

    await userEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith('error', 'boom');
    });
  });

  it('should notify with the localized balance negative message when delete violates Rule 1', async () => {
    mockDeleteTransaction.mockResolvedValue({
      success: false,
      code: 'BALANCE_NEGATIVE',
      error: 'raw server error',
    });

    renderTable();

    const table = screen.getByRole('table');
    const deleteButtons = within(table).getAllByRole('button', { name: 'Delete transaction' });
    await userEvent.click(deleteButtons[0]);

    await userEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith(
        'error',
        'Cannot delete: the account balance would become negative'
      );
    });
  });

  it('should close the modal when cancel is clicked', async () => {
    renderTable();

    const table = screen.getByRole('table');
    const deleteButtons = within(table).getAllByRole('button', { name: 'Delete transaction' });
    await userEvent.click(deleteButtons[0]);

    const dialog = screen
      .getByText('Are you sure you want to delete this transaction?')
      .closest('dialog');
    expect(dialog).toHaveAttribute('open');

    // Cancel triggers the close animation
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    fireEvent.click(screen.getByText('Cancel'));

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();
    expect(dialog).not.toHaveAttribute('open');
    vi.useRealTimers();
  });
});
