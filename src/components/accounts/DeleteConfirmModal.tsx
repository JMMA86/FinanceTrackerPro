'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X, Trash2 } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { deleteBankAccount } from '@/actions/account.actions';
import { get } from '@/lib/i18n';
import { log } from '@/lib/logger';

interface DeleteConfirmModalProps {
  dictionary: Record<string, unknown>;
}

const ANIM_MS = 220;
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

export function DeleteConfirmModal({ dictionary }: Readonly<DeleteConfirmModalProps>) {
  const activeModal = useUIStore((s) => s.activeModal);
  const modalData = useUIStore((s) => s.modalData);
  const closeModal = useUIStore((s) => s.closeModal);
  const addNotification = useUIStore((s) => s.addNotification);

  const isOpen = activeModal === 'delete-confirm';
  const accountId = (modalData?.accountId as string) ?? null;
  const accountName = (modalData?.accountName as string) ?? '';
  const isPocket = (modalData?.isPocket as boolean) ?? false;

  const [isVisible, setIsVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      log.info(
        { action: 'account.delete.open', accountId, isPocket },
        'Delete confirm modal opened',
      );
      const id = requestAnimationFrame(() => setIsVisible(true));
      return () => cancelAnimationFrame(id);
    }
    const id = requestAnimationFrame(() => setIsVisible(false));
    return () => cancelAnimationFrame(id);
  }, [isOpen, accountId, isPocket]);

  const handleDelete = useCallback(async () => {
    if (!accountId) return;
    log.info(
      { action: 'account.delete.submit', accountId, isPocket },
      'Delete account submit',
    );
    setIsDeleting(true);

    const result = await deleteBankAccount({ accountId });
    if (result.success) {
      // Hold spinner for 1s so the user sees confirmation before animation kicks in
      await new Promise((resolve) => setTimeout(resolve, 1000));
      addNotification('success', get(dictionary, `delete${isPocket ? 'Pocket' : 'Account'}Success`) as string);
      setIsDeleting(false);
      closeModal();
      log.info(
        { action: 'account.delete.success', accountId, isPocket },
        'Account deleted (client)',
      );
      if (isPocket) {
        document.dispatchEvent(new CustomEvent('finance:pocket-deleted', { detail: { pocketId: accountId } }));
        document.dispatchEvent(new CustomEvent('finance:account-deleted', { detail: { accountId } }));
      } else {
        document.dispatchEvent(new CustomEvent('finance:account-deleted', { detail: { accountId } }));
      }
    } else {
      log.info(
        { action: 'account.delete.failure', accountId, isPocket, code: result.code },
        'Account delete failed (client)',
      );
      addNotification('error', get(dictionary, 'errors.deleteFailed') as string);
      setIsDeleting(false);
    }
  }, [accountId, isPocket, dictionary, closeModal, addNotification]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(closeModal, ANIM_MS);
  }, [closeModal]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const title = isPocket
    ? get(dictionary, 'deletePocketTitle') as string
    : get(dictionary, 'deleteAccountTitle') as string;

  const message = isPocket
    ? get(dictionary, 'deletePocketMessage') as string
    : get(dictionary, 'deleteAccountMessage') as string;

  const panelStyle: React.CSSProperties = {
    transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(12px)',
    opacity: isVisible ? 1 : 0,
    transition: isVisible
      ? `transform ${ANIM_MS}ms ${SPRING}, opacity ${ANIM_MS - 40}ms ${EASE_OUT}`
      : `transform ${ANIM_MS - 40}ms ${EASE_OUT}, opacity ${ANIM_MS - 60}ms ${EASE_OUT}`,
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="delete-modal-title"
      className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        style={{ opacity: isVisible ? 1 : 0, transitionDuration: `${ANIM_MS - 20}ms` }}
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
          aria-label="Cerrar"
          className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="relative px-6 pt-8 pb-6">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 flex items-center justify-center mb-4 mx-auto">
            <AlertTriangle className="w-6 h-6 text-rose-400" />
          </div>

          <h2 id="delete-modal-title" className="text-base font-semibold text-white text-center mb-2">
            {title}
          </h2>

          <p className="text-center text-sm text-slate-300 mb-5">
            <span className="font-semibold text-white">&quot;{accountName}&quot;</span>
          </p>

          <p className="text-xs text-slate-400 text-center mb-6 leading-relaxed">
            {message}
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isDeleting}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              {get(dictionary, 'cancel') as string}
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
                  <Trash2 className="w-4 h-4" />
                  {get(dictionary, 'delete') as string}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
