/**
 * Middleware for route protection
 * Handles authentication checks and redirects
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth/session';

const AUTH_ROUTES = ['/login', '/register'];
const PROTECTED_ROUTES = [
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get session token from cookie
  const token = request.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  const isAuthenticated = !!session;

  // Redirect authenticated users away from auth pages
  if (isAuthenticated && AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Redirect unauthenticated users to login
  if (!isAuthenticated && PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [String.raw`/((?!api|_next/static|_next/image|favicon.ico|.*\..*).*)`],
};
