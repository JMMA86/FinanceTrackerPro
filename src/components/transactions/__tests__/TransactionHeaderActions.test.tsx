/**
 * TransactionHeaderActions Component Tests
 * Tests Transfer button visibility based on the pocket transfer contract
 * (hasAnyValidPair) and modal wiring
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionHeaderActions } from '../TransactionHeaderActions';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('@/store/ui.store', () => ({
  useUIStore: vi.fn((selector) => {
    const state = {
      activeModal: null,
      modalData: null,
      openModal: vi.fn(),
      closeModal: vi.fn(),
      addNotification: vi.fn(),
    };
    return selector(state);
  }),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const labels: Record<string, string> = {
      transferButton: 'Transferir',
      manageCategories: 'Gestionar categorías',
      newTransaction: 'Nueva transacción',
    };
    return labels[key] ?? key;
  }),
}));

// The heavy modal implementations are mocked so this suite stays focused on
// the header's button visibility and the TransferModal wiring (open + userId + locale).
const mockTransferModal = vi.fn();
vi.mock('@/components/transactions/TransferModal', () => ({
  TransferModal: (props: {
    open: boolean;
    accounts: unknown[];
    userId: string;
    dictionary: Record<string, unknown>;
    onClose: () => void;
    locale?: string;
  }) => {
    mockTransferModal(props);
    return <div data-testid="transfer-modal" data-open={String(props.open)} />;
  },
}));

vi.mock('@/components/transactions/CreateTransactionModal', () => ({
  CreateTransactionModal: () => <div data-testid="create-transaction-modal" />,
}));

vi.mock('@/components/transactions/CategoryManagerModal', () => ({
  CategoryManagerModal: () => <div data-testid="category-manager-modal" />,
}));

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
];

const dictionary = {};

const renderHeader = (overrides: Record<string, unknown> = {}) =>
  render(
    <TransactionHeaderActions
      dictionary={dictionary}
      accounts={mockAccounts}
      categories={[]}
      hasAccounts
      lang="es"
      userId="user-1"
      locale="es-CO"
      {...overrides}
    />
  );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TransactionHeaderActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the Transfer button when there is at least one valid transfer pair', () => {
    renderHeader();

    expect(screen.getByRole('button', { name: 'Transferir' })).toBeInTheDocument();
  });

  it('should NOT render the Transfer button with a single account', () => {
    renderHeader({ accounts: [mockAccounts[0]] });

    expect(screen.queryByRole('button', { name: 'Transferir' })).not.toBeInTheDocument();
  });

  it('should NOT render the Transfer button when only pockets without a valid parent exist', () => {
    const orphanPocket = {
      id: 'pocket-1',
      name: 'Orphan Pocket',
      currency: 'USD',
      type: 'POCKET',
      parentAccountId: null,
      balanceCents: 0,
    };
    renderHeader({ accounts: [orphanPocket, mockAccounts[1]] });

    expect(screen.queryByRole('button', { name: 'Transferir' })).not.toBeInTheDocument();
  });

  it('should NOT render the Transfer button when all pairs are invalid pockets of another account', () => {
    const pocket = {
      id: 'pocket-1',
      name: 'Travel Pocket',
      currency: 'USD',
      type: 'POCKET',
      parentAccountId: 'acc-2',
      balanceCents: 1000,
    };
    // acc-1 cannot transfer to acc-2's pocket and vice versa
    renderHeader({ accounts: [mockAccounts[0], pocket] });

    expect(screen.queryByRole('button', { name: 'Transferir' })).not.toBeInTheDocument();
  });

  it('should open the transfer modal with the userId and locale props when Transfer is clicked', async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole('button', { name: 'Transferir' }));

    const transferModal = screen.getByTestId('transfer-modal');
    expect(transferModal).toHaveAttribute('data-open', 'true');

    // The page (server component) passes the session userId and locale down to the modal
    expect(mockTransferModal).toHaveBeenCalledWith(
      expect.objectContaining({ open: true, userId: 'user-1', locale: 'es-CO' })
    );
  });
});
