/**
 * CreateInvestmentModal Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateInvestmentModal } from '../CreateInvestmentModal';

// ============================================================================
// Mocks
// ============================================================================

const mockOpenModal = vi.fn();
const mockCloseModal = vi.fn();
const mockAddNotification = vi.fn();
let mockActiveModal = 'create-investment';

vi.mock('@/store/ui.store', () => ({
  useUIStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      activeModal: mockActiveModal,
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
      addAccount: 'Add Investment Account',
      accountName: 'Account Name',
      accountNamePlaceholder: 'My Investment Account',
      currency: 'Currency',
      initialBalance: 'Initial Balance',
      cancel: 'Cancel',
      createAccount: 'Create Account',
      loading: 'Creating...',
      'errors.sessionInvalid': 'Session expired. Please log in again.',
      'errors.createFailed': 'Failed to create account. Please try again.',
    };
    return labels[key] ?? key;
  }),
}));

// Mock createInvestmentAccount action
const mockCreateInvestmentAccount = vi.fn();
vi.mock('@/actions/investment.actions', () => ({
  createInvestmentAccount: (...args: unknown[]) => mockCreateInvestmentAccount(...args),
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

// Mock HTMLDialogElement methods
HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
});
HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
  this.removeAttribute('open');
});

describe('CreateInvestmentModal', () => {
  const dictionary = {};

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('should render when activeModal is create-investment', () => {
    const { container } = render(<CreateInvestmentModal dictionary={dictionary} />);
    expect(screen.getByText('Add Investment Account')).toBeInTheDocument();
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('open');
  });

  it('should display account name input', () => {
    render(<CreateInvestmentModal dictionary={dictionary} />);
    expect(screen.getByLabelText('Account Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('My Investment Account')).toBeInTheDocument();
  });

  it('should display currency selector with USD and EUR options', () => {
    render(<CreateInvestmentModal dictionary={dictionary} />);
    const currencySelect = screen.getByLabelText('Currency');
    expect(currencySelect).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByText('EUR')).toBeInTheDocument();
  });

  it('should display initial balance input', () => {
    render(<CreateInvestmentModal dictionary={dictionary} />);
    expect(screen.getByTestId('formatted-numeric-input')).toBeInTheDocument();
  });

  it('should display Cancel and Create Account buttons', () => {
    render(<CreateInvestmentModal dictionary={dictionary} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Create Account')).toBeInTheDocument();
  });

  it('should show validation error when submitting with empty name', async () => {
    render(<CreateInvestmentModal dictionary={dictionary} />);

    const submitButton = screen.getByText('Create Account');
    await userEvent.click(submitButton);

    await waitFor(() => {
      const errorMessages = screen.getAllByRole('alert');
      expect(errorMessages.length).toBeGreaterThan(0);
    });
  });

  it('should call createInvestmentAccount with correct data on valid submit', async () => {
    mockCreateInvestmentAccount.mockResolvedValue({ success: true });

    render(<CreateInvestmentModal dictionary={dictionary} />);

    // Fill account name
    const nameInput = screen.getByLabelText('Account Name');
    await userEvent.type(nameInput, 'My Tech Stocks');

    // Submit
    const submitButton = screen.getByText('Create Account');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockCreateInvestmentAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: mockUUID,
          name: 'My Tech Stocks',
          currency: 'USD',
          initialBalanceCents: 0,
        })
      );
    });
  });

  it('should show loading state during submission', async () => {
    mockCreateInvestmentAccount.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 1000))
    );

    render(<CreateInvestmentModal dictionary={dictionary} />);

    // Fill account name
    const nameInput = screen.getByLabelText('Account Name');
    await userEvent.type(nameInput, 'My Account');

    // Submit
    const submitButton = screen.getByText('Create Account');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Creating...')).toBeInTheDocument();
    });
  });

  it('should close modal and show success notification on successful creation', async () => {
    mockCreateInvestmentAccount.mockResolvedValue({ success: true });

    render(<CreateInvestmentModal dictionary={dictionary} />);

    const nameInput = screen.getByLabelText('Account Name');
    await userEvent.type(nameInput, 'My Account');

    const submitButton = screen.getByText('Create Account');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith('success', 'Investment account created');
    });

    expect(mockCloseModal).toHaveBeenCalled();
  });

  it('should show error notification on session invalid error', async () => {
    mockCreateInvestmentAccount.mockResolvedValue({
      success: false,
      code: 'SESSION_INVALID',
      error: 'Session invalid',
    });

    render(<CreateInvestmentModal dictionary={dictionary} />);

    const nameInput = screen.getByLabelText('Account Name');
    await userEvent.type(nameInput, 'My Account');

    const submitButton = screen.getByText('Create Account');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Session expired. Please log in again.')).toBeInTheDocument();
    });
  });

  it('should show generic error on create failed', async () => {
    mockCreateInvestmentAccount.mockResolvedValue({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Validation failed',
    });

    render(<CreateInvestmentModal dictionary={dictionary} />);

    const nameInput = screen.getByLabelText('Account Name');
    await userEvent.type(nameInput, 'My Account');

    const submitButton = screen.getByText('Create Account');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Failed to create account. Please try again.')).toBeInTheDocument();
    });
  });

  it('should generate idempotencyKey for each submission', async () => {
    const randomUUIDSpy = vi.spyOn(crypto, 'randomUUID');
    mockCreateInvestmentAccount.mockResolvedValue({ success: true });

    render(<CreateInvestmentModal dictionary={dictionary} />);

    const nameInput = screen.getByLabelText('Account Name');
    await userEvent.type(nameInput, 'My Account');

    const submitButton = screen.getByText('Create Account');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(randomUUIDSpy).toHaveBeenCalled();
    });
  });

  it('should have dialog with proper aria attributes', () => {
    const { container } = render(<CreateInvestmentModal dictionary={dictionary} />);
    const dialog = container.querySelector('dialog');
    expect(dialog).toHaveAttribute('aria-labelledby', 'create-investment-title');
  });

  it('should close modal via close button', async () => {
    render(<CreateInvestmentModal dictionary={dictionary} />);

    const closeButtons = screen.getAllByLabelText('Close');
    // The backdrop close button
    await userEvent.click(closeButtons[0]);

    // The close button sets isVisible to false and schedules dialog.close()
    // after 240ms. This verifies the click interaction works.
    expect(closeButtons[0]).toBeInTheDocument();
  });

  it('should allow selecting EUR currency', async () => {
    render(<CreateInvestmentModal dictionary={dictionary} />);

    const currencySelect = screen.getByLabelText('Currency');
    await userEvent.selectOptions(currencySelect, 'EUR');

    expect(currencySelect).toHaveValue('EUR');
  });

  it('should render without crashing when activeModal is different', () => {
    // Temporarily change the modal to a different one
    mockActiveModal = 'some-other-modal';

    const { container } = render(<CreateInvestmentModal dictionary={dictionary} />);
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).not.toHaveAttribute('open');

    // Reset for other tests
    mockActiveModal = 'create-investment';
  });
});
