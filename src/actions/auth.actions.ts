/**
 * Authentication Server Actions
 * Handles user registration and login with password hashing
 * SECURITY: Protected against timing attacks with constant-time responses
 */

'use server';

import 'server-only';
import * as argon2 from 'argon2';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { safeAction } from '@/lib/utils/action-wrapper';
import { RegisterSchema, LoginSchema } from '@/lib/validations/auth';
import { getUserRepository } from '@/lib/repositories';
import { createSession, setSessionCookie, deleteSession, getSession } from '@/lib/auth/session';
import { log } from '@/lib/logger';
import { AuthError, RateLimitError } from '@/lib/errors/api-errors';
import {
  checkLoginRateLimit,
  checkRegisterRateLimit,
  recordLoginAttempt,
} from '@/services/rate-limit.service';

/**
 * Argon2 configuration from environment variables
 * Default values are secure for production
 */
const ARGON2_CONFIG = {
  type: argon2.argon2id,
  memoryCost: Number.parseInt(process.env.ARGON2_MEMORY_COST || '65536'),
  timeCost: Number.parseInt(process.env.ARGON2_TIME_COST || '3'),
  parallelism: Number.parseInt(process.env.ARGON2_PARALLELISM || '4'),
};

/**
 * Dynamic dummy hash for timing attack protection (Fix A3)
 * Generated on first use and memoized to match current ARGON2_CONFIG
 */
let _dummyHash: string | null = null;

async function getDummyHash(): Promise<string> {
  if (!_dummyHash) {
    _dummyHash = await argon2.hash(crypto.randomUUID(), ARGON2_CONFIG);
  }
  return _dummyHash;
}

/**
 * Timing attack protection wrapper
 * Ensures consistent response time regardless of user existence
 */
async function verifyPasswordWithTimingProtection(
  storedHash: string | null,
  providedPassword: string
): Promise<boolean> {
  const hashToVerify = storedHash || (await getDummyHash());

  try {
    const isValid = await argon2.verify(hashToVerify, providedPassword);
    return isValid;
  } catch {
    return false;
  }
}

/**
 * Extract client IP and user agent robustly (Fix A4)
 * x-forwarded-for can be a comma-separated list: client, proxy1, proxy2
 */
async function getClientInfo(): Promise<{ ipAddress: string; userAgent: string }> {
  const headersList = await headers();
  const rawIp = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || '';
  const ipAddress = rawIp.split(',')[0].trim() || 'unknown';
  const userAgent = headersList.get('user-agent') || 'unknown';
  return { ipAddress, userAgent };
}

/**
 * Register new user with hashed password
 * SECURITY: Protected against timing attacks (Fix A1)
 */
export const registerAction = safeAction(async (input: unknown) => {
  const validated = RegisterSchema.parse(input);
  const userRepo = getUserRepository();
  const { ipAddress, userAgent: _userAgent } = await getClientInfo();

  // Rate limiting (Fix S2)
  const rateLimit = await checkRegisterRateLimit(ipAddress, validated.email);
  if (!rateLimit.allowed) {
    log.warn(
      { action: 'auth.rate_limited', type: 'register', email: validated.email, ipAddress },
      'Registration rate limited'
    );
    throw new RateLimitError();
  }

  // Hash once upfront to prevent timing attack (Fix A1)
  const passwordHash = await argon2.hash(validated.password, ARGON2_CONFIG);

  // Check if email exists
  const existing = await userRepo.findByEmail(validated.email);

  // Always perform verification to maintain constant time
  await verifyPasswordWithTimingProtection(existing?.passwordHash || null, validated.password);

  if (existing) {
    // Record failed registration attempt before throwing (Fix S2)
    await recordLoginAttempt({
      userId: existing.id,
      email: validated.email,
      ipAddress,
      userAgent: _userAgent,
      success: false,
      type: 'REGISTER',
    });

    log.info(
      { action: 'auth.register.duplicate', email: validated.email, ipAddress },
      'Duplicate registration attempt'
    );
    throw new AuthError();
  }

  const user = await userRepo.create({
    email: validated.email,
    name: validated.name,
    passwordHash,
  });

  // Record successful registration attempt (Fix S2)
  await recordLoginAttempt({
    userId: user.id,
    email: validated.email,
    ipAddress,
    userAgent: _userAgent,
    success: true,
    type: 'REGISTER',
  });

  log.info(
    { action: 'auth.register.success', userId: user.id, email: user.email, ipAddress },
    'User registered successfully'
  );

  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
});

/**
 * Login user with password verification
 * SECURITY: Protected against timing attacks with constant-time response
 */
export const loginAction = safeAction(async (input: unknown) => {
  const validated = LoginSchema.parse(input);
  const userRepo = getUserRepository();
  const { ipAddress, userAgent } = await getClientInfo();

  // Rate limiting (Fix S2)
  const rateLimit = await checkLoginRateLimit(ipAddress, validated.email);
  if (!rateLimit.allowed) {
    log.warn(
      { action: 'auth.rate_limited', type: 'login', email: validated.email, ipAddress },
      'Login rate limited'
    );
    throw new RateLimitError();
  }

  // Fetch user
  const user = await userRepo.findByEmail(validated.email);

  // Always perform password verification (even if user doesn't exist)
  const isValid = await verifyPasswordWithTimingProtection(
    user?.passwordHash || null,
    validated.password
  );

  // Record attempt regardless of outcome (Fix A5 + S2)
  await recordLoginAttempt({
    userId: user?.id,
    email: validated.email,
    ipAddress,
    userAgent,
    success: !!user && isValid,
  });

  // If user doesn't exist or password doesn't match, return generic error
  if (!user || !isValid) {
    log.info(
      { action: 'auth.login.failure', email: validated.email, ipAddress },
      'Failed login attempt'
    );
    throw new AuthError();
  }

  await userRepo.updateLastLogin(user.id);

  // Create session
  const token = await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
  });

  await setSessionCookie(token);

  log.info(
    { action: 'auth.login.success', userId: user.id, email: user.email, ipAddress, userAgent },
    'User logged in successfully'
  );

  // Return WITHOUT ipAddress (Fix A7)
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    lastLoginAt: new Date().toISOString(),
  };
});

/**
 * Logout user
 */
export const logoutAction = safeAction(async () => {
  const session = await getSession();
  await deleteSession();

  if (session) {
    log.info({ action: 'auth.logout', userId: session.userId }, 'User logged out');
  }

  return { success: true };
});
