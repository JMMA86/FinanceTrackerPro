'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { X, RefreshCw, CheckCircle2 } from 'lucide-react';
import { getCurrentExchangeRate, getInvestmentAccounts } from '@/actions/investment.actions';
import { getBankAccounts } from '@/actions/account.actions';
import type { AccountCardData } from '@/components/accounts/AccountCard';
import { get } from '@/lib/i18n';
import { isPocket } from '@/components/transactions/transferRules';
import type { AccountBrief } from '@/components/transactions/types';
import type { InvestmentAccountSummary } from './InvestmentAccountCard';

/** Map a server action error code to a localized message (shared by Deposit/Withdraw). */
export function getInvestmentFxError(
  code: string | undefined,
  dictionary: Record<string, unknown>,
  fallbackKey = 'errors.depositFailed'
): string {
  switch (code) {
    case 'SESSION_INVALID':
      return get(dictionary, 'errors.sessionInvalid');
    case 'INSUFFICIENT_FUNDS':
      return get(dictionary, 'errors.insufficientFunds');
    case 'RATE_MISMATCH':
      return get(dictionary, 'errors.rateMismatch');
    case 'RATE_LIMITED':
      return get(dictionary, 'errors.rateLimited');
    case 'CURRENCY_MISMATCH':
      return get(dictionary, 'errors.currencyMismatch');
    default:
      return get(dictionary, fallbackKey);
  }
}

/** Project an account DTO onto the AccountBrief shape consumed by AccountSelect. */
export function toAccountBrief(account: {
  id: string;
  name: string;
  currency: string;
  balanceCents: number;
  type?: string;
  parentAccountId?: string | null;
}): AccountBrief {
  return {
    id: account.id,
    name: account.name,
    currency: account.currency,
    type: account.type ?? 'CHECKING',
    parentAccountId: account.parentAccountId ?? null,
    balanceCents: account.balanceCents,
  };
}

/** Shared form styles for the investment modals. */
export const modalInputCls =
  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-transparent transition-all';
export const modalLabelCls =
  'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';

/**
 * Manages the <dialog> lifecycle shared by the investment modals: opening with
 * the 240ms close animation, focus save/restore (WCAG 2.2 AA) and close
 * handlers wired to the underlying dialog `close` event.
 */
export function useInvestmentModalShell(isOpen: boolean, closeModal: () => void) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      // Save the element that had focus before opening for restoration on close
      const active = document.activeElement;
      previousFocusRef.current = active instanceof HTMLElement ? active : null;
      dialog.showModal();
      // Deferred so the browser paints the hidden state before the enter animation.
      const id = requestAnimationFrame(() => setIsVisible(true));
      return () => cancelAnimationFrame(id);
    } else if (dialog.open) {
      setIsVisible(false);
      const id = setTimeout(() => {
        if (dialog.open) dialog.close();
      }, 240);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    setIsVisible(false);
    setTimeout(() => {
      if (dialog.open) dialog.close();
    }, 240);
  }, []);

  const handleDialogClose = useCallback(() => {
    closeModal();
    // Best-effort focus restoration (WCAG 2.2 AA): restore focus to the
    // element that opened the modal if it is still connected to the document.
    const prev = previousFocusRef.current;
    if (prev && document.body.contains(prev)) {
      prev.focus();
    }
    previousFocusRef.current = null;
  }, [closeModal]);

  return { dialogRef, isVisible, handleClose, handleDialogClose };
}

/**
 * Loads the investment + COP bank accounts in parallel, exposes the grouped
 * AccountBrief lists consumed by AccountSelect and applies the
 * `modalData.accountId` prefill. `modalSession` bumps on every open so the
 * AccountSelects remount fresh.
 */
export function useInvestmentAccountOptions(isOpen: boolean, prefillAccountId?: string) {
  const [investmentAccounts, setInvestmentAccounts] = useState<InvestmentAccountSummary[]>([]);
  const [bankAccounts, setBankAccounts] = useState<AccountCardData[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [modalSession, setModalSession] = useState(0);
  const [selectedInvestmentAccount, setSelectedInvestmentAccount] = useState('');
  const [selectedBankAccount, setSelectedBankAccount] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const id = requestAnimationFrame(() => {
      setModalSession((s) => s + 1);
    });

    async function load() {
      setLoadingAccounts(true);
      try {
        const [invRes, bankRes] = await Promise.all([
          getInvestmentAccounts({} as Record<string, never>),
          getBankAccounts({} as Record<string, never>),
        ]);

        if (cancelled) return;

        if (invRes.success && invRes.data) {
          const accounts = invRes.data;
          setInvestmentAccounts(accounts);
          if (prefillAccountId && accounts.some((a) => a.id === prefillAccountId)) {
            setSelectedInvestmentAccount(prefillAccountId);
          } else if (accounts.length > 0) {
            setSelectedInvestmentAccount(accounts[0].id);
          }
        }

        if (bankRes.success && bankRes.data) {
          const banks = (bankRes.data as AccountCardData[]).filter(
            (a) =>
              a.currency === 'COP' && ['CHECKING', 'CASH', 'SAVINGS', 'POCKET'].includes(a.type)
          );
          setBankAccounts(banks);
          if (banks.length > 0) {
            setSelectedBankAccount(banks[0].id);
          }
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoadingAccounts(false);
      }
    }

    load();

    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [isOpen, prefillAccountId]);

  // Grouped COP bank accounts (accounts + pockets) for the AccountSelect.
  const bankAccountBriefs = useMemo<AccountBrief[]>(
    () => bankAccounts.map(toAccountBrief),
    [bankAccounts]
  );
  const bankAccountsNonPocket = useMemo(
    () => bankAccountBriefs.filter((a) => !isPocket(a)),
    [bankAccountBriefs]
  );
  const bankPockets = useMemo(
    () => bankAccountBriefs.filter((a) => isPocket(a)),
    [bankAccountBriefs]
  );
  const parentNameById = useMemo(
    () => Object.fromEntries(bankAccountBriefs.map((a) => [a.id, a.name])),
    [bankAccountBriefs]
  );

  const investmentAccountBriefs = useMemo<AccountBrief[]>(
    () =>
      investmentAccounts.map((a) => ({
        id: a.id,
        name: a.name,
        currency: a.currency,
        type: 'INVESTMENT',
        parentAccountId: null,
        balanceCents: a.balanceCents,
      })),
    [investmentAccounts]
  );

  return {
    investmentAccounts,
    bankAccounts,
    loadingAccounts,
    modalSession,
    selectedInvestmentAccount,
    setSelectedInvestmentAccount,
    selectedBankAccount,
    setSelectedBankAccount,
    investmentAccountBriefs,
    bankAccountsNonPocket,
    bankPockets,
    parentNameById,
  };
}

/**
 * Exchange-rate state + live FX refresh (best-effort, never throws).
 * Auto-refreshes (deferred via rAF) whenever the modal opens or the target
 * currency changes.
 */
export function useExchangeRate(currency: string | undefined, isOpen: boolean) {
  const [exchangeRate, setExchangeRate] = useState(3900);
  const [rateSource, setRateSource] = useState<'live' | 'unavailable' | null>(null);
  const [fetchingRate, setFetchingRate] = useState(false);

  const refreshExchangeRate = useCallback(async (targetCurrency: string) => {
    if (!targetCurrency) return;
    setFetchingRate(true);
    try {
      const res = await getCurrentExchangeRate({ currency: targetCurrency as 'USD' | 'EUR' });
      if (res.success && res.data?.rate != null) {
        setExchangeRate(res.data.rate);
        setRateSource(res.data.source);
      } else {
        setRateSource('unavailable');
      }
    } catch {
      // FX provider unavailable — keep the editable rate untouched.
      setRateSource('unavailable');
    } finally {
      setFetchingRate(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !currency) return;
    const id = requestAnimationFrame(() => {
      refreshExchangeRate(currency);
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, currency, refreshExchangeRate]);

  return {
    exchangeRate,
    setExchangeRate,
    rateSource,
    setRateSource,
    fetchingRate,
    refreshExchangeRate,
  };
}

/** Input + refresh button + "Tasa actual" badge + hint. Ids preserve `dep-rate`/`wd-rate`. */
export function ExchangeRateField({
  id,
  dictionary,
  value,
  onChange,
  rateSource,
  fetchingRate,
  canRefresh,
  onRefresh,
}: Readonly<{
  id: string;
  dictionary: Record<string, unknown>;
  value: number;
  onChange: (v: number) => void;
  rateSource: 'live' | 'unavailable' | null;
  fetchingRate: boolean;
  canRefresh: boolean;
  onRefresh: () => void;
}>) {
  return (
    <div>
      <label htmlFor={id} className={modalLabelCls}>
        {get(dictionary, 'exchangeRate')}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          placeholder="3900"
          aria-describedby={`${id}-hint`}
          className={`${modalInputCls} font-mono tabular-nums pr-10`}
        />
        <button
          type="button"
          onClick={onRefresh}
          disabled={fetchingRate || !canRefresh}
          aria-label={get(dictionary, 'refreshRate')}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/8 disabled:opacity-40 transition-colors"
        >
          <RefreshCw
            className={`w-4 h-4 ${fetchingRate ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>
      {rateSource === 'live' && (
        <p className="mt-1 text-xs text-emerald-400 inline-flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
          {get(dictionary, 'liveRate')}
        </p>
      )}
      <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
        {get(dictionary, 'exchangeRateHint')}
      </p>
    </div>
  );
}

/** Shared <dialog> shell: backdrop + panel + header + 240ms enter/exit animation. */
export function InvestmentModalShell({
  dialogRef,
  isVisible,
  onClose,
  onDialogClose,
  titleId,
  title,
  children,
}: Readonly<{
  dialogRef: RefObject<HTMLDialogElement | null>;
  isVisible: boolean;
  onClose: () => void;
  onDialogClose: () => void;
  titleId: string;
  title: string;
  children: ReactNode;
}>) {
  return (
    <dialog
      ref={dialogRef}
      onClose={onDialogClose}
      aria-modal="true"
      aria-labelledby={titleId}
      className="bg-transparent border-none m-0 h-full w-full max-w-full max-h-full backdrop:bg-transparent open:flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
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
          <h2 id={titleId} className="text-base font-semibold text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {children}
      </div>
    </dialog>
  );
}
