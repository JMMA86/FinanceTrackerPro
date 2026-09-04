'use client';

import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  Wallet,
  Activity,
  Plus,
} from 'lucide-react';
import { formatMoney, multiplyCents, divideCents, addCents } from '@/lib/money';
import { get } from '@/lib/i18n';
import { getAccountTransactions } from '@/actions/account-transactions.actions';
import { NetworkLogo, TYPE_GRADIENTS } from './AccountCard';
import type { AccountCardData, CardNetwork } from './AccountCard';
import { PRESETS, LIGHT_PRESET_KEYS, getPresetGradient } from './CardDesignPicker';
import { PocketDetailModal } from './PocketDetailModal';

const TX_TYPES = [
  'INCOME',
  'EXPENSE',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'INVESTMENT',
  'LOAN_PAYMENT',
  'CREDIT_PAYMENT',
];

/**
 * Resolve a dictionary label with a fallback for missing keys/types.
 * `get` from @/lib/i18n returns the key path itself when the key is absent,
 * so a key path result is treated as "not found".
 */
function getLabel(dictionary: Record<string, unknown>, path: string, fallback: string): string {
  const value = get(dictionary, path);
  return value !== path ? value : fallback;
}

// iOS spring easing
const IOS_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const EXPAND_MS = 300;
const SHRINK_MS = 240;
const CONTENT_FADE_MS = 180;
const FINAL_CLIP = 'inset(0px 0px 0px 0px round 0px)';

function getAccentColor(account: AccountCardData, liveColor: string | null): string {
  const colorKey = liveColor ?? account.cardColor;
  if (colorKey) {
    const preset = PRESETS.find((p) => p.key === colorKey);
    if (preset) {
      return LIGHT_PRESET_KEYS.has(preset.key) ? '#475569' : preset.from;
    }
  }
  const match = /#[0-9a-fA-F]{6}/.exec(TYPE_GRADIENTS[account.type] ?? '');
  return match ? match[0] : '#475569';
}

function getTopBarBackground(account: AccountCardData, liveColor: string | null): string {
  const colorKey = liveColor ?? account.cardColor;
  if (colorKey) {
    const preset = PRESETS.find((p) => p.key === colorKey);
    if (preset)
      return `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), linear-gradient(135deg, ${preset.from}, ${preset.to})`;
  }
  const gradient = TYPE_GRADIENTS[account.type];
  if (gradient) return `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), ${gradient}`;
  return 'rgba(12, 30, 68, 0.85)';
}

function getCardBackgroundWithLive(
  account: AccountCardData,
  liveColor: string | null
): React.CSSProperties {
  const colorKey = liveColor ?? account.cardColor;
  if (colorKey) {
    const gradient = getPresetGradient(colorKey);
    if (gradient) return { background: gradient };
  }
  return {
    background: TYPE_GRADIENTS[account.type] ?? 'linear-gradient(135deg, #475569, #1e293b)',
  };
}

// ── account is guaranteed non-null here ──
function safeAccount(account: AccountCardData | null): AccountCardData {
  if (!account) throw new Error('account is required');
  return account;
}

// Clip-path relative to the overlay element (which starts at the sidebar's right edge)
function getInitialClip(overlayEl: HTMLElement, cardRect: DOMRect): string {
  const r = overlayEl.getBoundingClientRect();
  return `inset(${Math.max(0, cardRect.top - r.top)}px ${Math.max(0, r.right - cardRect.right)}px ${Math.max(0, r.bottom - cardRect.bottom)}px ${Math.max(0, cardRect.left - r.left)}px round 16px)`;
}

interface Transaction {
  id: string;
  description: string | null;
  amountCents: number;
  currency: string;
  type: string;
  date: Date | string;
}

interface AccountFullDetailProps {
  account: AccountCardData | null;
  pockets: AccountCardData[];
  cardRect: DOMRect | null;
  isOpen: boolean;
  dictionary: Record<string, unknown>;
  locale?: string;
  onClose: () => void;
  onEdit: (accountId: string) => void;
  onDelete: (accountId: string, accountName: string) => void;
  onCreatePocket: (parentAccountId: string) => void;
  onEditPocket: (pocketId: string) => void;
  onDeletePocket?: (pocketId: string, pocketName: string) => void;
}

function forceReflow(el: HTMLElement) {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  el.offsetHeight;
}

function getHeaderMinWidth(index: number): number {
  if (index === 0) return 100;
  if (index === 1) return 300;
  if (index === 2) return 120;
  return 100;
}

function getHeaderAlignClass(index: number): string {
  if (index === 2) return 'hidden lg:table-cell';
  if (index === 3) return 'text-right';
  return '';
}

interface TxTableBodyProps {
  isLoading: boolean;
  transactions: Transaction[];
  locale: string;
  dictionary: Record<string, unknown>;
}

function TxTableBody({ isLoading, transactions, locale, dictionary }: Readonly<TxTableBodyProps>) {
  if (isLoading) {
    const skeletonRows = [
      'skeleton-row-0',
      'skeleton-row-1',
      'skeleton-row-2',
      'skeleton-row-3',
      'skeleton-row-4',
    ];
    const skeletonCells = [
      'skeleton-cell-date',
      'skeleton-cell-desc',
      'skeleton-cell-type',
      'skeleton-cell-amount',
    ];
    return skeletonRows.map((rowKey) => (
      <tr key={rowKey} className="border-b border-white/6">
        {skeletonCells.map((cellKey, idx) => (
          <td key={cellKey} className={`px-4 py-3.5 ${getHeaderAlignClass(idx)}`}>
            <div
              className="h-3 bg-white/6 rounded animate-pulse"
              style={{ width: [100, 300, 100, 80][idx] }}
            />
          </td>
        ))}
      </tr>
    ));
  }

  if (transactions.length === 0) {
    return (
      <tr>
        <td colSpan={4}>
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-white/20">
            <svg width="56" height="36" viewBox="0 0 56 36" fill="none">
              <path
                d="M4 18 Q14 6 28 18 Q42 30 52 18"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M4 26 Q14 14 28 26 Q42 38 52 26"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
                opacity="0.4"
              />
            </svg>
            <p className="text-sm">{get(dictionary, 'detail.noMovements')}</p>
          </div>
        </td>
      </tr>
    );
  }

  return transactions.map((tx) => {
    const pos = tx.amountCents > 0;
    return (
      <tr key={tx.id} className="border-b border-white/6 hover:bg-white/[0.03] transition-colors">
        <td className="px-4 py-3.5 text-xs text-white/40 whitespace-nowrap">
          {formatDateShort(tx.date, locale)}
        </td>
        <td className="px-4 py-3.5 text-sm text-white max-w-0">
          <span className="block truncate">{tx.description ?? '—'}</span>
        </td>
        <td className="px-4 py-3.5 hidden lg:table-cell">
          <span className="text-xs text-white/40">
            {getLabel(dictionary, `detail.typeLabels.${tx.type}`, tx.type)}
          </span>
        </td>
        <td
          className={`px-4 py-3.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap ${pos ? 'text-emerald-400' : 'text-rose-400'}`}
        >
          {pos ? '+' : ''}
          {formatMoney(tx.amountCents, tx.currency, locale)}
        </td>
      </tr>
    );
  });
}

function formatDate(d: Date | string, locale: string) {
  return new Date(d).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
function formatDateShort(d: Date | string, locale: string) {
  return new Date(d).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function handlePocketCollapsePhase(
  cardEl: HTMLElement,
  pocketWidth: number,
  isLastPocket: boolean,
  COLLAPSE_MS: number,
  EASE_INOUT: string,
  router: ReturnType<typeof useRouter>
) {
  cardEl.style.overflow = 'hidden';
  cardEl.style.flexShrink = '0';
  cardEl.style.width = `${pocketWidth}px`;
  cardEl.style.minWidth = `${pocketWidth}px`;
  forceReflow(cardEl);
  cardEl.style.transition = `width ${COLLAPSE_MS}ms ${EASE_INOUT}, min-width ${COLLAPSE_MS}ms ${EASE_INOUT}, padding ${COLLAPSE_MS}ms ${EASE_INOUT}`;
  cardEl.style.width = '0';
  cardEl.style.minWidth = '0';
  cardEl.style.paddingLeft = '0';
  cardEl.style.paddingRight = '0';

  setTimeout(
    () => handleListCollapsePhase(isLastPocket, COLLAPSE_MS, EASE_INOUT, router),
    COLLAPSE_MS + 20
  );
}

function handleListCollapsePhase(
  isLastPocket: boolean,
  COLLAPSE_MS: number,
  EASE_INOUT: string,
  router: ReturnType<typeof useRouter>
) {
  if (!isLastPocket) {
    router.refresh();
    return;
  }

  const listEl = document.querySelector<HTMLElement>('[data-pockets-list]');
  if (!listEl) {
    router.refresh();
    return;
  }

  const listHeight = listEl.offsetHeight;
  listEl.style.overflow = 'hidden';
  listEl.style.height = `${listHeight}px`;
  forceReflow(listEl);
  listEl.style.transition = `height 300ms ${EASE_INOUT}`;
  listEl.style.height = '0';
  setTimeout(() => {
    router.refresh();
  }, 320);
}

export function AccountFullDetail({
  account,
  pockets,
  cardRect,
  isOpen,
  dictionary,
  locale = 'es-CO',
  onClose,
  onEdit,
  onDelete,
  onCreatePocket,
  onEditPocket,
  onDeletePocket,
}: Readonly<AccountFullDetailProps>) {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement>(null);
  const savedCardRect = useRef<DOMRect | null>(null);
  // Keep a ref copy of cardRect and account so effects can read the latest value
  // without declaring them as deps (avoids re-triggering animation on every render)
  const cardRectRef = useRef(cardRect);
  const accountRef = useRef(account);
  // Sync refs with the latest prop values using useLayoutEffect (runs before paint, in definition order)
  // Defined BEFORE the Step 1 useLayoutEffect so they are always updated first

  useLayoutEffect(() => {
    cardRectRef.current = cardRect;
  });

  useLayoutEffect(() => {
    accountRef.current = account;
  });
  const [contentVisible, setContentVisible] = useState(false);
  const [selectedPocket, setSelectedPocket] = useState<AccountCardData | null>(null);
  // Live color: updated in real-time when user edits via EditAccountModal
  const [liveCardColor, setLiveCardColor] = useState<string | null>(null);

  // Listen for real-time card color updates from EditAccountModal
  useEffect(() => {
    const onUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ accountId: string; cardColor: string | null }>).detail;
      if (detail.accountId === account?.id) {
        setLiveCardColor(detail.cardColor);
      }
    };
    document.addEventListener('finance:account-updated', onUpdated);
    return () => document.removeEventListener('finance:account-updated', onUpdated);
  }, [account?.id]);

  // Reset live color synchronously when switching accounts or closing the
  // overlay (adjust-state-during-render) — an rAF-delayed reset could race a
  // real-time finance:account-updated event.
  const [liveColorResetKey, setLiveColorResetKey] = useState<string | null>(null);
  if (`${account?.id ?? ''}:${isOpen}` !== liveColorResetKey) {
    setLiveColorResetKey(`${account?.id ?? ''}:${isOpen}`);
    setLiveCardColor(null);
  }

  // Step 1: set initial clip BEFORE browser paints — zero flash
  // cardRect is read from ref so it doesn't need to be in the dep array
  useLayoutEffect(() => {
    if (!isOpen || !overlayRef.current || !cardRectRef.current) return;
    savedCardRect.current = cardRectRef.current;
    const el = overlayRef.current;
    el.style.clipPath = getInitialClip(el, cardRectRef.current);
    el.style.transition = 'none';
    el.style.background = 'linear-gradient(135deg, #1e3a5f 0%, #0c1929 50%, #020810 100%)';
  }, [isOpen, account?.id]);

  // Step 2: after first paint, animate to full screen + background in one pass
  // account and cardRect are read from refs so they don't need to be in the dep array
  useEffect(() => {
    if (!isOpen || !cardRectRef.current || !overlayRef.current || !accountRef.current) return;
    const el = overlayRef.current;
    const acc = accountRef.current;
    const colorKey = liveCardColor ?? acc.cardColor;
    const rawBg = colorKey
      ? (getPresetGradient(colorKey) ?? TYPE_GRADIENTS[acc.type] ?? '')
      : (TYPE_GRADIENTS[acc.type] ?? '');
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
  }, [isOpen, account?.id, liveCardColor]);

  const handleClose = useCallback(() => {
    const el = overlayRef.current;
    const cr = (() => {
      if (account) {
        const cardEl = document.querySelector(`[data-account-id="${account.id}"]`);
        if (cardEl) {
          const r = cardEl.getBoundingClientRect();
          if (r.width > 0) return r;
        }
      }
      return savedCardRect.current;
    })();

    setContentVisible(false);

    if (el && cr) {
      // Re-establish the full-screen clip as starting point (was cleared after open animation)
      el.style.transition = 'none';
      el.style.clipPath = FINAL_CLIP;
      forceReflow(el);
      el.style.transition = `clip-path ${SHRINK_MS}ms ${IOS_EASE}, left 300ms ease`;
      el.style.clipPath = getInitialClip(el, cr);
    }

    setTimeout(onClose, SHRINK_MS);
  }, [account, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [isOpen, handleClose]);

  // Close overlay first on account deletion; card animation is handled by BankAccountsSection
  useEffect(() => {
    if (!isOpen || !account) return;
    const onDeleted = (e: Event) => {
      if ((e as CustomEvent<{ accountId: string }>).detail?.accountId !== account.id) return;
      handleClose();
    };
    document.addEventListener('finance:account-deleted', onDeleted);
    return () => document.removeEventListener('finance:account-deleted', onDeleted);
  }, [isOpen, account, handleClose]);

  useEffect(() => {
    if (!isOpen || !account) return;
    const onPocketDeleted = (e: Event) => {
      const pocketId = (e as CustomEvent<{ pocketId: string }>).detail?.pocketId;
      const cardEl = document.querySelector<HTMLElement>(`[data-pocket-id="${pocketId}"]`);
      if (!cardEl) {
        router.refresh();
        return;
      }

      const isLastPocket = document.querySelectorAll('[data-pocket-id]').length === 1;

      const FADE_MS = 380;
      const COLLAPSE_MS = 320;
      const EASE_OUT = 'cubic-bezier(0.4, 0, 1, 1)';
      const EASE_INOUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

      const pocketWidth = cardEl.offsetWidth;

      cardEl.style.transition = `opacity ${FADE_MS}ms ${EASE_OUT}, transform ${FADE_MS}ms ${EASE_OUT}`;
      cardEl.style.opacity = '0';
      cardEl.style.transform = 'scale(0.88) translateY(-8px)';

      setTimeout(
        () =>
          handlePocketCollapsePhase(
            cardEl,
            pocketWidth,
            isLastPocket,
            COLLAPSE_MS,
            EASE_INOUT,
            router
          ),
        FADE_MS + 20
      );
    };
    document.addEventListener('finance:pocket-deleted', onPocketDeleted);
    return () => document.removeEventListener('finance:pocket-deleted', onPocketDeleted);
  }, [isOpen, account, router]);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Extract primitive id so useCallback/useEffect don't depend on the unstable account object
  const accountId = account?.id;

  const fetchTx = useCallback(async () => {
    if (!accountId) return;
    setIsLoading(true);
    const res = await getAccountTransactions({
      accountId,
      page,
      search: search || undefined,
      typeFilter: typeFilter || undefined,
    });
    if (res.success && res.data) {
      setTransactions(res.data.transactions as Transaction[]);
      setTotalPages(res.data.totalPages);
      setTotal(res.data.total);
    }
    setIsLoading(false);
  }, [accountId, page, search, typeFilter]);

  // Reset filters synchronously when the open account changes
  // (adjust-state-during-render). An rAF-delayed reset could clobber rows a
  // fast fetch already resolved.
  const [txResetKey, setTxResetKey] = useState<string | null>(null);
  if (isOpen && accountId && `${accountId}:${isOpen}` !== txResetKey) {
    setTxResetKey(`${accountId}:${isOpen}`);
    setSearch('');
    setTypeFilter('');
    setPage(1);
    setTransactions([]);
    setTotal(0);
  }

  useEffect(() => {
    if (!accountId || !isOpen) return;
    const t = setTimeout(fetchTx, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [accountId, page, search, typeFilter, isOpen, fetchTx]);

  if (!isOpen || !account || !cardRect) return null;

  const safeAcc = safeAccount(account);
  // Display balance: external balance + the sum of this account's pockets
  // (visual only — the stored balance is never modified).
  const totalBalanceCents = pockets.reduce(
    (sum, p) => addCents(sum, p.balanceCents),
    safeAcc.balanceCents
  );
  const light =
    (liveCardColor ?? safeAcc.cardColor) != null &&
    LIGHT_PRESET_KEYS.has(liveCardColor ?? safeAcc.cardColor ?? '');
  const network = (safeAcc.cardNetwork ?? 'NONE') as CardNetwork;
  const rateNumber = safeAcc.interestRateEA == null ? 0 : Number(safeAcc.interestRateEA);
  // T3: annual interest projection uses Decimal.js money utilities (Rule 1) instead
  // of a raw float expression. balanceCents * rate / 100 with Banker's rounding.
  const projected =
    rateNumber > 0
      ? formatMoney(
          divideCents(multiplyCents(safeAcc.balanceCents, rateNumber), 100),
          safeAcc.currency,
          locale
        )
      : '—';
  const cardBg = getCardBackgroundWithLive(safeAcc, liveCardColor);
  const accentColor = getAccentColor(safeAcc, liveCardColor);

  const inputCls =
    'bg-white/8 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-transparent transition-all';

  return (
    // Overlay starts at the sidebar's right edge — never covers the sidebar.
    // clip-path is computed relative to this element's bounding rect.
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
            background: getTopBarBackground(safeAcc, liveCardColor),
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
            <p className="text-sm font-semibold text-white truncate">{safeAcc.name}</p>
            <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider bg-white/15 text-white/80 px-2 py-0.5 rounded-full">
              {getLabel(dictionary, `detail.accountTypeLabels.${safeAcc.type}`, safeAcc.type)}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(safeAcc.id)}
              aria-label={get(dictionary, 'detail.edit')}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(safeAcc.id, safeAcc.name)}
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
                      <p className="text-[10px] opacity-70 truncate">{safeAcc.name}</p>
                      <p className="text-sm font-bold">{safeAcc.currency}</p>
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
                {getLabel(dictionary, `detail.accountTypeLabels.${safeAcc.type}`, safeAcc.type)}
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-6 leading-tight">
                {safeAcc.name}
              </h1>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
                {[
                  {
                    label: get(dictionary, 'detail.currentBalance'),
                    value: formatMoney(totalBalanceCents, safeAcc.currency, locale),
                  },
                  {
                    label: get(dictionary, 'detail.rateEA'),
                    value: rateNumber > 0 ? `${rateNumber.toFixed(2)}%` : '—',
                  },
                  { label: get(dictionary, 'detail.annualInterest'), value: projected },
                  {
                    label: get(dictionary, 'detail.since'),
                    value: formatDate(safeAcc.createdAt, locale),
                  },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[10px] uppercase tracking-widest text-white/40 font-medium mb-1">
                      {label}
                    </p>
                    <p className="text-lg font-bold text-white leading-tight">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 lg:px-12 pb-12 space-y-8">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4" style={{ color: accentColor }} />
                <h2 className="text-sm font-semibold text-white">
                  {get(dictionary, 'detail.pockets')}
                </h2>
                <span className="text-[10px] bg-white/10 text-white/60 px-2 py-0.5 rounded-full">
                  {pockets.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onCreatePocket(safeAcc.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ backgroundColor: `${accentColor}26`, color: accentColor }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${accentColor}40`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${accentColor}26`;
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                {get(dictionary, 'detail.addPocket')}
              </button>
            </div>
            {pockets.length > 0 ? (
              <div
                data-pockets-list
                className="flex gap-3 overflow-x-auto pb-1 -mx-4 sm:mx-0 px-4 sm:px-0"
              >
                {pockets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    data-pocket-id={p.id}
                    onClick={() => setSelectedPocket(p)}
                    className="relative group flex-shrink-0 rounded-xl p-4 flex flex-col justify-between border border-white/10 text-left transition-transform hover:scale-[1.03] active:scale-[0.97] cursor-pointer"
                    style={{ width: 160, height: 80, background: TYPE_GRADIENTS.POCKET + 'cc' }}
                  >
                    <p className="text-xs font-semibold text-white/80 truncate pr-4">{p.name}</p>
                    <p className="text-sm font-bold text-white">
                      {formatMoney(p.balanceCents, p.currency, locale)}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-white/30 py-1">{get(dictionary, 'detail.noPockets')}</p>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-white">
                {get(dictionary, 'detail.movements')}
              </h2>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder={get(dictionary, 'detail.searchPlaceholder')}
                  className={`${inputCls} w-full pl-9 pr-4 py-2.5 text-sm`}
                />
              </div>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(1);
                }}
                className={`${inputCls} px-3 py-2.5 text-sm appearance-none min-w-[160px]`}
              >
                <option value="" className="bg-slate-900">
                  {get(dictionary, 'detail.allTypes')}
                </option>
                {TX_TYPES.map((t) => (
                  <option key={t} value={t} className="bg-slate-900">
                    {getLabel(dictionary, `detail.typeLabels.${t}`, t)}
                  </option>
                ))}
              </select>
            </div>

            {!isLoading && (
              <p className="text-[11px] text-white/30">
                {total}{' '}
                {total === 1
                  ? get(dictionary, 'detail.movement')
                  : get(dictionary, 'detail.movementsPlural')}
                {search || typeFilter ? ` ${get(dictionary, 'detail.found')}` : ''}
              </p>
            )}

            <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.02]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="border-b border-white/8">
                      {[
                        { key: 'date', label: get(dictionary, 'detail.date') },
                        { key: 'description', label: get(dictionary, 'detail.description') },
                        { key: 'type', label: get(dictionary, 'detail.type') },
                        { key: 'amount', label: get(dictionary, 'detail.amount') },
                      ].map(({ key, label }, i) => (
                        <th
                          key={key}
                          className={`text-left text-[10px] uppercase tracking-widest text-white/40 font-semibold px-4 py-3.5 ${getHeaderAlignClass(i)}`}
                          style={{ minWidth: getHeaderMinWidth(i) }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <TxTableBody
                      isLoading={isLoading}
                      transactions={transactions}
                      locale={locale}
                      dictionary={dictionary}
                    />
                  </tbody>
                </table>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || isLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white/60 bg-white/6 hover:bg-white/12 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  {get(dictionary, 'detail.prev')}
                </button>
                <span className="text-xs text-white/40 min-w-[80px] text-center">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || isLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white/60 bg-white/6 hover:bg-white/12 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {get(dictionary, 'detail.next')}
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </section>
        </div>
      </div>

      <PocketDetailModal
        pocket={selectedPocket}
        dictionary={dictionary}
        locale={locale}
        onClose={() => setSelectedPocket(null)}
        onEdit={onEditPocket}
        onDelete={(id, name) => onDeletePocket?.(id, name)}
      />
    </div>
  );
}
