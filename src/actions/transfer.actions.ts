/**
 * Transfer Actions (CLAUDE.md Rules 3, 12, 13, 14)
 * Implements Double-Entry Bookkeeping for atomic transfers
 *
 * CRITICAL RULES:
 * - Rule 3: Atomic transactions (prisma.$transaction)
 * - Rule 12: Idempotency (UUID v4 keys)
 * - Rule 13: Source of Truth (verify balance from history)
 * - Rule 14: Extended audit (IP, user agent)
 *
 * REFACTORED: Uses Repository Pattern with DI + Centralized Error Handling
 */

'use server';
import 'server-only';

import { headers } from 'next/headers';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { addCents, subtractCents } from '@/lib/money';
import { getTrueBalance } from '@/services/reconciliation.service';
import { checkAndLockIdempotency } from '@/services/idempotency.service';
import { TransferSchema, type TransferInput } from '@/lib/validations/finance';
import { getTransactionRepository } from '@/lib/repositories';
import { safeAction } from '@/lib/utils/action-wrapper';
import {
  NotFoundError,
  InsufficientFundsError,
  UnauthorizedError,
  CurrencyMismatchError,
  InactiveAccountError,
} from '@/lib/errors/api-errors';
import type { Transaction } from '@prisma/client';

/**
 * Transfer result type
 */
type TransferResult = {
  transferId: string;
  debitTransaction: { id: string; amountCents: number };
  creditTransaction: { id: string; amountCents: number };
  wasIdempotent?: boolean;
};

/**
 * Execute atomic transfer between accounts (INTERNAL - NO ERROR HANDLING)
 * Implements double-entry bookkeeping
 *
 * @param input Transfer input (pre-validated)
 * @returns Transfer result with transaction IDs
 */
async function transferBetweenAccountsInternal(input: unknown): Promise<TransferResult> {
  // 1. SERVER-SIDE VALIDATION (Rule 5)
  const validated = TransferSchema.parse(input);

  // Get repositories (DI)
  const transactionRepo = getTransactionRepository();

  // 2. IDEMPOTENCY CHECK (Rule 12)
  const existingTransfer = await checkAndLockIdempotency(
    validated.idempotencyKey,
    'transaction',
    transactionRepo
  );

  if (existingTransfer) {
    // Already processed - return idempotent response
    const txRecord = existingTransfer as Transaction;
    return {
      transferId: txRecord.transferId || '',
      debitTransaction: { id: '', amountCents: 0 },
      creditTransaction: { id: '', amountCents: 0 },
      wasIdempotent: true,
    };
  }

  // 3. CAPTURE AUDIT DATA (Rule 14)
  const headersList = await headers();
  const ipAddress = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';
  const userAgent = headersList.get('user-agent') || 'unknown';

  // 4. ATOMIC TRANSACTION (Rule 3)
  interface TransferAccountRecord {
    id: string;
    userId: string;
    balanceCents: number;
    currency: TransferInput['currency'];
    isActive: boolean;
  }

  interface TransferTransactionSummary {
    id: string;
    amountCents: number;
  }

  interface TransferTransactionResult {
    transferId: string;
    debitTransaction: TransferTransactionSummary;
    creditTransaction: TransferTransactionSummary;
  }

  const result: TransferTransactionResult = await prisma.$transaction<TransferTransactionResult>(
    async (tx: Prisma.TransactionClient): Promise<TransferTransactionResult> => {
      // 4.1. Verify both accounts exist and belong to user
      const [fromAccount, toAccount]: [TransferAccountRecord | null, TransferAccountRecord | null] =
        await Promise.all([
          tx.account.findUnique({
            where: { id: validated.fromAccountId },
            select: {
              id: true,
              userId: true,
              balanceCents: true,
              currency: true,
              isActive: true,
            },
          }),
          tx.account.findUnique({
            where: { id: validated.toAccountId },
            select: {
              id: true,
              userId: true,
              balanceCents: true,
              currency: true,
              isActive: true,
            },
          }),
        ]);

      if (!fromAccount) {
        throw new NotFoundError('Account', validated.fromAccountId);
      }

      if (!toAccount) {
        throw new NotFoundError('Account', validated.toAccountId);
      }

      if (!fromAccount.isActive) {
        throw new InactiveAccountError(validated.fromAccountId);
      }

      if (!toAccount.isActive) {
        throw new InactiveAccountError(validated.toAccountId);
      }

      // Verify ownership
      if (fromAccount.userId !== validated.userId) {
        throw new UnauthorizedError('Source account does not belong to user');
      }

      if (toAccount.userId !== validated.userId) {
        throw new UnauthorizedError('Destination account does not belong to user');
      }

      // Verify currency match
      if (fromAccount.currency !== validated.currency) {
        throw new CurrencyMismatchError(validated.currency, fromAccount.currency);
      }

      if (toAccount.currency !== validated.currency) {
        throw new CurrencyMismatchError(validated.currency, toAccount.currency);
      }

      // 4.2. VERIFY SUFFICIENT BALANCE (Rule 13 - Source of Truth)
      const trueBalance: number = await getTrueBalance(validated.fromAccountId, transactionRepo);

      if (trueBalance < validated.amountCents) {
        throw new InsufficientFundsError(validated.amountCents, trueBalance);
      }

      // 4.3. Generate transfer ID (links both transactions)
      const transferId: string = crypto.randomUUID();

      // 4.4. Create TRANSFER_OUT transaction (debit source)
      const debitTransaction = await tx.transaction.create({
        data: {
          idempotencyKey: validated.idempotencyKey,
          userId: validated.userId,
          accountId: validated.fromAccountId,
          type: 'TRANSFER_OUT',
          amountCents: -validated.amountCents, // NEGATIVE (debit)
          currency: validated.currency,
          description: validated.description || `Transfer to account ${validated.toAccountId}`,
          date: validated.date || new Date(),
          transferId,
          transferToAccountId: validated.toAccountId,
          ipAddress,
          userAgent,
          createdBy: validated.userId,
        },
      });

      // 4.5. Create TRANSFER_IN transaction (credit destination)
      const creditIdempotencyKey: string = crypto.randomUUID();
      const creditTransaction = await tx.transaction.create({
        data: {
          idempotencyKey: creditIdempotencyKey,
          userId: validated.userId,
          accountId: validated.toAccountId,
          type: 'TRANSFER_IN',
          amountCents: validated.amountCents, // POSITIVE (credit)
          currency: validated.currency,
          description: validated.description || `Transfer from account ${validated.fromAccountId}`,
          date: validated.date || new Date(),
          transferId,
          transferFromAccountId: validated.fromAccountId,
          ipAddress,
          userAgent,
          createdBy: validated.userId,
        },
      });

      // 4.6. UPDATE CACHED BALANCES (Rule 13 - maintain cache)
      const newFromBalance: number = subtractCents(fromAccount.balanceCents, validated.amountCents);
      const newToBalance: number = addCents(toAccount.balanceCents, validated.amountCents);

      await Promise.all([
        tx.account.update({
          where: { id: validated.fromAccountId },
          data: {
            balanceCents: newFromBalance,
            lastModifiedBy: validated.userId,
          },
        }),
        tx.account.update({
          where: { id: validated.toAccountId },
          data: {
            balanceCents: newToBalance,
            lastModifiedBy: validated.userId,
          },
        }),
      ]);

      return {
        transferId,
        debitTransaction: {
          id: debitTransaction.id,
          amountCents: debitTransaction.amountCents,
        },
        creditTransaction: {
          id: creditTransaction.id,
          amountCents: creditTransaction.amountCents,
        },
      };
    }
  );

  return result;
}

/**
 * PUBLIC API: Execute atomic transfer between accounts
 * Wrapped with centralized error handling
 */
export const transferBetweenAccounts = safeAction(transferBetweenAccountsInternal);

/**
 * Get transfer details by transferId (INTERNAL)
 * Returns both paired transactions (TRANSFER_OUT and TRANSFER_IN)
 */
async function getTransferDetailsInternal(transferId: string): Promise<{
  debitTransaction: Transaction;
  creditTransaction: Transaction;
}> {
  const transactionRepo = getTransactionRepository();
  const transactions = await transactionRepo.findPairedTransfers(transferId);

  if (transactions.length !== 2) {
    throw new NotFoundError('Transfer', transferId);
  }

  const [debitTransaction, creditTransaction] = transactions;

  // Verify double-entry integrity
  if (debitTransaction.amountCents + creditTransaction.amountCents !== 0) {
    console.error('[TRANSFER] Double-entry integrity violation', {
      transferId,
      debit: debitTransaction.amountCents,
      credit: creditTransaction.amountCents,
    });
  }

  return {
    debitTransaction,
    creditTransaction,
  };
}

/**
 * PUBLIC API: Get transfer details
 * Wrapped with centralized error handling
 */
export const getTransferDetails = safeAction(getTransferDetailsInternal);

/**
 * Reverse/cancel a transfer (INTERNAL)
 * Only allowed within 24 hours of transfer
 */
async function reverseTransferInternal(input: {
  transferId: string;
  userId: string;
  reason: string;
}): Promise<TransferResult> {
  const { transferId, userId, reason } = input;

  // Get original transfer
  const originalTransferResult = await getTransferDetailsInternal(transferId);
  const { debitTransaction, creditTransaction } = originalTransferResult;

  // Verify transfer is recent (within 24 hours)
  const transferDate = new Date(debitTransaction.date);
  const hoursSinceTransfer = (Date.now() - transferDate.getTime()) / (1000 * 60 * 60);

  if (hoursSinceTransfer > 24) {
    throw new UnauthorizedError('Transfer cannot be reversed after 24 hours');
  }

  // Verify ownership
  if (debitTransaction.userId !== userId) {
    throw new UnauthorizedError('Transfer does not belong to user');
  }

  // Create reverse transfer (swap from/to accounts)
  const reversalInput: TransferInput = {
    idempotencyKey: crypto.randomUUID(),
    fromAccountId: creditTransaction.accountId, // Swap
    toAccountId: debitTransaction.accountId, // Swap
    amountCents: Math.abs(creditTransaction.amountCents),
    currency: creditTransaction.currency,
    description: `REVERSAL: ${reason} (Original: ${transferId})`,
    userId,
  };

  return await transferBetweenAccountsInternal(reversalInput);
}

/**
 * PUBLIC API: Reverse transfer
 * Wrapped with centralized error handling
 */
export const reverseTransfer = safeAction(reverseTransferInternal);
