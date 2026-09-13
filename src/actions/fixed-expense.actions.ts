/**
 * Fixed Expenses Server Actions
 * CRUD for recurring expense templates + materialized payments + summaries.
 *
 * RULE 3: Multi-record writes run inside prisma.$transaction()
 * RULE 4: Soft deletes + audit trail (createdBy, lastModifiedBy, ipAddress, userAgent)
 * RULE 5: Zod validation server-side
 * RULE 12: Idempotency keys UUID v4 on payments
 * RULE 13: Account.balanceCents is a cache; funds checked from the ledger snapshot
 * RULE 14: Security logging with IP and user agent
 */

'use server';
import 'server-only';

import {
  Prisma,
  type ApiAction,
  type Currency,
  type FixedExpense,
  type FixedExpensePayment,
} from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { safeAction } from '@/lib/utils/action-wrapper';
import { log } from '@/lib/logger';
import { subtractCents } from '@/lib/money';
import { getTrueBalanceFromTx } from '@/services/reconciliation.service';
import { getClientInfo } from '@/lib/utils/client-info';
import {
  checkApiRateLimit,
  recordApiAttempt,
  markApiAttemptSuccess,
} from '@/services/rate-limit.service';
import {
  NotFoundError,
  UnauthorizedError,
  InsufficientFundsError,
  RateLimitError,
  CurrencyMismatchError,
  FixedExpenseAlreadyPaidError,
  PaymentAmountInvalidError,
  ValidationError,
} from '@/lib/errors/api-errors';
import {
  CreateFixedExpenseSchema,
  UpdateFixedExpenseSchema,
  DeleteFixedExpenseSchema,
  GetFixedExpensesSchema,
  GetFixedExpensePaymentsSchema,
  GetFixedExpensesSummarySchema,
  PayFixedExpenseSchema,
  type PayFixedExpenseInput,
  type UpdateFixedExpenseInput,
} from './fixed-expense.schema';
import {
  ensureUpcomingPayments,
  generatePayments,
  getFixedExpensePaymentsForUser,
  getFixedExpensesSummary as getFixedExpensesSummaryService,
  getFixedExpensesWithPayments,
  reschedulePayments,
  serializeFixedExpense,
  serializePayment,
} from '@/services/fixed-expense.service';

// ============================================================================
// Shared helpers (structural extraction — behavior unchanged)
// ============================================================================

type TxClient = Prisma.TransactionClient;

/** Request metadata written on every mutating row (Rule 14). */
interface ClientAudit {
  ipAddress: string;
  userAgent: string;
}

/** A payment row with its template preloaded. */
type PaymentWithTemplate = FixedExpensePayment & { fixedExpense: FixedExpense };

interface PaymentOutcome {
  payment: FixedExpensePayment;
  wasIdempotent: boolean;
}

/** Load a template by id and enforce ownership + active state inside a tx. */
async function loadOwnedActiveFixedExpense(
  tx: TxClient,
  fixedExpenseId: string,
  userId: string
): Promise<FixedExpense> {
  const existing = await tx.fixedExpense.findUnique({ where: { id: fixedExpenseId } });
  if (!existing?.isActive) {
    throw new NotFoundError('FixedExpense', fixedExpenseId);
  }
  if (existing.userId !== userId) {
    throw new UnauthorizedError('Fixed expense does not belong to user');
  }
  return existing;
}

/** Cross-field date validation against the row's effective values (FIX-4). */
function assertEffectiveDateRange(
  validated: UpdateFixedExpenseInput,
  existing: FixedExpense
): void {
  const effectiveStart = validated.startDate ?? existing.startDate;
  const effectiveEnd = validated.endDate === undefined ? existing.endDate : validated.endDate;
  if (effectiveEnd != null && effectiveEnd <= effectiveStart) {
    throw new ValidationError('endDate: End date must be after start date');
  }
}

function amountChanged(validated: UpdateFixedExpenseInput, existing: FixedExpense): boolean {
  if (validated.amountCents === undefined) return false;
  return validated.amountCents !== Number(existing.amountCents);
}

function currencyChanged(validated: UpdateFixedExpenseInput, existing: FixedExpense): boolean {
  if (validated.currency === undefined) return false;
  return validated.currency !== existing.currency;
}

function scheduleChanged(validated: UpdateFixedExpenseInput, existing: FixedExpense): boolean {
  if (validated.frequency !== undefined && validated.frequency !== existing.frequency) {
    return true;
  }
  if (
    validated.startDate !== undefined &&
    validated.startDate.getTime() !== existing.startDate.getTime()
  ) {
    return true;
  }
  if (validated.dayOfPayment !== undefined && validated.dayOfPayment !== existing.dayOfPayment) {
    return true;
  }
  if (
    validated.endDate !== undefined &&
    (validated.endDate?.getTime() ?? null) !== (existing.endDate?.getTime() ?? null)
  ) {
    return true;
  }
  return false;
}

/** Propagate amount/currency edits to the unpaid part of the schedule. */
async function syncUnpaidPaymentAmountAndCurrency(
  tx: TxClient,
  expense: FixedExpense,
  existing: FixedExpense,
  validated: UpdateFixedExpenseInput,
  userId: string,
  client: ClientAudit
): Promise<void> {
  const amountDiffers = amountChanged(validated, existing);
  const currencyDiffers = currencyChanged(validated, existing);
  if (!amountDiffers && !currencyDiffers) return;

  await tx.fixedExpensePayment.updateMany({
    where: { fixedExpenseId: expense.id, isActive: true, paidDate: null },
    data: {
      ...(amountDiffers ? { expectedAmountCents: expense.amountCents } : {}),
      ...(currencyDiffers ? { currency: expense.currency } : {}),
      lastModifiedBy: userId,
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
    },
  });
}

/** Transaction body of updateFixedExpense. */
async function applyFixedExpenseUpdate(
  tx: TxClient,
  userId: string,
  validated: UpdateFixedExpenseInput,
  client: ClientAudit
): Promise<FixedExpense> {
  // Load + authorize INSIDE the transaction: the row could be soft-deleted or
  // reassigned between a pre-check and the write (TOCTOU).
  const existing = await loadOwnedActiveFixedExpense(tx, validated.fixedExpenseId, userId);
  assertEffectiveDateRange(validated, existing);

  const writeResult = await tx.fixedExpense.updateMany({
    where: { id: validated.fixedExpenseId, userId, isActive: true },
    data: {
      name: validated.name,
      description: validated.description,
      amountCents: validated.amountCents,
      currency: validated.currency,
      frequency: validated.frequency,
      dayOfPayment: validated.dayOfPayment,
      startDate: validated.startDate,
      // `null` explicitly clears the end date; `undefined` leaves it untouched.
      endDate: validated.endDate,
      color: validated.color,
      icon: validated.icon,
      lastModifiedBy: userId,
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
    },
  });
  if (writeResult.count !== 1) {
    throw new NotFoundError('FixedExpense', validated.fixedExpenseId);
  }

  const expense = await tx.fixedExpense.findUniqueOrThrow({
    where: { id: validated.fixedExpenseId },
  });

  await syncUnpaidPaymentAmountAndCurrency(tx, expense, existing, validated, userId, client);

  if (scheduleChanged(validated, existing)) {
    await reschedulePayments(tx, expense, new Date(), client);
  }

  return expense;
}

/** Transaction body of deleteFixedExpense. */
async function applyFixedExpenseSoftDelete(
  tx: TxClient,
  userId: string,
  fixedExpenseId: string,
  client: ClientAudit
): Promise<void> {
  await loadOwnedActiveFixedExpense(tx, fixedExpenseId, userId);

  const now = new Date();

  const writeResult = await tx.fixedExpense.updateMany({
    where: { id: fixedExpenseId, userId, isActive: true },
    data: {
      isActive: false,
      deletedAt: now,
      lastModifiedBy: userId,
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
    },
  });
  if (writeResult.count !== 1) {
    throw new NotFoundError('FixedExpense', fixedExpenseId);
  }

  // Soft-delete EVERY unpaid payment (future AND overdue) so no stale pending
  // rows survive the template deactivation. Paid history is preserved (the FK
  // is ON DELETE RESTRICT and deletion is always soft).
  await tx.fixedExpensePayment.updateMany({
    where: { fixedExpenseId, isActive: true, paidDate: null },
    data: {
      isActive: false,
      deletedAt: now,
      lastModifiedBy: userId,
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
    },
  });
}

/** In-transaction idempotency resolution scoped to user + payment. */
async function findIdempotentPayment(
  tx: TxClient,
  userId: string,
  paymentId: string,
  idempotencyKey: string
): Promise<FixedExpensePayment | null> {
  const existingTx = await tx.transaction.findUnique({ where: { idempotencyKey } });
  if (!existingTx) return null;

  const belongsToRequest =
    existingTx.userId === userId && existingTx.fixedExpensePaymentId === paymentId;
  if (!belongsToRequest) {
    log.warn(
      {
        action: 'fixed-expense.pay.idempotency_key_collision',
        existingUserId: existingTx.userId,
        requestedUserId: userId,
        requestedPaymentId: paymentId,
      },
      'Idempotency key collision: existing transaction does not belong to this user/payment'
    );
    return null;
  }

  return tx.fixedExpensePayment.findUniqueOrThrow({ where: { id: paymentId } });
}

async function loadOwnedPaymentWithTemplate(
  tx: TxClient,
  userId: string,
  paymentId: string
): Promise<PaymentWithTemplate> {
  const payment = await tx.fixedExpensePayment.findUnique({
    where: { id: paymentId },
    include: { fixedExpense: true },
  });

  if (!payment?.isActive || !payment.fixedExpense.isActive) {
    throw new NotFoundError('FixedExpensePayment', paymentId);
  }
  if (payment.fixedExpense.userId !== userId) {
    throw new UnauthorizedError('Payment does not belong to user');
  }
  return payment;
}

function assertPaymentTemplateCurrency(payment: PaymentWithTemplate): void {
  if (payment.currency !== payment.fixedExpense.currency) {
    throw new CurrencyMismatchError(payment.fixedExpense.currency, payment.currency);
  }
}

/** Lock the account row (SELECT ... FOR UPDATE) and verify ownership/currency. */
async function lockOwnedAccount(
  tx: TxClient,
  userId: string,
  accountId: string,
  expectedCurrency: Currency
): Promise<{
  id: string;
  userId: string;
  balanceCents: bigint;
  isActive: boolean;
  currency: Currency;
}> {
  const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Account" WHERE id = ${accountId} FOR UPDATE
  `;
  if (lockedRows.length === 0) {
    throw new NotFoundError('Account', accountId);
  }

  const account = await tx.account.findUnique({
    where: { id: accountId },
    select: { id: true, userId: true, balanceCents: true, isActive: true, currency: true },
  });
  if (!account?.isActive) {
    throw new NotFoundError('Account', accountId);
  }
  if (account.userId !== userId) {
    throw new UnauthorizedError('Account does not belong to user');
  }
  if (account.currency !== expectedCurrency) {
    throw new CurrencyMismatchError(expectedCurrency, account.currency);
  }
  return account;
}

/**
 * Re-check the payment state AFTER the lock. Returns the payment when the
 * request's key already paid it (idempotent); throws when it was paid by a
 * DIFFERENT request (genuine double-pay).
 */
async function resolveLockedIdempotentPayment(
  tx: TxClient,
  userId: string,
  payment: PaymentWithTemplate,
  idempotencyKey: string
): Promise<FixedExpensePayment | null> {
  if (payment.paidDate == null) return null;

  const txByKey = await tx.transaction.findUnique({ where: { idempotencyKey } });
  const belongsToRequest =
    txByKey?.userId === userId && txByKey.fixedExpensePaymentId === payment.id;
  if (belongsToRequest) return payment;
  throw new FixedExpenseAlreadyPaidError();
}

function resolvePaymentAmount(
  validatedAmount: number | undefined,
  expectedAmountCents: bigint
): number {
  const amountCents = validatedAmount ?? Number(expectedAmountCents);
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new PaymentAmountInvalidError();
  }
  return amountCents;
}

async function assertSufficientFunds(
  tx: TxClient,
  accountId: string,
  amountCents: number
): Promise<void> {
  const trueBalance = await getTrueBalanceFromTx(tx, accountId);
  if (trueBalance < amountCents) {
    throw new InsufficientFundsError(amountCents, trueBalance);
  }
}

interface MarkPaidParams {
  userId: string;
  client: ClientAudit;
  validated: PayFixedExpenseInput;
  payment: PaymentWithTemplate;
  amountCents: number;
  paidAt: Date;
}

async function createLinkedExpenseTransaction(tx: TxClient, params: MarkPaidParams): Promise<void> {
  // Reuse the request idempotency key so a network-level retry cannot
  // double-create the ledger transaction.
  await tx.transaction.create({
    data: {
      idempotencyKey: params.validated.idempotencyKey,
      userId: params.userId,
      accountId: params.validated.accountId,
      type: 'EXPENSE',
      amountCents: -params.amountCents,
      currency: params.payment.currency,
      description: `Pago: ${params.payment.fixedExpense.name}`,
      date: params.paidAt,
      fixedExpensePaymentId: params.payment.id,
      ipAddress: params.client.ipAddress,
      userAgent: params.client.userAgent,
      createdBy: params.userId,
      lastModifiedBy: params.userId,
    },
  });
}

async function markPaymentPaid(tx: TxClient, params: MarkPaidParams): Promise<FixedExpensePayment> {
  // CONDITIONAL write (paidDate: null); a concurrent payer makes this 0 rows.
  const updateResult = await tx.fixedExpensePayment.updateMany({
    where: { id: params.payment.id, isActive: true, paidDate: null },
    data: {
      paidDate: params.paidAt,
      paidAmountCents: params.amountCents,
      idempotencyKey: params.validated.idempotencyKey,
      notes: params.validated.notes ?? params.payment.notes,
      lastModifiedBy: params.userId,
      ipAddress: params.client.ipAddress,
      userAgent: params.client.userAgent,
    },
  });
  if (updateResult.count !== 1) {
    throw new FixedExpenseAlreadyPaidError();
  }
  return tx.fixedExpensePayment.findUniqueOrThrow({ where: { id: params.payment.id } });
}

async function updateAccountCachedBalance(
  tx: TxClient,
  account: { id: string; balanceCents: bigint },
  amountCents: number,
  userId: string
): Promise<void> {
  const newBalance = subtractCents(Number(account.balanceCents), amountCents);
  await tx.account.update({
    where: { id: account.id },
    data: { balanceCents: newBalance, lastModifiedBy: userId },
  });
}

/** Transaction body of payFixedExpense. */
async function executePayment(
  tx: TxClient,
  userId: string,
  validated: PayFixedExpenseInput,
  client: ClientAudit
): Promise<PaymentOutcome> {
  const idempotentPayment = await findIdempotentPayment(
    tx,
    userId,
    validated.paymentId,
    validated.idempotencyKey
  );
  if (idempotentPayment) {
    log.info(
      { action: 'fixed-expense.pay.idempotent', paymentId: idempotentPayment.id },
      'Duplicate fixed expense payment request'
    );
    return { payment: idempotentPayment, wasIdempotent: true };
  }

  // Pre-lock read: authorization + payment/template currency traceability.
  const payment = await loadOwnedPaymentWithTemplate(tx, userId, validated.paymentId);
  assertPaymentTemplateCurrency(payment);

  const account = await lockOwnedAccount(tx, userId, validated.accountId, payment.currency);

  // Re-read AFTER the lock so two requests with DIFFERENT idempotency keys that
  // both observed paidDate=null cannot both proceed.
  const lockedPayment = await loadOwnedPaymentWithTemplate(tx, userId, validated.paymentId);
  const lockedIdempotent = await resolveLockedIdempotentPayment(
    tx,
    userId,
    lockedPayment,
    validated.idempotencyKey
  );
  if (lockedIdempotent) {
    log.info(
      { action: 'fixed-expense.pay.idempotent', paymentId: lockedIdempotent.id },
      'Duplicate fixed expense payment request'
    );
    return { payment: lockedIdempotent, wasIdempotent: true };
  }

  // Re-assert the currency under the lock: a concurrent updateFixedExpense could
  // have changed the payment/template currency between the pre-lock read and now.
  if (lockedPayment.currency !== account.currency) {
    throw new CurrencyMismatchError(lockedPayment.currency, account.currency);
  }

  const amountCents = resolvePaymentAmount(
    validated.amountCents,
    lockedPayment.expectedAmountCents
  );
  await assertSufficientFunds(tx, validated.accountId, amountCents);

  const paidAt = validated.date ?? new Date();
  const markParams: MarkPaidParams = {
    userId,
    client,
    validated,
    payment: lockedPayment,
    amountCents,
    paidAt,
  };

  await createLinkedExpenseTransaction(tx, markParams);
  const updatedPayment = await markPaymentPaid(tx, markParams);
  await updateAccountCachedBalance(tx, account, amountCents, userId);

  return { payment: updatedPayment, wasIdempotent: false };
}

/** Normalize a Prisma P2002 `meta.target` into a list of field names. */
function normalizeConstraintTarget(target: unknown): string[] {
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') return [target];
  return [];
}

/** Resolve a P2002 race into an idempotent success or the right domain error. */
async function resolvePaymentRaceError(
  error: unknown,
  userId: string,
  validated: PayFixedExpenseInput
): Promise<PaymentOutcome> {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    throw error;
  }

  const targetFields = normalizeConstraintTarget(error.meta?.target);
  // `Transaction.fixedExpensePaymentId` is @unique: violating it means this
  // payment already has a linked transaction → it is already paid.
  const isAlreadyPaidConstraint = targetFields.some((field) =>
    field.includes('fixedExpensePaymentId')
  );

  const existing = await prisma.fixedExpensePayment.findUnique({
    where: { idempotencyKey: validated.idempotencyKey },
  });
  const owner = existing
    ? await prisma.fixedExpense.findUnique({
        where: { id: existing.fixedExpenseId },
        select: { userId: true },
      })
    : null;

  if (
    existing?.id === validated.paymentId &&
    existing.paidDate != null &&
    owner?.userId === userId
  ) {
    log.info(
      { action: 'fixed-expense.pay.idempotent', paymentId: existing.id },
      'Duplicate payment resolved after unique violation'
    );
    return { payment: existing, wasIdempotent: true };
  }
  if (isAlreadyPaidConstraint) {
    throw new FixedExpenseAlreadyPaidError();
  }
  throw error;
}

async function enforcePaymentRateLimit(userId: string, ipAddress: string): Promise<void> {
  const rateLimit = await checkApiRateLimit(userId, 'FIXED_EXPENSE_PAY' as ApiAction);
  if (rateLimit.allowed) return;
  log.warn(
    { action: 'fixed-expense.pay.rate_limited', userId, ipAddress },
    'Fixed expense payment rate limited'
  );
  throw new RateLimitError();
}

async function recordSuccessfulAttempt(userId: string, ipAddress: string): Promise<void> {
  try {
    const attemptId = await recordApiAttempt({
      userId,
      action: 'FIXED_EXPENSE_PAY' as ApiAction,
      ipAddress,
    });
    await markApiAttemptSuccess(attemptId);
  } catch (err) {
    log.error({ err, userId }, 'Failed to record API attempt');
  }
}

// ============================================================================
// 1. createFixedExpense — Create a template and materialize its payments
// ============================================================================

async function createFixedExpenseInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = CreateFixedExpenseSchema.parse(input);
  const client = await getClientInfo();

  const expense = await prisma.$transaction(async (tx) => {
    const created = await tx.fixedExpense.create({
      data: {
        userId: session.userId,
        name: validated.name,
        description: validated.description ?? null,
        amountCents: validated.amountCents,
        currency: validated.currency,
        frequency: validated.frequency,
        dayOfPayment: validated.dayOfPayment ?? null,
        startDate: validated.startDate,
        endDate: validated.endDate ?? null,
        color: validated.color ?? null,
        icon: validated.icon ?? null,
        createdBy: session.userId,
        lastModifiedBy: session.userId,
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
      },
    });

    await generatePayments(tx, created, new Date(), undefined, client);

    return created;
  });

  log.info(
    { action: 'fixed-expense.create', fixedExpenseId: expense.id, userId: session.userId },
    'Fixed expense created'
  );

  return serializeFixedExpense(expense);
}

export const createFixedExpense = safeAction(createFixedExpenseInternal);

// ============================================================================
// 2. getFixedExpenses — Active templates with materialized payments
// ============================================================================

async function getFixedExpensesInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetFixedExpensesSchema.parse(input ?? {});

  return getFixedExpensesWithPayments(session.userId, undefined, {
    includeInactive: validated.includeInactive,
  });
}

export const getFixedExpenses = safeAction(getFixedExpensesInternal);

// ============================================================================
// 3. updateFixedExpense — Edit metadata + reschedule when needed
// ============================================================================

async function updateFixedExpenseInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = UpdateFixedExpenseSchema.parse(input);
  const client = await getClientInfo();

  const updated = await prisma.$transaction((tx) =>
    applyFixedExpenseUpdate(tx, session.userId, validated, client)
  );

  log.info(
    { action: 'fixed-expense.update', fixedExpenseId: updated.id, userId: session.userId },
    'Fixed expense updated'
  );

  return serializeFixedExpense(updated);
}

export const updateFixedExpense = safeAction(updateFixedExpenseInternal);

// ============================================================================
// 4. deleteFixedExpense — Soft delete (history is preserved)
// ============================================================================

async function deleteFixedExpenseInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const { fixedExpenseId } = DeleteFixedExpenseSchema.parse(input);
  const client = await getClientInfo();

  await prisma.$transaction((tx) =>
    applyFixedExpenseSoftDelete(tx, session.userId, fixedExpenseId, client)
  );

  log.info(
    { action: 'fixed-expense.delete', fixedExpenseId, userId: session.userId },
    'Fixed expense soft-deleted'
  );

  return { success: true, fixedExpenseId };
}

export const deleteFixedExpense = safeAction(deleteFixedExpenseInternal);

// ============================================================================
// 5. getFixedExpensePayments — Payments of one template
// ============================================================================

async function getFixedExpensePaymentsInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetFixedExpensePaymentsSchema.parse(input);
  if (!validated.fixedExpenseId) {
    throw new ValidationError('fixedExpenseId: required');
  }

  await ensureUpcomingPayments(session.userId);

  const now = new Date();
  let range: { from: Date; to: Date } | undefined;
  if (validated.month != null) {
    const year = validated.year ?? now.getFullYear();
    range = {
      from: new Date(year, validated.month - 1, 1, 0, 0, 0, 0),
      to: new Date(year, validated.month, 0, 23, 59, 59, 999),
    };
  } else if (validated.year != null) {
    range = {
      from: new Date(validated.year, 0, 1, 0, 0, 0, 0),
      to: new Date(validated.year, 11, 31, 23, 59, 59, 999),
    };
  }

  const result = await getFixedExpensePaymentsForUser(
    session.userId,
    validated.fixedExpenseId,
    range
  );

  if (!result) {
    throw new NotFoundError('FixedExpense', validated.fixedExpenseId);
  }

  return result;
}

export const getFixedExpensePayments = safeAction(getFixedExpensePaymentsInternal);

// ============================================================================
// 6. payFixedExpense — Pay a materialized payment atomically (idempotent)
// ============================================================================

async function payFixedExpenseInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = PayFixedExpenseSchema.parse(input);
  const client = await getClientInfo();

  // Rate limiting (Rule 10)
  await enforcePaymentRateLimit(session.userId, client.ipAddress);

  /**
   * Idempotency is verified INSIDE the transaction (Rule 12): a duplicate that
   * races past this point fails on the unique constraint (P2002) and is resolved
   * below without touching balances. Mirrors contributeToGoal/transfer.
   */
  let outcome: PaymentOutcome;
  try {
    outcome = await prisma.$transaction((tx) =>
      executePayment(tx, session.userId, validated, client)
    );
  } catch (error) {
    outcome = await resolvePaymentRaceError(error, session.userId, validated);
  }

  // Record successful API attempt (best-effort)
  await recordSuccessfulAttempt(session.userId, client.ipAddress);

  log.info(
    {
      action: 'fixed-expense.pay',
      paymentId: outcome.payment.id,
      fixedExpenseId: outcome.payment.fixedExpenseId,
      userId: session.userId,
      amountCents: Number(outcome.payment.paidAmountCents ?? 0),
      wasIdempotent: outcome.wasIdempotent,
    },
    'Fixed expense payment recorded'
  );

  return {
    payment: serializePayment(outcome.payment),
    wasIdempotent: outcome.wasIdempotent,
  };
}

export const payFixedExpense = safeAction(payFixedExpenseInternal);

// ============================================================================
// 7. getFixedExpensesSummary — Aggregated per-currency metrics
// ============================================================================

async function getFixedExpensesSummaryInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetFixedExpensesSummarySchema.parse(input ?? {});

  // Materialize first so the summary never misses upcoming/overdue payments.
  await ensureUpcomingPayments(session.userId);

  return getFixedExpensesSummaryService(session.userId, validated.month, validated.year);
}

export const getFixedExpensesSummary = safeAction(getFixedExpensesSummaryInternal);
