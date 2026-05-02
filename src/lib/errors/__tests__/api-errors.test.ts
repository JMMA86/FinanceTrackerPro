import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  InsufficientFundsError,
  NotFoundError,
  UnauthorizedError,
  IdempotencyError,
  CurrencyMismatchError,
  InactiveAccountError,
  InternalServerError,
} from '../api-errors';

describe('api-errors.ts', () => {
  describe('AppError', () => {
    it('should create error with correct properties', () => {
      // Given / When
      const error = new AppError('Test error', 400, 'TEST_ERROR');

      // Then
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('AppError');
      expect(error).toBeInstanceOf(Error);
    });

    it('should maintain proper stack trace', () => {
      // Given / When
      const error = new AppError('Stack test', 500, 'STACK');

      // Then
      expect(error.stack).toBeDefined();
    });
  });

  describe('ValidationError', () => {
    it('should use default message when none provided', () => {
      // Given / When
      const error = new ValidationError();

      // Then
      expect(error.message).toBe('Invalid input data');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error).toBeInstanceOf(AppError);
    });

    it('should use custom message when provided', () => {
      // Given / When
      const error = new ValidationError('Custom validation error');

      // Then
      expect(error.message).toBe('Custom validation error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('InsufficientFundsError', () => {
    it('should include required and available amounts in message', () => {
      // Given / When
      const error = new InsufficientFundsError(100000, 50000);

      // Then
      expect(error.message).toBe('Insufficient funds: Balance 50000 cents, required 100000 cents');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('INSUFFICIENT_FUNDS');
    });
  });

  describe('NotFoundError', () => {
    it('should include resource name and id in message', () => {
      // Given / When
      const error = new NotFoundError('Account', 'account-123');

      // Then
      expect(error.message).toBe('Account with ID account-123 not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
    });
  });

  describe('UnauthorizedError', () => {
    it('should use default message when none provided', () => {
      // Given / When
      const error = new UnauthorizedError();

      // Then
      expect(error.message).toBe('Unauthorized access to resource');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('UNAUTHORIZED');
    });

    it('should use custom message when provided', () => {
      // Given / When
      const error = new UnauthorizedError('Not your account');

      // Then
      expect(error.message).toBe('Not your account');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('IdempotencyError', () => {
    it('should include idempotency key in message', () => {
      // Given / When
      const error = new IdempotencyError('key-123');

      // Then
      expect(error.message).toBe('Idempotency key key-123 already processed');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('IDEMPOTENCY_CONFLICT');
    });
  });

  describe('CurrencyMismatchError', () => {
    it('should include expected and received currencies in message', () => {
      // Given / When
      const error = new CurrencyMismatchError('USD', 'EUR');

      // Then
      expect(error.message).toBe('Currency mismatch: Expected USD, received EUR');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('CURRENCY_MISMATCH');
    });
  });

  describe('InactiveAccountError', () => {
    it('should include account id in message', () => {
      // Given / When
      const error = new InactiveAccountError('account-456');

      // Then
      expect(error.message).toBe('Account account-456 is inactive');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('INACTIVE_ACCOUNT');
    });
  });

  describe('InternalServerError', () => {
    it('should use default message when none provided', () => {
      // Given / When
      const error = new InternalServerError();

      // Then
      expect(error.message).toBe('An unexpected error occurred');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_SERVER_ERROR');
    });

    it('should use custom message when provided', () => {
      // Given / When
      const error = new InternalServerError('Database connection failed');

      // Then
      expect(error.message).toBe('Database connection failed');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });
});
