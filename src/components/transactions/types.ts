/**
 * Shared types for transaction components.
 *
 * CategoryBrief mirrors the fields consumed by the UI from `getCategories`.
 * `userId === null` identifies a system (shared) category.
 */

export interface CategoryBrief {
  id: string;
  name: string;
  type: string;
  color: string | null;
  userId: string | null;
}

export interface AccountBrief {
  id: string;
  name: string;
  currency: string;
}

/**
 * Category brief attached to a transaction row. Mirrors the Prisma
 * `transaction.category` select (`id`, `name`, `color`) returned by
 * `getAllTransactions`.
 */
export interface TransactionCategoryBrief {
  id: string;
  name: string;
  color: string | null;
}

/**
 * Shared transaction row shape consumed by the transactions table and the
 * create/edit modal. `category` is `null` when the transaction has no
 * category; `categoryId` is kept alongside so the edit modal can prefill the
 * category selector.
 */
export interface TransactionRow {
  id: string;
  description: string | null;
  amountCents: number;
  currency: string;
  type: string;
  date: string | Date;
  accountId: string;
  categoryId: string | null;
  category: TransactionCategoryBrief | null;
  createdAt: string | Date;
}
