/**
 * Fixed Expense Recurrence (pure helpers)
 *
 * Shared by the service (`src/services/fixed-expense.service.ts`) and the seed
 * scripts so the materialized series and the seeded payments can NEVER drift.
 *
 * This module is intentionally PURE: no `server-only`, no Next.js, no Prisma and
 * no side effects. Cap logging is injected through an optional callback so the
 * service can route it to the structured logger while the seed stays silent.
 *
 * Decision D7: every due date is normalized to server-local midnight.
 */

/** Occurrence frequencies handled by the recurrence engine. */
export type FixedExpenseFrequencyValue =
  | 'DAILY'
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'YEARLY';

/** Minimal shape required to compute a template's occurrences. */
export interface RecurrenceExpense {
  frequency: FixedExpenseFrequencyValue;
  dayOfPayment: number | null;
  startDate: Date;
  endDate: Date | null;
}

/** Payload emitted when generation hits `MAX_PAYMENTS_PER_TEMPLATE`. */
export interface RecurrenceCapEvent {
  frequency: FixedExpenseFrequencyValue;
  startDate: Date;
  cap: number;
}

/** Optional sink for the truncation warning (defaults to silence). */
export type RecurrenceCapHandler = (event: RecurrenceCapEvent) => void;

/** Rolling horizon: current month + the next 11 months. */
export const UPCOMING_HORIZON_MONTHS = 12;
/** How far back overdue payments are materialized so the UI can show them. */
export const OVERDUE_LOOKBACK_MONTHS = 3;
/**
 * Defensive cap for high-frequency templates (DAILY over the 15-month window is
 * ~456 occurrences; anything above this is truncated to protect the DB).
 */
export const MAX_PAYMENTS_PER_TEMPLATE = 500;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ============================================================================
// Local-date helpers
// ============================================================================

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** First day of the month `months` months away from `date`. */
export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1, 0, 0, 0, 0);
}

/** Add `days` calendar days at server-local midnight (DST-safe). */
export function addDays(date: Date, days: number): Date {
  const base = startOfDay(date);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, 0, 0, 0, 0);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Build a local-midnight date, clamping `day` to the last day of the month. */
export function clampDayToMonth(year: number, monthIndex: number, day: number): Date {
  const lastDay = daysInMonth(year, monthIndex);
  const clamped = Math.min(Math.max(day, 1), lastDay);
  return new Date(year, monthIndex, clamped, 0, 0, 0, 0);
}

/**
 * Rolling materialization window for a reference instant:
 * `startOfMonth(now - 3 months)` → `endOfMonth(now + 11 months)`.
 */
export function getMaterializationHorizon(now: Date): { from: Date; to: Date } {
  return {
    from: startOfMonth(addMonths(now, -OVERDUE_LOOKBACK_MONTHS)),
    to: endOfMonth(addMonths(now, UPCOMING_HORIZON_MONTHS - 1)),
  };
}

// ============================================================================
// Effective range
// ============================================================================

interface EffectiveRange {
  /** Intersection of the requested range and the template startDate. */
  start: Date;
  /** Intersection of the requested range and the template endDate. */
  end: Date;
  anchor: Date;
}

function resolveEffectiveRange(
  expense: RecurrenceExpense,
  from: Date,
  to: Date
): EffectiveRange | null {
  const rangeStart = startOfDay(from);
  const rangeEnd = endOfDay(to);
  const anchor = startOfDay(expense.startDate);

  const start = rangeStart > anchor ? rangeStart : anchor;
  let end = rangeEnd;
  if (expense.endDate) {
    const boundedEnd = endOfDay(expense.endDate);
    if (boundedEnd < rangeEnd) {
      end = boundedEnd;
    }
  }

  if (start > end) return null;
  return { start, end, anchor };
}

// ============================================================================
// Interval frequencies (DAILY / WEEKLY / BIWEEKLY)
// ============================================================================

function isIntervalFrequency(frequency: FixedExpenseFrequencyValue): boolean {
  return frequency === 'DAILY' || frequency === 'WEEKLY' || frequency === 'BIWEEKLY';
}

function intervalStepDays(frequency: FixedExpenseFrequencyValue): number {
  switch (frequency) {
    case 'DAILY':
      return 1;
    case 'WEEKLY':
      return 7;
    default:
      return 14;
  }
}

function computeIntervalDueDates(
  expense: RecurrenceExpense,
  range: EffectiveRange,
  onCapReached?: RecurrenceCapHandler
): Date[] {
  const stepDays = intervalStepDays(expense.frequency);
  const elapsedDays = Math.round((range.start.getTime() - range.anchor.getTime()) / MS_PER_DAY);
  const steps = Math.max(0, Math.ceil(elapsedDays / stepDays));

  const dates: Date[] = [];
  let cursor = addDays(range.anchor, steps * stepDays);

  while (cursor <= range.end) {
    if (dates.length >= MAX_PAYMENTS_PER_TEMPLATE) {
      onCapReached?.({
        frequency: expense.frequency,
        startDate: expense.startDate,
        cap: MAX_PAYMENTS_PER_TEMPLATE,
      });
      break;
    }
    dates.push(cursor);
    cursor = addDays(cursor, stepDays);
  }
  return dates;
}

// ============================================================================
// Month-step frequencies (MONTHLY / QUARTERLY / YEARLY)
// ============================================================================

function monthStepSize(frequency: FixedExpenseFrequencyValue): number {
  switch (frequency) {
    case 'MONTHLY':
      return 1;
    case 'QUARTERLY':
      return 3;
    default:
      return 12;
  }
}

function occurrenceInMonth(absoluteMonth: number, dayOfMonth: number): Date {
  const year = Math.floor(absoluteMonth / 12);
  const monthIndex = absoluteMonth % 12;
  return clampDayToMonth(year, monthIndex, dayOfMonth);
}

function computeMonthStepDueDates(
  expense: RecurrenceExpense,
  range: EffectiveRange,
  onCapReached?: RecurrenceCapHandler
): Date[] {
  const monthStep = monthStepSize(expense.frequency);
  const dayOfMonth = expense.dayOfPayment ?? range.anchor.getDate();
  const startAbsoluteMonth = range.anchor.getFullYear() * 12 + range.anchor.getMonth();
  const endAbsoluteMonth = range.end.getFullYear() * 12 + range.end.getMonth();

  const dates: Date[] = [];
  for (
    let absoluteMonth = startAbsoluteMonth;
    absoluteMonth <= endAbsoluteMonth;
    absoluteMonth += monthStep
  ) {
    const occurrence = occurrenceInMonth(absoluteMonth, dayOfMonth);
    if (occurrence < range.start) continue;
    if (occurrence > range.end) break;
    if (dates.length >= MAX_PAYMENTS_PER_TEMPLATE) {
      onCapReached?.({
        frequency: expense.frequency,
        startDate: expense.startDate,
        cap: MAX_PAYMENTS_PER_TEMPLATE,
      });
      break;
    }
    dates.push(occurrence);
  }
  return dates;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Compute the occurrence dates of a template inside [from, to], normalized to
 * server-local midnight. The effective window is the intersection of the
 * requested range, the template startDate and its endDate.
 *
 * - DAILY/WEEKLY/BIWEEKLY are anchored on startDate and stepped by days.
 * - MONTHLY/QUARTERLY/YEARLY step month-to-month; `dayOfPayment` (or the
 *   startDate day) selects the day and is clamped to the last day of the month.
 *
 * @param onCapReached optional warning sink when the defensive cap is hit.
 */
export function computeDueDates(
  expense: RecurrenceExpense,
  from: Date,
  to: Date,
  onCapReached?: RecurrenceCapHandler
): Date[] {
  const range = resolveEffectiveRange(expense, from, to);
  if (!range) return [];

  if (isIntervalFrequency(expense.frequency)) {
    return computeIntervalDueDates(expense, range, onCapReached);
  }
  return computeMonthStepDueDates(expense, range, onCapReached);
}
