import { TrendingUp, TrendingDown, Wallet, Percent, CalendarClock } from 'lucide-react';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type { LoanSummaryPerCurrency } from '@/types/loans';

interface LoansSummaryCardsProps {
  /** Aggregated summary buckets from getLoansSummary().byCurrency. */
  buckets: LoanSummaryPerCurrency[];
  /** Resolved error message (i18n) when the server fetch failed, else null. */
  error: string | null;
  dictionary: Record<string, unknown>;
  locale: string;
}

interface SummaryCardDef {
  label: string;
  value: string;
  icon: typeof TrendingUp;
  color: string;
  valueColor: string;
  subtext?: string;
}

function buildCardDefs(
  bucket: LoanSummaryPerCurrency,
  dictionary: Record<string, unknown>,
  locale: string
): SummaryCardDef[] {
  const activeLabel = get(dictionary, 'activeLoans');

  return [
    {
      label: get(dictionary, 'totalReceivable'),
      value: formatMoney(bucket.totalReceivableCents, bucket.currency, locale),
      icon: TrendingUp,
      color: 'bg-emerald-500/15 text-emerald-400',
      valueColor: 'text-emerald-400',
    },
    {
      label: get(dictionary, 'directionShort.PAYABLE'),
      value: formatMoney(bucket.totalPayableCents, bucket.currency, locale),
      icon: TrendingDown,
      color: 'bg-amber-500/15 text-amber-400',
      valueColor: 'text-amber-400',
    },
    {
      label: get(dictionary, 'totalPrincipal'),
      value: formatMoney(bucket.totalPrincipalCents, bucket.currency, locale),
      icon: Wallet,
      color: 'bg-violet-500/15 text-violet-400',
      valueColor: 'text-white',
      subtext: `${bucket.activeCount} ${activeLabel}`,
    },
    {
      label: get(dictionary, 'totalInterest'),
      value: formatMoney(bucket.totalInterestCents, bucket.currency, locale),
      icon: Percent,
      color: 'bg-blue-500/15 text-blue-400',
      valueColor: 'text-white',
    },
    {
      label: get(dictionary, 'monthlyDue'),
      value: formatMoney(bucket.monthlyDueCents, bucket.currency, locale),
      icon: CalendarClock,
      color: 'bg-amber-500/15 text-amber-400',
      valueColor: 'text-white',
    },
  ];
}

/**
 * Presentational per-currency loans summary. Renders one 5-card row per currency
 * bucket — currencies are never merged (Decision Log C1). Data arrives already
 * loaded from the server page; this component performs no fetching.
 */
export function LoansSummaryCards({
  buckets,
  error,
  dictionary,
  locale,
}: Readonly<LoansSummaryCardsProps>) {
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
                ? `${get(dictionary, 'summary')} ${bucket.currency}`
                : get(dictionary, 'summary')
            }
            className={multipleCurrencies ? 'space-y-2' : undefined}
          >
            {multipleCurrencies && (
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {bucket.currency}
              </h2>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
                  <p className={`text-xl font-bold tabular-nums ${card.valueColor}`}>
                    {card.value}
                  </p>
                  {card.subtext && <p className="mt-1 text-xs text-slate-500">{card.subtext}</p>}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
