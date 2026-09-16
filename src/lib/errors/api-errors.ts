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
 * 400 - Insufficient Quantity
 * Thrown when a sell quantity exceeds the available holding quantity
 */
export class InsufficientQuantityError extends AppError {
  constructor(required: number, available: number) {
    super(
      `Insufficient quantity: available ${available}, required ${required}`,
      400,
      'INSUFFICIENT_QUANTITY'
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
 * 401 - Authentication Error
 * Thrown when credentials are invalid (prevents user enumeration)
 */
export class AuthError extends AppError {
  constructor(message: string = 'Invalid email or password') {
    super(message, 401, 'AUTH_ERROR');
  }
}

/**
 * 429 - Rate Limit Error
 * Thrown when too many requests are made
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Too many attempts. Please try again later.') {
    super(message, 429, 'RATE_LIMITED');
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
 * 400 - Negative Balance
 * Thrown when deleting a transaction would leave the account balance negative
 */
export class NegativeBalanceError extends AppError {
  constructor(accountId: string) {
    super(
      `Deleting this transaction would leave account ${accountId} with a negative balance`,
      400,
      'BALANCE_NEGATIVE'
    );
  }
}

/**
 * 400 - Account Has Balance
 * Thrown when deleting an account that still has funds
 */
export class AccountHasBalanceError extends AppError {
  constructor(accountId: string, balanceCents: number) {
    super(
      `Account ${accountId} still has a balance of ${balanceCents} cents. Balance must be zero to delete`,
      400,
      'ACCOUNT_HAS_BALANCE'
    );
  }
}

/**
 * 400 - Card Has Balance (debt)
 * Thrown when deleting a credit card that still has outstanding debt
 */
export class CardHasBalanceError extends AppError {
  constructor(accountId: string, debtCents: number) {
    super(
      `Credit card ${accountId} still has an outstanding debt of ${debtCents} cents. Pay the balance before deleting the card`,
      400,
      'CARD_HAS_BALANCE'
    );
  }
}

/**
 * 400 - Credit Limit Exceeded
 * Thrown when a credit card expense would exceed the configured credit limit
 */
export class CreditLimitExceededError extends AppError {
  constructor(accountId: string, creditLimitCents: number) {
    super(
      `Credit card ${accountId} does not have enough available credit. Limit is ${creditLimitCents} cents`,
      400,
      'CREDIT_LIMIT_EXCEEDED'
    );
  }
}

/**
 * 400 - Card No Debt
 * Thrown when trying to pay a credit card that has no outstanding balance
 */
export class CardNoDebtError extends AppError {
  constructor(accountId: string) {
    super(`Credit card ${accountId} has no outstanding balance to pay`, 400, 'CARD_NO_DEBT');
  }
}

/**
 * 400 - Card Overpayment
 * Thrown when a payment amount exceeds the card's outstanding debt
 */
export class CardOverpaymentError extends AppError {
  constructor(amountCents: number, debtCents: number) {
    super(
      `Payment amount ${amountCents} cents exceeds the card's outstanding debt of ${debtCents} cents`,
      400,
      'CARD_OVERPAYMENT'
    );
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

/**
 * 400 - Pocket Transfer Not Allowed
 * Thrown when a transfer violates pocket hierarchy rules
 * (pocket -> external account, account -> other account's pocket, etc.)
 */
export class PocketTransferError extends AppError {
  constructor() {
    super(
      'Transfer not allowed: pockets can only move money within their parent account',
      400,
      'POCKET_TRANSFER_NOT_ALLOWED'
    );
  }
}

/**
 * 400 - Goal Completed
 * Thrown when attempting to contribute to a savings goal already completed
 */
export class GoalCompletedError extends AppError {
  constructor() {
    super('Cannot contribute to a completed goal', 400, 'GOAL_COMPLETED');
  }
}

/**
 * 400 - Goal Has Contributions
 * Thrown when attempting to delete a savings goal that still has contributions
 */
export class GoalHasContributionsError extends AppError {
  constructor() {
    super(
      'Cannot delete a goal that has contributions. Deactivate it instead.',
      400,
      'GOAL_HAS_CONTRIBUTIONS'
    );
  }
}

/**
 * 400 - Goal Cancelled
 * Thrown when attempting to contribute to a savings goal that was cancelled
 */
export class GoalCancelledError extends AppError {
  constructor() {
    super('Cannot contribute to a cancelled goal', 400, 'GOAL_CANCELLED');
  }
}

/**
 * 400 - Goal Target Below Current
 * Thrown when editing a goal's target below the amount already saved
 */
export class GoalTargetBelowCurrentError extends AppError {
  constructor(goalId: string) {
    super(
      `Cannot lower the target of goal ${goalId} below the amount already saved`,
      400,
      'GOAL_TARGET_BELOW_CURRENT'
    );
  }
}

/**
 * 400 - Goal Cannot Complete
 * Thrown when trying to mark a goal as COMPLETED before reaching the target
 */
export class GoalCannotCompleteError extends AppError {
  constructor() {
    super(
      'Cannot mark a goal as COMPLETED before reaching its target amount',
      400,
      'GOAL_CANNOT_COMPLETE'
    );
  }
}

/**
 * 400 - Transaction Linked To Savings
 * Thrown when trying to EDIT the amount or date of a transaction that is the
 * funding source of an active savings contribution. Deleting such a
 * transaction is allowed (it cascades to soft-delete the linked contribution),
 * so this error is intentionally scoped to monetary/date edits only. The
 * message is generic and does not expose any IDs.
 */
export class TransactionLinkedToSavingsError extends AppError {
  constructor() {
    super(
      'This transaction is linked to an active savings contribution. Its amount and date cannot be changed.',
      400,
      'TRANSACTION_LINKED_TO_SAVINGS'
    );
  }
}

/**
 * 400 - Fixed Expense Already Paid
 * Thrown when paying a materialized fixed expense payment that already has a
 * paidDate. There is no payment reversal in v1. The message is generic and does
 * not expose any IDs.
 */
export class FixedExpenseAlreadyPaidError extends AppError {
  constructor() {
    super('This fixed expense payment has already been paid', 400, 'FIXED_EXPENSE_ALREADY_PAID');
  }
}

/**
 * 400 - Payment Amount Invalid
 * Thrown when the resolved payment amount (override or expected) is not a
 * positive integer number of cents.
 */
export class PaymentAmountInvalidError extends AppError {
  constructor() {
    super('The payment amount must be greater than zero', 400, 'PAYMENT_AMOUNT_INVALID');
  }
}

/**
 * 404 - Loan Not Found
 * Thrown when a loan/installment does not exist, is soft-deleted or belongs to
 * another user. The message is generic and never exposes any IDs.
 */
export class LoanNotFoundError extends AppError {
  constructor() {
    super('Loan not found', 404, 'LOAN_NOT_FOUND');
  }
}

/**
 * 400 - Loan Already Completed
 * Thrown when mutating a loan that is already settled (balance zero and every
 * installment paid). Generic message, no IDs.
 */
export class LoanAlreadyCompletedError extends AppError {
  constructor() {
    super('This loan is already completed', 400, 'LOAN_ALREADY_COMPLETED');
  }
}

/**
 * 400 - Loan Installment Already Paid
 * Thrown when paying/receiving an installment that is already fully paid.
 */
export class LoanInstallmentAlreadyPaidError extends AppError {
  constructor() {
    super('This loan installment has already been paid', 400, 'LOAN_INSTALLMENT_ALREADY_PAID');
  }
}

/**
 * 400 - Loan Installment Not Payable
 * Thrown when the target installment is not in a payable state (cancelled,
 * waived, inactive or a completed loan). Generic message, no IDs.
 */
export class LoanInstallmentNotPayableError extends AppError {
  constructor() {
    super('This loan installment is not payable', 400, 'LOAN_INSTALLMENT_NOT_PAYABLE');
  }
}

/**
 * 400 - Loan Direction Mismatch
 * Thrown when the money movement does not match the loan direction (e.g. trying
 * to register a receipt against a PAYABLE loan).
 */
export class LoanDirectionMismatchError extends AppError {
  constructor() {
    super('The operation does not match the loan direction', 400, 'LOAN_DIRECTION_MISMATCH');
  }
}

/**
 * 400 - Loan Adjustment Not Allowed
 * Thrown when an adjustment/operation is rejected by the loan's current state
 * (unpaid schedule required, deleting a loan with payments, etc).
 */
export class LoanAdjustmentNotAllowedError extends AppError {
  constructor() {
    super(
      'This operation is not allowed for the current loan state',
      400,
      'LOAN_ADJUSTMENT_NOT_ALLOWED'
    );
  }
}

/**
 * 400 - Loan Overpayment
 * Thrown when an EXTRA_PAYMENT exceeds the outstanding balance derived from the
 * loan ledger. Generic message: never exposes amounts or IDs.
 */
export class LoanOverpaymentError extends AppError {
  constructor() {
    super('The extra payment exceeds the outstanding loan balance', 400, 'LOAN_OVERPAYMENT');
  }
}
