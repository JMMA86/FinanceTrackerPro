/**
 * Shared Type Definitions for Transfer Operations
 * Extracted from internal interfaces in transfer.actions.ts
 * Improves maintainability and reusability across the codebase
 */

import type { Currency, Transaction } from '@prisma/client';

/**
 * Summary of a transaction in transfer result
 */
export interface TransferTransactionSummary {
  id: string;
  amountCents: number;
}

/**
 * Result of a transfer operation (Double-Entry Bookkeeping)
 */
export interface TransferResult {
  transferId: string;
  debitTransaction: TransferTransactionSummary;
  creditTransaction: TransferTransactionSummary;
  wasIdempotent?: boolean;
}

/**
 * Account data needed for transfer validation
 */
export interface TransferAccountRecord {
  id: string;
  userId: string;
  balanceCents: number;
  currency: Currency;
  isActive: boolean;
}

/**
 * Result returned from prisma.$transaction for transfers
 */
export interface TransferTransactionResult {
  transferId: string;
  debitTransaction: TransferTransactionSummary;
  creditTransaction: TransferTransactionSummary;
}

/**
 * Input for reverse transfer operation
 */
export interface ReverseTransferInput {
  transferId: string;
  userId: string;
  reason: string;
}

/**
 * Paired transfer transactions (for double-entry verification)
 */
export interface PairedTransferTransactions {
  debitTransaction: Transaction;
  creditTransaction: Transaction;
}