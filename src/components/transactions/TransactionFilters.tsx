'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { get } from '@/lib/i18n';

interface TransactionFiltersProps {
  dictionary: Record<string, unknown>;
}

const TRANSACTION_TYPES = [
  { value: '', labelKey: 'allTypes' },
  { value: 'INCOME', labelKey: 'income' },
  { value: 'EXPENSE', labelKey: 'expense' },
  { value: 'TRANSFER_IN', labelKey: 'transferIn' },
  { value: 'TRANSFER_OUT', labelKey: 'transferOut' },
  { value: 'INVESTMENT', labelKey: 'investment' },
  { value: 'LOAN_PAYMENT', labelKey: 'loanPayment' },
  { value: 'CREDIT_PAYMENT', labelKey: 'creditPayment' },
] as const;

export function TransactionFilters({ dictionary }: Readonly<TransactionFiltersProps>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Local search state for debounce input. When null, use URL value as source of truth.
  const [localSearch, setLocalSearch] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Display value: local editing state takes precedence, otherwise read from URL
  const displaySearch = localSearch ?? searchParams.get('search') ?? '';

  const buildHref = useCallback(
    (params: Record<string, string | undefined>) => {
      const current = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === '') {
          current.delete(key);
        } else {
          current.set(key, value);
        }
      }
      // Reset to page 1 on filter change
      current.delete('page');
      const query = current.toString();
      const queryStr = query ? `?${query}` : '';
      return `${pathname}${queryStr}`;
    },
    [pathname, searchParams]
  );

  const navigate = useCallback(
    (params: Record<string, string | undefined>) => {
      router.push(buildHref(params));
    },
    [router, buildHref]
  );

  // Debounced search
  const handleSearchChange = useCallback(
    (value: string) => {
      setLocalSearch(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        // Commit to URL and clear local state (so URL becomes source of truth)
        setLocalSearch(null);
        navigate({ search: value || undefined });
      }, 300);
    },
    [navigate]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleTypeChange = useCallback(
    (type: string) => {
      navigate({ type: type || undefined });
    },
    [navigate]
  );

  const handleDateFromChange = useCallback(
    (date: string) => {
      navigate({ dateFrom: date || undefined });
    },
    [navigate]
  );

  const handleDateToChange = useCallback(
    (date: string) => {
      navigate({ dateTo: date || undefined });
    },
    [navigate]
  );

  const handleClear = useCallback(() => {
    setLocalSearch(null);
    router.push(pathname);
  }, [router, pathname]);

  const hasActiveFilters =
    searchParams.has('search') ||
    searchParams.has('type') ||
    searchParams.has('dateFrom') ||
    searchParams.has('dateTo');

  const inputCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all';
  const selectCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all appearance-none';
  const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';

  return (
    <div
      className="app-shell rounded-2xl p-5 space-y-4"
      role="search"
      aria-label={get(dictionary, 'filters')}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Search */}
        <div className="relative">
          <label htmlFor="tx-search" className={labelCls}>
            {get(dictionary, 'description')}
          </label>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="tx-search"
              type="text"
              value={displaySearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={get(dictionary, 'searchPlaceholder')}
              className={`${inputCls} pl-10`}
              aria-label={get(dictionary, 'searchPlaceholder')}
              autoComplete="off"
            />
            {displaySearch && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Type filter */}
        <div>
          <label htmlFor="tx-type" className={labelCls}>
            {get(dictionary, 'type')}
          </label>
          <select
            id="tx-type"
            value={searchParams.get('type') ?? ''}
            onChange={(e) => handleTypeChange(e.target.value)}
            className={selectCls}
            aria-label={get(dictionary, 'type')}
          >
            {TRANSACTION_TYPES.map((t) => (
              <option key={t.value} value={t.value} className="bg-slate-800">
                {get(dictionary, t.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* Date from */}
        <div>
          <label htmlFor="tx-date-from" className={labelCls}>
            {get(dictionary, 'dateFrom')}
          </label>
          <input
            id="tx-date-from"
            type="date"
            value={searchParams.get('dateFrom') ?? ''}
            onChange={(e) => handleDateFromChange(e.target.value)}
            className={inputCls}
            aria-label={get(dictionary, 'dateFrom')}
          />
        </div>

        {/* Date to */}
        <div>
          <label htmlFor="tx-date-to" className={labelCls}>
            {get(dictionary, 'dateTo')}
          </label>
          <input
            id="tx-date-to"
            type="date"
            value={searchParams.get('dateTo') ?? ''}
            onChange={(e) => handleDateToChange(e.target.value)}
            className={inputCls}
            aria-label={get(dictionary, 'dateTo')}
          />
        </div>
      </div>

      {/* Clear filters */}
      {hasActiveFilters && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-lg px-2 py-1"
          >
            <X className="w-3 h-3" aria-hidden="true" />
            {get(dictionary, 'clearFilters')}
          </button>
        </div>
      )}
    </div>
  );
}
