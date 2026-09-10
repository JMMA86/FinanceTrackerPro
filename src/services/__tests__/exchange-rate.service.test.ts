/**
 * Exchange Rate Service Unit Tests
 * Tests open.er-api.com integration with TTL cache and graceful null fallback.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: mockLogger,
}));

vi.mock('server-only', () => ({}));

describe('ExchangeRateService', () => {
  let getExchangeRate: typeof import('../exchange-rate.service').getExchangeRate;
  let getExchangeRateCached: typeof import('../exchange-rate.service').getExchangeRateCached;
  let fetchMock: ReturnType<typeof vi.fn>;

  const ratesFixture = {
    result: 'success',
    time_last_update_unix: 1730000000,
    rates: {
      USD: 1,
      COP: 4000,
      EUR: 0.85,
    },
  };

  beforeEach(async () => {
    // Reset modules to clear the module-level rate cache.
    vi.resetModules();

    const mod = await import('../exchange-rate.service');
    getExchangeRate = mod.getExchangeRate;
    getExchangeRateCached = mod.getExchangeRateCached;

    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 1 when both currencies are the same (no network call)', async () => {
    const rate = await getExchangeRate('COP', 'COP');
    expect(rate).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('computes the cross rate from a USD-based rates table', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(ratesFixture),
    });

    // COP -> EUR = EUR_rate / COP_rate = 0.85 / 4000
    const copToEur = await getExchangeRate('COP', 'EUR');
    expect(copToEur).toBeCloseTo(0.0002125, 10);

    // EUR -> COP = 4000 / 0.85
    const eurToCop = await getExchangeRate('EUR', 'COP');
    expect(eurToCop).toBeCloseTo(4000 / 0.85, 6);

    // COP -> USD = 1 / 4000
    const copToUsd = await getExchangeRate('COP', 'USD');
    expect(copToUsd).toBeCloseTo(0.00025, 10);
  });

  it('serves the second call from cache without refetching', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(ratesFixture),
    });

    const first = await getExchangeRate('COP', 'USD');
    const second = await getExchangeRate('COP', 'USD');

    expect(first).toBeCloseTo(0.00025, 10);
    expect(second).toBeCloseTo(0.00025, 10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches after the cache TTL expires', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000_000);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(ratesFixture),
    });
    await getExchangeRate('COP', 'USD');

    // Advance past the 10-minute TTL (600_000 ms).
    nowSpy.mockReturnValue(1_000_000 + 600_001);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          result: 'success',
          time_last_update_unix: 1730000000,
          rates: { USD: 1, COP: 4100, EUR: 0.85 },
        }),
    });

    const refreshed = await getExchangeRate('COP', 'USD');
    expect(refreshed).toBeCloseTo(1 / 4100, 10);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when the upstream API is unavailable', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: () => Promise.resolve({}),
    });

    const rate = await getExchangeRate('COP', 'USD');
    expect(rate).toBeNull();
  });

  it('returns null when the API response is missing the requested rates', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          result: 'success',
          time_last_update_unix: 1730000000,
          rates: { USD: 1, EUR: 0.85 }, // COP missing
        }),
    });

    const rate = await getExchangeRate('COP', 'USD');
    expect(rate).toBeNull();
  });

  it('returns null when the network request throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));

    const rate = await getExchangeRate('COP', 'USD');
    expect(rate).toBeNull();
  });

  it('getExchangeRateCached delegates to getExchangeRate', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(ratesFixture),
    });

    const rate = await getExchangeRateCached('COP', 'USD');
    expect(rate).toBeCloseTo(0.00025, 10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
