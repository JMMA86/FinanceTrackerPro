/**
 * Shared Fixed Expenses Domain Types
 *
 * Central contract consumed by the backend (fixed-expense.service /
 * fixed-expense.actions) and reused by the frontend so responses are NEVER cast
 * with `as unknown as`.
 *
 * Money fields are integer cents (Rule 2) and bounded by MAX_SAFE_CENTS so they
 * safely serialize to JS numbers after BigInt conversion (see serializers).
 */

import type { Currency, FixedExpense, FixedExpensePayment } from '@prisma/client';

/**
 * Serialized fixed expense template returned by the Server Actions: the BigInt
 * `amountCents` is converted to a JS number on the server. Includes the
 * extended audit fields ipAddress/userAgent (Rule 14).
 */
export type FixedExpenseSerialized = Omit<FixedExpense, 'amountCents'> & {
  amountCents: number;
};

/**
 * Serialized materialized payment: monetary BigInt fields are JS numbers
 * (`paidAmountCents` is null while the payment is still pending).
 */
export type FixedExpensePaymentSerialized = Omit<
  FixedExpensePayment,
  'expectedAmountCents' | 'paidAmountCents'
> & {
  expectedAmountCents: number;
  paidAmountCents: number | null;
};

/**
 * A template plus its materialized payments (optionally range-filtered).
 */
export type FixedExpenseWithPayments = FixedExpenseSerialized & {
  payments: FixedExpensePaymentSerialized[];
};

/**
 * One currency bucket of the aggregated fixed expenses summary for a month.
 * Currencies are NEVER merged (Decision C1 from the savings module): without a
 * reliable FX service, silent conversion is forbidden.
 */
export interface FixedExpensesSummaryPerCurrency {
  currency: Currency;
  /** Sum of expectedAmountCents for payments due in the month. */
  totalCommittedCents: number;
  /** Sum of paid amounts (paidAmountCents ?? expectedAmountCents) paid in the month. */
  totalPaidCents: number;
  /** Unpaid payments due in the month (includes those already overdue within the month). */
  totalPendingCents: number;
  /** Unpaid payments due in the month whose dueDate is before now. */
  totalOverdueCents: number;
  /** Number of active templates in this currency. */
  activeCount: number;
}

/**
 * getFixedExpensesSummary() result, broken down per currency.
 */
export interface FixedExpensesSummaryResponse {
  byCurrency: FixedExpensesSummaryPerCurrency[];
}
