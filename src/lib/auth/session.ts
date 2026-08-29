/**
 * Session Management
 * JWT-based sessions with secure cookies
 */

import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { log } from '@/lib/logger';

const SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET!);

const SESSION_COOKIE_NAME = 'session';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionData {
  userId: string;
  email: string;
  name: string;
}

/**
 * Create JWT session token
 */
export async function createSession(data: SessionData): Promise<string> {
  const token = await new SignJWT({ ...data })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET_KEY);

  log.info(
    { action: 'session.create', userId: data.userId, email: data.email },
    'Session JWT created'
  );
  return token;
}

/**
 * Verify and decode JWT session token
 */
export async function verifySession(token: string): Promise<SessionData | null> {
  try {
    const verified = await jwtVerify(token, SECRET_KEY);
    return verified.payload as unknown as SessionData;
  } catch {
    log.info({ action: 'session.verify.fail' }, 'Session JWT verification failed');
    return null;
  }
}

/**
 * Set session cookie
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION / 1000,
    path: '/',
  });
  log.info({ action: 'session.cookie.set' }, 'Session cookie set');
}

/**
 * Get session from cookie
 */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifySession(token);
}

/**
 * Delete session cookie
 */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  log.info({ action: 'session.cookie.delete' }, 'Session cookie deleted');
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}
