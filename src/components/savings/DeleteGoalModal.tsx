'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, AlertTriangle, Trash2 } from 'lucide-react';
import { get } from '@/lib/i18n';
import { deleteSavingsGoal } from '@/actions/savings.actions';

interface DeleteGoalModalProps {
  goalId: string;
  goalName: string;
  hasContributions: boolean;
  dictionary: Record<string, unknown>;
  isOpen: boolean;
  onClose: () => void;
}

export function DeleteGoalModal({
  goalId,
  goalName,
  hasContributions,
  dictionary,
  isOpen,
  onClose,
}: Readonly<DeleteGoalModalProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      dialog.showModal();
      // Native showModal focuses the FIRST focusable element; the backdrop is a
      // non-focusable aria-hidden div, so move focus to the visible heading
      // instead (WCAG 2.4.3 Focus Order — no phantom focus).
      dialog.querySelector<HTMLElement>('[data-modal-heading]')?.focus();
    } else if (dialog.open) {
      setIsVisible(false);
      setTimeout(() => {
        if (dialog.open) dialog.close();
      }, 240);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const id = requestAnimationFrame(() => {
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen]);

  const handleClose = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    // Clear the server error here (on close) instead of in an rAF-delayed reset,
    // which could clobber an error set by a fast submit.
    setSubmitError(null);
    setIsVisible(false);
    setTimeout(() => {
      if (dialog.open) dialog.close();
    }, 240);
  }, []);

  const handleDialogClose = useCallback(() => {
    setSubmitError(null);
    onClose();
  }, [onClose]);

  async function handleDelete() {
    if (hasContributions) return;
    setSubmitError(null);
    try {
      const result = await deleteSavingsGoal({ goalId });
      if (result.success) {
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
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      aria-labelledby="delete-goal-title"
      className="bg-transparent border-none m-0 h-full w-full max-w-full max-h-full backdrop:bg-transparent open:flex items-center justify-center p-4"
    >
      {/* Non-focusable backdrop: click-to-close only (X, Cancel and Esc remain).
          aria-hidden keeps it out of the accessibility tree and tab order —
          otherwise SRs announced a phantom "Close" button (WCAG 2.2). */}
      <div
        aria-hidden="true"
        onClick={handleClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        style={{ opacity: isVisible ? 1 : 0, transition: 'opacity 220ms ease' }}
      />

      <div
        className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl"
        style={{
          transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.93) translateY(12px)',
          opacity: isVisible ? 1 : 0,
          transition: isVisible
            ? 'transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)'
            : 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <h2
            id="delete-goal-title"
            data-modal-heading
            tabIndex={-1}
            className="text-base font-semibold text-white focus:outline-none"
          >
            {get(dictionary, 'deleteGoal')}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label={get(dictionary, 'close')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

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

          {/* Warning icon */}
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-red-500/15 text-red-400 shrink-0">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-white font-medium mb-1">
                {get(dictionary, 'deleteGoalConfirm')}
              </p>
              {goalName && (
                <p className="text-sm text-slate-300 font-semibold">&ldquo;{goalName}&rdquo;</p>
              )}
            </div>
          </div>

          {/* Blocking warning if has contributions */}
          {hasContributions && (
            <div
              role="alert"
              className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-400 flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{get(dictionary, 'deleteGoalWarning')}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
            >
              {get(dictionary, 'cancel')}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={hasContributions}
              className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              {get(dictionary, 'delete')}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
