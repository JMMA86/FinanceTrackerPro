import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type { FixedExpensePaymentSerialized } from '@/types/fixed-expense';
import { getPaymentStatus, type FixedExpensePaymentStatus } from './constants';

interface FixedExpensePaymentHistoryProps {
  payments: FixedExpensePaymentSerialized[];
  dictionary: Record<string, unknown>;
  locale: string;
  /** Reference "today" (ISO timestamp) passed down from the RSC for stable status. */
  todayStartIso: string;
  /** Max rows rendered (most recent first). Omit to render the full history. */
  limit?: number;
}

const STATUS_BADGE: Record<FixedExpensePaymentStatus, string> = {
  paid: 'bg-emerald-500/15 text-emerald-400',
  overdue: 'bg-red-500/15 text-red-400',
  pending: 'bg-amber-500/15 text-amber-400',
};

const STATUS_KEY: Record<FixedExpensePaymentStatus, string> = {
  paid: 'paid',
  overdue: 'overdue',
  pending: 'pending',
};

/** One rendered row: the payment plus the date actually shown for it. */
interface HistoryRow {
  payment: FixedExpensePaymentSerialized;
  date: Date;
}

function formatDate(value: Date | string, locale: string): string {
  return new Date(value).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Presentational list of materialized payments with date, amount and status.
 *
 * Two clearly separated modes:
 * - Compact ("recentPayments", used inside the expense card with `limit`):
 *   ONLY payments that were actually made (`paidDate != null`), sorted by the
 *   paid date descending and showing that paid date. Renders nothing when there
 *   are no settled payments.
 * - Full history (no `limit`): every payment sorted by due date descending,
 *   showing the due date.
 */
export function FixedExpensePaymentHistory({
  payments,
  dictionary,
  locale,
  todayStartIso,
  limit,
}: Readonly<FixedExpensePaymentHistoryProps>) {
  const todayStart = new Date(todayStartIso);
  const isCompact = typeof limit === 'number';

  const rows: HistoryRow[] = isCompact
    ? payments
        .filter(
          (payment): payment is FixedExpensePaymentSerialized & { paidDate: Date } =>
            payment.paidDate != null
        )
        .sort((a, b) => b.paidDate.getTime() - a.paidDate.getTime())
        .slice(0, limit)
        .map((payment) => ({ payment, date: payment.paidDate }))
    : [...payments]
        .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())
        .map((payment) => ({ payment, date: new Date(payment.dueDate) }));

  if (rows.length === 0) {
    if (isCompact) return null;
    return <p className="text-xs text-slate-500">{get(dictionary, 'noPayments')}</p>;
  }

  const titleKey = isCompact ? 'recentPayments' : 'paymentHistory';

  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
        {get(dictionary, titleKey)}
      </p>
      <ul className="space-y-1">
        {rows.map(({ payment, date }) => {
          const status = getPaymentStatus(payment, todayStart);
          const amount = payment.paidAmountCents ?? payment.expectedAmountCents;
          return (
            <li key={payment.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-400 truncate">{formatDate(date, locale)}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="font-medium text-slate-200 tabular-nums">
                  {formatMoney(amount, payment.currency, locale)}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${STATUS_BADGE[status]}`}
                >
                  {get(dictionary, STATUS_KEY[status])}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
