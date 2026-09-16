/**
 * Stock Price Service
 * Fetches real-time stock prices from Yahoo Finance API (free, no API key)
 *
 * Features:
 * - In-memory cache with TTL (60 seconds) to respect rate limits
 * - Graceful fallback to last known DB price on API failure
 * - Pino logging for errors
 *
 * Yahoo Finance Endpoints:
 * - Chart: https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1d
 * - Search: https://query1.finance.yahoo.com/v1/finance/search?q={query}&lang=en-US
 */

import 'server-only';
import { log } from '@/lib/logger';
import { decimalToCents } from '@/lib/money';

const YAHOO_FINANCE_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_FINANCE_SEARCH_BASE = 'https://query1.finance.yahoo.com/v1/finance/search';
const CACHE_TTL_MS = 60_000; // 60 seconds

export interface StockQuote {
  symbol: string;
  price: number; // in currency units (decimal)
  priceCents: number; // in cents (integer)
  currency: string;
  change: number;
  changePercent: number;
  timestamp: number;
}

interface CacheEntry {
  quote: StockQuote;
  cachedAt: number;
}

// In-memory cache
const priceCache = new Map<string, CacheEntry>();

/**
 * Fetch stock quote from Yahoo Finance chart API
 * @param symbol Stock symbol (e.g., "AAPL", "TSLA", "MSFT")
 * @returns StockQuote with price in cents
 */
export async function getStockQuote(symbol: string): Promise<StockQuote> {
  const now = Date.now();

  // Check cache
  const cached = priceCache.get(symbol);
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    log.debug({ symbol, price: cached.quote.price }, 'Stock price cache hit');
    return cached.quote;
  }

  const url = `${YAHOO_FINANCE_CHART_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; FinanceTrackerPro/1.0)',
      },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance API returned ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as YahooFinanceChartResponse;

    if (!data.chart?.result?.[0]?.meta) {
      throw new Error(`No data available for symbol: ${symbol}`);
    }

    const meta = data.chart.result[0].meta;

    const price = meta.regularMarketPrice ?? 0;
    const priceCents = decimalToCents(price);
    const change = meta.regularMarketChange ?? 0;
    const changePercent = meta.regularMarketChangePercent ?? 0;

    const quote: StockQuote = {
      symbol: meta.symbol || symbol,
      price,
      priceCents,
      currency: meta.currency || 'USD',
      change,
      changePercent,
      timestamp: now,
    };

    // Update cache
    priceCache.set(symbol, { quote, cachedAt: now });

    log.info(
      { symbol, price, currency: quote.currency, change, changePercent },
      'Stock price fetched from Yahoo Finance'
    );

    return quote;
  } catch (error) {
    log.error({ symbol, error: String(error) }, 'Failed to fetch stock price from Yahoo Finance');

    // Return cached value even if expired, or throw if no cache
    if (cached) {
      log.warn({ symbol }, 'Returning stale cached price due to API failure');
      return cached.quote;
    }

    throw new Error(`Failed to fetch price for ${symbol}: ${String(error)}`);
  }
}

/**
 * Fetch multiple stock quotes efficiently
 * Uses individual calls (Yahoo Finance chart API supports one symbol per call)
 * @param symbols Array of stock symbols
 * @returns Array of StockQuote
 */
export async function getMultipleStockQuotes(symbols: string[]): Promise<StockQuote[]> {
  const results: StockQuote[] = [];

  // Sequential calls to respect rate limits
  for (const symbol of symbols) {
    try {
      const quote = await getStockQuote(symbol);
      results.push(quote);
    } catch (error) {
      log.error({ symbol, error: String(error) }, 'Failed to fetch quote for symbol');
      // Skip failed symbols, continue with others
    }
  }

  return results;
}

/**
 * Search stocks by query string using Yahoo Finance autocomplete
 * @param query Search query (e.g., "Apple", "TSLA")
 * @returns Array of matching symbols with names
 */
export async function searchStocks(
  query: string
): Promise<Array<{ symbol: string; name: string }>> {
  const url = `${YAHOO_FINANCE_SEARCH_BASE}?q=${encodeURIComponent(query)}&lang=en-US`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; FinanceTrackerPro/1.0)',
      },
      next: { revalidate: 300 }, // 5 minutes
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance Search API returned ${response.status}`);
    }

    const data = (await response.json()) as YahooFinanceSearchResponse;

    if (!data.quotes || data.quotes.length === 0) {
      return [];
    }

    const results = data.quotes
      .filter((q) => q.symbol && q.shortname)
      .map((q) => ({
        symbol: q.symbol,
        name: q.shortname,
      }));

    log.info({ query, resultsCount: results.length }, 'Stock search completed');

    return results;
  } catch (error) {
    log.error({ query, error: String(error) }, 'Failed to search stocks');
    return [];
  }
}

// ============================================================================
// Yahoo Finance Response Types
// ============================================================================

interface YahooFinanceChartResponse {
  chart: {
    result: Array<{
      meta: {
        symbol: string;
        regularMarketPrice: number;
        currency: string;
        regularMarketChange: number;
        regularMarketChangePercent: number;
        [key: string]: unknown;
      };
      timestamp: number[];
      indicators: {
        quote: Array<{
          close: number[];
          [key: string]: unknown;
        }>;
      };
    }> | null;
    error: { description: string } | null;
  };
}

interface YahooFinanceSearchResponse {
  quotes: Array<{
    symbol: string;
    shortname: string;
    longname?: string;
    exch?: string;
    type?: string;
  }>;
  news?: unknown[];
  [key: string]: unknown;
}
