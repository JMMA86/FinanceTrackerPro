/**
 * InvestmentAccountCard Component Tests
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InvestmentAccountCard } from '../InvestmentAccountCard';
import type { InvestmentAccountSummary } from '../InvestmentAccountCard';

// Mock formatMoney to return a predictable value
vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn((cents: number, currency: string) => {
    const amount = (cents / 100).toFixed(2);
    return `$${amount} ${currency}`;
  }),
}));

describe('InvestmentAccountCard', () => {
  const mockAccount: InvestmentAccountSummary = {
    id: 'acc-1',
    name: 'Tech Stocks Portfolio',
    currency: 'USD',
    balanceCents: 150000,
    assetHoldings: [
      {
        id: 'holding-1',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        quantity: 10,
        avgCostCents: 15000,
        currentPriceCents: 16000,
        currency: 'USD',
      },
      {
        id: 'holding-2',
        symbol: 'TSLA',
        name: 'Tesla Inc.',
        quantity: 5,
        avgCostCents: 25000,
        currentPriceCents: 27000,
        currency: 'USD',
      },
    ],
    createdAt: new Date('2024-01-15'),
  };

  const mockEmptyAccount: InvestmentAccountSummary = {
    id: 'acc-2',
    name: 'Empty Account',
    currency: 'EUR',
    balanceCents: 0,
    assetHoldings: [],
    createdAt: new Date('2024-02-01'),
  };

  const mockOnSelect = vi.fn();

  const defaultDictionary = {
    noHoldings: 'No positions',
    holdingCount: '{count} positions',
  };

  it('should render the account name', () => { // NOSONAR: descriptive test names preferred over parameterized tests for BDD readability
    render(
      <InvestmentAccountCard
        account={mockAccount}
        dictionary={defaultDictionary}
        onSelect={mockOnSelect}
      />
    );
    expect(screen.getByText('Tech Stocks Portfolio')).toBeInTheDocument();
  });

  it('should render the formatted balance', () => {
    render(
      <InvestmentAccountCard
        account={mockAccount}
        dictionary={defaultDictionary}
        onSelect={mockOnSelect}
      />
    );
    expect(screen.getByText('$1500.00 USD')).toBeInTheDocument();
  });

  it('should render the currency badge', () => {
    render(
      <InvestmentAccountCard
        account={mockAccount}
        dictionary={defaultDictionary}
        onSelect={mockOnSelect}
      />
    );
    expect(screen.getByText('USD')).toBeInTheDocument();
  });

  it('should render EUR currency badge for EUR account', () => {
    render(
      <InvestmentAccountCard
        account={mockEmptyAccount}
        dictionary={defaultDictionary}
        onSelect={mockOnSelect}
      />
    );
    expect(screen.getByText('EUR')).toBeInTheDocument();
  });

  it('should render holdings count when holdings exist', () => {
    render(
      <InvestmentAccountCard
        account={mockAccount}
        dictionary={defaultDictionary}
        onSelect={mockOnSelect}
      />
    );
    expect(screen.getByText('2 positions')).toBeInTheDocument();
  });

  it('should show noHoldings text when empty', () => {
    render(
      <InvestmentAccountCard
        account={mockEmptyAccount}
        dictionary={defaultDictionary}
        onSelect={mockOnSelect}
      />
    );
    expect(screen.getByText('No positions')).toBeInTheDocument();
  });

  it('should render market value when holdings exist', () => {
    render(
      <InvestmentAccountCard
        account={mockAccount}
        dictionary={defaultDictionary}
        onSelect={mockOnSelect}
      />
    );
    // Market value = 10*16000 + 5*27000 = 160000 + 135000 = 295000 cents = $2950.00
    expect(screen.getByText('· MV $2950.00 USD')).toBeInTheDocument();
  });

  it('should call onSelect with account id when clicked', () => {
    render(
      <InvestmentAccountCard
        account={mockAccount}
        dictionary={defaultDictionary}
        onSelect={mockOnSelect}
      />
    );
    const button = screen.getByRole('button', { name: /Tech Stocks Portfolio/i });
    fireEvent.click(button);
    expect(mockOnSelect).toHaveBeenCalledWith('acc-1');
  });

  it('should have aria-expanded attribute when selected', () => {
    render(
      <InvestmentAccountCard
        account={mockAccount}
        dictionary={defaultDictionary}
        isSelected={true}
        onSelect={mockOnSelect}
      />
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('should have aria-expanded false when not selected', () => {
    render(
      <InvestmentAccountCard
        account={mockAccount}
        dictionary={defaultDictionary}
        isSelected={false}
        onSelect={mockOnSelect}
      />
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('should have correct aria-label', () => {
    render(
      <InvestmentAccountCard
        account={mockAccount}
        dictionary={defaultDictionary}
        onSelect={mockOnSelect}
      />
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Tech Stocks Portfolio');
  });

  it('should have single holding text correctly (singular)', () => {
    const singleHoldingAccount = {
      ...mockAccount,
      assetHoldings: [mockAccount.assetHoldings![0]],
    };
    render(
      <InvestmentAccountCard
        account={singleHoldingAccount}
        dictionary={defaultDictionary}
        onSelect={mockOnSelect}
      />
    );
    expect(screen.getByText('1 positions')).toBeInTheDocument();
  });

  it('should not crash with undefined assetHoldings', () => {
    const accountWithoutHoldings = {
      ...mockAccount,
      assetHoldings: undefined,
    } as unknown as InvestmentAccountSummary;

    render(
      <InvestmentAccountCard
        account={accountWithoutHoldings}
        dictionary={defaultDictionary}
        onSelect={mockOnSelect}
      />
    );
    expect(screen.getByText('No positions')).toBeInTheDocument();
  });
});
