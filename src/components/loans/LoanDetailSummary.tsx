import {
  Wallet,
  Percent,
  CalendarClock,
  TrendingDown,
  Activity,
  PiggyBank,
  Target,
  Coins,
} from 'lucide-react';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type { LoanWithInstallments } from '@/types/loans';

interface LoanDetailSummaryProps {
  loan: LoanWithInstallments;
  dictionary: Record<string, unknown>;
  locale: string;
}

interface SummaryCard {
  label: string;
  value: string;
  icon: typeof Wallet;
  iconClass: string;
  valueClass: string;
}

/** First installment total is the fallback "planned installment" when the loan
 * has no explicit installmentAmountCents override. */
function resolvePlannedInstallmentCents(loan: LoanWithInstallments): number {
  if (loan.installmentAmountCents != null) return loan.installmentAmountCents;
  return loan.installments[0]?.totalCents ?? 0;
}

/**
 * Presentational detail summary. Renders eight metric cards for a single loan:
 * principal, outstanding balance, rate, installment, yield, total interest,
 * total payable and repayment progress. No data fetching here.
 */
export function LoanDetailSummary({ loan, dictionary, locale }: Readonly<LoanDetailSummaryProps>) {
  const progress = Math.min(100, Math.max(0, loan.progressPct));
  const plannedInstallmentCents = resolvePlannedInstallmentCents(loan);
  const rateTypeLabel = get(dictionary, `rateType.${loan.rateType}`);

  const cards: SummaryCard[] = [
    {
      label: get(dictionary, 'principal'),
      value: formatMoney(loan.principalCents, loan.currency, locale),
      icon: Wallet,
      iconClass: 'bg-violet-500/15 text-violet-400',
      valueClass: 'text-white',
    },
    {
      label: get(dictionary, 'outstandingBalance'),
      value: formatMoney(loan.balanceCents, loan.currency, locale),
      icon: TrendingDown,
      iconClass: 'bg-amber-500/15 text-amber-400',
      valueClass: 'text-amber-400',
    },
    {
      label: get(dictionary, 'rate'),
      value: `${loan.interestRateValue}% · ${rateTypeLabel}`,
      icon: Percent,
      iconClass: 'bg-blue-500/15 text-blue-400',
      valueClass: 'text-white',
    },
    {
      label: get(dictionary, 'calculatedInstallment'),
      value: formatMoney(plannedInstallmentCents, loan.currency, locale),
      icon: CalendarClock,
      iconClass: 'bg-emerald-500/15 text-emerald-400',
      valueClass: 'text-white',
    },
    {
      label: get(dictionary, 'yield'),
      value: loan.effectiveYieldPct == null ? '—' : `${loan.effectiveYieldPct.toFixed(2)}%`,
      icon: Activity,
      iconClass: 'bg-purple-500/15 text-purple-400',
      valueClass: 'text-emerald-400',
    },
    {
      label: get(dictionary, 'totalInterest'),
      value: formatMoney(loan.totalInterestCents, loan.currency, locale),
      icon: Coins,
      iconClass: 'bg-rose-500/15 text-rose-400',
      valueClass: 'text-white',
    },
    {
      label: get(dictionary, 'totalPayable'),
      value: formatMoney(loan.totalPayableCents, loan.currency, locale),
      icon: PiggyBank,
      iconClass: 'bg-teal-500/15 text-teal-400',
      valueClass: 'text-white',
    },
    {
      label: get(dictionary, 'progress'),
      value: `${progress.toFixed(1)}%`,
      icon: Target,
      iconClass: 'bg-violet-500/15 text-violet-400',
      valueClass: 'text-white',
    },
  ];

  return (
    <section
      aria-label={get(dictionary, 'summary')}
      className="grid grid-cols-2 md:grid-cols-4 gap-4"
    >
      {cards.map((card) => (
        <div key={card.label} className="app-shell rounded-2xl p-5">
          <div className="flex items-start justify-between mb-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {card.label}
            </p>
            <div className={`p-1.5 rounded-lg ${card.iconClass}`}>
              <card.icon className="w-4 h-4" aria-hidden="true" />
            </div>
          </div>
          <p className={`text-lg font-bold tabular-nums ${card.valueClass}`}>{card.value}</p>
        </div>
      ))}
    </section>
  );
}
