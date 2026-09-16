'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, X, Trash2 } from 'lucide-react';
import { deleteTransaction } from '@/actions/transaction.actions';
import { useUIStore } from '@/store/ui.store';
import { get } from '@/lib/i18n';
import { getTransactionError } from '@/components/transactions/getTransactionError';

interface DeleteTransactionModalProps {
  open: boolean;
  transactionId: string | null;
  dictionary: Record<string, unknown>;
  onClose: () => void;
}

const ANIM_MS = 220;
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

export function DeleteTransactionModal({
  open,
  transactionId,
  dictionary,
  onClose,
}: Readonly<DeleteTransactionModalProps>) {
  const router = useRouter();
  const addNotification = useUIStore((s) => s.addNotification);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else if (dialog.open) {
      setIsVisible(false);
      setTimeout(() => {
        if (dialog.open) dialog.close();
      }, ANIM_MS);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(id);
  }, [open, transactionId]);

  const handleClose = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    setIsVisible(false);
    setTimeout(() => {
      if (dialog.open) dialog.close();
      onClose();
    }, ANIM_MS);
  }, [onClose]);

  const handleDialogClose = useCallback(() => {
    onClose();
  }, [onClose]);

  async function handleDelete() {
    if (!transactionId) return;
    setIsDeleting(true);

    const result = await deleteTransaction({ transactionId });

    if (result.success) {
      addNotification('success', get(dictionary, 'deleteSuccess'));
      router.refresh();
    } else {
      addNotification('error', getTransactionError(result, dictionary));
    }

    setIsDeleting(false);
    handleClose();
  }

  const panelStyle: React.CSSProperties = {
    transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(12px)',
    opacity: isVisible ? 1 : 0,
    transition: isVisible
      ? `transform ${ANIM_MS}ms ${SPRING}, opacity ${ANIM_MS - 40}ms ${EASE_OUT}`
      : `transform ${ANIM_MS - 40}ms ${EASE_OUT}, opacity ${ANIM_MS - 60}ms ${EASE_OUT}`,
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      aria-labelledby="delete-transaction-title"
      className="bg-transparent border-none m-0 h-full w-full max-w-full max-h-full backdrop:bg-transparent open:flex items-center justify-center p-4"
    >
      <div
        className="fixed inset-0"
        style={{
          backgroundColor: isVisible ? 'rgba(0,0,0,0.60)' : 'rgba(0,0,0,0)',
          backdropFilter: isVisible ? 'blur(4px)' : 'none',
          transition: `background-color ${ANIM_MS - 20}ms ease, backdrop-filter ${ANIM_MS - 20}ms ease`,
        }}
        onClick={handleClose}
        aria-hidden="true"
      />

      <div
        style={panelStyle}
        className="relative w-full max-w-sm bg-slate-900 border border-rose-500/30 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-rose-500/20 to-transparent" />

        <button
          type="button"
          onClick={handleClose}
          aria-label={get(dictionary, 'cancel')}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="relative px-6 pt-8 pb-6">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 flex items-center justify-center mb-4 mx-auto">
            <AlertTriangle className="w-6 h-6 text-rose-400" />
          </div>

          <h2
            id="delete-transaction-title"
            className="text-base font-semibold text-white text-center mb-2"
          >
            {get(dictionary, 'deleteConfirm')}
          </h2>

          <p className="text-xs text-slate-400 text-center mb-6 leading-relaxed">
            {get(dictionary, 'deleteTransaction')}
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isDeleting}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              {get(dictionary, 'cancel')}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {isDeleting ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  {get(dictionary, 'delete')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
