import { z } from 'zod';
import { CurrencySchema } from '@/lib/validations/finance';

export const CardNetworkSchema = z.enum(['NONE', 'VISA', 'MASTERCARD', 'AMEX']);

export const BankAccountTypeSchema = z.enum(['CHECKING', 'CASH', 'SAVINGS', 'POCKET']);

const UUIDv4 = z.uuid('Must be a valid UUID v4');
export const CUID = z.string().regex(/^c[a-z0-9]{20,}$/, 'Must be a valid CUID');
const AccountName = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name too long')
  .trim()
  .regex(/^[\w\s\-áéíóúÁÉÍÓÚñÑüÜ]+$/, 'Name contains invalid characters');

export const CreateAccountSchema = z.object({
  idempotencyKey: UUIDv4,
  name: AccountName,
  type: BankAccountTypeSchema,
  currency: CurrencySchema,
  initialBalanceCents: z
    .number()
    .int('Balance must be an integer')
    .min(0, 'Initial balance cannot be negative')
    .max(9_999_999_999_999, 'Balance too high'),
  interestRateEA: z.number().min(0).max(100).optional(),
  parentAccountId: CUID.optional(),
  cardColor: z.string().max(50).optional(),
  cardNetwork: CardNetworkSchema.optional(),
});

export const UpdateAccountSchema = z.object({
  accountId: CUID,
  name: AccountName.optional(),
  interestRateEA: z.number().min(0).max(100).optional(),
  cardColor: z.string().max(50).optional(),
  cardNetwork: CardNetworkSchema.optional(),
});

export const DeleteAccountSchema = z.object({
  accountId: CUID,
});

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;
export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>;
export type DeleteAccountInput = z.infer<typeof DeleteAccountSchema>;
