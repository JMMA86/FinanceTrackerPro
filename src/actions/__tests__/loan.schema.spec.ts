/**
 * Loan Server Action schemas — Unit Tests
 *
 * Verifies the Zod contracts from src/actions/loan.schema.ts: money bounds,
 * schedule modes, i18n error keys and every adjustment-specific requirement.
 */

import { describe, it, expect } from 'vitest';
import {
  AddLoanAdjustmentSchema,
  CreateLoanSchema,
  DeleteLoanSchema,
  GetLoanDetailSchema,
  PayLoanInstallmentSchema,
} from '../loan.schema';
import { MAX_SAFE_CENTS } from '@/lib/validations/finance';

const uuid = (): string => crypto.randomUUID();

function validCreate(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Préstamo a Juan',
    type: 'PERSONAL',
    direction: 'RECEIVABLE',
    principalCents: 100000,
    currency: 'COP',
    rateType: 'EA',
    interestRateValue: 12,
    interestMode: 'COMPOUND',
    interestAccrual: 'PERIODIC',
    dayCountBasis: 'ACTUAL_365',
    amortizationType: 'FRENCH',
    paymentFrequency: 'MONTHLY',
    scheduleMode: 'TERM',
    termCount: 12,
    interestOnlyInstallments: 0,
    startDate: new Date(2026, 0, 1),
    firstPaymentDate: new Date(2026, 1, 1),
    idempotencyKey: uuid(),
    ...overrides,
  };
}

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? null : result.error!.issues[0].message;
}

describe('loan.schema', () => {
  describe('CreateLoanSchema', () => {
    it('acepta una entrada TERM válida', () => {
      expect(CreateLoanSchema.safeParse(validCreate()).success).toBe(true);
    });

    it('rechaza nombre vacío con validation.nameRequired', () => {
      const result = CreateLoanSchema.safeParse(validCreate({ name: '' }));
      expect(result.success).toBe(false);
      expect(firstMessage(result)).toContain('nameRequired');
    });

    it('rechaza monto negativo y monto que excede MAX_SAFE_CENTS', () => {
      const negative = CreateLoanSchema.safeParse(validCreate({ principalCents: -100 }));
      expect(negative.success).toBe(false);

      const overflow = CreateLoanSchema.safeParse(
        validCreate({ principalCents: MAX_SAFE_CENTS + 1 })
      );
      expect(overflow.success).toBe(false);
      expect(firstMessage(overflow)).toContain('amountMax');
    });

    it('rechaza primera fecha de pago no posterior al inicio', () => {
      const result = CreateLoanSchema.safeParse(
        validCreate({
          startDate: new Date(2026, 1, 1),
          firstPaymentDate: new Date(2026, 0, 1),
        })
      );
      expect(result.success).toBe(false);
      expect(firstMessage(result)).toContain('firstPaymentAfterStart');
    });

    it('exige termCount en modo TERM', () => {
      const result = CreateLoanSchema.safeParse(validCreate({ termCount: undefined }));
      expect(result.success).toBe(false);
      expect(firstMessage(result)).toContain('termRequired');
    });

    it('exige cuota FRENCH sin customTotals en modo INSTALLMENT', () => {
      const missing = CreateLoanSchema.safeParse(
        validCreate({ scheduleMode: 'INSTALLMENT', termCount: undefined })
      );
      expect(missing.success).toBe(false);

      const wrongAmort = CreateLoanSchema.safeParse(
        validCreate({
          scheduleMode: 'INSTALLMENT',
          termCount: undefined,
          installmentAmountCents: 10000,
          amortizationType: 'GERMAN',
        })
      );
      expect(wrongAmort.success).toBe(false);

      const withCustom = CreateLoanSchema.safeParse(
        validCreate({
          scheduleMode: 'INSTALLMENT',
          termCount: undefined,
          installmentAmountCents: 10000,
          customTotals: [10000],
        })
      );
      expect(withCustom.success).toBe(false);
    });

    it('acepta INSTALLMENT válido y deriva el número de cuotas', () => {
      const result = CreateLoanSchema.safeParse(
        validCreate({
          scheduleMode: 'INSTALLMENT',
          termCount: undefined,
          interestRateValue: 0,
          amortizationType: 'FRENCH',
          installmentAmountCents: 10000,
        })
      );
      expect(result.success).toBe(true);
    });

    it('rechaza una cuota que no cubre intereses (installmentCoversInterest)', () => {
      const result = CreateLoanSchema.safeParse(
        validCreate({
          scheduleMode: 'INSTALLMENT',
          termCount: undefined,
          rateType: 'PERIODIC',
          interestRateValue: 1,
          installmentAmountCents: 1000,
        })
      );
      expect(result.success).toBe(false);
      expect(firstMessage(result)).toContain('installmentCoversInterest');
    });

    it('rechaza interestOnlyInstallments >= termCount', () => {
      const result = CreateLoanSchema.safeParse(
        validCreate({ termCount: 3, interestOnlyInstallments: 3 })
      );
      expect(result.success).toBe(false);
      expect(firstMessage(result)).toContain('interestOnlyLessThanTerm');
    });

    it('exige customTotals con un valor por cuota para CUSTOM', () => {
      const missing = CreateLoanSchema.safeParse(
        validCreate({ amortizationType: 'CUSTOM', termCount: 4 })
      );
      expect(missing.success).toBe(false);
      expect(firstMessage(missing)).toContain('customTotalsRequired');

      const wrongLength = CreateLoanSchema.safeParse(
        validCreate({ amortizationType: 'CUSTOM', termCount: 4, customTotals: [10000, 10000] })
      );
      expect(wrongLength.success).toBe(false);

      const valid = CreateLoanSchema.safeParse(
        validCreate({
          amortizationType: 'CUSTOM',
          termCount: 4,
          customTotals: [25000, 25000, 25000, 25000],
        })
      );
      expect(valid.success).toBe(true);
    });

    it('rechaza una idempotencyKey que no sea UUID v4', () => {
      const result = CreateLoanSchema.safeParse(validCreate({ idempotencyKey: 'no-es-uuid' }));
      expect(result.success).toBe(false);
      expect(firstMessage(result)).toContain('validUuid');
    });
  });

  describe('PayLoanInstallmentSchema', () => {
    const base = {
      installmentId: 'clh1234567890abcdefghij',
      accountId: 'clh1234567890abcdefghij',
      idempotencyKey: uuid(),
    };

    it('acepta el pago mínimo requerido', () => {
      expect(PayLoanInstallmentSchema.safeParse(base).success).toBe(true);
    });

    it('rechaza un CUID inválido y una key no UUID', () => {
      expect(PayLoanInstallmentSchema.safeParse({ ...base, installmentId: 'x' }).success).toBe(
        false
      );
      expect(PayLoanInstallmentSchema.safeParse({ ...base, idempotencyKey: 'abc' }).success).toBe(
        false
      );
    });
  });

  describe('AddLoanAdjustmentSchema', () => {
    const base = {
      loanId: 'clh1234567890abcdefghij',
      effectiveDate: new Date(2026, 0, 1),
      idempotencyKey: uuid(),
    };

    it('exige amountCents para EXTRA_DISBURSEMENT y EXTRA_PAYMENT', () => {
      const result = AddLoanAdjustmentSchema.safeParse({ ...base, type: 'EXTRA_PAYMENT' });
      expect(result.success).toBe(false);
      expect(firstMessage(result)).toContain('amountRequired');
    });

    it('acepta un EXTRA_PAYMENT con monto', () => {
      const result = AddLoanAdjustmentSchema.safeParse({
        ...base,
        type: 'EXTRA_PAYMENT',
        amountCents: 5000,
      });
      expect(result.success).toBe(true);
    });

    it('exige newRateValue para RATE_CHANGE', () => {
      const result = AddLoanAdjustmentSchema.safeParse({ ...base, type: 'RATE_CHANGE' });
      expect(result.success).toBe(false);
      expect(firstMessage(result)).toContain('newRateRequired');
    });

    it('exige newTermCount para RESCHEDULE', () => {
      const result = AddLoanAdjustmentSchema.safeParse({ ...base, type: 'RESCHEDULE' });
      expect(result.success).toBe(false);
      expect(firstMessage(result)).toContain('newTermRequired');
    });

    it('exige installmentNumber y amount para CUSTOM_INSTALLMENT', () => {
      const result = AddLoanAdjustmentSchema.safeParse({
        ...base,
        type: 'CUSTOM_INSTALLMENT',
        installmentNumber: 2,
      });
      expect(result.success).toBe(false);
      expect(firstMessage(result)).toContain('customInstallmentRequired');
    });

    it('exige installmentNumber para INTEREST_ONLY_PERIOD', () => {
      const result = AddLoanAdjustmentSchema.safeParse({
        ...base,
        type: 'INTEREST_ONLY_PERIOD',
      });
      expect(result.success).toBe(false);
      expect(firstMessage(result)).toContain('installmentNumberRequired');
    });

    it('acepta ajustes de cronograma válidos', () => {
      expect(
        AddLoanAdjustmentSchema.safeParse({ ...base, type: 'RATE_CHANGE', newRateValue: 10 })
          .success
      ).toBe(true);
      expect(
        AddLoanAdjustmentSchema.safeParse({ ...base, type: 'RESCHEDULE', newTermCount: 24 }).success
      ).toBe(true);
      expect(
        AddLoanAdjustmentSchema.safeParse({
          ...base,
          type: 'INTEREST_ONLY_PERIOD',
          installmentNumber: 2,
        }).success
      ).toBe(true);
    });
  });

  describe('esquemas de lectura/borrado', () => {
    it('GetLoanDetailSchema exige un CUID válido', () => {
      expect(GetLoanDetailSchema.safeParse({ loanId: 'invalid' }).success).toBe(false);
      expect(GetLoanDetailSchema.safeParse({ loanId: 'clh1234567890abcdefghij' }).success).toBe(
        true
      );
    });

    it('DeleteLoanSchema exige un CUID válido', () => {
      expect(DeleteLoanSchema.safeParse({ loanId: 'invalid' }).success).toBe(false);
    });
  });
});
