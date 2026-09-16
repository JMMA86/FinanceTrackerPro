'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type {
  FixedExpensePaymentSerialized,
  FixedExpenseWithPayments,
} from '@/types/fixed-expense';
import { getPaymentStatus, type FixedExpensePaymentStatus } from './constants';
import { FixedExpenseDialog } from './FixedExpenseDialog';

interface FixedExpensesCalendarProps {
  expenses: FixedExpenseWithPayments[];
  dictionary: Record<string, unknown>;
  locale: string;
  todayStartIso: string;
  /** Opens the payment modal for an unpaid occurrence selected from a day. */
  onPay: (expense: FixedExpenseWithPayments, payment: FixedExpensePaymentSerialized) => void;
}

interface MonthCursor {
  year: number;
  /** 0-based month index. */
  month: number;
}

interface Occurrence {
  expense: FixedExpenseWithPayments;
  payment: FixedExpensePaymentSerialized;
}

interface SelectedDay {
  dateLabel: string;
  occurrences: Occurrence[];
}

const DOT_COLOR: Record<FixedExpensePaymentStatus, string> = {
  paid: 'bg-emerald-400',
  overdue: 'bg-red-400',
  pending: 'bg-amber-400',
};

const STATUS_BADGE: Record<FixedExpensePaymentStatus, string> = {
  paid: 'bg-emerald-500/15 text-emerald-400',
  overdue: 'bg-red-500/15 text-red-400',
  pending: 'bg-amber-500/15 text-amber-400',
};

function monthKey(cursor: MonthCursor): number {
  return cursor.year * 12 + cursor.month;
}

/** Clamp a cursor inside the loaded payment window. */
function clampCursor(cursor: MonthCursor, min: MonthCursor, max: MonthCursor): MonthCursor {
  if (monthKey(cursor) < monthKey(min)) return min;
  if (monthKey(cursor) > monthKey(max)) return max;
  return cursor;
}

/**
 * Navigable month grid of materialized payments within the window loaded by the
 * RSC. Days with occurrences are buttons (accessible via a descriptive
 * aria-label) that open a per-day mini dialog where unpaid occurrences can be
 * paid. Dots within a day are color-coded by status (paid / overdue / pending).
 */
export function FixedExpensesCalendar({
  expenses,
  dictionary,
  locale,
  todayStartIso,
  onPay,
}: Readonly<FixedExpensesCalendarProps>) {
  const todayStart = useMemo(() => new Date(todayStartIso), [todayStartIso]);
  const [selectedDay, setSelectedDay] = useState<SelectedDay | null>(null);

  const occurrences = useMemo<Occurrence[]>(
    () => expenses.flatMap((expense) => expense.payments.map((payment) => ({ expense, payment }))),
    [expenses]
  );

  const bounds = useMemo(() => {
    if (occurrences.length === 0) return null;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const { payment } of occurrences) {
      const time = new Date(payment.dueDate).getTime();
      if (time < min) min = time;
      if (time > max) max = time;
    }
    const minDate = new Date(min);
    const maxDate = new Date(max);
    return {
      min: { year: minDate.getFullYear(), month: minDate.getMonth() },
      max: { year: maxDate.getFullYear(), month: maxDate.getMonth() },
    };
  }, [occurrences]);

  const fallbackCursor = useMemo<MonthCursor>(
    () => ({ year: todayStart.getFullYear(), month: todayStart.getMonth() }),
    [todayStart]
  );

  const [rawCursor, setRawCursor] = useState<MonthCursor>(fallbackCursor);

  const view = useMemo<MonthCursor>(() => {
    if (!bounds) return rawCursor;
    return clampCursor(rawCursor, bounds.min, bounds.max);
  }, [rawCursor, bounds]);

  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const occurrence of occurrences) {
      const date = new Date(occurrence.payment.dueDate);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const existing = map.get(key);
      if (existing) existing.push(occurrence);
      else map.set(key, [occurrence]);
    }
    return map;
  }, [occurrences]);

  const firstOfMonth = new Date(view.year, view.month, 1);
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay(); // 0 = Sunday

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(firstOfMonth);

  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        // 2024-01-07 is a Sunday (stable reference week).
        const date = new Date(2024, 0, 7 + index);
        return {
          short: new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date),
          long: new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date),
        };
      }),
    [locale]
  );

  const todayKey = `${todayStart.getFullYear()}-${todayStart.getMonth()}-${todayStart.getDate()}`;

  const canGoPrev = bounds ? monthKey(view) > monthKey(bounds.min) : false;
  const canGoNext = bounds ? monthKey(view) < monthKey(bounds.max) : false;

  const goPrev = () => {
    const next = new Date(view.year, view.month - 1, 1);
    setRawCursor({ year: next.getFullYear(), month: next.getMonth() });
  };
  const goNext = () => {
    const next = new Date(view.year, view.month + 1, 1);
    setRawCursor({ year: next.getFullYear(), month: next.getMonth() });
  };

  const cells: Array<number | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  const trailing = (7 - (cells.length % 7)) % 7;
  for (let index = 0; index < trailing; index++) cells.push(null);

  return (
    <section className="app-shell rounded-2xl p-4 sm:p-5" aria-label={get(dictionary, 'calendar')}>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canGoPrev}
          aria-label={get(dictionary, 'previousMonth')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <h3 className="text-sm font-semibold text-white capitalize flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-amber-400" aria-hidden="true" />
          {monthLabel}
        </h3>
        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext}
          aria-label={get(dictionary, 'nextMonth')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          <ChevronRight className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">{monthLabel}</caption>
        <thead>
          <tr>
            {weekdayLabels.map((day) => (
              <th
                key={day.long}
                scope="col"
                abbr={day.long}
                className="pb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider"
              >
                <span aria-hidden="true">{day.short}</span>
                <span className="sr-only">{day.long}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: cells.length / 7 }, (_, weekIndex) => (
            <tr key={weekIndex}>
              {cells.slice(weekIndex * 7, weekIndex * 7 + 7).map((day, dayIndex) => {
                if (day === null) {
                  return (
                    <td
                      key={`blank-${weekIndex}-${dayIndex}`}
                      className="h-16 border border-white/5 bg-white/[0.01]"
                    />
                  );
                }
                const cellKey = `${view.year}-${view.month}-${day}`;
                const dayOccurrences = byDay.get(cellKey) ?? [];
                const isToday = cellKey === todayKey;
                const dateLabel = new Intl.DateTimeFormat(locale, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }).format(new Date(view.year, view.month, day));

                return (
                  <td
                    key={cellKey}
                    className={`h-16 align-top p-0 border border-white/5 ${
                      isToday ? 'bg-amber-500/5 ring-1 ring-inset ring-amber-400/30' : ''
                    }`}
                  >
                    {dayOccurrences.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setSelectedDay({ dateLabel, occurrences: dayOccurrences })}
                        aria-label={`${get(dictionary, 'viewDayPayments')}: ${dateLabel} (${dayOccurrences.length})`}
                        className="w-full h-full text-left p-1 transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/70"
                      >
                        <span
                          aria-hidden="true"
                          className={`block text-[10px] tabular-nums ${
                            isToday ? 'text-amber-400 font-bold' : 'text-slate-400'
                          }`}
                        >
                          {day}
                        </span>
                        <span aria-hidden="true" className="mt-0.5 block space-y-0.5">
                          {dayOccurrences.slice(0, 2).map((occurrence) => {
                            const status = getPaymentStatus(occurrence.payment, todayStart);
                            return (
                              <span key={occurrence.payment.id} className="flex items-center gap-1">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT_COLOR[status]}`}
                                />
                                <span className="text-[9px] text-slate-300 truncate">
                                  {occurrence.expense.name}
                                </span>
                              </span>
                            );
                          })}
                          {dayOccurrences.length > 2 && (
                            <span className="block text-[9px] text-slate-500">
                              +{dayOccurrences.length - 2}
                            </span>
                          )}
                        </span>
                      </button>
                    ) : (
                      <div className="p-1">
                        <span
                          className={`block text-[10px] tabular-nums ${
                            isToday ? 'text-amber-400 font-bold' : 'text-slate-400'
                          }`}
                        >
                          {day}
                        </span>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-400">
        {(['paid', 'pending', 'overdue'] as const).map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${DOT_COLOR[status]}`} aria-hidden="true" />
            {get(dictionary, status)}
          </span>
        ))}
      </div>

      {occurrences.length === 0 && (
        <p className="mt-3 text-xs text-slate-500">{get(dictionary, 'noPaymentsThisMonth')}</p>
      )}

      {selectedDay && (
        <FixedExpenseDialog
          open
          titleId="fixed-expense-day-title"
          title={selectedDay.dateLabel}
          dictionary={dictionary}
          onClose={() => setSelectedDay(null)}
          maxWidth="max-w-md"
        >
          <div className="space-y-3">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              {get(dictionary, 'paymentsOnDay')}
            </p>
            {selectedDay.occurrences.length === 0 ? (
              <p className="text-sm text-slate-400">{get(dictionary, 'noPaymentsOnDay')}</p>
            ) : (
              <ul className="space-y-2">
                {selectedDay.occurrences.map(({ expense, payment }) => {
                  const status = getPaymentStatus(payment, todayStart);
                  const isUnpaid = payment.paidDate == null;
                  return (
                    <li
                      key={payment.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{expense.name}</p>
                        <p className="text-xs text-slate-400 tabular-nums">
                          {formatMoney(
                            payment.paidAmountCents ?? payment.expectedAmountCents,
                            payment.currency,
                            locale
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${STATUS_BADGE[status]}`}
                        >
                          {get(dictionary, status)}
                        </span>
                        {isUnpaid && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDay(null);
                              onPay(expense, payment);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
                          >
                            {get(dictionary, 'pay')}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </FixedExpenseDialog>
      )}
    </section>
  );
}
