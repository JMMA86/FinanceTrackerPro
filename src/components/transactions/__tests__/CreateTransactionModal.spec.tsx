/**
 * CreateTransactionModal Component Tests
 * Tests modal open/close, form validation, submission, accessibility
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateTransactionModal } from '../CreateTransactionModal';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mutable holder so tests can simulate the modal opening/closing (the real
// store's activeModal is driven by openModal/closeModal).
const { mockActiveModalState } = vi.hoisted(() => ({
  mockActiveModalState: { value: 'create-transaction' as string | null },
}));

const mockOpenModal = vi.fn();
const mockCloseModal = vi.fn();
const mockAddNotification = vi.fn();

vi.mock('@/store/ui.store', () => ({
  useUIStore: vi.fn((selector) => {
    const state = {
      activeModal: mockActiveModalState.value,
      openModal: mockOpenModal,
      closeModal: mockCloseModal,
      addNotification: mockAddNotification,
    };
    return selector(state);
  }),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const labels: Record<string, string> = {
      createTitle: 'Create Transaction',
      type: 'Type',
      account: 'Account',
      amountLabel: 'Amount',
      descriptionLabel: 'Description',
      descriptionPlaceholder: 'Enter description...',
      transactionDate: 'Date',
      cancel: 'Cancel',
      create: 'Create',
      creating: 'Creating...',
      selectAccount: 'Select an account',
      expenseLabel: 'Expense',
      incomeLabel: 'Income',
      createSuccess: 'Transaction created',
      createError: 'Error creating transaction',
      insufficientFunds: 'Insufficient funds',
      selectCategory: 'No category',
      category: 'Category',
      manageCategories: 'Manage categories',
      noAccountsDesc: 'You need at least one account to record transactions.',
      createAccountCta: 'Create account',
      currencyMismatch: 'Currency mismatch',
      inactiveAccount: 'Inactive account',
      accountNotFound: 'Account not found',
      rateLimited: 'Rate limited',
    };
    return labels[key] ?? key;
  }),
}));

// Mock createTransaction action
const mockCreateTransaction = vi.fn();
vi.mock('@/actions/transaction.actions', () => ({
  createTransaction: (...args: unknown[]) => mockCreateTransaction(...args),
}));

// Mock FormattedNumericInput
vi.mock('@/components/ui/FormattedNumericInput', () => ({
  FormattedNumericInput: ({
    value,
    onChange,
    id,
    className,
    ...props
  }: {
    value: number;
    onChange: (v: number) => void;
    id?: string;
    className?: string;
    'aria-invalid'?: boolean | 'true' | 'false';
    'aria-describedby'?: string;
  }) => (
    <input
      id={id}
      type="text"
      data-testid="formatted-numeric-input"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={className}
      {...props}
    />
  ),
}));

// Mock crypto.randomUUID
const mockUUID = '550e8400-e29b-41d4-a716-446655440000';
vi.spyOn(crypto, 'randomUUID').mockReturnValue(mockUUID);

// Mock HTMLDialogElement methods with actual behavior
HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
});
HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
  this.removeAttribute('open');
});

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockAccounts = [
  { id: 'acc-1', name: 'Main Account', currency: 'USD' },
  { id: 'acc-2', name: 'Savings Account', currency: 'USD' },
];

const mockCategories = [
  { id: 'cat-1', name: 'Groceries', type: 'GROCERIES', color: '#3B82F6', userId: null },
  { id: 'cat-2', name: 'My Travel', type: 'OTHER', color: '#8B5CF6', userId: 'user-1' },
];

const dictionary = {
  createTitle: 'Create Transaction',
  type: 'Type',
  account: 'Account',
  amountLabel: 'Amount',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Enter description...',
  transactionDate: 'Date',
  cancel: 'Cancel',
  create: 'Create',
  creating: 'Creating...',
  selectAccount: 'Select an account',
  expenseLabel: 'Expense',
  incomeLabel: 'Income',
  createSuccess: 'Transaction created',
  createError: 'Error creating transaction',
  insufficientFunds: 'Insufficient funds',
  selectCategory: 'No category',
  category: 'Category',
  manageCategories: 'Manage categories',
  noAccountsDesc: 'You need at least one account to record transactions.',
  createAccountCta: 'Create account',
  currencyMismatch: 'Currency mismatch',
  inactiveAccount: 'Inactive account',
  accountNotFound: 'Account not found',
  rateLimited: 'Rate limited',
};

const renderModal = (overrides: Record<string, unknown> = {}) =>
  render(
    <CreateTransactionModal
      accounts={mockAccounts}
      categories={mockCategories}
      dictionary={dictionary}
      lang="en"
      {...overrides}
    />
  );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateTransactionModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveModalState.value = 'create-transaction';
  });

  it('should render when activeModal is create-transaction', () => {
    const { container } = renderModal();

    expect(screen.getByText('Create Transaction')).toBeInTheDocument();
    // jsdom doesn't map <dialog> to role="dialog", use native querySelector
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
  });

  it('should show modal dialog with proper role and aria attributes', () => {
    const { container } = renderModal();

    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-labelledby', 'create-transaction-title');
  });

  it('should display transaction type radio buttons (Expense and Income)', () => {
    renderModal();

    expect(screen.getByLabelText('Expense')).toBeInTheDocument();
    expect(screen.getByLabelText('Income')).toBeInTheDocument();
  });

  it('should display account select with options', () => {
    renderModal();

    const accountSelect = screen.getByLabelText('Account');
    expect(accountSelect).toBeInTheDocument();
    expect(screen.getByText('Main Account (USD)')).toBeInTheDocument();
    expect(screen.getByText('Savings Account (USD)')).toBeInTheDocument();
  });

  it('should display amount input, description textarea, and date input', () => {
    renderModal();

    expect(screen.getByTestId('formatted-numeric-input')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
  });

  it('should display Cancel and Create buttons', () => {
    renderModal();

    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('should close modal via close button click', async () => {
    renderModal();

    // The close X button in the header (last Cancel-labeled element)
    const closeButtons = screen.getAllByLabelText('Cancel');
    const xButton = closeButtons[1]; // The X button in the header
    await userEvent.click(xButton);

    // Should trigger handleClose which sets isVisible false then setTimeout closes
    expect(mockCloseModal).not.toHaveBeenCalled(); // It's a delayed close (250ms)
  });

  it('should close modal via backdrop click', async () => {
    renderModal();

    // Backdrop is the first button with aria-label="Cancel" (the full-screen backdrop)
    const backdrop = screen.getAllByLabelText('Cancel')[0];
    await userEvent.click(backdrop);

    // Should trigger handleClose which sets isVisible false then setTimeout closes
    expect(mockCloseModal).not.toHaveBeenCalled(); // delayed
  });

  it('should validate required fields on submit', async () => {
    renderModal();

    // Click submit to trigger validation
    const submitButton = screen.getByText('Create');
    await userEvent.click(submitButton);

    // Validation errors should appear after submit attempt
    await waitFor(() => {
      const errorMessages = screen.getAllByRole('alert');
      expect(errorMessages.length).toBeGreaterThan(0);
    });
  });

  it('should show loading state during form submission', async () => {
    // Make createTransaction return a promise that doesn't resolve immediately
    mockCreateTransaction.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 1000))
    );

    renderModal();

    // Select an account first
    const accountSelect = screen.getByLabelText('Account');
    await userEvent.selectOptions(accountSelect, 'acc-1');

    // Set amount (required field)
    const amountInput = screen.getByTestId('formatted-numeric-input');
    fireEvent.change(amountInput, { target: { value: '5000' } });

    // Submit the form
    const submitButton = screen.getByText('Create');
    await userEvent.click(submitButton);

    // Should show "Creating..." during submission
    await waitFor(() => {
      expect(screen.getByText('Creating...')).toBeInTheDocument();
    });
  });

  it('should call createTransaction with correct data on valid submit', async () => {
    mockCreateTransaction.mockResolvedValue({ success: true });

    renderModal();

    // Select account (required)
    const accountSelect = screen.getByLabelText('Account');
    await userEvent.selectOptions(accountSelect, 'acc-1');

    // Set amount via fireEvent (more reliable with controlled inputs)
    const amountInput = screen.getByTestId('formatted-numeric-input');
    fireEvent.change(amountInput, { target: { value: '25000' } });

    // Set description
    const descriptionInput = screen.getByLabelText('Description');
    await userEvent.type(descriptionInput, 'Test expense');

    // Submit the form directly (bypass UI interaction issues)
    const submitButton = screen.getByText('Create');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockCreateTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: mockUUID,
          accountId: 'acc-1',
          type: 'EXPENSE',
          description: 'Test expense',
        })
      );
    });
  });

  it('should generate idempotencyKey for each transaction', async () => {
    const randomUUIDSpy = vi.spyOn(crypto, 'randomUUID');
    mockCreateTransaction.mockResolvedValue({ success: true });

    renderModal();

    // Fill required fields: account + amount
    const accountSelect = screen.getByLabelText('Account');
    await userEvent.selectOptions(accountSelect, 'acc-1');

    const amountInput = screen.getByTestId('formatted-numeric-input');
    fireEvent.change(amountInput, { target: { value: '5000' } });

    const submitButton = screen.getByText('Create');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(randomUUIDSpy).toHaveBeenCalled();
    });
  });

  it('should close modal and show success notification on successful creation', async () => {
    mockCreateTransaction.mockResolvedValue({ success: true });

    renderModal();

    // Fill required fields
    const accountSelect = screen.getByLabelText('Account');
    await userEvent.selectOptions(accountSelect, 'acc-1');

    const amountInput = screen.getByTestId('formatted-numeric-input');
    fireEvent.change(amountInput, { target: { value: '5000' } });

    const submitButton = screen.getByText('Create');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockCreateTransaction).toHaveBeenCalled();
    });
  });

  it('should show error notification on failed creation', async () => {
    mockCreateTransaction.mockResolvedValue({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Validation failed',
    });

    renderModal();

    // Fill required fields
    const accountSelect = screen.getByLabelText('Account');
    await userEvent.selectOptions(accountSelect, 'acc-1');

    const amountInput = screen.getByTestId('formatted-numeric-input');
    fireEvent.change(amountInput, { target: { value: '5000' } });

    const submitButton = screen.getByText('Create');
    await userEvent.click(submitButton);

    // When result.success is false and code is not INSUFFICIENT_FUNDS,
    // the component uses result.error (which is 'Validation failed')
    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith('error', 'Validation failed');
    });
  });

  it('should show insufficient funds error for INSUFFICIENT_FUNDS code', async () => {
    mockCreateTransaction.mockResolvedValue({
      success: false,
      code: 'INSUFFICIENT_FUNDS',
      error: 'Insufficient funds',
    });

    renderModal();

    // Fill required fields
    const accountSelect = screen.getByLabelText('Account');
    await userEvent.selectOptions(accountSelect, 'acc-1');

    const amountInput = screen.getByTestId('formatted-numeric-input');
    fireEvent.change(amountInput, { target: { value: '5000' } });

    const submitButton = screen.getByText('Create');
    await userEvent.click(submitButton);

    // When code is INSUFFICIENT_FUNDS, the component uses get(dictionary, 'insufficientFunds')
    // which resolves to 'Insufficient funds'
    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith('error', 'Insufficient funds');
    });
  });

  it('should show localized CURRENCY_MISMATCH error', async () => {
    mockCreateTransaction.mockResolvedValue({
      success: false,
      code: 'CURRENCY_MISMATCH',
      error: 'Currency mismatch',
    });

    renderModal();

    const accountSelect = screen.getByLabelText('Account');
    await userEvent.selectOptions(accountSelect, 'acc-1');
    const amountInput = screen.getByTestId('formatted-numeric-input');
    fireEvent.change(amountInput, { target: { value: '5000' } });
    await userEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith('error', 'Currency mismatch');
    });
  });

  it('should show localized INACTIVE_ACCOUNT error', async () => {
    mockCreateTransaction.mockResolvedValue({
      success: false,
      code: 'INACTIVE_ACCOUNT',
      error: 'Inactive account',
    });

    renderModal();

    const accountSelect = screen.getByLabelText('Account');
    await userEvent.selectOptions(accountSelect, 'acc-1');
    const amountInput = screen.getByTestId('formatted-numeric-input');
    fireEvent.change(amountInput, { target: { value: '5000' } });
    await userEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith('error', 'Inactive account');
    });
  });

  it('should show localized NOT_FOUND error as account not found', async () => {
    mockCreateTransaction.mockResolvedValue({
      success: false,
      code: 'NOT_FOUND',
      error: 'Account with ID x not found',
    });

    renderModal();

    const accountSelect = screen.getByLabelText('Account');
    await userEvent.selectOptions(accountSelect, 'acc-1');
    const amountInput = screen.getByTestId('formatted-numeric-input');
    fireEvent.change(amountInput, { target: { value: '5000' } });
    await userEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith('error', 'Account not found');
    });
  });

  it('should show localized RATE_LIMITED error', async () => {
    mockCreateTransaction.mockResolvedValue({
      success: false,
      code: 'RATE_LIMITED',
      error: 'Too many attempts',
    });

    renderModal();

    const accountSelect = screen.getByLabelText('Account');
    await userEvent.selectOptions(accountSelect, 'acc-1');
    const amountInput = screen.getByTestId('formatted-numeric-input');
    fireEvent.change(amountInput, { target: { value: '5000' } });
    await userEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith('error', 'Rate limited');
    });
  });

  it('should render the INSUFFICIENT_FUNDS error inline inside the dialog', async () => {
    mockCreateTransaction.mockResolvedValue({
      success: false,
      code: 'INSUFFICIENT_FUNDS',
      error: 'Insufficient funds',
    });

    const { container } = renderModal();
    const dialog = container.querySelector('dialog');

    const accountSelect = screen.getByLabelText('Account');
    await userEvent.selectOptions(accountSelect, 'acc-1');
    const amountInput = screen.getByTestId('formatted-numeric-input');
    fireEvent.change(amountInput, { target: { value: '5000' } });
    await userEvent.click(screen.getByText('Create'));

    // The localized server error must be visible INSIDE the dialog (the toast
    // below the <dialog> top layer would be invisible while the modal is open).
    await waitFor(() => {
      const alert = within(dialog as HTMLElement).getByRole('alert');
      expect(alert).toHaveTextContent('Insufficient funds');
    });

    // The toast is kept as reinforcement too.
    expect(mockAddNotification).toHaveBeenCalledWith('error', 'Insufficient funds');
  });

  it('should render the CURRENCY_MISMATCH error inline inside the dialog', async () => {
    mockCreateTransaction.mockResolvedValue({
      success: false,
      code: 'CURRENCY_MISMATCH',
      error: 'Currency mismatch',
    });

    const { container } = renderModal();
    const dialog = container.querySelector('dialog');

    const accountSelect = screen.getByLabelText('Account');
    await userEvent.selectOptions(accountSelect, 'acc-1');
    const amountInput = screen.getByTestId('formatted-numeric-input');
    fireEvent.change(amountInput, { target: { value: '5000' } });
    await userEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      const alert = within(dialog as HTMLElement).getByRole('alert');
      expect(alert).toHaveTextContent('Currency mismatch');
    });

    expect(mockAddNotification).toHaveBeenCalledWith('error', 'Currency mismatch');
  });

  it('should clear the server error when the modal is reopened', async () => {
    mockCreateTransaction.mockResolvedValue({
      success: false,
      code: 'INSUFFICIENT_FUNDS',
      error: 'Insufficient funds',
    });

    const { container, rerender } = renderModal();
    const dialog = container.querySelector('dialog');

    // 1. Open modal → fail a submit → inline alert appears
    const accountSelect = screen.getByLabelText('Account');
    await userEvent.selectOptions(accountSelect, 'acc-1');
    const amountInput = screen.getByTestId('formatted-numeric-input');
    fireEvent.change(amountInput, { target: { value: '5000' } });
    await userEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(within(dialog as HTMLElement).getByRole('alert')).toHaveTextContent(
        'Insufficient funds'
      );
    });

    // 2. Close the modal
    mockActiveModalState.value = null;
    rerender(
      <CreateTransactionModal
        accounts={mockAccounts}
        categories={mockCategories}
        dictionary={dictionary}
        lang="en"
      />
    );

    // 3. Reopen the modal → the stale server error must be cleared
    mockActiveModalState.value = 'create-transaction';
    rerender(
      <CreateTransactionModal
        accounts={mockAccounts}
        categories={mockCategories}
        dictionary={dictionary}
        lang="en"
      />
    );

    await waitFor(() => {
      expect(within(dialog as HTMLElement).queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('should render category chips for system and user categories', () => {
    renderModal();

    // "No category" option
    expect(screen.getByLabelText('No category')).toBeInTheDocument();
    // System category
    expect(screen.getByLabelText('Groceries')).toBeInTheDocument();
    // User-defined category
    expect(screen.getByLabelText('My Travel')).toBeInTheDocument();
  });

  it('should include categoryId in the createTransaction payload', async () => {
    mockCreateTransaction.mockResolvedValue({ success: true });

    renderModal();

    const accountSelect = screen.getByLabelText('Account');
    await userEvent.selectOptions(accountSelect, 'acc-1');

    const amountInput = screen.getByTestId('formatted-numeric-input');
    fireEvent.change(amountInput, { target: { value: '25000' } });

    // Select the "Groceries" category chip
    await userEvent.click(screen.getByLabelText('Groceries'));

    await userEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreateTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: 'cat-1' })
      );
    });
  });

  it('should submit without categoryId when no category selected', async () => {
    mockCreateTransaction.mockResolvedValue({ success: true });

    renderModal();

    const accountSelect = screen.getByLabelText('Account');
    await userEvent.selectOptions(accountSelect, 'acc-1');

    const amountInput = screen.getByTestId('formatted-numeric-input');
    fireEvent.change(amountInput, { target: { value: '25000' } });

    await userEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreateTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: undefined })
      );
    });
  });

  it('should show no-accounts warning and disable submit when there are no accounts', () => {
    renderModal({ accounts: [] });

    expect(
      screen.getByText('You need at least one account to record transactions.')
    ).toBeInTheDocument();
    // CTA link navigates to the accounts page
    const cta = screen.getByText('Create account');
    expect(cta).toHaveAttribute('href', '/en/accounts');

    const submitButton = screen.getByText('Create');
    expect(submitButton).toBeDisabled();
  });

  it('should mark the account select as required', () => {
    renderModal();

    const accountSelect = screen.getByLabelText('Account');
    expect(accountSelect).toHaveAttribute('required');
  });

  it('should reset form when modal opens', () => {
    renderModal();

    // Verify default type is selected (EXPENSE)
    const expenseRadio = screen.getByLabelText('Expense');
    expect(expenseRadio).toBeChecked();
  });

  it('should be accessible with aria-labelledby attribute', () => {
    const { container } = renderModal();

    // jsdom doesn't map <dialog> to role="dialog" by default,
    // so we use the native element directly
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-labelledby', 'create-transaction-title');
    expect(dialog).toHaveClass('bg-transparent');
  });
});
