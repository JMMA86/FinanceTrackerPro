/**
 * DeleteCreditCardModal Component Tests
 * Uses the REAL Zustand UI store with modalData (cardId, cardName, debt, currency).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useUIStore } from '@/store/ui.store';
import { DeleteCreditCardModal } from '../DeleteCreditCardModal';

const mockDeleteCreditCard = vi.fn();
vi.mock('@/actions/credit-card.actions', () => ({
  deleteCreditCard: (...args: unknown[]) => mockDeleteCreditCard(...args),
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

vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn((cents: number, currency: string) => `${currency} ${cents}`),
}));

const CARD_ID = 'clhcard0000000000000001';

function getLastNotification() {
  const notifications = useUIStore.getState().notifications;
  return notifications[notifications.length - 1];
}

describe('DeleteCreditCardModal', () => {
  const renderModal = () => render(<DeleteCreditCardModal dictionary={{}} locale="es-CO" />);

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

  it('opens and shows the card name and delete title', () => {
    useUIStore.getState().openModal('delete-credit-card', {
      cardId: CARD_ID,
      cardName: 'Visa Oro',
      debtCents: 0,
      currency: 'COP',
    });
    renderModal();

    expect(screen.getByText('deleteCardTitle')).toBeInTheDocument();
    expect(screen.getByText('"Visa Oro"')).toBeInTheDocument();
    expect(screen.getByText('deleteCardMessage')).toBeInTheDocument();
  });

  it('shows the outstanding debt amount when debt is present', () => {
    useUIStore.getState().openModal('delete-credit-card', {
      cardId: CARD_ID,
      cardName: 'Visa Oro',
      debtCents: 150000,
      currency: 'COP',
    });
    renderModal();

    // The formatted debt (inside its own span) is rendered next to the debt label.
    expect(screen.getByText('COP 150000')).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent?.includes('debt'))
    ).toBeInTheDocument();
  });

  it('confirms deletion and calls deleteCreditCard with the accountId', async () => {
    mockDeleteCreditCard.mockResolvedValue({ success: true, data: undefined });
    useUIStore.getState().openModal('delete-credit-card', {
      cardId: CARD_ID,
      cardName: 'Visa Oro',
      debtCents: 0,
      currency: 'COP',
    });
    renderModal();

    fireEvent.click(screen.getByText('delete'));

    await waitFor(() => {
      expect(mockDeleteCreditCard).toHaveBeenCalledWith({ accountId: CARD_ID });
    });

    // Success path includes a 1s delay before close + notification + custom event.
    await waitFor(
      () => {
        expect(getLastNotification()?.type).toBe('success');
      },
      { timeout: 3000 }
    );
    expect(useUIStore.getState().activeModal).toBeNull();
  });

  it('renders CARD_HAS_BALANCE inline and keeps the modal open', async () => {
    mockDeleteCreditCard.mockResolvedValue({
      success: false,
      code: 'CARD_HAS_BALANCE',
      error: 'debt',
    });
    useUIStore.getState().openModal('delete-credit-card', {
      cardId: CARD_ID,
      cardName: 'Visa Oro',
      debtCents: 100000,
      currency: 'COP',
    });
    renderModal();

    fireEvent.click(screen.getByText('delete'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('cardHasDebt');
    });
    expect(getLastNotification()?.type).toBe('error');
    expect(getLastNotification()?.message).toBe('cardHasDebt');
    expect(useUIStore.getState().activeModal).toBe('delete-credit-card');
  });

  it('renders a generic error for other failures', async () => {
    mockDeleteCreditCard.mockResolvedValue({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'invalid',
    });
    useUIStore.getState().openModal('delete-credit-card', {
      cardId: CARD_ID,
      cardName: 'Visa',
      debtCents: 0,
      currency: 'COP',
    });
    renderModal();

    fireEvent.click(screen.getByText('delete'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('errors.deleteFailed');
    });
  });
});
