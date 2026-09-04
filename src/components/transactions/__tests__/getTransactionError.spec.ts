/**
 * getTransactionError Component Tests
 * Verifies the localized mapping of transaction error codes.
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
  insufficientFunds: 'Fondos insuficientes',
  currencyMismatch: 'Las monedas no coinciden',
  inactiveAccount: 'La cuenta está inactiva',
  validationError: 'Revisa los datos del formulario',
  accountNotFound: 'Cuenta no encontrada',
  rateLimited: 'Demasiados intentos',
  transferUnauthorized: 'No autorizado para hacer esta transferencia',
  pocketTransferNotAllowed:
    'Transferencia no permitida: solo puedes mover dinero entre una cuenta y sus bolsillos, o entre cuentas.',
};

describe('getTransactionError', () => {
  it('maps BALANCE_NEGATIVE to the localized balance negative message', () => {
    expect(getTransactionError({ code: 'BALANCE_NEGATIVE' }, dictionary)).toBe(
      'No se puede eliminar: el saldo de la cuenta quedaría negativo'
    );
  });

  it('maps INSUFFICIENT_FUNDS to the localized insufficient funds message', () => {
    expect(getTransactionError({ code: 'INSUFFICIENT_FUNDS' }, dictionary)).toBe(
      'Fondos insuficientes'
    );
  });

  it('maps CURRENCY_MISMATCH to the localized currency mismatch message', () => {
    expect(getTransactionError({ code: 'CURRENCY_MISMATCH' }, dictionary)).toBe(
      'Las monedas no coinciden'
    );
  });

  it('maps INACTIVE_ACCOUNT to the localized inactive account message', () => {
    expect(getTransactionError({ code: 'INACTIVE_ACCOUNT' }, dictionary)).toBe(
      'La cuenta está inactiva'
    );
  });

  it('maps VALIDATION_ERROR to the localized validation error message', () => {
    expect(getTransactionError({ code: 'VALIDATION_ERROR' }, dictionary)).toBe(
      'Revisa los datos del formulario'
    );
  });

  it('maps NOT_FOUND to the localized account not found message', () => {
    expect(getTransactionError({ code: 'NOT_FOUND' }, dictionary)).toBe('Cuenta no encontrada');
  });

  it('maps RATE_LIMITED to the localized rate limited message', () => {
    expect(getTransactionError({ code: 'RATE_LIMITED' }, dictionary)).toBe('Demasiados intentos');
  });

  it('maps UNAUTHORIZED to the localized transfer unauthorized message', () => {
    expect(getTransactionError({ code: 'UNAUTHORIZED' }, dictionary)).toBe(
      'No autorizado para hacer esta transferencia'
    );
  });

  it('maps POCKET_TRANSFER_NOT_ALLOWED to the localized pocket transfer message', () => {
    expect(getTransactionError({ code: 'POCKET_TRANSFER_NOT_ALLOWED' }, dictionary)).toBe(
      'Transferencia no permitida: solo puedes mover dinero entre una cuenta y sus bolsillos, o entre cuentas.'
    );
  });

  it('falls back to the server message for unknown codes', () => {
    expect(getTransactionError({ code: 'X', error: 'raw error' }, dictionary)).toBe('raw error');
  });

  it('falls back to the generic create error when no code or message is present', () => {
    expect(getTransactionError({}, dictionary)).toBe('Error al crear la transacción');
  });
});
