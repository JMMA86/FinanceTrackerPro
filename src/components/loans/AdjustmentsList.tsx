import { SlidersHorizontal } from 'lucide-react';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type { LoanAdjustmentSerialized } from '@/types/loans';

interface AdjustmentsListProps {
  adjustments: LoanAdjustmentSerialized[];
  /** Loan currency used to format monetary adjustments. */
  currency: string;
  dictionary: Record<string, unknown>;
  locale: string;
}

function formatDate(value: Date | string, locale: string): string {
  return new Date(value).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Read-only history of the adjustments applied to a loan. Each entry shows its
 * type, effective date and whichever fields were set (amount, rate, term,
 * installment number) plus the optional note.
 */
export function AdjustmentsList({
  adjustments,
  currency,
  dictionary,
  locale,
}: Readonly<AdjustmentsListProps>) {
  return (
    <section aria-label={get(dictionary, 'adjustments')} className="app-shell rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <SlidersHorizontal className="w-4 h-4 text-violet-400" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-white">{get(dictionary, 'adjustments')}</h2>
      </div>

      {adjustments.length === 0 ? (
        <p className="text-sm text-slate-500">{get(dictionary, 'noAdjustments')}</p>
      ) : (
        <ul className="space-y-3">
          {adjustments.map((adjustment) => (
            <li
              key={adjustment.id}
              className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-1.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-violet-500/15 text-violet-400">
                  {get(dictionary, `adjustmentTypes.${adjustment.type}`)}
                </span>
                <span className="text-xs text-slate-400 tabular-nums">
                  {formatDate(adjustment.effectiveDate, locale)}
                </span>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300 tabular-nums">
                {adjustment.amountCents != null && (
                  <span>
                    <span className="text-slate-500">{get(dictionary, 'adjustmentAmount')}: </span>
                    {formatMoney(adjustment.amountCents, currency, locale)}
                  </span>
                )}
                {adjustment.newRateValue != null && (
                  <span>
                    <span className="text-slate-500">{get(dictionary, 'newRate')}: </span>
                    {adjustment.newRateValue}%
                  </span>
                )}
                {adjustment.newTermCount != null && (
                  <span>
                    <span className="text-slate-500">{get(dictionary, 'newTerm')}: </span>
                    {adjustment.newTermCount}
                  </span>
                )}
                {adjustment.installmentNumber != null && (
                  <span>
                    <span className="text-slate-500">{get(dictionary, 'installmentNumber')}: </span>
                    #{adjustment.installmentNumber}
                  </span>
                )}
              </div>

              {adjustment.notes && <p className="text-xs text-slate-400">{adjustment.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
