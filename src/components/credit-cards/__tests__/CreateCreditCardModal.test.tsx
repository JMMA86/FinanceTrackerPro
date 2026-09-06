/**
 * CreateCreditCardModal Component Tests
 * Uses the REAL Zustand UI store. The modal opens via
 * `useUIStore.getState().openModal('create-credit-card')`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useUIStore } from '@/store/ui.store';
import { CreateCreditCardModal } from '../CreateCreditCardModal';

const mockCreateCreditCard = vi.fn();
vi.mock('@/actions/credit-card.actions', () => ({
  createCreditCard: (...args: unknown[]) => mockCreateCreditCard(...args),
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

function getLastNotification() {
  const notifications = useUIStore.getState().notifications;
  return notifications[notifications.length - 1];
}

describe('CreateCreditCardModal', () => {
  const renderModal = () => render(<CreateCreditCardModal dictionary={{}} />);

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

  it('opens when activeModal is create-credit-card', () => {
    useUIStore.getState().openModal('create-credit-card');
    const { container } = renderModal();

    expect(screen.getByText('addCard')).toBeInTheDocument();
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('open');
  });

  it('renders the card form fields', () => {
    useUIStore.getState().openModal('create-credit-card');
    renderModal();

    expect(screen.getByLabelText('cardName')).toBeInTheDocument();
    expect(screen.getByLabelText('currency')).toBeInTheDocument();
    expect(screen.getByLabelText('creditLimit')).toBeInTheDocument();
    expect(screen.getByLabelText('cutoffDay')).toBeInTheDocument();
    expect(screen.getByLabelText('paymentDueDay')).toBeInTheDocument();
    expect(screen.getByText('paymentNetwork')).toBeInTheDocument();
  });

  it('shows an inline validation error when cutoffDay equals paymentDueDay', async () => {
    useUIStore.getState().openModal('create-credit-card');
    const { container } = renderModal();

    fireEvent.change(screen.getByLabelText('cardName'), { target: { value: 'Visa Oro' } });
    fireEvent.change(screen.getByLabelText('cutoffDay'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('paymentDueDay'), { target: { value: '15' } });
    fireEvent.change(screen.getByTestId('numeric-input-cc-limit'), {
      target: { value: '1000000' },
    });

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(
        screen.getByText('Payment due day cannot be the same as the cutoff day')
      ).toBeInTheDocument();
    });
    expect(mockCreateCreditCard).not.toHaveBeenCalled();
  });

  it('submits valid data with an idempotencyKey and closes on success', async () => {
    mockCreateCreditCard.mockResolvedValue({ success: true, data: { account: { id: 'card-1' } } });
    useUIStore.getState().openModal('create-credit-card');
    const { container } = renderModal();

    fireEvent.change(screen.getByLabelText('cardName'), { target: { value: 'Visa Oro' } });
    fireEvent.change(screen.getByTestId('numeric-input-cc-limit'), {
      target: { value: '5000000' },
    });
    fireEvent.change(screen.getByLabelText('cutoffDay'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('paymentDueDay'), { target: { value: '25' } });

    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateCreditCard).toHaveBeenCalled();
    });
    const arg = mockCreateCreditCard.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.name).toBe('Visa Oro');
    expect(arg.creditLimitCents).toBe(5000000);
    expect(arg.cutoffDay).toBe(10);
    expect(arg.paymentDueDay).toBe(25);
    expect(arg.currency).toBe('COP');
    expect(arg.cardNetwork).toBe('NONE');
    expect(arg.idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/);

    await waitFor(() => {
      expect(getLastNotification()?.type).toBe('success');
    });
    expect(useUIStore.getState().activeModal).toBeNull();
  });

  it('sends the selected cardColor and cardNetwork', async () => {
    mockCreateCreditCard.mockResolvedValue({ success: true, data: { account: { id: 'card-1' } } });
    useUIStore.getState().openModal('create-credit-card');
    const { container } = renderModal();

    fireEvent.change(screen.getByLabelText('cardName'), { target: { value: 'Visa' } });
    fireEvent.change(screen.getByTestId('numeric-input-cc-limit'), {
      target: { value: '5000000' },
    });
    fireEvent.click(screen.getByText('visa'));
    fireEvent.click(screen.getByLabelText('blue'));

    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateCreditCard).toHaveBeenCalled();
    });
    const arg = mockCreateCreditCard.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.cardNetwork).toBe('VISA');
    expect(arg.cardColor).toBe('blue');
  });

  it('renders an inline server error and keeps the modal open on failure', async () => {
    mockCreateCreditCard.mockResolvedValue({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'invalid',
    });
    useUIStore.getState().openModal('create-credit-card');
    const { container } = renderModal();

    fireEvent.change(screen.getByLabelText('cardName'), { target: { value: 'Visa' } });
    fireEvent.change(screen.getByTestId('numeric-input-cc-limit'), {
      target: { value: '5000000' },
    });
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('errors.createFailed');
    });
    expect(useUIStore.getState().activeModal).toBe('create-credit-card');
  });

  it('maps SESSION_INVALID to the session error message', async () => {
    mockCreateCreditCard.mockResolvedValue({
      success: false,
      code: 'SESSION_INVALID',
      error: 'session',
    });
    useUIStore.getState().openModal('create-credit-card');
    const { container } = renderModal();

    fireEvent.change(screen.getByLabelText('cardName'), { target: { value: 'Visa' } });
    fireEvent.change(screen.getByTestId('numeric-input-cc-limit'), {
      target: { value: '5000000' },
    });
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('errors.sessionInvalid');
    });
  });

  it('closes the modal when the dialog close event fires', () => {
    useUIStore.getState().openModal('create-credit-card');
    const { container } = renderModal();

    const dialog = container.querySelector('dialog')!;
    fireEvent(dialog, new Event('close'));
    expect(useUIStore.getState().activeModal).toBeNull();
  });
});
