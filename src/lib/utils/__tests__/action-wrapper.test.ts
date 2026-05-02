import { describe, it, expect, vi, afterEach } from 'vitest';
import { safeAction, safeActionWithTransform } from '../action-wrapper';
import { ZodError, z } from 'zod';
import { AppError } from '@/lib/errors/api-errors';

describe('action-wrapper.ts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('safeAction', () => {
    describe('when the action succeeds', () => {
      it('should return success response with data', async () => {
        // Given
        const action = async (input: { value: number }) => ({ result: input.value * 2 });
        const wrappedAction = safeAction(action);

        // When
        const response = await wrappedAction({ value: 5 });

        // Then
        expect(response.success).toBe(true);
        expect(response.data).toEqual({ result: 10 });
        expect(response.error).toBeUndefined();
      });

      it('should forward input to the wrapped action', async () => {
        // Given
        const action = async (input: { userId: string; amount: number }) => ({
          userId: input.userId,
          total: input.amount * 2,
        });
        const wrappedAction = safeAction(action);

        // When
        const response = await wrappedAction({ userId: 'user-1', amount: 100 });

        // Then
        expect(response.success).toBe(true);
        expect(response.data?.userId).toBe('user-1');
        expect(response.data?.total).toBe(200);
      });
    });

    describe('when the action throws a Zod validation error', () => {
      it('should return VALIDATION_ERROR with generic message when issues array is empty', async () => {
        // Given
        const action = async () => {
          throw new ZodError([]);
        };
        const wrappedAction = safeAction(action);

        // When
        const response = await wrappedAction({});

        // Then
        expect(response.success).toBe(false);
        expect(response.error).toBe('Validation failed');
        expect(response.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('when the action throws an AppError', () => {
      it('should return the error code and message from the AppError', async () => {
        // Given
        const action = async () => {
          throw new AppError('Resource not found', 404, 'NOT_FOUND');
        };
        const wrappedAction = safeAction(action);

        // When
        const response = await wrappedAction({});

        // Then
        expect(response.success).toBe(false);
        expect(response.error).toBe('Resource not found');
        expect(response.code).toBe('NOT_FOUND');
      });
    });

    describe('when the action throws a native Error', () => {
      it('should return INTERNAL_SERVER_ERROR with the error message', async () => {
        // Given
        const action = async () => {
          throw new Error('Something went wrong');
        };
        const wrappedAction = safeAction(action);

        // When
        const response = await wrappedAction({});

        // Then
        expect(response.success).toBe(false);
        expect(response.error).toBe('Something went wrong');
        expect(response.code).toBe('INTERNAL_SERVER_ERROR');
      });
    });

    describe('when the action throws a non-Error value', () => {
      it('should return INTERNAL_SERVER_ERROR with generic message for string throw', async () => {
        // Given
        const action = vi.fn().mockRejectedValue('unexpected string error');
        const wrappedAction = safeAction(action);

        // When
        const response = await wrappedAction({});

        // Then
        expect(response.success).toBe(false);
        expect(response.error).toBe('An unexpected error occurred');
        expect(response.code).toBe('INTERNAL_SERVER_ERROR');
      });

      it('should return INTERNAL_SERVER_ERROR with generic message for null throw', async () => {
        // Given
        const action = vi.fn().mockRejectedValue(null);
        const wrappedAction = safeAction(action);

        // When
        const response = await wrappedAction({});

        // Then
        expect(response.success).toBe(false);
        expect(response.error).toBe('An unexpected error occurred');
        expect(response.code).toBe('INTERNAL_SERVER_ERROR');
      });
    });
  });

  describe('safeActionWithTransform', () => {
    describe('when the action succeeds', () => {
      it('should return success response and not invoke the error transformer', async () => {
        // Given
        const action = async (input: { value: number }) => ({ result: input.value * 2 });
        const errorTransformer = vi.fn().mockReturnValue({ success: false, error: 'Custom error' });
        const wrappedAction = safeActionWithTransform(action, errorTransformer);

        // When
        const response = await wrappedAction({ value: 5 });

        // Then
        expect(response.success).toBe(true);
        expect(response.data).toEqual({ result: 10 });
        expect(errorTransformer).not.toHaveBeenCalled();
      });
    });

    describe('when the action throws an error', () => {
      it('should delegate to the custom error transformer', async () => {
        // Given
        const action = async () => {
          throw new Error('Original error');
        };
        const errorTransformer = (error: unknown) => ({
          success: false as const,
          error: `Custom: ${error instanceof Error ? error.message : 'Unknown'}`,
          code: 'CUSTOM_ERROR',
        });
        const wrappedAction = safeActionWithTransform(action, errorTransformer);

        // When
        const response = await wrappedAction({});

        // Then
        expect(response.success).toBe(false);
        expect(response.error).toBe('Custom: Original error');
        expect(response.code).toBe('CUSTOM_ERROR');
      });

      it('should allow transformer to distinguish AppError types', async () => {
        // Given
        const action = async () => {
          throw new AppError('Unauthorized', 403, 'UNAUTHORIZED');
        };
        const errorTransformer = (error: unknown) => {
          if (error instanceof AppError && error.code === 'UNAUTHORIZED') {
            return { success: false as const, error: 'Please log in', code: 'AUTH_REQUIRED' };
          }
          return { success: false as const, error: 'Unknown error' };
        };
        const wrappedAction = safeActionWithTransform(action, errorTransformer);

        // When
        const response = await wrappedAction({});

        // Then
        expect(response.success).toBe(false);
        expect(response.error).toBe('Please log in');
        expect(response.code).toBe('AUTH_REQUIRED');
      });

      it('should allow transformer to handle ZodError', async () => {
        // Given
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
              success: false as const,
              error: 'Validation failed',
              code: 'CUSTOM_VALIDATION',
              data: error.issues,
            };
          }
          return { success: false as const, error: 'Unknown error' };
        };
        const wrappedAction = safeActionWithTransform(action, errorTransformer);

        // When
        const response = await wrappedAction({});

        // Then
        expect(response.success).toBe(false);
        expect(response.error).toBe('Validation failed');
        expect(response.code).toBe('CUSTOM_VALIDATION');
      });

      it('should allow transformer to return data alongside error', async () => {
        // Given
        const action = async () => {
          throw new Error('Test error');
        };
        const errorTransformer = () => ({
          success: false as const,
          error: 'Error occurred',
          data: { retryAfter: 60 },
        });
        const wrappedAction = safeActionWithTransform(action, errorTransformer);

        // When
        const response = await wrappedAction({});

        // Then
        expect(response.success).toBe(false);
        expect(response.error).toBe('Error occurred');
        expect(response.data).toEqual({ retryAfter: 60 });
      });
    });
  });
});
