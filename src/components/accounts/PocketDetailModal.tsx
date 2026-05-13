'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TrendingUp, ChevronLeft, ChevronRight, Activity, Pencil, Trash2 } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { log } from '@/lib/logger';
import { getAccountTransactions } from '@/actions/account-transactions.actions';
import { TYPE_GRADIENTS } from './AccountCard';
import type { AccountCardData } from './AccountCard';

const ANIM_MS = 260;
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

const TX_LABELS: Record<string, string> = {
  INCOME: 'Ingreso', EXPENSE: 'Gasto',
  TRANSFER_OUT: 'Salida', TRANSFER_IN: 'Entrada',
  INVESTMENT: 'Inversión', LOAN_PAYMENT: 'Cuota', CREDIT_PAYMENT: 'Pago tarjeta',
};

interface Tx {
  id: string; description: string | null;
  amountCents: number; currency: string; type: string; date: Date | string;
}

interface PocketDetailModalProps {
  pocket: AccountCardData | null;
  locale?: string;
  onClose: () => void;
  onEdit: (pocketId: string) => void;
  onDelete: (pocketId: string, pocketName: string) => void;
}

function fmt(d: Date | string, locale: string) {
  return new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function PocketDetailModal({ pocket, locale = 'es-CO', onClose, onEdit, onDelete }: Readonly<PocketDetailModalProps>) {
  const [mounted, setMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  // Live state: reflects updates from EditPocketModal in real-time
  const [liveName, setLiveName] = useState<string | null>(null);
  const [liveRate, setLiveRate] = useState<number | null>(null);
  const displayName = liveName ?? pocket?.name ?? '';
  const displayRate = liveRate ?? (pocket?.interestRateEA != null ? Number(pocket.interestRateEA) : 0);

  const [txs, setTxs] = useState<Tx[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Mount detection via rAF callback (not direct setState in effect body)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Listen for real-time updates from EditPocketModal (name, rate)
  useEffect(() => {
    const onUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ accountId: string; cardColor?: string | null; name?: string; interestRateEA?: number }>).detail;
      if (detail.accountId === pocket?.id) {
        if (detail.name != null) setLiveName(detail.name);
        if (detail.interestRateEA != null) setLiveRate(Number(detail.interestRateEA));
      }
    };
    document.addEventListener('finance:account-updated', onUpdated);
    return () => document.removeEventListener('finance:account-updated', onUpdated);
  }, [pocket?.id]);

  // Listen for deletion to auto-close
  useEffect(() => {
    const onDeleted = (e: Event) => {
      const detail = (e as CustomEvent<{ accountId: string }>).detail;
      if (detail.accountId === pocket?.id) {
        setIsVisible(false);
        setTimeout(onClose, ANIM_MS);
      }
    };
    document.addEventListener('finance:account-deleted', onDeleted);
    return () => document.removeEventListener('finance:account-deleted', onDeleted);
  }, [pocket?.id, onClose]);

  // Use a ref to track the pocket id so the visibility effect only depends on the id (primitive)
  const pocketIdRef = useRef(pocket?.id);
  useEffect(() => { pocketIdRef.current = pocket?.id; }, [pocket?.id]);

  // Sync visibility and reset live name when pocket id changes
  useEffect(() => {
    const pocketId = pocketIdRef.current;
    if (!pocketId) {
      const id = requestAnimationFrame(() => setIsVisible(false));
      return () => cancelAnimationFrame(id);
    }
    // Reset live name and rate, then animate open — all inside rAF
    const id = requestAnimationFrame(() => {
      setLiveName(null);
      setLiveRate(null);
      setIsVisible(true);
    });
    log.info({ action: 'pocket.detail.open', pocketId }, 'Pocket detail opened');
    return () => cancelAnimationFrame(id);
  }, [pocket?.id]);

  // Reset pagination when pocket changes — use rAF to avoid direct setState in effect body
  useEffect(() => {
    if (!pocket?.id) return;
    const id = requestAnimationFrame(() => {
      setPage(1);
      setTxs([]);
      setTotal(0);
      setTotalPages(0);
    });
    return () => cancelAnimationFrame(id);
  }, [pocket?.id]);

  // Fetch transactions — depends only on stable primitive id and page
  const pocketId = pocket?.id;
  useEffect(() => {
    if (!pocketId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await getAccountTransactions({ accountId: pocketId, page });
      if (!cancelled && res.success && res.data) {
        setTxs(res.data.transactions as Tx[]);
        setTotalPages(res.data.totalPages);
        setTotal(res.data.total);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [pocketId, page]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, ANIM_MS);
    if (pocketId) {
      log.info({ action: 'pocket.detail.close', pocketId }, 'Pocket detail closed');
    }
  }, [onClose, pocketId]);

  useEffect(() => {
    if (!pocket) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [pocket, handleClose]);

  if (!mounted || !pocket) return null;

  const rate = displayRate;
  const annualCents = rate > 0 ? Math.floor(pocket.balanceCents * rate / 100) : 0;

  const panelStyle: React.CSSProperties = {
    transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(24px)',
    opacity: isVisible ? 1 : 0,
    transition: isVisible
      ? `transform ${ANIM_MS}ms ${SPRING}, opacity ${ANIM_MS - 40}ms ${EASE_OUT}`
      : `transform ${ANIM_MS - 40}ms ${EASE_OUT}, opacity ${ANIM_MS - 60}ms ${EASE_OUT}`,
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm transition-opacity"
        style={{ opacity: isVisible ? 1 : 0, transitionDuration: `${ANIM_MS - 20}ms` }}
        onClick={handleClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pocket-modal-title"
        className="fixed inset-0 flex items-center justify-center p-4 z-[70] pointer-events-none"
      >
        <div
          className="pointer-events-auto w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
          style={panelStyle}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 flex-shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                aria-label="Volver"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 id="pocket-modal-title" className="text-sm font-semibold text-white">{displayName}</h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full">
                Bolsillo
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onEdit(pocket.id)}
                aria-label="Editar bolsillo"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(pocket.id, pocket.name)}
                aria-label="Eliminar bolsillo"
                className="p-1.5 rounded-lg text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            <div
              className="px-5 py-6 flex items-center gap-4"
              style={{ background: TYPE_GRADIENTS.POCKET }}
            >
              <div className="flex-shrink-0">
                <svg width="36" height="26" viewBox="0 0 40 28" fill="none" aria-hidden="true">
                  <rect width="40" height="28" rx="4" fill="#D4AF37" opacity="0.9" />
                  <rect x="0" y="9" width="40" height="10" fill="#B8960C" opacity="0.6" />
                  <rect x="13" y="0" width="14" height="28" fill="#B8960C" opacity="0.4" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] text-white/60 uppercase tracking-widest mb-0.5">Saldo actual</p>
                <p className="text-2xl font-bold text-white leading-none">
                  {formatMoney(pocket.balanceCents, pocket.currency, locale)}
                </p>
                <p className="text-xs text-white/60 mt-0.5">{pocket.currency}</p>
              </div>
            </div>

            {rate > 0 && (
              <div className="px-5 py-4 border-b border-white/8 space-y-3">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                  <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">Rentabilidad</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Tasa EA', value: `${rate.toFixed(2)}%` },
                    { label: 'Ganancia', value: formatMoney(annualCents, pocket.currency, locale) },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white/5 rounded-xl p-3">
                      <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">{label}</p>
                      <p className="text-sm font-bold text-white leading-tight">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-blue-400" />
                  <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">Movimientos</p>
                </div>
                {!loading && <p className="text-[11px] text-white/30">{total} en total</p>}
              </div>

              {loading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-10 rounded-lg bg-white/5 animate-pulse" />
                  ))}
                </div>
              ) : txs.length === 0 ? (
                <p className="text-xs text-white/30 py-2">Sin movimientos registrados.</p>
              ) : (
                <div className="divide-y divide-white/5">
                  {txs.map((tx) => {
                    const isIn = tx.type === 'INCOME' || tx.type === 'TRANSFER_IN';
                    return (
                      <div key={tx.id} className="flex items-center gap-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white truncate">{tx.description ?? '—'}</p>
                          <p className="text-[10px] text-white/40 mt-0.5">{fmt(tx.date, locale)}</p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <p className={`text-xs font-semibold ${isIn ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isIn ? '+' : '-'}{formatMoney(Math.abs(tx.amountCents), tx.currency, locale)}
                          </p>
                          <p className="text-[10px] text-white/30 mt-0.5">{TX_LABELS[tx.type] ?? tx.type}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-white/50">{page} / {totalPages}</span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
