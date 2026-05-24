/**
 * Stock Price Service Unit Tests
 * Tests Yahoo Finance API integration with caching
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
// StockQuote type is used implicitly via module methods

// ============================================================================
// Mocks (hoisted — runs before module imports)
// ============================================================================

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  log: mockLogger,
}));

vi.mock('server-only', () => ({}));

// ============================================================================
// Mock data
// ============================================================================

const mockAAPLResponse = {
  chart: {
    result: [
      {
        meta: {
          symbol: 'AAPL',
          regularMarketPrice: 189.5,
          currency: 'USD',
          regularMarketChange: 2.3,
          regularMarketChangePercent: 1.23,
        },
      },
    ],
    error: null,
  },
};

const mockTSLAResponse = {
  chart: {
    result: [
      {
        meta: {
          symbol: 'TSLA',
          regularMarketPrice: 245.75,
          currency: 'USD',
          regularMarketChange: -3.5,
          regularMarketChangePercent: -1.4,
        },
      },
    ],
    error: null,
  },
};

const mockSearchResponse = {
  quotes: [
    { symbol: 'AAPL', shortname: 'Apple Inc.', exch: 'NAS', type: 'EQUITY' },
    { symbol: 'AAPL.WA', shortname: 'Apple Inc. (WSE)', exch: 'WSE', type: 'EQUITY' },
    { symbol: 'APC.DE', shortname: 'Apple Inc. (XETRA)', exch: 'XET', type: 'EQUITY' },
  ],
};

const mockEmptySearchResponse = {
  quotes: [],
};

const mockInvalidSymbolResponse = {
  chart: {
    result: null,
    error: { description: 'No data found for symbol' },
  },
};

// ============================================================================
// Tests
// ============================================================================

describe('StockPriceService', () => {
  // Fresh imports each time to reset module-level cache
  let getStockQuote: typeof import('../stock-price.service').getStockQuote;
  let getMultipleStockQuotes: typeof import('../stock-price.service').getMultipleStockQuotes;
  let searchStocks: typeof import('../stock-price.service').searchStocks;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Reset all modules to clear the priceCache
    vi.resetModules();

    // Re-import functions fresh (cache will be empty)
    const mod = await import('../stock-price.service');
    getStockQuote = mod.getStockQuote;
    getMultipleStockQuotes = mod.getMultipleStockQuotes;
    searchStocks = mod.searchStocks;

    // Set up fetch mock
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // getStockQuote
  // ==========================================================================

  describe('getStockQuote', () => {
    it('should return a StockQuote with correct priceCents for AAPL', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAAPLResponse),
      });

      const quote = await getStockQuote('AAPL');

      expect(quote).toBeDefined();
      expect(quote.symbol).toBe('AAPL');
      expect(quote.price).toBe(189.5);
      expect(quote.priceCents).toBe(18950); // 189.5 * 100
      expect(quote.currency).toBe('USD');
      expect(quote.change).toBe(2.3);
      expect(quote.changePercent).toBe(1.23);
      expect(quote.timestamp).toBeGreaterThan(0);
    });

    it('should use cache for second call within 60 seconds', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAAPLResponse),
      });

      // First call — fetches from API
      const quote1 = await getStockQuote('AAPL');
      expect(quote1.priceCents).toBe(18950);

      // Second call immediately — should use cache
      const quote2 = await getStockQuote('AAPL');
      expect(quote2.priceCents).toBe(18950);

      // fetch should have been called only once
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should fetch again after cache expires (after 60 seconds)', async () => {
      const nowSpy = vi.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1000000);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAAPLResponse),
      });

      // First call
      const quote1 = await getStockQuote('AAPL');
      expect(quote1.priceCents).toBe(18950);

      // Advance time by 61 seconds (past the 60s TTL)
      nowSpy.mockReturnValue(1000000 + 61000);

      // Second call should fetch again
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          chart: {
            result: [{
              meta: {
                symbol: 'AAPL',
                regularMarketPrice: 192.3,
                currency: 'USD',
                regularMarketChange: 2.8,
                regularMarketChangePercent: 1.48,
              },
            }],
            error: null,
          },
        }),
      });

      const quote2 = await getStockQuote('AAPL');
      expect(quote2.priceCents).toBe(19230);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should throw an error when symbol is invalid', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockInvalidSymbolResponse),
      });

      await expect(getStockQuote('INVALID')).rejects.toThrow('No data available for symbol: INVALID');
    });

    it('should throw an error when API returns non-ok status and no cache', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: () => Promise.resolve({}),
      });

      await expect(getStockQuote('UNKNOWN_SYM')).rejects.toThrow('Yahoo Finance API returned 429: Too Many Requests');
    });

    it('should return stale cache on API failure when cache exists', async () => {
      // First successful call
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAAPLResponse),
      });

      const quote1 = await getStockQuote('AAPL');
      expect(quote1.priceCents).toBe(18950);

      // Advance time past cache TTL so it tries to fetch again
      const nowSpy = vi.spyOn(Date, 'now');
      nowSpy.mockReturnValue(Date.now() + 61000);

      // Second call fails — should fall back to stale cache
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({}),
      });

      // Should return the stale cached value instead of throwing
      const quote2 = await getStockQuote('AAPL');
      expect(quote2.priceCents).toBe(18950);
    });

    it('should throw on API failure when no cache exists', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: () => Promise.resolve({}),
      });

      await expect(getStockQuote('UNKNOWN')).rejects.toThrow('Failed to fetch price for UNKNOWN');
    });

    it('should call the correct Yahoo Finance URL', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAAPLResponse),
      });

      await getStockQuote('AAPL');

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('query1.finance.yahoo.com/v8/finance/chart/AAPL');
      expect(calledUrl).toContain('interval=1d');
      expect(calledUrl).toContain('range=1d');
    });
  });

  // ==========================================================================
  // getMultipleStockQuotes
  // ==========================================================================

  describe('getMultipleStockQuotes', () => {
    it('should return quotes for multiple symbols', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAAPLResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTSLAResponse),
        });

      const quotes = await getMultipleStockQuotes(['AAPL', 'TSLA']);

      expect(quotes).toHaveLength(2);
      expect(quotes[0].symbol).toBe('AAPL');
      expect(quotes[0].priceCents).toBe(18950);
      expect(quotes[1].symbol).toBe('TSLA');
      expect(quotes[1].priceCents).toBe(24575);
    });

    it('should skip failed symbols and continue with others', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAAPLResponse),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: () => Promise.resolve({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTSLAResponse),
        });

      const quotes = await getMultipleStockQuotes(['AAPL', 'INVALID', 'TSLA']);

      // Should have 2 successful quotes, skip the failed one
      expect(quotes).toHaveLength(2);
      expect(quotes[0].symbol).toBe('AAPL');
      expect(quotes[1].symbol).toBe('TSLA');
    });

    it('should return empty array for all-failed symbols', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Error',
        json: () => Promise.resolve({}),
      });

      const quotes = await getMultipleStockQuotes(['UNKNOWN1', 'UNKNOWN2']);
      expect(quotes).toHaveLength(0);
    });
  });

  // ==========================================================================
  // searchStocks
  // ==========================================================================

  describe('searchStocks', () => {
    it('should return search results for a query', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSearchResponse),
      });

      const results = await searchStocks('Apple');

      expect(results).toHaveLength(3);
      expect(results[0].symbol).toBe('AAPL');
      expect(results[0].name).toBe('Apple Inc.');
    });

    it('should return empty array when no results found', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockEmptySearchResponse),
      });

      const results = await searchStocks('ZZZZ_NOT_A_STOCK');
      expect(results).toHaveLength(0);
    });

    it('should return empty array on API failure', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: () => Promise.resolve({}),
      });

      const results = await searchStocks('Apple');
      expect(results).toHaveLength(0);
    });

    it('should call the correct Yahoo Finance search URL', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSearchResponse),
      });

      await searchStocks('Apple');

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('query1.finance.yahoo.com/v1/finance/search');
      expect(calledUrl).toContain('q=Apple');
      expect(calledUrl).toContain('lang=en-US');
    });

    it('should URL-encode the query parameter', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ quotes: [] }),
      });

      await searchStocks('Berkshire Hathaway');

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('q=Berkshire');
      expect(calledUrl).not.toContain(' '); // No spaces in URL
    });
  });
});
