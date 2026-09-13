'use client';

import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { get } from '@/lib/i18n';
import { deleteFixedExpense } from '@/actions/fixed-expense.actions';
import { FixedExpenseDialog } from './FixedExpenseDialog';

interface DeleteFixedExpenseModalProps {
  fixedExpenseId: string;
  expenseName: string;
  dictionary: Record<string, unknown>;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Confirm the soft-delete of a fixed expense template. History is preserved
 * server-side; on success the view refreshes via onClose().
 */
export function DeleteFixedExpenseModal({
  fixedExpenseId,
  expenseName,
  dictionary,
  isOpen,
  onClose,
}: Readonly<DeleteFixedExpenseModalProps>) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleDelete() {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const result = await deleteFixedExpense({ fixedExpenseId });
      if (result.success) {
        onClose();
      } else {
        const msg =
          result.code === 'UNAUTHORIZED'
            ? get(dictionary, 'errors.sessionInvalid')
            : (result.error ?? get(dictionary, 'errors.deleteFailed'));
        setSubmitError(msg);
      }
    } catch {
      setSubmitError(get(dictionary, 'errors.deleteFailed'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <FixedExpenseDialog
      open={isOpen}
      titleId="delete-fixed-expense-title"
      title={get(dictionary, 'deleteFixedExpense')}
      dictionary={dictionary}
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
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
              {get(dictionary, 'deleteConfirm')}
            </p>
            {expenseName && (
              <p className="text-sm text-slate-300 font-semibold">&ldquo;{expenseName}&rdquo;</p>
            )}
          </div>
        </div>

        <div
          role="alert"
          className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-400 flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{get(dictionary, 'deleteWarning')}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            {get(dictionary, 'cancel')}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isSubmitting}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            {isSubmitting ? get(dictionary, 'loading') : get(dictionary, 'delete')}
          </button>
        </div>
      </div>
    </FixedExpenseDialog>
  );
}
