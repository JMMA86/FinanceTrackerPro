import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerAction, loginAction, logoutAction } from '../auth.actions';
import * as argon2 from 'argon2';
import { getUserRepository } from '@/lib/repositories';
import { checkLoginRateLimit, checkRegisterRateLimit } from '@/services/rate-limit.service';

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
  getSession: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/services/rate-limit.service', () => ({
  checkLoginRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  checkRegisterRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  recordLoginAttempt: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/logger', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));

describe('auth actions', () => {
  const mockUser = {
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
    vi.mocked(getUserRepository).mockReturnValue(
      mockUserRepo as unknown as ReturnType<typeof getUserRepository>
    );
    vi.mocked(argon2.hash).mockResolvedValue('$argon2id$hashed');
    vi.mocked(argon2.verify).mockResolvedValue(true);
    vi.mocked(checkLoginRateLimit).mockResolvedValue({ allowed: true });
    vi.mocked(checkRegisterRateLimit).mockResolvedValue({ allowed: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loginAction - successful login', () => {
    it('should create session and return user data on successful login', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(mockUser);
      vi.mocked(argon2.verify).mockResolvedValue(true);
      const { createSession, setSessionCookie } = await import('@/lib/auth/session');

      const result = await loginAction({ email: 'test@example.com', password: 'SecurePass1234' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        lastLoginAt: expect.any(String),
      });
      expect(result.data).not.toHaveProperty('ipAddress');
      expect(createSession).toHaveBeenCalledWith({
        userId: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
      });
      expect(setSessionCookie).toHaveBeenCalledWith('mock-token');
      expect(mockUserRepo.updateLastLogin).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('ARGON2_CONFIG', () => {
    it('should use default ARGON2 config values', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);
      mockUserRepo.create.mockResolvedValue(mockUser);
      vi.mocked(argon2.hash).mockResolvedValue('$argon2id$hashed');
      vi.mocked(argon2.verify).mockResolvedValue(true);

      await registerAction({
        email: 'test@example.com',
        name: 'Test',
        password: 'Password1234',
      });

      expect(argon2.hash).toHaveBeenCalledWith('Password1234', {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });
    });
  });

  describe('registerAction', () => {
    describe('when registration data is valid', () => {
      it('should create user with hashed password and return user data', async () => {
        mockUserRepo.findByEmail.mockResolvedValue(null);
        mockUserRepo.create.mockResolvedValue(mockUser);
        vi.mocked(argon2.hash).mockResolvedValue('$argon2id$hashed_password');
        vi.mocked(argon2.verify).mockResolvedValue(true);

        const result = await registerAction({
          email: 'new@example.com',
          name: 'New User',
          password: 'SecurePass1234',
        });

        expect(result.success).toBe(true);
        expect(result.data).toEqual({
          id: mockUser.id,
          email: mockUser.email,
          name: mockUser.name,
        });
        expect(argon2.hash).toHaveBeenCalledWith('SecurePass1234', {
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
        mockUserRepo.findByEmail.mockResolvedValue(null);
        mockUserRepo.create.mockResolvedValue(mockUser);
        vi.mocked(argon2.hash).mockResolvedValue('$argon2id$hashed');
        vi.mocked(argon2.verify).mockResolvedValue(true);

        await registerAction({
          email: 'TEST@EXAMPLE.COM',
          name: 'Test User',
          password: 'SecurePass1234',
        });

        expect(mockUserRepo.findByEmail).toHaveBeenCalledWith('test@example.com');
      });
    });

    describe('when email is already registered', () => {
      it('should return an error and not create the user', async () => {
        mockUserRepo.findByEmail.mockResolvedValue(mockUser);
        vi.mocked(argon2.verify).mockResolvedValue(true);

        const result = await registerAction({
          email: 'test@example.com',
          name: 'Duplicate User',
          password: 'SecurePass1234',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.code).toBe('AUTH_ERROR');
        expect(mockUserRepo.create).not.toHaveBeenCalled();
      });

      it('should reject when user has no password hash', async () => {
        mockUserRepo.findByEmail.mockResolvedValue({ ...mockUser, passwordHash: null });
        vi.mocked(argon2.verify).mockResolvedValue(false);

        const result = await loginAction({ email: 'test@example.com', password: 'SecurePass1234' });

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.code).toBe('AUTH_ERROR');
      });

      it('should reject when password does not match', async () => {
        mockUserRepo.findByEmail.mockResolvedValue(mockUser);
        vi.mocked(argon2.verify).mockResolvedValue(false);

        const result = await loginAction({
          email: 'test@example.com',
          password: 'WrongPassword123',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.code).toBe('AUTH_ERROR');
        expect(mockUserRepo.updateLastLogin).not.toHaveBeenCalled();
      });
    });

    describe('when input is invalid', () => {
      it('should reject invalid email format', async () => {
        const result = await loginAction({ email: 'invalid-email', password: 'SecurePass1234' });

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should reject password shorter than 12 characters', async () => {
        const result = await registerAction({
          email: 'test@example.com',
          name: 'Test',
          password: 'Short1',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should reject empty password', async () => {
        const result = await loginAction({ email: 'test@example.com', password: '' });

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('verifyPasswordWithTimingProtection error handling', () => {
    it('should return AUTH_ERROR without crashing when argon2.verify throws', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(mockUser);
      vi.mocked(argon2.verify).mockRejectedValue(new Error('argon2 unexpected failure'));

      const result = await loginAction({
        email: 'test@example.com',
        password: 'SecurePass1234',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('AUTH_ERROR');
      expect(mockUserRepo.updateLastLogin).not.toHaveBeenCalled();
    });

    it('should not crash on register when argon2.verify throws for an existing user', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(mockUser);
      vi.mocked(argon2.verify).mockRejectedValue(new Error('argon2 unexpected failure'));

      const result = await registerAction({
        email: 'test@example.com',
        name: 'Duplicate User',
        password: 'SecurePass1234',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('AUTH_ERROR');
      expect(mockUserRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('rate limiting', () => {
    it('should return RATE_LIMITED on login and skip user lookup when login limit is hit', async () => {
      vi.mocked(checkLoginRateLimit).mockResolvedValue({ allowed: false, retryAfterMs: 900000 });

      const result = await loginAction({
        email: 'test@example.com',
        password: 'SecurePass1234',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('RATE_LIMITED');
      expect(mockUserRepo.findByEmail).not.toHaveBeenCalled();
      expect(mockUserRepo.updateLastLogin).not.toHaveBeenCalled();
    });

    it('should return RATE_LIMITED on register when register limit is hit', async () => {
      vi.mocked(checkRegisterRateLimit).mockResolvedValue({
        allowed: false,
        retryAfterMs: 3600000,
      });

      const result = await registerAction({
        email: 'new@example.com',
        name: 'New User',
        password: 'SecurePass1234',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('RATE_LIMITED');
      expect(mockUserRepo.findByEmail).not.toHaveBeenCalled();
      expect(mockUserRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('logoutAction', () => {
    it('should delete session and return success', async () => {
      const { deleteSession } = await import('@/lib/auth/session');

      const result = await logoutAction(undefined);

      expect(result.success).toBe(true);
      expect(deleteSession).toHaveBeenCalled();
    });
  });
});
