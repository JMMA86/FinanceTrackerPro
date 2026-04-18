/**
 * Reconciliation Service (CLAUDE.md Rule 13)
 * Source of Truth: Transaction history
 * Account.balanceCents is READ CACHE only
 *
 * CRITICAL: Balance can drift due to race conditions or bugs
 * Reconciliation ensures cached balance matches computed history
 */

import 'server-only';
import { prisma } from '@/lib/db';
import { addCents, subtractCents } from '@/lib/money';

/**
 * Compute true balance from transaction history (SOURCE OF TRUTH)
 * @param accountId Account to compute balance for
 * @returns True balance in cents
 */
export async function getTrueBalance(accountId: string): Promise<number> {
  // Fetch all active transactions for this account
  const transactions = await prisma.transaction.findMany({
    where: {
      accountId,
      isActive: true,
    },
    select: {
      amountCents: true,
      type: true,
    },
  });

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
 * @returns Reconciliation result with any discrepancy
 */
export async function reconcileAccount(accountId: string): Promise<{
  success: boolean;
  cachedBalance: number;
  trueBalance: number;
  discrepancy: number;
  wasUpdated: boolean;
}> {
  // Get cached balance
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { balanceCents: true, type: true },
  });

  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }

  const cachedBalance = account.balanceCents;

  // Compute true balance from transaction history
  const trueBalance = await getTrueBalance(accountId);

  const discrepancy = subtractCents(cachedBalance, trueBalance);

  // Check for discrepancy
  if (cachedBalance !== trueBalance) {
    // Fix cached balance
    await prisma.account.update({
      where: { id: accountId },
      data: {
        balanceCents: trueBalance,
        lastReconciled: new Date(),
        lastModifiedBy: 'system-reconciliation',
      },
    });

    // Log critical discrepancy (should trigger alert)
    console.error('[RECONCILIATION] Balance discrepancy detected', {
      accountId,
      accountType: account.type,
      cached: cachedBalance,
      computed: trueBalance,
      diff: discrepancy,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      cachedBalance,
      trueBalance,
      discrepancy,
      wasUpdated: true,
    };
  }

  // No discrepancy - update lastReconciled timestamp
  await prisma.account.update({
    where: { id: accountId },
    data: {
      lastReconciled: new Date(),
    },
  });

  return {
    success: true,
    cachedBalance,
    trueBalance,
    discrepancy: 0,
    wasUpdated: false,
  };
}

/**
 * Reconcile multiple accounts in batch
 * @param accountIds Array of account IDs to reconcile
 * @returns Array of reconciliation results
 */
export async function reconcileMultipleAccounts(accountIds: string[]): Promise<
  Array<{
    accountId: string;
    success: boolean;
    discrepancy: number;
    error?: string;
  }>
> {
  const results = [];

  for (const accountId of accountIds) {
    try {
      const result = await reconcileAccount(accountId);
      results.push({
        accountId,
        success: result.success,
        discrepancy: result.discrepancy,
      });
    } catch (error) {
      results.push({
        accountId,
        success: false,
        discrepancy: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

/**
 * Reconcile all active accounts for a user
 * @param userId User ID
 * @returns Summary of reconciliation results
 */
export async function reconcileUserAccounts(userId: string): Promise<{
  totalAccounts: number;
  reconciledCount: number;
  discrepanciesFound: number;
  totalDiscrepancy: number;
}> {
  // Get all active accounts for user
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      isActive: true,
    },
    select: { id: true },
  });

  let reconciledCount = 0;
  let discrepanciesFound = 0;
  let totalDiscrepancy = 0;

  for (const account of accounts) {
    try {
      const result = await reconcileAccount(account.id);
      reconciledCount++;

      if (result.discrepancy !== 0) {
        discrepanciesFound++;
        totalDiscrepancy = addCents(totalDiscrepancy, Math.abs(result.discrepancy));
      }
    } catch (error) {
      console.error(`[RECONCILIATION] Failed for account ${account.id}`, error);
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
 * @returns Discrepancy in cents (positive = cached is higher)
 */
export async function getBalanceDiscrepancy(accountId: string): Promise<{
  cachedBalance: number;
  trueBalance: number;
  discrepancy: number;
  needsReconciliation: boolean;
}> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { balanceCents: true },
  });

  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }

  const cachedBalance = account.balanceCents;
  const trueBalance = await getTrueBalance(accountId);
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
 */
export async function reconcileActiveAccounts(): Promise<{
  processed: number;
  discrepanciesFound: number;
  criticalAlerts: number;
}> {
  // Get accounts with activity in last 24 hours
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  const activeAccounts = await prisma.account.findMany({
    where: {
      isActive: true,
      transactions: {
        some: {
          createdAt: { gte: oneDayAgo },
        },
      },
    },
    select: { id: true },
  });

  let processed = 0;
  let discrepanciesFound = 0;
  let criticalAlerts = 0;

  for (const account of activeAccounts) {
    try {
      const result = await reconcileAccount(account.id);
      processed++;

      if (result.discrepancy !== 0) {
        discrepanciesFound++;

        // Alert if discrepancy > $10
        if (Math.abs(result.discrepancy) > 1000) {
          criticalAlerts++;
          console.error('[CRITICAL] Large balance discrepancy', {
            accountId: account.id,
            discrepancy: result.discrepancy,
          });
          // TODO: Send alert to ops team (email, Slack, PagerDuty)
        }
      }
    } catch (error) {
      console.error(`[RECONCILIATION] Error for account ${account.id}`, error);
    }
  }

  return {
    processed,
    discrepanciesFound,
    criticalAlerts,
  };
}
