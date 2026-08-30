/**
 * getTransactionError Component Tests
 * Verifies the localized mapping of transaction delete error codes.
 */

import { describe, it, expect, vi } from 'vitest';
import { getTransactionError } from '../getTransactionError';

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((dict: Record<string, unknown>, key: string) => {
    const result = (dict as Record<string, string>)[key];
    return result ?? key;
  }),
}));

const dictionary = {
  balanceNegative: 'No se puede eliminar: el saldo de la cuenta quedaría negativo',
  createError: 'Error al crear la transacción',
};

describe('getTransactionError', () => {
  it('maps BALANCE_NEGATIVE to the localized balance negative message', () => {
    expect(getTransactionError({ code: 'BALANCE_NEGATIVE' }, dictionary)).toBe(
      'No se puede eliminar: el saldo de la cuenta quedaría negativo'
    );
  });

  it('falls back to the server message for unknown codes', () => {
    expect(getTransactionError({ code: 'X', error: 'raw error' }, dictionary)).toBe('raw error');
  });

  it('falls back to the generic create error when no code or message is present', () => {
    expect(getTransactionError({}, dictionary)).toBe('Error al crear la transacción');
  });
});
