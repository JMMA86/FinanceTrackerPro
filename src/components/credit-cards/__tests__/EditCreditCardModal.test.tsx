/**
 * EditCreditCardModal Component Tests
 * Uses the REAL Zustand UI store with modalData holding the target cardId.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useUIStore } from '@/store/ui.store';
import { EditCreditCardModal } from '../EditCreditCardModal';
import type { CreditCard } from '../credit-card.types';

const mockUpdateCreditCard = vi.fn();
vi.mock('@/actions/credit-card.actions', () => ({
  updateCreditCard: (...args: unknown[]) => mockUpdateCreditCard(...args),
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

const CARD_ID = 'clhcard0000000000000001';

const card: CreditCard = {
  id: CARD_ID,
  name: 'Visa Oro',
  currency: 'COP',
  balanceCents: -100000,
  creditLimitCents: 5000000,
  cutoffDay: 10,
  paymentDueDay: 25,
  cardColor: 'blue',
  cardNetwork: 'VISA',
  createdAt: new Date('2026-01-01'),
  transactions: [],
  debtCents: 100000,
  availableCreditCents: 4900000,
  paymentStatus: 'ON_TRACK',
};

function getLastNotification() {
  const notifications = useUIStore.getState().notifications;
  return notifications[notifications.length - 1];
}

describe('EditCreditCardModal', () => {
  const renderModal = () => render(<EditCreditCardModal cards={[card]} dictionary={{}} />);

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

  it('returns null when the modal is closed', () => {
    const { container } = renderModal();
    expect(container.querySelector('dialog')).toBeNull();
  });

  it('prefills the form from the target card', async () => {
    useUIStore.getState().openModal('edit-credit-card', { cardId: CARD_ID });
    renderModal();

    const nameInput = screen.getByLabelText('cardName') as HTMLInputElement;
    expect(nameInput.value).toBe('Visa Oro');
    await waitFor(() => {
      const limitInput = screen.getByTestId('numeric-input-edit-cc-limit') as HTMLInputElement;
      expect(limitInput.value).toBe('5000000');
    });
    const cutoffInput = screen.getByLabelText('cutoffDay') as HTMLInputElement;
    expect(cutoffInput.value).toBe('10');
    const dueInput = screen.getByLabelText('paymentDueDay') as HTMLInputElement;
    expect(dueInput.value).toBe('25');
  });

  it('submits the update with the card accountId', async () => {
    mockUpdateCreditCard.mockResolvedValue({ success: true, data: { account: { id: CARD_ID } } });
    useUIStore.getState().openModal('edit-credit-card', { cardId: CARD_ID });
    const { container } = renderModal();

    fireEvent.change(screen.getByLabelText('cardName'), { target: { value: 'Visa Negra' } });
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockUpdateCreditCard).toHaveBeenCalled();
    });
    const arg = mockUpdateCreditCard.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.accountId).toBe(CARD_ID);
    expect(arg.name).toBe('Visa Negra');

    await waitFor(() => {
      expect(getLastNotification()?.type).toBe('success');
    });
    expect(useUIStore.getState().activeModal).toBeNull();
  });

  it('renders an inline server error and keeps the modal open on failure', async () => {
    mockUpdateCreditCard.mockResolvedValue({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'invalid',
    });
    useUIStore.getState().openModal('edit-credit-card', { cardId: CARD_ID });
    const { container } = renderModal();

    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('errors.updateFailed');
    });
    expect(useUIStore.getState().activeModal).toBe('edit-credit-card');
  });

  it('maps SESSION_INVALID to the session error message', async () => {
    mockUpdateCreditCard.mockResolvedValue({
      success: false,
      code: 'SESSION_INVALID',
      error: 'session',
    });
    useUIStore.getState().openModal('edit-credit-card', { cardId: CARD_ID });
    const { container } = renderModal();

    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('errors.sessionInvalid');
    });
  });
});
