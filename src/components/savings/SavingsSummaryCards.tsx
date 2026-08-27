'use client';

import { useEffect, useState } from 'react';
import { PiggyBank, Target, TrendingUp, DollarSign } from 'lucide-react';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { getSavingsSummary, calculateMaxSpendable } from '@/actions/savings.actions';

interface SummaryData {
  totalSavedCents: number;
  totalTargetCents: number;
  overallProgressPercentage: number;
  activeGoalsCount: number;
  completedGoalsCount: number;
  monthlyContributedCents: number;
}

interface MaxSpendableData {
  totalIncomeCents: number;
  totalFixedExpensesCents: number;
  totalSavingsCommitmentsCents: number;
  totalVariableExpensesCents: number;
  maxSpendableCents: number;
}

interface SavingsSummaryCardsProps {
  dictionary: Record<string, unknown>;
  locale: string;
}

export function SavingsSummaryCards({ dictionary, locale }: Readonly<SavingsSummaryCardsProps>) {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [maxSpendable, setMaxSpendable] = useState<MaxSpendableData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        const [summaryRes, maxRes] = await Promise.all([
          getSavingsSummary({ month, year }),
          calculateMaxSpendable({ month, year }),
        ]);

        if (summaryRes.success && summaryRes.data) {
          setSummary(summaryRes.data as SummaryData);
        }
        if (maxRes.success && maxRes.data) {
          setMaxSpendable(maxRes.data as MaxSpendableData);
        }
        if (!summaryRes.success) {
          setError(true);
        }
      } catch {
        setError(true);
      }
    }
    load();
  }, []);

  if (error) {
    return (
      <div role="alert" className="app-shell rounded-2xl p-5 text-sm text-red-400">
        {get(dictionary, 'errors.loadFailed')}
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="app-shell rounded-2xl p-5 animate-pulse">
            <div className="h-4 w-20 bg-white/5 rounded mb-3" />
            <div className="h-7 w-28 bg-white/5 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const progress = summary.overallProgressPercentage;
  let progressColor = 'text-slate-400';
  if (progress >= 50) {
    progressColor = 'text-emerald-400';
  } else if (progress >= 25) {
    progressColor = 'text-amber-400';
  }

  const cards = [
    {
      label: get(dictionary, 'totalSaved'),
      value: formatMoney(summary.totalSavedCents, 'COP', locale),
      icon: PiggyBank,
      color: 'bg-emerald-500/15 text-emerald-400',
      valueColor: 'text-white',
    },
    {
      label: get(dictionary, 'totalTargets'),
      value: formatMoney(summary.totalTargetCents, 'COP', locale),
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
      subtext: `${summary.activeGoalsCount} ${get(dictionary, 'activeGoals')}`,
    },
    {
      label: get(dictionary, 'maxSpendable'),
      value: maxSpendable
        ? formatMoney(maxSpendable.maxSpendableCents, 'COP', locale)
        : formatMoney(0, 'COP', locale),
      icon: DollarSign,
      color:
        maxSpendable && maxSpendable.maxSpendableCents < 0
          ? 'bg-red-500/15 text-red-400'
          : 'bg-amber-500/15 text-amber-400',
      valueColor:
        maxSpendable && maxSpendable.maxSpendableCents < 0 ? 'text-red-400' : 'text-white',
    },
  ];

  return (
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
          <p className={`text-xl font-bold tabular-nums ${card.valueColor}`}>{card.value}</p>
          {card.subtext && <p className="mt-1 text-xs text-slate-500">{card.subtext}</p>}
        </div>
      ))}
    </div>
  );
}
