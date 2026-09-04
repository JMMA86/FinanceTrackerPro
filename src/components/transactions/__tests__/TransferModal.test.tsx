/**
 * TransferModal Component Tests
 * Tests modal open/close, source/destination selects, validation, submission
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransferModal, TransferFormSchema } from '../TransferModal';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAddNotification = vi.fn();
vi.mock('@/store/ui.store', () => ({
  useUIStore: vi.fn((selector) => {
    const state = {
      addNotification: mockAddNotification,
    };
    return selector(state);
  }),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const labels: Record<string, string> = {
      transferButton: 'Transfer',
      transferTitle: 'Transfer between accounts',
      transferFrom: 'From account',
      transferTo: 'To account',
      selectTransferFrom: 'Select the source account',
      selectTransferTo: 'Select the destination account',
      transferAmount: 'Amount',
      transferDescription: 'Description (optional)',
      transferSuccess: 'Transfer completed',
      transferUnauthorized: 'Not authorized to perform this transfer',
      transferring: 'Transferring...',
      cancel: 'Cancel',
      transactionDate: 'Date',
      insufficientFunds: 'Insufficient funds',
      currencyMismatch: 'Currency mismatch',
      inactiveAccount: 'Inactive account',
      accountNotFound: 'Account not found',
      rateLimited: 'Rate limited',
      validationError: 'Please check the form data',
      createError: 'Error creating transaction',
    };
    return labels[key] ?? key;
  }),
}));

const mockTransfer = vi.fn();
vi.mock('@/actions/transfer.actions', () => ({
  transferBetweenAccounts: (...args: unknown[]) => mockTransfer(...args),
}));

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

const mockUUID = '550e8400-e29b-41d4-a716-446655440000';
vi.spyOn(crypto, 'randomUUID').mockReturnValue(mockUUID);

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
  {
    id: 'acc-1',
    name: 'Main Account',
    currency: 'USD',
    type: 'CHECKING',
    parentAccountId: null,
    balanceCents: 500000,
  },
  {
    id: 'acc-2',
    name: 'Savings Account',
    currency: 'USD',
    type: 'SAVINGS',
    parentAccountId: null,
    balanceCents: 500000,
  },
  {
    id: 'acc-3',
    name: 'COP Account',
    currency: 'COP',
    type: 'CHECKING',
    parentAccountId: null,
    balanceCents: 500000,
  },
];

const dictionary = {
  transferButton: 'Transfer',
  transferTitle: 'Transfer between accounts',
  transferFrom: 'From account',
  transferTo: 'To account',
  selectTransferFrom: 'Select the source account',
  selectTransferTo: 'Select the destination account',
  transferAmount: 'Amount',
  transferDescription: 'Description (optional)',
  transferSuccess: 'Transfer completed',
  transferUnauthorized: 'Not authorized to perform this transfer',
  transferring: 'Transferring...',
  cancel: 'Cancel',
  transactionDate: 'Date',
  insufficientFunds: 'Insufficient funds',
  currencyMismatch: 'Currency mismatch',
  inactiveAccount: 'Inactive account',
  accountNotFound: 'Account not found',
  rateLimited: 'Rate limited',
  validationError: 'Please check the form data',
  createError: 'Error creating transaction',
};

const mockOnClose = vi.fn();

const renderModal = (overrides: Record<string, unknown> = {}) =>
  render(
    <TransferModal
      open
      accounts={mockAccounts}
      userId="user-1"
      dictionary={dictionary}
      onClose={mockOnClose}
      {...overrides}
    />
  );

// The modal's open effect schedules a requestAnimationFrame that resets the
// form and clears the server error. In jsdom the rAF callback runs on a timer,
// so tests must let it fire BEFORE interacting — otherwise the reset wipes the
// selections mid-test. `act` absorbs the rAF-triggered state updates.
async function renderAndOpen(overrides: Record<string, unknown> = {}) {
  const result = renderModal(overrides);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TransferModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the dialog with title and aria-labelledby', () => {
    const { container } = renderModal();

    expect(screen.getByText('Transfer between accounts')).toBeInTheDocument();
    const dialog = container.querySelector('dialog');
    expect(dialog).toHaveAttribute('aria-labelledby', 'transfer-title');
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  });

  it('should render source select with all accounts and disable destination until source is picked', async () => {
    const user = userEvent.setup();
    await renderAndOpen();

    const fromSelect = screen.getByLabelText('From account');
    const toSelect = screen.getByLabelText('To account');

    // Destination is disabled until a source account is selected
    expect(toSelect).toBeDisabled();

    await user.selectOptions(fromSelect, 'acc-1');

    expect(toSelect).toBeEnabled();
    // Source account is excluded from the destination options
    expect(within(toSelect).getByText('Savings Account (USD)')).toBeInTheDocument();
    expect(within(toSelect).getByText('COP Account (COP)')).toBeInTheDocument();
    expect(within(toSelect).queryByText('Main Account (USD)')).not.toBeInTheDocument();
  });

  it('should show the currency of the selected source account in the amount label', async () => {
    const user = userEvent.setup();
    await renderAndOpen();

    // No source selected yet → no currency suffix
    expect(screen.getByLabelText('Amount')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('From account'), 'acc-3');

    expect(screen.getByLabelText('Amount (COP)')).toBeInTheDocument();
  });

  it('should reset the destination when the source changes to the selected destination', async () => {
    const user = userEvent.setup();
    await renderAndOpen();

    await user.selectOptions(screen.getByLabelText('From account'), 'acc-1');
    await user.selectOptions(screen.getByLabelText('To account'), 'acc-2');

    // Change the source to the current destination → destination is cleared
    await user.selectOptions(screen.getByLabelText('From account'), 'acc-2');

    const toSelect = screen.getByLabelText('To account');
    expect(toSelect).toHaveValue('');
  });

  it('should show validation errors when submitting an empty form', async () => {
    const user = userEvent.setup();
    await renderAndOpen();

    await user.click(screen.getByText('Transfer'));

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThan(0);
    });
    expect(mockTransfer).not.toHaveBeenCalled();
  });

  it('should show an amount validation error when the amount is zero', async () => {
    const user = userEvent.setup();
    await renderAndOpen();

    await user.selectOptions(screen.getByLabelText('From account'), 'acc-1');
    await user.selectOptions(screen.getByLabelText('To account'), 'acc-2');

    // Amount stays at 0 → positive() fails on submit
    await user.click(screen.getByText('Transfer'));

    await waitFor(() => {
      expect(screen.getByText('Amount must be greater than 0')).toBeInTheDocument();
    });
  });

  it('should reject a transfer to the same account at the schema level', () => {
    const result = TransferFormSchema.safeParse({
      fromAccountId: 'acc-1',
      toAccountId: 'acc-1',
      amountCents: 5000,
      description: '',
      date: '2024-06-15T14:30',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('toAccountId');
    }
  });

  it('should call transferBetweenAccounts with the correct payload on valid submit', async () => {
    mockTransfer.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    await renderAndOpen();

    await user.selectOptions(screen.getByLabelText('From account'), 'acc-1');
    await user.selectOptions(screen.getByLabelText('To account'), 'acc-2');

    const amountInput = screen.getByTestId('formatted-numeric-input');
    fireEvent.change(amountInput, { target: { value: '25000' } });

    await user.type(screen.getByLabelText('Description (optional)'), 'Monthly savings');

    await user.click(screen.getByText('Transfer'));

    await waitFor(() => {
      expect(mockTransfer).toHaveBeenCalledWith({
        idempotencyKey: mockUUID,
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amountCents: 25000,
        currency: 'USD',
        description: 'Monthly savings',
        date: expect.any(Date),
        userId: 'user-1',
      });
    });
  });

  it('should send the currency of the selected source account', async () => {
    mockTransfer.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    await renderAndOpen();

    await user.selectOptions(screen.getByLabelText('From account'), 'acc-3');
    await user.selectOptions(screen.getByLabelText('To account'), 'acc-1');

    fireEvent.change(screen.getByTestId('formatted-numeric-input'), {
      target: { value: '10000' },
    });

    await user.click(screen.getByText('Transfer'));

    await waitFor(() => {
      expect(mockTransfer).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'COP', fromAccountId: 'acc-3', toAccountId: 'acc-1' })
      );
    });
  });

  it('should show a success notification and close on successful transfer', async () => {
    mockTransfer.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    await renderAndOpen();

    await user.selectOptions(screen.getByLabelText('From account'), 'acc-1');
    await user.selectOptions(screen.getByLabelText('To account'), 'acc-2');
    fireEvent.change(screen.getByTestId('formatted-numeric-input'), {
      target: { value: '5000' },
    });
    await user.click(screen.getByText('Transfer'));

    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith('success', 'Transfer completed');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('should keep the modal open and show the error inline on INSUFFICIENT_FUNDS', async () => {
    mockTransfer.mockResolvedValue({
      success: false,
      code: 'INSUFFICIENT_FUNDS',
      error: 'Insufficient funds',
    });
    const user = userEvent.setup();
    const { container } = await renderAndOpen();

    await user.selectOptions(screen.getByLabelText('From account'), 'acc-1');
    await user.selectOptions(screen.getByLabelText('To account'), 'acc-2');
    fireEvent.change(screen.getByTestId('formatted-numeric-input'), {
      target: { value: '5000' },
    });
    await user.click(screen.getByText('Transfer'));

    await waitFor(() => {
      const dialog = container.querySelector('dialog');
      const alert = within(dialog as HTMLElement).getByRole('alert');
      expect(alert).toHaveTextContent('Insufficient funds');
    });
    expect(mockOnClose).not.toHaveBeenCalled();
    expect(mockAddNotification).toHaveBeenCalledWith('error', 'Insufficient funds');
  });

  it('should show the localized UNAUTHORIZED message', async () => {
    mockTransfer.mockResolvedValue({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'Not authorized',
    });
    const user = userEvent.setup();
    await renderAndOpen();

    await user.selectOptions(screen.getByLabelText('From account'), 'acc-1');
    await user.selectOptions(screen.getByLabelText('To account'), 'acc-2');
    fireEvent.change(screen.getByTestId('formatted-numeric-input'), {
      target: { value: '5000' },
    });
    await user.click(screen.getByText('Transfer'));

    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith(
        'error',
        'Not authorized to perform this transfer'
      );
    });
  });

  it('should disable submit when no userId is provided', () => {
    renderModal({ userId: '' });

    const submitButton = screen.getByText('Transfer');
    expect(submitButton).toBeDisabled();
  });

  it('should disable submit when fewer than two accounts exist', () => {
    renderModal({ accounts: [mockAccounts[0]] });

    const submitButton = screen.getByText('Transfer');
    expect(submitButton).toBeDisabled();
  });

  it('should clear the server error when the modal is reopened', async () => {
    mockTransfer.mockResolvedValue({
      success: false,
      code: 'INSUFFICIENT_FUNDS',
      error: 'Insufficient funds',
    });
    const user = userEvent.setup();
    const { container, rerender } = await renderAndOpen();

    // 1. Fail a submit → inline alert appears
    await user.selectOptions(screen.getByLabelText('From account'), 'acc-1');
    await user.selectOptions(screen.getByLabelText('To account'), 'acc-2');
    fireEvent.change(screen.getByTestId('formatted-numeric-input'), {
      target: { value: '5000' },
    });
    await user.click(screen.getByText('Transfer'));

    await waitFor(() => {
      const dialog = container.querySelector('dialog');
      expect(within(dialog as HTMLElement).getByRole('alert')).toHaveTextContent(
        'Insufficient funds'
      );
    });

    // 2. Close and reopen → stale server error must be cleared
    rerender(
      <TransferModal
        open={false}
        accounts={mockAccounts}
        userId="user-1"
        dictionary={dictionary}
        onClose={mockOnClose}
      />
    );
    rerender(
      <TransferModal
        open
        accounts={mockAccounts}
        userId="user-1"
        dictionary={dictionary}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      const dialog = container.querySelector('dialog');
      expect(within(dialog as HTMLElement).queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
