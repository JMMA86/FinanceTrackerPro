import { CalendarClock, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type { FixedExpensesSummaryPerCurrency } from '@/types/fixed-expense';

interface FixedExpensesSummaryCardsProps {
  /** Aggregated summary buckets from getFixedExpensesSummary().byCurrency. */
  buckets: FixedExpensesSummaryPerCurrency[];
  /** Resolved error message (i18n) when the server fetch failed, else null. */
  error: string | null;
  dictionary: Record<string, unknown>;
  locale: string;
}

interface SummaryCardDef {
  label: string;
  value: string;
  icon: typeof CalendarClock;
  color: string;
  valueColor: string;
  subtext?: string;
}

function buildCardDefs(
  bucket: FixedExpensesSummaryPerCurrency,
  dictionary: Record<string, unknown>,
  locale: string
): SummaryCardDef[] {
  const isOverdue = bucket.totalOverdueCents > 0;
  const activeLabel =
    bucket.activeCount === 1 ? get(dictionary, 'expense') : get(dictionary, 'expenses');

  return [
    {
      label: get(dictionary, 'totalCommitted'),
      value: formatMoney(bucket.totalCommittedCents, bucket.currency, locale),
      icon: CalendarClock,
      color: 'bg-amber-500/15 text-amber-400',
      valueColor: 'text-white',
      subtext: `${bucket.activeCount} ${activeLabel}`,
    },
    {
      label: get(dictionary, 'paidThisMonth'),
      value: formatMoney(bucket.totalPaidCents, bucket.currency, locale),
      icon: CheckCircle2,
      color: 'bg-emerald-500/15 text-emerald-400',
      valueColor: 'text-white',
    },
    {
      label: get(dictionary, 'pendingThisMonth'),
      value: formatMoney(bucket.totalPendingCents, bucket.currency, locale),
      icon: Clock,
      color: 'bg-blue-500/15 text-blue-400',
      valueColor: 'text-white',
    },
    {
      label: get(dictionary, 'overdueThisMonth'),
      value: formatMoney(bucket.totalOverdueCents, bucket.currency, locale),
      icon: AlertTriangle,
      color: isOverdue ? 'bg-red-500/15 text-red-400' : 'bg-white/5 text-slate-500',
      valueColor: isOverdue ? 'text-red-400' : 'text-white',
    },
  ];
}

/**
 * Presentational per-currency fixed-expenses summary. Renders one 4-card row per
 * currency bucket — currencies are never merged (Decision C1). Data arrives
 * already loaded from the server page; this component performs no fetching.
 */
export function FixedExpensesSummaryCards({
  buckets,
  error,
  dictionary,
  locale,
}: Readonly<FixedExpensesSummaryCardsProps>) {
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
