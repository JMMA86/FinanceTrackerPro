'use client';

import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { ArrowLeft, Pencil, Trash2, CreditCard as CreditCardIcon, Wallet } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { get } from '@/lib/i18n';
import { getCreditCardStatement } from '@/actions/credit-card.actions';
import { NetworkLogo } from '@/components/accounts/AccountCard';
import type { CardNetwork } from '@/components/accounts/AccountCard';
import {
  getPresetGradient,
  LIGHT_PRESET_KEYS,
  PRESETS,
} from '@/components/accounts/CardDesignPicker';
import type { CreditCard, CreditCardStatement } from './credit-card.types';

// iOS spring easing
const IOS_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const EXPAND_MS = 300;
const SHRINK_MS = 240;
const CONTENT_FADE_MS = 180;
const FINAL_CLIP = 'inset(0px 0px 0px 0px round 0px)';

const CARD_GRADIENT = 'linear-gradient(135deg, #dc2626, #7f1d1d)';

function getAccentColor(card: CreditCard, liveColor: string | null): string {
  const colorKey = liveColor ?? card.cardColor;
  if (colorKey) {
    const preset = PRESETS.find((p) => p.key === colorKey);
    if (preset) {
      return LIGHT_PRESET_KEYS.has(preset.key) ? '#475569' : preset.from;
    }
  }
  return '#dc2626';
}

function getTopBarBackground(card: CreditCard, liveColor: string | null): string {
  const colorKey = liveColor ?? card.cardColor;
  if (colorKey) {
    const preset = PRESETS.find((p) => p.key === colorKey);
    if (preset)
      return `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), linear-gradient(135deg, ${preset.from}, ${preset.to})`;
  }
  return `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), ${CARD_GRADIENT}`;
}

function getCardBackgroundWithLive(
  card: CreditCard,
  liveColor: string | null
): React.CSSProperties {
  const colorKey = liveColor ?? card.cardColor;
  if (colorKey) {
    const gradient = getPresetGradient(colorKey);
    if (gradient) return { background: gradient };
  }
  return { background: CARD_GRADIENT };
}

function getLabel(dictionary: Record<string, unknown>, path: string, fallback: string): string {
  const value = get(dictionary, path);
  return value !== path ? value : fallback;
}

// ── card is guaranteed non-null here ──
function safeCard(card: CreditCard | null): CreditCard {
  if (!card) throw new Error('card is required');
  return card;
}

function getInitialClip(overlayEl: HTMLElement, cardRect: DOMRect): string {
  const r = overlayEl.getBoundingClientRect();
  return `inset(${Math.max(0, cardRect.top - r.top)}px ${Math.max(0, r.right - cardRect.right)}px ${Math.max(0, r.bottom - cardRect.bottom)}px ${Math.max(0, cardRect.left - r.left)}px round 16px)`;
}

function forceReflow(el: HTMLElement) {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  el.offsetHeight;
}

interface CreditCardDetailProps {
  card: CreditCard | null;
  cardRect: DOMRect | null;
  isOpen: boolean;
  dictionary: Record<string, unknown>;
  locale?: string;
  onClose: () => void;
  onEdit: (cardId: string) => void;
  onPay: (card: CreditCard) => void;
  onDelete: (cardId: string, cardName: string, debtCents: number, currency: string) => void;
}

function formatDateShort(d: Date | string, locale: string) {
  return new Date(d).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface StatementSummaryProps {
  statement: CreditCardStatement | null;
  statementLoading: boolean;
  dictionary: Record<string, unknown>;
  locale: string;
}

/** Period statement summary: loading skeleton, metric grid, or empty state. */
function StatementSummary({
  statement,
  statementLoading,
  dictionary,
  locale,
}: Readonly<StatementSummaryProps>) {
  if (statementLoading) {
    return (
      <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.02] p-5">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-8 bg-white/5 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!statement) {
    return <p className="text-xs text-white/30 py-1">{get(dictionary, 'detail.noMovements')}</p>;
  }

  const items = [
    {
      label: get(dictionary, 'detail.previousBalance'),
      value: formatMoney(statement.previousBalanceCents, statement.currency, locale),
    },
    {
      label: get(dictionary, 'detail.charges'),
      value: formatMoney(statement.chargesTotalCents, statement.currency, locale),
    },
    {
      label: get(dictionary, 'detail.payments'),
      value: formatMoney(statement.paymentsTotalCents, statement.currency, locale),
    },
    {
      label: get(dictionary, 'detail.interest'),
      value: formatMoney(statement.interestTotalCents, statement.currency, locale),
    },
    {
      label: get(dictionary, 'detail.newBalance'),
      value: formatMoney(statement.newBalanceCents, statement.currency, locale),
      cls: 'text-rose-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
      {items.map(({ label, value, cls }) => (
        <div key={label} className="app-shell rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-white/40 font-medium mb-1">
            {label}
          </p>
          <p className={`text-base font-bold text-white leading-tight ${cls ?? ''}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

export function CreditCardDetail({
  card,
  cardRect,
  isOpen,
  dictionary,
  locale = 'es-CO',
  onClose,
  onEdit,
  onPay,
  onDelete,
}: Readonly<CreditCardDetailProps>) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const savedCardRect = useRef<DOMRect | null>(null);
  const cardRectRef = useRef(cardRect);
  const cardRef = useRef(card);
  const [contentVisible, setContentVisible] = useState(false);
  const [liveCardColor, setLiveCardColor] = useState<string | null>(null);
  const [statement, setStatement] = useState<CreditCardStatement | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  useLayoutEffect(() => {
    cardRectRef.current = cardRect;
  });
  useLayoutEffect(() => {
    cardRef.current = card;
  });

  // Reset live color synchronously when switching cards or closing
  const [liveColorResetKey, setLiveColorResetKey] = useState<string | null>(null);
  if (`${card?.id ?? ''}:${isOpen}` !== liveColorResetKey) {
    setLiveColorResetKey(`${card?.id ?? ''}:${isOpen}`);
    setLiveCardColor(null);
  }

  // Step 1: set initial clip BEFORE browser paints
  useLayoutEffect(() => {
    if (!isOpen || !overlayRef.current || !cardRectRef.current) return;
    savedCardRect.current = cardRectRef.current;
    const el = overlayRef.current;
    el.style.clipPath = getInitialClip(el, cardRectRef.current);
    el.style.transition = 'none';
    el.style.background = 'linear-gradient(135deg, #3f0d0d 0%, #1a0808 50%, #0a0303 100%)';
  }, [isOpen, card?.id]);

  // Step 2: animate to full screen
  useEffect(() => {
    if (!isOpen || !cardRectRef.current || !overlayRef.current || !cardRef.current) return;
    const el = overlayRef.current;
    const crd = cardRef.current;
    const colorKey = liveCardColor ?? crd.cardColor;
    const rawBg = colorKey ? (getPresetGradient(colorKey) ?? CARD_GRADIENT) : CARD_GRADIENT;
    const light = colorKey != null && LIGHT_PRESET_KEYS.has(colorKey);
    const bgValue = light
      ? `linear-gradient(rgba(2,6,23,0.72), rgba(2,6,23,0.88)), ${rawBg}`
      : rawBg;
    setContentVisible(false);
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        el.style.transition = `clip-path ${EXPAND_MS}ms ${IOS_EASE}, background ${EXPAND_MS + 100}ms ease-out, left 300ms ease`;
        el.style.clipPath = FINAL_CLIP;
        if (bgValue) el.style.background = bgValue;
      });
      const cleanup2 = () => cancelAnimationFrame(raf2);
      setTimeout(() => setContentVisible(true), CONTENT_FADE_MS);
      setTimeout(() => {
        const ref = overlayRef.current;
        if (!ref) return;
        ref.style.transition = 'left 300ms ease';
        ref.style.clipPath = '';
      }, EXPAND_MS + 50);
      return cleanup2;
    });
    return () => cancelAnimationFrame(raf1);
  }, [isOpen, card?.id, liveCardColor]);

  const handleClose = useCallback(() => {
    const el = overlayRef.current;
    const cr = (() => {
      if (card) {
        const cardEl = document.querySelector(`[data-card-id="${card.id}"]`);
        if (cardEl) {
          const r = cardEl.getBoundingClientRect();
          if (r.width > 0) return r;
        }
      }
      return savedCardRect.current;
    })();

    setContentVisible(false);

    if (el && cr) {
      el.style.transition = 'none';
      el.style.clipPath = FINAL_CLIP;
      forceReflow(el);
      el.style.transition = `clip-path ${SHRINK_MS}ms ${IOS_EASE}, left 300ms ease`;
      el.style.clipPath = getInitialClip(el, cr);
    }

    setTimeout(onClose, SHRINK_MS);
  }, [card, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [isOpen, handleClose]);

  // Close overlay on card deletion
  useEffect(() => {
    if (!isOpen || !card) return;
    const onDeleted = (e: Event) => {
      if ((e as CustomEvent<{ cardId: string }>).detail?.cardId !== card.id) return;
      handleClose();
    };
    document.addEventListener('finance:credit-card-deleted', onDeleted);
    return () => document.removeEventListener('finance:credit-card-deleted', onDeleted);
  }, [isOpen, card, handleClose]);

  // Load the current-period statement when the detail opens
  const cardId = card?.id;
  useEffect(() => {
    if (!cardId || !isOpen) return;
    const t = setTimeout(() => {
      setStatementLoading(true);
      setStatement(null);
      getCreditCardStatement({ accountId: cardId })
        .then((res) => {
          if (res.success && res.data) {
            setStatement(res.data as CreditCardStatement);
          }
        })
        .catch(() => {
          // silent
        })
        .finally(() => setStatementLoading(false));
    }, 0);
    return () => clearTimeout(t);
  }, [cardId, isOpen]);

  if (!isOpen || !card || !cardRect) return null;

  const safe = safeCard(card);
  const light =
    (liveCardColor ?? safe.cardColor) != null &&
    LIGHT_PRESET_KEYS.has(liveCardColor ?? safe.cardColor ?? '');
  const network = (safe.cardNetwork ?? 'NONE') as CardNetwork;
  const accentColor = getAccentColor(safe, liveCardColor);
  const cardBg = getCardBackgroundWithLive(safe, liveCardColor);
  const recentMovements = safe.transactions ?? [];

  return (
    <div
      ref={overlayRef}
      className="fixed top-0 right-0 bottom-0 z-[60] overflow-hidden left-0 md:left-[var(--sidebar-width,0px)] min-h-screen"
    >
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-300"
        style={{
          background: 'linear-gradient(to bottom, rgba(2,6,23,0.68) 0%, rgba(2,6,23,0.90) 100%)',
          opacity: contentVisible ? 1 : 0,
        }}
      />

      <div
        className="relative z-10 h-full overflow-y-auto transition-opacity duration-200 pb-20 md:pb-0"
        style={{ opacity: contentVisible ? 1 : 0 }}
      >
        <div
          className="sticky top-0 z-20 flex items-center gap-3 px-4 sm:px-6 h-14 border-b"
          style={{
            background: getTopBarBackground(safe, liveCardColor),
            borderColor: 'rgba(255, 255, 255, 0.10)',
          }}
        >
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-medium flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{get(dictionary, 'detail.back')}</span>
          </button>

          <div className="flex-1 flex items-center gap-2 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{safe.name}</p>
            <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider bg-white/15 text-white/80 px-2 py-0.5 rounded-full">
              {get(dictionary, 'cardTypeBadge')}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPay(safe)}
              aria-label={get(dictionary, 'detail.pay')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
            >
              <Wallet className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">{get(dictionary, 'detail.pay')}</span>
            </button>
            <button
              type="button"
              onClick={() => onEdit(safe.id)}
              aria-label={get(dictionary, 'detail.edit')}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(safe.id, safe.name, safe.debtCents, safe.currency)}
              aria-label={get(dictionary, 'detail.delete')}
              className="p-2 rounded-lg text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-4 sm:px-8 lg:px-12 pt-8 pb-6">
          <div className="flex flex-col sm:flex-row items-start gap-6 sm:gap-10 lg:gap-12 xl:gap-16">
            <div className="hidden sm:block flex-shrink-0 w-40 sm:w-44 lg:w-48">
              <div
                className="w-full rounded-2xl shadow-2xl overflow-hidden relative"
                style={{ aspectRatio: '1.586', ...cardBg }}
              >
                <div
                  className={`relative z-10 flex flex-col justify-between p-4 h-full ${light ? 'text-slate-800' : 'text-white'}`}
                  style={{
                    textShadow: light
                      ? '0 1px 2px rgba(255,255,255,0.5)'
                      : '0 1px 3px rgba(0,0,0,0.5)',
                  }}
                >
                  <svg width="30" height="21" viewBox="0 0 40 28" fill="none" aria-hidden="true">
                    <rect width="40" height="28" rx="4" fill="#D4AF37" opacity="0.9" />
                    <rect x="0" y="9" width="40" height="10" fill="#B8960C" opacity="0.6" />
                    <rect x="13" y="0" width="14" height="28" fill="#B8960C" opacity="0.4" />
                  </svg>
                  <div className="flex items-end justify-between gap-1">
                    <div className="min-w-0">
                      <p className="text-[10px] opacity-70 truncate">{safe.name}</p>
                      <p className="text-sm font-bold">{safe.currency}</p>
                    </div>
                    {network !== 'NONE' && (
                      <NetworkLogo network={network} size="sm" onLight={light} />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-widest text-white/40 mb-1">
                {get(dictionary, 'cardTypeBadge')}
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-6 leading-tight">
                {safe.name}
              </h1>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
                {[
                  {
                    label: get(dictionary, 'detail.currentDebt'),
                    value: formatMoney(safe.debtCents, safe.currency, locale),
                    cls: 'text-rose-400',
                  },
                  {
                    label: get(dictionary, 'detail.availableCredit'),
                    value:
                      safe.availableCreditCents != null
                        ? formatMoney(safe.availableCreditCents, safe.currency, locale)
                        : '—',
                  },
                  {
                    label: get(dictionary, 'detail.creditLimit'),
                    value:
                      safe.creditLimitCents != null
                        ? formatMoney(safe.creditLimitCents, safe.currency, locale)
                        : '—',
                  },
                  {
                    label: get(dictionary, 'detail.paymentStatus'),
                    value: getLabel(
                      dictionary,
                      `paymentStatus.${safe.paymentStatus}`,
                      safe.paymentStatus
                    ),
                  },
                ].map(({ label, value, cls }) => (
                  <div key={label}>
                    <p className="text-[10px] uppercase tracking-widest text-white/40 font-medium mb-1">
                      {label}
                    </p>
                    <p className={`text-lg font-bold text-white leading-tight ${cls ?? ''}`}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 lg:px-12 pb-12 space-y-8">
          {/* Card schedule */}
          <section className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="app-shell rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-widest text-white/40 font-medium mb-1">
                {get(dictionary, 'detail.cutoffDay')}
              </p>
              <p className="text-lg font-bold text-white">{safe.cutoffDay ?? '—'}</p>
            </div>
            <div className="app-shell rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-widest text-white/40 font-medium mb-1">
                {get(dictionary, 'detail.dueDay')}
              </p>
              <p className="text-lg font-bold text-white">{safe.paymentDueDay ?? '—'}</p>
            </div>
            <div className="app-shell rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-widest text-white/40 font-medium mb-1">
                {get(dictionary, 'paymentNetwork')}
              </p>
              <p className="text-lg font-bold text-white">
                {network === 'NONE' ? get(dictionary, 'networks.NONE') : network}
              </p>
            </div>
          </section>

          {/* Recent movements */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <CreditCardIcon className="w-4 h-4" style={{ color: accentColor }} />
              <h2 className="text-sm font-semibold text-white">
                {get(dictionary, 'detail.recentMovements')}
              </h2>
            </div>

            {recentMovements.length === 0 ? (
              <p className="text-xs text-white/30 py-1">{get(dictionary, 'detail.noMovements')}</p>
            ) : (
              <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.02]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px]">
                    <thead>
                      <tr className="border-b border-white/8">
                        <th className="text-left text-[10px] uppercase tracking-widest text-white/40 font-semibold px-4 py-3.5">
                          {get(dictionary, 'detail.date')}
                        </th>
                        <th className="text-left text-[10px] uppercase tracking-widest text-white/40 font-semibold px-4 py-3.5">
                          {get(dictionary, 'detail.description')}
                        </th>
                        <th className="text-right text-[10px] uppercase tracking-widest text-white/40 font-semibold px-4 py-3.5">
                          {get(dictionary, 'detail.amount')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentMovements.map((tx) => {
                        const pos = tx.amountCents > 0;
                        return (
                          <tr
                            key={tx.id}
                            className="border-b border-white/6 hover:bg-white/[0.03] transition-colors"
                          >
                            <td className="px-4 py-3.5 text-xs text-white/40 whitespace-nowrap">
                              {formatDateShort(tx.date, locale)}
                            </td>
                            <td className="px-4 py-3.5 text-sm text-white max-w-0">
                              <span className="block truncate">{tx.description ?? '—'}</span>
                            </td>
                            <td
                              className={`px-4 py-3.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap ${pos ? 'text-emerald-400' : 'text-rose-400'}`}
                            >
                              {pos ? '+' : ''}
                              {formatMoney(tx.amountCents, tx.currency, locale)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* Statement */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-white">
                {get(dictionary, 'detail.statement')}
              </h2>
              {statement && (
                <span className="text-[11px] text-white/30">
                  {formatDateShort(statement.periodStart, locale)} —{' '}
                  {formatDateShort(statement.periodEnd, locale)}
                </span>
              )}
            </div>

            <StatementSummary
              statement={statement}
              statementLoading={statementLoading}
              dictionary={dictionary}
              locale={locale}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
