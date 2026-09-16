/**
 * getLoanError — Unit Tests
 *
 * Maps loan Server Action error codes to localized messages with a fallback.
 */
import { describe, it, expect, vi } from 'vitest';
import { getLoanError } from '../getLoanError';

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => `msg:${key}`),
}));

describe('getLoanError', () => {
  const dictionary = {};

  it('mapea los códigos de dominio a claves i18n', () => {
    expect(getLoanError({ code: 'INSUFFICIENT_FUNDS' }, dictionary, 'errors.paymentFailed')).toBe(
      'msg:errors.insufficientFunds'
    );
    expect(getLoanError({ code: 'CURRENCY_MISMATCH' }, dictionary, 'errors.paymentFailed')).toBe(
      'msg:errors.currencyMismatch'
    );
    expect(getLoanError({ code: 'RATE_LIMITED' }, dictionary, 'errors.paymentFailed')).toBe(
      'msg:errors.rateLimited'
    );
    expect(getLoanError({ code: 'UNAUTHORIZED' }, dictionary, 'errors.paymentFailed')).toBe(
      'msg:errors.sessionInvalid'
    );
    expect(getLoanError({ code: 'SESSION_INVALID' }, dictionary, 'errors.paymentFailed')).toBe(
      'msg:errors.sessionInvalid'
    );
    expect(
      getLoanError({ code: 'PAYMENT_AMOUNT_INVALID' }, dictionary, 'errors.paymentFailed')
    ).toBe('msg:errors.paymentInvalid');
    expect(
      getLoanError({ code: 'LOAN_INSTALLMENT_ALREADY_PAID' }, dictionary, 'errors.paymentFailed')
    ).toBe('msg:errors.alreadyPaid');
    expect(
      getLoanError({ code: 'LOAN_INSTALLMENT_NOT_PAYABLE' }, dictionary, 'errors.paymentFailed')
    ).toBe('msg:errors.notPayable');
    expect(
      getLoanError({ code: 'LOAN_ADJUSTMENT_NOT_ALLOWED' }, dictionary, 'errors.paymentFailed')
    ).toBe('msg:errors.notAllowed');
    expect(
      getLoanError({ code: 'LOAN_ALREADY_COMPLETED' }, dictionary, 'errors.paymentFailed')
    ).toBe('msg:errors.notAllowed');
    expect(getLoanError({ code: 'VALIDATION_ERROR' }, dictionary, 'errors.paymentFailed')).toBe(
      'msg:errors.validationFailed'
    );
  });

  it('usa el error crudo o el fallback cuando el código es desconocido', () => {
    expect(
      getLoanError({ code: 'LOAN_NOT_FOUND', error: 'boom' }, dictionary, 'errors.paymentFailed')
    ).toBe('boom');
    expect(getLoanError({}, dictionary, 'errors.paymentFailed')).toBe('msg:errors.paymentFailed');
  });
});
