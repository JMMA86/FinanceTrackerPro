/**
 * CreditCardCard Component Tests
 * Renders debt/available formatted, badge, click handler, light/dark variants.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CreditCardCard, getCardBackground, isLightCreditCard } from '../CreditCardCard';
import type { CreditCard } from '../credit-card.types';

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => key),
}));

vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn((cents: number, currency: string) => `${currency} ${cents}`),
}));

vi.mock('@/components/accounts/CardDesignPicker', () => ({
  getPresetGradient: vi.fn((key: string) =>
    key === 'blue' ? 'linear-gradient(135deg, #1d4ed8, #1e3a8a)' : undefined
  ),
  LIGHT_PRESET_KEYS: new Set(['white']),
}));

vi.mock('@/components/accounts/AccountCard', () => ({
  NetworkLogo: () => <svg data-testid="network-logo" />,
}));

const baseCard: CreditCard = {
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
  transactions: [],
  debtCents: 150000,
  availableCreditCents: 850000,
  paymentStatus: 'ON_TRACK',
};

function renderCard(card: Partial<CreditCard> = {}, onSelect = vi.fn()) {
  return render(
    <CreditCardCard
      card={{ ...baseCard, ...card }}
      dictionary={{}}
      locale="es-CO"
      onSelect={onSelect}
    />
  );
}

describe('CreditCardCard', () => {
  it('renders the card name and badge', () => {
    renderCard();
    expect(screen.getByText('Visa Oro')).toBeInTheDocument();
    expect(screen.getByText('cardTypeBadge')).toBeInTheDocument();
    expect(screen.getByText('debt')).toBeInTheDocument();
  });

  it('renders debt and available credit formatted', () => {
    renderCard();
    // formatMoney mock returns `${currency} ${cents}`
    expect(screen.getByText('COP 150000')).toBeInTheDocument();
    expect(screen.getByText('available: COP 850000')).toBeInTheDocument();
  });

  it('renders a dash when availableCreditCents is null', () => {
    renderCard({ availableCreditCents: null, creditLimitCents: null });
    expect(screen.getByText('available: —')).toBeInTheDocument();
  });

  it('renders the network logo for a non-NONE network', () => {
    renderCard();
    expect(screen.getByTestId('network-logo')).toBeInTheDocument();
  });

  it('does not render a network logo for NONE', () => {
    renderCard({ cardNetwork: 'NONE' });
    expect(screen.queryByTestId('network-logo')).not.toBeInTheDocument();
  });

  it('calls onSelect with the card id and bounding rect on click', () => {
    const onSelect = vi.fn();
    renderCard({}, onSelect);
    fireEvent.click(screen.getByRole('button', { name: 'Visa Oro' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toBe(baseCard.id);
    expect(onSelect.mock.calls[0][1]).toBeDefined();
  });

  it('getCardBackground returns the preset gradient for a known color', () => {
    const style = getCardBackground({ ...baseCard, cardColor: 'blue' });
    expect(style.background).toContain('linear-gradient');
  });

  it('getCardBackground falls back to the default credit gradient', () => {
    const style = getCardBackground({ ...baseCard, cardColor: null });
    expect(style.background).toContain('#dc2626');
  });

  it('isLightCreditCard detects light presets', () => {
    expect(isLightCreditCard({ ...baseCard, cardColor: 'white' })).toBe(true);
    expect(isLightCreditCard({ ...baseCard, cardColor: 'blue' })).toBe(false);
    expect(isLightCreditCard({ ...baseCard, cardColor: null })).toBe(false);
  });
});
