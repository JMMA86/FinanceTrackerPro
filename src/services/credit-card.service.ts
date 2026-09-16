/**
 * Credit Card Service — reusable, server-side credit-card helpers.
 *
 * `computePaymentStatus` originally lived (private) inside
 * `src/actions/credit-card.actions.ts`. It is extracted here so the Credit Cards
 * module and the Dashboard read path share the EXACT same classification and can
 * never drift. It is the SINGLE source of truth for both consumers.
 *
 * Audit corrections applied here:
 * - OVERDUE is evaluated BEFORE DUE_SOON, so a card whose month's due date has
 *   already passed with outstanding debt is never masked as merely DUE_SOON.
 * - The due day is clamped to the last day of the month (29/30/31 rollover).
 * - DUE_SOON requires outstanding debt, mirroring OVERDUE. A card with no debt
 *   never raises a payment alert (the dashboard reads `dueSoonCount > 0` and
 *   would otherwise emit a CREDIT_CARD_DUE_SOON alert with amount = 0).
 * - `computeAvailableCredit` is the SINGLE source of truth for available credit
 *   (limit − debt, clamped at zero) across the Credit Cards module and the
 *   Dashboard, so an over-limit card can never show a negative available credit
 *   on one surface and zero on another.
 */

import 'server-only';

import { subtractCents } from '@/lib/money';
import { clampDayToMonth } from '@/lib/fixed-expense-recurrence';

export type PaymentStatus = 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** First millisecond of a day (local time). */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Payment status for a card based on its paymentDueDay relative to today.
 *
 * Evaluation order matters: OVERDUE is checked FIRST. When this month's due date
 * has already passed AND there is outstanding debt, the card is overdue even if
 * the NEXT due date happens to be within 7 days (previously DUE_SOON masked it).
 *
 * - OVERDUE  → this month's due date already passed and there is outstanding debt.
 * - DUE_SOON → there is outstanding debt AND the next due date is within the
 *              next 7 days. Without debt there is nothing to pay, so the card is
 *              never DUE_SOON.
 * - ON_TRACK → otherwise.
 *
 * The due day is clamped to the last day of the month so a 29/30/31 due day never
 * rolls into the following month (which also made the pass/overdue check wrong in
 * February, for example).
 */
export function computePaymentStatus(
  paymentDueDay: number | null,
  hasDebt: boolean
): PaymentStatus {
  if (paymentDueDay == null) return 'ON_TRACK';

  const today = startOfDay(new Date());
  const year = today.getFullYear();
  const month = today.getMonth();
  const currentDue = clampDayToMonth(year, month, paymentDueDay);
  const dueDayPassed = today.getTime() > currentDue.getTime();

  if (dueDayPassed && hasDebt) return 'OVERDUE';

  const upcomingDue = dueDayPassed ? clampDayToMonth(year, month + 1, paymentDueDay) : currentDue;
  const daysUntilDue = Math.ceil((upcomingDue.getTime() - today.getTime()) / MS_PER_DAY);

  if (hasDebt && daysUntilDue <= 7) return 'DUE_SOON';
  return 'ON_TRACK';
}

/**
 * Available credit = credit limit − outstanding debt, never negative.
 *
 * Shared by `getCreditCards`, `getCreditCardStatement` and the Dashboard's
 * `buildCreditCardMetrics` so every surface clamps identically: an over-limit
 * card shows 0 available everywhere instead of a negative amount on some
 * surfaces and 0 on others. Returns null when the card has no credit limit.
 *
 * All arithmetic uses the Decimal.js helpers (Rule 1); `debtCents` is expected
 * as a non-negative magnitude.
 */
export function computeAvailableCredit(
  creditLimitCents: number | null,
  debtCents: number
): number | null {
  if (creditLimitCents == null) return null;
  const available = subtractCents(creditLimitCents, debtCents);
  return Math.max(available, 0);
}

/**
 * Debt magnitude from a signed ledger balance: the card's debt is the positive
 * magnitude of a negative balance (Rule 1 — Decimal, never `Math.abs` on money).
 */
export function debtFromBalance(balanceCents: number): number {
  return balanceCents < 0 ? subtractCents(0, balanceCents) : 0;
}

/**
 * The next upcoming due date for a card, given its paymentDueDay. The due day is
 * clamped to the last day of the month (a 31 due day resolves to Feb 28/29, etc).
 * Returns null when the card has no configured due day.
 */
export function computeNextDueDate(
  paymentDueDay: number | null,
  from: Date = new Date()
): Date | null {
  if (paymentDueDay == null) return null;

  const today = startOfDay(from);
  const currentDue = clampDayToMonth(from.getFullYear(), from.getMonth(), paymentDueDay);
  if (currentDue < today) {
    return clampDayToMonth(from.getFullYear(), from.getMonth() + 1, paymentDueDay);
  }
  return currentDue;
}
