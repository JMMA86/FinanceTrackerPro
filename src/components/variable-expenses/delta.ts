/**
 * Shared presentation helpers for the month-over-month variation of variable
 * expenses. Kept tiny and dependency-free so the summary cards, the category
 * breakdown and the list share ONE source of truth for tone, color and label.
 */

export type ExpenseDeltaTone = 'up' | 'down' | 'flat' | 'none';

/**
 * Spending MORE than last month is unfavorable; LESS is favorable. A null delta
 * means there is no previous base to compare against.
 */
export function getExpenseDeltaTone(deltaPct: number | null): ExpenseDeltaTone {
  if (deltaPct === null) return 'none';
  if (deltaPct > 0) return 'up';
  if (deltaPct < 0) return 'down';
  return 'flat';
}

export function formatExpenseDelta(deltaPct: number): string {
  const sign = deltaPct > 0 ? '+' : '';
  return `${sign}${deltaPct.toFixed(1)}%`;
}

export const EXPENSE_DELTA_COLORS: Record<ExpenseDeltaTone, string> = {
  up: 'text-rose-400',
  down: 'text-emerald-400',
  flat: 'text-slate-400',
  none: 'text-slate-500',
};

export const EXPENSE_DELTA_LABEL_KEYS: Record<ExpenseDeltaTone, string> = {
  up: 'increased',
  down: 'decreased',
  flat: 'same',
  none: 'noData',
};
