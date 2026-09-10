'use client';

import { memo, useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { Decimal } from 'decimal.js';
import { formatMoney, multiplyCents } from '@/lib/money';
import { get } from '@/lib/i18n';
import type { InvestmentHoldingSummary } from '@/types/investments';

interface PortfolioHoldingsTableProps {
  holdings: InvestmentHoldingSummary[];
  currency: string;
  dictionary: Record<string, unknown>;
  locale?: string;
  onSell: (holding: InvestmentHoldingSummary) => void;
}

function HoldingRow({
  holding,
  currency,
  dictionary,
  locale,
  onSell,
}: Readonly<{
  holding: InvestmentHoldingSummary;
  currency: string;
  dictionary: Record<string, unknown>;
  locale: string;
  onSell: (holding: InvestmentHoldingSummary) => void;
}>) {
  const marketValueCents = multiplyCents(holding.currentPriceCents, holding.quantity);
  const totalCostCents = multiplyCents(holding.avgCostCents, holding.quantity);
  const gainLossCents = marketValueCents - totalCostCents;
  // Display-only ratio computed with Decimal.js for full consistency (Rule 1)
  const gainLossPercent =
    totalCostCents > 0
      ? new Decimal(gainLossCents).dividedBy(totalCostCents).times(100).toNumber()
      : 0;
  const isPositive = gainLossCents >= 0;

  return (
    <tr className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.02] transition-colors">
      {/* Symbol + Name */}
      <td className="py-3 pl-4 pr-4 max-w-[160px] sm:max-w-[200px]">
        <div className="flex items-center gap-2.5 min-w-0 w-full overflow-hidden">
          <div
            className={`p-1.5 rounded-lg flex-shrink-0 ${
              isPositive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
            }`}
          >
            {isPositive ? (
              <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="text-sm font-semibold text-white truncate">{holding.symbol}</p>
            <p className="text-[11px] text-slate-400 truncate">{holding.name}</p>
          </div>
        </div>
      </td>

      {/* Quantity */}
      <td className="py-3 px-2 text-right">
        <span className="text-sm font-medium text-white tabular-nums whitespace-nowrap">
          {holding.quantity.toFixed(4)}
        </span>
      </td>

      {/* Avg Cost — hidden below xl */}
      <td className="py-3 px-2 text-right hidden xl:table-cell">
        <span className="text-sm text-slate-300 tabular-nums whitespace-nowrap">
          {formatMoney(holding.avgCostCents, currency, locale)}
        </span>
      </td>

      {/* Current Price — hidden below xl */}
      <td className="py-3 px-2 text-right hidden xl:table-cell">
        <span className="text-sm text-slate-300 tabular-nums whitespace-nowrap">
          {formatMoney(holding.currentPriceCents, currency, locale)}
        </span>
      </td>

      {/* Market Value — hidden below sm */}
      <td className="py-3 px-2 text-right hidden sm:table-cell">
        <span className="text-sm font-medium text-white tabular-nums whitespace-nowrap">
          {formatMoney(marketValueCents, currency, locale)}
        </span>
      </td>

      {/* G/L */}
      <td className="py-3 px-2 text-right">
        <span
          className={`text-xs font-semibold tabular-nums whitespace-nowrap ${
            isPositive ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {isPositive ? '+' : ''}
          {formatMoney(gainLossCents, currency, locale)}
          <span className="hidden xl:inline text-[11px] ml-1 opacity-70">
            ({isPositive ? '+' : ''}
            {gainLossPercent.toFixed(2)}%)
          </span>
        </span>
      </td>

      {/* Actions */}
      <td className="py-3 pl-2 pr-4 text-right">
        <button
          type="button"
          onClick={() => onSell(holding)}
          aria-label={`${get(dictionary, 'sell')} ${holding.symbol}`}
          className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          {get(dictionary, 'sell')}
        </button>
      </td>
    </tr>
  );
}

const MemoizedHoldingRow = memo(HoldingRow);

export function PortfolioHoldingsTable({
  holdings,
  currency,
  dictionary,
  locale = 'es-CO',
  onSell,
}: Readonly<PortfolioHoldingsTableProps>) {
  const totalMarketValueCents = useMemo(
    () => holdings.reduce((sum, h) => sum + multiplyCents(h.currentPriceCents, h.quantity), 0),
    [holdings]
  );

  const totalCostCents = useMemo(
    () => holdings.reduce((sum, h) => sum + multiplyCents(h.avgCostCents, h.quantity), 0),
    [holdings]
  );

  const totalGainLossCents = totalMarketValueCents - totalCostCents;
  const isOverallPositive = totalGainLossCents >= 0;

  if (holdings.length === 0) {
    return (
      <div className="app-shell rounded-2xl py-10 flex flex-col items-center gap-3 text-center">
        <div className="p-3 rounded-2xl bg-violet-500/10 text-violet-400">
          <DollarSign className="w-7 h-7" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white mb-1">{get(dictionary, 'noHoldings')}</p>
          <p className="text-xs text-slate-400 max-w-xs">{get(dictionary, 'noHoldingsDesc')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary row */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {get(dictionary, 'holdings')} ({holdings.length})
        </p>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-slate-400">
            {get(dictionary, 'totalInvested')}:{' '}
            <span className="text-white font-medium">
              {formatMoney(totalCostCents, currency, locale)}
            </span>
          </span>
          <span className="text-slate-400">
            {get(dictionary, 'totalMarketValue')}:{' '}
            <span className="text-white font-medium">
              {formatMoney(totalMarketValueCents, currency, locale)}
            </span>
          </span>
          <span
            className={`font-semibold ${isOverallPositive ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {isOverallPositive ? '+' : ''}
            {formatMoney(totalGainLossCents, currency, locale)}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="app-shell rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className="w-full text-left border-collapse table-auto"
            role="table"
            aria-label={get(dictionary, 'holdings')}
          >
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th
                  scope="col"
                  className="py-2.5 pl-4 pr-4 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider"
                >
                  {get(dictionary, 'symbol')}
                </th>
                <th
                  scope="col"
                  className="py-2.5 px-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider"
                >
                  {get(dictionary, 'shares')}
                </th>
                <th
                  scope="col"
                  className="py-2.5 px-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider hidden xl:table-cell"
                >
                  {get(dictionary, 'avgCost')}
                </th>
                <th
                  scope="col"
                  className="py-2.5 px-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider hidden xl:table-cell"
                >
                  {get(dictionary, 'currentPrice')}
                </th>
                <th
                  scope="col"
                  className="py-2.5 px-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell"
                >
                  {get(dictionary, 'marketValue')}
                </th>
                <th
                  scope="col"
                  className="py-2.5 px-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider"
                >
                  {get(dictionary, 'gainLoss')}
                </th>
                <th
                  scope="col"
                  className="py-2.5 pl-2 pr-4 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider"
                >
                  {/* Actions column */}
                </th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((holding) => (
                <MemoizedHoldingRow
                  key={holding.id}
                  holding={holding}
                  currency={currency}
                  dictionary={dictionary}
                  locale={locale}
                  onSell={onSell}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
