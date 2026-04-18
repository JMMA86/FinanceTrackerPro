import type { Account, AccountType, Currency } from '@prisma/client';

export interface IAccountRepository {
  /**
   * Find account by ID
   */
  findById(id: string): Promise<Account | null>;

  /**
   * Find all active accounts for a user
   */
  findManyByUserId(userId: string): Promise<Account[]>;

  /**
   * Find accounts with recent activity (for reconciliation)
   */
  findActiveWithRecentActivity(since: Date): Promise<Account[]>;

  /**
   * Update account balance (cached value)
   */
  updateBalance(id: string, balanceCents: number, lastModifiedBy: string): Promise<Account>;

  /**
   * Update reconciliation timestamp
   */
  updateReconciliation(id: string, lastReconciled: Date): Promise<Account>;

  /**
   * Create new account
   */
  create(data: {
    userId: string;
    name: string;
    type: AccountType;
    currency: Currency;
    balanceCents?: number;
    interestRateEA?: number;
    creditLimitCents?: number;
    cutoffDay?: number;
    paymentDueDay?: number;
    parentAccountId?: string;
    createdBy: string;
  }): Promise<Account>;

  /**
   * Soft delete account
   */
  softDelete(id: string, deletedBy: string): Promise<Account>;
}
