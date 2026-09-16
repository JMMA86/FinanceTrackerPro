/**
 * Shared Variable Expenses Domain Types
 *
 * Central contract consumed by the backend (variable-expense.service /
 * variable-expense.actions / variable-expenses data module) and reused by the
 * frontend so responses are NEVER cast with `as unknown as`.
 *
 * A "variable expense" is a user-defined MONITORED definition (e.g. "Fútbol",
 * "Salidas Novia"). `Transaction` stays the source of truth (Rule 13): each
 * monitored transaction references a `VariableExpense` via `variableExpenseId`,
 * and the module aggregates count/amount per definition, month over month.
 *
 * Money fields are integer cents (Rule 2) and bounded by MAX_SAFE_CENTS so they
 * safely serialize to JS numbers after BigInt conversion. Currencies are NEVER
 * mixed (Decision C1 from the savings module).
 */

import type { Currency, TransactionType } from '@prisma/client';

/** A user-defined monitored variable expense definition. */
export interface VariableExpenseDefinition {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  /** Category configured on the definition (inherited by its transactions). */
  categoryId: string | null;
  category: VariableExpenseTransactionCategory | null;
  expectedTimesPerMonth: number | null;
  expectedAmountCents: number | null;
  currency: Currency;
  isActive: boolean;
}

/** Per-definition monthly statistics inside a currency bucket. */
export interface VariableExpenseMonthStat {
  variableExpenseId: string;
  name: string;
  color: string | null;
  icon: string | null;
  currency: Currency;
  expectedTimesPerMonth: number | null;
  expectedAmountCents: number | null;
  /**
   * Expected monthly total = expectedAmountCents × expectedTimesPerMonth
   * (null when either target is missing). Decimal ROUND_HALF_EVEN.
   */
  expectedTotalCents: number | null;
  /** Number of monitored EXPENSE transactions of the month. */
  count: number;
  /** Sum of EXPENSE magnitudes of the month. */
  totalCents: number;
  /** totalCents / count, Decimal ROUND_HALF_EVEN (0 when empty). */
  averageCents: number;
  /** Same definition count in the previous month (0 if absent). */
  prevCount: number;
  /** Same definition magnitude in the previous month (0 if absent). */
  prevTotalCents: number;
  /** Variation vs previous month; null when there is no previous base. */
  deltaCountPct: number | null;
  /** Variation vs previous month; null when there is no previous base. */
  deltaAmountPct: number | null;
}

/** One currency bucket of the monthly overview. Currencies are never mixed. */
export interface VariableExpensesOverviewBucket {
  currency: Currency;
  /** Sum of the monitored EXPENSE magnitudes of the month. */
  totalCents: number;
  /** Number of monitored EXPENSE transactions of the month. */
  transactionCount: number;
  /** Number of active definitions in this currency bucket. */
  definitionsCount: number;
  /** Per-definition stats, sorted by totalCents desc. */
  stats: VariableExpenseMonthStat[];
}

/** getVariableExpensesOverview() result: monthly breakdown per currency. */
export interface VariableExpensesOverviewResponse {
  month: number;
  year: number;
  byCurrency: VariableExpensesOverviewBucket[];
}

/** One (month) data point of a definition's trend. */
export interface VariableExpenseTrendPoint {
  month: number;
  year: number;
  count: number;
  /** Sum of EXPENSE magnitudes for the month (0 when there is no data). */
  totalCents: number;
}

/** The category embedded in a serialized transaction row. */
export interface VariableExpenseTransactionCategory {
  id: string;
  name: string;
  color: string | null;
}

/**
 * Serialized monitored transaction. `amountCents` is the POSITIVE magnitude
 * (the underlying EXPENSE is stored negative), so the frontend never has to
 * flip signs.
 */
export interface VariableExpenseTransactionSerialized {
  id: string;
  description: string | null;
  /** Positive magnitude in cents. */
  amountCents: number;
  currency: Currency;
  type: TransactionType;
  date: Date;
  accountId: string;
  accountName: string | null;
  categoryId: string | null;
  category: VariableExpenseTransactionCategory | null;
  variableExpenseId: string | null;
}

/** getVariableExpenseDetail() result: one definition for a month or its full history. */
export interface VariableExpenseDetailResponse {
  definition: VariableExpenseDefinition;
  /** 'month' = the requested month; 'all' = the whole history. */
  scope: 'month' | 'all';
  /** Anchor month (requested month, or current month when scope === 'all'). */
  month: number;
  /** Anchor year (requested year, or current year when scope === 'all'). */
  year: number;
  count: number;
  totalCents: number;
  averageCents: number;
  /** Continuous monthly series (oldest → newest, zero-filled). */
  trend: VariableExpenseTrendPoint[];
  transactions: VariableExpenseTransactionSerialized[];
}

/** getVariableExpenseMovements() result: movements filtered by month and/or definition. */
export interface VariableExpenseMovementsResponse {
  scope: 'month' | 'all';
  /** null = todas las definiciones (filtro "Todos") */
  variableExpenseId: string | null;
  count: number;
  totalCents: number;
  averageCents: number;
  transactions: VariableExpenseTransactionSerialized[];
}
