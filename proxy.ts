/**
 * Proxy for route protection
 * Handles authentication checks and redirects
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from './src/lib/auth/session';
import { getLocaleFromHeader, isValidLocale } from './src/lib/i18n';

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const pathSegment = pathname.split('/').find(Boolean);
  const firstSegment = pathSegment;
  const hasLangPrefix = isValidLocale(firstSegment);
  const cookieLocale = request.cookies.get('locale')?.value;

  const getDetectedLang = (): string | null => {
    if (hasLangPrefix) return firstSegment;
    if (cookieLocale && isValidLocale(cookieLocale)) {
      return cookieLocale;
    }
    return getLocaleFromHeader(request.headers.get('accept-language') ?? null);
  };

  const detectedLang = getDetectedLang();
  const lang = `/${detectedLang}`;

  // Build a pathname without the optional lang prefix for route checks
  const pathnameWithoutLang = hasLangPrefix
    ? pathname.replace(new RegExp(`^/${firstSegment}`), '') || '/'
    : pathname;

  // Get session token from cookie
  const token = request.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  const isAuthenticated = !!session;

  // Redirect authenticated users away from auth pages
  if (isAuthenticated && AUTH_ROUTES.some((route) => pathnameWithoutLang.startsWith(route))) {
    return NextResponse.redirect(new URL(`${lang}/dashboard`, request.url));
  }

  // Redirect unauthenticated users to login
  if (!isAuthenticated && PROTECTED_ROUTES.some((route) => pathnameWithoutLang.startsWith(route))) {
    const loginUrl = new URL(`${lang}/login`, request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [String.raw`/((?!api|_next/static|_next/image|favicon.ico|.*\..*).*)`],
};
