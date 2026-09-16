/**
 * Localized account delete error mapping (client-side).
 *
 * Maps the financial integrity error codes returned by `deleteBankAccount`
 * to user-facing i18n messages. Unknown codes fall back to the raw server
 * message, then to the generic delete error — same pattern as
 * `getTransactionError`.
 */

import { get } from '@/lib/i18n';

interface ErrorResult {
  code?: string;
  error?: string;
}

export function getAccountError(result: ErrorResult, dictionary: Record<string, unknown>): string {
  switch (result.code) {
    case 'ACCOUNT_HAS_BALANCE':
      return get(dictionary, 'accountHasBalance');
    case 'POCKET_HAS_BALANCE':
      return get(dictionary, 'pocketHasBalance');
    case 'ACCOUNT_HAS_HOLDINGS':
      return get(dictionary, 'accountHasHoldings');
    default:
      return result.error || get(dictionary, 'errors.deleteFailed');
  }
}
