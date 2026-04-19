/**
 * Authentication Server Actions
 * Handles user registration and login with password hashing
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
 * Register new user with hashed password
 */
export const registerAction = safeAction(async (input: unknown) => {
  const validated = RegisterSchema.parse(input);
  const userRepo = getUserRepository();

  const existing = await userRepo.findByEmail(validated.email);
  if (existing) {
    throw new Error('Email already registered');
  }

  const passwordHash = await argon2.hash(validated.password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

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
 */
export const loginAction = safeAction(async (input: unknown) => {
  const validated = LoginSchema.parse(input);
  const userRepo = getUserRepository();

  const user = await userRepo.findByEmail(validated.email);
  if (!user?.passwordHash) {
    throw new Error('Invalid credentials');
  }

  const valid = await argon2.verify(user.passwordHash, validated.password);
  if (!valid) {
    throw new Error('Invalid credentials');
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
