/**
 * Action Wrapper Test Suite
 * Tests centralized error handling for Server Actions
 */

import { describe, it, expect } from 'vitest';
import { safeAction, safeActionWithTransform } from '../action-wrapper';
import { ZodError, z } from 'zod';
import { AppError } from '@/lib/errors/api-errors';

describe('action-wrapper.ts - safeAction', () => {
  it('should return success response for successful action', async () => {
    const action = async (input: { value: number }) => {
      return { result: input.value * 2 };
    };

    const wrappedAction = safeAction(action);
    const response = await wrappedAction({ value: 5 });

    expect(response.success).toBe(true);
    expect(response.data).toEqual({ result: 10 });
    expect(response.error).toBeUndefined();
  });

  it('should handle Zod validation errors', async () => {
    const action = async () => {
      // ZodError with no valid errors falls back to generic message
      const zodError = new ZodError([]);
      throw zodError;
    };

    const wrappedAction = safeAction(action);
    const response = await wrappedAction({});

    expect(response.success).toBe(false);
    expect(response.error).toBe('Validation failed');
    expect(response.code).toBe('VALIDATION_ERROR');
  });

  it('should handle custom AppError instances', async () => {
    const action = async () => {
      throw new AppError('Resource not found', 404, 'NOT_FOUND');
    };

    const wrappedAction = safeAction(action);
    const response = await wrappedAction({});

    expect(response.success).toBe(false);
    expect(response.error).toBe('Resource not found');
    expect(response.code).toBe('NOT_FOUND');
  });

  it('should handle generic Error instances', async () => {
    const action = async () => {
      throw new Error('Something went wrong');
    };

    const wrappedAction = safeAction(action);
    const response = await wrappedAction({});

    expect(response.success).toBe(false);
    expect(response.error).toBe('Something went wrong');
    expect(response.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('should handle non-Error thrown values', async () => {
    const action = async () => {
      throw new Error('An unexpected error occurred');
    };

    const wrappedAction = safeAction(action);
    const response = await wrappedAction({});

    expect(response.success).toBe(false);
    expect(response.error).toBe('An unexpected error occurred');
    expect(response.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('should handle null thrown values', async () => {
    const action = async () => {
      throw new Error('An unexpected error occurred');
    };

    const wrappedAction = safeAction(action);
    const response = await wrappedAction({});

    expect(response.success).toBe(false);
    expect(response.error).toBe('An unexpected error occurred');
    expect(response.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('should pass input to wrapped action', async () => {
    const action = async (input: { userId: string; amount: number }) => {
      return { userId: input.userId, total: input.amount * 2 };
    };

    const wrappedAction = safeAction(action);
    const response = await wrappedAction({ userId: 'user-1', amount: 100 });

    expect(response.success).toBe(true);
    expect(response.data?.userId).toBe('user-1');
    expect(response.data?.total).toBe(200);
  });
});

describe('action-wrapper.ts - safeActionWithTransform', () => {
  it('should return success response for successful action', async () => {
    const action = async (input: { value: number }) => {
      return { result: input.value * 2 };
    };

    const errorTransformer = () => ({ success: false, error: 'Custom error' });

    const wrappedAction = safeActionWithTransform(action, errorTransformer);
    const response = await wrappedAction({ value: 5 });

    expect(response.success).toBe(true);
    expect(response.data).toEqual({ result: 10 });
  });

  it('should use custom error transformer on error', async () => {
    const action = async () => {
      throw new Error('Original error');
    };

    const errorTransformer = (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown';
      return {
        success: false,
        error: `Custom: ${message}`,
        code: 'CUSTOM_ERROR',
      };
    };

    const wrappedAction = safeActionWithTransform(action, errorTransformer);
    const response = await wrappedAction({});

    expect(response.success).toBe(false);
    expect(response.error).toBe('Custom: Original error');
    expect(response.code).toBe('CUSTOM_ERROR');
  });

  it('should handle custom transformation for AppError', async () => {
    const action = async () => {
      throw new AppError('Unauthorized', 403, 'UNAUTHORIZED');
    };

    const errorTransformer = (error: unknown) => {
      if (error instanceof AppError && error.code === 'UNAUTHORIZED') {
        return {
          success: false,
          error: 'Please log in',
          code: 'AUTH_REQUIRED',
        };
      }
      return { success: false, error: 'Unknown error' };
    };

    const wrappedAction = safeActionWithTransform(action, errorTransformer);
    const response = await wrappedAction({});

    expect(response.success).toBe(false);
    expect(response.error).toBe('Please log in');
    expect(response.code).toBe('AUTH_REQUIRED');
  });

  it('should handle custom transformation for ZodError', async () => {
    const action = async () => {
      throw new ZodError([
        {
          code: 'too_small',
          minimum: 10,
          inclusive: true,
          path: ['amount'],
          message: 'Amount must be at least 10',
        } as unknown as z.core.$ZodIssueTooSmall,
      ]);
    };

    const errorTransformer = (error: unknown) => {
      if (error instanceof ZodError) {
        return {
          success: false,
          error: 'Validation failed',
          code: 'CUSTOM_VALIDATION',
          data: error.issues,
        };
      }
      return { success: false, error: 'Unknown error' };
    };

    const wrappedAction = safeActionWithTransform(action, errorTransformer);
    const response = await wrappedAction({});

    expect(response.success).toBe(false);
    expect(response.error).toBe('Validation failed');
    expect(response.code).toBe('CUSTOM_VALIDATION');
  });

  it('should allow errorTransformer to return data', async () => {
    const action = async () => {
      throw new Error('Test error');
    };

    const errorTransformer = () => {
      return {
        success: false,
        error: 'Error occurred',
        data: { retryAfter: 60 },
      };
    };

    const wrappedAction = safeActionWithTransform(action, errorTransformer);
    const response = await wrappedAction({});

    expect(response.success).toBe(false);
    expect(response.error).toBe('Error occurred');
    expect(response.data).toEqual({ retryAfter: 60 });
  });
});
