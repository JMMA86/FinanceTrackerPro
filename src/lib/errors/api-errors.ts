/**
 * Domain Errors (Clean Architecture)
 * Centralized error handling for Server Actions
 *
 * Usage: throw new InsufficientFundsError() in business logic
 * Handled by: safeAction wrapper
 */

/**
 * Base application error
 * All custom errors extend this
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    this.name = this.constructor.name;
  }
}

/**
 * 400 - Validation Error
 * Thrown when Zod validation fails or input is invalid
 */
export class ValidationError extends AppError {
  constructor(message: string = 'Invalid input data') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

/**
 * 400 - Insufficient Funds
 * Thrown when account balance is too low for operation
 */
export class InsufficientFundsError extends AppError {
  constructor(required: number, available: number) {
    super(
      `Insufficient funds: Balance ${available} cents, required ${required} cents`,
      400,
      'INSUFFICIENT_FUNDS'
    );
  }
}

/**
 * 404 - Not Found
 * Thrown when requested resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} with ID ${id} not found`, 404, 'NOT_FOUND');
  }
}

/**
 * 403 - Unauthorized
 * Thrown when user doesn't have permission for resource
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized access to resource') {
    super(message, 403, 'UNAUTHORIZED');
  }
}

/**
 * 409 - Idempotency Conflict
 * Thrown when idempotency key already exists (duplicate operation)
 */
export class IdempotencyError extends AppError {
  constructor(key: string) {
    super(`Idempotency key ${key} already processed`, 409, 'IDEMPOTENCY_CONFLICT');
  }
}

/**
 * 400 - Currency Mismatch
 * Thrown when currencies don't match in operations
 */
export class CurrencyMismatchError extends AppError {
  constructor(expected: string, received: string) {
    super(
      `Currency mismatch: Expected ${expected}, received ${received}`,
      400,
      'CURRENCY_MISMATCH'
    );
  }
}

/**
 * 400 - Inactive Account
 * Thrown when attempting to use a soft-deleted account
 */
export class InactiveAccountError extends AppError {
  constructor(accountId: string) {
    super(`Account ${accountId} is inactive`, 400, 'INACTIVE_ACCOUNT');
  }
}

/**
 * 500 - Internal Server Error
 * Generic error for unexpected failures
 */
export class InternalServerError extends AppError {
  constructor(message: string = 'An unexpected error occurred') {
    super(message, 500, 'INTERNAL_SERVER_ERROR');
  }
}
