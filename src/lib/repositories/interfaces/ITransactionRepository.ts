import type { Transaction, TransactionType, Currency } from '@prisma/client';
import type { Decimal } from 'decimal.js';

export interface ITransactionRepository {
  /**
   * Find transaction by ID
   */
  findById(id: string): Promise<Transaction | null>;

  /**
   * Find transaction by idempotency key
   */
  findByIdempotencyKey(key: string): Promise<Transaction | null>;

  /**
   * Find all active transactions for an account
   */
  findManyByAccountId(accountId: string): Promise<Transaction[]>;

  /**
   * Find paired transactions by transferId
   */
  findPairedTransfers(transferId: string): Promise<Transaction[]>;

  /**
   * Create new transaction
   */
  create(data: {
    idempotencyKey: string;
    userId: string;
    accountId: string;
    type: TransactionType;
    amountCents: number;
    currency: Currency;
    description?: string;
    date?: Date;
    originalAmountCents?: number;
    originalCurrency?: Currency;
    exchangeRate?: Decimal;
    transferId?: string;
    transferToAccountId?: string;
    transferFromAccountId?: string;
    categoryId?: string;
    ipAddress?: string;
    userAgent?: string;
    createdBy: string;
  }): Promise<Transaction>;

  /**
   * Create multiple transactions atomically (for transfers)
   */
  createMany(
    transactions: Array<{
      idempotencyKey: string;
      userId: string;
      accountId: string;
      type: TransactionType;
      amountCents: number;
      currency: Currency;
      description?: string;
      date?: Date;
      transferId?: string;
      transferToAccountId?: string;
      transferFromAccountId?: string;
      ipAddress?: string;
      userAgent?: string;
      createdBy: string;
    }>
  ): Promise<Transaction[]>;

  /**
   * Soft delete transaction
   */
  softDelete(id: string, deletedBy: string): Promise<Transaction>;
}
