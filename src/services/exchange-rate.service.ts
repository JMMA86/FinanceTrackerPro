/**
 * Exchange Rate Service (FX)
 * Fetches live exchange rates from open.er-api.com (free, no API key)
 *
 * Features:
 * - In-memory cache with TTL (10 minutes) to respect rate limits
 * - Graceful null return on API failure (callers decide the fallback)
 * - AbortSignal timeout (5s) so a slow upstream never blocks a request
 * - Pino logging for errors
 *
 * Semantics: getExchangeRate(from, to) returns "units of `to` per 1 unit of
 * `from`" (cross rate derived from a USD base), e.g. COP -> USD ≈ 0.00025.
 * The app's deposit/withdraw actions store `exchangeRate` as "COP per foreign
 * unit" (~4000), which is the reciprocal of getExchangeRate('COP', foreign).
 */

import 'server-only';
import { log } from '@/lib/logger';

const EXCHANGE_RATE_API_BASE = 'https://open.er-api.com/v6/latest/USD';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const FETCH_TIMEOUT_MS = 5000; // 5 seconds

export type ExchangeCurrency = 'COP' | 'USD' | 'EUR';

interface CacheEntry {
  rates: Record<string, number>;
  cachedAt: number;
}

interface OpenErApiResponse {
  result: string;
  time_last_update_unix: number;
  rates: Record<string, number>;
}

// In-memory cache keyed by base currency (USD is the only base used today)
const rateCache = new Map<string, CacheEntry>();

/**
 * Compute a cross rate from a USD-based rates table.
 * rates[to] / rates[from] = how many units of `to` per 1 unit of `from`.
 */
function computeCrossRate(rates: Record<string, number>, from: string, to: string): number {
  return rates[to] / rates[from];
}

/**
 * Fetch the live exchange rate between two supported currencies.
 * Returns null (never throws) when the upstream API is unavailable so callers
 * can fall back to schema-level range validation.
 */
export async function getExchangeRate(
  from: ExchangeCurrency,
  to: ExchangeCurrency
): Promise<number | null> {
  if (from === to) return 1;

  const now = Date.now();
  const cached = rateCache.get('USD');
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return computeCrossRate(cached.rates, from, to);
  }

  try {
    const response = await fetch(EXCHANGE_RATE_API_BASE, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: 600 },
    });

    if (!response.ok) {
      throw new Error(`Exchange rate API returned ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as OpenErApiResponse;

    if (!data.rates || typeof data.rates[from] !== 'number' || typeof data.rates[to] !== 'number') {
      throw new Error(`Exchange rate API is missing rates for ${from}/${to}`);
    }

    rateCache.set('USD', { rates: data.rates, cachedAt: now });

    const rate = computeCrossRate(data.rates, from, to);
    log.info({ from, to, rate }, 'Exchange rate fetched from open.er-api.com');
    return rate;
  } catch (error) {
    log.error(
      { error: String(error), from, to },
      'Failed to fetch exchange rate from open.er-api.com'
    );
    return null;
  }
}

/**
 * Cached exchange rate lookup. The TTL cache lives inside getExchangeRate, so
 * this alias exists for callers that want the explicit "cached" contract.
 */
export async function getExchangeRateCached(
  from: ExchangeCurrency,
  to: ExchangeCurrency
): Promise<number | null> {
  return getExchangeRate(from, to);
}
