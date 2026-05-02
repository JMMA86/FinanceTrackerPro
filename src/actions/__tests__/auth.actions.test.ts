import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe('auth actions', () => {
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerAction', () => {
    describe('when registration data is valid', () => {
      it('should create user with hashed password and return user data', async () => {
        // Given
        mockUserRepo.findByEmail.mockResolvedValue(null);
        mockUserRepo.create.mockResolvedValue(mockUser);
        vi.mocked(argon2.hash).mockResolvedValue('$argon2id$hashed_password');

        // When
        const result = await registerAction({
          email: 'new@example.com',
          name: 'New User',
          password: 'SecurePass123',
        });

        // Then
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

      it('should normalize email to lowercase before lookup and creation', async () => {
        // Given
        mockUserRepo.findByEmail.mockResolvedValue(null);
        mockUserRepo.create.mockResolvedValue(mockUser);
        vi.mocked(argon2.hash).mockResolvedValue('$argon2id$hashed');

        // When
        await registerAction({
          email: 'TEST@EXAMPLE.COM',
          name: 'Test User',
          password: 'SecurePass123',
        });

        // Then
        expect(mockUserRepo.findByEmail).toHaveBeenCalledWith('test@example.com');
      });
    });

    describe('when email is already registered', () => {
      it('should return an error and not create the user', async () => {
        // Given
        mockUserRepo.findByEmail.mockResolvedValue(mockUser);

        // When
        const result = await registerAction({
          email: 'test@example.com',
          name: 'Duplicate User',
          password: 'SecurePass123',
        });

        // Then
        expect(result.success).toBe(false);
        expect(result.error).toContain('Email already registered');
        expect(mockUserRepo.create).not.toHaveBeenCalled();
      });
    });

    describe('when input is invalid', () => {
      it('should reject invalid email format', async () => {
        // Given / When
        const result = await registerAction({
          email: 'invalid-email',
          name: 'Test User',
          password: 'SecurePass123',
        });

        // Then
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should reject weak password', async () => {
        // Given / When
        const result = await registerAction({
          email: 'test@example.com',
          name: 'Test User',
          password: 'weak',
        });

        // Then
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should reject name shorter than 2 characters', async () => {
        // Given / When
        const result = await registerAction({
          email: 'test@example.com',
          name: 'A',
          password: 'SecurePass123',
        });

        // Then
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('loginAction', () => {
    describe('when credentials are valid', () => {
      it('should authenticate and return user data with IP address', async () => {
        // Given
        mockUserRepo.findByEmail.mockResolvedValue(mockUser);
        mockUserRepo.updateLastLogin.mockResolvedValue({ ...mockUser, lastLoginAt: new Date() });
        vi.mocked(argon2.verify).mockResolvedValue(true);

        // When
        const result = await loginAction({ email: 'test@example.com', password: 'SecurePass123' });

        // Then
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

      it('should capture IP address from request headers', async () => {
        // Given
        mockUserRepo.findByEmail.mockResolvedValue(mockUser);
        mockUserRepo.updateLastLogin.mockResolvedValue(mockUser);
        vi.mocked(argon2.verify).mockResolvedValue(true);

        // When
        const result = await loginAction({ email: 'test@example.com', password: 'SecurePass123' });

        // Then
        expect(result.success).toBe(true);
        expect(result.data?.ipAddress).toBe('192.168.1.1');
      });
    });

    describe('when credentials are invalid', () => {
      it('should reject when user does not exist', async () => {
        // Given
        mockUserRepo.findByEmail.mockResolvedValue(null);

        // When
        const result = await loginAction({
          email: 'nonexistent@example.com',
          password: 'SecurePass123',
        });

        // Then
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid credentials');
        expect(argon2.verify).not.toHaveBeenCalled();
      });

      it('should reject when user has no password hash', async () => {
        // Given
        mockUserRepo.findByEmail.mockResolvedValue({ ...mockUser, passwordHash: null });

        // When
        const result = await loginAction({ email: 'test@example.com', password: 'SecurePass123' });

        // Then
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid credentials');
        expect(argon2.verify).not.toHaveBeenCalled();
      });

      it('should reject when password does not match', async () => {
        // Given
        mockUserRepo.findByEmail.mockResolvedValue(mockUser);
        vi.mocked(argon2.verify).mockResolvedValue(false);

        // When
        const result = await loginAction({
          email: 'test@example.com',
          password: 'WrongPassword123',
        });

        // Then
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid credentials');
        expect(mockUserRepo.updateLastLogin).not.toHaveBeenCalled();
      });
    });

    describe('when input is invalid', () => {
      it('should reject invalid email format', async () => {
        // Given / When
        const result = await loginAction({ email: 'invalid-email', password: 'SecurePass123' });

        // Then
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should reject empty password', async () => {
        // Given / When
        const result = await loginAction({ email: 'test@example.com', password: '' });

        // Then
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('logoutAction', () => {
    it('should delete session and return success', async () => {
      // Given
      const { logoutAction } = await import('../auth.actions');
      const { deleteSession } = await import('@/lib/auth/session');

      // When
      const result = await logoutAction(undefined);

      // Then
      expect(result.success).toBe(true);
      expect(deleteSession).toHaveBeenCalled();
    });
  });
});
