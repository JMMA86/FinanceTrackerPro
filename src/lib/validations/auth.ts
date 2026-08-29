/**
 * Authentication Validation Schemas
 * Server-side validation for register/login operations
 */

import { z } from 'zod';

/**
 * Password validation
 * Min 12 chars, at least 1 uppercase, 1 lowercase, 1 number
 */
const PasswordSchema = z
  .string()
  .min(12, { message: 'Password must be at least 12 characters' })
  .regex(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
  .regex(/[a-z]/, { message: 'Password must contain at least one lowercase letter' })
  .regex(/\d/, { message: 'Password must contain at least one number' });

/**
 * Email validation
 */
const EmailSchema = z
  .email({ message: 'Invalid email address' })
  .transform((val) => val.toLowerCase());

/**
 * User registration schema
 */
export const RegisterSchema = z.object({
  email: EmailSchema,
  name: z
    .string()
    .min(2, { message: 'Name must be at least 2 characters' })
    .max(100, { message: 'Name too long' }),
  password: PasswordSchema,
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

/**
 * User login schema
 */
export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, { message: 'Password is required' }),
});

export type LoginInput = z.infer<typeof LoginSchema>;
