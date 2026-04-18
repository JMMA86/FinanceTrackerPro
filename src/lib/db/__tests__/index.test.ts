/**
 * Database Connection Test Suite
 * Tests Prisma client initialization and DATABASE_URL validation
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

describe('db/index.ts', () => {
  const originalEnv = process.env.DATABASE_URL;

  afterEach(() => {
    // Restore original DATABASE_URL
    process.env.DATABASE_URL = originalEnv;
    // Clear module cache to allow re-import
    vi.resetModules();
  });

  it('should throw error when DATABASE_URL is not defined', async () => {
    // Remove DATABASE_URL
    delete process.env.DATABASE_URL;

    // Attempt to import module - should throw
    await expect(async () => {
      await import('../index');
    }).rejects.toThrow('DATABASE_URL is not defined in environment variables');
  });

  it('should initialize prisma when DATABASE_URL is defined', async () => {
    // Ensure DATABASE_URL exists
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

    // Import should succeed
    const { prisma } = await import('../index');
    expect(prisma).toBeDefined();
  });
});
