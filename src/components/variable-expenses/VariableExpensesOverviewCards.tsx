import { Wallet, ReceiptText, Tags } from 'lucide-react';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type { VariableExpensesOverviewBucket } from '@/types/variable-expense';

interface VariableExpensesOverviewCardsProps {
  /** Per-currency overview buckets (currencies are never mixed). */
  buckets: VariableExpensesOverviewBucket[];
  /** Resolved error message (i18n) when the server fetch failed, else null. */
  error: string | null;
  dictionary: Record<string, unknown>;
  locale: string;
}

interface OverviewCardDef {
  label: string;
  value: string;
  icon: typeof Wallet;
  color: string;
}

function buildCardDefs(
  bucket: VariableExpensesOverviewBucket,
  dictionary: Record<string, unknown>,
  locale: string
): OverviewCardDef[] {
  return [
    {
      label: get(dictionary, 'totalMonitored'),
      value: formatMoney(bucket.totalCents, bucket.currency, locale),
      icon: Wallet,
      color: 'bg-teal-500/15 text-teal-400',
    },
    {
      label: get(dictionary, 'transactionCount'),
      value: String(bucket.transactionCount),
      icon: ReceiptText,
      color: 'bg-sky-500/15 text-sky-400',
    },
    {
      label: get(dictionary, 'definitionsCount'),
      value: String(bucket.definitionsCount),
      icon: Tags,
      color: 'bg-violet-500/15 text-violet-400',
    },
  ];
}

/**
 * Presentational per-currency overview: total monitored, transaction count and
 * number of definitions. Currencies are NEVER merged. Data arrives already
 * loaded from the server page.
 */
export function VariableExpensesOverviewCards({
  buckets,
  error,
  dictionary,
  locale,
}: Readonly<VariableExpensesOverviewCardsProps>) {
  if (error) {
    return (
      <div role="alert" className="app-shell rounded-2xl p-5 text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (buckets.length === 0) return null;

  const multipleCurrencies = buckets.length > 1;

  return (
    <div className="space-y-6">
      {buckets.map((bucket) => {
        const cards = buildCardDefs(bucket, dictionary, locale);
        return (
          <section
            key={bucket.currency}
            aria-label={
              multipleCurrencies
                ? `${get(dictionary, 'overview')} ${bucket.currency}`
                : get(dictionary, 'overview')
            }
            className={multipleCurrencies ? 'space-y-2' : undefined}
          >
            {multipleCurrencies && (
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {bucket.currency}
              </h2>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {cards.map((card) => (
                <div key={card.label} className="app-shell rounded-2xl p-5">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {card.label}
                    </p>
                    <div className={`p-1.5 rounded-lg ${card.color}`}>
                      <card.icon className="w-4 h-4" aria-hidden="true" />
                    </div>
                  </div>
                  <p className="text-xl font-bold tabular-nums text-white">{card.value}</p>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
