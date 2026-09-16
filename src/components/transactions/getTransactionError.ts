/**
 * Localized transaction error mapping (client-side).
 *
 * Maps server action error codes to user-facing i18n messages. Follows the
 * AuthClient `getLocalizedError` pattern: unknown codes fall back to the raw
 * server message, then to the generic create error.
 */

import { get } from '@/lib/i18n';

interface ErrorResult {
  code?: string;
  error?: string;
}

export function getTransactionError(
  result: ErrorResult,
  dictionary: Record<string, unknown>
): string {
  switch (result.code) {
    case 'INSUFFICIENT_FUNDS':
      return get(dictionary, 'insufficientFunds');
    case 'CURRENCY_MISMATCH':
      return get(dictionary, 'currencyMismatch');
    case 'INACTIVE_ACCOUNT':
      return get(dictionary, 'inactiveAccount');
    case 'VALIDATION_ERROR':
      return get(dictionary, 'validationError');
    case 'NOT_FOUND':
      return get(dictionary, 'accountNotFound');
    case 'RATE_LIMITED':
      return get(dictionary, 'rateLimited');
    case 'UNAUTHORIZED':
      return get(dictionary, 'transferUnauthorized');
    case 'BALANCE_NEGATIVE':
      return get(dictionary, 'balanceNegative');
    case 'POCKET_TRANSFER_NOT_ALLOWED':
      return get(dictionary, 'pocketTransferNotAllowed');
    case 'CREDIT_LIMIT_EXCEEDED':
      return get(dictionary, 'creditLimitExceeded');
    case 'CARD_NO_DEBT':
      return get(dictionary, 'cardNoDebt');
    case 'CARD_OVERPAYMENT':
      return get(dictionary, 'cardOverpayment');
    case 'CARD_HAS_BALANCE':
      return get(dictionary, 'cardHasDebt');
    case 'TRANSACTION_LINKED_TO_SAVINGS':
      return get(dictionary, 'transactionLinkedToSavings');
    default:
      return result.error || get(dictionary, 'createError');
  }
}
