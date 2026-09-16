import { DollarSign, TrendingUp, Home, PiggyBank, ShoppingBag, ArrowRight } from 'lucide-react';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type { MaxSpendablePerCurrency } from '@/types/savings';

interface MaxSpendableCardProps {
  /** Per-currency breakdown from getMaxSpendable().byCurrency. */
  buckets: MaxSpendablePerCurrency[];
  /** Resolved error message (i18n) when the server fetch failed, else null. */
  error: string | null;
  dictionary: Record<string, unknown>;
  locale: string;
}

// Fill color for native <progress> pseudo-elements (webkit/moz)
const BAR_FILL: Record<string, string> = {
  'bg-emerald-500':
    '[&::-webkit-progress-value]:bg-emerald-500 [&::-moz-progress-bar]:bg-emerald-500',
  'bg-red-500': '[&::-webkit-progress-value]:bg-red-500 [&::-moz-progress-bar]:bg-red-500',
  'bg-violet-500': '[&::-webkit-progress-value]:bg-violet-500 [&::-moz-progress-bar]:bg-violet-500',
  'bg-amber-500': '[&::-webkit-progress-value]:bg-amber-500 [&::-moz-progress-bar]:bg-amber-500',
};

/**
 * Presentational per-currency "available to spend" breakdown. Currencies are
 * never merged (Decision Log C1): a single currency renders one breakdown,
 * several render one block each inside the same card. Data comes from the
 * server page as props — no fetching here.
 */
export function MaxSpendableCard({
  buckets,
  error,
  dictionary,
  locale,
}: Readonly<MaxSpendableCardProps>) {
  if (error) {
    return (
      <div role="alert" className="app-shell rounded-2xl p-5 text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (buckets.length === 0) return null;

  return (
    <div className="app-shell rounded-2xl p-5 space-y-6">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400">
          <DollarSign className="w-4 h-4" aria-hidden="true" />
        </div>
        <h2 className="text-sm font-semibold text-white">{get(dictionary, 'maxSpendable')}</h2>
      </div>

      <p className="text-xs text-slate-400">{get(dictionary, 'maxSpendableDesc')}</p>

      {buckets.map((bucket) => {
        const maxIncome = Math.max(
          bucket.totalIncomeCents,
          bucket.totalFixedExpensesCents +
            bucket.totalSavingsCommitmentsCents +
            bucket.totalVariableExpensesCents +
            bucket.maxSpendableCents,
          1
        );

        const bars = [
          {
            label: get(dictionary, 'income'),
            value: bucket.totalIncomeCents,
            color: 'bg-emerald-500',
            icon: TrendingUp,
            max: maxIncome,
          },
          {
            label: get(dictionary, 'fixedExpenses'),
            value: bucket.totalFixedExpensesCents,
            color: 'bg-red-500',
            icon: Home,
            max: maxIncome,
          },
          {
            label: get(dictionary, 'savingsCommitments'),
            value: bucket.totalSavingsCommitmentsCents,
            color: 'bg-violet-500',
            icon: PiggyBank,
            max: maxIncome,
          },
          {
            label: get(dictionary, 'variableExpenses'),
            value: bucket.totalVariableExpensesCents,
            color: 'bg-amber-500',
            icon: ShoppingBag,
            max: maxIncome,
          },
        ];

        const multiple = buckets.length > 1;
        const currencyLabel = get(dictionary, 'maxSpendable');

        return (
          <section
            key={bucket.currency}
            aria-label={multiple ? `${currencyLabel} ${bucket.currency}` : currencyLabel}
            className="space-y-3"
          >
            {multiple && (
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {bucket.currency}
              </h3>
            )}

            <div className="space-y-3">
              {bars.map((bar) => (
                <div key={bar.label}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <bar.icon className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                      <span className="text-xs text-slate-300">{bar.label}</span>
                    </div>
                    <span className="text-xs font-medium text-slate-200 tabular-nums">
                      {formatMoney(bar.value, bucket.currency, locale)}
                    </span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <progress
                      value={bar.value}
                      max={bar.max}
                      aria-label={`${bar.label}: ${formatMoney(bar.value, bucket.currency, locale)}`}
                      className={`block h-full w-full appearance-none bg-transparent [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:rounded-full [&::-moz-progress-bar]:rounded-full ${
                        BAR_FILL[bar.color] ?? ''
                      }`}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                  <span className="text-sm font-semibold text-white">{currencyLabel}</span>
                </div>
                <span
                  className={`text-lg font-bold tabular-nums ${
                    bucket.maxSpendableCents < 0 ? 'text-red-400' : 'text-emerald-400'
                  }`}
                >
                  {formatMoney(bucket.maxSpendableCents, bucket.currency, locale)}
                </span>
              </div>
              {bucket.maxSpendableCents < 0 && (
                <p className="mt-2 text-xs text-red-400" role="alert">
                  {get(dictionary, 'overdraftWarning')}
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
