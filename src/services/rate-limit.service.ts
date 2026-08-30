/**
 * Rate Limiting Service (Fix S2)
 * Tracks login/register attempts to prevent brute-force attacks
 */

import 'server-only';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { AuthAttemptType, ApiAction } from '@prisma/client';

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
        type: 'LOGIN',
        success: false,
        createdAt: { gte: windowStart },
      },
    }),
    prisma.loginAttempt.count({
      where: {
        email: email.toLowerCase(),
        type: 'LOGIN',
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
        type: 'REGISTER',
        createdAt: { gte: windowStart },
      },
    }),
    prisma.loginAttempt.count({
      where: {
        email: email.toLowerCase(),
        type: 'REGISTER',
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
  type?: AuthAttemptType;
}): Promise<void> {
  try {
    await prisma.loginAttempt.create({
      data: {
        userId: params.userId ?? null,
        email: params.email.toLowerCase(),
        ipAddress: params.ipAddress,
        userAgent: params.userAgent ?? null,
        success: params.success,
        type: params.type ?? 'LOGIN',
      },
    });
  } catch (error) {
    log.error({ error, email: params.email }, '[RATE_LIMIT] Failed to record login attempt');
  }
}

// ============================================================================
// API RATE LIMITING (Rule 10 — money actions)
// ============================================================================

const API_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const API_LIMITS: Record<ApiAction, number> = {
  TRANSACTION_CREATE: 120,
  TRANSACTION_DELETE: 60,
  TRANSFER_CREATE: 60,
  TRANSFER_REVERSE: 30,
  INVESTMENT_DEPOSIT: 60,
  INVESTMENT_BUY: 120,
  INVESTMENT_SELL: 60,
  SAVINGS_CONTRIBUTE: 60,
};

/**
 * Check API rate limit for financial actions
 * Counts ALL attempts (success and failure) within the window
 */
export async function checkApiRateLimit(
  userId: string,
  action: ApiAction
): Promise<RateLimitResult> {
  const windowStart = getWindowStart(API_WINDOW_MS);
  const limit = API_LIMITS[action];

  const count = await prisma.apiAttempt.count({
    where: {
      userId,
      action,
      createdAt: { gte: windowStart },
    },
  });

  if (count >= limit) {
    return { allowed: false, retryAfterMs: API_WINDOW_MS };
  }

  return { allowed: true };
}

/**
 * Record an API attempt (always inserts with success=false)
 * Returns the attempt ID so it can be marked as success later
 */
export async function recordApiAttempt(params: {
  userId: string;
  action: ApiAction;
  ipAddress: string;
}): Promise<string> {
  const attempt = await prisma.apiAttempt.create({
    data: {
      userId: params.userId,
      action: params.action,
      ipAddress: params.ipAddress,
      success: false,
    },
  });
  return attempt.id;
}

/**
 * Mark an API attempt as successful
 * Best-effort: catches and logs errors without throwing
 */
export async function markApiAttemptSuccess(attemptId: string): Promise<void> {
  try {
    await prisma.apiAttempt.update({
      where: { id: attemptId },
      data: { success: true },
    });
  } catch (error) {
    log.error({ error, attemptId }, '[RATE_LIMIT] Failed to mark API attempt as success');
  }
}
