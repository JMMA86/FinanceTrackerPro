/**
 * Investment Actions (CLAUDE.md Rules 1-14)
 * Server Actions for investment account management
 *
 * CRITICAL RULES:
 * - Rule 1: Decimal.js for all financial calculations
 * - Rule 3: Atomic transactions (prisma.$transaction)
 * - Rule 4: Soft deletes, audit trail
 * - Rule 5: Server-side Zod validation
 * - Rule 11: Currency traceability (originalAmountCents, exchangeRate)
 * - Rule 12: Idempotency (UUID v4 keys)
 * - Rule 13: Source of truth (verify balance from transactions)
 * - Rule 14: Extended audit (IP, user agent)
 */

'use server';
import 'server-only';

import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { Decimal } from 'decimal.js';
import { Prisma, type ApiAction } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { safeAction } from '@/lib/utils/action-wrapper';
import { log } from '@/lib/logger';
import {
  addCents,
  subtractCents,
  divideCents,
  multiplyCents,
  decimalToCents,
  centsToDecimal,
  bigintToNumber,
} from '@/lib/money';
import { serializeTransaction } from '@/lib/serialize';
import { getTrueBalanceFromTx } from '@/services/reconciliation.service';
import { getClientInfo } from '@/lib/utils/client-info';
import {
  checkApiRateLimit,
  recordApiAttempt,
  markApiAttemptSuccess,
} from '@/services/rate-limit.service';
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  InsufficientFundsError,
  InsufficientQuantityError,
  InactiveAccountError,
  CurrencyMismatchError,
  RateLimitError,
} from '@/lib/errors/api-errors';
import { getStockQuote, searchStocks, type StockQuote } from '@/services/stock-price.service';
import { getExchangeRate } from '@/services/exchange-rate.service';
import { getInvestmentPerformance as getInvestmentPerformanceService } from '@/services/investment-performance.service';
import {
  CreateInvestmentAccountSchema,
  DepositToInvestmentSchema,
  WithdrawFromInvestmentSchema,
  BuyAssetSchema,
  SellAssetSchema,
  GetInvestmentTransactionsSchema,
  GetStockPriceSchema,
  GetExchangeRateSchema,
} from './investment.schema';
import type { InvestmentAccountDTO } from '@/types/investments';

const BANK_ACCOUNT_TYPES = ['CHECKING', 'CASH', 'SAVINGS', 'POCKET'] as const;

// Market price validation tolerance (Rule: never trust client prices blindly)
const PRICE_TOLERANCE = 0.02; // ±2%

// ============================================================================
// a) getInvestmentAccounts — List user's investment accounts with holdings
// ============================================================================

async function getInvestmentAccountsInternal(
  _input: Record<string, never>
): Promise<InvestmentAccountDTO[]> {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const accounts = await prisma.account.findMany({
    where: { userId: session.userId, isActive: true, type: 'INVESTMENT' },
    orderBy: { createdAt: 'asc' },
    include: {
      assetHoldings: {
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  return accounts.map((account) => ({
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    balanceCents: bigintToNumber(account.balanceCents),
    creditLimitCents:
      account.creditLimitCents == null ? null : bigintToNumber(account.creditLimitCents),
    interestRateEA: account.interestRateEA == null ? null : Number(account.interestRateEA),
    assetHoldings: account.assetHoldings.map((holding) => ({
      id: holding.id,
      symbol: holding.symbol,
      name: holding.name,
      quantity: Number(holding.quantity),
      avgCostCents: bigintToNumber(holding.avgCostCents),
      currentPriceCents: bigintToNumber(holding.currentPriceCents),
      currency: holding.currency,
      originalCostCents:
        holding.originalCostCents == null ? null : bigintToNumber(holding.originalCostCents),
      exchangeRate: holding.exchangeRate == null ? null : Number(holding.exchangeRate),
      lastPriceUpdate: holding.lastPriceUpdate,
      createdAt: holding.createdAt,
    })),
    createdAt: account.createdAt,
  }));
}

export const getInvestmentAccounts = safeAction(getInvestmentAccountsInternal);

// ============================================================================
// b) createInvestmentAccount — Create new INVESTMENT account
// ============================================================================

async function createInvestmentAccountInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = CreateInvestmentAccountSchema.parse(input);

  // Verify user exists and get language
  const userExists = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, language: true },
  });
  if (!userExists) {
    throw new AppError(
      'Your session is no longer valid. Please log out and sign in again.',
      401,
      'SESSION_INVALID'
    );
  }

  const openingDescription =
    userExists.language === 'ENGLISH' ? 'Initial balance' : 'Saldo inicial';

  // Idempotency check (Rule 12) — scoped to the session user
  const existing = await prisma.account.findUnique({
    where: { idempotencyKey: validated.idempotencyKey, userId: session.userId },
  });
  if (existing) {
    log.info(
      { action: 'investment.create.idempotent', accountId: existing.id },
      'Duplicate investment account creation request'
    );
    return {
      account: {
        ...existing,
        balanceCents: Number(existing.balanceCents),
        creditLimitCents:
          existing.creditLimitCents == null ? null : Number(existing.creditLimitCents),
      },
      wasIdempotent: true,
    };
  }

  const { ipAddress, userAgent } = await getClientInfo();

  // Rate limiting (Rule 10)
  const rateLimit = await checkApiRateLimit(session.userId, 'INVESTMENT_DEPOSIT' as ApiAction);
  if (!rateLimit.allowed) {
    log.warn(
      { action: 'investment.create.rate_limited', userId: session.userId, ipAddress },
      'Investment account creation rate limited'
    );
    throw new RateLimitError();
  }

  const result = await prisma
    .$transaction(async (tx) => {
      const newAccount = await tx.account.create({
        data: {
          userId: session.userId,
          name: validated.name,
          type: 'INVESTMENT',
          currency: validated.currency,
          balanceCents: validated.initialBalanceCents,
          idempotencyKey: validated.idempotencyKey,
          createdBy: session.userId,
          lastModifiedBy: session.userId,
        },
      });

      if (newAccount.balanceCents > 0) {
        await tx.transaction.create({
          data: {
            idempotencyKey: crypto.randomUUID(),
            userId: session.userId,
            accountId: newAccount.id,
            type: 'INCOME',
            amountCents: newAccount.balanceCents,
            currency: newAccount.currency,
            description: openingDescription,
            openingBalance: true,
            date: new Date(),
            ipAddress,
            userAgent,
            createdBy: session.userId,
            lastModifiedBy: session.userId,
          },
        });
      }

      return newAccount;
    })
    .catch(async (error) => {
      // Concurrent duplicate (Rule 12): another request committed the same
      // idempotency key between our pre-check and our create.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existingAccount = await prisma.account.findUnique({
          where: { idempotencyKey: validated.idempotencyKey, userId: session.userId },
        });
        if (existingAccount) {
          log.info(
            { action: 'investment.create.idempotent', accountId: existingAccount.id },
            'Duplicate investment account creation request (concurrent race)'
          );
          return existingAccount;
        }
      }
      throw error;
    });

  const account = result;

  log.info(
    {
      action: 'investment.create',
      accountId: account.id,
      currency: account.currency,
      userId: session.userId,
      ipAddress,
    },
    'Investment account created'
  );

  // Record successful API attempt (best-effort)
  try {
    const attemptId = await recordApiAttempt({
      userId: session.userId,
      action: 'INVESTMENT_DEPOSIT' as ApiAction,
      ipAddress,
    });
    await markApiAttemptSuccess(attemptId);
  } catch (err) {
    log.error({ err, userId: session.userId }, 'Failed to record API attempt');
  }

  revalidatePath('/[lang]/dashboard', 'page');
  revalidatePath('/[lang]/accounts', 'page');
  revalidatePath('/[lang]/investments', 'page');

  return {
    account: {
      ...account,
      balanceCents: Number(account.balanceCents),
      creditLimitCents: account.creditLimitCents == null ? null : Number(account.creditLimitCents),
      interestRateEA: account.interestRateEA == null ? null : Number(account.interestRateEA),
    },
    wasIdempotent: false,
  };
}

export const createInvestmentAccount = safeAction(createInvestmentAccountInternal);

// ============================================================================
// c) depositToInvestment — Transfer from bank (COP) to investment (USD/EUR)
// ============================================================================

async function depositToInvestmentInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = DepositToInvestmentSchema.parse(input);

  // Idempotency check (Rule 12) — scoped to the session user
  const existingTx = await prisma.transaction.findUnique({
    where: { idempotencyKey: validated.idempotencyKey, userId: session.userId },
  });
  if (existingTx) {
    log.info(
      {
        action: 'investment.deposit.idempotent',
        transactionId: existingTx.id,
      },
      'Duplicate deposit request'
    );
    return { transaction: serializeTransaction(existingTx), wasIdempotent: true };
  }

  const { ipAddress, userAgent } = await getClientInfo();

  // Rate limiting (Rule 10)
  const rateLimit = await checkApiRateLimit(session.userId, 'INVESTMENT_DEPOSIT' as ApiAction);
  if (!rateLimit.allowed) {
    log.warn(
      { action: 'investment.deposit.rate_limited', userId: session.userId, ipAddress },
      'Investment deposit rate limited'
    );
    throw new RateLimitError();
  }

  // FX tolerance check (B4) — OUTSIDE the DB transaction so we never hold a DB
  // transaction open during an HTTP fetch. Light read ONLY for the destination
  // currency; the authoritative account read happens inside the transaction.
  const toAccountCurrencyPre = await prisma.account.findUnique({
    where: { id: validated.investmentAccountId },
    select: { currency: true },
  });
  if (toAccountCurrencyPre) {
    const liveRate = await getExchangeRate('COP', toAccountCurrencyPre.currency);
    if (liveRate != null && liveRate > 0) {
      // getExchangeRate returns "foreign units per 1 COP"; the app's
      // exchangeRate convention is "COP per 1 foreign unit", so invert.
      const liveCopPerForeign = 1 / liveRate;
      const rateDiff = Math.abs(validated.exchangeRate - liveCopPerForeign) / liveCopPerForeign;
      if (rateDiff > 0.05) {
        throw new AppError(
          'Exchange rate has moved significantly. Please refresh and try again.',
          409,
          'RATE_MISMATCH'
        );
      }
    }
    // liveRate == null → API unavailable → rely on schema range validation
  }

  const result = await prisma
    .$transaction(async (tx) => {
      // 1. Lock BOTH accounts (TOCTOU-safe — C4). Locks are acquired in a
      //    deterministic order (source first, then destination) so concurrent
      //    deposits serialize instead of deadlocking.
      const lockedFromRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Account" WHERE id = ${validated.fromBankAccountId} FOR UPDATE
    `;
      if (lockedFromRows.length === 0) {
        throw new NotFoundError('Account', validated.fromBankAccountId);
      }
      const lockedToRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Account" WHERE id = ${validated.investmentAccountId} FOR UPDATE
    `;
      if (lockedToRows.length === 0) {
        throw new NotFoundError('Account', validated.investmentAccountId);
      }

      // 2. Re-read both accounts under the lock so the cache update below never
      //    overwrites a concurrent committed change.
      const fromAccount = await tx.account.findUnique({
        where: { id: validated.fromBankAccountId },
        select: {
          id: true,
          userId: true,
          name: true,
          type: true,
          currency: true,
          balanceCents: true,
          isActive: true,
        },
      });
      const toAccount = await tx.account.findUnique({
        where: { id: validated.investmentAccountId },
        select: {
          id: true,
          userId: true,
          name: true,
          type: true,
          currency: true,
          balanceCents: true,
          isActive: true,
        },
      });

      if (!fromAccount) {
        throw new NotFoundError('Account', validated.fromBankAccountId);
      }
      if (!toAccount) {
        throw new NotFoundError('Account', validated.investmentAccountId);
      }
      if (!fromAccount.isActive) {
        throw new InactiveAccountError(validated.fromBankAccountId);
      }
      if (!toAccount.isActive) {
        throw new InactiveAccountError(validated.investmentAccountId);
      }
      if (fromAccount.userId !== session.userId) {
        throw new UnauthorizedError('Source account does not belong to user');
      }
      if (toAccount.userId !== session.userId) {
        throw new UnauthorizedError('Investment account does not belong to user');
      }
      if (!BANK_ACCOUNT_TYPES.includes(fromAccount.type as (typeof BANK_ACCOUNT_TYPES)[number])) {
        throw new UnauthorizedError(
          'Source account must be a bank account (CHECKING, CASH, or SAVINGS)'
        );
      }
      if (toAccount.type !== 'INVESTMENT') {
        throw new UnauthorizedError('Destination must be an investment account');
      }
      if (fromAccount.currency !== 'COP') {
        throw new CurrencyMismatchError('COP', fromAccount.currency);
      }

      // 3. Verify sufficient funds using the TRUE balance from the transactional
      //    snapshot (Rule 13) — sees every transfer committed before the lock.
      const trueBalance = await getTrueBalanceFromTx(tx, validated.fromBankAccountId);
      if (trueBalance < validated.amountCents) {
        throw new InsufficientFundsError(validated.amountCents, trueBalance);
      }

      // 4. Calculate converted amount (COP -> USD/EUR)
      // exchangeRate is COP-per-1-USD (e.g. 3900), so we divide to convert COP to USD
      const convertedAmountCents = divideCents(validated.amountCents, validated.exchangeRate);

      // 5. Generate transfer ID
      const transferId = crypto.randomUUID();

      // 6. Create TRANSFER_OUT transaction in bank account (negative)
      const debitTransaction = await tx.transaction.create({
        data: {
          idempotencyKey: validated.idempotencyKey,
          userId: session.userId,
          accountId: validated.fromBankAccountId,
          type: 'TRANSFER_OUT',
          amountCents: -validated.amountCents,
          currency: 'COP',
          description: validated.description || `Deposit to investment ${toAccount.name}`,
          date: new Date(),
          transferId,
          transferToAccountId: validated.investmentAccountId,
          ipAddress,
          userAgent,
          createdBy: session.userId,
          lastModifiedBy: session.userId,
        },
      });

      // 7. Create TRANSFER_IN transaction in investment account (positive).
      //    Uses TRANSFER_IN (not INVESTMENT) so a deposit is booked as a
      //    double-entry pair (TRANSFER_OUT on the bank ↔ TRANSFER_IN on the
      //    investment account), consistent with regular transfers (B1).
      const creditTransaction = await tx.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: session.userId,
          accountId: validated.investmentAccountId,
          type: 'TRANSFER_IN',
          amountCents: convertedAmountCents,
          currency: toAccount.currency,
          description: validated.description || `Deposit from ${fromAccount.name}`,
          date: new Date(),
          transferId,
          transferFromAccountId: validated.fromBankAccountId,
          // Currency traceability (Rule 11)
          originalAmountCents: validated.amountCents,
          originalCurrency: 'COP',
          exchangeRate: new Decimal(validated.exchangeRate),
          ipAddress,
          userAgent,
          createdBy: session.userId,
          lastModifiedBy: session.userId,
        },
      });

      // 8. Update cached balances (Rule 13) from the locked reads
      const newFromBalance = subtractCents(Number(fromAccount.balanceCents), validated.amountCents);
      const newToBalance = addCents(Number(toAccount.balanceCents), convertedAmountCents);

      await Promise.all([
        tx.account.update({
          where: { id: validated.fromBankAccountId },
          data: {
            balanceCents: newFromBalance,
            lastModifiedBy: session.userId,
          },
        }),
        tx.account.update({
          where: { id: validated.investmentAccountId },
          data: {
            balanceCents: newToBalance,
            lastModifiedBy: session.userId,
          },
        }),
      ]);

      return {
        wasIdempotent: false as const,
        debitTransaction: serializeTransaction(debitTransaction),
        creditTransaction: serializeTransaction(creditTransaction),
        transferId,
      };
    })
    .catch(async (error) => {
      // Concurrent duplicate (Rule 12): another request committed the same
      // idempotency key between our pre-check and our create.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existingTx = await prisma.transaction.findUnique({
          where: { idempotencyKey: validated.idempotencyKey, userId: session.userId },
        });
        if (existingTx) {
          log.info(
            { action: 'investment.deposit.idempotent', transactionId: existingTx.id },
            'Duplicate deposit request (concurrent race)'
          );
          return { wasIdempotent: true as const, transaction: serializeTransaction(existingTx) };
        }
      }
      throw error;
    });

  if (result.wasIdempotent) {
    return { transaction: result.transaction, wasIdempotent: true };
  }

  // Record successful API attempt (best-effort)
  try {
    const attemptId = await recordApiAttempt({
      userId: session.userId,
      action: 'INVESTMENT_DEPOSIT' as ApiAction,
      ipAddress,
    });
    await markApiAttemptSuccess(attemptId);
  } catch (err) {
    log.error({ err, userId: session.userId }, 'Failed to record API attempt');
  }

  log.info(
    {
      action: 'investment.deposit',
      transferId: result.transferId,
      fromAccountId: validated.fromBankAccountId,
      toAccountId: validated.investmentAccountId,
      amountCents: validated.amountCents,
      exchangeRate: validated.exchangeRate,
      userId: session.userId,
      ipAddress,
    },
    'Deposit to investment completed'
  );

  revalidatePath('/[lang]/dashboard', 'page');
  revalidatePath('/[lang]/accounts', 'page');
  revalidatePath('/[lang]/investments', 'page');

  return { transaction: result.creditTransaction, wasIdempotent: false };
}

export const depositToInvestment = safeAction(depositToInvestmentInternal);

// ============================================================================
// d) buyAsset — Purchase stock/asset within investment account
// ============================================================================

async function buyAssetInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = BuyAssetSchema.parse(input);

  // Idempotency check (Rule 12) — scoped to the session user
  const existingTx = await prisma.transaction.findUnique({
    where: { idempotencyKey: validated.idempotencyKey, userId: session.userId },
  });
  if (existingTx) {
    log.info(
      { action: 'investment.buy.idempotent', transactionId: existingTx.id },
      'Duplicate buy request'
    );
    return { transaction: serializeTransaction(existingTx), wasIdempotent: true };
  }

  const { ipAddress, userAgent } = await getClientInfo();

  // Rate limiting (Rule 10)
  const rateLimit = await checkApiRateLimit(session.userId, 'INVESTMENT_BUY' as ApiAction);
  if (!rateLimit.allowed) {
    log.warn(
      { action: 'investment.buy.rate_limited', userId: session.userId, ipAddress },
      'Investment buy rate limited'
    );
    throw new RateLimitError();
  }

  // Market price validation (C3) — OUTSIDE the DB transaction so we never hold
  // a DB transaction open during an HTTP fetch.
  let quote: StockQuote;
  try {
    quote = await getStockQuote(validated.symbol);
  } catch {
    throw new AppError(
      'Unable to verify current market price. Please try again.',
      503,
      'PRICE_UNAVAILABLE'
    );
  }
  if (quote.priceCents <= 0) {
    throw new AppError(
      'Unable to verify current market price. Please try again.',
      503,
      'PRICE_UNAVAILABLE'
    );
  }
  const priceDiff = Math.abs(validated.pricePerShareCents - quote.priceCents) / quote.priceCents;
  if (priceDiff > PRICE_TOLERANCE) {
    throw new AppError(
      'Price has moved significantly. Please refresh and try again.',
      409,
      'PRICE_MISMATCH'
    );
  }

  const result = await prisma
    .$transaction(async (tx) => {
      // 1. Lock the investment account (TOCTOU-safe — C5)
      const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Account" WHERE id = ${validated.accountId} FOR UPDATE
    `;
      if (lockedRows.length === 0) throw new NotFoundError('Account', validated.accountId);

      // Re-read the account under the lock so the cache update below never
      // overwrites a concurrent committed change.
      const account = await tx.account.findUnique({
        where: { id: validated.accountId },
        select: {
          id: true,
          userId: true,
          type: true,
          currency: true,
          balanceCents: true,
          isActive: true,
        },
      });

      if (!account) throw new NotFoundError('Account', validated.accountId);
      if (!account.isActive) throw new InactiveAccountError(validated.accountId);
      if (account.userId !== session.userId) {
        throw new UnauthorizedError('Account does not belong to user');
      }
      if (account.type !== 'INVESTMENT') {
        throw new UnauthorizedError('Account must be an investment account');
      }

      // 2. Calculate total cost: quantity * pricePerShareCents using Decimal.js
      const quantityDecimal = new Decimal(validated.quantity);
      const totalCostCents = decimalToCents(
        quantityDecimal.times(validated.pricePerShareCents).dividedBy(100)
      );

      // 3. Verify sufficient funds using the TRUE balance from the transactional
      //    snapshot (Rule 13) — sees every operation committed before the lock.
      const trueBalance = await getTrueBalanceFromTx(tx, validated.accountId);
      if (trueBalance < totalCostCents) {
        throw new InsufficientFundsError(totalCostCents, trueBalance);
      }

      // 4. Create INVESTMENT transaction (negative = outflow)
      const transaction = await tx.transaction.create({
        data: {
          idempotencyKey: validated.idempotencyKey,
          userId: session.userId,
          accountId: validated.accountId,
          type: 'INVESTMENT',
          amountCents: -totalCostCents,
          currency: account.currency,
          description:
            validated.description ||
            `Buy ${validated.quantity} ${validated.symbol} @ ${centsToDecimal(validated.pricePerShareCents).toString()}`,
          date: new Date(),
          ipAddress,
          userAgent,
          createdBy: session.userId,
          lastModifiedBy: session.userId,
        },
      });

      // 5. Upsert InvestmentAssetHolding
      const existingHolding = await tx.investmentAssetHolding.findFirst({
        where: {
          accountId: validated.accountId,
          symbol: validated.symbol,
          isActive: true,
        },
      });

      // C1: when no active holding exists, look for an inactive (soft-deleted)
      // one with the same symbol so a buy after a full sell reactivates it
      // instead of failing on the unique (accountId, symbol) constraint.
      const targetHolding =
        existingHolding ??
        (await tx.investmentAssetHolding.findFirst({
          where: {
            accountId: validated.accountId,
            symbol: validated.symbol,
          },
          orderBy: { createdAt: 'desc' },
        }));

      if (targetHolding) {
        // Update average cost: (oldQty * oldAvgCost + newQty * newPrice) / totalQty
        const oldQty = new Decimal(targetHolding.quantity.toString());
        const newQty = new Decimal(validated.quantity);
        const totalQty = oldQty.plus(newQty);

        const oldCostCents = decimalToCents(
          oldQty.times(targetHolding.avgCostCents).dividedBy(100)
        );
        const newCostCents = decimalToCents(
          newQty.times(validated.pricePerShareCents).dividedBy(100)
        );
        const totalCostOldPlusNew = addCents(oldCostCents, newCostCents);
        const newAvgCostCents = divideCents(totalCostOldPlusNew, totalQty);

        await tx.investmentAssetHolding.update({
          where: { id: targetHolding.id },
          data: {
            quantity: totalQty,
            avgCostCents: newAvgCostCents,
            currentPriceCents: validated.pricePerShareCents,
            lastPriceUpdate: new Date(),
            // Reactivate soft-deleted holdings on re-buy (C1)
            ...(targetHolding.isActive ? {} : { isActive: true, deletedAt: null }),
            lastModifiedBy: session.userId,
          },
        });
      } else {
        await tx.investmentAssetHolding.create({
          data: {
            accountId: validated.accountId,
            symbol: validated.symbol,
            name: validated.name,
            quantity: new Decimal(validated.quantity),
            avgCostCents: validated.pricePerShareCents,
            currency: account.currency,
            currentPriceCents: validated.pricePerShareCents,
            lastPriceUpdate: new Date(),
            createdBy: session.userId,
            lastModifiedBy: session.userId,
          },
        });
      }

      // 6. Update cached balance (Rule 13) from the locked read
      const newBalance = subtractCents(Number(account.balanceCents), totalCostCents);
      await tx.account.update({
        where: { id: validated.accountId },
        data: {
          balanceCents: newBalance,
          lastModifiedBy: session.userId,
        },
      });

      return { wasIdempotent: false as const, transaction: serializeTransaction(transaction) };
    })
    .catch(async (error) => {
      // Concurrent duplicate (Rule 12): another request committed the same
      // idempotency key between our pre-check and our create.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existingTx = await prisma.transaction.findUnique({
          where: { idempotencyKey: validated.idempotencyKey, userId: session.userId },
        });
        if (existingTx) {
          log.info(
            { action: 'investment.buy.idempotent', transactionId: existingTx.id },
            'Duplicate buy request (concurrent race)'
          );
          return { wasIdempotent: true as const, transaction: serializeTransaction(existingTx) };
        }
      }
      throw error;
    });

  // Record successful API attempt (best-effort)
  try {
    const attemptId = await recordApiAttempt({
      userId: session.userId,
      action: 'INVESTMENT_BUY' as ApiAction,
      ipAddress,
    });
    await markApiAttemptSuccess(attemptId);
  } catch (err) {
    log.error({ err, userId: session.userId }, 'Failed to record API attempt');
  }

  log.info(
    {
      action: 'investment.buy',
      symbol: validated.symbol,
      quantity: validated.quantity,
      accountId: validated.accountId,
      userId: session.userId,
      ipAddress,
    },
    'Asset purchase completed'
  );

  revalidatePath('/[lang]/dashboard', 'page');
  revalidatePath('/[lang]/investments', 'page');

  return { transaction: result.transaction, wasIdempotent: result.wasIdempotent };
}

export const buyAsset = safeAction(buyAssetInternal);

// ============================================================================
// e) sellAsset — Sell stock/asset from investment account
// ============================================================================

async function sellAssetInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = SellAssetSchema.parse(input);

  // Idempotency check (Rule 12) — scoped to the session user
  const existingTx = await prisma.transaction.findUnique({
    where: { idempotencyKey: validated.idempotencyKey, userId: session.userId },
  });
  if (existingTx) {
    log.info(
      { action: 'investment.sell.idempotent', transactionId: existingTx.id },
      'Duplicate sell request'
    );
    return { transaction: serializeTransaction(existingTx), wasIdempotent: true };
  }

  const { ipAddress, userAgent } = await getClientInfo();

  // Rate limiting (Rule 10)
  const rateLimit = await checkApiRateLimit(session.userId, 'INVESTMENT_SELL' as ApiAction);
  if (!rateLimit.allowed) {
    log.warn(
      { action: 'investment.sell.rate_limited', userId: session.userId, ipAddress },
      'Investment sell rate limited'
    );
    throw new RateLimitError();
  }

  // Pre-load the holding to validate the market price OUTSIDE the DB
  // transaction (never hold a transaction open during an HTTP fetch).
  const preHolding = await prisma.investmentAssetHolding.findUnique({
    where: { id: validated.holdingId },
    include: { account: true },
  });
  if (!preHolding) throw new NotFoundError('Holding', validated.holdingId);

  // Market price validation (C3): prefer the live quote, fall back to the
  // last known price on the holding when the quote service is unavailable.
  let referencePriceCents = Number(preHolding.currentPriceCents);
  try {
    const quote = await getStockQuote(preHolding.symbol);
    referencePriceCents = quote.priceCents;
  } catch {
    // Fall back to the last known price captured above
  }
  if (referencePriceCents <= 0) {
    throw new AppError(
      'Unable to verify current market price. Please try again.',
      503,
      'PRICE_UNAVAILABLE'
    );
  }
  const priceDiff =
    Math.abs(validated.pricePerShareCents - referencePriceCents) / referencePriceCents;
  if (priceDiff > PRICE_TOLERANCE) {
    throw new AppError(
      'Price has moved significantly. Please refresh and try again.',
      409,
      'PRICE_MISMATCH'
    );
  }

  const result = await prisma
    .$transaction(async (tx) => {
      // 1. Lock the holding, then its account (TOCTOU-safe — C6)
      const lockedHoldingRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "InvestmentAssetHolding" WHERE id = ${validated.holdingId} FOR UPDATE
    `;
      if (lockedHoldingRows.length === 0) throw new NotFoundError('Holding', validated.holdingId);

      // Re-read the holding under the lock
      const holding = await tx.investmentAssetHolding.findUnique({
        where: { id: validated.holdingId },
        include: { account: true },
      });

      if (!holding) throw new NotFoundError('Holding', validated.holdingId);
      if (!holding.isActive) {
        throw new InactiveAccountError(validated.holdingId);
      }
      if (holding.account.userId !== session.userId) {
        throw new UnauthorizedError('Holding does not belong to user');
      }

      const lockedAccountRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Account" WHERE id = ${holding.accountId} FOR UPDATE
    `;
      if (lockedAccountRows.length === 0) throw new NotFoundError('Account', holding.accountId);

      // Re-read the account under the lock so the cache update below never
      // overwrites a concurrent committed change.
      const lockedAccount = await tx.account.findUnique({
        where: { id: holding.accountId },
        select: { id: true, balanceCents: true, isActive: true },
      });

      if (!lockedAccount) throw new NotFoundError('Account', holding.accountId);
      if (!lockedAccount.isActive) throw new InactiveAccountError(holding.accountId);

      // 2. Verify sufficient quantity against the re-read holding
      const sellQty = new Decimal(validated.quantity);
      const currentQty = new Decimal(holding.quantity.toString());
      if (sellQty.greaterThan(currentQty)) {
        throw new InsufficientQuantityError(
          Number(validated.quantity),
          holding.quantity.toNumber()
        );
      }

      // 3. Calculate total proceeds
      const totalProceedsCents = decimalToCents(
        sellQty.times(validated.pricePerShareCents).dividedBy(100)
      );

      // 4. Create INVESTMENT transaction (positive = inflow)
      const transaction = await tx.transaction.create({
        data: {
          idempotencyKey: validated.idempotencyKey,
          userId: session.userId,
          accountId: holding.accountId,
          type: 'INVESTMENT',
          amountCents: totalProceedsCents,
          currency: holding.currency,
          description:
            validated.description ||
            `Sell ${validated.quantity} ${holding.symbol} @ ${centsToDecimal(validated.pricePerShareCents).toString()}`,
          date: new Date(),
          ipAddress,
          userAgent,
          createdBy: session.userId,
          lastModifiedBy: session.userId,
        },
      });

      // 5. Update or soft-delete holding
      const remainingQty = currentQty.minus(sellQty);
      if (remainingQty.isZero()) {
        // Soft delete holding
        await tx.investmentAssetHolding.update({
          where: { id: validated.holdingId },
          data: {
            quantity: new Decimal(0),
            isActive: false,
            deletedAt: new Date(),
            lastModifiedBy: session.userId,
          },
        });
      } else {
        await tx.investmentAssetHolding.update({
          where: { id: validated.holdingId },
          data: {
            quantity: remainingQty,
            currentPriceCents: validated.pricePerShareCents,
            lastPriceUpdate: new Date(),
            lastModifiedBy: session.userId,
          },
        });
      }

      // 6. Update cached balance (Rule 13) from the locked read
      const newBalance = addCents(Number(lockedAccount.balanceCents), totalProceedsCents);
      await tx.account.update({
        where: { id: holding.accountId },
        data: {
          balanceCents: newBalance,
          lastModifiedBy: session.userId,
        },
      });

      return { wasIdempotent: false as const, transaction: serializeTransaction(transaction) };
    })
    .catch(async (error) => {
      // Concurrent duplicate (Rule 12): another request committed the same
      // idempotency key between our pre-check and our create.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existingTx = await prisma.transaction.findUnique({
          where: { idempotencyKey: validated.idempotencyKey, userId: session.userId },
        });
        if (existingTx) {
          log.info(
            { action: 'investment.sell.idempotent', transactionId: existingTx.id },
            'Duplicate sell request (concurrent race)'
          );
          return { wasIdempotent: true as const, transaction: serializeTransaction(existingTx) };
        }
      }
      throw error;
    });

  // Record successful API attempt (best-effort)
  try {
    const attemptId = await recordApiAttempt({
      userId: session.userId,
      action: 'INVESTMENT_SELL' as ApiAction,
      ipAddress,
    });
    await markApiAttemptSuccess(attemptId);
  } catch (err) {
    log.error({ err, userId: session.userId }, 'Failed to record API attempt');
  }

  log.info(
    {
      action: 'investment.sell',
      holdingId: validated.holdingId,
      quantity: validated.quantity,
      userId: session.userId,
      ipAddress,
    },
    'Asset sale completed'
  );

  revalidatePath('/[lang]/dashboard', 'page');
  revalidatePath('/[lang]/investments', 'page');

  return { transaction: result.transaction, wasIdempotent: result.wasIdempotent };
}

export const sellAsset = safeAction(sellAssetInternal);

// ============================================================================
// f) getStockPrice — Fetch current price for a symbol
// ============================================================================

async function getStockPriceInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetStockPriceSchema.parse(input);

  // Rate limiting (Rule 10) — external API endpoints
  const rateLimit = await checkApiRateLimit(session.userId, 'INVESTMENT_BUY' as ApiAction);
  if (!rateLimit.allowed) {
    log.warn(
      { action: 'investment.price.rate_limited', userId: session.userId, symbol: validated.symbol },
      'Stock price lookup rate limited'
    );
    throw new RateLimitError();
  }

  const quote = await getStockQuote(validated.symbol);

  return quote;
}

export const getStockPrice = safeAction(getStockPriceInternal);

// ============================================================================
// g) updateAllAssetPrices — Refresh prices for all active holdings
// ============================================================================

async function updateAllAssetPricesInternal(_input: Record<string, never>) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  // Rate limiting (Rule 10) — external API refresh
  const rateLimit = await checkApiRateLimit(session.userId, 'INVESTMENT_BUY' as ApiAction);
  if (!rateLimit.allowed) {
    log.warn(
      { action: 'investment.prices.rate_limited', userId: session.userId },
      'Asset price refresh rate limited'
    );
    throw new RateLimitError();
  }

  // Get all active holdings for user
  const holdings = await prisma.investmentAssetHolding.findMany({
    where: {
      isActive: true,
      account: {
        userId: session.userId,
        isActive: true,
        type: 'INVESTMENT',
      },
    },
    select: {
      id: true,
      symbol: true,
      currentPriceCents: true,
    },
  });

  if (holdings.length === 0) {
    return { updated: 0, failed: 0, prices: [] };
  }

  const symbols = [...new Set(holdings.map((h) => h.symbol))];
  const results: Array<{
    symbol: string;
    oldPrice: number;
    newPrice: number;
  }> = [];
  const newPricesBySymbol = new Map<string, number>();
  let updated = 0;
  let failed = 0;

  // 1. Fetch ALL quotes FIRST (HTTP outside any DB transaction — M4)
  for (const symbol of symbols) {
    try {
      const quote = await getStockQuote(symbol);
      const newPriceCents = decimalToCents(quote.price);
      newPricesBySymbol.set(symbol, newPriceCents);

      const holdingForSymbol = holdings.find((h) => h.symbol === symbol);
      if (holdingForSymbol) {
        results.push({
          symbol,
          oldPrice: Number(holdingForSymbol.currentPriceCents),
          newPrice: newPriceCents,
        });
      }
      updated++;
    } catch (error) {
      log.error({ symbol, error: String(error) }, 'Failed to update stock price');
      failed++;
    }
  }

  // 2. Apply ALL updates in a single atomic transaction (Rule 3) with audit trail
  if (updated > 0) {
    await prisma.$transaction(async (tx) => {
      for (const [symbol, newPriceCents] of newPricesBySymbol) {
        await tx.investmentAssetHolding.updateMany({
          where: {
            symbol,
            isActive: true,
            account: {
              userId: session.userId,
              isActive: true,
            },
          },
          data: {
            currentPriceCents: newPriceCents,
            lastPriceUpdate: new Date(),
            lastModifiedBy: session.userId,
          },
        });
      }
    });
  }

  log.info(
    {
      action: 'investment.prices.update',
      updated,
      failed,
      userId: session.userId,
    },
    'Asset prices updated'
  );

  revalidatePath('/[lang]/dashboard', 'page');
  revalidatePath('/[lang]/investments', 'page');

  return { updated, failed, prices: results };
}

export const updateAllAssetPrices = safeAction(updateAllAssetPricesInternal);

// ============================================================================
// h) getInvestmentTransactions — Paginated transactions for investment account
// ============================================================================

async function getInvestmentTransactionsInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetInvestmentTransactionsSchema.parse(input);

  // Verify account belongs to user and is active
  const account = await prisma.account.findUnique({
    where: { id: validated.accountId },
    select: { userId: true, isActive: true, type: true },
  });

  if (!account) throw new NotFoundError('Account', validated.accountId);
  if (!account.isActive) throw new InactiveAccountError(validated.accountId);
  if (account.userId !== session.userId) {
    throw new UnauthorizedError('Account does not belong to user');
  }
  if (account.type !== 'INVESTMENT') {
    throw new UnauthorizedError('Account must be an investment account');
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        accountId: validated.accountId,
        isActive: true,
      },
      orderBy: { date: 'desc' },
      skip: (validated.page - 1) * validated.pageSize,
      take: validated.pageSize,
    }),
    prisma.transaction.count({
      where: {
        accountId: validated.accountId,
        isActive: true,
      },
    }),
  ]);

  return {
    transactions: transactions.map((t) => serializeTransaction(t)),
    total,
    page: validated.page,
    pageSize: validated.pageSize,
    totalPages: Math.ceil(total / validated.pageSize),
  };
}

export const getInvestmentTransactions = safeAction(getInvestmentTransactionsInternal);

// ============================================================================
// h) searchStocksAction — Search stocks via Yahoo Finance autocomplete
// ============================================================================

async function searchStocksActionInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const { symbol } = GetStockPriceSchema.parse(input);

  // Rate limiting (Rule 10) — external API endpoints
  const rateLimit = await checkApiRateLimit(session.userId, 'INVESTMENT_BUY' as ApiAction);
  if (!rateLimit.allowed) {
    log.warn(
      { action: 'investment.search.rate_limited', userId: session.userId, query: symbol },
      'Stock search rate limited'
    );
    throw new RateLimitError();
  }

  return await searchStocks(symbol);
}

export const searchStocksAction = safeAction(searchStocksActionInternal);

// ============================================================================
// i) withdrawFromInvestment — Withdraw investment (USD/EUR) → bank/pocket (COP)
// ============================================================================

async function withdrawFromInvestmentInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = WithdrawFromInvestmentSchema.parse(input);

  // Idempotency check (Rule 12) — scoped to the session user
  const existingTx = await prisma.transaction.findUnique({
    where: { idempotencyKey: validated.idempotencyKey, userId: session.userId },
  });
  if (existingTx) {
    log.info(
      { action: 'investment.withdraw.idempotent', transactionId: existingTx.id },
      'Duplicate withdrawal request'
    );
    return { transaction: serializeTransaction(existingTx), wasIdempotent: true };
  }

  const { ipAddress, userAgent } = await getClientInfo();

  // Rate limiting (Rule 10)
  const rateLimit = await checkApiRateLimit(session.userId, 'INVESTMENT_SELL' as ApiAction);
  if (!rateLimit.allowed) {
    log.warn(
      { action: 'investment.withdraw.rate_limited', userId: session.userId, ipAddress },
      'Investment withdrawal rate limited'
    );
    throw new RateLimitError();
  }

  // FX tolerance check (B5) — OUTSIDE the DB transaction so we never hold a DB
  // transaction open during an HTTP fetch. Light read ONLY for the investment
  // currency; the authoritative account reads happen inside the transaction.
  const investmentCurrencyPre = await prisma.account.findUnique({
    where: { id: validated.investmentAccountId },
    select: { currency: true },
  });
  if (investmentCurrencyPre) {
    const liveRate = await getExchangeRate('COP', investmentCurrencyPre.currency);
    if (liveRate != null && liveRate > 0) {
      // getExchangeRate returns "foreign units per 1 COP"; the app's
      // exchangeRate convention is "COP per 1 foreign unit", so invert.
      const liveCopPerForeign = 1 / liveRate;
      const rateDiff = Math.abs(validated.exchangeRate - liveCopPerForeign) / liveCopPerForeign;
      if (rateDiff > 0.05) {
        throw new AppError(
          'Exchange rate has moved significantly. Please refresh and try again.',
          409,
          'RATE_MISMATCH'
        );
      }
    }
    // liveRate == null → API unavailable → rely on schema range validation
  }

  // Default description per user language (same pattern as createInvestmentAccount)
  const userInfo = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { language: true },
  });
  const defaultDescription =
    userInfo?.language === 'ENGLISH' ? 'Withdrawal to account' : 'Retiro a cuenta';

  const result = await prisma
    .$transaction(async (tx) => {
      // 1. Lock BOTH accounts (TOCTOU-safe). Locks are acquired in a
      //    deterministic order (investment first, then bank) so concurrent
      //    withdrawals serialize instead of deadlocking.
      const lockedInvRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Account" WHERE id = ${validated.investmentAccountId} FOR UPDATE
    `;
      if (lockedInvRows.length === 0) {
        throw new NotFoundError('Account', validated.investmentAccountId);
      }
      const lockedBankRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Account" WHERE id = ${validated.toBankAccountId} FOR UPDATE
    `;
      if (lockedBankRows.length === 0) {
        throw new NotFoundError('Account', validated.toBankAccountId);
      }

      // 2. Re-read both accounts under the lock so the cache update below never
      //    overwrites a concurrent committed change.
      const investmentAccount = await tx.account.findUnique({
        where: { id: validated.investmentAccountId },
        select: {
          id: true,
          userId: true,
          name: true,
          type: true,
          currency: true,
          balanceCents: true,
          isActive: true,
        },
      });
      const bankAccount = await tx.account.findUnique({
        where: { id: validated.toBankAccountId },
        select: {
          id: true,
          userId: true,
          name: true,
          type: true,
          currency: true,
          balanceCents: true,
          isActive: true,
        },
      });

      if (!investmentAccount) {
        throw new NotFoundError('Account', validated.investmentAccountId);
      }
      if (!bankAccount) {
        throw new NotFoundError('Account', validated.toBankAccountId);
      }
      if (!investmentAccount.isActive) {
        throw new InactiveAccountError(validated.investmentAccountId);
      }
      if (!bankAccount.isActive) {
        throw new InactiveAccountError(validated.toBankAccountId);
      }
      if (investmentAccount.userId !== session.userId) {
        throw new UnauthorizedError('Investment account does not belong to user');
      }
      if (bankAccount.userId !== session.userId) {
        throw new UnauthorizedError('Destination account does not belong to user');
      }
      if (investmentAccount.type !== 'INVESTMENT') {
        throw new UnauthorizedError('Source must be an investment account');
      }
      if (!BANK_ACCOUNT_TYPES.includes(bankAccount.type as (typeof BANK_ACCOUNT_TYPES)[number])) {
        throw new UnauthorizedError(
          'Destination account must be a bank account (CHECKING, CASH, SAVINGS, or POCKET)'
        );
      }
      if (investmentAccount.currency === 'COP') {
        throw new CurrencyMismatchError('USD or EUR', investmentAccount.currency);
      }
      if (bankAccount.currency !== 'COP') {
        throw new CurrencyMismatchError('COP', bankAccount.currency);
      }

      // 3. Verify sufficient funds using the TRUE balance from the transactional
      //    snapshot (Rule 13) — sees every transfer committed before the lock.
      const trueBalance = await getTrueBalanceFromTx(tx, validated.investmentAccountId);
      if (trueBalance < validated.amountCents) {
        throw new InsufficientFundsError(validated.amountCents, trueBalance);
      }

      // 4. Calculate converted amount (USD/EUR -> COP)
      // exchangeRate is COP-per-1-foreign-unit (e.g. 4000 COP/USD), so we
      // multiply USD-cents × rate to obtain COP-cents.
      const convertedCopCents = multiplyCents(validated.amountCents, validated.exchangeRate);

      // 5. Generate transfer ID
      const transferId = crypto.randomUUID();

      // 6. Create TRANSFER_OUT transaction in investment account (negative)
      const debitTransaction = await tx.transaction.create({
        data: {
          idempotencyKey: validated.idempotencyKey,
          userId: session.userId,
          accountId: validated.investmentAccountId,
          type: 'TRANSFER_OUT',
          amountCents: -validated.amountCents,
          currency: investmentAccount.currency,
          description: validated.description || `${defaultDescription} ${bankAccount.name}`,
          date: new Date(),
          transferId,
          transferToAccountId: validated.toBankAccountId,
          ipAddress,
          userAgent,
          createdBy: session.userId,
          lastModifiedBy: session.userId,
        },
      });

      // 7. Create TRANSFER_IN transaction in bank account (positive COP)
      const creditTransaction = await tx.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: session.userId,
          accountId: validated.toBankAccountId,
          type: 'TRANSFER_IN',
          amountCents: convertedCopCents,
          currency: 'COP',
          description: validated.description || `${defaultDescription} ${investmentAccount.name}`,
          date: new Date(),
          transferId,
          transferFromAccountId: validated.investmentAccountId,
          // Currency traceability (Rule 11)
          originalAmountCents: validated.amountCents,
          originalCurrency: investmentAccount.currency,
          exchangeRate: new Decimal(validated.exchangeRate),
          ipAddress,
          userAgent,
          createdBy: session.userId,
          lastModifiedBy: session.userId,
        },
      });

      // 8. Update cached balances (Rule 13) from the locked reads
      const newInvBalance = subtractCents(
        Number(investmentAccount.balanceCents),
        validated.amountCents
      );
      const newBankBalance = addCents(Number(bankAccount.balanceCents), convertedCopCents);

      await Promise.all([
        tx.account.update({
          where: { id: validated.investmentAccountId },
          data: {
            balanceCents: newInvBalance,
            lastModifiedBy: session.userId,
          },
        }),
        tx.account.update({
          where: { id: validated.toBankAccountId },
          data: {
            balanceCents: newBankBalance,
            lastModifiedBy: session.userId,
          },
        }),
      ]);

      return {
        wasIdempotent: false as const,
        debitTransaction: serializeTransaction(debitTransaction),
        creditTransaction: serializeTransaction(creditTransaction),
        transferId,
      };
    })
    .catch(async (error) => {
      // Concurrent duplicate (Rule 12): another request committed the same
      // idempotency key between our pre-check and our create.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existingTx = await prisma.transaction.findUnique({
          where: { idempotencyKey: validated.idempotencyKey, userId: session.userId },
        });
        if (existingTx) {
          log.info(
            { action: 'investment.withdraw.idempotent', transactionId: existingTx.id },
            'Duplicate withdrawal request (concurrent race)'
          );
          return { wasIdempotent: true as const, transaction: serializeTransaction(existingTx) };
        }
      }
      throw error;
    });

  if (result.wasIdempotent) {
    return { transaction: result.transaction, wasIdempotent: true };
  }

  // Record successful API attempt (best-effort)
  try {
    const attemptId = await recordApiAttempt({
      userId: session.userId,
      action: 'INVESTMENT_SELL' as ApiAction,
      ipAddress,
    });
    await markApiAttemptSuccess(attemptId);
  } catch (err) {
    log.error({ err, userId: session.userId }, 'Failed to record API attempt');
  }

  log.info(
    {
      action: 'investment.withdraw',
      transferId: result.transferId,
      fromAccountId: validated.investmentAccountId,
      toAccountId: validated.toBankAccountId,
      amountCents: validated.amountCents,
      exchangeRate: validated.exchangeRate,
      userId: session.userId,
      ipAddress,
    },
    'Investment withdrawal completed'
  );

  revalidatePath('/[lang]/dashboard', 'page');
  revalidatePath('/[lang]/accounts', 'page');
  revalidatePath('/[lang]/investments', 'page');

  return { transaction: result.creditTransaction, wasIdempotent: false };
}

export const withdrawFromInvestment = safeAction(withdrawFromInvestmentInternal);

// ============================================================================
// j) getCurrentExchangeRate — Live COP→foreign rate for deposit/withdraw UX
// ============================================================================

async function getCurrentExchangeRateInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetExchangeRateSchema.parse(input);

  // Rate limiting (Rule 10) — external API endpoints
  const rateLimit = await checkApiRateLimit(session.userId, 'INVESTMENT_BUY' as ApiAction);
  if (!rateLimit.allowed) {
    log.warn(
      { action: 'investment.rate.rate_limited', userId: session.userId },
      'Exchange rate lookup rate limited'
    );
    throw new RateLimitError();
  }

  // getExchangeRate('COP', currency) returns "foreign units per 1 COP"
  // (e.g. ~0.00025 for USD). The deposit/withdraw form expects the rate in
  // "COP per 1 foreign unit" (~4000), so we invert it before returning.
  const liveRate = await getExchangeRate('COP', validated.currency);

  return {
    rate: liveRate != null ? 1 / liveRate : null,
    currency: validated.currency,
    source: (liveRate == null ? 'unavailable' : 'live') as 'live' | 'unavailable',
  };
}

export const getCurrentExchangeRate = safeAction(getCurrentExchangeRateInternal);

// ============================================================================
// k) getInvestmentPerformance — Performance series for the account chart
// ============================================================================

async function getInvestmentPerformanceInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetInvestmentTransactionsSchema.parse(input);

  // Verify account belongs to user, is active and is an INVESTMENT account
  // (same ownership pattern as getInvestmentTransactions).
  const account = await prisma.account.findUnique({
    where: { id: validated.accountId },
    select: { userId: true, isActive: true, type: true },
  });

  if (!account) throw new NotFoundError('Account', validated.accountId);
  if (!account.isActive) throw new InactiveAccountError(validated.accountId);
  if (account.userId !== session.userId) {
    throw new UnauthorizedError('Account does not belong to user');
  }
  if (account.type !== 'INVESTMENT') {
    throw new UnauthorizedError('Account must be an investment account');
  }

  return getInvestmentPerformanceService(prisma, validated.accountId);
}

export const getInvestmentPerformance = safeAction(getInvestmentPerformanceInternal);
