/**
 * Loan Server Action validation schemas (Fase B).
 *
 * RULE 2: Money as integer cents bounded by MAX_SAFE_CENTS.
 * RULE 5: Zod validation server-side.
 * RULE 12: Idempotency key UUID v4 on every mutating money action.
 *
 * All enum values mirror the Prisma enums declared in schema.prisma.
 */

import { z } from 'zod';
import { CurrencySchema, MAX_SAFE_CENTS } from '@/lib/validations/finance';
import { computeTermCountFromInstallment } from '@/lib/loans/interest';

/**
 * CUID format validation (Prisma default).
 */
export const CUID = z.string().regex(/^c[a-z0-9]{20,}$/, 'validation.validCuid');

/**
 * UUID v4 format validation.
 */
export const UUIDv4 = z.uuid('validation.validUuid');

/** Maximum interest rate accepted (1000%) — sanity bound, not a business rate. */
const MAX_RATE_VALUE = 1000;

/** Upper bound for term length (weekly over ~23 years) — sanity bound. */
const MAX_TERM_COUNT = 1200;

export const LoanTypeSchema = z.enum(['PERSONAL', 'MORTGAGE', 'AUTO', 'STUDENT', 'BUSINESS']);
export const LoanDirectionSchema = z.enum(['RECEIVABLE', 'PAYABLE']);
export const LoanStatusSchema = z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED', 'DEFAULTED']);
export const LoanRateTypeSchema = z.enum(['EA', 'NAMV', 'PERIODIC', 'DAILY']);
export const LoanInterestModeSchema = z.enum(['COMPOUND', 'SIMPLE']);
export const LoanDayCountBasisSchema = z.enum(['ACTUAL_365', 'ACTUAL_360', 'THIRTY_360']);
export const LoanInterestAccrualSchema = z.enum(['PERIODIC', 'DAILY']);
export const LoanAmortizationTypeSchema = z.enum(['FRENCH', 'GERMAN', 'AMERICAN', 'CUSTOM']);
export const LoanPaymentFrequencySchema = z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']);
export const LoanAdjustmentTypeSchema = z.enum([
  'EXTRA_DISBURSEMENT',
  'EXTRA_PAYMENT',
  'RATE_CHANGE',
  'RESCHEDULE',
  'CUSTOM_INSTALLMENT',
  'INTEREST_ONLY_PERIOD',
]);

/**
 * Schedule configuration mode:
 * - `TERM`        → the number of installments (`termCount`) is given and the
 *                   installment is calculated.
 * - `INSTALLMENT` → the fixed installment (`installmentAmountCents`) is given and
 *                   the number of amortizing periods is derived.
 */
export const LoanScheduleModeSchema = z.enum(['TERM', 'INSTALLMENT']);

const PositiveMoneySchema = z
  .number()
  .int('validation.amountInteger')
  .positive('validation.amountPositive')
  .max(MAX_SAFE_CENTS, 'validation.amountMax');

/**
 * Create loan validation schema.
 *
 * Two mutually exclusive schedule modes:
 * - `TERM`        → `termCount` is required; the installment is computed.
 * - `INSTALLMENT` → `installmentAmountCents` is required, `amortizationType`
 *                   must be FRENCH (only FRENCH has a constant installment) and
 *                   `customTotals` is not allowed; `termCount` is derived.
 */
export const CreateLoanSchema = z
  .object({
    name: z.string().min(1, 'validation.nameRequired').max(100, 'validation.nameTooLong').trim(),
    type: LoanTypeSchema,
    direction: LoanDirectionSchema,
    counterpartyContact: z.string().max(200).optional(),
    notes: z.string().max(500).optional(),

    principalCents: PositiveMoneySchema,
    currency: CurrencySchema,

    rateType: LoanRateTypeSchema,
    interestRateValue: z
      .number()
      .min(0, 'validation.rateNegative')
      .max(MAX_RATE_VALUE, 'validation.rateMax'),
    interestMode: LoanInterestModeSchema,
    interestAccrual: LoanInterestAccrualSchema,
    dayCountBasis: LoanDayCountBasisSchema,
    amortizationType: LoanAmortizationTypeSchema,
    paymentFrequency: LoanPaymentFrequencySchema,
    scheduleMode: LoanScheduleModeSchema.default('TERM'),
    termCount: z
      .number()
      .int('validation.termInteger')
      .min(1, 'validation.termMin')
      .max(MAX_TERM_COUNT, 'validation.termMax')
      .optional(),
    installmentAmountCents: PositiveMoneySchema.optional(),
    interestOnlyInstallments: z.number().int().min(0).default(0),
    customTotals: z.array(PositiveMoneySchema.nullable()).optional(),

    startDate: z.coerce.date(),
    firstPaymentDate: z.coerce.date(),

    color: z.string().max(50).optional(),
    icon: z.string().max(50).optional(),

    /** Optional account used to register the initial disbursement/receipt. */
    accountId: CUID.optional(),

    idempotencyKey: UUIDv4,
  })
  .refine((data) => data.firstPaymentDate > data.startDate, {
    message: 'validation.firstPaymentAfterStart',
    path: ['firstPaymentDate'],
  })
  .refine((data) => data.scheduleMode !== 'TERM' || data.termCount != null, {
    message: 'validation.termRequired',
    path: ['termCount'],
  })
  .refine(
    (data) =>
      data.scheduleMode !== 'INSTALLMENT' ||
      (data.installmentAmountCents != null &&
        data.amortizationType === 'FRENCH' &&
        data.customTotals == null),
    {
      message: 'validation.installmentRequired',
      path: ['installmentAmountCents'],
    }
  )
  .refine((data) => data.termCount == null || data.interestOnlyInstallments < data.termCount, {
    message: 'validation.interestOnlyLessThanTerm',
    path: ['interestOnlyInstallments'],
  })
  .refine(
    (data) => {
      if (data.scheduleMode !== 'INSTALLMENT' || data.installmentAmountCents == null) return true;
      try {
        const derivedTermCount = computeTermCountFromInstallment({
          principalCents: data.principalCents,
          rateType: data.rateType,
          interestRateValue: data.interestRateValue,
          paymentFrequency: data.paymentFrequency,
          installmentCents: data.installmentAmountCents,
          interestAccrual: data.interestAccrual,
          dayCountBasis: data.dayCountBasis,
          interestMode: data.interestMode,
        });
        return (
          derivedTermCount > data.interestOnlyInstallments &&
          data.interestOnlyInstallments + derivedTermCount <= MAX_TERM_COUNT
        );
      } catch {
        return false;
      }
    },
    {
      message: 'validation.installmentCoversInterest',
      path: ['installmentAmountCents'],
    }
  )
  .refine(
    (data) =>
      data.amortizationType !== 'CUSTOM' ||
      (data.customTotals != null &&
        data.termCount != null &&
        data.customTotals.length === data.termCount),
    {
      message: 'validation.customTotalsRequired',
      path: ['customTotals'],
    }
  );

/**
 * Update loan metadata. Principal/rate/term are intentionally NOT editable here
 * (use addLoanAdjustment for those).
 */
export const UpdateLoanSchema = z.object({
  loanId: CUID,
  name: z.string().min(1).max(100).trim().optional(),
  counterpartyContact: z.string().max(200).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  color: z.string().max(50).nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  status: LoanStatusSchema.optional(),
});

export const DeleteLoanSchema = z.object({
  loanId: CUID,
});

export const GetLoansSchema = z.object({
  direction: LoanDirectionSchema.optional(),
  status: LoanStatusSchema.optional(),
});

export const GetLoanDetailSchema = z.object({
  loanId: CUID,
});

export const GetPendingLoanInstallmentsSchema = z.object({
  accountId: CUID.optional(),
  currency: CurrencySchema.optional(),
});

/**
 * Filters for the transactions-modal loan selector. Both filters are optional;
 * when omitted every ACTIVE loan of the user is returned.
 */
export const GetLoansForPaymentSchema = z.object({
  direction: LoanDirectionSchema.optional(),
  currency: CurrencySchema.optional(),
});

export const GetLoansSummarySchema = z.object({});

export const PayLoanInstallmentSchema = z.object({
  installmentId: CUID,
  accountId: CUID,
  amountCents: PositiveMoneySchema.optional(),
  date: z.coerce.date().optional(),
  notes: z.string().max(500).optional(),
  idempotencyKey: UUIDv4,
});

export const AddLoanAdjustmentSchema = z
  .object({
    loanId: CUID,
    type: LoanAdjustmentTypeSchema,
    effectiveDate: z.coerce.date(),
    amountCents: PositiveMoneySchema.optional(),
    newRateValue: z.number().min(0).max(MAX_RATE_VALUE).optional(),
    newTermCount: z.number().int().min(1).max(MAX_TERM_COUNT).optional(),
    installmentNumber: z.number().int().min(1).optional(),
    notes: z.string().max(500).optional(),
    accountId: CUID.optional(),
    idempotencyKey: UUIDv4,
  })
  .refine(
    (data) =>
      (data.type !== 'EXTRA_DISBURSEMENT' && data.type !== 'EXTRA_PAYMENT') ||
      data.amountCents != null,
    {
      message: 'validation.amountRequired',
      path: ['amountCents'],
    }
  )
  .refine((data) => data.type !== 'RATE_CHANGE' || data.newRateValue != null, {
    message: 'validation.newRateRequired',
    path: ['newRateValue'],
  })
  .refine((data) => data.type !== 'RESCHEDULE' || data.newTermCount != null, {
    message: 'validation.newTermRequired',
    path: ['newTermCount'],
  })
  .refine(
    (data) =>
      data.type !== 'CUSTOM_INSTALLMENT' ||
      (data.installmentNumber != null && data.amountCents != null),
    {
      message: 'validation.customInstallmentRequired',
      path: ['installmentNumber'],
    }
  )
  .refine((data) => data.type !== 'INTEREST_ONLY_PERIOD' || data.installmentNumber != null, {
    message: 'validation.installmentNumberRequired',
    path: ['installmentNumber'],
  });

export type CreateLoanInput = z.infer<typeof CreateLoanSchema>;
export type UpdateLoanInput = z.infer<typeof UpdateLoanSchema>;
export type DeleteLoanInput = z.infer<typeof DeleteLoanSchema>;
export type GetLoansInput = z.infer<typeof GetLoansSchema>;
export type GetLoanDetailInput = z.infer<typeof GetLoanDetailSchema>;
export type GetPendingLoanInstallmentsInput = z.infer<typeof GetPendingLoanInstallmentsSchema>;
export type GetLoansForPaymentInput = z.infer<typeof GetLoansForPaymentSchema>;
export type GetLoansSummaryInput = z.infer<typeof GetLoansSummarySchema>;
export type PayLoanInstallmentInput = z.infer<typeof PayLoanInstallmentSchema>;
export type AddLoanAdjustmentInput = z.infer<typeof AddLoanAdjustmentSchema>;
