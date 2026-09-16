/**
 * @vitest-environment node
 *
 * Onboarding Server Actions Integration Tests
 *
 * Runs against the dedicated test database (port 5434 via `vitest.db-setup.ts`)
 * and walks the whole first-run lifecycle: read state, persist a step, update
 * preferences, complete the walkthrough and re-read the persisted flags.
 *
 * Run with: npm run test:coverage
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient, AccountType, Currency, Language, Theme } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// ============================================================================
// Mocks for server-only dependencies
// ============================================================================

const sessionRef = vi.hoisted(() => ({ userId: '' }));

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(() =>
    Promise.resolve(
      sessionRef.userId
        ? { userId: sessionRef.userId, email: `${sessionRef.userId}@example.com`, name: 'Test' }
        : null
    )
  ),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: (key: string) => {
        if (key === 'x-forwarded-for') return '127.0.0.1';
        if (key === 'user-agent') return 'vitest';
        return null;
      },
    })
  ),
  cookies: vi.fn(() => ({
    get: vi.fn(() => undefined),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), unstable_noStore: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));

// ============================================================================
// Test constants + helpers
// ============================================================================

const TEST_DB_URL = process.env.DATABASE_URL!;
const TEST_EMAIL_PREFIX = 'onboarding-integration-';
const TEST_USER_ID = `${TEST_EMAIL_PREFIX}user-${Date.now()}`;
const UNKNOWN_USER_ID = `${TEST_EMAIL_PREFIX}ghost-${Date.now()}`;

let pool: Pool;
let prisma: PrismaClient;

import {
  completeOnboarding,
  getOnboardingState,
  saveOnboardingStep,
  updateOnboardingPreferences,
} from '../onboarding.actions';

async function createUser(id: string) {
  return prisma.user.create({
    data: {
      id,
      email: `${id}@example.com`,
      name: 'Ana Onboarding',
      passwordHash: 'hashed_test_password',
      language: Language.SPANISH,
      theme: Theme.LIGHT,
      baseCurrency: Currency.COP,
      isActive: true,
    },
  });
}

async function createAccount(userId: string, isActive: boolean) {
  return prisma.account.create({
    data: {
      userId,
      name: `Account ${isActive ? 'active' : 'inactive'}`,
      type: AccountType.SAVINGS,
      currency: Currency.COP,
      balanceCents: 0,
      isActive,
      createdBy: userId,
      lastModifiedBy: userId,
    },
  });
}

async function cleanupTestData() {
  await prisma.account.deleteMany({ where: { userId: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: TEST_EMAIL_PREFIX } } });
}

describe('Onboarding Actions Integration', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
    await pool.end();
  });

  beforeEach(async () => {
    await cleanupTestData();
    await createUser(TEST_USER_ID);
    sessionRef.userId = TEST_USER_ID;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('runs the full lifecycle: state → step → preferences → complete → state', async () => {
    const initial = await getOnboardingState({});
    expect(initial.success).toBe(true);
    expect(initial.data).toMatchObject({
      completed: false,
      step: 0,
      name: 'Ana Onboarding',
      baseCurrency: 'COP',
      language: 'SPANISH',
      accountsCount: 0,
    });

    const saved = await saveOnboardingStep({ step: 2 });
    expect(saved.success).toBe(true);
    expect(saved.data).toEqual({ step: 2 });

    const pref = await updateOnboardingPreferences({ language: 'ENGLISH' });
    expect(pref.success).toBe(true);
    expect(pref.data).toEqual({ baseCurrency: 'COP', language: 'ENGLISH' });

    const dbAfterPreferences = await prisma.user.findUniqueOrThrow({ where: { id: TEST_USER_ID } });
    expect(dbAfterPreferences.language).toBe(Language.ENGLISH);
    expect(dbAfterPreferences.baseCurrency).toBe(Currency.COP);
    expect(dbAfterPreferences.onboardingStep).toBe(2);

    const completed = await completeOnboarding({});
    expect(completed.success).toBe(true);
    expect(completed.data?.step).toBe(3);
    expect(completed.data?.completedAt).toEqual(expect.any(String));

    const dbAfterComplete = await prisma.user.findUniqueOrThrow({ where: { id: TEST_USER_ID } });
    expect(dbAfterComplete.onboardingStep).toBe(3);
    expect(dbAfterComplete.onboardingCompletedAt).not.toBeNull();

    const final = await getOnboardingState({});
    expect(final.success).toBe(true);
    expect(final.data?.completed).toBe(true);
    expect(final.data?.step).toBe(3);
  });

  it('counts only active accounts in the onboarding state', async () => {
    await createAccount(TEST_USER_ID, true);
    await createAccount(TEST_USER_ID, true);
    await createAccount(TEST_USER_ID, false);

    const result = await getOnboardingState({});

    expect(result.success).toBe(true);
    expect(result.data?.accountsCount).toBe(2);
  });

  it('persists both preferences when baseCurrency and language are sent together', async () => {
    const result = await updateOnboardingPreferences({ baseCurrency: 'EUR', language: 'GERMAN' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ baseCurrency: 'EUR', language: 'GERMAN' });

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: TEST_USER_ID } });
    expect(dbUser.baseCurrency).toBe(Currency.EUR);
    expect(dbUser.language).toBe(Language.GERMAN);
  });

  it('returns NOT_FOUND when saving a step for a user that no longer exists', async () => {
    sessionRef.userId = UNKNOWN_USER_ID;

    const result = await saveOnboardingStep({ step: 1 });

    expect(result.success).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
  });

  it('returns UNAUTHORIZED when there is no session', async () => {
    sessionRef.userId = '';

    const result = await getOnboardingState({});

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
  });

  it('returns VALIDATION_ERROR for a step outside the walkthrough', async () => {
    const result = await saveOnboardingStep({ step: 99 });

    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: TEST_USER_ID } });
    expect(dbUser.onboardingStep).toBe(0);
  });
});
