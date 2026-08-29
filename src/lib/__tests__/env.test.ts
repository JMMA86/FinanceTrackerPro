/**
 * env.ts JWT_SECRET fail-fast validation tests (Fix S3 — CRITICAL).
 *
 * env.ts executes dotenv at import time, so we:
 *  - mock `dotenv` and `dotenv-expand` to avoid real .env side-effects,
 *  - set PRISMA_E2E=1 to skip the dotenv override branch,
 *  - use vi.resetModules() + dynamic import to re-evaluate the module with
 *    controlled NODE_ENV / JWT_SECRET values (via vi.stubEnv because Next.js
 *    augments NODE_ENV as read-only on process.env).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(() => ({ parsed: {} })),
  },
}));

vi.mock('dotenv-expand', () => ({
  default: {
    expand: vi.fn(),
  },
}));

async function loadEnv(): Promise<void> {
  vi.resetModules();
  // Keep env.ts from running dotenv.config with real .env overrides.
  process.env.PRISMA_E2E = '1';
  await import('@/lib/env');
}

describe('env.ts JWT_SECRET validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.PRISMA_E2E;
    vi.resetModules();
  });

  it('throws in production when JWT_SECRET is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.JWT_SECRET;

    await expect(loadEnv()).rejects.toThrow('JWT_SECRET is required in production');
  });

  it('throws when JWT_SECRET is shorter than 32 characters', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'too-short-secret');

    await expect(loadEnv()).rejects.toThrow(
      'JWT_SECRET must be at least 32 characters long for HS256'
    );
  });

  it('does not throw in production with a valid JWT_SECRET (>= 32 chars)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'a'.repeat(32));

    await expect(loadEnv()).resolves.not.toThrow();
  });

  it('warns (without throwing) in development when JWT_SECRET is missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'development');
    delete process.env.JWT_SECRET;

    await expect(loadEnv()).resolves.not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('WARN: JWT_SECRET is not set'));
    warnSpy.mockRestore();
  });
});
