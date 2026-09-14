'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingBasket, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { get } from '@/lib/i18n';
import type {
  VariableExpenseDefinition,
  VariableExpensesOverviewResponse,
} from '@/types/variable-expense';
import { VariableExpensesOverviewCards } from './VariableExpensesOverviewCards';
import { VariableExpenseDefinitionList } from './VariableExpenseDefinitionList';
import { VariableExpenseDefinitionModal } from './VariableExpenseDefinitionModal';
import { RegisterVariableExpenseModal } from './RegisterVariableExpenseModal';
import { DeleteVariableExpenseModal } from './DeleteVariableExpenseModal';
import { VariableExpenseDetail } from './VariableExpenseDetail';

interface VariableExpensesViewProps {
  month: number;
  year: number;
  locale: string;
  /** Variable-expenses dictionary. */
  dictionary: Record<string, unknown>;
  /** Transactions dictionary (error mapping in the register modal). */
  transactionsDictionary: Record<string, unknown>;
  overview: VariableExpensesOverviewResponse | null;
  definitions: VariableExpenseDefinition[];
  overviewError: string | null;
  definitionsError: string | null;
}

interface RegisterState {
  open: boolean;
  definition: VariableExpenseDefinition | null;
}

/**
 * Client orchestrator for the variable-expenses page: month navigation
 * (search-param driven RSC re-render), modal state and a coalesced
 * router.refresh() after mutations. All data arrives as server props.
 */
export function VariableExpensesView({
  month,
  year,
  locale,
  dictionary,
  transactionsDictionary,
  overview,
  definitions,
  overviewError,
  definitionsError,
}: Readonly<VariableExpensesViewProps>) {
  const router = useRouter();

  const [showDefinitionModal, setShowDefinitionModal] = useState(false);
  const [editingDefinition, setEditingDefinition] = useState<VariableExpenseDefinition | null>(
    null
  );
  const [deletingDefinition, setDeletingDefinition] = useState<VariableExpenseDefinition | null>(
    null
  );
  const [registerState, setRegisterState] = useState<RegisterState>({
    open: false,
    definition: null,
  });
  const [detailDefinition, setDetailDefinition] = useState<VariableExpenseDefinition | null>(null);

  const lastRefreshAtRef = useRef(0);

  const refreshOnce = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < 1000) return;
    lastRefreshAtRef.current = now;
    router.refresh();
  }, [router]);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
        new Date(year, month - 1, 1)
      ),
    [locale, month, year]
  );

  const goToMonth = useCallback(
    (delta: number) => {
      const target = new Date(year, month - 1 + delta, 1);
      router.push(`?month=${target.getMonth() + 1}&year=${target.getFullYear()}`);
    },
    [router, month, year]
  );

  const openCreateDefinition = useCallback(() => {
    lastRefreshAtRef.current = 0;
    setEditingDefinition(null);
    setShowDefinitionModal(true);
  }, []);

  const openEditDefinition = useCallback((definition: VariableExpenseDefinition) => {
    lastRefreshAtRef.current = 0;
    setEditingDefinition(definition);
    setShowDefinitionModal(false);
  }, []);

  const closeDefinitionModal = useCallback(() => {
    setShowDefinitionModal(false);
    setEditingDefinition(null);
  }, []);

  const openRegister = useCallback((definition: VariableExpenseDefinition | null) => {
    lastRefreshAtRef.current = 0;
    setRegisterState({ open: true, definition });
  }, []);

  const closeRegister = useCallback(() => {
    setRegisterState({ open: false, definition: null });
  }, []);

  const handleRegisterSuccess = useCallback(() => refreshOnce(), [refreshOnce]);

  const openDeleteDefinition = useCallback((definition: VariableExpenseDefinition) => {
    lastRefreshAtRef.current = 0;
    setDeletingDefinition(definition);
  }, []);

  const closeDeleteDefinition = useCallback(() => setDeletingDefinition(null), []);

  const openDetail = useCallback((definition: VariableExpenseDefinition) => {
    setDetailDefinition(definition);
  }, []);

  const closeDetail = useCallback(() => setDetailDefinition(null), []);

  const closeWithRefresh = useCallback(() => {
    closeDefinitionModal();
    refreshOnce();
  }, [closeDefinitionModal, refreshOnce]);

  const closeDeleteWithRefresh = useCallback(() => {
    setDeletingDefinition(null);
    refreshOnce();
  }, [refreshOnce]);

  const buckets = overview?.byCurrency ?? [];

  return (
    <>
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-teal-500/15 text-teal-400">
            <ShoppingBasket className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">{get(dictionary, 'title')}</h1>
            <p className="text-sm text-slate-400">{get(dictionary, 'subtitle')}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Month navigation */}
          <div className="inline-flex items-center gap-1 rounded-xl bg-white/5 p-1">
            <button
              type="button"
              onClick={() => goToMonth(-1)}
              aria-label={get(dictionary, 'previousMonth')}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <span
              aria-live="polite"
              className="px-2 min-w-[9rem] text-center text-sm font-semibold text-white capitalize"
            >
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={() => goToMonth(1)}
              aria-label={get(dictionary, 'nextMonth')}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={openCreateDefinition}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {get(dictionary, 'newDefinition')}
          </button>

          <button
            type="button"
            onClick={() => openRegister(null)}
            disabled={definitions.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/10 text-white text-sm font-semibold hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {get(dictionary, 'registerExpense')}
          </button>
        </div>
      </header>

      {/* Overview (per currency) */}
      <VariableExpensesOverviewCards
        buckets={buckets}
        error={overviewError}
        dictionary={dictionary}
        locale={locale}
      />

      {/* Definitions */}
      <VariableExpenseDefinitionList
        definitions={definitions}
        buckets={buckets}
        error={definitionsError}
        dictionary={dictionary}
        locale={locale}
        onRegister={openRegister}
        onOpenDetail={openDetail}
        onEdit={openEditDefinition}
        onDelete={openDeleteDefinition}
      />

      {/* Modals */}
      <VariableExpenseDefinitionModal
        isOpen={showDefinitionModal || editingDefinition !== null}
        definition={editingDefinition}
        dictionary={dictionary}
        locale={locale}
        onClose={closeDefinitionModal}
        onSuccess={closeWithRefresh}
      />

      <RegisterVariableExpenseModal
        isOpen={registerState.open}
        definition={registerState.definition}
        definitions={definitions}
        dictionary={dictionary}
        transactionsDictionary={transactionsDictionary}
        locale={locale}
        onClose={closeRegister}
        onSuccess={handleRegisterSuccess}
      />

      {deletingDefinition && (
        <DeleteVariableExpenseModal
          isOpen
          definition={deletingDefinition}
          dictionary={dictionary}
          onClose={closeDeleteDefinition}
          onSuccess={closeDeleteWithRefresh}
        />
      )}

      {detailDefinition && (
        <VariableExpenseDetail
          isOpen
          definition={detailDefinition}
          definitions={definitions}
          month={month}
          year={year}
          dictionary={dictionary}
          locale={locale}
          onClose={closeDetail}
        />
      )}
    </>
  );
}
