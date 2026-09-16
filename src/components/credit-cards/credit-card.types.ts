/**
 * Shared type definitions for the Credit Cards module.
 * These mirror the shape returned by `getCreditCards` in
 * `src/actions/credit-card.actions.ts` (which we must NOT modify).
 */

export type PaymentStatus = 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE';

export interface CreditCardTransaction {
  id: string;
  description: string | null;
  amountCents: number;
  currency: string;
  type: string;
  date: Date | string;
}

export interface CreditCard {
  id: string;
  name: string;
  currency: 'COP' | 'USD' | 'EUR';
  balanceCents: number; // negative = debt
  creditLimitCents: number | null;
  cutoffDay: number | null;
  paymentDueDay: number | null;
  cardColor: string | null;
  cardNetwork: 'NONE' | 'VISA' | 'MASTERCARD' | 'AMEX' | null;
  createdAt: Date | string;
  transactions: CreditCardTransaction[];
  debtCents: number; // abs of debt
  availableCreditCents: number | null; // limit - debt
  paymentStatus: PaymentStatus;
}

export interface CreditCardStatement {
  accountId: string;
  currency: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  previousBalanceCents: number;
  chargesTotalCents: number;
  paymentsTotalCents: number;
  interestTotalCents: number;
  newBalanceCents: number;
  availableCreditCents: number | null;
  transactions: Array<{
    id: string;
    description: string | null;
    amountCents: number;
    type: string;
    date: Date | string;
    categoryId: string | null;
  }>;
}

/** A bank (source) account for the payment source selector. */
export interface SourceBankAccount {
  id: string;
  name: string;
  currency: string;
  balanceCents: number;
  type: string;
}
