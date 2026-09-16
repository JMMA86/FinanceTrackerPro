'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { get } from '@/lib/i18n';
import { deleteLoan } from '@/actions/loan.actions';
import { LoanDialogShell, type LoanDialogRenderApi } from './LoanDialogShell';

interface DeleteLoanModalProps {
  loanId: string;
  loanName: string;
  /** True when the loan has PAID/PARTIAL installments → deletion is blocked. */
  hasSettledInstallments: boolean;
  dictionary: Record<string, unknown>;
  isOpen: boolean;
  onClose: () => void;
  /** Fired after a confirmed successful deletion (e.g. navigate back to the list). */
  onDeleted?: () => void;
}

export function DeleteLoanModal({
  loanId,
  loanName,
  hasSettledInstallments,
  dictionary,
  isOpen,
  onClose,
  onDeleted,
}: Readonly<DeleteLoanModalProps>) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const shellRef = useRef<LoanDialogRenderApi | null>(null);

  async function handleDelete() {
    if (hasSettledInstallments) return;
    setSubmitError(null);
    try {
      const result = await deleteLoan({ loanId });
      if (result.success) {
        onDeleted?.();
        onClose();
      } else {
        const msg =
          result.code === 'SESSION_INVALID'
            ? get(dictionary, 'errors.sessionInvalid')
            : (result.error ?? get(dictionary, 'errors.deleteFailed'));
        setSubmitError(msg);
      }
    } catch {
      setSubmitError(get(dictionary, 'errors.deleteFailed'));
    }
  }

  return (
    <LoanDialogShell
      isOpen={isOpen}
      onClose={onClose}
      onBeforeClose={() => setSubmitError(null)}
      closeLabel={get(dictionary, 'close')}
      titleId="delete-loan-title"
      title={get(dictionary, 'deleteLoan')}
      maxWidthClass="max-w-md"
      headerClassName="flex items-center justify-between px-6 py-4 border-b border-white/8"
      closeRef={shellRef}
    >
      <div className="px-6 py-5 space-y-4">
        {/* Error */}
        {submitError && (
          <div
            role="alert"
            className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400"
          >
            {submitError}
          </div>
        )}

        {/* Warning */}
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-red-500/15 text-red-400 shrink-0">
            <AlertTriangle className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm text-white font-medium mb-1">
              {get(dictionary, 'confirmDelete')}
            </p>
            {loanName && (
              <p className="text-sm text-slate-300 font-semibold">&ldquo;{loanName}&rdquo;</p>
            )}
            <p className="text-xs text-slate-500 mt-1">{get(dictionary, 'deleteWarning')}</p>
          </div>
        </div>

        {/* Blocking warning when there are settled installments */}
        {hasSettledInstallments && (
          <div
            role="alert"
            className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-400 flex items-start gap-2"
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{get(dictionary, 'cannotDeletePaid')}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => shellRef.current?.close()}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
          >
            {get(dictionary, 'cancel')}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={hasSettledInstallments}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            {get(dictionary, 'delete')}
          </button>
        </div>
      </div>
    </LoanDialogShell>
  );
}
