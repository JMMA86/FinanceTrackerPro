import { describe, it, expect, afterEach, vi } from 'vitest';

describe('db/index.ts', () => {
  const originalEnv = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalEnv;
    vi.resetModules();
  });

  describe('when DATABASE_URL is missing', () => {
    it('should throw an error on import', async () => {
      // Given
      delete process.env.DATABASE_URL;

      // When / Then
      await expect(async () => {
        await import('../index');
      }).rejects.toThrow('DATABASE_URL is not defined in environment variables');
    });
  });

  describe('when DATABASE_URL is defined', () => {
    it('should initialize and export the prisma client', async () => {
      // Given
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

      // When
      const { prisma } = await import('../index');

      // Then
      expect(prisma).toBeDefined();
    });
  });
});
