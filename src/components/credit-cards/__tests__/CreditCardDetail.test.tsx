/**
 * CreditCardDetail Component Tests
 * Metrics, statement loading, recent movements, edit/pay/delete buttons,
 * empty state, and close behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreditCardDetail } from '../CreditCardDetail';
import type { CreditCard, CreditCardStatement } from '../credit-card.types';

const mockGetStatement = vi.fn();
vi.mock('@/actions/credit-card.actions', () => ({
  getCreditCardStatement: (...args: unknown[]) => mockGetStatement(...args),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => key),
}));

vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn((cents: number, currency: string) => `${currency} ${cents}`),
}));

vi.mock('@/components/accounts/CardDesignPicker', () => ({
  getPresetGradient: vi.fn((key: string) =>
    key ? 'linear-gradient(135deg, #1d4ed8, #1e3a8a)' : undefined
  ),
  LIGHT_PRESET_KEYS: new Set(['white']),
  PRESETS: [{ key: 'blue', from: '#1d4ed8', to: '#1e3a8a' }],
}));

vi.mock('@/components/accounts/AccountCard', () => ({
  NetworkLogo: () => <svg data-testid="network-logo" />,
}));

const card: CreditCard = {
  id: 'clhcard0000000000000001',
  name: 'Visa Oro',
  currency: 'COP',
  balanceCents: -150000,
  creditLimitCents: 1000000,
  cutoffDay: 10,
  paymentDueDay: 25,
  cardColor: 'blue',
  cardNetwork: 'VISA',
  createdAt: new Date('2026-01-01'),
  transactions: [
    {
      id: 't-1',
      description: 'Supermercado',
      amountCents: -50000,
      currency: 'COP',
      type: 'EXPENSE',
      date: new Date('2026-08-01'),
    },
    {
      id: 't-2',
      description: 'Pago tarjeta',
      amountCents: 20000,
      currency: 'COP',
      type: 'CREDIT_PAYMENT',
      date: new Date('2026-08-10'),
    },
  ],
  debtCents: 150000,
  availableCreditCents: 850000,
  paymentStatus: 'ON_TRACK',
};

const statement: CreditCardStatement = {
  accountId: card.id,
  currency: 'COP',
  periodStart: new Date('2026-07-10'),
  periodEnd: new Date('2026-08-10'),
  previousBalanceCents: -50000,
  chargesTotalCents: -100000,
  paymentsTotalCents: 20000,
  interestTotalCents: 0,
  newBalanceCents: -130000,
  availableCreditCents: 870000,
  transactions: [],
};

function renderDetail(overrides: Record<string, unknown> = {}) {
  const callbacks = {
    onClose: vi.fn(),
    onEdit: vi.fn(),
    onPay: vi.fn(),
    onDelete: vi.fn(),
  };
  const utils = render(
    <CreditCardDetail
      card={card}
      cardRect={{ top: 0, left: 0, right: 300, bottom: 200, width: 300, height: 200 } as DOMRect}
      isOpen
      dictionary={{}}
      locale="es-CO"
      onClose={callbacks.onClose}
      onEdit={callbacks.onEdit}
      onPay={callbacks.onPay}
      onDelete={callbacks.onDelete}
      {...overrides}
    />
  );
  return { ...utils, callbacks };
}

describe('CreditCardDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStatement.mockResolvedValue({ success: true, data: statement });
  });

  it('renders the card name and the four financial metrics', () => {
    renderDetail();
    expect(screen.getAllByText('Visa Oro').length).toBeGreaterThan(0);
    expect(screen.getByText('detail.currentDebt')).toBeInTheDocument();
    expect(screen.getByText('detail.availableCredit')).toBeInTheDocument();
    expect(screen.getByText('detail.creditLimit')).toBeInTheDocument();
    expect(screen.getByText('detail.paymentStatus')).toBeInTheDocument();

    expect(screen.getByText('COP 150000')).toBeInTheDocument();
    expect(screen.getByText('COP 850000')).toBeInTheDocument();
    expect(screen.getByText('COP 1000000')).toBeInTheDocument();
  });

  it('renders the cutoff/due/network schedule', () => {
    renderDetail();
    expect(screen.getByText('detail.cutoffDay')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('detail.dueDay')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('VISA')).toBeInTheDocument();
  });

  it('renders the recent movements table with signed amounts', () => {
    renderDetail();
    expect(screen.getByText('detail.recentMovements')).toBeInTheDocument();
    expect(screen.getByText('Supermercado')).toBeInTheDocument();
    expect(screen.getByText('Pago tarjeta')).toBeInTheDocument();
    // Negative amounts are formatted as-is; positive amounts get a + prefix
    expect(screen.getByText('COP -50000')).toBeInTheDocument();
    expect(screen.getByText('+COP 20000')).toBeInTheDocument();
  });

  it('shows the empty movements state when the card has no transactions', () => {
    renderDetail({ card: { ...card, transactions: [] } });
    // Both the movements section and the not-yet-loaded statement show the empty text.
    expect(screen.getAllByText('detail.noMovements').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the statement metrics once loaded', async () => {
    renderDetail();
    expect(await screen.findByText('detail.statement')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('detail.previousBalance')).toBeInTheDocument();
      expect(screen.getByText('detail.charges')).toBeInTheDocument();
      expect(screen.getByText('detail.payments')).toBeInTheDocument();
      expect(screen.getByText('detail.newBalance')).toBeInTheDocument();
    });
    expect(mockGetStatement).toHaveBeenCalledWith({ accountId: card.id });
  });

  it('calls the edit, pay and delete callbacks', () => {
    const { callbacks } = renderDetail();

    fireEvent.click(screen.getByRole('button', { name: 'detail.edit' }));
    expect(callbacks.onEdit).toHaveBeenCalledWith(card.id);

    fireEvent.click(screen.getByRole('button', { name: 'detail.pay' }));
    expect(callbacks.onPay).toHaveBeenCalledWith(card);

    fireEvent.click(screen.getByRole('button', { name: 'detail.delete' }));
    expect(callbacks.onDelete).toHaveBeenCalledWith(
      card.id,
      card.name,
      card.debtCents,
      card.currency
    );
  });

  it('renders a dash for missing available credit and limit', () => {
    renderDetail({ card: { ...card, creditLimitCents: null, availableCreditCents: null } });
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });
});
