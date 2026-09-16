/**
 * CreditCardsSection Component Tests
 * Header, empty state, grid, card selection → detail, modal mounting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreditCardsSection } from '../CreditCardsSection';
import type { CreditCard } from '../credit-card.types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const mockOpenModal = vi.fn();
vi.mock('@/store/ui.store', () => ({
  useUIStore: vi.fn((selector) => {
    const state = {
      activeModal: null,
      modalData: null,
      openModal: mockOpenModal,
      closeModal: vi.fn(),
      addNotification: vi.fn(),
    };
    return selector(state);
  }),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => key),
}));

// Heavy modal implementations are mocked so this suite focuses on the section.
vi.mock('@/components/credit-cards/CreateCreditCardModal', () => ({
  CreateCreditCardModal: () => <div data-testid="create-modal" />,
}));
vi.mock('@/components/credit-cards/EditCreditCardModal', () => ({
  EditCreditCardModal: () => <div data-testid="edit-modal" />,
}));
vi.mock('@/components/credit-cards/DeleteCreditCardModal', () => ({
  DeleteCreditCardModal: () => <div data-testid="delete-modal" />,
}));
vi.mock('@/components/credit-cards/PayCreditCardModal', () => ({
  PayCreditCardModal: (props: { open: boolean; cards: unknown[]; initialCardId?: string }) => (
    <div
      data-testid="pay-modal"
      data-open={String(props.open)}
      data-initial={props.initialCardId ?? ''}
    />
  ),
}));

// Mock CreditCardCard to a simple button exposing the click handler.
vi.mock('@/components/credit-cards/CreditCardCard', () => ({
  CreditCardCard: ({ card, onSelect }: { card: CreditCard; onSelect: (id: string) => void }) => (
    <button type="button" onClick={() => onSelect(card.id)} data-testid={`card-${card.id}`}>
      {card.name}
    </button>
  ),
}));

const mockDetailProps = vi.fn();
vi.mock('@/components/credit-cards/CreditCardDetail', () => ({
  CreditCardDetail: (props: Record<string, unknown>) => {
    mockDetailProps(props);
    return <div data-testid="card-detail" data-open={String(props.isOpen)} />;
  },
}));

const baseCard: CreditCard = {
  id: 'clhcard0000000000000001',
  name: 'Visa Oro',
  currency: 'COP',
  balanceCents: -100000,
  creditLimitCents: 1000000,
  cutoffDay: 10,
  paymentDueDay: 25,
  cardColor: 'blue',
  cardNetwork: 'VISA',
  createdAt: new Date('2026-01-01'),
  transactions: [],
  debtCents: 100000,
  availableCreditCents: 900000,
  paymentStatus: 'ON_TRACK',
};

const renderSection = (cards: CreditCard[] = [baseCard]) =>
  render(<CreditCardsSection cards={cards} dictionary={{}} locale="es-CO" />);

describe('CreditCardsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the section header and the New Card button', () => {
    renderSection();
    expect(screen.getByText('sections')).toBeInTheDocument();
    expect(screen.getByText('addCard')).toBeInTheDocument();
  });

  it('opens the create modal when the New Card button is clicked', () => {
    renderSection();
    fireEvent.click(screen.getByText('addCard'));
    expect(mockOpenModal).toHaveBeenCalledWith('create-credit-card');
  });

  it('renders the empty state when there are no cards', () => {
    renderSection([]);
    expect(screen.getByText('noCards')).toBeInTheDocument();
    expect(screen.getByText('noCardsDesc')).toBeInTheDocument();
  });

  it('renders one card per entry in the grid', () => {
    const cards = [
      baseCard,
      { ...baseCard, id: 'clhcard0000000000000002', name: 'Mastercard Negra' },
    ];
    renderSection(cards);
    expect(screen.getByText('Visa Oro')).toBeInTheDocument();
    expect(screen.getByText('Mastercard Negra')).toBeInTheDocument();
  });

  it('opens the detail when a card is selected', async () => {
    renderSection();
    fireEvent.click(screen.getByText('Visa Oro'));

    await waitFor(() => {
      const detail = screen.getByTestId('card-detail');
      expect(detail).toHaveAttribute('data-open', 'true');
    });
    expect(mockDetailProps).toHaveBeenCalledWith(
      expect.objectContaining({ isOpen: true, card: expect.objectContaining({ id: baseCard.id }) })
    );
  });

  it('mounts the create/edit/delete/pay modals', () => {
    renderSection();
    expect(screen.getByTestId('create-modal')).toBeInTheDocument();
    expect(screen.getByTestId('edit-modal')).toBeInTheDocument();
    expect(screen.getByTestId('delete-modal')).toBeInTheDocument();
    expect(screen.getByTestId('pay-modal')).toBeInTheDocument();
  });
});
