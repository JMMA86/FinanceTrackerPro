/**
 * AccountCard Component Tests
 *
 * Uses the REAL formatMoney from src/lib/money.ts (per project rules).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  AccountCard,
  NetworkLogo,
  isLightCard,
  getCardBackground,
  TYPE_LABELS,
  TYPE_GRADIENTS,
} from '../AccountCard';
import type { AccountCardData } from '../AccountCard';

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

const baseAccount: AccountCardData = {
  id: 'clh1234567890abcdefghij',
  name: 'Cuenta Principal',
  type: 'CHECKING',
  currency: 'COP',
  balanceCents: 123456,
  interestRateEA: null,
  parentAccountId: null,
  cardColor: null,
  cardNetwork: 'NONE',
  createdAt: new Date('2024-01-01'),
  transactions: [],
};

interface RenderCardOptions {
  onSelect?: (accountId: string, rect: DOMRect) => void;
  isAnySelected?: boolean;
  parentName?: string;
  locale?: string;
}

function renderCard(overrides: Partial<AccountCardData> = {}, options: RenderCardOptions = {}) {
  const account = { ...baseAccount, ...overrides };
  const onSelect = options.onSelect ?? vi.fn();
  return {
    account,
    onSelect,
    ...render(
      <AccountCard
        account={account}
        dictionary={{}}
        onSelect={onSelect}
        {...(options.isAnySelected !== undefined ? { isAnySelected: options.isAnySelected } : {})}
        {...(options.parentName !== undefined ? { parentName: options.parentName } : {})}
        {...(options.locale !== undefined ? { locale: options.locale } : {})}
      />
    ),
  };
}

describe('AccountCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render account name and type label', () => {
    renderCard({ type: 'SAVINGS' });
    expect(screen.getByText('Cuenta Principal')).toBeInTheDocument();
    expect(screen.getByText(TYPE_LABELS.SAVINGS)).toBeInTheDocument();
  });

  it('should fall back to the raw type string when the type label is unknown', () => {
    renderCard({ type: 'UNKNOWN_TYPE' });
    expect(screen.getByText('UNKNOWN_TYPE')).toBeInTheDocument();
  });

  it('should format the balance using the real formatMoney', () => {
    renderCard({ balanceCents: 123456, currency: 'COP' });
    // 1234.56 COP formatted with es-CO locale
    expect(screen.getByText(/1\.234/)).toBeInTheDocument();
  });

  it('should render the interest rate when greater than zero', () => {
    renderCard({ type: 'SAVINGS', interestRateEA: 5.5 });
    expect(screen.getByText('5.50% EA')).toBeInTheDocument();
  });

  it('should not render the interest rate when zero', () => {
    renderCard({ type: 'SAVINGS', interestRateEA: 0 });
    expect(screen.queryByText(/EA/)).not.toBeInTheDocument();
  });

  it('should not render the interest rate when null', () => {
    renderCard({ type: 'SAVINGS', interestRateEA: null });
    expect(screen.queryByText(/EA/)).not.toBeInTheDocument();
  });

  it('should render the network logo when a network is set', () => {
    renderCard({ cardNetwork: 'VISA' });
    expect(screen.getByLabelText('Visa')).toBeInTheDocument();
  });

  it('should not render a network logo for NONE', () => {
    renderCard({ cardNetwork: 'NONE' });
    expect(screen.queryByLabelText('Visa')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mastercard')).not.toBeInTheDocument();
  });

  it('should render Mastercard and Amex logos', () => {
    renderCard({ cardNetwork: 'MASTERCARD' });
    expect(screen.getByLabelText('Mastercard')).toBeInTheDocument();

    renderCard({ cardNetwork: 'AMEX' });
    expect(screen.getByLabelText('American Express')).toBeInTheDocument();
  });

  it('should call onSelect with the account id and a DOMRect on click', () => {
    const onSelect = vi.fn();
    const { account } = renderCard({}, { onSelect });

    const button = screen.getByRole('button', { name: account.name });
    fireEvent.click(button);

    expect(onSelect).toHaveBeenCalledWith(account.id, expect.any(Object));
    const rect = onSelect.mock.calls[0][1] as DOMRect;
    expect(typeof rect.top).toBe('number');
  });

  it('should render the parent name label when parentName is provided', () => {
    renderCard({ type: 'POCKET' }, { parentName: 'Cuenta Principal' });
    expect(screen.getByText(/pocketOf/)).toBeInTheDocument();
    // Parent label + card name both contain the parent name
    expect(screen.getAllByText(/Cuenta Principal/).length).toBeGreaterThan(0);
  });

  it('should apply the dimmed style when isAnySelected is true', () => {
    const { container } = renderCard({}, { isAnySelected: true });
    const button = container.querySelector('button')!;
    expect(button.className).toContain('opacity-40');
  });

  it('should apply light card text color for light preset colors', () => {
    const { container } = renderCard({ cardColor: 'white' });
    expect(container.querySelector('.text-slate-800')).toBeInTheDocument();
  });

  it('should use the default dark text color otherwise', () => {
    const { container } = renderCard({ cardColor: 'blue' });
    expect(container.querySelector('.text-white')).toBeInTheDocument();
  });

  it('should have the account id as data attribute', () => {
    const { container } = renderCard({ id: 'clh1234567890abcdefghij' });
    expect(container.querySelector('[data-account-id="clh1234567890abcdefghij"]')).toBeInTheDocument();
  });
});

describe('isLightCard', () => {
  it('should be true only for light preset keys', () => {
    expect(isLightCard({ ...baseAccount, cardColor: 'white' })).toBe(true);
    expect(isLightCard({ ...baseAccount, cardColor: 'blue' })).toBe(false);
    expect(isLightCard({ ...baseAccount, cardColor: null })).toBe(false);
  });
});

describe('getCardBackground', () => {
  it('should prefer the preset gradient for cardColor', () => {
    const style = getCardBackground({ ...baseAccount, cardColor: 'blue', type: 'CHECKING' });
    expect(style.background).toContain('#1d4ed8');
  });

  it('should fall back to the type gradient', () => {
    const style = getCardBackground({ ...baseAccount, cardColor: null, type: 'SAVINGS' });
    expect(style.background).toBe(TYPE_GRADIENTS.SAVINGS);
  });

  it('should fall back to the default gradient for unknown types', () => {
    const style = getCardBackground({ ...baseAccount, cardColor: null, type: 'UNKNOWN' });
    expect(style.background).toContain('#475569');
  });
});

describe('NetworkLogo', () => {
  it('should render the Visa logo for VISA', () => {
    const { container } = render(<NetworkLogo network="VISA" />);
    expect(container.querySelector('svg[aria-label="Visa"]')).toBeInTheDocument();
  });

  it('should render the Mastercard logo for MASTERCARD', () => {
    const { container } = render(<NetworkLogo network="MASTERCARD" />);
    expect(container.querySelector('svg[aria-label="Mastercard"]')).toBeInTheDocument();
  });

  it('should render the Amex logo for AMEX', () => {
    const { container } = render(<NetworkLogo network="AMEX" />);
    expect(container.querySelector('svg[aria-label="American Express"]')).toBeInTheDocument();
  });

  it('should render null for NONE', () => {
    const { container } = render(<NetworkLogo network="NONE" />);
    expect(container.querySelector('svg')).toBeNull();
  });
});