/**
 * Reconciliation Service (CLAUDE.md Rule 13)
 * Source of Truth: Transaction history
 * Account.balanceCents is READ CACHE only
 *
 * CRITICAL: Balance can drift due to race conditions or bugs
 * Reconciliation ensures cached balance matches computed history
 *
 * REFACTORED: Uses Repository Pattern with DI
 */

import 'server-only';
import { addCents, subtractCents } from '@/lib/money';
import { log } from '@/lib/logger';
import type { IAccountRepository } from '@/lib/repositories/interfaces/IAccountRepository';
import type { ITransactionRepository } from '@/lib/repositories/interfaces/ITransactionRepository';

/**
 * Compute true balance from transaction history (SOURCE OF TRUTH)
 * @param accountId Account to compute balance for
 * @param transactionRepo Transaction repository (DI)
 * @returns True balance in cents
 */
export async function getTrueBalance(
  accountId: string,
  transactionRepo: ITransactionRepository
): Promise<number> {
  // Fetch all active transactions for this account
  const transactions = await transactionRepo.findManyByAccountId(accountId);

  let balance = 0;

  for (const tx of transactions) {
    // All amounts already have correct sign in storage:
    // - INCOME: positive
    // - EXPENSE: negative
    // - TRANSFER_IN: positive
    // - TRANSFER_OUT: negative
    // - INVESTMENT: negative
    // - LOAN_PAYMENT: negative
    // - CREDIT_PAYMENT: negative
    balance = addCents(balance, tx.amountCents);
  }

  return balance;
}

/**
 * Reconcile account balance against transaction history
 * Updates cached balance if discrepancy found
 *
 * @param accountId Account to reconcile
 * @param accountRepo Account repository (DI)
 * @param transactionRepo Transaction repository (DI)
 * @returns Reconciliation result with any discrepancy
 */
export async function reconcileAccount(
  accountId: string,
  accountRepo: IAccountRepository,
  transactionRepo: ITransactionRepository
): Promise<{
  success: boolean;
  cachedBalance: number;
  trueBalance: number;
  discrepancy: number;
  wasUpdated: boolean;
}> {
  // Get cached balance
  const account = await accountRepo.findById(accountId);

  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }

  const cachedBalance = account.balanceCents;

  // Compute true balance from transaction history
  const trueBalance = await getTrueBalance(accountId, transactionRepo);

  const discrepancy = subtractCents(cachedBalance, trueBalance);

  // Check for discrepancy
  if (cachedBalance !== trueBalance) {
    // Fix cached balance
    await accountRepo.updateBalance(accountId, trueBalance, 'system-reconciliation');
    await accountRepo.updateReconciliation(accountId, new Date());

    // Log critical discrepancy (should trigger alert)
    log.error(
      {
        accountId,
        accountType: account.type,
        cached: cachedBalance,
        computed: trueBalance,
        diff: discrepancy,
      },
      '[RECONCILIATION] Balance discrepancy detected'
    );

    return {
      success: true,
      cachedBalance,
      trueBalance,
      discrepancy,
      wasUpdated: true,
    };
  }

  // No discrepancy - update lastReconciled timestamp
  await accountRepo.updateReconciliation(accountId, new Date());

  return {
    success: true,
    cachedBalance,
    trueBalance,
    discrepancy: 0,
    wasUpdated: false,
  };
}

/**
 * Reconcile multiple accounts in PARALLEL (OPTIMIZED)
 * Uses Promise.allSettled for concurrent reconciliation
 *
 * @param accountIds Array of account IDs to reconcile
 * @param accountRepo Account repository (DI)
 * @param transactionRepo Transaction repository (DI)
 * @returns Array of reconciliation results
 */
export async function reconcileMultipleAccounts(
  accountIds: string[],
  accountRepo: IAccountRepository,
  transactionRepo: ITransactionRepository
): Promise<
  Array<{
    accountId: string;
    success: boolean;
    discrepancy: number;
    error?: string;
  }>
> {
  // OPTIMIZED: Use Promise.allSettled for concurrent execution
  const settledResults = await Promise.allSettled(
    accountIds.map((accountId) => reconcileAccount(accountId, accountRepo, transactionRepo))
  );

  // Map results to consistent format
  return settledResults.map((result, index) => {
    const accountId = accountIds[index];

    if (result.status === 'fulfilled') {
      return {
        accountId,
        success: result.value.success,
        discrepancy: result.value.discrepancy,
      };
    } else {
      // Rejected promise
      return {
        accountId,
        success: false,
        discrepancy: 0,
        error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
      };
    }
  });
}

/**
 * Reconcile all active accounts for a user (OPTIMIZED)
 * @param userId User ID
 * @param accountRepo Account repository (DI)
 * @param transactionRepo Transaction repository (DI)
 * @returns Summary of reconciliation results
 */
export async function reconcileUserAccounts(
  userId: string,
  accountRepo: IAccountRepository,
  transactionRepo: ITransactionRepository
): Promise<{
  totalAccounts: number;
  reconciledCount: number;
  discrepanciesFound: number;
  totalDiscrepancy: number;
}> {
  // Get all active accounts for user
  const accounts = await accountRepo.findManyByUserId(userId);
  const accountIds = accounts.map((account) => account.id);

  // OPTIMIZED: Reconcile all accounts in parallel
  const results = await reconcileMultipleAccounts(accountIds, accountRepo, transactionRepo);

  let reconciledCount = 0;
  let discrepanciesFound = 0;
  let totalDiscrepancy = 0;

  for (const result of results) {
    if (result.success) {
      reconciledCount++;
      if (result.discrepancy !== 0) {
        discrepanciesFound++;
        totalDiscrepancy = addCents(totalDiscrepancy, Math.abs(result.discrepancy));
      }
    }
  }

  return {
    totalAccounts: accounts.length,
    reconciledCount,
    discrepanciesFound,
    totalDiscrepancy,
  };
}

/**
 * Get balance discrepancy without fixing
 * Used for read-only balance verification
 *
 * @param accountId Account to check
 * @param accountRepo Account repository (DI)
 * @param transactionRepo Transaction repository (DI)
 * @returns Discrepancy in cents (positive = cached is higher)
 */
export async function getBalanceDiscrepancy(
  accountId: string,
  accountRepo: IAccountRepository,
  transactionRepo: ITransactionRepository
): Promise<{
  cachedBalance: number;
  trueBalance: number;
  discrepancy: number;
  needsReconciliation: boolean;
}> {
  const account = await accountRepo.findById(accountId);

  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }

  const cachedBalance = account.balanceCents;
  const trueBalance = await getTrueBalance(accountId, transactionRepo);
  const discrepancy = subtractCents(cachedBalance, trueBalance);

  return {
    cachedBalance,
    trueBalance,
    discrepancy,
    needsReconciliation: discrepancy !== 0,
  };
}

/**
 * Schedule: Run hourly for active accounts with recent activity
 * Alert ops team if discrepancy > $10 (1000 cents)
 *
 * @param accountRepo Account repository (DI)
 * @param transactionRepo Transaction repository (DI)
 */
export async function reconcileActiveAccounts(
  accountRepo: IAccountRepository,
  transactionRepo: ITransactionRepository
): Promise<{
  processed: number;
  discrepanciesFound: number;
  criticalAlerts: number;
}> {
  // Get accounts with activity in last 24 hours
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  const activeAccounts = await accountRepo.findActiveWithRecentActivity(oneDayAgo);
  const accountIds = activeAccounts.map((account) => account.id);

  // OPTIMIZED: Reconcile all accounts in parallel
  const results = await reconcileMultipleAccounts(accountIds, accountRepo, transactionRepo);

  let processed = 0;
  let discrepanciesFound = 0;
  let criticalAlerts = 0;

  for (const result of results) {
    if (result.success) {
      processed++;

      if (result.discrepancy !== 0) {
        discrepanciesFound++;

        // Alert if discrepancy > $10
        if (Math.abs(result.discrepancy) > 1000) {
          criticalAlerts++;
          log.error(
            {
              accountId: result.accountId,
              discrepancy: result.discrepancy,
            },
            '[CRITICAL] Large balance discrepancy - manual review required'
          );
        }
      }
    }
  }

  return {
    processed,
    discrepanciesFound,
    criticalAlerts,
  };
}
