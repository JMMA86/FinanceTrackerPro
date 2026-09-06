'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { deleteCreditCard } from '@/actions/credit-card.actions';
import { get } from '@/lib/i18n';
import { log } from '@/lib/logger';
import { formatMoney } from '@/lib/money';
import { ModalDialog } from '@/components/ui/ModalDialog';

interface DeleteCreditCardModalProps {
  dictionary: Record<string, unknown>;
  locale?: string;
}

export function DeleteCreditCardModal({
  dictionary,
  locale = 'es-CO',
}: Readonly<DeleteCreditCardModalProps>) {
  const activeModal = useUIStore((s) => s.activeModal);
  const modalData = useUIStore((s) => s.modalData);
  const closeModal = useUIStore((s) => s.closeModal);
  const addNotification = useUIStore((s) => s.addNotification);

  const isOpen = activeModal === 'delete-credit-card';
  const cardId = (modalData?.cardId as string) ?? null;
  const cardName = (modalData?.cardName as string) ?? '';
  const debtCents = (modalData?.debtCents as number) ?? 0;
  const currency = (modalData?.currency as string) ?? 'COP';

  const [isDeleting, setIsDeleting] = useState(false);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    log.info({ action: 'credit-card.delete.open', cardId }, 'Delete credit card modal opened');
    const id = requestAnimationFrame(() => setServerError(''));
    return () => cancelAnimationFrame(id);
  }, [isOpen, cardId]);

  async function handleDelete() {
    if (!cardId) return;
    log.info({ action: 'credit-card.delete.submit', cardId }, 'Delete credit card submit');
    setIsDeleting(true);
    setServerError('');

    const result = await deleteCreditCard({ accountId: cardId });
    if (result.success) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      addNotification('success', get(dictionary, 'deleteSuccess'));
      setIsDeleting(false);
      closeModal();
      log.info({ action: 'credit-card.delete.success', cardId }, 'Credit card deleted (client)');
      document.dispatchEvent(
        new CustomEvent('finance:credit-card-deleted', { detail: { cardId } })
      );
    } else {
      log.info(
        { action: 'credit-card.delete.failure', cardId, code: result.code },
        'Credit card delete failed (client)'
      );
      setIsDeleting(false);
      if (result.code === 'CARD_HAS_BALANCE') {
        // Render inline — the toast is hidden below the <dialog> top layer.
        setServerError(get(dictionary, 'cardHasDebt'));
        addNotification('error', get(dictionary, 'cardHasDebt'));
      } else {
        const msg =
          result.code === 'SESSION_INVALID'
            ? get(dictionary, 'errors.sessionInvalid')
            : get(dictionary, 'errors.deleteFailed');
        setServerError(msg);
        addNotification('error', msg);
      }
    }
  }

  return (
    <ModalDialog
      open={isOpen}
      titleId="delete-credit-card-title"
      title={get(dictionary, 'deleteCardTitle')}
      dictionary={dictionary}
      onClose={closeModal}
      variant="confirm"
      maxWidth="max-w-sm"
      panelClassName="border-rose-500/30"
    >
      <div className="w-12 h-12 rounded-2xl bg-rose-500/20 flex items-center justify-center mb-4 mx-auto">
        <AlertTriangle className="w-6 h-6 text-rose-400" />
      </div>

      <h2
        id="delete-credit-card-title"
        className="text-base font-semibold text-white text-center mb-2"
      >
        {get(dictionary, 'deleteCardTitle')}
      </h2>

      <p className="text-center text-sm text-slate-300 mb-5">
        <span className="font-semibold text-white">&quot;{cardName}&quot;</span>
      </p>

      <p className="text-xs text-slate-400 text-center mb-2 leading-relaxed">
        {get(dictionary, 'deleteCardMessage')}
      </p>

      {debtCents > 0 && (
        <p className="text-xs text-rose-300 text-center mb-2 leading-relaxed">
          {get(dictionary, 'debt')}:{' '}
          <span className="font-semibold tabular-nums">
            {formatMoney(debtCents, currency, locale)}
          </span>
        </p>
      )}

      {serverError && (
        <div
          role="alert"
          className="mb-4 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl p-3"
        >
          {serverError}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={closeModal}
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
              <Trash2 className="w-4 h-4" />
              {get(dictionary, 'delete')}
            </>
          )}
        </button>
      </div>
    </ModalDialog>
  );
}
