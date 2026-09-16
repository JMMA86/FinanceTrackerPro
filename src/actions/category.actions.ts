'use server';
import 'server-only';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { safeAction } from '@/lib/utils/action-wrapper';
import { log } from '@/lib/logger';
import { NotFoundError, UnauthorizedError } from '@/lib/errors/api-errors';
import { CategorySchema, CategoryIdSchema, UpdateCategorySchema } from './category.schema';

// ============================================================================
// getCategories — Return system + user categories (active only)
// ============================================================================

async function getCategoriesInternal(_input: Record<string, never>) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const categories = await prisma.category.findMany({
    where: {
      isActive: true,
      OR: [{ userId: null }, { userId: session.userId }],
    },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });

  return categories;
}

export const getCategories = safeAction(getCategoriesInternal);

// ============================================================================
// createCategory — Create a user-defined category
// ============================================================================

async function createCategoryInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = CategorySchema.parse(input);

  const category = await prisma.category.create({
    data: {
      name: validated.name,
      type: validated.type ?? 'OTHER',
      color: validated.color ?? null,
      icon: validated.icon ?? null,
      userId: session.userId,
      createdBy: session.userId,
      lastModifiedBy: session.userId,
    },
  });

  log.info(
    { action: 'category.create', categoryId: category.id, userId: session.userId },
    'Category created'
  );

  revalidatePath('/[lang]/transactions', 'page');
  revalidatePath('/[lang]/dashboard', 'page');

  return category;
}

export const createCategory = safeAction(createCategoryInternal);

// ============================================================================
// updateCategory — Update own category only
// ============================================================================

async function updateCategoryInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = UpdateCategorySchema.parse(input);

  const category = await prisma.category.findUnique({
    where: { id: validated.categoryId },
  });

  if (!category?.isActive) throw new NotFoundError('Category', validated.categoryId);
  if (!category.userId) throw new UnauthorizedError('System categories cannot be modified');
  if (category.userId !== session.userId)
    throw new UnauthorizedError('Category does not belong to user');

  const updated = await prisma.category.update({
    where: { id: validated.categoryId },
    data: {
      ...(validated.name !== undefined && { name: validated.name }),
      ...(validated.type !== undefined && { type: validated.type }),
      ...(validated.color !== undefined && { color: validated.color }),
      ...(validated.icon !== undefined && { icon: validated.icon }),
      lastModifiedBy: session.userId,
    },
  });

  log.info(
    { action: 'category.update', categoryId: updated.id, userId: session.userId },
    'Category updated'
  );

  revalidatePath('/[lang]/transactions', 'page');
  revalidatePath('/[lang]/dashboard', 'page');

  return updated;
}

export const updateCategory = safeAction(updateCategoryInternal);

// ============================================================================
// deleteCategory — Soft delete own category only
// ============================================================================

async function deleteCategoryInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const { categoryId } = CategoryIdSchema.parse(input);

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
  });

  if (!category?.isActive) throw new NotFoundError('Category', categoryId);
  if (!category.userId) throw new UnauthorizedError('System categories cannot be deleted');
  if (category.userId !== session.userId)
    throw new UnauthorizedError('Category does not belong to user');

  await prisma.category.update({
    where: { id: categoryId },
    data: {
      isActive: false,
      deletedAt: new Date(),
      lastModifiedBy: session.userId,
    },
  });

  log.info(
    { action: 'category.delete', categoryId, userId: session.userId },
    'Category soft-deleted'
  );

  revalidatePath('/[lang]/transactions', 'page');
  revalidatePath('/[lang]/dashboard', 'page');

  return { success: true, categoryId };
}

export const deleteCategory = safeAction(deleteCategoryInternal);
