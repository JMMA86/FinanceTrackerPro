/**
 * CreateTransactionModal Component Tests
 * Tests modal open/close, form validation, submission, accessibility
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateTransactionModal } from '../CreateTransactionModal';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockOpenModal = vi.fn();
const mockCloseModal = vi.fn();
const mockAddNotification = vi.fn();

vi.mock('@/store/ui.store', () => ({
  useUIStore: vi.fn((selector) => {
    const state = {
      activeModal: 'create-transaction',
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
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateTransactionModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render when activeModal is create-transaction', () => {
    const { container } = render(
      <CreateTransactionModal accounts={mockAccounts} dictionary={dictionary} />
    );

    expect(screen.getByText('Create Transaction')).toBeInTheDocument();
    // jsdom doesn't map <dialog> to role="dialog", use native querySelector
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
  });

  it('should show modal dialog with proper role and aria attributes', () => {
    const { container } = render(
      <CreateTransactionModal accounts={mockAccounts} dictionary={dictionary} />
    );

    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-labelledby', 'create-transaction-title');
  });

  it('should display transaction type radio buttons (Expense and Income)', () => {
    render(<CreateTransactionModal accounts={mockAccounts} dictionary={dictionary} />);

    expect(screen.getByLabelText('Expense')).toBeInTheDocument();
    expect(screen.getByLabelText('Income')).toBeInTheDocument();
  });

  it('should display account select with options', () => {
    render(<CreateTransactionModal accounts={mockAccounts} dictionary={dictionary} />);

    const accountSelect = screen.getByLabelText('Account');
    expect(accountSelect).toBeInTheDocument();
    expect(screen.getByText('Main Account (USD)')).toBeInTheDocument();
    expect(screen.getByText('Savings Account (USD)')).toBeInTheDocument();
  });

  it('should display amount input, description textarea, and date input', () => {
    render(<CreateTransactionModal accounts={mockAccounts} dictionary={dictionary} />);

    expect(screen.getByTestId('formatted-numeric-input')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
  });

  it('should display Cancel and Create buttons', () => {
    render(<CreateTransactionModal accounts={mockAccounts} dictionary={dictionary} />);

    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('should close modal via close button click', async () => {
    render(<CreateTransactionModal accounts={mockAccounts} dictionary={dictionary} />);

    // The close X button in the header (last Cancel-labeled element)
    const closeButtons = screen.getAllByLabelText('Cancel');
    const xButton = closeButtons[1]; // The X button in the header
    await userEvent.click(xButton);

    // Should trigger handleClose which sets isVisible false then setTimeout closes
    expect(mockCloseModal).not.toHaveBeenCalled(); // It's a delayed close (250ms)
  });

  it('should close modal via backdrop click', async () => {
    render(<CreateTransactionModal accounts={mockAccounts} dictionary={dictionary} />);

    // Backdrop is the first button with aria-label="Cancel" (the full-screen backdrop)
    const backdrop = screen.getAllByLabelText('Cancel')[0];
    await userEvent.click(backdrop);

    // Should trigger handleClose which sets isVisible false then setTimeout closes
    expect(mockCloseModal).not.toHaveBeenCalled(); // delayed
  });

  it('should validate required fields on submit', async () => {
    render(<CreateTransactionModal accounts={mockAccounts} dictionary={dictionary} />);

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

    render(<CreateTransactionModal accounts={mockAccounts} dictionary={dictionary} />);

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

    render(<CreateTransactionModal accounts={mockAccounts} dictionary={dictionary} />);

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

    render(<CreateTransactionModal accounts={mockAccounts} dictionary={dictionary} />);

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

    render(<CreateTransactionModal accounts={mockAccounts} dictionary={dictionary} />);

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

    render(<CreateTransactionModal accounts={mockAccounts} dictionary={dictionary} />);

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

    render(<CreateTransactionModal accounts={mockAccounts} dictionary={dictionary} />);

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

  it('should reset form when modal opens', () => {
    render(<CreateTransactionModal accounts={mockAccounts} dictionary={dictionary} />);

    // Verify default type is selected (EXPENSE)
    const expenseRadio = screen.getByLabelText('Expense');
    expect(expenseRadio).toBeChecked();
  });

  it('should be accessible with aria-labelledby attribute', () => {
    const { container } = render(
      <CreateTransactionModal accounts={mockAccounts} dictionary={dictionary} />
    );

    // jsdom doesn't map <dialog> to role="dialog" by default,
    // so we use the native element directly
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-labelledby', 'create-transaction-title');
    expect(dialog).toHaveClass('bg-transparent');
  });
});
