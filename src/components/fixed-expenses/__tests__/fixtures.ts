/**
 * Shared fixtures for the fixed-expenses component tests.
 *
 * Not a test file (excluded from vitest's include glob); it only builds fully
 * typed domain objects so each component spec stays focused on behavior.
 */
import type {
  FixedExpensePaymentSerialized,
  FixedExpenseWithPayments,
} from '@/types/fixed-expense';

export const TEST_EXPENSE_ID = 'cexpense0000000000000001';
export const TEST_PAYMENT_ID = 'cpayment0000000000000001';
export const TEST_ACCOUNT_ID = 'caccount0000000000000001';
export const TEST_USER_ID = 'cuser000000000000000001';

export function makePayment(
  overrides: Partial<FixedExpensePaymentSerialized> = {}
): FixedExpensePaymentSerialized {
  return {
    id: TEST_PAYMENT_ID,
    fixedExpenseId: TEST_EXPENSE_ID,
    dueDate: new Date(2026, 8, 15),
    paidDate: null,
    expectedAmountCents: 1500000,
    paidAmountCents: null,
    currency: 'COP',
    notes: null,
    idempotencyKey: null,
    isActive: true,
    createdAt: new Date(2026, 8, 1),
    updatedAt: new Date(2026, 8, 1),
    deletedAt: null,
    createdBy: TEST_USER_ID,
    lastModifiedBy: TEST_USER_ID,
    ipAddress: null,
    userAgent: null,
    ...overrides,
  };
}

export function makeExpense(
  overrides: Partial<FixedExpenseWithPayments> = {}
): FixedExpenseWithPayments {
  return {
    id: TEST_EXPENSE_ID,
    userId: TEST_USER_ID,
    name: 'Arriendo',
    description: null,
    amountCents: 1500000,
    currency: 'COP',
    frequency: 'MONTHLY',
    dayOfPayment: 15,
    startDate: new Date(2026, 0, 15),
    endDate: null,
    color: null,
    icon: null,
    isActive: true,
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    deletedAt: null,
    createdBy: TEST_USER_ID,
    lastModifiedBy: TEST_USER_ID,
    ipAddress: null,
    userAgent: null,
    payments: [],
    ...overrides,
  };
}
