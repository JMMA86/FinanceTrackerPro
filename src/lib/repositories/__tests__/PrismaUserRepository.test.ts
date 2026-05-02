import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findById', () => {
    it('should return user when found by id', async () => {
      // Given
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

      // When
      const result = await repository.findById('user_123');

      // Then
      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user_123', isActive: true },
      });
    });

    it('should return null when user is not found', async () => {
      // Given
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      // When
      const result = await repository.findById('nonexistent');

      // Then
      expect(result).toBeNull();
    });

    it('should always filter by isActive=true to exclude soft-deleted users', async () => {
      // Given
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      // When
      await repository.findById('user_123');

      // Then
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user_123', isActive: true },
      });
    });
  });

  describe('findByEmail', () => {
    it('should return user when found by email', async () => {
      // Given
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

      // When
      const result = await repository.findByEmail('test@example.com');

      // Then
      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com', isActive: true },
      });
    });

    it('should normalize email to lowercase before lookup', async () => {
      // Given
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

      // When
      await repository.findByEmail('TEST@EXAMPLE.COM');

      // Then
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com', isActive: true },
      });
    });

    it('should return null when user is not found', async () => {
      // Given
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      // When
      const result = await repository.findByEmail('nonexistent@example.com');

      // Then
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create user with all provided fields', async () => {
      // Given
      vi.mocked(prisma.user.create).mockResolvedValue(mockUser);

      // When
      const result = await repository.create({
        email: 'new@example.com',
        name: 'New User',
        passwordHash: '$argon2id$hash',
        baseSalaryCents: 500000,
        baseCurrency: 'COP' as Currency,
        language: 'SPANISH' as Language,
        theme: 'DARK' as Theme,
      });

      // Then
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

    it('should create user with only required fields', async () => {
      // Given
      const minimalUser = { ...mockUser, passwordHash: null, baseSalaryCents: null };
      vi.mocked(prisma.user.create).mockResolvedValue(minimalUser);

      // When
      const result = await repository.create({
        email: 'minimal@example.com',
        name: 'Minimal User',
      });

      // Then
      expect(result).toEqual(minimalUser);
    });

    it('should normalize email to lowercase on creation', async () => {
      // Given
      vi.mocked(prisma.user.create).mockResolvedValue(mockUser);

      // When
      await repository.create({ email: 'NEW@EXAMPLE.COM', name: 'New User' });

      // Then
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: 'new@example.com' }),
      });
    });
  });

  describe('updateLastLogin', () => {
    it('should update lastLoginAt to the current timestamp', async () => {
      // Given
      const updatedUser = { ...mockUser, lastLoginAt: new Date() };
      vi.mocked(prisma.user.update).mockResolvedValue(updatedUser);

      // When
      const result = await repository.updateLastLogin('user_123');

      // Then
      expect(result).toEqual(updatedUser);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user_123' },
        data: { lastLoginAt: expect.any(Date) },
      });
    });
  });

  describe('softDelete', () => {
    it('should mark user as inactive and set deletedAt timestamp', async () => {
      // Given
      const deletedUser = { ...mockUser, isActive: false, deletedAt: new Date() };
      vi.mocked(prisma.user.update).mockResolvedValue(deletedUser);

      // When
      const result = await repository.softDelete('user_123');

      // Then
      expect(result).toEqual(deletedUser);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user_123' },
        data: { isActive: false, deletedAt: expect.any(Date) },
      });
    });
  });
});
