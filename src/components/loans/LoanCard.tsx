'use client';

import { useMemo, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { Eye, Pencil, Trash2, CalendarClock, TrendingUp, TrendingDown } from 'lucide-react';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type { LoanWithInstallments } from '@/types/loans';

interface LoanCardProps {
  loan: LoanWithInstallments;
  dictionary: Record<string, unknown>;
  locale: string;
  onView: (loan: LoanWithInstallments) => void;
  onEdit: (loan: LoanWithInstallments) => void;
  onDelete: (loanId: string, loanName: string, hasSettledInstallments: boolean) => void;
}

const DIRECTION_DEFAULT_GRADIENT: Record<string, string> = {
  RECEIVABLE: 'from-emerald-500 to-teal-500',
  PAYABLE: 'from-amber-500 to-orange-500',
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-400',
  COMPLETED: 'bg-violet-500/15 text-violet-400',
  CANCELLED: 'bg-slate-500/15 text-slate-400',
  DEFAULTED: 'bg-red-500/15 text-red-400',
};

export function LoanCard({
  loan,
  dictionary,
  locale,
  onView,
  onEdit,
  onDelete,
}: Readonly<LoanCardProps>) {
  const isReceivable = loan.direction === 'RECEIVABLE';
  const isActive = loan.status === 'ACTIVE';
  const progress = Math.min(100, Math.max(0, loan.progressPct));

  const isHexColor = loan.color?.startsWith('#') ?? false;
  const gradient = isHexColor
    ? ''
    : loan.color ||
      DIRECTION_DEFAULT_GRADIENT[loan.direction] ||
      DIRECTION_DEFAULT_GRADIENT.RECEIVABLE;
  const solidStyle: CSSProperties | undefined =
    isHexColor && loan.color ? { background: loan.color } : undefined;

  const directionLabel = useMemo(() => {
    const key = isReceivable ? 'directionShort.RECEIVABLE' : 'directionShort.PAYABLE';
    return get(dictionary, key);
  }, [dictionary, isReceivable]);

  const statusLabel = useMemo(
    () => get(dictionary, `status.${loan.status}`),
    [dictionary, loan.status]
  );

  const typeLabel = useMemo(() => get(dictionary, `types.${loan.type}`), [dictionary, loan.type]);

  const nextDueText = useMemo(() => {
    if (!loan.nextDueDate) return null;
    return new Date(loan.nextDueDate).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }, [loan.nextDueDate, locale]);

  const hasSettledInstallments = useMemo(
    () => loan.installments.some((i) => i.status === 'PAID' || i.status === 'PARTIAL'),
    [loan.installments]
  );

  const handleEdit = useCallback(() => {
    onEdit(loan);
  }, [loan, onEdit]);

  const handleView = useCallback(() => {
    onView(loan);
  }, [loan, onView]);

  const handleDelete = useCallback(() => {
    onDelete(loan.id, loan.name, hasSettledInstallments);
  }, [loan.id, loan.name, hasSettledInstallments, onDelete]);

  const DirectionIcon = isReceivable ? TrendingUp : TrendingDown;

  return (
    <article
      className="app-shell rounded-2xl overflow-hidden group transition-all duration-200 hover:ring-1 hover:ring-white/10"
      aria-label={`${loan.name} - ${directionLabel} - ${typeLabel}`}
    >
      {/* Colored header bar */}
      <div
        className={isHexColor ? 'h-1.5' : `h-1.5 bg-gradient-to-r ${gradient}`}
        style={solidStyle}
      />

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-white truncate">{loan.name}</h3>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                  isReceivable
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-amber-500/15 text-amber-400'
                }`}
              >
                <DirectionIcon className="w-3 h-3" aria-hidden="true" />
                {directionLabel}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                  STATUS_STYLES[loan.status] ?? STATUS_STYLES.CANCELLED
                }`}
              >
                {statusLabel}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{typeLabel}</p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handleView}
              aria-label={`${get(dictionary, 'viewDetail')} - ${loan.name}`}
              className="p-1.5 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-violet-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
            >
              <Eye className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleEdit}
              aria-label={`${get(dictionary, 'edit')} - ${loan.name}`}
              className="p-1.5 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-violet-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
            >
              <Pencil className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              aria-label={`${get(dictionary, 'delete')} - ${loan.name}`}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-400">{get(dictionary, 'progress')}</span>
            <span className="text-xs font-semibold text-white tabular-nums">
              {progress.toFixed(1)}%
            </span>
          </div>
          <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
            <progress
              value={progress}
              max={100}
              aria-label={`${loan.name}: ${progress.toFixed(1)}%`}
              className={`block h-full w-full appearance-none bg-transparent [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-gradient-to-r [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-gradient-to-r ${
                isReceivable ? 'from-emerald-500 to-teal-500' : 'from-amber-500 to-orange-500'
              }`}
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {loan.paidCount} {get(dictionary, 'paidInstallments')} · {loan.pendingCount}{' '}
            {get(dictionary, 'pendingInstallments')}
          </p>
        </div>

        {/* Amounts */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              {get(dictionary, 'principal')}
            </p>
            <p className="text-sm font-bold text-white tabular-nums">
              {formatMoney(loan.principalCents, loan.currency, locale)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              {get(dictionary, 'balance')}
            </p>
            <p className="text-sm font-bold text-white tabular-nums">
              {formatMoney(loan.balanceCents, loan.currency, locale)}
            </p>
          </div>
        </div>

        {/* Rate + next due */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          <span className="tabular-nums">
            {loan.interestRateValue}% · {get(dictionary, `rateType.${loan.rateType}`)}
          </span>
          {isActive && nextDueText && (
            <div className="flex items-center gap-1">
              <CalendarClock className="w-3 h-3" aria-hidden="true" />
              <span>
                {get(dictionary, 'nextPayment')}: {nextDueText}
              </span>
            </div>
          )}
          {isActive && !nextDueText && (
            <span className="text-slate-500">{get(dictionary, 'noNextPayment')}</span>
          )}
        </div>
      </div>
    </article>
  );
}
