'use client';

import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, Home, PiggyBank, ShoppingBag, ArrowRight } from 'lucide-react';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { calculateMaxSpendable } from '@/actions/savings.actions';

interface MaxSpendableData {
  totalIncomeCents: number;
  totalFixedExpensesCents: number;
  totalSavingsCommitmentsCents: number;
  totalVariableExpensesCents: number;
  maxSpendableCents: number;
}

interface MaxSpendableCardProps {
  dictionary: Record<string, unknown>;
  locale: string;
  month: number;
  year: number;
}

export function MaxSpendableCard({
  dictionary,
  locale,
  month,
  year,
}: Readonly<MaxSpendableCardProps>) {
  const [data, setData] = useState<MaxSpendableData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await calculateMaxSpendable({ month, year });
        if (res.success && res.data) {
          setData(res.data as MaxSpendableData);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      }
    }
    load();
  }, [month, year]);

  if (error) return null;

  if (!data) {
    return (
      <div className="app-shell rounded-2xl p-5 animate-pulse">
        <div className="h-4 w-36 bg-white/5 rounded mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-8 bg-white/5 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const maxIncome = Math.max(
    data.totalIncomeCents,
    data.totalFixedExpensesCents +
      data.totalSavingsCommitmentsCents +
      data.totalVariableExpensesCents +
      data.maxSpendableCents,
    1
  );

  const bars = [
    {
      label: get(dictionary, 'income'),
      value: data.totalIncomeCents,
      color: 'bg-emerald-500',
      icon: TrendingUp,
      max: maxIncome,
    },
    {
      label: get(dictionary, 'fixedExpenses'),
      value: data.totalFixedExpensesCents,
      color: 'bg-red-500',
      icon: Home,
      max: maxIncome,
    },
    {
      label: get(dictionary, 'savingsCommitments'),
      value: data.totalSavingsCommitmentsCents,
      color: 'bg-violet-500',
      icon: PiggyBank,
      max: maxIncome,
    },
    {
      label: get(dictionary, 'variableExpenses'),
      value: data.totalVariableExpensesCents,
      color: 'bg-amber-500',
      icon: ShoppingBag,
      max: maxIncome,
    },
  ];

  return (
    <div className="app-shell rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400">
          <DollarSign className="w-4 h-4" aria-hidden="true" />
        </div>
        <h3 className="text-sm font-semibold text-white">{get(dictionary, 'maxSpendable')}</h3>
      </div>

      <p className="text-xs text-slate-400 mb-4">{get(dictionary, 'maxSpendableDesc')}</p>

      <div className="space-y-3">
        {bars.map((bar) => {
          const percentage = (bar.value / bar.max) * 100;
          return (
            <div key={bar.label}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <bar.icon className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  <span className="text-xs text-slate-300">{bar.label}</span>
                </div>
                <span className="text-xs font-medium text-slate-200 tabular-nums">
                  {formatMoney(bar.value, 'COP', locale)}
                </span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${bar.color}`}
                  style={{ width: `${Math.min(percentage, 100)}%` }}
                  role="progressbar"
                  aria-valuenow={bar.value}
                  aria-valuemin={0}
                  aria-valuemax={bar.max}
                  aria-label={`${bar.label}: ${formatMoney(bar.value, 'COP', locale)}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 pt-4 border-t border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span className="text-sm font-semibold text-white">
              {get(dictionary, 'maxSpendable')}
            </span>
          </div>
          <span className="text-lg font-bold text-emerald-400 tabular-nums">
            {formatMoney(data.maxSpendableCents, 'COP', locale)}
          </span>
        </div>
        {data.maxSpendableCents < 0 && (
          <p className="mt-2 text-xs text-red-400" role="alert">
            {get(dictionary, 'overdraftWarning')}
          </p>
        )}
      </div>
    </div>
  );
}
