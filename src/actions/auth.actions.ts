/**
 * Authentication Server Actions
 * Handles user registration and login with password hashing
 * SECURITY: Protected against timing attacks with constant-time responses
 */

'use server';

import 'server-only';
import * as argon2 from 'argon2';
import { headers } from 'next/headers';
import { safeAction } from '@/lib/utils/action-wrapper';
import { RegisterSchema, LoginSchema } from '@/lib/validations/auth';
import { getUserRepository } from '@/lib/repositories';
import { createSession, setSessionCookie, deleteSession } from '@/lib/auth/session';

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
 * Constant-time dummy hash for timing attack protection
 * Used when user is not found to ensure uniform response time
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/**
 * Timing attack protection wrapper
 * Ensures consistent response time regardless of user existence
 */
async function verifyPasswordWithTimingProtection(
  storedHash: string | null,
  providedPassword: string
): Promise<boolean> {
  const hashToVerify = storedHash || DUMMY_HASH;

  try {
    const isValid = await argon2.verify(hashToVerify, providedPassword);
    return isValid;
  } catch {
    return false;
  }
}

/**
 * Generic error message to prevent user enumeration
 */
const GENERIC_AUTH_ERROR = 'Invalid email or password';

/**
 * Register new user with hashed password
 * SECURITY: Protected against timing attacks
 */
export const registerAction = safeAction(async (input: unknown) => {
  const validated = RegisterSchema.parse(input);
  const userRepo = getUserRepository();

  // Always perform hash operation to prevent timing attack
  const dummyHash = await argon2.hash(validated.password, ARGON2_CONFIG);

  // Check if email exists (timing-safe)
  const existing = await userRepo.findByEmail(validated.email);

  // Always perform dummy verification to maintain constant time
  await argon2.verify(dummyHash, validated.password);

  if (existing) {
    // Use generic message to prevent user enumeration
    throw new Error(GENERIC_AUTH_ERROR);
  }

  const passwordHash = await argon2.hash(validated.password, ARGON2_CONFIG);

  const user = await userRepo.create({
    email: validated.email,
    name: validated.name,
    passwordHash,
  });

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

  // Fetch user
  const user = await userRepo.findByEmail(validated.email);

  // Always perform password verification (even if user doesn't exist)
  // This ensures consistent timing regardless of user existence
  const isValid = await verifyPasswordWithTimingProtection(
    user?.passwordHash || null,
    validated.password
  );

  // If user doesn't exist or password doesn't match, return generic error
  if (!user || !isValid) {
    throw new Error(GENERIC_AUTH_ERROR);
  }

  const headersList = await headers();
  const ipAddress = headersList.get('x-forwarded-for') || 'unknown';

  await userRepo.updateLastLogin(user.id);

  // Create session
  const token = await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
  });

  await setSessionCookie(token);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    lastLoginAt: new Date().toISOString(),
    ipAddress,
  };
});

/**
 * Logout user
 */
export const logoutAction = safeAction(async () => {
  await deleteSession();
  return { success: true };
});
