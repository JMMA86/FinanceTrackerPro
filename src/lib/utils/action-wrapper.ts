/**
 * Action Wrapper (Global Error Handler)
 * Wraps Server Actions for centralized error handling
 *
 * Usage:
 * export const myAction = safeAction(async (input) => {
 *   // Business logic
 *   // Throw AppError subclasses
 * });
 */

import { ZodError } from 'zod';
import { AppError } from '@/lib/errors/api-errors';
import { log } from '@/lib/logger';

/**
 * Standard action response format
 */
export type ActionResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
};

/**
 * Safe action wrapper
 * Catches all errors and returns standardized response
 *
 * @param action Async function to wrap (Server Action)
 * @returns Wrapped function with error handling
 */
export function safeAction<TInput, TOutput>(
  action: (input: TInput) => Promise<TOutput>
): (input: TInput) => Promise<ActionResponse<TOutput>> {
  return async (input: TInput): Promise<ActionResponse<TOutput>> => {
    try {
      const result = await action(input);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof ZodError) {
        const firstError = error.errors?.[0];
        const message = firstError?.path
          ? `${firstError.path.join('.')}: ${firstError.message}`
          : 'Validation failed';

        log.error({ message, errors: error.errors }, '[ACTION] Validation error');

        return {
          success: false,
          error: message,
          code: 'VALIDATION_ERROR',
        };
      }

      // Handle custom AppError instances
      if (error instanceof AppError) {
        log.error({ code: error.code, message: error.message }, '[ACTION] AppError');

        return {
          success: false,
          error: error.message,
          code: error.code,
        };
      }

      // Handle unexpected errors
      const message = error instanceof Error ? error.message : 'An unexpected error occurred';

      log.error(
        { error: error instanceof Error ? error : { message } },
        '[ACTION] Unexpected error'
      );

      return {
        success: false,
        error: message,
        code: 'INTERNAL_SERVER_ERROR',
      };
    }
  };
}

/**
 * Safe action wrapper with custom error transformer
 * Allows mapping errors to custom responses
 *
 * @param action Async function to wrap
 * @param errorTransformer Custom error handler
 * @returns Wrapped function with custom error handling
 */
export function safeActionWithTransform<TInput, TOutput>(
  action: (input: TInput) => Promise<TOutput>,
  errorTransformer: (error: unknown) => ActionResponse<TOutput>
): (input: TInput) => Promise<ActionResponse<TOutput>> {
  return async (input: TInput): Promise<ActionResponse<TOutput>> => {
    try {
      const result = await action(input);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return errorTransformer(error);
    }
  };
}
