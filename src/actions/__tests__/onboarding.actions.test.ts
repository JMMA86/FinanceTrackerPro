/**
 * Onboarding Server Actions Unit Tests
 *
 * Uses mocks for the session, the Prisma client, the Next.js cache and the
 * logger so each action's contract (guards, persisted payloads, revalidation)
 * is asserted in isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/db', () => {
  const mockUser = { findUnique: vi.fn(), updateMany: vi.fn() };
  const mockAccount = { count: vi.fn() };
  return { prisma: { user: mockUser, account: mockAccount } };
});
vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import {
  completeOnboarding,
  getOnboardingState,
  saveOnboardingStep,
  updateOnboardingPreferences,
} from '../onboarding.actions';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { log } from '@/lib/logger';
import { ONBOARDING_TOTAL_STEPS } from '@/lib/onboarding/steps';

const mockGetSession = vi.mocked(getSession);
const mockUser = vi.mocked(prisma.user);
const mockAccount = vi.mocked(prisma.account);
const mockRevalidatePath = vi.mocked(revalidatePath);
const mockLog = vi.mocked(log);

const USER_ID = 'cuser000000000000000001';

function makeSession() {
  return { userId: USER_ID, email: 'test@example.com', name: 'Test' };
}

function makeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Ana',
    baseCurrency: 'COP',
    language: 'SPANISH',
    onboardingStep: 0,
    onboardingCompletedAt: null,
    ...overrides,
  };
}

describe('onboarding.actions.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOnboardingState', () => {
    it('returns UNAUTHORIZED when there is no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const result = await getOnboardingState({});

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
      expect(mockUser.findUnique).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND when the session user no longer exists', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.findUnique.mockResolvedValue(null);

      const result = await getOnboardingState({});

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
      expect(mockAccount.count).not.toHaveBeenCalled();
    });

    it('computes completed=false and counts only active accounts', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.findUnique.mockResolvedValue(makeUserRow() as never);
      mockAccount.count.mockResolvedValue(2);

      const result = await getOnboardingState({});

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        completed: false,
        step: 0,
        name: 'Ana',
        baseCurrency: 'COP',
        language: 'SPANISH',
        accountsCount: 2,
      });
      expect(mockAccount.count).toHaveBeenCalledWith({
        where: { userId: USER_ID, isActive: true },
      });
    });

    it('computes completed=true from a non-null onboardingCompletedAt', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.findUnique.mockResolvedValue(
        makeUserRow({ onboardingCompletedAt: new Date('2026-01-01'), onboardingStep: 3 }) as never
      );
      mockAccount.count.mockResolvedValue(0);

      const result = await getOnboardingState({});

      expect(result.success).toBe(true);
      expect(result.data?.completed).toBe(true);
      expect(result.data?.step).toBe(3);
    });

    it('logs the state read with the session user', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.findUnique.mockResolvedValue(makeUserRow() as never);
      mockAccount.count.mockResolvedValue(0);

      await getOnboardingState({});

      expect(mockLog.info).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'onboarding.getState', userId: USER_ID }),
        expect.any(String)
      );
    });
  });

  describe('saveOnboardingStep', () => {
    it('persists the validated step and returns it', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.updateMany.mockResolvedValue({ count: 1 });

      const result = await saveOnboardingStep({ step: 2 });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ step: 2 });
      expect(mockUser.updateMany).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { onboardingStep: 2 },
      });
    });

    it('returns UNAUTHORIZED when there is no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const result = await saveOnboardingStep({ step: 1 });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
      expect(mockUser.updateMany).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND when no user row is updated', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.updateMany.mockResolvedValue({ count: 0 });

      const result = await saveOnboardingStep({ step: 1 });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });

    it('returns VALIDATION_ERROR for a step beyond the last one', async () => {
      mockGetSession.mockResolvedValue(makeSession());

      const result = await saveOnboardingStep({ step: ONBOARDING_TOTAL_STEPS });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(mockUser.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('updateOnboardingPreferences', () => {
    it('persists only the provided baseCurrency and returns re-read values', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.updateMany.mockResolvedValue({ count: 1 });
      mockUser.findUnique.mockResolvedValue({ baseCurrency: 'USD', language: 'SPANISH' } as never);

      const result = await updateOnboardingPreferences({ baseCurrency: 'USD' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ baseCurrency: 'USD', language: 'SPANISH' });
      expect(mockUser.updateMany).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { baseCurrency: 'USD' },
      });
      const call = mockUser.updateMany.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(call.data).not.toHaveProperty('language');
    });

    it('persists only the provided language', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.updateMany.mockResolvedValue({ count: 1 });
      mockUser.findUnique.mockResolvedValue({ baseCurrency: 'COP', language: 'ENGLISH' } as never);

      const result = await updateOnboardingPreferences({ language: 'ENGLISH' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ baseCurrency: 'COP', language: 'ENGLISH' });
      expect(mockUser.updateMany).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { language: 'ENGLISH' },
      });
      const call = mockUser.updateMany.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(call.data).not.toHaveProperty('baseCurrency');
    });

    it('persists both preferences when both are provided', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.updateMany.mockResolvedValue({ count: 1 });
      mockUser.findUnique.mockResolvedValue({ baseCurrency: 'EUR', language: 'GERMAN' } as never);

      const result = await updateOnboardingPreferences({ baseCurrency: 'EUR', language: 'GERMAN' });

      expect(result.success).toBe(true);
      expect(mockUser.updateMany).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { baseCurrency: 'EUR', language: 'GERMAN' },
      });
    });

    it('returns UNAUTHORIZED when there is no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const result = await updateOnboardingPreferences({ language: 'ENGLISH' });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
      expect(mockUser.updateMany).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND when the update touches no user row', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.updateMany.mockResolvedValue({ count: 0 });

      const result = await updateOnboardingPreferences({ language: 'ENGLISH' });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
      expect(mockUser.findUnique).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND when the user cannot be re-read after the update', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.updateMany.mockResolvedValue({ count: 1 });
      mockUser.findUnique.mockResolvedValue(null);

      const result = await updateOnboardingPreferences({ baseCurrency: 'USD' });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });

    it('returns VALIDATION_ERROR when neither preference is provided', async () => {
      mockGetSession.mockResolvedValue(makeSession());

      const result = await updateOnboardingPreferences({});

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(mockUser.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('completeOnboarding', () => {
    it('sets onboardingCompletedAt and the last step, then revalidates both routes', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.updateMany.mockResolvedValue({ count: 1 });

      const result = await completeOnboarding({});

      expect(result.success).toBe(true);
      expect(result.data?.step).toBe(ONBOARDING_TOTAL_STEPS - 1);
      expect(result.data?.completedAt).toEqual(expect.any(String));
      expect(mockUser.updateMany).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          onboardingCompletedAt: expect.any(Date),
          onboardingStep: ONBOARDING_TOTAL_STEPS - 1,
        },
      });
      expect(mockRevalidatePath).toHaveBeenCalledWith('/[lang]/onboarding', 'page');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/[lang]/dashboard', 'page');
    });

    it('returns UNAUTHORIZED when there is no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const result = await completeOnboarding({});

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND when no user row is updated', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.updateMany.mockResolvedValue({ count: 0 });

      const result = await completeOnboarding({});

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });
});
