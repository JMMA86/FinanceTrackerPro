'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Search, Loader2, TrendingUp, Plus, AlertCircle } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { getStockPrice, buyAsset, searchStocksAction } from '@/actions/investment.actions';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type { InvestmentAccountSummary } from './InvestmentAccountCard';

interface AssetSearchModalProps {
  account: InvestmentAccountSummary | null;
  dictionary: Record<string, unknown>;
  locale?: string;
}

interface StockMatch {
  symbol: string;
  name: string;
}

interface PricedStock extends StockMatch {
  priceCents: number;
  currency: string;
}

export function AssetSearchModal({
  account,
  dictionary,
  locale = 'es-CO',
}: Readonly<AssetSearchModalProps>) {
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const addNotification = useUIStore((s) => s.addNotification);

  const isOpen = activeModal === 'buy-asset';

  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Two-phase search: symbols first, then price on selection
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<StockMatch[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockMatch | null>(null);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [pricedStock, setPricedStock] = useState<PricedStock | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Buy form state
  const [quantity, setQuantity] = useState('');
  const [pricePerShareCents, setPricePerShareCents] = useState(0);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      dialog.showModal();
      setTimeout(() => searchInputRef.current?.focus(), 300);
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
      setQuery('');
      setMatches([]);
      setSelectedStock(null);
      setPricedStock(null);
      setSearchError(null);
      setSubmitError(null);
      setQuantity('');
      setPricePerShareCents(0);
      setBuying(false);
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen]);

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

  // Phase 1: search symbols via autocomplete
  const doSearch = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setMatches([]);
        setSearchError(null);
        return;
      }

      setSearching(true);
      setSearchError(null);
      setMatches([]);
      setSelectedStock(null);
      setPricedStock(null);

      try {
        const res = await searchStocksAction({ symbol: trimmed });
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setMatches(res.data as StockMatch[]);
        } else {
          setSearchError(get(dictionary, 'stockNotFound'));
        }
      } catch {
        setSearchError(get(dictionary, 'stockNotFound'));
      } finally {
        setSearching(false);
      }
    },
    [dictionary]
  );

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  }

  // Phase 2: fetch price when user picks a symbol
  async function handlePickStock(stock: StockMatch) {
    setSelectedStock(stock);
    setPricedStock(null);
    setFetchingPrice(true);
    setSearchError(null);
    setMatches([]); // close dropdown

    try {
      const res = await getStockPrice({ symbol: stock.symbol });
      if (res.success && res.data) {
        const data = res.data as {
          symbol: string;
          price: number;
          priceCents: number;
          currency: string;
        };
        const priced: PricedStock = {
          symbol: data.symbol,
          name: stock.name,
          priceCents: data.priceCents,
          currency: data.currency ?? 'USD',
        };
        setPricedStock(priced);
        setPricePerShareCents(data.priceCents);
      } else {
        setSearchError(get(dictionary, 'priceFailed'));
      }
    } catch {
      setSearchError(get(dictionary, 'priceFailed'));
    } finally {
      setFetchingPrice(false);
    }
  }

  async function handleBuy() {
    if (!account || !pricedStock) return;
    setBuying(true);
    setSubmitError(null);

    const qty = quantity.trim();
    if (!qty || Number.parseFloat(qty) <= 0) {
      setSubmitError(get(dictionary, 'errors.buyFailed'));
      setBuying(false);
      return;
    }

    try {
      const res = await buyAsset({
        idempotencyKey: crypto.randomUUID(),
        accountId: account.id,
        symbol: pricedStock.symbol,
        name: pricedStock.name,
        quantity: qty,
        pricePerShareCents,
      });

      if (res.success) {
        addNotification('success', `Bought ${qty} ${pricedStock.symbol}`);
        closeModal();
      } else {
        const msg =
          res.code === 'SESSION_INVALID'
            ? get(dictionary, 'errors.sessionInvalid')
            : get(dictionary, 'errors.buyFailed');
        setSubmitError(msg);
      }
    } catch {
      setSubmitError(get(dictionary, 'errors.buyFailed'));
    } finally {
      setBuying(false);
    }
  }

  const qtyNum = Number.parseFloat(quantity) || 0;
  const totalCostCents =
    qtyNum > 0 && pricePerShareCents > 0 ? Math.round(qtyNum * pricePerShareCents) : 0;

  const inputCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-transparent transition-all';
  const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      aria-labelledby="buy-asset-title"
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
        className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl max-h-[90vh] flex flex-col"
        style={{
          transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.93) translateY(12px)',
          opacity: isVisible ? 1 : 0,
          transition: isVisible
            ? 'transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)'
            : 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 sticky top-0 bg-slate-900 z-10">
          <h2 id="buy-asset-title" className="text-base font-semibold text-white">
            {get(dictionary, 'buyAsset')}
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

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Account info */}
          {account && (
            <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-3">
              <p className="text-xs text-violet-300 mb-0.5">{account.name}</p>
              <p className="text-sm font-semibold text-white">
                {get(dictionary, 'availableBalance')}:{' '}
                {formatMoney(account.balanceCents, account.currency, locale)}
              </p>
            </div>
          )}

          {/* Error alert */}
          {submitError && (
            <div
              role="alert"
              className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400"
            >
              {submitError}
            </div>
          )}

          {/* Search input with dropdown */}
          <div>
            <label htmlFor="asset-search" className={labelCls}>
              {get(dictionary, 'searchStocks')}
            </label>
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                aria-hidden="true"
              />
              <input
                ref={searchInputRef}
                id="asset-search"
                type="text"
                autoComplete="off"
                placeholder={get(dictionary, 'searchPlaceholder')}
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                className={`${inputCls} pl-10`}
                role="combobox"
                aria-expanded={matches.length > 0}
                aria-controls="stock-results"
                aria-autocomplete="list"
              />
              {searching && (
                <Loader2
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-400 animate-spin"
                  aria-hidden="true"
                />
              )}
            </div>

            {/* Search results dropdown — flows naturally, pushes content down */}
            {matches.length > 0 && !selectedStock && (
              <div
                id="stock-results"
                aria-label={get(dictionary, 'searchResults')}
                className="mt-1 bg-slate-800 border border-white/10 rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto"
              >
                {matches.map((m, i) => (
                  <button
                    key={m.symbol}
                    id={`stock-option-${i}`}
                    type="button"
                    onClick={() => handlePickStock(m)}
                    className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{m.symbol}</p>
                      <p className="text-xs text-slate-400 truncate">{m.name}</p>
                    </div>
                    <span className="text-[10px] text-slate-500 ml-2 flex-shrink-0">
                      {m.symbol.includes('.') ? m.symbol.split('.')[1] : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search error */}
          {searchError && !selectedStock && !fetchingPrice && (
            <div className="bg-white/5 rounded-xl px-4 py-3 flex items-start gap-2.5">
              <AlertCircle
                className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm text-slate-300">{searchError}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {get(dictionary, 'stockNotFoundHint')}
                </p>
              </div>
            </div>
          )}

          {/* Loading price after selection */}
          {fetchingPrice && selectedStock && (
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 flex items-center gap-3">
              <Loader2
                className="w-4 h-4 text-violet-400 animate-spin flex-shrink-0"
                aria-hidden="true"
              />
              <p className="text-sm text-slate-300">
                {get(dictionary, 'searching')}{' '}
                <span className="font-semibold text-white">{selectedStock.symbol}</span>
              </p>
            </div>
          )}

          {/* Priced stock + buy form */}
          {pricedStock && !fetchingPrice && (
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-4">
              {/* Result header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 flex-shrink-0">
                    <TrendingUp className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {pricedStock.symbol}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{pricedStock.name}</p>
                  </div>
                </div>
                <p className="text-sm font-bold text-white tabular-nums flex-shrink-0 ml-3">
                  {formatMoney(pricedStock.priceCents, pricedStock.currency, locale)}
                </p>
              </div>

              {/* Buy form */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="buy-qty" className={labelCls}>
                    {get(dictionary, 'quantity')}
                  </label>
                  <input
                    id="buy-qty"
                    type="number"
                    inputMode="decimal"
                    step="0.0001"
                    min="0"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="0.0000"
                    className={`${inputCls} font-mono tabular-nums`}
                  />
                </div>
                <div>
                  <label htmlFor="buy-price" className={labelCls}>
                    {get(dictionary, 'pricePerShare')}
                  </label>
                  <input
                    id="buy-price"
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
              </div>

              {/* Total cost */}
              {totalCostCents > 0 && (
                <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-violet-300">{get(dictionary, 'totalCost')}</span>
                  <span className="text-base font-bold text-white tabular-nums">
                    {formatMoney(totalCostCents, account?.currency ?? 'USD', locale)}
                  </span>
                </div>
              )}

              {/* Buy button */}
              <button
                type="button"
                onClick={handleBuy}
                disabled={buying || !quantity || qtyNum <= 0}
                className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
              >
                {buying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />{' '}
                    {get(dictionary, 'buying')}
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" aria-hidden="true" /> {get(dictionary, 'confirmBuy')}
                  </>
                )}
              </button>
            </div>
          )}

          {/* Cancel */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors"
            >
              {get(dictionary, 'cancel')}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
