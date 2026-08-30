import { z } from 'zod';
import { CUID } from './account.schema';

const VariableExpenseCategoryValues = [
  'GROCERIES',
  'TRANSPORTATION',
  'UTILITIES',
  'ENTERTAINMENT',
  'HEALTHCARE',
  'EDUCATION',
  'SHOPPING',
  'DINING',
  'OTHER',
] as const;

export const CategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
  type: z.enum(VariableExpenseCategoryValues).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color')
    .optional(),
  icon: z.string().max(30).optional(),
});

export const CategoryIdSchema = z.object({
  categoryId: CUID,
});

export const UpdateCategorySchema = CategoryIdSchema.extend({
  name: z.string().min(1, 'Name is required').max(50, 'Name too long').optional(),
  type: z.enum(VariableExpenseCategoryValues).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color')
    .optional(),
  icon: z.string().max(30).optional(),
});

export type CategoryInput = z.infer<typeof CategorySchema>;
export type CategoryIdInput = z.infer<typeof CategoryIdSchema>;
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;
