/**
 * API Errors Test Suite
 * Tests domain error classes
 */

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

describe('api-errors.ts - AppError', () => {
  it('should create AppError with correct properties', () => {
    const error = new AppError('Test error', 400, 'TEST_ERROR');

    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('TEST_ERROR');
    expect(error.isOperational).toBe(true);
    expect(error.name).toBe('AppError');
    expect(error).toBeInstanceOf(Error);
  });

  it('should maintain proper stack trace', () => {
    const error = new AppError('Stack test', 500, 'STACK');
    expect(error.stack).toBeDefined();
  });
});

describe('api-errors.ts - ValidationError', () => {
  it('should create ValidationError with default message', () => {
    const error = new ValidationError();

    expect(error.message).toBe('Invalid input data');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error).toBeInstanceOf(AppError);
  });

  it('should create ValidationError with custom message', () => {
    const error = new ValidationError('Custom validation error');

    expect(error.message).toBe('Custom validation error');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
  });
});

describe('api-errors.ts - InsufficientFundsError', () => {
  it('should create InsufficientFundsError with amounts', () => {
    const error = new InsufficientFundsError(100000, 50000);

    expect(error.message).toBe('Insufficient funds: Balance 50000 cents, required 100000 cents');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('INSUFFICIENT_FUNDS');
  });
});

describe('api-errors.ts - NotFoundError', () => {
  it('should create NotFoundError with resource details', () => {
    const error = new NotFoundError('Account', 'account-123');

    expect(error.message).toBe('Account with ID account-123 not found');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
  });
});

describe('api-errors.ts - UnauthorizedError', () => {
  it('should create UnauthorizedError with default message', () => {
    const error = new UnauthorizedError();

    expect(error.message).toBe('Unauthorized access to resource');
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('should create UnauthorizedError with custom message', () => {
    const error = new UnauthorizedError('Not your account');

    expect(error.message).toBe('Not your account');
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('UNAUTHORIZED');
  });
});

describe('api-errors.ts - IdempotencyError', () => {
  it('should create IdempotencyError with key', () => {
    const error = new IdempotencyError('key-123');

    expect(error.message).toBe('Idempotency key key-123 already processed');
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});

describe('api-errors.ts - CurrencyMismatchError', () => {
  it('should create CurrencyMismatchError with currencies', () => {
    const error = new CurrencyMismatchError('USD', 'EUR');

    expect(error.message).toBe('Currency mismatch: Expected USD, received EUR');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('CURRENCY_MISMATCH');
  });
});

describe('api-errors.ts - InactiveAccountError', () => {
  it('should create InactiveAccountError with account ID', () => {
    const error = new InactiveAccountError('account-456');

    expect(error.message).toBe('Account account-456 is inactive');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('INACTIVE_ACCOUNT');
  });
});

describe('api-errors.ts - InternalServerError', () => {
  it('should create InternalServerError with default message', () => {
    const error = new InternalServerError();

    expect(error.message).toBe('An unexpected error occurred');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('should create InternalServerError with custom message', () => {
    const error = new InternalServerError('Database connection failed');

    expect(error.message).toBe('Database connection failed');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
