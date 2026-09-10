'use client';

import { TrendingUp, BarChart3 } from 'lucide-react';
import { formatMoney, multiplyCents } from '@/lib/money';
import { get } from '@/lib/i18n';
import type { InvestmentAccountSummary } from '@/types/investments';

// Re-exported alias of the shared view type (Rule: never `as unknown as`).
export type { InvestmentAccountSummary };

interface InvestmentAccountCardProps {
  account: InvestmentAccountSummary;
  isSelected?: boolean;
  dictionary: Record<string, unknown>;
  locale?: string;
  onSelect: (accountId: string) => void;
}

export function InvestmentAccountCard({
  account,
  isSelected = false,
  dictionary,
  locale = 'es-CO',
  onSelect,
}: Readonly<InvestmentAccountCardProps>) {
  const holdingsCount = account.assetHoldings?.length ?? 0;

  // Build the plural/singular holdings label with the existing `position` /
  // `positions` keys instead of the ICU-style `holdingCount` template (which
  // was rendered literally because `.replace()` only substitutes once).
  const holdingsLabel =
    holdingsCount === 1
      ? `1 ${get(dictionary, 'position')}`
      : `${holdingsCount} ${get(dictionary, 'positions')}`;

  // Calculate total market value from holdings (Rule 1: Decimal.js)
  const totalMarketValueCents = (account.assetHoldings ?? []).reduce(
    (sum, h) => sum + multiplyCents(h.currentPriceCents, h.quantity),
    0
  );

  return (
    <button
      type="button"
      onClick={() => onSelect(account.id)}
      aria-label={account.name}
      aria-expanded={isSelected}
      className={[
        'w-full text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
        'transition-all duration-300 ease-out',
        'group relative overflow-hidden',
        isSelected
          ? 'ring-2 ring-violet-500/70 shadow-violet-900/40 shadow-xl scale-[1.02]'
          : 'hover:scale-[1.02] hover:shadow-2xl hover:shadow-violet-950/40',
      ].join(' ')}
    >
      <div className="relative rounded-2xl overflow-hidden">
        {/* Premium gradient background */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(140deg, #7c3aed 0%, #4c1d95 38%, #1e1b4b 72%, #0f172a 100%)',
          }}
        />

        {/* Soft radial glow (premium depth) */}
        <div
          className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-25 blur-3xl"
          style={{
            background: 'radial-gradient(circle, rgba(167,139,250,0.8) 0%, transparent 70%)',
          }}
          aria-hidden="true"
        />

        {/* Subtle pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: `radial-gradient(circle at 25px 25px, white 1px, transparent 1px)`,
            backgroundSize: '50px 50px',
          }}
          aria-hidden="true"
        />

        {/* Light sweep on hover */}
        <div
          className="absolute inset-0 z-20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background:
              'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.08) 50%, transparent 70%)',
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 p-5">
          {/* Screen-reader summary: announces the full card content while keeping
              the exact aria-label={account.name} used by E2E selectors */}
          <span className="sr-only">
            {get(dictionary, 'availableBalance')}:{' '}
            {formatMoney(account.balanceCents, account.currency, locale)}.{' '}
            {holdingsCount > 0 ? holdingsLabel : get(dictionary, 'noHoldings')}.
            {holdingsCount > 0
              ? ` ${get(dictionary, 'totalMarketValue')}: ${formatMoney(totalMarketValueCents, account.currency, locale)}.`
              : ''}
          </span>

          {/* Top row: name and badge */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-lg bg-white/15 text-violet-200 backdrop-blur-sm flex-shrink-0 shadow-inner">
                <TrendingUp className="w-4 h-4" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-white truncate">{account.name}</p>
            </div>
            <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider bg-white/10 backdrop-blur-md text-violet-100 px-2.5 py-1 rounded-lg border border-white/10 shadow-sm">
              {account.currency}
            </span>
          </div>

          {/* Balance */}
          <p className="text-2xl font-bold tracking-tight text-white mb-1 tabular-nums">
            {formatMoney(account.balanceCents, account.currency, locale)}
          </p>

          {/* Holdings info */}
          <div className="flex items-center gap-3 mt-3">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-violet-200/70" aria-hidden="true" />
              <span className="text-xs text-violet-100/80">
                {holdingsCount > 0 ? holdingsLabel : get(dictionary, 'noHoldings')}
              </span>
            </div>

            {holdingsCount > 0 && (
              <span className="text-xs text-violet-100/60">
                · MV {formatMoney(totalMarketValueCents, account.currency, locale)}
              </span>
            )}
          </div>
        </div>

        {/* Bottom accent line */}
        <div className="relative z-10 h-0.5 bg-gradient-to-r from-violet-400 via-fuchsia-300/60 to-transparent" />
      </div>
    </button>
  );
}
