/**
 * Rate Limiting Service (Fix S2)
 * Tracks login/register attempts to prevent brute-force attacks
 */

import 'server-only';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';

const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_MAX_IP_FAILURES = 10;
const LOGIN_MAX_EMAIL_FAILURES = 5;

const REGISTER_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const REGISTER_MAX_IP = 5;
const REGISTER_MAX_EMAIL = 3;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

function getWindowStart(windowMs: number): Date {
  return new Date(Date.now() - windowMs);
}

/**
 * Check login rate limits by IP and email
 */
export async function checkLoginRateLimit(
  ipAddress: string,
  email: string
): Promise<RateLimitResult> {
  const windowStart = getWindowStart(LOGIN_WINDOW_MS);

  const [ipFailures, emailFailures] = await Promise.all([
    prisma.loginAttempt.count({
      where: {
        ipAddress,
        success: false,
        createdAt: { gte: windowStart },
      },
    }),
    prisma.loginAttempt.count({
      where: {
        email: email.toLowerCase(),
        success: false,
        createdAt: { gte: windowStart },
      },
    }),
  ]);

  if (ipFailures >= LOGIN_MAX_IP_FAILURES) {
    return { allowed: false, retryAfterMs: LOGIN_WINDOW_MS };
  }

  if (emailFailures >= LOGIN_MAX_EMAIL_FAILURES) {
    return { allowed: false, retryAfterMs: LOGIN_WINDOW_MS };
  }

  return { allowed: true };
}

/**
 * Check registration rate limits by IP and email
 */
export async function checkRegisterRateLimit(
  ipAddress: string,
  email: string
): Promise<RateLimitResult> {
  const windowStart = getWindowStart(REGISTER_WINDOW_MS);

  const [ipAttempts, emailAttempts] = await Promise.all([
    prisma.loginAttempt.count({
      where: {
        ipAddress,
        createdAt: { gte: windowStart },
      },
    }),
    prisma.loginAttempt.count({
      where: {
        email: email.toLowerCase(),
        createdAt: { gte: windowStart },
      },
    }),
  ]);

  if (ipAttempts >= REGISTER_MAX_IP) {
    return { allowed: false, retryAfterMs: REGISTER_WINDOW_MS };
  }

  if (emailAttempts >= REGISTER_MAX_EMAIL) {
    return { allowed: false, retryAfterMs: REGISTER_WINDOW_MS };
  }

  return { allowed: true };
}

/**
 * Record a login or registration attempt
 */
export async function recordLoginAttempt(params: {
  userId?: string;
  email: string;
  ipAddress: string;
  userAgent?: string;
  success: boolean;
}): Promise<void> {
  try {
    await prisma.loginAttempt.create({
      data: {
        userId: params.userId ?? null,
        email: params.email.toLowerCase(),
        ipAddress: params.ipAddress,
        userAgent: params.userAgent ?? null,
        success: params.success,
      },
    });
  } catch (error) {
    log.error({ error, email: params.email }, '[RATE_LIMIT] Failed to record login attempt');
  }
}
