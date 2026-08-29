/**
 * @vitest-environment node
 *
 * Authentication Actions Integration Tests
 * Tests auth operations following CLAUDE.md rules and sec-ops fixes
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Ensure JWT_SECRET is set before session.ts is evaluated
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-testing-min-32-characters-long';

// ============================================================================
// Test constants
// ============================================================================

const TEST_DB_URL = process.env.DATABASE_URL!;
const TEST_USER_PREFIX = 'auth-test-user-';

let pool: Pool;
let prisma: PrismaClient;

// ============================================================================
// Mocks for server-only dependencies
// ============================================================================

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
  cookies: vi.fn(() =>
    Promise.resolve({
      set: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    })
  ),
}));

vi.mock('next/cache', () => {
  const revalidatePath = vi.fn();
  const unstable_noStore = vi.fn();
  return { revalidatePath, unstable_noStore };
});

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
// Test helpers
// ============================================================================

function genEmail(): string {
  return `${TEST_USER_PREFIX}${Date.now()}@example.com`;
}

async function cleanupTestData() {
  await prisma.loginAttempt.deleteMany({
    where: { email: { startsWith: TEST_USER_PREFIX } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: TEST_USER_PREFIX } },
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('Auth Actions Integration', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
    await pool.end();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Registration
  // ==========================================================================

  describe('registerAction', () => {
    it('should register a user with real Argon2 hash', async () => {
      const { registerAction } = await import('../auth.actions');
      const email = genEmail();

      const result = await registerAction({
        email,
        name: 'Integration Test User',
        password: 'SecurePass1234',
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        email,
        name: 'Integration Test User',
      });

      const dbUser = await prisma.user.findUnique({ where: { email } });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('should reject duplicate email registration', async () => {
      const { registerAction } = await import('../auth.actions');
      const email = genEmail();

      await registerAction({
        email,
        name: 'First User',
        password: 'SecurePass1234',
      });

      const result = await registerAction({
        email,
        name: 'Second User',
        password: 'SecurePass1234',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('AUTH_ERROR');
    });

    it('should reject password shorter than 12 characters', async () => {
      const { registerAction } = await import('../auth.actions');
      const email = genEmail();

      const result = await registerAction({
        email,
        name: 'Test',
        password: 'Short1',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });
  });

  // ==========================================================================
  // Login
  // ==========================================================================

  describe('loginAction', () => {
    it('should login with correct credentials and update lastLoginAt', async () => {
      const { registerAction, loginAction } = await import('../auth.actions');
      const email = genEmail();

      await registerAction({
        email,
        name: 'Login Test',
        password: 'SecurePass1234',
      });

      const beforeLogin = new Date();
      const result = await loginAction({
        email,
        password: 'SecurePass1234',
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ email });
      expect(result.data).toHaveProperty('lastLoginAt');
      expect(result.data).not.toHaveProperty('ipAddress');

      const dbUser = await prisma.user.findUnique({ where: { email } });
      expect(dbUser?.lastLoginAt).not.toBeNull();
      expect(dbUser!.lastLoginAt!.getTime()).toBeGreaterThanOrEqual(beforeLogin.getTime());
    });

    it('should reject login with wrong password and record failed attempt', async () => {
      const { registerAction, loginAction } = await import('../auth.actions');
      const email = genEmail();

      await registerAction({
        email,
        name: 'Failed Login Test',
        password: 'SecurePass1234',
      });

      const result = await loginAction({
        email,
        password: 'WrongPassword123',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('AUTH_ERROR');

      const attempts = await prisma.loginAttempt.findMany({
        where: { email },
        orderBy: { createdAt: 'desc' },
      });

      expect(attempts).toHaveLength(1);
      expect(attempts[0].success).toBe(false);
      expect(attempts[0].ipAddress).toBe('127.0.0.1');
    });

    it('should record successful login attempt', async () => {
      const { registerAction, loginAction } = await import('../auth.actions');
      const email = genEmail();

      await registerAction({
        email,
        name: 'Success Login Test',
        password: 'SecurePass1234',
      });

      await loginAction({
        email,
        password: 'SecurePass1234',
      });

      const attempts = await prisma.loginAttempt.findMany({
        where: { email, success: true },
      });

      expect(attempts).toHaveLength(1);
      expect(attempts[0].ipAddress).toBe('127.0.0.1');
    });
  });

  // ==========================================================================
  // Rate Limiting
  // ==========================================================================

  describe('rate limiting', () => {
    it('should block login after 5 failed attempts for the same email', async () => {
      const { registerAction, loginAction } = await import('../auth.actions');
      const email = genEmail();

      await registerAction({
        email,
        name: 'Rate Limit Test',
        password: 'SecurePass1234',
      });

      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        const r = await loginAction({ email, password: 'WrongPassword123' });
        expect(r.success).toBe(false);
      }

      // 6th attempt should be rate limited
      const result = await loginAction({ email, password: 'WrongPassword123' });

      expect(result.success).toBe(false);
      expect(result.code).toBe('RATE_LIMITED');
    });
  });

  // ==========================================================================
  // Logout
  // ==========================================================================

  describe('logoutAction', () => {
    it('should return success on logout', async () => {
      const { logoutAction } = await import('../auth.actions');

      const result = await logoutAction(undefined);

      expect(result.success).toBe(true);
    });
  });
});
