'use client';

import { useRef, useState, useMemo, useEffect } from 'react';
import { ChevronDown, Wallet, Landmark } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import type { AccountBrief } from './types';

interface AccountSelectProps {
  id: string;
  value: string;
  onChange: (accountId: string) => void;
  placeholder: string;
  accountsGroupLabel: string;
  pocketsGroupLabel: string;
  accounts: AccountBrief[]; // cuentas (no-bolsillo)
  pockets: AccountBrief[]; // bolsillos
  /** Map accountId -> account name, used to resolve each pocket's parent account. */
  parentNameById?: Record<string, string>;
  showBalance?: boolean;
  disabled?: boolean;
  locale?: string;
  hasError?: boolean;
  ariaDescribedBy?: string;
}

type Option = AccountBrief & { isPocket: boolean };

export function AccountSelect({
  id,
  value,
  onChange,
  placeholder,
  accountsGroupLabel,
  pocketsGroupLabel,
  accounts,
  pockets,
  parentNameById,
  showBalance = false,
  disabled = false,
  locale = 'es-CO',
  hasError = false,
  ariaDescribedBy,
}: Readonly<AccountSelectProps>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const allOptions = useMemo<Option[]>(
    () => [
      ...accounts.map((a) => ({ ...a, isPocket: false })),
      ...pockets.map((a) => ({ ...a, isPocket: true })),
    ],
    [accounts, pockets]
  );
  const selected = allOptions.find((o) => o.id === value);
  const selectedParentName = selected
    ? parentNameById?.[selected.parentAccountId ?? '']
    : undefined;

  // Cerrar al hacer clic fuera o con Escape
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Resetear highlight al abrir el dropdown (los options cambian mientras el
  // modal está abierto; el highlight se limpia en cada apertura)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setHighlight(0);
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(allOptions.length - 1, Math.max(0, h + 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, Math.min(allOptions.length - 1, h - 1)));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const opt = allOptions[Math.min(highlight, allOptions.length - 1)];
      if (opt) {
        onChange(opt.id);
        setOpen(false);
      }
    }
  };

  // Custom combobox following the WAI-ARIA APG pattern: the listbox/option roles
  // below are intentional (see sonar-project.properties S6819 exclusion) — a
  // native <option>/<select> cannot render our grouped dark UI.
  function renderOption(opt: AccountBrief, isPocket: boolean) {
    const isSelected = opt.id === value;
    const isHighlighted = opt.id === allOptions[highlight]?.id;
    const parentName = isPocket ? parentNameById?.[opt.parentAccountId ?? ''] : undefined;
    return (
      <button
        key={opt.id}
        type="button"
        role="option"
        aria-selected={isSelected}
        id={`${id}-opt-${opt.id}`}
        onClick={() => {
          onChange(opt.id);
          setOpen(false);
        }}
        onMouseEnter={() => setHighlight(allOptions.findIndex((o) => o.id === opt.id))}
        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
          isHighlighted ? 'bg-white/8' : ''
        } ${isSelected ? 'text-white' : 'text-slate-200 hover:text-white'}`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className={`flex-shrink-0 ${isPocket ? 'text-amber-400' : 'text-blue-400'}`}>
            {isPocket ? <Wallet className="w-3.5 h-3.5" /> : <Landmark className="w-3.5 h-3.5" />}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate">{opt.name}</span>
              <span className="text-slate-500 text-xs">({opt.currency})</span>
            </span>
            {isPocket && parentName && (
              <span className="block text-[10px] font-medium text-amber-400/80 truncate">
                {parentName}
              </span>
            )}
          </span>
        </span>
        {showBalance && (
          <span className="flex-shrink-0 text-xs font-mono tabular-nums text-slate-400">
            {formatMoney(opt.balanceCents, opt.currency, locale)}
          </span>
        )}
      </button>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-invalid={hasError || undefined}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        onClick={() => {
          if (!open) setHighlight(0);
          setOpen((o) => !o);
        }}
        onKeyDown={handleKeyDown}
        className="w-full flex items-center justify-between gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="min-w-0 flex-1 text-left">
          <span className={`block truncate ${selected ? 'text-white' : 'text-slate-500'}`}>
            {selected ? selected.name : placeholder}
            {selected && <span className="text-slate-500 ml-1">({selected.currency})</span>}
          </span>
          {selected?.isPocket && selectedParentName && (
            <span className="block text-[10px] font-medium text-amber-400/80 truncate">
              {selectedParentName}
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          aria-label={placeholder}
          className="absolute z-30 mt-2 w-full max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-md shadow-2xl"
        >
          {accounts.length > 0 && (
            <div className="sticky top-0 bg-slate-900/95 backdrop-blur-md px-3 pt-2 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">
                {accountsGroupLabel}
              </p>
            </div>
          )}
          {accounts.map((a) => renderOption(a, false))}
          {accounts.length > 0 && pockets.length > 0 && (
            <div className="mx-3 my-1 h-px bg-white/8" aria-hidden="true" />
          )}
          {pockets.length > 0 && (
            <div className="sticky top-0 bg-slate-900/95 backdrop-blur-md px-3 pt-2 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                {pocketsGroupLabel}
              </p>
            </div>
          )}
          {pockets.map((a) => renderOption(a, true))}
        </div>
      )}
    </div>
  );
}
