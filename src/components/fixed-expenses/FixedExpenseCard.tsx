'use client';

import { useMemo, useCallback } from 'react';
import type { CSSProperties } from 'react';
import {
  Pencil,
  Trash2,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ReceiptText,
} from 'lucide-react';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type {
  FixedExpensePaymentSerialized,
  FixedExpenseWithPayments,
} from '@/types/fixed-expense';
import {
  getExpenseDisplayStatus,
  getUnpaidPayments,
  FIXED_EXPENSE_ICONS,
  type FixedExpensePaymentStatus,
} from './constants';
import { FixedExpensePaymentHistory } from './FixedExpensePaymentHistory';

interface FixedExpenseCardProps {
  expense: FixedExpenseWithPayments;
  dictionary: Record<string, unknown>;
  locale: string;
  todayStartIso: string;
  onPay: (payment: FixedExpensePaymentSerialized) => void;
  onEdit: (expense: FixedExpenseWithPayments) => void;
  onDelete: (expense: FixedExpenseWithPayments) => void;
}

const STATUS_META: Record<
  FixedExpensePaymentStatus,
  { key: string; className: string; icon: typeof CheckCircle2 }
> = {
  paid: { key: 'paid', className: 'bg-emerald-500/15 text-emerald-400', icon: CheckCircle2 },
  overdue: { key: 'overdue', className: 'bg-red-500/15 text-red-400', icon: AlertTriangle },
  pending: { key: 'pending', className: 'bg-amber-500/15 text-amber-400', icon: Clock },
};

function formatDate(value: Date | string, locale: string): string {
  return new Date(value).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Fixed expense template card: colored header bar, icon, name, expected amount,
 * frequency, next due date, status badge, actions (pay / edit / delete) and a
 * compact recent-payment history.
 */
export function FixedExpenseCard({
  expense,
  dictionary,
  locale,
  todayStartIso,
  onPay,
  onEdit,
  onDelete,
}: Readonly<FixedExpenseCardProps>) {
  const todayStart = useMemo(() => new Date(todayStartIso), [todayStartIso]);
  const status = useMemo(() => getExpenseDisplayStatus(expense, todayStart), [expense, todayStart]);
  const nextPayment = useMemo(() => getUnpaidPayments(expense)[0] ?? null, [expense]);
  const iconOption = useMemo(
    () => FIXED_EXPENSE_ICONS.find((entry) => entry.name === expense.icon),
    [expense.icon]
  );

  const rawColor = expense.color ?? '';
  const isHex = rawColor.startsWith('#');
  const isGradient = rawColor.startsWith('from-');
  const gradient = isGradient ? rawColor : 'from-amber-500 to-orange-500';
  const solidStyle: CSSProperties | undefined = isHex ? { background: rawColor } : undefined;

  const frequencyLabel = get(dictionary, `frequencies.${expense.frequency}`);
  const statusMeta = STATUS_META[status];
  const StatusIcon = statusMeta.icon;

  const handlePay = useCallback(() => {
    if (nextPayment) onPay(nextPayment);
  }, [nextPayment, onPay]);

  const handleEdit = useCallback(() => onEdit(expense), [expense, onEdit]);
  const handleDelete = useCallback(() => onDelete(expense), [expense, onDelete]);

  return (
    <article
      className="app-shell rounded-2xl overflow-hidden group transition-all duration-200 hover:ring-1 hover:ring-white/10"
      aria-label={`${expense.name} - ${frequencyLabel}`}
    >
      {/* Colored header bar */}
      <div
        className={isHex ? 'h-1.5' : `h-1.5 bg-gradient-to-r ${gradient}`}
        style={solidStyle}
        aria-hidden="true"
      />

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400 shrink-0">
              {iconOption ? (
                <iconOption.Icon className="w-4 h-4" aria-hidden="true" />
              ) : (
                <ReceiptText className="w-4 h-4" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white truncate">{expense.name}</h3>
              {expense.description && (
                <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{expense.description}</p>
              )}
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider shrink-0 ${statusMeta.className}`}
          >
            <StatusIcon className="w-3 h-3" aria-hidden="true" />
            {get(dictionary, statusMeta.key)}
          </span>
        </div>

        {/* Amount + frequency */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              {get(dictionary, 'amount')}
            </p>
            <p className="text-lg font-bold text-white tabular-nums">
              {formatMoney(expense.amountCents, expense.currency, locale)}
            </p>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-white/5 text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
            {frequencyLabel}
          </span>
        </div>

        {/* Next payment */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <CalendarClock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {nextPayment ? (
            <span>
              {get(dictionary, 'nextPayment')}:{' '}
              <span
                className={
                  status === 'overdue' ? 'text-red-400 font-semibold' : 'text-slate-200 font-medium'
                }
              >
                {formatDate(nextPayment.dueDate, locale)}
              </span>
            </span>
          ) : (
            <span>{get(dictionary, 'paid')}</span>
          )}
        </div>

        <FixedExpensePaymentHistory
          payments={expense.payments}
          dictionary={dictionary}
          locale={locale}
          todayStartIso={todayStartIso}
          limit={3}
        />

        {/* Actions */}
        <div className="flex items-center justify-end gap-1 pt-2 border-t border-white/5">
          <button
            type="button"
            onClick={handlePay}
            disabled={!nextPayment}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
            aria-label={`${get(dictionary, 'pay')} - ${expense.name}`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            {get(dictionary, 'payNow')}
          </button>
          <button
            type="button"
            onClick={handleEdit}
            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
            aria-label={`${get(dictionary, 'edit')} - ${expense.name}`}
          >
            <Pencil className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70"
            aria-label={`${get(dictionary, 'delete')} - ${expense.name}`}
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}
