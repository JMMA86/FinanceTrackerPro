/**
 * Investment Ledger Service (CLAUDE.md Rule 11 — source of truth)
 *
 * Rebuilds an `InvestmentAssetHolding` from the investment transaction history
 * of a single symbol. The replay is the authoritative computation used after
 * editing or reversing a trade so the holding cache can never drift from the
 * ledger.
 *
 * CRITICAL RULES:
 * - Rule 1: every monetary/quantity operation uses Decimal.js (Banker's rounding)
 * - Rule 2: amounts stored as integer cents
 * - Rule 5: input validation errors are thrown as `ValidationError`
 * - Rule 6: a holding that reaches zero quantity is soft-deleted, never removed
 * - Rule 13: the ledger is the source of truth; the holding is a cache
 */

import 'server-only';
import { Decimal } from 'decimal.js';
import type { Currency, InvestmentAssetHolding, Prisma } from '@prisma/client';
import { decimalToCents } from '@/lib/money';
import { ValidationError } from '@/lib/errors/api-errors';

export interface LedgerReplayResult {
  /** Remaining quantity after replaying every active BUY/SELL. */
  quantity: Decimal;
  /** Average cost per share in cents (0 when the position is closed). */
  avgCostCents: number;
  /** False when the position is fully closed (quantity === 0). */
  isActive: boolean;
}

const LEDGER_QUANTITY_ERROR = 'Sell quantity exceeds ledger quantity';
const LEDGER_MISSING_DATA_ERROR = 'Investment trade is missing structured asset data';

/**
 * Replay the investment ledger of `symbol` for `accountId` (average-cost
 * method) and return the derived position.
 *
 * Runs inside a transaction client so it observes the in-flight mutation and
 * any concurrently committed trades.
 */
export async function recomputeHoldingFromLedger(
  tx: Prisma.TransactionClient,
  accountId: string,
  symbol: string
): Promise<LedgerReplayResult> {
  const trades = await tx.transaction.findMany({
    where: {
      accountId,
      assetSymbol: symbol,
      isActive: true,
      type: 'INVESTMENT',
      assetTradeType: { in: ['BUY', 'SELL'] },
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: {
      assetTradeType: true,
      assetQuantity: true,
      assetPricePerShareCents: true,
    },
  });

  let qty = new Decimal(0);
  let totalCostCents = new Decimal(0);

  for (const trade of trades) {
    if (trade.assetQuantity == null || trade.assetPricePerShareCents == null) {
      throw new ValidationError(LEDGER_MISSING_DATA_ERROR);
    }

    const tradeQty = new Decimal(trade.assetQuantity.toString());
    const priceCents = new Decimal(trade.assetPricePerShareCents.toString());

    if (trade.assetTradeType === 'BUY') {
      qty = qty.plus(tradeQty);
      totalCostCents = totalCostCents.plus(tradeQty.times(priceCents));
      continue;
    }

    // SELL: cannot sell more than the position currently holds.
    if (qty.isZero() || tradeQty.greaterThan(qty)) {
      throw new ValidationError(LEDGER_QUANTITY_ERROR);
    }

    const avgCost = totalCostCents.dividedBy(qty);
    totalCostCents = totalCostCents.minus(tradeQty.times(avgCost));
    qty = qty.minus(tradeQty);

    if (qty.isZero()) {
      totalCostCents = new Decimal(0);
    }
  }

  const avgCostCents = qty.isZero() ? 0 : decimalToCents(totalCostCents.dividedBy(qty));

  return { quantity: qty, avgCostCents, isActive: !qty.isZero() };
}

export interface SyncHoldingParams {
  accountId: string;
  symbol: string;
  /** Display name used only when the holding row has to be created. */
  name: string;
  currency: Currency;
  replay: LedgerReplayResult;
  /** Audit actor (Rule 7). */
  actorId: string;
}

/**
 * Persist the replay result into `InvestmentAssetHolding`.
 *
 * - Existing row (active or soft-deleted): updates `quantity`, `avgCostCents`,
 *   `isActive` and `deletedAt` (reactivates / soft-deletes as needed). The
 *   market price (`currentPriceCents`) is intentionally NOT touched — it is
 *   owned by the market refresh flow.
 * - Missing row with a positive quantity: creates it with `currentPriceCents: 0`.
 * - Missing row with zero quantity: no-op (nothing to persist).
 *
 * @returns the persisted holding, or null when there is nothing to persist.
 */
export async function syncHoldingFromTrade(
  tx: Prisma.TransactionClient,
  params: SyncHoldingParams
): Promise<InvestmentAssetHolding | null> {
  const { accountId, symbol, name, currency, replay, actorId } = params;

  const existing = await tx.investmentAssetHolding.findUnique({
    where: { accountId_symbol: { accountId, symbol } },
  });

  if (existing) {
    const data: Prisma.InvestmentAssetHoldingUpdateInput = {
      quantity: replay.quantity,
      avgCostCents: replay.avgCostCents,
      isActive: replay.isActive,
      lastModifiedBy: actorId,
    };

    // Only rewrite `deletedAt` on a state transition. A holding that was already
    // closed and remains closed keeps its original soft-delete timestamp.
    if (replay.isActive && !existing.isActive) {
      data.deletedAt = null;
    } else if (!replay.isActive && existing.isActive) {
      data.deletedAt = new Date();
    }

    return tx.investmentAssetHolding.update({
      where: { id: existing.id },
      data,
    });
  }

  if (replay.quantity.isZero()) {
    return null;
  }

  return tx.investmentAssetHolding.create({
    data: {
      accountId,
      symbol,
      name,
      quantity: replay.quantity,
      avgCostCents: replay.avgCostCents,
      currency,
      currentPriceCents: 0,
      createdBy: actorId,
      lastModifiedBy: actorId,
    },
  });
}
