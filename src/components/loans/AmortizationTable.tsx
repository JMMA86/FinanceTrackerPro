'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Plus, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type { LoanInstallmentSerialized, LoanWithInstallments } from '@/types/loans';

interface AmortizationTableProps {
  loan: LoanWithInstallments;
  dictionary: Record<string, unknown>;
  locale: string;
  onRegisterPayment: (installment: LoanInstallmentSerialized) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_SOON_DAYS = 7;

/** PENDING/PARTIAL/OVERDUE installments can receive a payment/receipt. */
function isPayableStatus(status: string): boolean {
  return status === 'PENDING' || status === 'PARTIAL' || status === 'OVERDUE';
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'PAID':
      return 'bg-emerald-500/15 text-emerald-400';
    case 'PARTIAL':
      return 'bg-blue-500/15 text-blue-400';
    case 'OVERDUE':
      return 'bg-red-500/15 text-red-400';
    case 'WAIVED':
      return 'bg-slate-500/15 text-slate-400';
    default:
      return 'bg-amber-500/15 text-amber-400';
  }
}

function formatDate(value: Date | string, locale: string): string {
  return new Date(value).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getPaidAmount(installment: LoanInstallmentSerialized): number {
  return installment.paidAmountCents ?? 0;
}

/**
 * Accessible amortization schedule. Renders one row per installment with its
 * amounts, status and the expandable payment history. Rows that are overdue or
 * the next payable one are highlighted. The table is horizontally scrollable on
 * small screens so it never breaks the page layout.
 */
export function AmortizationTable({
  loan,
  dictionary,
  locale,
  onRegisterPayment,
}: Readonly<AmortizationTableProps>) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // `now` is only set after mount to avoid an SSR/client time mismatch.
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setNowMs(Date.now()));
    return () => cancelAnimationFrame(id);
  }, []);

  const tableCaption = `${get(dictionary, 'amortizationTable')} — ${loan.name}`;

  const currentInstallmentNumber = useMemo(() => {
    const next = loan.installments.find((installment) => isPayableStatus(installment.status));
    return next?.installmentNumber ?? null;
  }, [loan.installments]);

  const todayStartMs = nowMs == null ? null : new Date(nowMs).setHours(0, 0, 0, 0);

  function isOverdue(installment: LoanInstallmentSerialized): boolean {
    if (installment.status === 'OVERDUE') return true;
    if (!isPayableStatus(installment.status) || todayStartMs == null) return false;
    return new Date(installment.dueDate).getTime() < todayStartMs;
  }

  function isDueSoon(installment: LoanInstallmentSerialized): boolean {
    if (!isPayableStatus(installment.status) || todayStartMs == null) return false;
    const due = new Date(installment.dueDate).getTime();
    return due >= todayStartMs && due <= todayStartMs + DUE_SOON_DAYS * DAY_MS;
  }

  function togglePayments(installmentId: string) {
    setExpandedId((current) => (current === installmentId ? null : installmentId));
  }

  return (
    <section className="app-shell rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
        <h2 className="text-sm font-semibold text-white">{get(dictionary, 'amortizationTable')}</h2>
        <span className="text-xs text-slate-500 tabular-nums">{loan.installments.length}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm tabular-nums">
          <caption className="sr-only">{tableCaption}</caption>
          <thead>
            <tr className="text-slate-500 border-b border-white/5">
              <th
                scope="col"
                className="text-left text-xs uppercase tracking-wider font-semibold px-4 py-3.5"
              >
                {get(dictionary, 'table.number')}
              </th>
              <th
                scope="col"
                className="text-left text-xs uppercase tracking-wider font-semibold px-4 py-3.5"
              >
                {get(dictionary, 'table.date')}
              </th>
              <th
                scope="col"
                className="text-right text-xs uppercase tracking-wider font-semibold px-4 py-3.5"
              >
                {get(dictionary, 'table.installment')}
              </th>
              <th
                scope="col"
                className="text-right text-xs uppercase tracking-wider font-semibold px-4 py-3.5"
              >
                {get(dictionary, 'table.interest')}
              </th>
              <th
                scope="col"
                className="text-right text-xs uppercase tracking-wider font-semibold px-4 py-3.5"
              >
                {get(dictionary, 'table.principal')}
              </th>
              <th
                scope="col"
                className="text-right text-xs uppercase tracking-wider font-semibold px-4 py-3.5"
              >
                {get(dictionary, 'table.balance')}
              </th>
              <th
                scope="col"
                className="text-left text-xs uppercase tracking-wider font-semibold px-4 py-3.5"
              >
                {get(dictionary, 'table.status')}
              </th>
              <th
                scope="col"
                className="text-right text-xs uppercase tracking-wider font-semibold px-4 py-3.5"
              >
                {get(dictionary, 'actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {loan.installments.map((installment) => {
              const overdue = isOverdue(installment);
              const dueSoon = !overdue && isDueSoon(installment);
              const isCurrent =
                !overdue && installment.installmentNumber === currentInstallmentNumber;
              const paidAmountCents = getPaidAmount(installment);
              const hasPayments = installment.payments.length > 0;
              const isExpanded = expandedId === installment.id;

              let rowClass = 'border-b border-white/5';
              if (overdue) rowClass += ' bg-red-500/5';
              else if (isCurrent) rowClass += ' bg-violet-500/5';

              return (
                <Fragment key={installment.id}>
                  <tr className={rowClass}>
                    <td className="px-4 py-3.5 text-slate-400">{installment.installmentNumber}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="text-slate-200">
                        {formatDate(installment.dueDate, locale)}
                      </span>
                      <span className="flex flex-wrap gap-1 mt-1">
                        {installment.isInterestOnly && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400">
                            {get(dictionary, 'interestOnlyBadge')}
                          </span>
                        )}
                        {installment.isCustomTotal && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-400">
                            {get(dictionary, 'customBadge')}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right text-white">
                      {formatMoney(installment.totalCents, loan.currency, locale)}
                      {paidAmountCents > 0 && (
                        <span className="block text-[11px] text-emerald-400">
                          {get(dictionary, 'paidAmount')}:{' '}
                          {formatMoney(paidAmountCents, loan.currency, locale)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right text-amber-400">
                      {formatMoney(installment.interestCents, loan.currency, locale)}
                    </td>
                    <td className="px-4 py-3.5 text-right text-slate-300">
                      {formatMoney(installment.principalCents, loan.currency, locale)}
                    </td>
                    <td className="px-4 py-3.5 text-right text-slate-400">
                      {formatMoney(installment.balanceCents, loan.currency, locale)}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${getStatusBadgeClass(
                          installment.status
                        )}`}
                      >
                        {overdue && <AlertTriangle className="w-3 h-3" aria-hidden="true" />}
                        {installment.status === 'PAID' && (
                          <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                        )}
                        {get(dictionary, `installmentStatus.${installment.status}`)}
                      </span>
                      {overdue && (
                        <span className="block mt-1 text-[10px] font-semibold text-red-400">
                          {get(dictionary, 'overdue')}
                        </span>
                      )}
                      {dueSoon && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400">
                          <Clock className="w-3 h-3" aria-hidden="true" />
                          {get(dictionary, 'dueSoon')}
                        </span>
                      )}
                      {installment.paidDate && !overdue && (
                        <span className="block mt-1 text-[10px] text-slate-500">
                          {get(dictionary, 'paidOn')} {formatDate(installment.paidDate, locale)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {hasPayments && (
                          <button
                            type="button"
                            onClick={() => togglePayments(installment.id)}
                            aria-expanded={isExpanded}
                            aria-controls={`installment-payments-${installment.id}`}
                            aria-label={`${get(dictionary, 'paymentHistory')} - ${loan.name} #${
                              installment.installmentNumber
                            }`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="w-4 h-4" aria-hidden="true" />
                            )}
                          </button>
                        )}
                        {isPayableStatus(installment.status) && (
                          <button
                            type="button"
                            onClick={() => onRegisterPayment(installment)}
                            aria-label={`${get(dictionary, 'registerPayment')} - ${loan.name} #${
                              installment.installmentNumber
                            }`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-violet-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
                          >
                            <Plus className="w-4 h-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && hasPayments && (
                    <tr className="border-b border-white/5 bg-white/[0.02]">
                      <td colSpan={8} className="px-4 py-3.5">
                        <div id={`installment-payments-${installment.id}`}>
                          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                            {get(dictionary, 'paymentHistory')}
                          </p>
                          <ul className="space-y-1.5">
                            {installment.payments.map((payment) => (
                              <li
                                key={payment.id}
                                className="flex flex-wrap items-center justify-between gap-2 text-xs"
                              >
                                <span className="text-slate-300">
                                  {formatDate(payment.paidAt, locale)}
                                  {payment.notes && (
                                    <span className="ml-2 text-slate-500">{payment.notes}</span>
                                  )}
                                </span>
                                <span className="tabular-nums text-white">
                                  {formatMoney(payment.amountCents, loan.currency, locale)}
                                  <span className="ml-2 text-slate-500">
                                    ({get(dictionary, 'table.interest')}:{' '}
                                    {formatMoney(payment.interestCents, loan.currency, locale)} ·{' '}
                                    {get(dictionary, 'table.principal')}:{' '}
                                    {formatMoney(payment.principalCents, loan.currency, locale)})
                                  </span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
