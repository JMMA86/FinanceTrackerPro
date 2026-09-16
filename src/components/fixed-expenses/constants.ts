import {
  Home,
  ReceiptText,
  CreditCard,
  Wifi,
  Droplets,
  Zap,
  Car,
  ShoppingCart,
  Smartphone,
  Dumbbell,
  Tv,
  HeartPulse,
  type LucideIcon,
} from 'lucide-react';
import type {
  FixedExpensePaymentSerialized,
  FixedExpenseWithPayments,
} from '@/types/fixed-expense';

/** Currencies supported by the finance module (ISO 4217). */
export const FIXED_EXPENSE_CURRENCIES = ['COP', 'USD', 'EUR'] as const;

/** Recurrence frequencies supported by the backend enum. */
export const FIXED_EXPENSE_FREQUENCIES = [
  'DAILY',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
] as const;

export type FixedExpenseFrequencyValue = (typeof FIXED_EXPENSE_FREQUENCIES)[number];

/** Default accent (amber — the fixed-expenses module color). */
export const DEFAULT_FIXED_EXPENSE_COLOR = '#f59e0b';
export const DEFAULT_FIXED_EXPENSE_ICON = 'receipt';

export interface FixedExpenseColorPreset {
  value: string;
  labelKey: string;
}

/** Rich hex color presets (stored as-is in FixedExpense.color). */
export const FIXED_EXPENSE_COLOR_PRESETS: FixedExpenseColorPreset[] = [
  { value: '#f59e0b', labelKey: 'colorNames.amber' },
  { value: '#3b82f6', labelKey: 'colorNames.blue' },
  { value: '#10b981', labelKey: 'colorNames.emerald' },
  { value: '#ef4444', labelKey: 'colorNames.red' },
  { value: '#8b5cf6', labelKey: 'colorNames.violet' },
  { value: '#ec4899', labelKey: 'colorNames.pink' },
];

export interface FixedExpenseIconOption {
  name: string;
  labelKey: string;
  Icon: LucideIcon;
}

/** Allow-listed lucide icons selectable for a fixed expense template. */
export const FIXED_EXPENSE_ICONS: FixedExpenseIconOption[] = [
  { name: 'home', labelKey: 'iconNames.home', Icon: Home },
  { name: 'receipt', labelKey: 'iconNames.receipt', Icon: ReceiptText },
  { name: 'card', labelKey: 'iconNames.card', Icon: CreditCard },
  { name: 'wifi', labelKey: 'iconNames.wifi', Icon: Wifi },
  { name: 'water', labelKey: 'iconNames.water', Icon: Droplets },
  { name: 'power', labelKey: 'iconNames.power', Icon: Zap },
  { name: 'car', labelKey: 'iconNames.car', Icon: Car },
  { name: 'cart', labelKey: 'iconNames.cart', Icon: ShoppingCart },
  { name: 'phone', labelKey: 'iconNames.phone', Icon: Smartphone },
  { name: 'gym', labelKey: 'iconNames.gym', Icon: Dumbbell },
  { name: 'tv', labelKey: 'iconNames.tv', Icon: Tv },
  { name: 'health', labelKey: 'iconNames.health', Icon: HeartPulse },
];

/** Format a Date as the local `YYYY-MM-DD` value expected by <input type="date">. */
export function toDateInputValue(date?: Date | null): string {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parse a `YYYY-MM-DD` input value into a local-midnight Date (timezone safe). */
export function parseDateInput(value: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

export type FixedExpensePaymentStatus = 'paid' | 'overdue' | 'pending';

/** Materialized payment status relative to a reference "today". */
export function getPaymentStatus(
  payment: FixedExpensePaymentSerialized,
  todayStart: Date
): FixedExpensePaymentStatus {
  if (payment.paidDate) return 'paid';
  return new Date(payment.dueDate).getTime() < todayStart.getTime() ? 'overdue' : 'pending';
}

/** Due-date ascending comparator for materialized payments. */
export function comparePaymentsByDueDate(
  a: FixedExpensePaymentSerialized,
  b: FixedExpensePaymentSerialized
): number {
  return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
}

/** Upcoming unpaid payments of a template (ascending), or [] when fully settled. */
export function getUnpaidPayments(
  expense: FixedExpenseWithPayments
): FixedExpensePaymentSerialized[] {
  return expense.payments
    .filter((payment) => payment.paidDate == null)
    .sort(comparePaymentsByDueDate);
}

/**
 * Status shown on a template card.
 *
 * The badge reflects the CURRENT month when the template has occurrences in it:
 * paid when every occurrence this month is paid, overdue when an unpaid one is
 * already past due, pending otherwise. When there are no occurrences this month
 * it falls back to the status of the soonest unpaid payment (or paid when none
 * remain).
 */
export function getExpenseDisplayStatus(
  expense: FixedExpenseWithPayments,
  todayStart: Date
): FixedExpensePaymentStatus {
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(
    todayStart.getFullYear(),
    todayStart.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );
  const monthStartTime = monthStart.getTime();
  const monthEndTime = monthEnd.getTime();

  const currentMonthPayments = expense.payments.filter((payment) => {
    const dueTime = new Date(payment.dueDate).getTime();
    return dueTime >= monthStartTime && dueTime <= monthEndTime;
  });

  if (currentMonthPayments.length > 0) {
    if (currentMonthPayments.every((payment) => payment.paidDate != null)) return 'paid';
    const hasOverdue = currentMonthPayments.some(
      (payment) =>
        payment.paidDate == null && new Date(payment.dueDate).getTime() < todayStart.getTime()
    );
    return hasOverdue ? 'overdue' : 'pending';
  }

  const unpaid = getUnpaidPayments(expense);
  if (unpaid.length === 0) return 'paid';
  return getPaymentStatus(unpaid[0], todayStart);
}
