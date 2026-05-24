'use client';

import { memo, useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { get } from '@/lib/i18n';

interface Holding {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  avgCostCents: number;
  currentPriceCents: number;
  currency: string;
}

interface PortfolioHoldingsTableProps {
  holdings: Holding[];
  currency: string;
  dictionary: Record<string, unknown>;
  locale?: string;
  onSell: (holding: Holding) => void;
}

function HoldingRow({
  holding,
  currency,
  dictionary,
  locale,
  onSell,
}: Readonly<{
  holding: Holding;
  currency: string;
  dictionary: Record<string, unknown>;
  locale: string;
  onSell: (holding: Holding) => void;
}>) {
  const marketValueCents = Math.round(holding.quantity * holding.currentPriceCents);
  const totalCostCents = Math.round(holding.quantity * holding.avgCostCents);
  const gainLossCents = marketValueCents - totalCostCents;
  const gainLossPercent = totalCostCents > 0
    ? ((gainLossCents / totalCostCents) * 100)
    : 0;
  const isPositive = gainLossCents >= 0;

  return (
    <tr className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.02] transition-colors">
      {/* Symbol + Name */}
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg flex-shrink-0 ${
            isPositive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
          }`}>
            {isPositive ? (
              <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">{holding.symbol}</p>
            <p className="text-[11px] text-slate-400 truncate max-w-[140px]">{holding.name}</p>
          </div>
        </div>
      </td>

      {/* Quantity */}
      <td className="py-3 px-2 text-right">
        <span className="text-sm font-medium text-white tabular-nums">
          {holding.quantity.toFixed(4)}
        </span>
      </td>

      {/* Avg Cost */}
      <td className="py-3 px-2 text-right">
        <span className="text-sm text-slate-300 tabular-nums">
          {formatMoney(holding.avgCostCents, currency, locale)}
        </span>
      </td>

      {/* Current Price */}
      <td className="py-3 px-2 text-right">
        <span className="text-sm text-slate-300 tabular-nums">
          {formatMoney(holding.currentPriceCents, currency, locale)}
        </span>
      </td>

      {/* Market Value */}
      <td className="py-3 px-2 text-right">
        <span className="text-sm font-medium text-white tabular-nums">
          {formatMoney(marketValueCents, currency, locale)}
        </span>
      </td>

      {/* G/L */}
      <td className="py-3 px-2 text-right">
        <span className={`text-sm font-semibold tabular-nums ${
          isPositive ? 'text-emerald-400' : 'text-red-400'
        }`}>
          {isPositive ? '+' : ''}{formatMoney(gainLossCents, currency, locale)}
          <span className="text-[11px] ml-1 opacity-70">
            ({isPositive ? '+' : ''}{gainLossPercent.toFixed(2)}%)
          </span>
        </span>
      </td>

      {/* Actions */}
      <td className="py-3 pl-2 text-right">
        <button
          type="button"
          onClick={() => onSell(holding)}
          aria-label={`${get(dictionary, 'sell')} ${holding.symbol}`}
          className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
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
    () => holdings.reduce((sum, h) => sum + Math.round(h.quantity * h.currentPriceCents), 0),
    [holdings]
  );

  const totalCostCents = useMemo(
    () => holdings.reduce((sum, h) => sum + Math.round(h.quantity * h.avgCostCents), 0),
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
            {get(dictionary, 'totalInvested')}: <span className="text-white font-medium">{formatMoney(totalCostCents, currency, locale)}</span>
          </span>
          <span className="text-slate-400">
            {get(dictionary, 'totalMarketValue')}: <span className="text-white font-medium">{formatMoney(totalMarketValueCents, currency, locale)}</span>
          </span>
          <span className={`font-semibold ${isOverallPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {isOverallPositive ? '+' : ''}{formatMoney(totalGainLossCents, currency, locale)}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="app-shell rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" role="table" aria-label={get(dictionary, 'holdings')}>
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="py-2.5 pr-4 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  {get(dictionary, 'symbol')}
                </th>
                <th className="py-2.5 px-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  {get(dictionary, 'shares')}
                </th>
                <th className="py-2.5 px-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  {get(dictionary, 'avgCost')}
                </th>
                <th className="py-2.5 px-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  {get(dictionary, 'currentPrice')}
                </th>
                <th className="py-2.5 px-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  {get(dictionary, 'marketValue')}
                </th>
                <th className="py-2.5 px-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  {get(dictionary, 'gainLoss')}
                </th>
                <th className="py-2.5 pl-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
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
