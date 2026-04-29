/**
 * Session Management Test Suite
 * Tests JWT session creation, verification, and cookie handling
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set JWT_SECRET env var before importing session module
process.env.JWT_SECRET = 'test-secret-key-for-testing-min-32-characters-long';

// Mock next/headers before importing
const mockCookieStore = {
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => mockCookieStore),
}));

// Now import after mocks are set up
import * as sessionModule from '../session';
import type { SessionData } from '../session';

describe('Session Management', () => {
  const mockSessionData: SessionData = {
    userId: 'user_123',
    email: 'test@example.com',
    name: 'Test User',
  };

  let validToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Create a valid token for tests
    validToken = await sessionModule.createSession(mockSessionData);
  });

  describe('createSession', () => {
    it('creates JWT token with session data', async () => {
      const token = await sessionModule.createSession(mockSessionData);

      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
    });

    it('creates different tokens for same data (due to timestamps)', async () => {
      const token1 = await sessionModule.createSession(mockSessionData);
      await new Promise((resolve) => setTimeout(resolve, 1100)); // Wait 1.1s to ensure different iat
      const token2 = await sessionModule.createSession(mockSessionData);

      expect(token1).not.toBe(token2);
    });
  });

  describe('verifySession', () => {
    it('verifies and decodes valid token', async () => {
      const decoded = await sessionModule.verifySession(validToken);

      expect(decoded).toMatchObject(mockSessionData);
    });

    it('returns null for invalid token', async () => {
      const decoded = await sessionModule.verifySession('invalid-token');

      expect(decoded).toBeNull();
    });

    it('returns null for malformed token', async () => {
      const decoded = await sessionModule.verifySession(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired.signature'
      );

      expect(decoded).toBeNull();
    });
  });

  describe('setSessionCookie', () => {
    it('sets httpOnly secure cookie', async () => {
      await sessionModule.setSessionCookie(validToken);

      expect(mockCookieStore.set).toHaveBeenCalledWith(
        'session',
        validToken,
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
        })
      );
    });

    it('sets secure flag in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');

      await sessionModule.setSessionCookie(validToken);

      expect(mockCookieStore.set).toHaveBeenCalledWith(
        'session',
        validToken,
        expect.objectContaining({
          secure: true,
        })
      );

      vi.unstubAllEnvs();
    });

    it('does not set secure flag in development', async () => {
      vi.stubEnv('NODE_ENV', 'development');

      await sessionModule.setSessionCookie(validToken);

      expect(mockCookieStore.set).toHaveBeenCalledWith(
        'session',
        validToken,
        expect.objectContaining({
          secure: false,
        })
      );

      vi.unstubAllEnvs();
    });
  });

  describe('getSession', () => {
    it('retrieves and verifies session from cookie', async () => {
      mockCookieStore.get.mockReturnValue({ value: validToken });

      const session = await sessionModule.getSession();

      expect(session).toMatchObject(mockSessionData);
      expect(mockCookieStore.get).toHaveBeenCalledWith('session');
    });

    it('returns null when no cookie exists', async () => {
      mockCookieStore.get.mockReturnValue(undefined);

      const session = await sessionModule.getSession();

      expect(session).toBeNull();
    });

    it('returns null for invalid token in cookie', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'invalid-token' });

      const session = await sessionModule.getSession();

      expect(session).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('deletes session cookie', async () => {
      await sessionModule.deleteSession();

      expect(mockCookieStore.delete).toHaveBeenCalledWith('session');
    });
  });

  describe('isAuthenticated', () => {
    it('returns true when valid session exists', async () => {
      mockCookieStore.get.mockReturnValue({ value: validToken });

      const authenticated = await sessionModule.isAuthenticated();

      expect(authenticated).toBe(true);
    });

    it('returns false when no session exists', async () => {
      mockCookieStore.get.mockReturnValue(undefined);

      const authenticated = await sessionModule.isAuthenticated();

      expect(authenticated).toBe(false);
    });

    it('returns false for invalid session', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'invalid-token' });

      const authenticated = await sessionModule.isAuthenticated();

      expect(authenticated).toBe(false);
    });
  });
});
