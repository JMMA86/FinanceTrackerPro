/**
 * Rate Limit Service Unit Tests
 * Tracks login/register attempts to prevent brute-force attacks (Fix S2).
 * Prisma and logger are mocked; no real database is touched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkLoginRateLimit,
  checkRegisterRateLimit,
  recordLoginAttempt,
  checkApiRateLimit,
  recordApiAttempt,
  markApiAttemptSuccess,
} from '../rate-limit.service';

const { mockPrisma, mockLog } = vi.hoisted(() => ({
  mockPrisma: {
    loginAttempt: {
      count: vi.fn(),
      create: vi.fn(),
    },
    apiAttempt: {
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  mockLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({ log: mockLog }));
vi.mock('server-only', () => ({}));

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

describe('rate-limit.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkLoginRateLimit', () => {
    it('allows when IP failures are below the threshold (9)', async () => {
      mockPrisma.loginAttempt.count.mockResolvedValueOnce(9).mockResolvedValueOnce(0);

      const result = await checkLoginRateLimit('1.2.3.4', 'test@example.com');

      expect(result.allowed).toBe(true);
      expect(result.retryAfterMs).toBeUndefined();
    });

    it('blocks when IP failures reach the threshold (10)', async () => {
      mockPrisma.loginAttempt.count.mockResolvedValueOnce(10).mockResolvedValueOnce(0);

      const result = await checkLoginRateLimit('1.2.3.4', 'test@example.com');

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBe(LOGIN_WINDOW_MS);
    });

    it('allows when email failures are below the threshold (4)', async () => {
      mockPrisma.loginAttempt.count.mockResolvedValueOnce(0).mockResolvedValueOnce(4);

      const result = await checkLoginRateLimit('1.2.3.4', 'test@example.com');

      expect(result.allowed).toBe(true);
    });

    it('blocks when email failures reach the threshold (5)', async () => {
      mockPrisma.loginAttempt.count.mockResolvedValueOnce(0).mockResolvedValueOnce(5);

      const result = await checkLoginRateLimit('1.2.3.4', 'test@example.com');

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBe(LOGIN_WINDOW_MS);
    });

    it('counts only failed LOGIN attempts and lowercases the email', async () => {
      mockPrisma.loginAttempt.count.mockResolvedValue(0);

      await checkLoginRateLimit('1.2.3.4', 'TEST@EXAMPLE.COM');

      const [ipCall, emailCall] = mockPrisma.loginAttempt.count.mock.calls;
      expect(ipCall[0].where.success).toBe(false);
      expect(ipCall[0].where.type).toBe('LOGIN');
      expect(ipCall[0].where.ipAddress).toBe('1.2.3.4');
      expect(emailCall[0].where.success).toBe(false);
      expect(emailCall[0].where.type).toBe('LOGIN');
      expect(emailCall[0].where.email).toBe('test@example.com');
      expect(emailCall[0].where.createdAt).toBeDefined();
    });
  });

  describe('checkRegisterRateLimit', () => {
    it('allows when attempts are below both thresholds', async () => {
      mockPrisma.loginAttempt.count.mockResolvedValueOnce(4).mockResolvedValueOnce(2);

      const result = await checkRegisterRateLimit('1.2.3.4', 'test@example.com');

      expect(result.allowed).toBe(true);
    });

    it('blocks when IP attempts reach the threshold (5)', async () => {
      mockPrisma.loginAttempt.count.mockResolvedValueOnce(5).mockResolvedValueOnce(0);

      const result = await checkRegisterRateLimit('1.2.3.4', 'test@example.com');

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBe(REGISTER_WINDOW_MS);
    });

    it('blocks when email attempts reach the threshold (3)', async () => {
      mockPrisma.loginAttempt.count.mockResolvedValueOnce(0).mockResolvedValueOnce(3);

      const result = await checkRegisterRateLimit('1.2.3.4', 'test@example.com');

      expect(result.allowed).toBe(false);
    });

    it('counts only REGISTER attempts (not LOGIN) and lowercases the email', async () => {
      mockPrisma.loginAttempt.count.mockResolvedValue(0);

      await checkRegisterRateLimit('1.2.3.4', 'Test@Example.COM');

      const [ipCall, emailCall] = mockPrisma.loginAttempt.count.mock.calls;
      expect(ipCall[0].where.type).toBe('REGISTER');
      expect(ipCall[0].where).not.toHaveProperty('success');
      expect(emailCall[0].where.type).toBe('REGISTER');
      expect(emailCall[0].where).not.toHaveProperty('success');
      expect(emailCall[0].where.email).toBe('test@example.com');
    });

    it('does NOT count LOGIN attempts against REGISTER limit', async () => {
      // Simulate that there are LOGIN attempts but they should not affect REGISTER
      mockPrisma.loginAttempt.count.mockResolvedValue(0);

      const result = await checkRegisterRateLimit('1.2.3.4', 'test@example.com');

      expect(result.allowed).toBe(true);
      const [ipCall] = mockPrisma.loginAttempt.count.mock.calls;
      expect(ipCall[0].where.type).toBe('REGISTER');
    });
  });

  describe('recordLoginAttempt', () => {
    it('creates a record with normalized email, null userId, and default type LOGIN when not provided', async () => {
      mockPrisma.loginAttempt.create.mockResolvedValue({ id: 'attempt-1' });

      await recordLoginAttempt({
        email: 'TEST@EXAMPLE.COM',
        ipAddress: '1.2.3.4',
        success: false,
      });

      expect(mockPrisma.loginAttempt.create).toHaveBeenCalledWith({
        data: {
          userId: null,
          email: 'test@example.com',
          ipAddress: '1.2.3.4',
          userAgent: null,
          success: false,
          type: 'LOGIN',
        },
      });
    });

    it('passes userId, userAgent, and explicit type through when provided', async () => {
      mockPrisma.loginAttempt.create.mockResolvedValue({ id: 'attempt-2' });

      await recordLoginAttempt({
        userId: 'user-1',
        email: 'a@b.co',
        ipAddress: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
        success: true,
        type: 'REGISTER',
      });

      expect(mockPrisma.loginAttempt.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          email: 'a@b.co',
          ipAddress: '1.2.3.4',
          userAgent: 'Mozilla/5.0',
          success: true,
          type: 'REGISTER',
        },
      });
    });

    it('logs the error and does not throw when prisma fails', async () => {
      mockPrisma.loginAttempt.create.mockRejectedValue(new Error('db down'));

      await expect(
        recordLoginAttempt({ email: 'a@b.co', ipAddress: '1.2.3.4', success: true })
      ).resolves.toBeUndefined();

      expect(mockLog.error).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // API Rate Limiting (Rule 10)
  // ==========================================================================

  describe('checkApiRateLimit', () => {
    const API_WINDOW_MS = 60 * 60 * 1000;

    it('allows when attempt count is below the threshold', async () => {
      mockPrisma.apiAttempt.count.mockResolvedValue(119);

      const result = await checkApiRateLimit('user-1', 'TRANSACTION_CREATE');

      expect(result.allowed).toBe(true);
      expect(mockPrisma.apiAttempt.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          action: 'TRANSACTION_CREATE',
          createdAt: expect.any(Object),
        },
      });
    });

    it('blocks when attempt count reaches the threshold', async () => {
      mockPrisma.apiAttempt.count.mockResolvedValue(120);

      const result = await checkApiRateLimit('user-1', 'TRANSACTION_CREATE');

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBe(API_WINDOW_MS);
    });

    it('uses different thresholds per action', async () => {
      mockPrisma.apiAttempt.count.mockResolvedValue(30);

      const transferReverse = await checkApiRateLimit('user-1', 'TRANSFER_REVERSE');
      expect(transferReverse.allowed).toBe(false); // limit is 30

      mockPrisma.apiAttempt.count.mockResolvedValue(30);
      const transferCreate = await checkApiRateLimit('user-1', 'TRANSFER_CREATE');
      expect(transferCreate.allowed).toBe(true); // limit is 60
    });

    it('counts ALL attempts regardless of success flag', async () => {
      mockPrisma.apiAttempt.count.mockResolvedValue(0);

      await checkApiRateLimit('user-1', 'INVESTMENT_BUY');

      const call = mockPrisma.apiAttempt.count.mock.calls[0];
      expect(call[0].where).not.toHaveProperty('success');
    });
  });

  describe('recordApiAttempt', () => {
    it('creates a record with success=false and returns the id', async () => {
      mockPrisma.apiAttempt.create.mockResolvedValue({ id: 'api-attempt-1' });

      const id = await recordApiAttempt({
        userId: 'user-1',
        action: 'SAVINGS_CONTRIBUTE',
        ipAddress: '1.2.3.4',
      });

      expect(id).toBe('api-attempt-1');
      expect(mockPrisma.apiAttempt.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          action: 'SAVINGS_CONTRIBUTE',
          ipAddress: '1.2.3.4',
          success: false,
        },
      });
    });
  });

  describe('markApiAttemptSuccess', () => {
    it('updates the attempt to success=true', async () => {
      mockPrisma.apiAttempt.update.mockResolvedValue({ id: 'api-attempt-1', success: true });

      await markApiAttemptSuccess('api-attempt-1');

      expect(mockPrisma.apiAttempt.update).toHaveBeenCalledWith({
        where: { id: 'api-attempt-1' },
        data: { success: true },
      });
    });

    it('logs the error and does not throw when prisma fails', async () => {
      mockPrisma.apiAttempt.update.mockRejectedValue(new Error('db down'));

      await expect(markApiAttemptSuccess('api-attempt-1')).resolves.toBeUndefined();

      expect(mockLog.error).toHaveBeenCalled();
    });
  });
});
