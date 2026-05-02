/**
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.JWT_SECRET = 'test-secret-key-for-testing-min-32-characters-long';

const mockCookieStore = {
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => mockCookieStore),
}));

import * as sessionModule from '../session';
import type { SessionData } from '../session';

describe('session management', () => {
  const mockSessionData: SessionData = {
    userId: 'user_123',
    email: 'test@example.com',
    name: 'Test User',
  };

  let validToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    validToken = await sessionModule.createSession(mockSessionData);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('when creating a session', () => {
    it('should return a JWT string with three parts', async () => {
      // Given / When
      const token = await sessionModule.createSession(mockSessionData);

      // Then
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      expect(token.split('.')).toHaveLength(3);
    });

    it('should generate different tokens for the same data due to timestamps', async () => {
      // Given
      const token1 = await sessionModule.createSession(mockSessionData);
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // When
      const token2 = await sessionModule.createSession(mockSessionData);

      // Then
      expect(token1).not.toBe(token2);
    });
  });

  describe('when verifying a session', () => {
    it('should decode a valid token and return session data', async () => {
      // Given / When
      const decoded = await sessionModule.verifySession(validToken);

      // Then
      expect(decoded).toMatchObject(mockSessionData);
    });

    it('should return null for an invalid token', async () => {
      // Given / When
      const decoded = await sessionModule.verifySession('invalid-token');

      // Then
      expect(decoded).toBeNull();
    });

    it('should return null for a malformed token', async () => {
      // Given / When
      const decoded = await sessionModule.verifySession(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired.signature'
      );

      // Then
      expect(decoded).toBeNull();
    });
  });

  describe('when setting the session cookie', () => {
    it('should set an httpOnly cookie with lax sameSite policy', async () => {
      // Given / When
      await sessionModule.setSessionCookie(validToken);

      // Then
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

    it('should set secure flag in production environment', async () => {
      // Given
      vi.stubEnv('NODE_ENV', 'production');

      // When
      await sessionModule.setSessionCookie(validToken);

      // Then
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        'session',
        validToken,
        expect.objectContaining({ secure: true })
      );
    });

    it('should not set secure flag in development environment', async () => {
      // Given
      vi.stubEnv('NODE_ENV', 'development');

      // When
      await sessionModule.setSessionCookie(validToken);

      // Then
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        'session',
        validToken,
        expect.objectContaining({ secure: false })
      );
    });
  });

  describe('when getting the current session', () => {
    it('should retrieve and verify the session from cookie', async () => {
      // Given
      mockCookieStore.get.mockReturnValue({ value: validToken });

      // When
      const session = await sessionModule.getSession();

      // Then
      expect(session).toMatchObject(mockSessionData);
      expect(mockCookieStore.get).toHaveBeenCalledWith('session');
    });

    it('should return null when no session cookie exists', async () => {
      // Given
      mockCookieStore.get.mockReturnValue(undefined);

      // When
      const session = await sessionModule.getSession();

      // Then
      expect(session).toBeNull();
    });

    it('should return null when the cookie token is invalid', async () => {
      // Given
      mockCookieStore.get.mockReturnValue({ value: 'invalid-token' });

      // When
      const session = await sessionModule.getSession();

      // Then
      expect(session).toBeNull();
    });
  });

  describe('when deleting the session', () => {
    it('should remove the session cookie', async () => {
      // Given / When
      await sessionModule.deleteSession();

      // Then
      expect(mockCookieStore.delete).toHaveBeenCalledWith('session');
    });
  });

  describe('when checking authentication status', () => {
    it('should return true when a valid session exists', async () => {
      // Given
      mockCookieStore.get.mockReturnValue({ value: validToken });

      // When
      const authenticated = await sessionModule.isAuthenticated();

      // Then
      expect(authenticated).toBe(true);
    });

    it('should return false when no session exists', async () => {
      // Given
      mockCookieStore.get.mockReturnValue(undefined);

      // When
      const authenticated = await sessionModule.isAuthenticated();

      // Then
      expect(authenticated).toBe(false);
    });

    it('should return false when the session token is invalid', async () => {
      // Given
      mockCookieStore.get.mockReturnValue({ value: 'invalid-token' });

      // When
      const authenticated = await sessionModule.isAuthenticated();

      // Then
      expect(authenticated).toBe(false);
    });
  });
});
