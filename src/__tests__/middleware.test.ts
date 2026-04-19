/**
 * Middleware Test Suite
 * Tests route protection and authentication redirects
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import type { SessionData } from '@/lib/auth/session';

// Mock session verification
vi.mock('@/lib/auth/session', () => ({
  verifySession: vi.fn(),
}));

describe('Middleware', () => {
  let mockRequest: NextRequest;
  let verifySession: (token: string) => Promise<SessionData | null>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const sessionModule = await import('@/lib/auth/session');
    verifySession = sessionModule.verifySession;
  });

  function createRequest(pathname: string, sessionToken?: string): NextRequest {
    const url = `http://localhost:3000${pathname}`;
    const request = new NextRequest(url);

    if (sessionToken) {
      request.cookies.set('session', sessionToken);
    }

    return request;
  }

  describe('Authentication flow', () => {
    it('allows unauthenticated users to access login page', async () => {
      vi.mocked(verifySession).mockResolvedValue(null);
      mockRequest = createRequest('/login');

      const response = await middleware(mockRequest);

      expect(response.status).not.toBe(307); // Not redirecting
    });

    it('allows unauthenticated users to access register page', async () => {
      vi.mocked(verifySession).mockResolvedValue(null);
      mockRequest = createRequest('/register');

      const response = await middleware(mockRequest);

      expect(response.status).not.toBe(307);
    });

    it('redirects authenticated users from login to dashboard', async () => {
      vi.mocked(verifySession).mockResolvedValue({
        userId: 'user_123',
        email: 'test@example.com',
        name: 'Test User',
      });
      mockRequest = createRequest('/login', 'valid-token');

      const response = await middleware(mockRequest);

      expect(response.status).toBe(307); // Redirect
      expect(response.headers.get('location')).toContain('/dashboard');
    });

    it('redirects authenticated users from register to dashboard', async () => {
      vi.mocked(verifySession).mockResolvedValue({
        userId: 'user_123',
        email: 'test@example.com',
        name: 'Test User',
      });
      mockRequest = createRequest('/register', 'valid-token');

      const response = await middleware(mockRequest);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/dashboard');
    });
  });

  describe('Protected routes', () => {
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
      it(`redirects unauthenticated users from ${route} to login`, async () => {
        vi.mocked(verifySession).mockResolvedValue(null);
        mockRequest = createRequest(route);

        const response = await middleware(mockRequest);

        expect(response.status).toBe(307);
        const location = response.headers.get('location');
        expect(location).toContain('/login');
        expect(location).toContain(`redirect=${encodeURIComponent(route)}`);
      });

      it(`allows authenticated users to access ${route}`, async () => {
        vi.mocked(verifySession).mockResolvedValue({
          userId: 'user_123',
          email: 'test@example.com',
          name: 'Test User',
        });
        mockRequest = createRequest(route, 'valid-token');

        const response = await middleware(mockRequest);

        expect(response.status).not.toBe(307);
      });
    });
  });

  describe('Public routes', () => {
    it('allows unauthenticated users to access home page', async () => {
      vi.mocked(verifySession).mockResolvedValue(null);
      mockRequest = createRequest('/');

      const response = await middleware(mockRequest);

      expect(response.status).not.toBe(307);
    });

    it('allows authenticated users to access home page', async () => {
      vi.mocked(verifySession).mockResolvedValue({
        userId: 'user_123',
        email: 'test@example.com',
        name: 'Test User',
      });
      mockRequest = createRequest('/', 'valid-token');

      const response = await middleware(mockRequest);

      expect(response.status).not.toBe(307);
    });
  });

  describe('Redirect preservation', () => {
    it('preserves redirect parameter when redirecting to login', async () => {
      vi.mocked(verifySession).mockResolvedValue(null);
      mockRequest = createRequest('/dashboard/analytics');

      const response = await middleware(mockRequest);

      const location = response.headers.get('location');
      expect(location).toContain('redirect=%2Fdashboard%2Fanalytics');
    });

    it('includes deep paths in redirect parameter', async () => {
      vi.mocked(verifySession).mockResolvedValue(null);
      mockRequest = createRequest('/settings/profile/security');

      const response = await middleware(mockRequest);

      const location = response.headers.get('location');
      expect(location).toContain('redirect=%2Fsettings%2Fprofile%2Fsecurity');
    });
  });
});
