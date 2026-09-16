'use client';

import { Plus, Pencil, Trash2, SlidersHorizontal, TrendingUp, TrendingDown, X } from 'lucide-react';
import { get } from '@/lib/i18n';
import type { LoanInstallmentSerialized, LoanWithInstallments } from '@/types/loans';
import { LoanDetailSummary } from './LoanDetailSummary';
import { AmortizationTable } from './AmortizationTable';
import { AdjustmentsList } from './AdjustmentsList';

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-400',
  COMPLETED: 'bg-violet-500/15 text-violet-400',
  CANCELLED: 'bg-slate-500/15 text-slate-400',
  DEFAULTED: 'bg-red-500/15 text-red-400',
};

function isPayableStatus(status: string): boolean {
  return status === 'PENDING' || status === 'PARTIAL' || status === 'OVERDUE';
}

/** True when at least one installment has money settled against it. */
export function hasSettledInstallments(loan: LoanWithInstallments): boolean {
  return loan.installments.some(
    (installment) => installment.status === 'PAID' || installment.status === 'PARTIAL'
  );
}

export interface LoanDetailContentProps {
  loan: LoanWithInstallments;
  dictionary: Record<string, unknown>;
  locale: string;
  /**
   * Layout surface: `page` is the standalone deep-link route (back link lives in
   * the wrapper), `modal` is the in-place `<dialog>` body.
   */
  variant: 'page' | 'modal';
  onRegisterPayment: (installment: LoanInstallmentSerialized | null) => void;
  onAddAdjustment: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Only used by the `modal` variant to dismiss the detail dialog. */
  onClose?: () => void;
}

/**
 * Presentational body shared by the loan detail route (`LoanDetailPanel`) and the
 * in-place detail dialog (`LoanDetailModal`): header with name/direction/status
 * badges, action buttons, summary, amortization schedule and adjustments list.
 * All mutations bubble up through callbacks; no state or data fetching here.
 */
export function LoanDetailContent({
  loan,
  dictionary,
  locale,
  variant,
  onRegisterPayment,
  onAddAdjustment,
  onEdit,
  onDelete,
  onClose,
}: Readonly<LoanDetailContentProps>) {
  const isModal = variant === 'modal';
  const nextPayable = loan.installments.find((installment) => isPayableStatus(installment.status));
  const isReceivable = loan.direction === 'RECEIVABLE';
  const statusStyle = STATUS_STYLES[loan.status] ?? STATUS_STYLES.CANCELLED;

  const actions = (
    <div
      className={isModal ? 'flex items-center gap-2 flex-wrap' : 'flex items-center gap-2 shrink-0'}
    >
      <button
        type="button"
        onClick={() => onRegisterPayment(nextPayable ?? null)}
        disabled={!nextPayable}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        {get(dictionary, 'registerPayment')}
      </button>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`${get(dictionary, 'edit')} - ${loan.name}`}
        className="p-2 rounded-xl border border-white/10 text-slate-400 hover:text-violet-400 hover:bg-violet-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
      >
        <Pencil className="w-4 h-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`${get(dictionary, 'delete')} - ${loan.name}`}
        className="p-2 rounded-xl border border-white/10 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70"
      >
        <Trash2 className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );

  const heading = isModal ? (
    <h2
      id="loan-detail-modal-title"
      data-modal-heading
      tabIndex={-1}
      className="text-base font-semibold text-white truncate focus:outline-none"
    >
      {loan.name}
    </h2>
  ) : (
    <h1 className="text-xl font-semibold text-white truncate">{loan.name}</h1>
  );

  const header = (
    <div
      className={
        isModal
          ? 'flex items-start justify-between gap-3 px-6 py-4 border-b border-white/8 shrink-0 bg-slate-900 z-20'
          : 'flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'
      }
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {heading}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
              isReceivable ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
            }`}
          >
            {isReceivable ? (
              <TrendingUp className="w-3 h-3" aria-hidden="true" />
            ) : (
              <TrendingDown className="w-3 h-3" aria-hidden="true" />
            )}
            {get(dictionary, `directionShort.${loan.direction}`)}
          </span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${statusStyle}`}
          >
            {get(dictionary, `status.${loan.status}`)}
          </span>
        </div>
        <p className={isModal ? 'text-xs text-slate-500 mt-1' : 'text-sm text-slate-500 mt-1'}>
          {get(dictionary, `types.${loan.type}`)}
        </p>
      </div>

      {isModal ? (
        <button
          type="button"
          onClick={onClose}
          aria-label={get(dictionary, 'close')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      ) : (
        actions
      )}
    </div>
  );

  const sections = (
    <>
      {isModal && actions}

      {/* Summary */}
      <LoanDetailSummary loan={loan} dictionary={dictionary} locale={locale} />

      {/* Amortization schedule */}
      <AmortizationTable
        loan={loan}
        dictionary={dictionary}
        locale={locale}
        onRegisterPayment={onRegisterPayment}
      />

      {/* Adjustments */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          {isModal ? (
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              {get(dictionary, 'adjustments')}
            </h3>
          ) : (
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              {get(dictionary, 'adjustments')}
            </h2>
          )}
          <button
            type="button"
            onClick={onAddAdjustment}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            {get(dictionary, 'addAdjustment')}
          </button>
        </div>
        <AdjustmentsList
          adjustments={loan.adjustments}
          currency={loan.currency}
          dictionary={dictionary}
          locale={locale}
        />
      </div>
    </>
  );

  if (isModal) {
    return (
      <>
        {header}
        {/* Body (own scroll) */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">{sections}</div>
      </>
    );
  }

  return (
    <>
      {header}
      {sections}
    </>
  );
}
