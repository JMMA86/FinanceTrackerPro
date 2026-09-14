/**
 * Localized loan error mapping (client-side).
 *
 * Maps loan Server Action error codes to user-facing i18n messages from the
 * `loans` dictionary. Unknown codes fall back to the caller-provided generic
 * key so payment and adjustment flows can share this helper.
 */

import { get } from '@/lib/i18n';

interface LoanErrorResult {
  code?: string;
  error?: string;
}

export function getLoanError(
  result: LoanErrorResult,
  dictionary: Record<string, unknown>,
  fallbackKey: string
): string {
  switch (result.code) {
    case 'INSUFFICIENT_FUNDS':
      return get(dictionary, 'errors.insufficientFunds');
    case 'CURRENCY_MISMATCH':
      return get(dictionary, 'errors.currencyMismatch');
    case 'RATE_LIMITED':
      return get(dictionary, 'errors.rateLimited');
    case 'UNAUTHORIZED':
    case 'SESSION_INVALID':
      return get(dictionary, 'errors.sessionInvalid');
    case 'PAYMENT_AMOUNT_INVALID':
      return get(dictionary, 'errors.paymentInvalid');
    case 'LOAN_INSTALLMENT_ALREADY_PAID':
      return get(dictionary, 'errors.alreadyPaid');
    case 'LOAN_INSTALLMENT_NOT_PAYABLE':
      return get(dictionary, 'errors.notPayable');
    case 'LOAN_ADJUSTMENT_NOT_ALLOWED':
    case 'LOAN_ALREADY_COMPLETED':
      return get(dictionary, 'errors.notAllowed');
    case 'VALIDATION_ERROR':
      return get(dictionary, 'errors.validationFailed');
    default:
      return result.error || get(dictionary, fallbackKey);
  }
}
