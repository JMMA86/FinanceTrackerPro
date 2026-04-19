/**
 * PrismaUserRepository Test Suite
 * Tests user CRUD operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaUserRepository } from '../prisma/PrismaUserRepository';
import { prisma } from '@/lib/db';
import type { User, Currency, Language, Theme } from '@prisma/client';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('PrismaUserRepository', () => {
  let repository: PrismaUserRepository;

  const mockUser: User = {
    id: 'user_123',
    email: 'test@example.com',
    name: 'Test User',
    passwordHash: '$argon2id$hashed',
    baseSalaryCents: 500000,
    baseCurrency: 'COP' as Currency,
    language: 'SPANISH' as Language,
    theme: 'SYSTEM' as Theme,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    lastLoginAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PrismaUserRepository();
  });

  describe('findById', () => {
    it('finds user by ID', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

      const result = await repository.findById('user_123');

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user_123', isActive: true },
      });
    });

    it('returns null if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('filters inactive users', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await repository.findById('user_123');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user_123', isActive: true },
      });
    });
  });

  describe('findByEmail', () => {
    it('finds user by email', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

      const result = await repository.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com', isActive: true },
      });
    });

    it('normalizes email to lowercase', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

      await repository.findByEmail('TEST@EXAMPLE.COM');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com', isActive: true },
      });
    });

    it('returns null if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await repository.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates user with all fields', async () => {
      vi.mocked(prisma.user.create).mockResolvedValue(mockUser);

      const result = await repository.create({
        email: 'new@example.com',
        name: 'New User',
        passwordHash: '$argon2id$hash',
        baseSalaryCents: 500000,
        baseCurrency: 'COP' as Currency,
        language: 'SPANISH' as Language,
        theme: 'DARK' as Theme,
      });

      expect(result).toEqual(mockUser);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'new@example.com',
          name: 'New User',
          passwordHash: '$argon2id$hash',
          baseSalaryCents: 500000,
          baseCurrency: 'COP',
          language: 'SPANISH',
          theme: 'DARK',
        },
      });
    });

    it('creates user with minimal fields', async () => {
      const minimalUser = { ...mockUser, passwordHash: null, baseSalaryCents: null };
      vi.mocked(prisma.user.create).mockResolvedValue(minimalUser);

      const result = await repository.create({
        email: 'minimal@example.com',
        name: 'Minimal User',
      });

      expect(result).toEqual(minimalUser);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'minimal@example.com',
          name: 'Minimal User',
          passwordHash: undefined,
          baseSalaryCents: undefined,
          baseCurrency: undefined,
          language: undefined,
          theme: undefined,
        },
      });
    });

    it('normalizes email to lowercase', async () => {
      vi.mocked(prisma.user.create).mockResolvedValue(mockUser);

      await repository.create({
        email: 'NEW@EXAMPLE.COM',
        name: 'New User',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'new@example.com',
        }),
      });
    });
  });

  describe('updateLastLogin', () => {
    it('updates lastLoginAt timestamp', async () => {
      const now = new Date('2026-04-18T10:00:00Z');
      const updatedUser = { ...mockUser, lastLoginAt: now };
      vi.mocked(prisma.user.update).mockResolvedValue(updatedUser);

      const result = await repository.updateLastLogin('user_123');

      expect(result).toEqual(updatedUser);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user_123' },
        data: {
          lastLoginAt: expect.any(Date),
        },
      });
    });
  });

  describe('softDelete', () => {
    it('soft deletes user', async () => {
      const now = new Date('2026-04-18T10:00:00Z');
      const deletedUser = { ...mockUser, isActive: false, deletedAt: now };
      vi.mocked(prisma.user.update).mockResolvedValue(deletedUser);

      const result = await repository.softDelete('user_123');

      expect(result).toEqual(deletedUser);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user_123' },
        data: {
          isActive: false,
          deletedAt: expect.any(Date),
        },
      });
    });
  });
});
