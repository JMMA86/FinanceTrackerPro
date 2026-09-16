'use server';
import 'server-only';

import { revalidatePath } from 'next/cache';
import type { Currency, Language, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { safeAction } from '@/lib/utils/action-wrapper';
import { log } from '@/lib/logger';
import { NotFoundError, UnauthorizedError } from '@/lib/errors/api-errors';
import { ONBOARDING_TOTAL_STEPS } from '@/lib/onboarding/steps';
import { SaveOnboardingStepSchema, UpdateOnboardingPreferencesSchema } from './onboarding.schema';

/**
 * Serialized onboarding state consumed by the first-run walkthrough.
 * `accountsCount` lets the UI know whether the user already created their
 * first account (step "account" completion), independently of `step`.
 */
export type OnboardingState = {
  completed: boolean;
  step: number;
  name: string;
  baseCurrency: Currency;
  language: Language;
  accountsCount: number;
};

type SaveOnboardingStepResult = {
  step: number;
};

type UpdateOnboardingPreferencesResult = {
  baseCurrency: Currency;
  language: Language;
};

type CompleteOnboardingResult = {
  completedAt: string;
  step: number;
};

async function getOnboardingStateInternal(_input: Record<string, never>): Promise<OnboardingState> {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      name: true,
      baseCurrency: true,
      language: true,
      onboardingStep: true,
      onboardingCompletedAt: true,
    },
  });
  if (!user) throw new NotFoundError('User', session.userId);

  const accountsCount = await prisma.account.count({
    where: { userId: session.userId, isActive: true },
  });

  log.info({ action: 'onboarding.getState', userId: session.userId }, 'Onboarding state read');

  return {
    completed: user.onboardingCompletedAt !== null,
    step: user.onboardingStep,
    name: user.name,
    baseCurrency: user.baseCurrency,
    language: user.language,
    accountsCount,
  };
}

export const getOnboardingState = safeAction(getOnboardingStateInternal);

async function saveOnboardingStepInternal(input: unknown): Promise<SaveOnboardingStepResult> {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const { step } = SaveOnboardingStepSchema.parse(input);

  const updated = await prisma.user.updateMany({
    where: { id: session.userId },
    data: { onboardingStep: step },
  });
  if (updated.count === 0) throw new NotFoundError('User', session.userId);

  log.info(
    { action: 'onboarding.saveStep', userId: session.userId, step },
    'Onboarding step saved'
  );

  return { step };
}

export const saveOnboardingStep = safeAction(saveOnboardingStepInternal);

async function updateOnboardingPreferencesInternal(
  input: unknown
): Promise<UpdateOnboardingPreferencesResult> {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const preferences = UpdateOnboardingPreferencesSchema.parse(input);

  // Only persist the fields actually provided; the schema guarantees at least one.
  const data: Prisma.UserUpdateManyMutationInput = {
    ...(preferences.baseCurrency !== undefined ? { baseCurrency: preferences.baseCurrency } : {}),
    ...(preferences.language !== undefined ? { language: preferences.language } : {}),
  };

  const updated = await prisma.user.updateMany({
    where: { id: session.userId },
    data,
  });
  if (updated.count === 0) throw new NotFoundError('User', session.userId);

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { baseCurrency: true, language: true },
  });
  if (!user) throw new NotFoundError('User', session.userId);

  log.info(
    { action: 'onboarding.preferences', userId: session.userId, ...data },
    'Onboarding preferences updated'
  );

  return { baseCurrency: user.baseCurrency, language: user.language };
}

export const updateOnboardingPreferences = safeAction(updateOnboardingPreferencesInternal);

async function completeOnboardingInternal(
  _input: Record<string, never>
): Promise<CompleteOnboardingResult> {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const completedAt = new Date();
  const step = ONBOARDING_TOTAL_STEPS - 1;

  const updated = await prisma.user.updateMany({
    where: { id: session.userId },
    data: { onboardingCompletedAt: completedAt, onboardingStep: step },
  });
  if (updated.count === 0) throw new NotFoundError('User', session.userId);

  log.info({ action: 'onboarding.complete', userId: session.userId, step }, 'Onboarding completed');

  revalidatePath('/[lang]/onboarding', 'page');
  revalidatePath('/[lang]/dashboard', 'page');

  return { completedAt: completedAt.toISOString(), step };
}

export const completeOnboarding = safeAction(completeOnboardingInternal);
