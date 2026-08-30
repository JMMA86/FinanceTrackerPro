import { z } from 'zod';
import { VariableExpenseCategory } from '@prisma/client';
import { CUID } from './account.schema';

export const CategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
  type: z.nativeEnum(VariableExpenseCategory).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color')
    .optional(),
  icon: z.string().max(30).optional(),
});

export const CategoryIdSchema = z.object({
  categoryId: CUID,
});

export const UpdateCategorySchema = CategoryIdSchema.merge(
  z.object({
    name: z.string().min(1, 'Name is required').max(50, 'Name too long').optional(),
    type: z.nativeEnum(VariableExpenseCategory).optional(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color')
      .optional(),
    icon: z.string().max(30).optional(),
  })
);

export type CategoryInput = z.infer<typeof CategorySchema>;
export type CategoryIdInput = z.infer<typeof CategoryIdSchema>;
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;
