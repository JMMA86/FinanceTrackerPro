/**
 * Investment Performance Service Unit Tests
 * Verifies the ledger aggregation (Rule 11/13) and the return coherency invariant
 * (return = market value − invested).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getInvestmentPerformance } from '../investment-performance.service';
import type { PrismaClient } from '@prisma/client';

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

interface FakePrisma {
  account: { findUnique: ReturnType<typeof vi.fn> };
  transaction: { findMany: ReturnType<typeof vi.fn> };
  investmentAssetHolding: { findMany: ReturnType<typeof vi.fn> };
}

function createFakePrisma(): FakePrisma {
  return {
    account: { findUnique: vi.fn() },
    transaction: { findMany: vi.fn() },
    investmentAssetHolding: { findMany: vi.fn() },
  };
}

describe('InvestmentPerformanceService', () => {
  let prisma: FakePrisma;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = createFakePrisma();
  });

  it('aggregates invested cash, holdings market value and total value', async () => {
    prisma.account.findUnique.mockResolvedValue({
      id: 'acc-1',
      name: 'Tech',
      currency: 'USD',
      balanceCents: BigInt(70000),
    });
    prisma.transaction.findMany.mockResolvedValue([
      { date: new Date('2024-01-01'), amountCents: BigInt(100000) }, // TRANSFER_IN
      { date: new Date('2024-02-01'), amountCents: -BigInt(20000) }, // TRANSFER_OUT
      { date: new Date('2024-03-01'), amountCents: BigInt(50000) }, // INCOME
    ]);
    prisma.investmentAssetHolding.findMany.mockResolvedValue([
      { quantity: 5, currentPriceCents: BigInt(1500) },
      { quantity: 2, currentPriceCents: BigInt(2500) },
    ]);

    const result = await getInvestmentPerformance(prisma as unknown as PrismaClient, 'acc-1');

    // Net invested = 100000 - 20000 + 50000
    expect(result.totalInvestedCents).toBe(130000);
    // Holdings = 5*1500 + 2*2500
    expect(result.holdingsMarketValueCents).toBe(12500);
    expect(result.cashBalanceCents).toBe(70000);
    expect(result.totalValueCents).toBe(82500);
    // Coherency invariant
    expect(result.totalReturnCents).toBe(result.totalValueCents - result.totalInvestedCents);
    expect(result.totalReturnCents).toBe(-47500);
    expect(result.totalReturnPct).toBeCloseTo((-47500 / 130000) * 100, 6);
    expect(result.currency).toBe('USD');
    expect(result.name).toBe('Tech');

    // Series: cumulative after each funding tx + final "today" point.
    const seriesValues = result.series.map((p) => p.investedCents);
    expect(seriesValues).toEqual([100000, 80000, 130000, 130000]);
  });

  it('returns zero holdings value and zero return when there are no holdings', async () => {
    prisma.account.findUnique.mockResolvedValue({
      id: 'acc-2',
      name: 'Cash Only',
      currency: 'EUR',
      balanceCents: BigInt(250000),
    });
    prisma.transaction.findMany.mockResolvedValue([
      { date: new Date('2024-01-01'), amountCents: BigInt(250000) },
    ]);
    prisma.investmentAssetHolding.findMany.mockResolvedValue([]);

    const result = await getInvestmentPerformance(prisma as unknown as PrismaClient, 'acc-2');

    expect(result.holdingsMarketValueCents).toBe(0);
    expect(result.totalInvestedCents).toBe(250000);
    expect(result.totalValueCents).toBe(250000);
    expect(result.totalReturnCents).toBe(0);
    expect(result.totalReturnPct).toBe(0);
  });

  it('returns 0 return percentage when nothing has been invested', async () => {
    prisma.account.findUnique.mockResolvedValue({
      id: 'acc-3',
      name: 'Empty',
      currency: 'USD',
      balanceCents: BigInt(0),
    });
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.investmentAssetHolding.findMany.mockResolvedValue([]);

    const result = await getInvestmentPerformance(prisma as unknown as PrismaClient, 'acc-3');

    expect(result.totalInvestedCents).toBe(0);
    expect(result.totalReturnPct).toBe(0);
    expect(result.totalReturnCents).toBe(0);
    expect(result.series).toHaveLength(1); // only the "today" point
  });

  it('throws when the account does not exist', async () => {
    prisma.account.findUnique.mockResolvedValue(null);

    await expect(
      getInvestmentPerformance(prisma as unknown as PrismaClient, 'missing')
    ).rejects.toThrow('Investment account missing not found');
  });

  it('queries only funding transaction types and active holdings', async () => {
    prisma.account.findUnique.mockResolvedValue({
      id: 'acc-4',
      name: 'Filters',
      currency: 'USD',
      balanceCents: BigInt(0),
    });
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.investmentAssetHolding.findMany.mockResolvedValue([]);

    await getInvestmentPerformance(prisma as unknown as PrismaClient, 'acc-4');

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: { in: ['TRANSFER_IN', 'TRANSFER_OUT', 'INCOME'] },
          isActive: true,
        }),
      })
    );
    expect(prisma.investmentAssetHolding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: 'acc-4', isActive: true },
      })
    );
  });
});
