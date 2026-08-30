import { z } from 'zod';
import { CreateTransactionSchemaBase, TransactionTypeSchema } from '@/lib/validations/finance';
import { CUID } from './account.schema';

/**
 * GetAllTransactions input schema
 * Supports pagination, search, type/date filters, and optional account filter
 */
export const GetAllTransactionsSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(10),
  search: z.string().max(100).optional(),
  typeFilter: TransactionTypeSchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  accountId: CUID.optional(),
});

/**
 * CreateTransaction action schema
 * Based on CreateTransactionSchema but without explicit userId (obtained from session)
 * Restricted to INCOME and EXPENSE only with correct amount signs
 */
export const CreateTransactionActionSchema = CreateTransactionSchemaBase.omit({ userId: true })
  .refine((data) => ['INCOME', 'EXPENSE'].includes(data.type), {
    message: 'Only INCOME and EXPENSE transactions are allowed',
    path: ['type'],
  })
  .refine(
    (data) => {
      if (data.type === 'INCOME' && data.amountCents <= 0) return false;
      if (data.type === 'EXPENSE' && data.amountCents >= 0) return false;
      return true;
    },
    {
      message: 'Amount must be positive for INCOME and negative for EXPENSE',
      path: ['amountCents'],
    }
  );

/**
 * DeleteTransaction input schema
 */
export const DeleteTransactionSchema = z.object({
  transactionId: CUID,
});

export const GetTransactionByIdSchema = z.object({
  transactionId: CUID,
});

/**
 * UpdateTransaction input schema
 * TIPO and CUENTA are NOT editable (not accepted)
 * amountCents must keep the same sign as the original transaction type
 */
export const UpdateTransactionSchema = z.object({
  transactionId: CUID,
  description: z.string().max(500).optional(),
  amountCents: z
    .number()
    .int('Amount must be an integer')
    .min(-9999999999999, 'Amount magnitude exceeds safe limit')
    .max(9999999999999, 'Amount magnitude exceeds safe limit')
    .optional(),
  date: z.coerce.date().optional(),
  categoryId: z.union([CUID, z.null()]).optional(), // null = remove category
});

export type GetAllTransactionsInput = z.infer<typeof GetAllTransactionsSchema>;
export type CreateTransactionActionInput = z.infer<typeof CreateTransactionActionSchema>;
export type DeleteTransactionInput = z.infer<typeof DeleteTransactionSchema>;
export type GetTransactionByIdInput = z.infer<typeof GetTransactionByIdSchema>;
export type UpdateTransactionInput = z.infer<typeof UpdateTransactionSchema>;
