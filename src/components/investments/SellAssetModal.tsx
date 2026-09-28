'use client';

import { useEffect, useRef, useState } from 'react';
import { X, TrendingDown, Loader2, AlertTriangle } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { sellAsset } from '@/actions/investment.actions';
import { get } from '@/lib/i18n';
import { formatMoney, multiplyCents } from '@/lib/money';
import { toLocalDateTimeInput } from '@/lib/utils/date-utils';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import {
  formatQuantity,
  parseQuantity,
  sanitizeQuantityInput,
  toDecimalString,
} from './decimal-input';
import type { InvestmentHoldingSummary } from '@/types/investments';

/** Market price tolerance used to decide whether an override confirmation is needed. */
const PRICE_TOLERANCE = 0.02;

interface SellAssetModalProps {
  holding: InvestmentHoldingSummary | null;
  currency: string;
  dictionary: Record<string, unknown>;
  locale?: string;
}

/** Map a sell asset server error code to a localized message. */
function getSellError(code: string | undefined, dictionary: Record<string, unknown>): string {
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
      return get(dictionary, 'errors.sellFailed');
  }
}

export function SellAssetModal({
  holding,
  currency,
  dictionary,
  locale = 'es-CO',
}: Readonly<SellAssetModalProps>) {
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const addNotification = useUIStore((s) => s.addNotification);

  const isOpen = activeModal === 'sell-asset';

  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [pricePerShareCents, setPricePerShareCents] = useState(0);
  const [dateValue, setDateValue] = useState(() => toLocalDateTimeInput(new Date()));
  const [pendingPriceOverride, setPendingPriceOverride] = useState(false);
  const [selling, setSelling] = useState(false);

  // Stable idempotency key per sell attempt: reused by the price-override retry
  // (never regenerated mid-attempt); only cleared after a confirmed success.
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      // Save the element that had focus before opening for restoration on close
      const active = document.activeElement;
      previousFocusRef.current = active instanceof HTMLElement ? active : null;
      dialog.showModal();
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
      setQuantity('');
      setSubmitError(null);
      setDateValue(toLocalDateTimeInput(new Date()));
      setPendingPriceOverride(false);
      idempotencyKeyRef.current = null;
      setSelling(false);
      if (holding) setPricePerShareCents(holding.currentPriceCents);
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, holding]);

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    setIsVisible(false);
    setTimeout(() => {
      if (dialog.open) dialog.close();
    }, 240);
  };

  const handleDialogClose = () => {
    closeModal();
    // Best-effort focus restoration (WCAG 2.2 AA): restore focus to the
    // element that opened the modal if it is still connected to the document.
    const prev = previousFocusRef.current;
    if (prev && document.body.contains(prev)) {
      prev.focus();
    }
    previousFocusRef.current = null;
  };

  async function handleSell(forceOverride = false) {
    if (!holding) return;
    setSelling(true);
    setSubmitError(null);

    const qty = toDecimalString(quantity);
    if (!qty || parseQuantity(quantity) <= 0) {
      setSubmitError(get(dictionary, 'quantityPositive'));
      setSelling(false);
      return;
    }

    if (parseQuantity(quantity) > holding.quantity) {
      setSubmitError(
        get(dictionary, 'maxQuantity').replace('{quantity}', formatQuantity(holding.quantity))
      );
      setSelling(false);
      return;
    }

    if (pricePerShareCents < 1) {
      setSubmitError(get(dictionary, 'pricePositive'));
      setSelling(false);
      return;
    }

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    const allowPriceOverride = forceOverride || priceDiffers;

    try {
      const res = await sellAsset({
        idempotencyKey: idempotencyKeyRef.current,
        holdingId: holding.id,
        quantity: qty,
        pricePerShareCents,
        date: dateValue ? new Date(dateValue) : undefined,
        allowPriceOverride,
      });

      if (res.success) {
        idempotencyKeyRef.current = null;
        addNotification(
          'success',
          get(dictionary, 'soldAsset').replace('{qty}', qty).replace('{symbol}', holding.symbol)
        );
        closeModal();
      } else if (res.code === 'PRICE_MISMATCH' && !allowPriceOverride) {
        // The live quote drifted after we priced the holding: confirm and retry
        // with the SAME idempotency key.
        setPendingPriceOverride(true);
      } else {
        setSubmitError(getSellError(res.code, dictionary));
      }
    } catch {
      setSubmitError(get(dictionary, 'unexpectedError'));
    } finally {
      setSelling(false);
    }
  }

  const qtyNum = parseQuantity(quantity);
  const totalProceedsCents =
    qtyNum > 0 && pricePerShareCents > 0 ? multiplyCents(pricePerShareCents, qtyNum) : 0;

  const submitErrorId = submitError ? 'sell-submit-error' : undefined;
  // The quantity input is described by its decimals hint plus the error, if any.
  const sellQtyDescribedBy = submitError ? 'sell-qty-hint sell-submit-error' : 'sell-qty-hint';

  // Client-side ±2% advisory against the holding's reference price. The
  // definitive check happens server-side with a fresh quote.
  const priceDiffers =
    !!holding &&
    pricePerShareCents > 0 &&
    holding.currentPriceCents > 0 &&
    Math.abs(pricePerShareCents - holding.currentPriceCents) / holding.currentPriceCents >
      PRICE_TOLERANCE;

  const inputCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-transparent transition-all';
  const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';

  if (!holding) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      aria-modal="true"
      aria-labelledby="sell-asset-title"
      className="bg-transparent border-none m-0 h-full w-full max-w-full max-h-full backdrop:bg-transparent open:flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={handleClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        style={{ opacity: isVisible ? 1 : 0, transition: 'opacity 220ms ease' }}
      />

      <div
        className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{
          transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.93) translateY(12px)',
          opacity: isVisible ? 1 : 0,
          transition: isVisible
            ? 'transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)'
            : 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 sticky top-0 bg-slate-900 z-10">
          <h2 id="sell-asset-title" className="text-base font-semibold text-white">
            {get(dictionary, 'sellAsset')}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Holding info */}
          <div className="flex items-center gap-2.5 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3">
            <div className="p-1.5 rounded-lg bg-red-500/15 text-red-400">
              <TrendingDown className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{holding.symbol}</p>
              <p className="text-xs text-slate-400">
                {formatQuantity(holding.quantity)} shares · Avg{' '}
                {formatMoney(holding.avgCostCents, currency, locale)}
              </p>
            </div>
          </div>

          {/* Error alert */}
          {submitError && (
            <div
              id="sell-submit-error"
              role="alert"
              className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400"
            >
              {submitError}
            </div>
          )}

          {/* Quantity */}
          <div>
            <label htmlFor="sell-qty" className={labelCls}>
              {get(dictionary, 'quantity')}
            </label>
            <input
              id="sell-qty"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={quantity}
              onChange={(e) => setQuantity(sanitizeQuantityInput(e.target.value))}
              placeholder={formatQuantity(holding.quantity)}
              aria-invalid={!!submitError}
              aria-describedby={sellQtyDescribedBy}
              className={`${inputCls} font-mono tabular-nums`}
            />
            <p id="sell-qty-hint" className="mt-1 text-xs text-slate-500">
              {get(dictionary, 'maxDecimals')}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {get(dictionary, 'availableShares').replace(
                '{quantity}',
                formatQuantity(holding.quantity)
              )}
            </p>
          </div>

          {/* Price per share */}
          <div>
            <label htmlFor="sell-price" className={labelCls}>
              {get(dictionary, 'pricePerShare')}
            </label>
            <FormattedNumericInput
              id="sell-price"
              value={pricePerShareCents}
              onChange={setPricePerShareCents}
              locale={locale}
              placeholder={get(dictionary, 'pricePerSharePlaceholder')}
              aria-invalid={!!submitError}
              aria-describedby={submitErrorId}
              className={`${inputCls} font-mono tabular-nums`}
            />
          </div>

          {/* Trade date (historical tickets are allowed; future is rejected) */}
          <div>
            <label htmlFor="sell-date" className={labelCls}>
              {get(dictionary, 'tradeDate')}
            </label>
            <input
              id="sell-date"
              type="datetime-local"
              value={dateValue}
              max={toLocalDateTimeInput(new Date())}
              onChange={(e) => setDateValue(e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Non-blocking ±2% advisory (native <output> = implicit role="status") */}
          {priceDiffers && !pendingPriceOverride && (
            <output className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle
                className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <p className="text-xs text-amber-300">{get(dictionary, 'priceOverrideWarning')}</p>
            </output>
          )}

          {/* Server price-mismatch confirmation (retry reuses idempotency key) */}
          {pendingPriceOverride && (
            <div
              role="alertdialog"
              aria-labelledby="sell-price-override-title"
              className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3 space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle
                  className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <p
                    id="sell-price-override-title"
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
                    void handleSell(true);
                  }}
                  className="flex-1 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors"
                >
                  {get(dictionary, 'priceOverrideConfirmCta')}
                </button>
              </div>
            </div>
          )}

          {/* Total proceeds */}
          {totalProceedsCents > 0 && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-emerald-300">{get(dictionary, 'totalProceeds')}</span>
              <span className="text-base font-bold text-white tabular-nums">
                {formatMoney(totalProceedsCents, currency, locale)}
              </span>
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
              type="button"
              onClick={() => void handleSell()}
              disabled={selling || !quantity || qtyNum <= 0}
              className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
            >
              {selling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />{' '}
                  {get(dictionary, 'selling')}
                </>
              ) : (
                <>{get(dictionary, 'confirmSell')}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
