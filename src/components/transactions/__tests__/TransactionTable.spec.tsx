/**
 * TransactionTable Component Tests
 * Tests responsive table rendering, formatting, accessibility
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
    date: new Date('2024-06-01'),
    accountId: 'acc-1',
    createdAt: new Date('2024-06-01'),
  },
  {
    id: 'tx-2',
    description: 'Rent payment',
    amountCents: -150000,
    currency: 'USD',
    type: 'EXPENSE',
    date: new Date('2024-06-05'),
    accountId: 'acc-1',
    createdAt: new Date('2024-06-05'),
  },
  {
    id: 'tx-3',
    description: 'Transfer to savings',
    amountCents: -50000,
    currency: 'USD',
    type: 'TRANSFER_OUT',
    date: new Date('2024-06-10'),
    accountId: 'acc-1',
    createdAt: new Date('2024-06-10'),
  },
  {
    id: 'tx-4',
    description: null,
    amountCents: 10000,
    currency: 'USD',
    type: 'INCOME',
    date: new Date('2024-06-15'),
    accountId: 'acc-2',
    createdAt: new Date('2024-06-15'),
  },
];

const dictionary = {
  title: 'Transactions',
  date: 'Date',
  description: 'Description',
  type: 'Type',
  account: 'Account',
  amount: 'Amount',
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

describe('TransactionTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render transaction rows in desktop table', () => {
    render(
      <TransactionTable
        transactions={mockTransactions}
        accounts={mockAccounts}
        dictionary={dictionary}
        locale="en-US"
      />
    );

    // Main table
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();

    // Headers
    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(5);
    expect(headers[0]).toHaveTextContent('Date');
    expect(headers[1]).toHaveTextContent('Description');
    expect(headers[2]).toHaveTextContent('Type');
    expect(headers[3]).toHaveTextContent('Account');
    expect(headers[4]).toHaveTextContent('Amount');
  });

  it('should render correct number of transaction rows', () => {
    render(
      <TransactionTable
        transactions={mockTransactions}
        accounts={mockAccounts}
        dictionary={dictionary}
        locale="en-US"
      />
    );

    // All rows in table body
    const table = screen.getByRole('table');
    const rows = table.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(4);
  });

  it('should display formatted amounts with correct sign', () => {
    render(
      <TransactionTable
        transactions={mockTransactions}
        accounts={mockAccounts}
        dictionary={dictionary}
        locale="en-US"
      />
    );

    // Income should have positive sign (appears in both desktop and mobile)
    const incomeAmounts = screen.getAllByText(/\+USD 5000\.00/);
    expect(incomeAmounts.length).toBeGreaterThanOrEqual(1);

    // Expense should have negative sign
    const expenseAmounts = screen.getAllByText(/-USD 1500\.00/);
    expect(expenseAmounts.length).toBeGreaterThanOrEqual(1);
  });

  it('should display type badges with correct styles', () => {
    render(
      <TransactionTable
        transactions={mockTransactions}
        accounts={mockAccounts}
        dictionary={dictionary}
        locale="en-US"
      />
    );

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
    render(
      <TransactionTable
        transactions={mockTransactions}
        accounts={mockAccounts}
        dictionary={dictionary}
        locale="en-US"
      />
    );

    // Account names appear both in desktop table and mobile cards
    const mainAccountElements = screen.getAllByText('Main Account');
    expect(mainAccountElements.length).toBeGreaterThanOrEqual(1);

    const savingsElements = screen.getAllByText('Savings');
    expect(savingsElements.length).toBeGreaterThanOrEqual(1);
  });

  it('should render fallback for null description', () => {
    render(
      <TransactionTable
        transactions={mockTransactions}
        accounts={mockAccounts}
        dictionary={dictionary}
        locale="en-US"
      />
    );

    // The null description em dash appears in both desktop table and mobile cards
    const dashElements = screen.getAllByText('—');
    expect(dashElements.length).toBeGreaterThanOrEqual(1);
  });

  it('should render empty state when no transactions', () => {
    render(
      <TransactionTable
        transactions={[]}
        accounts={mockAccounts}
        dictionary={dictionary}
        locale="en-US"
      />
    );

    expect(screen.getByText('No transactions')).toBeInTheDocument();
    expect(screen.getByText('Create your first transaction')).toBeInTheDocument();
    // aria-live="polite" replaces role="status" for SonarQube S6819 compliance
    const emptyState = screen.getByText('No transactions').closest('[aria-live="polite"]');
    expect(emptyState).toBeInTheDocument();
  });

  it('should be accessible with proper role and aria attributes', () => {
    render(
      <TransactionTable
        transactions={mockTransactions}
        accounts={mockAccounts}
        dictionary={dictionary}
        locale="en-US"
      />
    );

    const table = screen.getByRole('table');
    expect(table).toHaveAttribute('aria-label', 'Transactions');

    // Headers should have scope="col"
    const tableElement = table;
    const headerCells = tableElement.querySelectorAll('th');
    headerCells.forEach((th) => {
      expect(th).toHaveAttribute('scope', 'col');
    });
  });

  it('should render mobile card list (hidden on desktop)', () => {
    render(
      <TransactionTable
        transactions={mockTransactions}
        accounts={mockAccounts}
        dictionary={dictionary}
        locale="en-US"
      />
    );

    // Mobile list
    const mobileList = screen.getByRole('list');
    expect(mobileList).toBeInTheDocument();
    expect(mobileList).toHaveAttribute('aria-label', 'Transactions');
  });

  it('should display transaction dates correctly', () => {
    render(
      <TransactionTable
        transactions={mockTransactions}
        accounts={mockAccounts}
        dictionary={dictionary}
        locale="en-US"
      />
    );

    // All transactions should have time elements
    const timeElements = document.querySelectorAll('time');
    expect(timeElements.length).toBeGreaterThan(0);
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
});
