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
 * TYPES: Interfaces extracted to src/types/transfer.ts
 */

'use server';
import 'server-only';

import { revalidatePath } from 'next/cache';
import type { Prisma, Transaction, ApiAction } from '@prisma/client';
import { prisma } from '@/lib/db';
import { addCents, subtractCents } from '@/lib/money';
import { log } from '@/lib/logger';
import { getTrueBalance } from '@/services/reconciliation.service';
import { checkAndLockIdempotency } from '@/services/idempotency.service';
import {
  checkApiRateLimit,
  recordApiAttempt,
  markApiAttemptSuccess,
} from '@/services/rate-limit.service';
import { getClientInfo } from '@/lib/utils/client-info';
import { TransferSchema, type TransferInput } from '@/lib/validations/finance';
import { getTransactionRepository } from '@/lib/repositories';
import { safeAction } from '@/lib/utils/action-wrapper';
import { getSession } from '@/lib/auth/session';
import {
  NotFoundError,
  InsufficientFundsError,
  UnauthorizedError,
  CurrencyMismatchError,
  InactiveAccountError,
  RateLimitError,
  PocketTransferError,
} from '@/lib/errors/api-errors';
import type {
  TransferResult,
  TransferAccountRecord,
  TransferTransactionResult,
  PairedTransferTransactions,
  ReverseTransferInput,
} from '@/types/transfer';

/**
 * Validate pocket hierarchy rules for a transfer pair.
 * Pockets can only move money within their parent account:
 *  - POCKET source -> its parent account OR a sibling pocket
 *  - Non-POCKET source -> its own pocket OR another non-pocket account
 * Any other combination is rejected with a typed PocketTransferError.
 */
function assertValidTransferPair(
  from: { id: string; type: string; parentAccountId: string | null },
  to: { id: string; type: string; parentAccountId: string | null }
): void {
  if (from.id === to.id) return; // ya lo rechaza el schema
  const fromIsPocket = from.type === 'POCKET';
  const toIsPocket = to.type === 'POCKET';

  if (fromIsPocket) {
    const toIsParent = to.id === from.parentAccountId;
    const toIsSiblingPocket =
      toIsPocket && to.parentAccountId !== null && to.parentAccountId === from.parentAccountId;
    if (!toIsParent && !toIsSiblingPocket) {
      throw new PocketTransferError();
    }
    return;
  }

  // Origen no-bolsillo
  const toIsOwnPocket = toIsPocket && to.parentAccountId === from.id;
  const toIsExternal = !toIsPocket;
  if (!toIsOwnPocket && !toIsExternal) {
    throw new PocketTransferError();
  }
}

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

  // SESSION VALIDATION (Zero-Trust)
  const session = await getSession();
  if (!session?.userId) {
    throw new UnauthorizedError();
  }
  if (session.userId !== validated.userId) {
    throw new UnauthorizedError('User ID does not match session');
  }

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

  // 3. RATE LIMITING (Rule 10)
  const { ipAddress, userAgent } = await getClientInfo();
  const rateLimit = await checkApiRateLimit(validated.userId, 'TRANSFER_CREATE' as ApiAction);
  if (!rateLimit.allowed) {
    log.warn(
      { action: 'transfer.rate_limited', userId: validated.userId, ipAddress },
      'Transfer creation rate limited'
    );
    throw new RateLimitError();
  }

  // Log transfer initiation
  log.info(
    {
      action: 'TRANSFER_INITIATED',
      fromAccountId: validated.fromAccountId,
      toAccountId: validated.toAccountId,
      amountCents: validated.amountCents,
      currency: validated.currency,
      idempotencyKey: validated.idempotencyKey,
      userId: validated.userId,
      ipAddress,
    },
    '[TRANSFER] Transfer initiated'
  );

  // 4. ATOMIC TRANSACTION (Rule 3)
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
              type: true,
              parentAccountId: true,
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
              type: true,
              parentAccountId: true,
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

      // Verify pocket hierarchy rules (pockets stay within their parent account)
      assertValidTransferPair(fromAccount, toAccount);

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
          description: validated.description ?? null,
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
          description: validated.description ?? null,
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

  // Record successful API attempt (best-effort)
  try {
    const attemptId = await recordApiAttempt({
      userId: validated.userId,
      action: 'TRANSFER_CREATE' as ApiAction,
      ipAddress,
    });
    await markApiAttemptSuccess(attemptId);
  } catch (err) {
    log.error({ err, userId: validated.userId }, 'Failed to record API attempt');
  }

  // Log successful transfer
  log.info(
    {
      action: 'TRANSFER_SUCCESS',
      transferId: result.transferId,
      debitTransactionId: result.debitTransaction.id,
      creditTransactionId: result.creditTransaction.id,
      amountCents: validated.amountCents,
      currency: validated.currency,
      userId: validated.userId,
      ipAddress,
    },
    '[TRANSFER] Transfer completed successfully'
  );

  // Revalidate dashboard cache after transfer
  revalidatePath('/[lang]/dashboard', 'page');
  revalidatePath('/[lang]/accounts', 'page');
  revalidatePath('/[lang]/transactions', 'page');

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
async function getTransferDetailsInternal(transferId: string): Promise<PairedTransferTransactions> {
  const transactionRepo = getTransactionRepository();
  const transactions = await transactionRepo.findPairedTransfers(transferId);

  if (transactions.length !== 2) {
    throw new NotFoundError('Transfer', transferId);
  }

  const [debitTransaction, creditTransaction] = transactions;

  // Verify double-entry integrity
  if (debitTransaction.amountCents + creditTransaction.amountCents !== 0) {
    log.error(
      {
        transferId,
        debit: debitTransaction.amountCents,
        credit: creditTransaction.amountCents,
      },
      '[TRANSFER] Double-entry integrity violation'
    );
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
async function reverseTransferInternal(input: ReverseTransferInput): Promise<TransferResult> {
  const { transferId, userId, reason } = input;

  // SESSION VALIDATION (Zero-Trust)
  const session = await getSession();
  if (!session?.userId) {
    throw new UnauthorizedError();
  }
  if (session.userId !== userId) {
    throw new UnauthorizedError('User ID does not match session');
  }

  // Rate limiting (Rule 10)
  const { ipAddress } = await getClientInfo();
  const rateLimit = await checkApiRateLimit(userId, 'TRANSFER_REVERSE' as ApiAction);
  if (!rateLimit.allowed) {
    log.warn(
      { action: 'transfer.reverse.rate_limited', userId, ipAddress },
      'Transfer reversal rate limited'
    );
    throw new RateLimitError();
  }

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

  const result = await transferBetweenAccountsInternal(reversalInput);

  // Record successful API attempt (best-effort)
  try {
    const attemptId = await recordApiAttempt({
      userId,
      action: 'TRANSFER_REVERSE' as ApiAction,
      ipAddress,
    });
    await markApiAttemptSuccess(attemptId);
  } catch (err) {
    log.error({ err, userId }, 'Failed to record API attempt');
  }

  return result;
}

/**
 * PUBLIC API: Reverse transfer
 * Wrapped with centralized error handling
 */
export const reverseTransfer = safeAction(reverseTransferInternal);
