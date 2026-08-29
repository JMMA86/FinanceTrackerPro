/**
 * env.ts JWT_SECRET fail-fast validation tests.
 *
 * validateJwtSecret is a pure function — no dotenv, no side effects —
 * safe to test directly without module reload hacks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateJwtSecret } from '@/lib/env';

describe('validateJwtSecret', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('does not throw in production with a valid JWT_SECRET (>= 32 chars)', () => {
    expect(() => validateJwtSecret('a'.repeat(32), 'production')).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('throws in production when JWT_SECRET is missing', () => {
    expect(() => validateJwtSecret(undefined, 'production')).toThrow(
      'FATAL: JWT_SECRET is required in production'
    );
  });

  it('warns (without throwing) in development when JWT_SECRET is missing', () => {
    expect(() => validateJwtSecret(undefined, 'development')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('WARN: JWT_SECRET is not set'));
  });

  it('throws when JWT_SECRET is shorter than 32 characters in production', () => {
    expect(() => validateJwtSecret('corto', 'production')).toThrow(
      'FATAL: JWT_SECRET must be at least 32 characters long for HS256'
    );
  });

  it('throws when JWT_SECRET is shorter than 32 characters in development', () => {
    expect(() => validateJwtSecret('corto', 'development')).toThrow(
      'FATAL: JWT_SECRET must be at least 32 characters long for HS256'
    );
  });

  it('throws with empty string in production (treated as missing)', () => {
    expect(() => validateJwtSecret('', 'production')).toThrow(
      'FATAL: JWT_SECRET is required in production'
    );
  });
});
