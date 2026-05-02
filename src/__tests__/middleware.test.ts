/**
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';
import type { SessionData } from '@/lib/auth/session';

vi.mock('@/lib/auth/session', () => ({
  verifySession: vi.fn(),
}));

describe('proxy middleware', () => {
  let verifySession: (token: string) => Promise<SessionData | null>;

  const authenticatedSession: SessionData = {
    userId: 'user_123',
    email: 'test@example.com',
    name: 'Test User',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const sessionModule = await import('@/lib/auth/session');
    verifySession = sessionModule.verifySession;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createRequest(pathname: string, sessionToken?: string): NextRequest {
    const request = new NextRequest(`http://localhost:3000${pathname}`);
    if (sessionToken) {
      request.cookies.set('session', sessionToken);
    }
    return request;
  }

  describe('when user is unauthenticated', () => {
    it('should allow access to the login page', async () => {
      // Given
      vi.mocked(verifySession).mockResolvedValue(null);
      const request = createRequest('/login');

      // When
      const response = await proxy(request);

      // Then
      expect(response.status).not.toBe(307);
    });

    it('should allow access to the register page', async () => {
      // Given
      vi.mocked(verifySession).mockResolvedValue(null);
      const request = createRequest('/register');

      // When
      const response = await proxy(request);

      // Then
      expect(response.status).not.toBe(307);
    });

    it('should allow access to the home page', async () => {
      // Given
      vi.mocked(verifySession).mockResolvedValue(null);
      const request = createRequest('/');

      // When
      const response = await proxy(request);

      // Then
      expect(response.status).not.toBe(307);
    });

    it('should redirect to login when accessing a protected route', async () => {
      // Given
      vi.mocked(verifySession).mockResolvedValue(null);
      const request = createRequest('/dashboard');

      // When
      const response = await proxy(request);

      // Then
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/login');
    });

    it('should preserve the original path as redirect parameter', async () => {
      // Given
      vi.mocked(verifySession).mockResolvedValue(null);
      const request = createRequest('/dashboard/analytics');

      // When
      const response = await proxy(request);

      // Then
      const location = response.headers.get('location');
      expect(location).toContain('redirect=%2Fdashboard%2Fanalytics');
    });

    it('should preserve deep nested paths in redirect parameter', async () => {
      // Given
      vi.mocked(verifySession).mockResolvedValue(null);
      const request = createRequest('/settings/profile/security');

      // When
      const response = await proxy(request);

      // Then
      expect(response.headers.get('location')).toContain(
        'redirect=%2Fsettings%2Fprofile%2Fsecurity'
      );
    });
  });

  describe('when user is authenticated', () => {
    it('should redirect away from login to dashboard', async () => {
      // Given
      vi.mocked(verifySession).mockResolvedValue(authenticatedSession);
      const request = createRequest('/login', 'valid-token');

      // When
      const response = await proxy(request);

      // Then
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/dashboard');
    });

    it('should redirect away from register to dashboard', async () => {
      // Given
      vi.mocked(verifySession).mockResolvedValue(authenticatedSession);
      const request = createRequest('/register', 'valid-token');

      // When
      const response = await proxy(request);

      // Then
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/dashboard');
    });

    it('should allow access to the home page', async () => {
      // Given
      vi.mocked(verifySession).mockResolvedValue(authenticatedSession);
      const request = createRequest('/', 'valid-token');

      // When
      const response = await proxy(request);

      // Then
      expect(response.status).not.toBe(307);
    });
  });

  describe('when accessing protected routes as authenticated user', () => {
    const protectedRoutes = [
      '/dashboard',
      '/transactions',
      '/accounts',
      '/savings',
      '/investments',
      '/fixed-expenses',
      '/variable-expenses',
      '/loans',
      '/settings',
    ];

    protectedRoutes.forEach((route) => {
      it(`should allow access to ${route}`, async () => {
        // Given
        vi.mocked(verifySession).mockResolvedValue(authenticatedSession);
        const request = createRequest(route, 'valid-token');

        // When
        const response = await proxy(request);

        // Then
        expect(response.status).not.toBe(307);
      });

      it(`should redirect unauthenticated user from ${route} to login`, async () => {
        // Given
        vi.mocked(verifySession).mockResolvedValue(null);
        const request = createRequest(route);

        // When
        const response = await proxy(request);

        // Then
        expect(response.status).toBe(307);
        const location = response.headers.get('location');
        expect(location).toContain('/login');
        expect(location).toContain(`redirect=${encodeURIComponent(route)}`);
      });
    });
  });

  describe('when locale detection', () => {
    it('should use valid locale cookie for redirect when no URL prefix present', async () => {
      // Given
      vi.mocked(verifySession).mockResolvedValue(authenticatedSession);
      const url = 'http://localhost:3000/login';
      const request = new NextRequest(url);
      request.cookies.set('session', 'valid-token');
      request.cookies.set('locale', 'en');

      // When
      const response = await proxy(request);

      // Then
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/en/dashboard');
    });

    it('should ignore invalid locale cookie and fall back to header detection', async () => {
      // Given
      vi.mocked(verifySession).mockResolvedValue(null);
      const url = 'http://localhost:3000/login';
      const request = new NextRequest(url);
      request.cookies.set('locale', 'fr');

      // When
      const response = await proxy(request);

      // Then
      expect(response.status).not.toBe(307);
    });
  });
});
