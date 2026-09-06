'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useUIStore } from '@/store/ui.store';
import { payCreditCard } from '@/actions/credit-card.actions';
import { getBankAccounts } from '@/actions/account.actions';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import { AccountSelect } from '@/components/transactions/AccountSelect';
import { isPocket } from '@/components/transactions/transferRules';
import type { AccountBrief } from '@/components/transactions/types';
import type { CreditCard } from './credit-card.types';

const MAX_SAFE = 9_999_999_999_999;

// Client-side validation schema (no date field — the server defaults to today)
const PayFormSchema = z.object({
  idempotencyKey: z.string().uuid(),
  accountId: z.string().min(1),
  sourceAccountId: z.string().min(1, 'Select a source account'),
  amountCents: z.number().int('Amount must be an integer').min(1, 'Amount must be positive'),
  currency: z.enum(['COP', 'USD', 'EUR']),
  description: z.string().max(500, 'Description too long').optional(),
});

type PayFormData = z.infer<typeof PayFormSchema>;

interface PayCreditCardModalProps {
  open: boolean;
  /** All credit cards the user can pay. A card selector is shown when > 1. */
  cards: CreditCard[];
  /** Card preselected when the modal opens (e.g. from the card detail). */
  initialCardId?: string;
  dictionary: Record<string, unknown>;
  locale?: string;
  onClose: () => void;
}

export function PayCreditCardModal({
  open,
  cards,
  initialCardId,
  dictionary,
  locale = 'es-CO',
  onClose,
}: Readonly<PayCreditCardModalProps>) {
  const addNotification = useUIStore((s) => s.addNotification);
  const router = useRouter();

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [amountCents, setAmountCents] = useState(0);
  // Source accounts (bank accounts + pockets) matching the selected card currency.
  const [accounts, setAccounts] = useState<AccountBrief[]>([]);
  const [serverError, setServerError] = useState('');
  // Incremented on every open so the AccountSelect remounts per session
  // (fresh dropdown — closed listbox, reset highlight) — pattern of CreateTransactionModal.
  const [modalSession, setModalSession] = useState(0);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PayFormData>({
    resolver: zodResolver(PayFormSchema),
  });

  // The selected card is derived from the form's accountId (single source of
  // truth). The card selector writes back through reset()/handleCardChange.
  const selectedCardId = useWatch({ control, name: 'accountId' });
  const selectedCard = cards.find((c) => c.id === selectedCardId) ?? null;

  // Only cards with an outstanding debt are actually payable.
  const payableCards = useMemo(() => cards.filter((c) => c.debtCents > 0), [cards]);
  // Selector options: payable cards + (when opened from the card detail) the
  // initially requested card even if it has no debt, so its "sin deuda" state
  // is visible and the user can switch to a payable card.
  const selectorCards = useMemo(() => {
    const base = [...payableCards];
    if (initialCardId && !base.some((c) => c.id === initialCardId)) {
      const initial = cards.find((c) => c.id === initialCardId);
      if (initial) base.push(initial);
    }
    return base;
  }, [cards, payableCards, initialCardId]);

  const hasDebt = selectedCard != null && selectedCard.debtCents > 0;

  const selectedSourceId = useWatch({ control, name: 'sourceAccountId' });
  const selectedSource = accounts.find((a) => a.id === selectedSourceId) ?? null;
  const selectedInsufficient = selectedSource != null && amountCents > selectedSource.balanceCents;

  // Split source accounts into bank accounts and pockets for the AccountSelect
  // (pockets render under their own group and show their parent account name).
  const bankAccounts = useMemo(() => accounts.filter((a) => !isPocket(a)), [accounts]);
  const pockets = useMemo(() => accounts.filter(isPocket), [accounts]);
  const parentNameById = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a.name])),
    [accounts]
  );

  const loadAccounts = useCallback(async (card: CreditCard | null) => {
    try {
      const res = await getBankAccounts({} as Record<string, never>);
      if (res.success && res.data) {
        const all = res.data as AccountBrief[];
        // Only accounts matching the card currency can fund a payment
        const filtered = card ? all.filter((a) => a.currency === card.currency) : all;
        setAccounts(filtered);
      }
    } catch {
      setAccounts([]);
    }
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else if (dialog.open) {
      setIsVisible(false);
      setTimeout(() => {
        if (dialog.open) dialog.close();
      }, 240);
    }
  }, [open]);

  // Select the initial card (or the first payable) and reset the form on open.
  useEffect(() => {
    if (!open) return;
    const initial = (() => {
      if (initialCardId) {
        const target = cards.find((c) => c.id === initialCardId);
        if (target) return target;
      }
      return payableCards[0] ?? cards[0] ?? null;
    })();
    const cardId = initial?.id ?? '';
    reset({
      idempotencyKey: crypto.randomUUID(),
      accountId: cardId,
      amountCents: 0,
      currency: initial?.currency ?? 'COP',
      sourceAccountId: undefined,
      description: undefined,
    });
    const id = requestAnimationFrame(() => {
      setAmountCents(0);
      setServerError('');
      setModalSession((s) => s + 1); // Remount AccountSelect on every open
      setIsVisible(true);
    });
    const timer = setTimeout(() => {
      loadAccounts(initial);
    }, 0);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(timer);
    };
  }, [open, cards, initialCardId, payableCards, reset, loadAccounts]);

  // When the user changes the selected card, sync the form and reload sources.
  function handleCardChange(cardId: string) {
    const next = cards.find((c) => c.id === cardId) ?? null;
    reset({
      idempotencyKey: crypto.randomUUID(),
      accountId: cardId,
      amountCents: 0,
      currency: next?.currency ?? 'COP',
      sourceAccountId: undefined,
      description: undefined,
    });
    setAmountCents(0);
    setServerError('');
    loadAccounts(next);
  }

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    setIsVisible(false);
    setTimeout(() => {
      if (dialog.open) dialog.close();
    }, 240);
  };

  const handleDialogClose = () => {
    onClose();
  };

  async function onSubmit(data: PayFormData) {
    if (!selectedCard) return;
    setServerError('');
    const result = await payCreditCard(data);
    if (result.success) {
      addNotification('success', get(dictionary, 'pay.makePayment'));
      onClose();
      router.refresh();
    } else {
      const msg =
        result.code === 'SESSION_INVALID'
          ? get(dictionary, 'errors.sessionInvalid')
          : result.code === 'INSUFFICIENT_FUNDS'
            ? get(dictionary, 'pay.insufficientFunds')
            : result.code === 'CARD_NO_DEBT'
              ? get(dictionary, 'pay.noDebt')
              : result.code === 'CARD_OVERPAYMENT'
                ? get(dictionary, 'pay.overpayment')
                : get(dictionary, 'errors.payFailed');
      setServerError(msg);
      addNotification('error', msg);
    }
  }

  const inputCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all';
  const selectCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all appearance-none';
  const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      aria-labelledby="pay-credit-card-title"
      className="bg-transparent border-none m-0 h-full w-full max-w-full max-h-full backdrop:bg-transparent open:flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label={get(dictionary, 'close')}
        onClick={handleClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        style={{ opacity: isVisible ? 1 : 0, transition: 'opacity 220ms ease' }}
      />

      <div
        className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{
          transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.93) translateY(12px)',
          opacity: isVisible ? 1 : 0,
          transition: isVisible
            ? 'transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)'
            : 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 sticky top-0 bg-slate-900 z-10">
          <h2 id="pay-credit-card-title" className="text-base font-semibold text-white">
            {get(dictionary, 'pay.payCard')}
            {selectedCard && <span className="text-slate-400 ml-1">— {selectedCard.name}</span>}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label={get(dictionary, 'close')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4" noValidate>
          <input type="hidden" {...register('idempotencyKey')} />
          <input type="hidden" {...register('accountId')} />
          <input type="hidden" {...register('currency')} />

          {/* Error alert */}
          {serverError && (
            <div
              role="alert"
              className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400"
            >
              {serverError}
            </div>
          )}

          {/* Card selector (shown when more than one payable card is available) */}
          {selectorCards.length > 1 && (
            <div>
              <label htmlFor="pay-card" className={labelCls}>
                {get(dictionary, 'pay.selectCard')}
              </label>
              <select
                id="pay-card"
                value={selectedCardId}
                onChange={(e) => handleCardChange(e.target.value)}
                className={selectCls}
              >
                {selectorCards.map((c) => (
                  <option key={c.id} value={c.id} className="bg-slate-800">
                    {c.name} ({c.currency})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* No-debt state (the selected card has nothing to pay) */}
          {selectedCard && !hasDebt && (
            <div
              role="status"
              className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-300"
            >
              {get(dictionary, 'pay.noDebt')}
            </div>
          )}

          {/* Current debt info */}
          {selectedCard && (
            <div className="bg-white/5 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">{get(dictionary, 'pay.currentDebt')}</span>
                <span className="font-semibold text-rose-400 tabular-nums">
                  {formatMoney(selectedCard.debtCents, selectedCard.currency, locale)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">{get(dictionary, 'pay.available')}</span>
                <span className="font-semibold text-emerald-400 tabular-nums">
                  {selectedCard.availableCreditCents != null
                    ? formatMoney(selectedCard.availableCreditCents, selectedCard.currency, locale)
                    : '—'}
                </span>
              </div>
            </div>
          )}

          {/* Amount */}
          <div>
            <label htmlFor="pay-amount" className={labelCls}>
              {get(dictionary, 'pay.amount')}
            </label>
            <FormattedNumericInput
              id="pay-amount"
              value={amountCents}
              maxValue={selectedCard ? selectedCard.debtCents : MAX_SAFE}
              onChange={(v) => {
                setAmountCents(v);
                setValue('amountCents', v);
              }}
              aria-invalid={!!errors.amountCents}
              aria-describedby={errors.amountCents ? 'pay-amount-error' : undefined}
              className={`${inputCls} font-mono tabular-nums`}
            />
            {errors.amountCents && (
              <p id="pay-amount-error" role="alert" className="mt-1 text-xs text-red-400">
                {errors.amountCents.message}
              </p>
            )}
          </div>

          {/* Source account */}
          <div>
            <label htmlFor="pay-account" className={labelCls}>
              {get(dictionary, 'pay.sourceAccount')}
            </label>
            <AccountSelect
              key={`pay-account-${modalSession}`}
              id="pay-account"
              value={selectedSourceId ?? ''}
              onChange={(accountId) => setValue('sourceAccountId', accountId)}
              placeholder={get(dictionary, 'pay.accountNamePlaceholder')}
              accountsGroupLabel={get(dictionary, 'pay.sourceAccountsGroup')}
              pocketsGroupLabel={get(dictionary, 'pay.pocketsGroup')}
              parentNameById={parentNameById}
              accounts={bankAccounts}
              pockets={pockets}
              showBalance
              locale={locale}
              hasError={!!errors.sourceAccountId}
              ariaDescribedBy={errors.sourceAccountId ? 'pay-account-error' : undefined}
            />
            {errors.sourceAccountId && (
              <p id="pay-account-error" role="alert" className="mt-1 text-xs text-red-400">
                {errors.sourceAccountId.message}
              </p>
            )}
            {accounts.length === 0 && (
              <p className="mt-1.5 text-xs text-slate-400">
                {get(dictionary, 'pay.noSourceAccounts')}
              </p>
            )}
            {selectedInsufficient && (
              <p role="alert" className="mt-1.5 text-xs text-amber-400">
                {get(dictionary, 'pay.insufficientFunds')}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="pay-description" className={labelCls}>
              {get(dictionary, 'pay.description')}
            </label>
            <input
              id="pay-description"
              type="text"
              autoComplete="off"
              placeholder={get(dictionary, 'pay.descriptionPlaceholder')}
              className={inputCls}
              {...register('description')}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors"
            >
              {get(dictionary, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                amountCents <= 0 ||
                selectedInsufficient ||
                !selectedCard ||
                !hasDebt
              }
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" aria-hidden="true" />
                  {get(dictionary, 'pay.confirmPay')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
