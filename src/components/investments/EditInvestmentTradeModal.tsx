'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Save, Undo2, AlertTriangle } from 'lucide-react';
import { updateInvestmentTrade, reverseInvestmentTrade } from '@/actions/investment.actions';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { toLocalDateTimeInput } from '@/lib/utils/date-utils';
import { useUIStore } from '@/store/ui.store';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import { deriveTradeAmounts, type PriceAnchor } from './trade-amounts';
import {
  formatQuantity,
  parseQuantity,
  sanitizeQuantityInput,
  toDecimalString,
} from './decimal-input';
import {
  InvestmentModalShell,
  modalInputCls,
  modalLabelCls,
  useInvestmentModalShell,
} from './investment-modal-shared';

/**
 * Row shape consumed by the edit/undo UI. It mirrors the (serialized)
 * investment transaction DTO for the fields the trade editor needs; asset
 * fields are optional so legacy/unstructured rows remain assignable.
 */
export interface InvestmentTransactionRow {
  id: string;
  type: string;
  amountCents: number;
  currency: string;
  description: string | null;
  date: Date | string;
  transferId?: string | null;
  originalAmountCents?: number | null;
  originalCurrency?: string | null;
  assetSymbol?: string | null;
  assetQuantity?: number | null;
  assetPricePerShareCents?: number | null;
  assetTradeType?: 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAWAL' | 'DIVIDEND' | null;
}

/** Positive decimal quantity with up to 12 decimals (mirrors the server schema). */
const DECIMAL_QUANTITY_RE = /^\d+(\.\d{1,12})?$/;

/** Map an investment trade server error code to a localized message. */
function getTradeError(
  code: string | undefined,
  dictionary: Record<string, unknown>,
  fallbackKey = 'errors.updateTradeFailed'
): string {
  switch (code) {
    case 'SESSION_INVALID':
      return get(dictionary, 'errors.sessionInvalid');
    case 'INSUFFICIENT_QUANTITY':
      return get(dictionary, 'errors.insufficientQuantity');
    case 'PRICE_MISMATCH':
      return get(dictionary, 'errors.priceMismatch');
    case 'PRICE_UNAVAILABLE':
      return get(dictionary, 'errors.priceUnavailable');
    case 'RATE_LIMITED':
      return get(dictionary, 'errors.rateLimited');
    case 'CURRENCY_MISMATCH':
      return get(dictionary, 'errors.currencyMismatch');
    case 'INVESTMENT_LEDGER_INCOMPLETE':
      return get(dictionary, 'errors.investmentLedgerIncomplete');
    case 'VALIDATION_ERROR':
    case 'INVALID_FORMAT':
      return get(dictionary, 'errors.invalidQuantity');
    default:
      return get(dictionary, fallbackKey);
  }
}

interface EditInvestmentTradeModalProps {
  transaction: InvestmentTransactionRow | null;
  dictionary: Record<string, unknown>;
  locale?: string;
  /**
   * Maximum editable quantity (only meaningful for SELL trades). Computed by the
   * list from the current holding: remaining shares + the shares this trade sold.
   */
  maxQuantity?: number;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Edits a BUY/SELL investment trade (date, quantity, price, description).
 *
 * Price validation mirrors buy/sell: the server may answer `PRICE_MISMATCH`
 * when the execution price drifts >2% from the live quote. We then ask for an
 * explicit confirmation and retry with `allowPriceOverride: true`, REUSING the
 * same idempotency key (generated once per edit attempt, cleared on success).
 */
export function EditInvestmentTradeModal({
  transaction,
  dictionary,
  locale = 'es-CO',
  maxQuantity,
  onClose,
  onSuccess,
}: Readonly<EditInvestmentTradeModalProps>) {
  const addNotification = useUIStore((s) => s.addNotification);

  const isOpen = transaction !== null;
  const { dialogRef, isVisible, handleClose, handleDialogClose } = useInvestmentModalShell(
    isOpen,
    onClose
  );

  const [quantity, setQuantity] = useState('');
  const [priceCents, setPriceCents] = useState(0);
  const [baseCostCents, setBaseCostCents] = useState(0);
  // Which of price / base cost the user edited last (drives the derivation).
  const [lastEdited, setLastEdited] = useState<PriceAnchor>('price');
  const [dateValue, setDateValue] = useState(() => toLocalDateTimeInput(new Date()));
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingPriceOverride, setPendingPriceOverride] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  const qtyNum = parseQuantity(quantity);

  // The quantity input is described by its decimals hint plus the error, if any.
  const editQtyDescribedBy = submitError
    ? 'edit-trade-qty-hint edit-trade-submit-error'
    : 'edit-trade-qty-hint';

  // Seed the form from the selected trade on every opening. Deferred via rAF so
  // the setState calls are not synchronous inside the effect.
  useEffect(() => {
    if (!transaction) return;
    const id = requestAnimationFrame(() => {
      const seededPrice = transaction.assetPricePerShareCents ?? 0;
      const seededQty = transaction.assetQuantity ?? 0;
      idempotencyKeyRef.current = null;
      setQuantity(transaction.assetQuantity != null ? String(transaction.assetQuantity) : '');
      setPriceCents(seededPrice);
      setBaseCostCents(
        deriveTradeAmounts(
          'price',
          { pricePerShareCents: seededPrice, baseCostCents: 0 },
          seededQty
        ).baseCostCents
      );
      setLastEdited('price');
      setDateValue(
        toLocalDateTimeInput(transaction.date ? new Date(transaction.date) : new Date())
      );
      setDescription(transaction.description ?? '');
      setSubmitError(null);
      setPendingPriceOverride(false);
      setIsSubmitting(false);
    });
    return () => cancelAnimationFrame(id);
  }, [transaction]);

  // Price / base cost are coupled; the last edited field is the anchor (Rule 1).
  function handleQuantityChange(value: string) {
    const sanitized = sanitizeQuantityInput(value);
    setQuantity(sanitized);
    const next = deriveTradeAmounts(
      lastEdited,
      { pricePerShareCents: priceCents, baseCostCents },
      parseQuantity(sanitized)
    );
    setPriceCents(next.pricePerShareCents);
    setBaseCostCents(next.baseCostCents);
  }

  function handlePriceChange(cents: number) {
    setLastEdited('price');
    const next = deriveTradeAmounts('price', { pricePerShareCents: cents, baseCostCents }, qtyNum);
    setPriceCents(next.pricePerShareCents);
    setBaseCostCents(next.baseCostCents);
  }

  function handleBaseCostChange(cents: number) {
    setLastEdited('base');
    const next = deriveTradeAmounts(
      'base',
      { pricePerShareCents: priceCents, baseCostCents: cents },
      qtyNum
    );
    setPriceCents(next.pricePerShareCents);
    setBaseCostCents(next.baseCostCents);
  }

  async function submit(forceOverride: boolean) {
    if (!transaction) return;

    const qty = toDecimalString(quantity);
    if (!DECIMAL_QUANTITY_RE.test(qty) || parseQuantity(quantity) <= 0) {
      setSubmitError(get(dictionary, 'quantityPositive'));
      return;
    }
    if (maxQuantity != null && parseQuantity(quantity) > maxQuantity) {
      setSubmitError(
        get(dictionary, 'maxQuantity').replace('{quantity}', formatQuantity(maxQuantity))
      );
      return;
    }
    if (priceCents < 1) {
      setSubmitError(get(dictionary, 'pricePositive'));
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    // Stable idempotency key per edit attempt: reused on the override retry.
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }

    try {
      const res = await updateInvestmentTrade({
        idempotencyKey: idempotencyKeyRef.current,
        transactionId: transaction.id,
        quantity: qty,
        pricePerShareCents: priceCents,
        date: dateValue ? new Date(dateValue) : undefined,
        description: description.trim() ? description.trim() : undefined,
        allowPriceOverride: forceOverride,
      });

      if (res.success) {
        idempotencyKeyRef.current = null;
        addNotification('success', get(dictionary, 'tradeUpdated'));
        onSuccess();
        handleClose();
      } else if (res.code === 'PRICE_MISMATCH' && !forceOverride) {
        setPendingPriceOverride(true);
      } else {
        setSubmitError(getTradeError(res.code, dictionary));
      }
    } catch {
      setSubmitError(get(dictionary, 'unexpectedError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <InvestmentModalShell
      dialogRef={dialogRef}
      isVisible={isVisible}
      onClose={handleClose}
      onDialogClose={handleDialogClose}
      titleId="edit-trade-title"
      title={get(dictionary, 'editTradeTitle')}
    >
      {transaction && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
          className="px-6 py-5 space-y-4"
          noValidate
        >
          {/* Trade reference */}
          <div className="flex items-center justify-between bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3">
            <span className="text-sm font-semibold text-white">
              {transaction.assetSymbol ?? '—'}
            </span>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                transaction.assetTradeType === 'BUY'
                  ? 'bg-red-500/15 text-red-400'
                  : 'bg-emerald-500/15 text-emerald-400'
              }`}
            >
              {transaction.assetTradeType === 'BUY'
                ? get(dictionary, 'buyLabel')
                : get(dictionary, 'sellLabel')}
            </span>
          </div>

          {submitError && (
            <div
              id="edit-trade-submit-error"
              role="alert"
              className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400"
            >
              {submitError}
            </div>
          )}

          {/* Quantity + price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-trade-qty" className={modalLabelCls}>
                {get(dictionary, 'quantity')}
              </label>
              <input
                id="edit-trade-qty"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={quantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
                placeholder="0.0000"
                aria-invalid={!!submitError}
                aria-describedby={editQtyDescribedBy}
                className={`${modalInputCls} font-mono tabular-nums`}
              />
              <p id="edit-trade-qty-hint" className="mt-1 text-xs text-slate-500">
                {get(dictionary, 'maxDecimals')}
              </p>
            </div>
            <div>
              <label htmlFor="edit-trade-price" className={modalLabelCls}>
                {get(dictionary, 'pricePerShare')}
              </label>
              <FormattedNumericInput
                id="edit-trade-price"
                value={priceCents}
                onChange={handlePriceChange}
                locale={locale}
                placeholder={get(dictionary, 'pricePerSharePlaceholder')}
                aria-invalid={!!submitError}
                aria-describedby={submitError ? 'edit-trade-submit-error' : undefined}
                className={`${modalInputCls} font-mono tabular-nums`}
              />
            </div>
          </div>

          {/* Base cost (trade total). Editing it derives the price per share. */}
          <div>
            <label htmlFor="edit-trade-base-cost" className={modalLabelCls}>
              {get(dictionary, 'baseCost')}
            </label>
            <FormattedNumericInput
              id="edit-trade-base-cost"
              value={baseCostCents}
              onChange={handleBaseCostChange}
              locale={locale}
              placeholder={get(dictionary, 'pricePerSharePlaceholder')}
              aria-invalid={!!submitError}
              aria-describedby={submitError ? 'edit-trade-submit-error' : undefined}
              className={`${modalInputCls} font-mono tabular-nums`}
            />
            <p className="mt-1 text-xs text-slate-500">{get(dictionary, 'baseCostHint')}</p>
          </div>

          {/* Date */}
          <div>
            <label htmlFor="edit-trade-date" className={modalLabelCls}>
              {get(dictionary, 'tradeDate')}
            </label>
            <input
              id="edit-trade-date"
              type="datetime-local"
              value={dateValue}
              max={toLocalDateTimeInput(new Date())}
              onChange={(e) => setDateValue(e.target.value)}
              aria-invalid={!!submitError}
              aria-describedby={submitError ? 'edit-trade-submit-error' : undefined}
              className={modalInputCls}
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="edit-trade-description" className={modalLabelCls}>
              {get(dictionary, 'tradeDescriptionOptional')}
            </label>
            <textarea
              id="edit-trade-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${modalInputCls} resize-none`}
            />
          </div>

          {/* Price override confirmation (retry reuses the idempotency key) */}
          {pendingPriceOverride && (
            <div
              role="alertdialog"
              aria-labelledby="edit-trade-override-title"
              className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3 space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle
                  className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <p
                    id="edit-trade-override-title"
                    className="text-sm font-semibold text-amber-200"
                  >
                    {get(dictionary, 'priceOverrideConfirmTitle')}
                  </p>
                  <p className="text-xs text-amber-300/80 mt-0.5">
                    {get(dictionary, 'priceOverrideConfirmBody')}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPendingPriceOverride(false)}
                  className="flex-1 py-2 rounded-lg border border-white/10 text-xs font-semibold text-slate-300 hover:bg-white/5 transition-colors"
                >
                  {get(dictionary, 'cancel')}
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => {
                    setPendingPriceOverride(false);
                    void submit(true);
                  }}
                  className="flex-1 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors"
                >
                  {get(dictionary, 'priceOverrideConfirmCta')}
                </button>
              </div>
            </div>
          )}

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
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  {get(dictionary, 'saving')}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" aria-hidden="true" />
                  {get(dictionary, 'saveChanges')}
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </InvestmentModalShell>
  );
}

interface ReverseInvestmentTradeDialogProps {
  transaction: InvestmentTransactionRow | null;
  dictionary: Record<string, unknown>;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Confirmation dialog for undoing (soft-deleting) a BUY/SELL trade. Reuses the
 * shared <dialog> shell so focus save/restore (WCAG 2.2 AA) is consistent with
 * the rest of the investment module.
 */
export function ReverseInvestmentTradeDialog({
  transaction,
  dictionary,
  onClose,
  onSuccess,
}: Readonly<ReverseInvestmentTradeDialogProps>) {
  const addNotification = useUIStore((s) => s.addNotification);

  const isOpen = transaction !== null;
  const { dialogRef, isVisible, handleClose, handleDialogClose } = useInvestmentModalShell(
    isOpen,
    onClose
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!transaction) return;
    const id = requestAnimationFrame(() => {
      setIsSubmitting(false);
      setSubmitError(null);
    });
    return () => cancelAnimationFrame(id);
  }, [transaction]);

  async function confirmReverse() {
    if (!transaction) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await reverseInvestmentTrade({
        idempotencyKey: crypto.randomUUID(),
        transactionId: transaction.id,
      });
      if (res.success) {
        addNotification('success', get(dictionary, 'tradeReversed'));
        onSuccess();
        handleClose();
      } else {
        setSubmitError(getTradeError(res.code, dictionary, 'errors.reverseTradeFailed'));
      }
    } catch {
      setSubmitError(get(dictionary, 'unexpectedError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <InvestmentModalShell
      dialogRef={dialogRef}
      isVisible={isVisible}
      onClose={handleClose}
      onDialogClose={handleDialogClose}
      titleId="reverse-trade-title"
      title={get(dictionary, 'reverseTradeTitle')}
    >
      {transaction && (
        <div className="px-6 py-5 space-y-4">
          {submitError && (
            <div
              role="alert"
              className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400"
            >
              {submitError}
            </div>
          )}

          <p className="text-sm text-slate-300">{get(dictionary, 'reverseTradeConfirm')}</p>

          <div className="flex items-center justify-between bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm">
            <span className="font-semibold text-white">{transaction.assetSymbol ?? '—'}</span>
            <span className="text-slate-300 tabular-nums">
              {transaction.assetQuantity != null ? `${transaction.assetQuantity} · ` : ''}
              {transaction.assetPricePerShareCents != null
                ? formatMoney(transaction.assetPricePerShareCents, transaction.currency)
                : ''}
            </span>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors"
            >
              {get(dictionary, 'cancel')}
            </button>
            <button
              type="button"
              onClick={() => void confirmReverse()}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  {get(dictionary, 'reversing')}
                </>
              ) : (
                <>
                  <Undo2 className="w-4 h-4" aria-hidden="true" />
                  {get(dictionary, 'reverseTradeCta')}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </InvestmentModalShell>
  );
}
