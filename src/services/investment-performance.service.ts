/**
 * Investment Performance Service (B6)
 * Computes the performance series for a single investment account, used to
 * render the "Rendimiento por cuenta" chart.
 *
 * Rules applied:
 * - Rule 1: Decimal.js (via @/lib/money) for every monetary aggregation
 * - Rule 11: invested net = cash-in − cash-out (TRANSFER_IN/INCOME − TRANSFER_OUT)
 * - Rule 13: holdings market value is computed from holdings. The CASH component
 *   defaults to the cached `account.balanceCents` for the investments page, but
 *   callers that already hold the ledger truth (e.g. the dashboard) can pass
 *   `options.cashBalanceCents` so the cash component is derived from the
 *   transaction ledger instead of the cache. The dashboard therefore no longer
 *   relies on the cached balance for its investment cash.
 */

import 'server-only';
import { Decimal } from 'decimal.js';
import { addCents, multiplyCents, subtractCents } from '@/lib/money';
import type { Currency, PrismaClient } from '@prisma/client';

export interface PerformancePoint {
  date: Date | string;
  investedCents: number;
}

/**
 * Optional inputs that let a caller override the cash component with a
 * ledger-derived value (Rule 13 — the transaction ledger is the source of
 * truth). When omitted, the service keeps using the cached balance so the
 * investments page contract is unchanged.
 */
export interface InvestmentPerformanceOptions {
  /**
   * Ledger-derived cash balance, in cents, of the investment account. When
   * provided (including 0) it REPLACES the cached `account.balanceCents` for the
   * cash component; when omitted the cached balance is used.
   */
  cashBalanceCents?: number;
}

export interface InvestmentPerformance {
  accountId: string;
  name: string;
  currency: Currency;
  /** Net cash-in − cash-out: TRANSFER_IN + INCOME − TRANSFER_OUT */
  totalInvestedCents: number;
  /**
   * Cash balance of the account. Defaults to the cached `account.balanceCents`;
   * when a ledger balance is supplied via `options.cashBalanceCents`, this is the
   * ledger-derived cash (dashboard path).
   */
  cashBalanceCents: number;
  /** sum(quantity * currentPriceCents) over active holdings */
  holdingsMarketValueCents: number;
  /** cash + holdings */
  totalValueCents: number;
  /** totalValue − totalInvested */
  totalReturnCents: number;
  /** (totalReturn / totalInvested) * 100, 0 when totalInvested = 0 */
  totalReturnPct: number;
  /** Cumulative net invested per funding transaction date (ascending) */
  series: PerformancePoint[];
}

/**
 * Build the performance report for an investment account.
 * @param prismaClient Prisma client or transaction client
 * @param accountId Investment account id
 * @param options Optional ledger-derived cash override (Rule 13). Omit to keep
 *   using the cached account balance (investments page).
 */
export async function getInvestmentPerformance(
  prismaClient: PrismaClient,
  accountId: string,
  options?: InvestmentPerformanceOptions
): Promise<InvestmentPerformance> {
  const account = await prismaClient.account.findUnique({
    where: { id: accountId },
    select: { id: true, name: true, currency: true, balanceCents: true },
  });

  if (!account) {
    throw new Error(`Investment account ${accountId} not found`);
  }

  // Funding transactions sorted by date so the cumulative series is monotonic.
  // TRANSFER_IN/INCOME carry a positive amount, TRANSFER_OUT a negative one,
  // so a direct sum already produces "net invested" (cash-in − cash-out).
  const fundingTxs = await prismaClient.transaction.findMany({
    where: {
      accountId,
      isActive: true,
      type: { in: ['TRANSFER_IN', 'TRANSFER_OUT', 'INCOME'] },
    },
    select: { date: true, amountCents: true },
    orderBy: { date: 'asc' },
  });

  let totalInvestedCents = 0;
  const series: PerformancePoint[] = [];
  for (const tx of fundingTxs) {
    totalInvestedCents = addCents(totalInvestedCents, Number(tx.amountCents));
    series.push({ date: tx.date, investedCents: totalInvestedCents });
  }

  // Holdings market value (Rule 1: multiplyCents uses Decimal.js)
  const holdings = await prismaClient.investmentAssetHolding.findMany({
    where: { accountId, isActive: true },
    select: { quantity: true, currentPriceCents: true },
  });

  let holdingsMarketValueCents = 0;
  for (const holding of holdings) {
    holdingsMarketValueCents = addCents(
      holdingsMarketValueCents,
      multiplyCents(Number(holding.currentPriceCents), Number(holding.quantity))
    );
  }

  const cashBalanceCents = options?.cashBalanceCents ?? Number(account.balanceCents);
  const totalValueCents = addCents(cashBalanceCents, holdingsMarketValueCents);
  const totalReturnCents = subtractCents(totalValueCents, totalInvestedCents);
  const totalReturnPct =
    totalInvestedCents === 0
      ? 0
      : new Decimal(totalReturnCents)
          .dividedBy(totalInvestedCents)
          .times(100)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN)
          .toNumber();

  // Append a final point "today" so the chart always ends at the current net invested
  series.push({ date: new Date(), investedCents: totalInvestedCents });

  return {
    accountId: account.id,
    name: account.name,
    currency: account.currency,
    totalInvestedCents,
    cashBalanceCents,
    holdingsMarketValueCents,
    totalValueCents,
    totalReturnCents,
    totalReturnPct,
    series,
  };
}
