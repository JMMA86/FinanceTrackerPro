/**
 * Shared Loan Domain Types
 *
 * Central contract consumed by the backend (loan.service / loan.actions) and
 * reused by the frontend so responses are NEVER cast with `as unknown as`.
 *
 * Money fields are integer cents (Rule 2) and bounded by MAX_SAFE_CENTS so they
 * safely serialize to JS numbers after BigInt conversion.
 *
 * The loan enums are re-exported from `@prisma/client` (type-only, matching the
 * existing `src/types` convention) so consumers import a single module.
 */

import type {
  Currency,
  Loan,
  LoanAdjustment,
  LoanDirection,
  LoanInstallment,
  LoanInstallmentPayment,
} from '@prisma/client';

export type {
  LoanDirection,
  LoanStatus,
  LoanRateType,
  LoanInterestMode,
  LoanDayCountBasis,
  LoanInterestAccrual,
  LoanAmortizationType,
  LoanPaymentFrequency,
  LoanInstallmentStatus,
  LoanAdjustmentType,
} from '@prisma/client';

/**
 * Schedule configuration mode for loan creation:
 * - `TERM`        → `termCount` given, installment computed.
 * - `INSTALLMENT` → fixed `installmentAmountCents` given, term count derived.
 */
export type LoanScheduleMode = 'TERM' | 'INSTALLMENT';

/**
 * A payment/receipt applied to a single installment. BigInt money is converted
 * to JS numbers on the server before serialization.
 */
export type LoanInstallmentPaymentSerialized = Omit<
  LoanInstallmentPayment,
  'installment' | 'transaction' | 'amountCents' | 'principalCents' | 'interestCents'
> & {
  amountCents: number;
  principalCents: number;
  interestCents: number;
};

/**
 * A scheduled installment with its serialized payments.
 */
export type LoanInstallmentSerialized = Omit<
  LoanInstallment,
  | 'loan'
  | 'transactions'
  | 'payments'
  | 'principalCents'
  | 'interestCents'
  | 'totalCents'
  | 'balanceCents'
  | 'paidAmountCents'
  | 'paidPrincipalCents'
  | 'paidInterestCents'
> & {
  principalCents: number;
  interestCents: number;
  totalCents: number;
  balanceCents: number;
  paidAmountCents: number | null;
  paidPrincipalCents: number;
  paidInterestCents: number;
  payments: LoanInstallmentPaymentSerialized[];
};

/**
 * A loan adjustment with serialized money.
 */
export type LoanAdjustmentSerialized = Omit<
  LoanAdjustment,
  'loan' | 'transaction' | 'amountCents' | 'newRateValue'
> & {
  amountCents: number | null;
  newRateValue: number | null;
};

/**
 * Serialized loan returned by the loan service (BigInt → number).
 */
export type LoanSerialized = Omit<
  Loan,
  | 'user'
  | 'installments'
  | 'adjustments'
  | 'principalCents'
  | 'balanceCents'
  | 'installmentAmountCents'
  | 'totalInterestCents'
  | 'totalPayableCents'
  | 'interestRateValue'
  | 'effectiveYieldPct'
> & {
  principalCents: number;
  balanceCents: number;
  installmentAmountCents: number | null;
  totalInterestCents: number;
  totalPayableCents: number;
  interestRateValue: number;
  effectiveYieldPct: number | null;
};

/**
 * Derived, schedule-based summary attached to a loan aggregate so the UI never
 * has to re-derive counters from the raw installment list.
 */
export interface LoanDerivedSummary {
  paidCount: number;
  pendingCount: number;
  nextDueDate: Date | null;
  /** Principal repaid percentage (0..100), Decimal ROUND_HALF_EVEN. */
  progressPct: number;
}

/**
 * Full loan aggregate with its amortization schedule, adjustments and derived
 * summary.
 */
export type LoanWithInstallments = LoanSerialized &
  LoanDerivedSummary & {
    installments: LoanInstallmentSerialized[];
    adjustments: LoanAdjustmentSerialized[];
  };

/**
 * One currency bucket of the aggregated loans summary for a user.
 * Currencies are NEVER merged (no implicit FX conversion).
 */
export interface LoanSummaryPerCurrency {
  currency: Currency;
  totalPrincipalCents: number;
  totalInterestCents: number;
  /** Outstanding balance the user has lent out (RECEIVABLE). */
  totalReceivableCents: number;
  /** Outstanding balance the user owes (PAYABLE). */
  totalPayableCents: number;
  /** Installments due in the current month (PENDING/PARTIAL remainder). */
  monthlyDueCents: number;
  activeCount: number;
}

/**
 * getLoansSummary() result.
 */
export interface LoansSummaryResponse {
  byCurrency: LoanSummaryPerCurrency[];
}

/**
 * A pending/partial installment flattened for the transactions modal selector.
 * `expectedTransactionType` tells the UI which money movement to register.
 */
export interface PendingLoanInstallment {
  loanId: string;
  loanName: string;
  direction: LoanDirection;
  currency: Currency;
  installmentId: string;
  installmentNumber: number;
  dueDate: Date;
  totalCents: number;
  paidAmountCents: number;
  remainingCents: number;
  expectedTransactionType: 'LOAN_PAYMENT' | 'LOAN_RECEIPT';
}

/**
 * A single installment summarized for the transactions-modal loan selector.
 */
export interface LoanPaymentOptionInstallment {
  installmentId: string;
  installmentNumber: number;
  dueDate: Date;
  totalCents: number;
  paidAmountCents: number;
  remainingCents: number;
  status: 'PENDING' | 'PARTIAL' | 'OVERDUE' | 'PAID' | 'WAIVED';
}

/**
 * An ACTIVE loan summarized for the transactions modal. The UI lists loans with
 * their current-month payment state instead of raw installments.
 */
export interface LoanPaymentOption {
  loanId: string;
  loanName: string;
  direction: LoanDirection;
  currency: Currency;
  balanceCents: number;
  expectedTransactionType: 'LOAN_PAYMENT' | 'LOAN_RECEIPT';
  /** Primera cuota vencida impaga (dueDate < now), si existe. */
  overdueInstallment: LoanPaymentOptionInstallment | null;
  /** Primera cuota impaga (PENDING/PARTIAL) por número, sea vencida o futura. */
  nextInstallment: LoanPaymentOptionInstallment | null;
  /** Cuota cuyo dueDate cae en el mes calendario actual (cualquier estado). */
  currentMonthInstallment: LoanPaymentOptionInstallment | null;
  /** true si la cuota del mes actual existe y está PAID. */
  currentMonthPaid: boolean;
  pendingCount: number;
}
