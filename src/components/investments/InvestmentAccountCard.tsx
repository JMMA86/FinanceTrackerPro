'use client';

import { TrendingUp, BarChart3 } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { get } from '@/lib/i18n';

export interface InvestmentAccountSummary {
  id: string;
  name: string;
  currency: string;
  balanceCents: number;
  assetHoldings?: Array<{
    id: string;
    symbol: string;
    name: string;
    quantity: number;
    avgCostCents: number;
    currentPriceCents: number;
    currency: string;
  }>;
  createdAt: Date | string;
}

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

  // Calculate total market value from holdings
  const totalMarketValueCents = (account.assetHoldings ?? []).reduce(
    (sum, h) => sum + Math.round(h.quantity * h.currentPriceCents),
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
          ? 'ring-2 ring-violet-500/60 scale-[1.02]'
          : 'hover:scale-[1.02] hover:shadow-2xl',
      ].join(' ')}
    >
      <div className="relative rounded-2xl overflow-hidden">
        {/* Gradient background */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, #6d28d9 0%, #1e1b4b 50%, #0f172a 100%)',
          }}
        />

        {/* Subtle pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
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
            background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.06) 50%, transparent 70%)',
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 p-5">
          {/* Top row: name and badge */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-lg bg-violet-500/20 text-violet-300 flex-shrink-0">
                <TrendingUp className="w-4 h-4" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-white truncate">
                {account.name}
              </p>
            </div>
            <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider bg-white/10 backdrop-blur-sm text-violet-200 px-2 py-0.5 rounded-md">
              {account.currency}
            </span>
          </div>

          {/* Balance */}
          <p className="text-2xl font-bold tracking-tight text-white mb-1">
            {formatMoney(account.balanceCents, account.currency, locale)}
          </p>

          {/* Holdings info */}
          <div className="flex items-center gap-3 mt-3">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-violet-300/70" aria-hidden="true" />
              <span className="text-xs text-violet-200/80">
                {holdingsCount > 0
                  ? get(dictionary, 'holdingCount').replace('{count}', String(holdingsCount))
                  : get(dictionary, 'noHoldings')}
              </span>
            </div>

            {holdingsCount > 0 && (
              <span className="text-xs text-violet-200/60">
                · MV {formatMoney(totalMarketValueCents, account.currency, locale)}
              </span>
            )}
          </div>
        </div>

        {/* Bottom accent line */}
        <div className="relative z-10 h-0.5 bg-gradient-to-r from-violet-600 via-violet-400/50 to-transparent" />
      </div>
    </button>
  );
}
