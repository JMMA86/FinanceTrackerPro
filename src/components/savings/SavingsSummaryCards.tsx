import { PiggyBank, Target, TrendingUp, CalendarClock } from 'lucide-react';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type { SavingsSummaryPerCurrency } from '@/types/savings';

interface SavingsSummaryCardsProps {
  /** Aggregated summary buckets from getSavingsSummary().byCurrency. */
  buckets: SavingsSummaryPerCurrency[];
  /** Resolved error message (i18n) when the server fetch failed, else null. */
  error: string | null;
  dictionary: Record<string, unknown>;
  locale: string;
}

interface SummaryCardDef {
  label: string;
  value: string;
  icon: typeof PiggyBank;
  color: string;
  valueColor: string;
  subtext?: string;
}

function buildCardDefs(
  bucket: SavingsSummaryPerCurrency,
  dictionary: Record<string, unknown>,
  locale: string
): SummaryCardDef[] {
  const progress = bucket.overallProgressPercentage;
  let progressColor = 'text-slate-400';
  if (progress >= 50) {
    progressColor = 'text-emerald-400';
  } else if (progress >= 25) {
    progressColor = 'text-amber-400';
  }

  const activeLabel =
    bucket.activeGoalsCount === 1 ? get(dictionary, 'activeGoal') : get(dictionary, 'activeGoals');

  return [
    {
      label: get(dictionary, 'totalSaved'),
      value: formatMoney(bucket.totalSavedCents, bucket.currency, locale),
      icon: PiggyBank,
      color: 'bg-emerald-500/15 text-emerald-400',
      valueColor: 'text-white',
    },
    {
      label: get(dictionary, 'totalTargets'),
      value: formatMoney(bucket.totalTargetCents, bucket.currency, locale),
      icon: Target,
      color: 'bg-violet-500/15 text-violet-400',
      valueColor: 'text-white',
    },
    {
      label: get(dictionary, 'overallProgress'),
      value: `${progress.toFixed(1)}%`,
      icon: TrendingUp,
      color: `bg-emerald-500/15 ${progressColor}`,
      valueColor: progressColor,
      subtext: `${bucket.activeGoalsCount} ${activeLabel}`,
    },
    {
      label: get(dictionary, 'thisMonth'),
      value: formatMoney(bucket.monthlyContributedCents, bucket.currency, locale),
      icon: CalendarClock,
      color: 'bg-amber-500/15 text-amber-400',
      valueColor: 'text-white',
    },
  ];
}

/**
 * Presentational per-currency savings summary. Renders one 4-card row per
 * currency bucket — currencies are never merged (Decision Log C1). Data arrives
 * already loaded from the server page; this component performs no fetching.
 */
export function SavingsSummaryCards({
  buckets,
  error,
  dictionary,
  locale,
}: Readonly<SavingsSummaryCardsProps>) {
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
