/**
 * PortfolioPerformanceChart Component Tests
 *
 * Loads the performance series via getInvestmentPerformance and renders:
 *   - loading / error / data states
 *   - summary cards (invested / value / return per currency)
 *   - the SVG area chart with hover tooltip
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PortfolioPerformanceChart } from '../PortfolioPerformanceChart';

const mockGetInvestmentPerformance = vi.fn();

vi.mock('@/actions/investment.actions', () => ({
  getInvestmentPerformance: (...args: unknown[]) => mockGetInvestmentPerformance(...args),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_d: Record<string, unknown>, key: string) => key),
}));

vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn((cents: number, currency: string) => {
    const sign = cents < 0 ? '-' : '';
    return `${sign}$${(Math.abs(cents) / 100).toFixed(2)} ${currency}`;
  }),
}));

const perfData = {
  accountId: 'acc-1',
  name: 'Tech',
  currency: 'USD',
  totalInvestedCents: 100000,
  cashBalanceCents: 50000,
  holdingsMarketValueCents: 50000,
  totalValueCents: 120000,
  totalReturnCents: 20000,
  totalReturnPct: 20,
  series: [
    { date: new Date('2024-01-01'), investedCents: 50000 },
    { date: new Date('2024-06-01'), investedCents: 100000 },
  ],
};

const dictionary = {};

describe('PortfolioPerformanceChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should show the loading state while fetching', () => {
    mockGetInvestmentPerformance.mockImplementation(() => new Promise(() => {}));

    render(<PortfolioPerformanceChart accountId="acc-1" dictionary={dictionary} />);

    expect(screen.getByText('loadingPerformance')).toBeInTheDocument();
    expect(mockGetInvestmentPerformance).toHaveBeenCalledWith({ accountId: 'acc-1' });
  });

  it('should show the error state when the request fails', async () => {
    mockGetInvestmentPerformance.mockResolvedValue({ success: false, error: 'boom' });

    render(<PortfolioPerformanceChart accountId="acc-1" dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByText('errors.loadFailed')).toBeInTheDocument();
    });
  });

  it('should show the error state when the request throws', async () => {
    mockGetInvestmentPerformance.mockRejectedValue(new Error('network'));

    render(<PortfolioPerformanceChart accountId="acc-1" dictionary={dictionary} />);

    await waitFor(() => {
      expect(screen.getByText('errors.loadFailed')).toBeInTheDocument();
    });
  });

  it('should render the summary cards and the SVG chart when data arrives', async () => {
    mockGetInvestmentPerformance.mockResolvedValue({ success: true, data: perfData });

    render(<PortfolioPerformanceChart accountId="acc-1" dictionary={dictionary} />);

    await waitFor(() => {
      // These labels appear in the summary cards AND in the SVG legend.
      expect(screen.getAllByText('totalInvested').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('totalMarketValue').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('totalReturn')).toBeInTheDocument();
    });

    // Invested: $1000.00 USD
    expect(screen.getByText('$1000.00 USD')).toBeInTheDocument();
    // Value appears in the summary card, gridline, SVG label and legend.
    expect(screen.getAllByText('$1200.00 USD').length).toBeGreaterThanOrEqual(1);
    // Positive return → "+$200.00 USD (+20.00%)" (the % span is a child element)
    expect(
      screen.getByText(
        (_c: string, el: Element | null) =>
          el !== null && el.textContent === '+$200.00 USD(+20.00%)'
      )
    ).toBeInTheDocument();

    const svg = screen.getByRole('img', { name: 'performance' });
    expect(svg).toBeInTheDocument();
  });

  it('should show a tooltip on hover and clear it on leave', async () => {
    mockGetInvestmentPerformance.mockResolvedValue({ success: true, data: perfData });

    render(<PortfolioPerformanceChart accountId="acc-1" dictionary={dictionary} />);

    const svg = await screen.findByRole('img', { name: 'performance' });

    // jsdom returns all-zero rects by default; provide a real viewport so the
    // pointer position can be mapped to viewBox coordinates.
    const rect = {
      left: 0,
      top: 0,
      width: 1000,
      height: 320,
      right: 1000,
      bottom: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue(rect);

    fireEvent.mouseMove(svg, { clientX: 500 });

    await waitFor(() => {
      expect(screen.getByText(/investedLabel/)).toBeInTheDocument();
    });

    fireEvent.mouseLeave(svg);

    await waitFor(() => {
      expect(screen.queryByText(/investedLabel/)).not.toBeInTheDocument();
    });
  });
});
