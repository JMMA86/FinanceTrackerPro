/**
 * Investment Ledger Service Unit Tests (Rule 11 — source of truth)
 *
 * Verifies the average-cost ledger replay (`recomputeHoldingFromLedger`) and the
 * holding persistence (`syncHoldingFromTrade`) against a fake Prisma transaction
 * client. All the arithmetic must go through Decimal.js (Rule 1).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recomputeHoldingFromLedger,
  syncHoldingFromTrade,
  type LedgerReplayResult,
} from '../investment-ledger.service';
import { ValidationError } from '@/lib/errors/api-errors';
import type { Prisma } from '@prisma/client';

vi.mock('server-only', () => ({}));

interface FakeTx {
  transaction: { findMany: ReturnType<typeof vi.fn> };
  investmentAssetHolding: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
}

function createFakeTx(): FakeTx {
  return {
    transaction: { findMany: vi.fn() },
    investmentAssetHolding: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  };
}

const asTx = (tx: FakeTx): Prisma.TransactionClient => tx as unknown as Prisma.TransactionClient;

/** Build a ledger row shaped like the Prisma select of the service. */
const trade = (overrides: {
  assetTradeType: 'BUY' | 'SELL';
  assetQuantity: string | null;
  assetPricePerShareCents: number | null;
}) => ({
  assetTradeType: overrides.assetTradeType,
  assetQuantity: overrides.assetQuantity,
  assetPricePerShareCents: overrides.assetPricePerShareCents,
});

describe('investment-ledger.service', () => {
  let tx: FakeTx;

  beforeEach(() => {
    vi.clearAllMocks();
    tx = createFakeTx();
  });

  describe('recomputeHoldingFromLedger', () => {
    it('sums quantity and cost on a single BUY', async () => {
      tx.transaction.findMany.mockResolvedValue([
        trade({ assetTradeType: 'BUY', assetQuantity: '10', assetPricePerShareCents: 1500 }),
      ]);

      const replay = await recomputeHoldingFromLedger(asTx(tx), 'acc-1', 'AAPL');

      expect(replay.quantity.toString()).toBe('10');
      expect(replay.avgCostCents).toBe(150000);
      expect(replay.isActive).toBe(true);
    });

    it('applies the weighted average cost across multiple BUYs', async () => {
      tx.transaction.findMany.mockResolvedValue([
        trade({ assetTradeType: 'BUY', assetQuantity: '10', assetPricePerShareCents: 1500 }),
        trade({ assetTradeType: 'BUY', assetQuantity: '5', assetPricePerShareCents: 2100 }),
      ]);

      const replay = await recomputeHoldingFromLedger(asTx(tx), 'acc-1', 'AAPL');

      // (10*1500 + 5*2100) / 15 = 25500/15 = 1700 cents → 170000 (internal units)
      expect(replay.quantity.toString()).toBe('15');
      expect(replay.avgCostCents).toBe(170000);
      expect(replay.isActive).toBe(true);
    });

    it('reduces quantity proportionally on a partial SELL while keeping the average cost', async () => {
      tx.transaction.findMany.mockResolvedValue([
        trade({ assetTradeType: 'BUY', assetQuantity: '10', assetPricePerShareCents: 1500 }),
        trade({ assetTradeType: 'SELL', assetQuantity: '4', assetPricePerShareCents: 2000 }),
      ]);

      const replay = await recomputeHoldingFromLedger(asTx(tx), 'acc-1', 'AAPL');

      expect(replay.quantity.toString()).toBe('6');
      // Average cost is unchanged by the sale (average-cost method).
      expect(replay.avgCostCents).toBe(150000);
      expect(replay.isActive).toBe(true);
    });

    it('closes the position at zero quantity (avg cost 0, inactive)', async () => {
      tx.transaction.findMany.mockResolvedValue([
        trade({ assetTradeType: 'BUY', assetQuantity: '10', assetPricePerShareCents: 1500 }),
        trade({ assetTradeType: 'SELL', assetQuantity: '10', assetPricePerShareCents: 2000 }),
      ]);

      const replay = await recomputeHoldingFromLedger(asTx(tx), 'acc-1', 'AAPL');

      expect(replay.quantity.isZero()).toBe(true);
      expect(replay.avgCostCents).toBe(0);
      expect(replay.isActive).toBe(false);
    });

    it('throws ValidationError when the ledger oversells', async () => {
      tx.transaction.findMany.mockResolvedValue([
        trade({ assetTradeType: 'BUY', assetQuantity: '2', assetPricePerShareCents: 1500 }),
        trade({ assetTradeType: 'SELL', assetQuantity: '5', assetPricePerShareCents: 2000 }),
      ]);

      await expect(recomputeHoldingFromLedger(asTx(tx), 'acc-1', 'AAPL')).rejects.toBeInstanceOf(
        ValidationError
      );
      await expect(recomputeHoldingFromLedger(asTx(tx), 'acc-1', 'AAPL')).rejects.toThrow(
        'Sell quantity exceeds ledger quantity'
      );
    });

    it('throws ValidationError when a SELL has no prior position', async () => {
      tx.transaction.findMany.mockResolvedValue([
        trade({ assetTradeType: 'SELL', assetQuantity: '5', assetPricePerShareCents: 2000 }),
      ]);

      await expect(recomputeHoldingFromLedger(asTx(tx), 'acc-1', 'AAPL')).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    it('throws ValidationError on a row with null structured asset data', async () => {
      tx.transaction.findMany.mockResolvedValue([
        trade({ assetTradeType: 'BUY', assetQuantity: null, assetPricePerShareCents: 1500 }),
      ]);

      await expect(recomputeHoldingFromLedger(asTx(tx), 'acc-1', 'AAPL')).rejects.toThrow(
        'Investment trade is missing structured asset data'
      );
    });

    it('throws ValidationError when the price is null on a structured row', async () => {
      tx.transaction.findMany.mockResolvedValue([
        trade({ assetTradeType: 'BUY', assetQuantity: '1', assetPricePerShareCents: null }),
      ]);

      await expect(recomputeHoldingFromLedger(asTx(tx), 'acc-1', 'AAPL')).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    it('replays with a deterministic order (date, createdAt, id)', async () => {
      tx.transaction.findMany.mockResolvedValue([]);

      await recomputeHoldingFromLedger(asTx(tx), 'acc-1', 'AAPL');

      expect(tx.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        })
      );
    });

    it('returns a zeroed holding when there are no trades', async () => {
      tx.transaction.findMany.mockResolvedValue([]);

      const replay = await recomputeHoldingFromLedger(asTx(tx), 'acc-1', 'AAPL');

      expect(replay.quantity.isZero()).toBe(true);
      expect(replay.avgCostCents).toBe(0);
      expect(replay.isActive).toBe(false);
    });
  });

  describe('syncHoldingFromTrade', () => {
    const replayActive: LedgerReplayResult = {
      quantity: { toString: () => '10', isZero: () => false } as never,
      avgCostCents: 150000,
      isActive: true,
    };
    const replayClosed: LedgerReplayResult = {
      quantity: { toString: () => '0', isZero: () => true } as never,
      avgCostCents: 0,
      isActive: false,
    };

    const baseParams = {
      accountId: 'acc-1',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      currency: 'USD' as const,
      actorId: 'user-1',
    };

    it('creates a holding when none exists and the replay is positive', async () => {
      tx.investmentAssetHolding.findUnique.mockResolvedValue(null);
      tx.investmentAssetHolding.create.mockResolvedValue({ id: 'h-1' });

      const result = await syncHoldingFromTrade(asTx(tx), {
        ...baseParams,
        replay: replayActive,
      });

      expect(result).toEqual({ id: 'h-1' });
      expect(tx.investmentAssetHolding.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accountId: 'acc-1',
          symbol: 'AAPL',
          name: 'Apple Inc.',
          avgCostCents: 150000,
          currency: 'USD',
          currentPriceCents: 0,
          createdBy: 'user-1',
          lastModifiedBy: 'user-1',
        }),
      });
    });

    it('is a no-op when no holding exists and the replay is zero', async () => {
      tx.investmentAssetHolding.findUnique.mockResolvedValue(null);

      const result = await syncHoldingFromTrade(asTx(tx), {
        ...baseParams,
        replay: replayClosed,
      });

      expect(result).toBeNull();
      expect(tx.investmentAssetHolding.create).not.toHaveBeenCalled();
      expect(tx.investmentAssetHolding.update).not.toHaveBeenCalled();
    });

    it('updates an existing active holding without touching currentPriceCents', async () => {
      tx.investmentAssetHolding.findUnique.mockResolvedValue({
        id: 'h-1',
        isActive: true,
        deletedAt: null,
      });
      tx.investmentAssetHolding.update.mockResolvedValue({ id: 'h-1' });

      await syncHoldingFromTrade(asTx(tx), { ...baseParams, replay: replayActive });

      const call = tx.investmentAssetHolding.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(call.data).toMatchObject({ quantity: replayActive.quantity, avgCostCents: 150000 });
      expect(call.data).not.toHaveProperty('currentPriceCents');
      expect(call.data).not.toHaveProperty('deletedAt');
    });

    it('soft-deletes an existing active holding when the replay closes it', async () => {
      tx.investmentAssetHolding.findUnique.mockResolvedValue({
        id: 'h-1',
        isActive: true,
        deletedAt: null,
      });
      tx.investmentAssetHolding.update.mockResolvedValue({ id: 'h-1' });

      await syncHoldingFromTrade(asTx(tx), { ...baseParams, replay: replayClosed });

      const call = tx.investmentAssetHolding.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(call.data.isActive).toBe(false);
      expect(call.data.deletedAt).toBeInstanceOf(Date);
    });

    it('reactivates a soft-deleted holding (deletedAt cleared) on a new buy', async () => {
      tx.investmentAssetHolding.findUnique.mockResolvedValue({
        id: 'h-1',
        isActive: false,
        deletedAt: new Date('2025-01-01'),
      });
      tx.investmentAssetHolding.update.mockResolvedValue({ id: 'h-1' });

      await syncHoldingFromTrade(asTx(tx), { ...baseParams, replay: replayActive });

      const call = tx.investmentAssetHolding.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(call.data.isActive).toBe(true);
      expect(call.data.deletedAt).toBeNull();
    });

    it('does not rewrite deletedAt when the holding stays closed', async () => {
      const originalDeletedAt = new Date('2025-01-01');
      tx.investmentAssetHolding.findUnique.mockResolvedValue({
        id: 'h-1',
        isActive: false,
        deletedAt: originalDeletedAt,
      });
      tx.investmentAssetHolding.update.mockResolvedValue({ id: 'h-1' });

      await syncHoldingFromTrade(asTx(tx), { ...baseParams, replay: replayClosed });

      const call = tx.investmentAssetHolding.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(call.data).not.toHaveProperty('deletedAt');
      expect(call.data.isActive).toBe(false);
    });
  });
});
