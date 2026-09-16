'use client';

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, LayoutGrid, CalendarDays, AlertTriangle, ReceiptText } from 'lucide-react';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type {
  FixedExpensePaymentSerialized,
  FixedExpenseWithPayments,
} from '@/types/fixed-expense';
import { FixedExpenseCard } from './FixedExpenseCard';
import { FixedExpensesCalendar } from './FixedExpensesCalendar';
import { CreateFixedExpenseModal } from './CreateFixedExpenseModal';
import { EditFixedExpenseModal } from './EditFixedExpenseModal';
import { PayFixedExpenseModal } from './PayFixedExpenseModal';
import { DeleteFixedExpenseModal } from './DeleteFixedExpenseModal';
import {
  comparePaymentsByDueDate,
  getPaymentStatus,
  type FixedExpensePaymentStatus,
} from './constants';

type ViewMode = 'cards' | 'calendar';

type UpcomingRange = 'week' | 'month' | 'quarter';

const UPCOMING_RANGES: Array<{ value: UpcomingRange; labelKey: string; days: number }> = [
  { value: 'week', labelKey: 'rangeWeek', days: 7 },
  { value: 'month', labelKey: 'rangeMonth', days: 30 },
  { value: 'quarter', labelKey: 'rangeQuarter', days: 90 },
];

const UPCOMING_LIMIT = 10;

interface PayTarget {
  expense: FixedExpenseWithPayments;
  payment: FixedExpensePaymentSerialized;
}

interface FixedExpensesViewProps {
  /** Templates + materialized payments loaded on the server page. */
  expenses: FixedExpenseWithPayments[];
  /** Resolved error message (i18n) when the server fetch failed, else null. */
  loadError: string | null;
  dictionary: Record<string, unknown>;
  locale: string;
  /** Reference "today" (ISO timestamp) for stable status during SSR/hydration. */
  todayStartIso: string;
  /** `YYYY-MM-DD` default for the create form (server-computed, no SSR drift). */
  todayDate: string;
}

const STATUS_TEXT: Record<FixedExpensePaymentStatus, string> = {
  paid: 'text-emerald-400',
  overdue: 'text-red-400',
  pending: 'text-amber-400',
};

function formatShortDate(value: Date | string, locale: string): string {
  return new Date(value).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Client orchestrator for the fixed-expenses page: view toggle (cards /
 * calendar), modal state and the upcoming-payments sidebar. Data always comes
 * from the server props; every mutation triggers a coalesced router.refresh()
 * so the RSC re-runs the data module.
 */
export function FixedExpensesView({
  expenses,
  loadError,
  dictionary,
  locale,
  todayStartIso,
  todayDate,
}: Readonly<FixedExpensesViewProps>) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>('cards');
  const [upcomingRange, setUpcomingRange] = useState<UpcomingRange>('month');
  const [showCreate, setShowCreate] = useState(false);
  const [editingExpense, setEditingExpense] = useState<FixedExpenseWithPayments | null>(null);
  const [paying, setPaying] = useState<PayTarget | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<FixedExpenseWithPayments | null>(null);

  // Each modal may call onClose() twice per cycle (submit + native 'close'
  // event). Coalesce the duplicate so overlapping refreshes never race; the
  // guard resets whenever a modal opens so consecutive mutations still refresh.
  const lastRefreshAtRef = useRef(0);
  const refreshOnce = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < 1000) return;
    lastRefreshAtRef.current = now;
    router.refresh();
  }, [router]);

  const todayStart = useMemo(() => new Date(todayStartIso), [todayStartIso]);

  const rangeDays =
    UPCOMING_RANGES.find((range) => range.value === upcomingRange)?.days ?? UPCOMING_RANGES[1].days;

  const upcoming = useMemo(() => {
    const startTime = todayStart.getTime();
    const end = new Date(todayStart);
    end.setDate(end.getDate() + rangeDays);
    const endTime = end.getTime();

    return expenses
      .flatMap((expense) => expense.payments.map((payment) => ({ expense, payment })))
      .filter(({ payment }) => {
        if (payment.paidDate != null) return false;
        const dueTime = new Date(payment.dueDate).getTime();
        return dueTime >= startTime && dueTime <= endTime;
      })
      .sort((a, b) => comparePaymentsByDueDate(a.payment, b.payment))
      .slice(0, UPCOMING_LIMIT);
  }, [expenses, todayStart, rangeDays]);

  const overdueCount = useMemo(
    () =>
      expenses.reduce(
        (count, expense) =>
          count +
          expense.payments.filter((payment) => getPaymentStatus(payment, todayStart) === 'overdue')
            .length,
        0
      ),
    [expenses, todayStart]
  );

  const openCreate = useCallback(() => {
    lastRefreshAtRef.current = 0;
    setShowCreate(true);
  }, []);

  const handleEdit = useCallback((expense: FixedExpenseWithPayments) => {
    lastRefreshAtRef.current = 0;
    setEditingExpense(expense);
  }, []);

  const handleDelete = useCallback((expense: FixedExpenseWithPayments) => {
    lastRefreshAtRef.current = 0;
    setDeletingExpense(expense);
  }, []);

  const handlePay = useCallback(
    (expense: FixedExpenseWithPayments, payment: FixedExpensePaymentSerialized) => {
      lastRefreshAtRef.current = 0;
      setPaying({ expense, payment });
    },
    []
  );

  const closeCreate = useCallback(() => {
    setShowCreate(false);
    refreshOnce();
  }, [refreshOnce]);
  const closeEdit = useCallback(() => {
    setEditingExpense(null);
    refreshOnce();
  }, [refreshOnce]);
  const closePay = useCallback(() => {
    setPaying(null);
    refreshOnce();
  }, [refreshOnce]);
  const closeDelete = useCallback(() => {
    setDeletingExpense(null);
    refreshOnce();
  }, [refreshOnce]);

  if (loadError) {
    return (
      <div role="alert" className="app-shell rounded-2xl p-6 text-center">
        <p className="text-sm text-red-400">{loadError}</p>
        <button
          type="button"
          onClick={refreshOnce}
          className="mt-3 px-4 py-2 rounded-xl bg-white/5 text-sm text-slate-300 hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          {get(dictionary, 'retry')}
        </button>
      </div>
    );
  }

  const isEmpty = expenses.length === 0;

  // Resolve the main panel with independent statements instead of a nested
  // ternary (keeps the render tree readable and Sonar S3358-free).
  let mainContent: ReactNode;
  if (view === 'calendar') {
    mainContent = (
      <FixedExpensesCalendar
        expenses={expenses}
        dictionary={dictionary}
        locale={locale}
        todayStartIso={todayStartIso}
        onPay={handlePay}
      />
    );
  } else if (isEmpty) {
    mainContent = (
      <div className="app-shell rounded-2xl py-16 flex flex-col items-center gap-4 text-center">
        <div className="p-4 rounded-2xl bg-amber-500/10 text-amber-400">
          <ReceiptText className="w-8 h-8" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white mb-1">
            {get(dictionary, 'noFixedExpenses')}
          </p>
          <p className="text-xs text-slate-400 max-w-sm">
            {get(dictionary, 'noFixedExpensesDesc')}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          {get(dictionary, 'addFixedExpense')}
        </button>
      </div>
    );
  } else {
    mainContent = (
      <>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
          {expenses.length}{' '}
          {expenses.length === 1 ? get(dictionary, 'expense') : get(dictionary, 'expenses')}
        </h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {expenses.map((expense) => (
            <FixedExpenseCard
              key={expense.id}
              expense={expense}
              dictionary={dictionary}
              locale={locale}
              todayStartIso={todayStartIso}
              onPay={(payment) => handlePay(expense, payment)}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      {/* Toolbar: view toggle + add */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <fieldset className="inline-flex rounded-xl bg-white/5 p-1 border-0 m-0 min-w-0">
          <legend className="sr-only">{get(dictionary, 'title')}</legend>
          <button
            type="button"
            onClick={() => setView('cards')}
            aria-pressed={view === 'cards'}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 ${
              view === 'cards'
                ? 'bg-amber-500/20 text-amber-300'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
            {get(dictionary, 'viewCards')}
          </button>
          <button
            type="button"
            onClick={() => setView('calendar')}
            aria-pressed={view === 'calendar'}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 ${
              view === 'calendar'
                ? 'bg-amber-500/20 text-amber-300'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
            {get(dictionary, 'viewCalendar')}
          </button>
        </fieldset>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          {get(dictionary, 'addFixedExpense')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
        {/* Main view (2/3) */}
        <div className="lg:col-span-2 space-y-4">{mainContent}</div>

        {/* Sidebar (1/3) */}
        <aside aria-label={get(dictionary, 'upcomingPayments')} className="space-y-4">
          {overdueCount > 0 && (
            <div
              role="alert"
              className="app-shell rounded-2xl p-4 border border-red-500/20 flex items-start gap-3"
            >
              <div className="p-1.5 rounded-lg bg-red-500/15 text-red-400 shrink-0">
                <AlertTriangle className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{get(dictionary, 'overdue')}</p>
                <p className="text-xs text-slate-400 mt-0.5">{get(dictionary, 'overdueWarning')}</p>
              </div>
            </div>
          )}

          <div className="app-shell rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
              {get(dictionary, 'upcomingPayments')}
            </h2>

            {/* Horizon selector */}
            <fieldset className="inline-flex rounded-lg bg-white/5 p-0.5 mb-4 border-0 m-0 min-w-0">
              <legend className="sr-only">{get(dictionary, 'upcomingRange')}</legend>
              {UPCOMING_RANGES.map((range) => (
                <button
                  key={range.value}
                  type="button"
                  onClick={() => setUpcomingRange(range.value)}
                  aria-pressed={upcomingRange === range.value}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 ${
                    upcomingRange === range.value
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {get(dictionary, range.labelKey)}
                </button>
              ))}
            </fieldset>

            {upcoming.length === 0 ? (
              <p className="text-xs text-slate-500">{get(dictionary, 'noPayments')}</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map(({ expense, payment }) => {
                  const status = getPaymentStatus(payment, todayStart);
                  return (
                    <li key={payment.id}>
                      <button
                        type="button"
                        onClick={() => handlePay(expense, payment)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                        aria-label={`${get(dictionary, 'pay')} ${expense.name}`}
                      >
                        <span className="min-w-0">
                          <span className="block text-xs font-medium text-white truncate">
                            {expense.name}
                          </span>
                          <span className="block text-[10px] text-slate-400 tabular-nums">
                            {formatShortDate(payment.dueDate, locale)}
                          </span>
                        </span>
                        <span className="text-right shrink-0">
                          <span className="block text-xs font-semibold text-slate-200 tabular-nums">
                            {formatMoney(
                              payment.paidAmountCents ?? payment.expectedAmountCents,
                              payment.currency,
                              locale
                            )}
                          </span>
                          <span
                            className={`block text-[10px] font-semibold uppercase tracking-wide ${STATUS_TEXT[status]}`}
                          >
                            {get(dictionary, status)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* Modals */}
      <CreateFixedExpenseModal
        dictionary={dictionary}
        locale={locale}
        isOpen={showCreate}
        todayDate={todayDate}
        onClose={closeCreate}
      />

      {editingExpense && (
        <EditFixedExpenseModal
          expense={editingExpense}
          dictionary={dictionary}
          locale={locale}
          isOpen
          onClose={closeEdit}
        />
      )}

      {paying && (
        <PayFixedExpenseModal
          expense={paying.expense}
          payment={paying.payment}
          dictionary={dictionary}
          locale={locale}
          isOpen
          onClose={closePay}
        />
      )}

      {deletingExpense && (
        <DeleteFixedExpenseModal
          fixedExpenseId={deletingExpense.id}
          expenseName={deletingExpense.name}
          dictionary={dictionary}
          isOpen
          onClose={closeDelete}
        />
      )}
    </>
  );
}
