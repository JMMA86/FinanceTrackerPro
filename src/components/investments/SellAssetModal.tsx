'use client';

import { useEffect, useRef, useState } from 'react';
import { X, TrendingDown, Loader2 } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { sellAsset } from '@/actions/investment.actions';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';

interface Holding {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  avgCostCents: number;
  currentPriceCents: number;
  currency: string;
}

interface SellAssetModalProps {
  holding: Holding | null;
  currency: string;
  dictionary: Record<string, unknown>;
  locale?: string;
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
  const [isVisible, setIsVisible] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [pricePerShareCents, setPricePerShareCents] = useState(0);
  const [selling, setSelling] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
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
  };

  async function handleSell() {
    if (!holding) return;
    setSelling(true);
    setSubmitError(null);

    const qty = quantity.trim();
    if (!qty || Number.parseFloat(qty) <= 0) {
      setSubmitError('Quantity must be positive.');
      setSelling(false);
      return;
    }

    if (Number.parseFloat(qty) > holding.quantity) {
      setSubmitError(`You only have ${holding.quantity.toFixed(4)} shares to sell.`);
      setSelling(false);
      return;
    }

    try {
      const res = await sellAsset({
        idempotencyKey: crypto.randomUUID(),
        holdingId: holding.id,
        quantity: qty,
        pricePerShareCents,
      });

      if (res.success) {
        addNotification('success', `Sold ${qty} ${holding.symbol}`);
        closeModal();
      } else {
        const msg =
          res.code === 'SESSION_INVALID'
            ? get(dictionary, 'errors.sessionInvalid')
            : get(dictionary, 'errors.sellFailed');
        setSubmitError(msg);
      }
    } catch {
      setSubmitError('Unexpected error');
    } finally {
      setSelling(false);
    }
  }

  const qtyNum = Number.parseFloat(quantity) || 0;
  const totalProceedsCents =
    qtyNum > 0 && pricePerShareCents > 0 ? Math.round(qtyNum * pricePerShareCents) : 0;

  const inputCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-transparent transition-all';
  const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';

  if (!holding) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      aria-labelledby="sell-asset-title"
      className="bg-transparent border-none m-0 h-full w-full max-w-full max-h-full backdrop:bg-transparent open:flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
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
                {holding.quantity.toFixed(4)} shares · Avg{' '}
                {formatMoney(holding.avgCostCents, currency, locale)}
              </p>
            </div>
          </div>

          {/* Error alert */}
          {submitError && (
            <div
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
              type="number"
              inputMode="decimal"
              step="0.0001"
              min="0"
              max={holding.quantity}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={holding.quantity.toFixed(4)}
              className={`${inputCls} font-mono tabular-nums`}
            />
            <p className="mt-1 text-xs text-slate-500">
              Available: {holding.quantity.toFixed(4)} shares
            </p>
          </div>

          {/* Price per share */}
          <div>
            <label htmlFor="sell-price" className={labelCls}>
              {get(dictionary, 'pricePerShare')}
            </label>
            <input
              id="sell-price"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={(pricePerShareCents / 100).toFixed(2)}
              onChange={(e) =>
                setPricePerShareCents(Math.round(Number.parseFloat(e.target.value) * 100))
              }
              className={`${inputCls} font-mono tabular-nums`}
            />
          </div>

          {/* Total proceeds */}
          {totalProceedsCents > 0 && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-emerald-300">Total proceeds</span>
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
              onClick={handleSell}
              disabled={selling || !quantity || qtyNum <= 0}
              className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
            >
              {selling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Selling...
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
