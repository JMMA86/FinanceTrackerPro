/**
 * Auth Actions Test Suite
 * Tests registration, login, and security validations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerAction, loginAction } from '../auth.actions';
import * as argon2 from 'argon2';
import { getUserRepository } from '@/lib/repositories';
import type { User } from '@prisma/client';

vi.mock('argon2');
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({
    get: vi.fn((key: string) => {
      if (key === 'x-forwarded-for') return '192.168.1.1';
      if (key === 'user-agent') return 'Mozilla/5.0';
      return null;
    }),
  }),
  cookies: vi.fn(() => ({
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  })),
}));
vi.mock('@/lib/repositories');
vi.mock('@/lib/auth/session', () => ({
  createSession: vi.fn().mockResolvedValue('mock-token'),
  setSessionCookie: vi.fn(),
  deleteSession: vi.fn(),
}));

describe('Auth Actions', () => {
  const mockUser: User = {
    id: 'user_123',
    email: 'test@example.com',
    name: 'Test User',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
    baseSalaryCents: null,
    baseCurrency: 'COP',
    language: 'SPANISH',
    theme: 'SYSTEM',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    lastLoginAt: null,
  };

  const mockUserRepo = {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    create: vi.fn(),
    updateLastLogin: vi.fn(),
    softDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserRepository).mockReturnValue(mockUserRepo);
  });

  describe('registerAction', () => {
    it('creates user with hashed password', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);
      mockUserRepo.create.mockResolvedValue(mockUser);
      vi.mocked(argon2.hash).mockResolvedValue('$argon2id$hashed_password');

      const result = await registerAction({
        email: 'new@example.com',
        name: 'New User',
        password: 'SecurePass123',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
      });
      expect(argon2.hash).toHaveBeenCalledWith('SecurePass123', {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });
      expect(mockUserRepo.create).toHaveBeenCalledWith({
        email: 'new@example.com',
        name: 'New User',
        passwordHash: '$argon2id$hashed_password',
      });
    });

    it('rejects duplicate email', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(mockUser);

      const result = await registerAction({
        email: 'test@example.com',
        name: 'Duplicate User',
        password: 'SecurePass123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Email already registered');
      expect(mockUserRepo.create).not.toHaveBeenCalled();
    });

    it('validates email format', async () => {
      const result = await registerAction({
        email: 'invalid-email',
        name: 'Test User',
        password: 'SecurePass123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('validates password strength', async () => {
      const result = await registerAction({
        email: 'test@example.com',
        name: 'Test User',
        password: 'weak',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('validates name length', async () => {
      const result = await registerAction({
        email: 'test@example.com',
        name: 'A',
        password: 'SecurePass123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('normalizes email to lowercase', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);
      mockUserRepo.create.mockResolvedValue(mockUser);
      vi.mocked(argon2.hash).mockResolvedValue('$argon2id$hashed');

      await registerAction({
        email: 'TEST@EXAMPLE.COM',
        name: 'Test User',
        password: 'SecurePass123',
      });

      expect(mockUserRepo.findByEmail).toHaveBeenCalledWith('test@example.com');
    });
  });

  describe('loginAction', () => {
    it('authenticates valid credentials', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(mockUser);
      mockUserRepo.updateLastLogin.mockResolvedValue({
        ...mockUser,
        lastLoginAt: new Date(),
      });
      vi.mocked(argon2.verify).mockResolvedValue(true);

      const result = await loginAction({
        email: 'test@example.com',
        password: 'SecurePass123',
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        ipAddress: '192.168.1.1',
      });
      expect(result.data?.lastLoginAt).toBeDefined();
      expect(argon2.verify).toHaveBeenCalledWith(mockUser.passwordHash, 'SecurePass123');
      expect(mockUserRepo.updateLastLogin).toHaveBeenCalledWith(mockUser.id);
    });

    it('rejects non-existent user', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);

      const result = await loginAction({
        email: 'nonexistent@example.com',
        password: 'SecurePass123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid credentials');
      expect(argon2.verify).not.toHaveBeenCalled();
    });

    it('rejects user without password hash', async () => {
      mockUserRepo.findByEmail.mockResolvedValue({
        ...mockUser,
        passwordHash: null,
      });

      const result = await loginAction({
        email: 'test@example.com',
        password: 'SecurePass123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid credentials');
      expect(argon2.verify).not.toHaveBeenCalled();
    });

    it('rejects invalid password', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(mockUser);
      vi.mocked(argon2.verify).mockResolvedValue(false);

      const result = await loginAction({
        email: 'test@example.com',
        password: 'WrongPassword123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid credentials');
      expect(mockUserRepo.updateLastLogin).not.toHaveBeenCalled();
    });

    it('validates email format', async () => {
      const result = await loginAction({
        email: 'invalid-email',
        password: 'SecurePass123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('requires password', async () => {
      const result = await loginAction({
        email: 'test@example.com',
        password: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('captures IP address from headers', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(mockUser);
      mockUserRepo.updateLastLogin.mockResolvedValue(mockUser);
      vi.mocked(argon2.verify).mockResolvedValue(true);

      const result = await loginAction({
        email: 'test@example.com',
        password: 'SecurePass123',
      });

      expect(result.success).toBe(true);
      expect(result.data?.ipAddress).toBe('192.168.1.1');
    });
  });

  describe('logoutAction', () => {
    it('deletes session and returns success', async () => {
      const { logoutAction } = await import('../auth.actions');
      const { deleteSession } = await import('@/lib/auth/session');

      const result = await logoutAction(undefined);

      expect(result.success).toBe(true);
      expect(deleteSession).toHaveBeenCalled();
    });
  });
});
