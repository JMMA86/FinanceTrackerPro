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
 * REFACTORED: Uses Repository Pattern with DI
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
import { getAccountRepository, getTransactionRepository } from '@/lib/repositories';

/**
 * Transfer result type
 */
type TransferResult = {
  success: boolean;
  transferId?: string;
  debitTransaction?: { id: string; amountCents: number };
  creditTransaction?: { id: string; amountCents: number };
  error?: string;
  wasIdempotent?: boolean;
};

/**
 * Execute atomic transfer between accounts
 * Implements double-entry bookkeeping
 *
 * @param input Transfer input (validated)
 * @returns Transfer result with transaction IDs
 */
export async function transferBetweenAccounts(input: unknown): Promise<TransferResult> {
  try {
    // 1. SERVER-SIDE VALIDATION (Rule 5)
    const validated = TransferSchema.parse(input);

    // Get repositories (DI)
    const transactionRepo = getTransactionRepository();
    const accountRepo = getAccountRepository();

    // 2. IDEMPOTENCY CHECK (Rule 12)
    const existingTransfer = await checkAndLockIdempotency(
      validated.idempotencyKey,
      'transaction',
      transactionRepo
    );

    if (existingTransfer) {
      // Already processed - return idempotent response
      return {
        success: true,
        transferId: (existingTransfer as any).transferId,
        wasIdempotent: true,
      };
    }

    // 3. CAPTURE AUDIT DATA (Rule 14)
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';
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
        const [fromAccount, toAccount]: [
          TransferAccountRecord | null,
          TransferAccountRecord | null,
        ] = await Promise.all([
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
          throw new Error(`Source account ${validated.fromAccountId} not found`);
        }

        if (!toAccount) {
          throw new Error(`Destination account ${validated.toAccountId} not found`);
        }

        if (!fromAccount.isActive) {
          throw new Error('Source account is inactive');
        }

        if (!toAccount.isActive) {
          throw new Error('Destination account is inactive');
        }

        // Verify ownership
        if (fromAccount.userId !== validated.userId) {
          throw new Error('Unauthorized: Source account does not belong to user');
        }

        if (toAccount.userId !== validated.userId) {
          throw new Error('Unauthorized: Destination account does not belong to user');
        }

        // Verify currency match (for now, cross-currency transfers not supported)
        if (fromAccount.currency !== validated.currency) {
          throw new Error('Source account currency mismatch');
        }

        if (toAccount.currency !== validated.currency) {
          throw new Error('Destination account currency mismatch');
        }

        // 4.2. VERIFY SUFFICIENT BALANCE (Rule 13 - Source of Truth)
        // Get true balance from transaction history using repository
        const trueBalance: number = await getTrueBalance(validated.fromAccountId, transactionRepo);

        if (trueBalance < validated.amountCents) {
          throw new Error(
            `Insufficient funds: Balance ${trueBalance} cents, required ${validated.amountCents} cents`
          );
        }

        // 4.3. Generate transfer ID (links both transactions)
        const transferId: string = crypto.randomUUID();

        // 4.4. Create TRANSFER_OUT transaction (debit source)
        const debitTransaction = await tx.transaction.create({
          data: {
            idempotencyKey: validated.idempotencyKey, // Use same key for source transaction
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
        const creditIdempotencyKey: string = crypto.randomUUID(); // Generate new key for destination
        const creditTransaction = await tx.transaction.create({
          data: {
            idempotencyKey: creditIdempotencyKey,
            userId: validated.userId,
            accountId: validated.toAccountId,
            type: 'TRANSFER_IN',
            amountCents: validated.amountCents, // POSITIVE (credit)
            currency: validated.currency,
            description:
              validated.description || `Transfer from account ${validated.fromAccountId}`,
            date: validated.date || new Date(),
            transferId,
            transferFromAccountId: validated.fromAccountId,
            ipAddress,
            userAgent,
            createdBy: validated.userId,
          },
        });

        // 4.6. UPDATE CACHED BALANCES (Rule 13 - maintain cache)
        const newFromBalance: number = subtractCents(
          fromAccount.balanceCents,
          validated.amountCents
        );
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

    // 5. Return success
    return {
      success: true,
      transferId: result.transferId,
      debitTransaction: result.debitTransaction,
      creditTransaction: result.creditTransaction,
      wasIdempotent: false,
    };
  } catch (error) {
    // Handle validation and business logic errors
    if (error instanceof Error) {
      console.error('[TRANSFER] Error:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }

    // Unknown error
    console.error('[TRANSFER] Unknown error:', error);
    return {
      success: false,
      error: 'An unknown error occurred during transfer',
    };
  }
}

/**
 * Get transfer details by transferId
 * Returns both paired transactions (TRANSFER_OUT and TRANSFER_IN)
 *
 * @param transferId UUID linking paired transactions
 * @returns Both transactions or null if not found
 */
export async function getTransferDetails(transferId: string): Promise<{
  success: boolean;
  debitTransaction?: any;
  creditTransaction?: any;
  error?: string;
}> {
  try {
    const transactionRepo = getTransactionRepository();
    const transactions = await transactionRepo.findPairedTransfers(transferId);

    if (transactions.length !== 2) {
      return {
        success: false,
        error: 'Transfer not found or incomplete',
      };
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
      success: true,
      debitTransaction,
      creditTransaction,
    };
  } catch (error) {
    console.error('[TRANSFER] Error fetching transfer details:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Reverse/cancel a transfer (creates inverse transactions)
 * Only allowed within 24 hours of transfer
 *
 * @param transferId Original transfer ID
 * @param userId User requesting reversal
 * @param reason Reason for reversal
 * @returns Reversal result
 */
export async function reverseTransfer(
  transferId: string,
  userId: string,
  reason: string
): Promise<TransferResult> {
  try {
    // Get original transfer
    const originalTransfer = await getTransferDetails(transferId);

    if (!originalTransfer.success || !originalTransfer.debitTransaction) {
      return {
        success: false,
        error: 'Original transfer not found',
      };
    }

    const { debitTransaction, creditTransaction } = originalTransfer;

    // Verify transfer is recent (within 24 hours)
    const transferDate = new Date(debitTransaction.date);
    const hoursSinceTransfer = (Date.now() - transferDate.getTime()) / (1000 * 60 * 60);

    if (hoursSinceTransfer > 24) {
      return {
        success: false,
        error: 'Transfer cannot be reversed after 24 hours',
      };
    }

    // Verify ownership
    if (debitTransaction.userId !== userId) {
      return {
        success: false,
        error: 'Unauthorized: Transfer does not belong to user',
      };
    }

    // Create reverse transfer (swap from/to accounts)
    const reversalInput: TransferInput = {
      idempotencyKey: crypto.randomUUID(),
      fromAccountId: creditTransaction.accountId, // Swap
      toAccountId: debitTransaction.accountId, // Swap
      amountCents: Math.abs(creditTransaction.amountCents),
      currency: creditTransaction.currency as any,
      description: `REVERSAL: ${reason} (Original: ${transferId})`,
      userId,
    };

    return await transferBetweenAccounts(reversalInput);
  } catch (error) {
    console.error('[TRANSFER] Error reversing transfer:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
