'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { get } from '@/lib/i18n';
import { deleteVariableExpense } from '@/actions/variable-expense.actions';
import type { VariableExpenseDefinition } from '@/types/variable-expense';
import { VariableExpenseDialog } from './VariableExpenseDialog';

interface DeleteVariableExpenseModalProps {
  isOpen: boolean;
  definition: VariableExpenseDefinition;
  dictionary: Record<string, unknown>;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Confirm (soft) deletion of a monitored definition. Existing transactions are
 * kept (the relation is set to null by the backend).
 */
export function DeleteVariableExpenseModal({
  isOpen,
  definition,
  dictionary,
  onClose,
  onSuccess,
}: Readonly<DeleteVariableExpenseModalProps>) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => setSubmitError(null), 0);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    setSubmitError(null);
    try {
      const result = await deleteVariableExpense({ variableExpenseId: definition.id });
      if (result.success) {
        onClose();
        onSuccess();
      } else {
        setSubmitError(get(dictionary, 'errors.deleteFailed'));
      }
    } catch {
      setSubmitError(get(dictionary, 'errors.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  }, [definition.id, dictionary, onClose, onSuccess]);

  return (
    <VariableExpenseDialog
      open={isOpen}
      titleId="delete-variable-expense-title"
      title={get(dictionary, 'deleteDefinition')}
      dictionary={dictionary}
      onClose={onClose}
      maxWidth="max-w-sm"
    >
      <div className="space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/20 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6 text-rose-400" aria-hidden="true" />
        </div>

        <p className="text-sm text-white text-center font-semibold">{definition.name}</p>
        <p className="text-xs text-slate-400 text-center leading-relaxed">
          {get(dictionary, 'deleteConfirm')}
        </p>

        {submitError && (
          <p role="alert" className="text-xs text-red-400 text-center">
            {submitError}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70"
          >
            {get(dictionary, 'cancel')}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            aria-busy={isDeleting}
            className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70"
          >
            {isDeleting ? (
              <>{get(dictionary, 'loading')}</>
            ) : (
              <>
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                {get(dictionary, 'delete')}
              </>
            )}
          </button>
        </div>
      </div>
    </VariableExpenseDialog>
  );
}
