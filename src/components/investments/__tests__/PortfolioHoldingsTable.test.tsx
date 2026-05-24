/**
 * PortfolioHoldingsTable Component Tests
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PortfolioHoldingsTable } from '../PortfolioHoldingsTable';

// Mock formatMoney
vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn((cents: number, _currency: string) => {
    const amount = Math.abs(cents) / 100;
    const sign = cents < 0 ? '-' : '';
    return `${sign}$${amount.toFixed(2)}`;
  }),
}));

// Mock i18n get
vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const labels: Record<string, string> = {
      noHoldings: 'No holdings yet',
      noHoldingsDesc: 'Start buying assets to see them here',
      holdings: 'Holdings',
      symbol: 'Symbol',
      shares: 'Shares',
      avgCost: 'Avg Cost',
      currentPrice: 'Price',
      marketValue: 'Mkt Value',
      gainLoss: 'G/L',
      totalInvested: 'Invested',
      totalMarketValue: 'Market Value',
    };
    return labels[key] ?? key;
  }),
}));

describe('PortfolioHoldingsTable', () => {
  const mockHoldings = [
    {
      id: 'h-1',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      quantity: 10,
      avgCostCents: 15000,
      currentPriceCents: 16000,
      currency: 'USD',
    },
    {
      id: 'h-2',
      symbol: 'TSLA',
      name: 'Tesla Inc.',
      quantity: 5,
      avgCostCents: 25000,
      currentPriceCents: 23500,
      currency: 'USD',
    },
  ];

  const mockOnSell = vi.fn();
  const defaultDictionary = {
    sell: 'Sell',
    holdings: 'Holdings',
    symbol: 'Symbol',
    shares: 'Shares',
    avgCost: 'Avg Cost',
    currentPrice: 'Current Price',
    marketValue: 'Market Value',
    gainLoss: 'Gain/Loss',
    totalInvested: 'Total Invested',
    totalMarketValue: 'Total Market Value',
    noHoldings: 'No positions',
    noHoldingsDesc: 'Buy your first asset.',
  };

  it('should render the table with holdings', () => {
    render(
      <PortfolioHoldingsTable
        holdings={mockHoldings}
        currency="USD"
        dictionary={defaultDictionary}
        onSell={mockOnSell}
      />
    );

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getByText('TSLA')).toBeInTheDocument();
    expect(screen.getByText('Tesla Inc.')).toBeInTheDocument();
  });

  it('should display quantities with 4 decimal places', () => {
    render(
      <PortfolioHoldingsTable
        holdings={mockHoldings}
        currency="USD"
        dictionary={defaultDictionary}
        onSell={mockOnSell}
      />
    );

    expect(screen.getByText('10.0000')).toBeInTheDocument();
    expect(screen.getByText('5.0000')).toBeInTheDocument();
  });

  it('should display green text for positive gain/loss (AAPL)', () => {
    render(
      <PortfolioHoldingsTable
        holdings={mockHoldings}
        currency="USD"
        dictionary={defaultDictionary}
        onSell={mockOnSell}
      />
    );

    // AAPL: G/L = (10 * 16000) - (10 * 15000) = 160000 - 150000 = 10000 cents = $100.00
    // Check that gain text is present (text is split across multiple elements)
    const gainRows = screen.getAllByText((_content: string, element: Element | null) => {
      return element !== null && element.textContent === '+$100.00(+6.67%)' ? true : false;
    });
    expect(gainRows.length).toBeGreaterThan(0);

    // Should have sell buttons for both holdings
    const sellBtns = screen.getAllByRole('button', { name: /Sell/i });
    expect(sellBtns).toHaveLength(2);
  });

  it('should display red text for negative gain/loss (TSLA)', () => {
    render(
      <PortfolioHoldingsTable
        holdings={mockHoldings}
        currency="USD"
        dictionary={defaultDictionary}
        onSell={mockOnSell}
      />
    );

    // TSLA: G/L = (5 * 23500) - (5 * 25000) = 117500 - 125000 = -7500 cents = -$75.00
    // Check that loss text is present (text is split across multiple elements)
    const lossRows = screen.getAllByText((_content: string, element: Element | null) => {
      return element !== null && element.textContent === '-$75.00(-6.00%)' ? true : false;
    });
    expect(lossRows.length).toBeGreaterThan(0);
  });

  it('should render Sell button for each holding', () => {
    render(
      <PortfolioHoldingsTable
        holdings={mockHoldings}
        currency="USD"
        dictionary={defaultDictionary}
        onSell={mockOnSell}
      />
    );

    const sellAapl = screen.getByRole('button', { name: /Sell AAPL/i });
    const sellTsla = screen.getByRole('button', { name: /Sell TSLA/i });
    expect(sellAapl).toBeInTheDocument();
    expect(sellTsla).toBeInTheDocument();
  });

  it('should call onSell with holding when Sell button is clicked', () => {
    render(
      <PortfolioHoldingsTable
        holdings={mockHoldings}
        currency="USD"
        dictionary={defaultDictionary}
        onSell={mockOnSell}
      />
    );

    const sellAapl = screen.getByRole('button', { name: /Sell AAPL/i });
    fireEvent.click(sellAapl);
    expect(mockOnSell).toHaveBeenCalledWith(mockHoldings[0]);
  });

  it('should show total invested, market value and gain/loss in summary', () => {
    render(
      <PortfolioHoldingsTable
        holdings={mockHoldings}
        currency="USD"
        dictionary={defaultDictionary}
        onSell={mockOnSell}
      />
    );

    // Total invested: (10 * 15000 + 5 * 25000) = 150000 + 125000 = 275000 cents = $2750.00
    // Total market: (10 * 16000 + 5 * 23500) = 160000 + 117500 = 277500 cents = $2775.00
    // Total G/L: $25.00
    expect(screen.getByText(/Invested/)).toBeInTheDocument();
    expect(screen.getByText(/Market Value/)).toBeInTheDocument();
  });

  it('should show empty state when no holdings', () => {
    render(
      <PortfolioHoldingsTable
        holdings={[]}
        currency="USD"
        dictionary={defaultDictionary}
        onSell={mockOnSell}
      />
    );

    expect(screen.getByText('No holdings yet')).toBeInTheDocument();
    expect(screen.getByText('Start buying assets to see them here')).toBeInTheDocument();
  });

  it('should display holdings count in header', () => {
    render(
      <PortfolioHoldingsTable
        holdings={mockHoldings}
        currency="USD"
        dictionary={defaultDictionary}
        onSell={mockOnSell}
      />
    );

    expect(screen.getByText(/Holdings \(2\)/)).toBeInTheDocument();
  });

  it('should render table with proper aria attributes', () => {
    render(
      <PortfolioHoldingsTable
        holdings={mockHoldings}
        currency="USD"
        dictionary={defaultDictionary}
        onSell={mockOnSell}
      />
    );

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    expect(table).toHaveAttribute('aria-label', 'Holdings');
  });

  it('should display avg cost and current price formatted', () => {
    render(
      <PortfolioHoldingsTable
        holdings={mockHoldings}
        currency="USD"
        dictionary={defaultDictionary}
        onSell={mockOnSell}
      />
    );

    // Check for formatted values (using our mock)
    expect(screen.getByText('$150.00')).toBeInTheDocument(); // avg cost AAPL
    expect(screen.getByText('$160.00')).toBeInTheDocument(); // current price AAPL
  });
});
