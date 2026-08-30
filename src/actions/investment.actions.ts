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
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { safeAction } from '@/lib/utils/action-wrapper';
import { log } from '@/lib/logger';
import { addCents, subtractCents, divideCents, decimalToCents } from '@/lib/money';
import { getTrueBalance } from '@/services/reconciliation.service';
import { getTransactionRepository } from '@/lib/repositories';
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
  InactiveAccountError,
  CurrencyMismatchError,
  RateLimitError,
} from '@/lib/errors/api-errors';
import { getStockQuote, searchStocks } from '@/services/stock-price.service';
import {
  CreateInvestmentAccountSchema,
  DepositToInvestmentSchema,
  BuyAssetSchema,
  SellAssetSchema,
  GetInvestmentTransactionsSchema,
  GetStockPriceSchema,
} from './investment.schema';
import type { ApiAction } from '@prisma/client';

const BANK_ACCOUNT_TYPES = ['CHECKING', 'CASH', 'SAVINGS'] as const;

// ============================================================================
// a) getInvestmentAccounts — List user's investment accounts with holdings
// ============================================================================

async function getInvestmentAccountsInternal(_input: Record<string, never>) {
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
    ...account,
    interestRateEA: account.interestRateEA == null ? null : Number(account.interestRateEA),
    assetHoldings: account.assetHoldings.map((holding) => ({
      ...holding,
      quantity: Number(holding.quantity),
      exchangeRate: holding.exchangeRate == null ? null : Number(holding.exchangeRate),
    })),
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

  // Idempotency check
  const existing = await prisma.account.findUnique({
    where: { idempotencyKey: validated.idempotencyKey },
  });
  if (existing) {
    log.info(
      { action: 'investment.create.idempotent', accountId: existing.id },
      'Duplicate investment account creation request'
    );
    return { account: existing, wasIdempotent: true };
  }

  const { ipAddress, userAgent } = await getClientInfo();

  const account = await prisma.$transaction(async (tx) => {
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
          date: new Date(),
          ipAddress,
          userAgent,
          createdBy: session.userId,
          lastModifiedBy: session.userId,
        },
      });
    }

    return newAccount;
  });

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

  revalidatePath('/[lang]/dashboard', 'page');
  revalidatePath('/[lang]/accounts', 'page');
  revalidatePath('/[lang]/investments', 'page');

  return {
    account: {
      ...account,
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

  // Idempotency check
  const existingTx = await prisma.transaction.findUnique({
    where: { idempotencyKey: validated.idempotencyKey },
  });
  if (existingTx) {
    log.info(
      {
        action: 'investment.deposit.idempotent',
        transactionId: existingTx.id,
      },
      'Duplicate deposit request'
    );
    return { transaction: existingTx, wasIdempotent: true };
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

  const transactionRepo = getTransactionRepository();

  const result = await prisma.$transaction(async (tx) => {
    // 1. Verify source bank account exists, is active, belongs to user
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

    if (!fromAccount) {
      throw new NotFoundError('Account', validated.fromBankAccountId);
    }
    if (!fromAccount.isActive) {
      throw new InactiveAccountError(validated.fromBankAccountId);
    }
    if (fromAccount.userId !== session.userId) {
      throw new UnauthorizedError('Source account does not belong to user');
    }
    if (!BANK_ACCOUNT_TYPES.includes(fromAccount.type as (typeof BANK_ACCOUNT_TYPES)[number])) {
      throw new UnauthorizedError(
        'Source account must be a bank account (CHECKING, CASH, or SAVINGS)'
      );
    }
    if (fromAccount.currency !== 'COP') {
      throw new CurrencyMismatchError('COP', fromAccount.currency);
    }

    // 2. Verify destination investment account
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

    if (!toAccount) {
      throw new NotFoundError('Account', validated.investmentAccountId);
    }
    if (!toAccount.isActive) {
      throw new InactiveAccountError(validated.investmentAccountId);
    }
    if (toAccount.userId !== session.userId) {
      throw new UnauthorizedError('Investment account does not belong to user');
    }
    if (toAccount.type !== 'INVESTMENT') {
      throw new UnauthorizedError('Destination must be an investment account');
    }

    // 3. Verify sufficient funds using true balance (Rule 13)
    const trueBalance = await getTrueBalance(validated.fromBankAccountId, transactionRepo);
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

    // 7. Create INVESTMENT transaction in investment account (positive)
    const creditTransaction = await tx.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: session.userId,
        accountId: validated.investmentAccountId,
        type: 'INVESTMENT',
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

    // 8. Update cached balances
    const newFromBalance = subtractCents(fromAccount.balanceCents, validated.amountCents);
    const newToBalance = addCents(toAccount.balanceCents, convertedAmountCents);

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

    return { debitTransaction, creditTransaction, transferId };
  });

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

  // Idempotency check
  const existingTx = await prisma.transaction.findUnique({
    where: { idempotencyKey: validated.idempotencyKey },
  });
  if (existingTx) {
    log.info(
      { action: 'investment.buy.idempotent', transactionId: existingTx.id },
      'Duplicate buy request'
    );
    return { transaction: existingTx, wasIdempotent: true };
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

  const transactionRepo = getTransactionRepository();

  const result = await prisma.$transaction(async (tx) => {
    // 1. Verify investment account
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

    // 3. Verify sufficient funds (Rule 13)
    const trueBalance = await getTrueBalance(validated.accountId, transactionRepo);
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
          `Buy ${validated.quantity} ${validated.symbol} @ ${validated.pricePerShareCents / 100}`,
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

    if (existingHolding) {
      // Update average cost: (oldQty * oldAvgCost + newQty * newPrice) / totalQty
      const oldQty = new Decimal(existingHolding.quantity.toString());
      const newQty = new Decimal(validated.quantity);
      const totalQty = oldQty.plus(newQty);

      const oldCostCents = decimalToCents(
        oldQty.times(existingHolding.avgCostCents).dividedBy(100)
      );
      const newCostCents = decimalToCents(
        newQty.times(validated.pricePerShareCents).dividedBy(100)
      );
      const totalCostOldPlusNew = addCents(oldCostCents, newCostCents);
      const newAvgCostCents = divideCents(totalCostOldPlusNew, totalQty.toNumber());

      await tx.investmentAssetHolding.update({
        where: { id: existingHolding.id },
        data: {
          quantity: totalQty,
          avgCostCents: newAvgCostCents,
          currentPriceCents: validated.pricePerShareCents,
          lastPriceUpdate: new Date(),
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

    // 6. Update cached balance — use trueBalance as base to avoid stale-read overwrite
    const newBalance = subtractCents(trueBalance, totalCostCents);
    await tx.account.update({
      where: { id: validated.accountId },
      data: {
        balanceCents: newBalance,
        lastModifiedBy: session.userId,
      },
    });

    return transaction;
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

  return { transaction: result, wasIdempotent: false };
}

export const buyAsset = safeAction(buyAssetInternal);

// ============================================================================
// e) sellAsset — Sell stock/asset from investment account
// ============================================================================

async function sellAssetInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = SellAssetSchema.parse(input);

  // Idempotency check
  const existingTx = await prisma.transaction.findUnique({
    where: { idempotencyKey: validated.idempotencyKey },
  });
  if (existingTx) {
    log.info(
      { action: 'investment.sell.idempotent', transactionId: existingTx.id },
      'Duplicate sell request'
    );
    return { transaction: existingTx, wasIdempotent: true };
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

  const result = await prisma.$transaction(async (tx) => {
    // 1. Verify holding exists and belongs to user
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

    // 2. Verify sufficient quantity
    const sellQty = new Decimal(validated.quantity);
    const currentQty = new Decimal(holding.quantity.toString());
    if (sellQty.greaterThan(currentQty)) {
      throw new InsufficientFundsError(decimalToCents(sellQty), decimalToCents(currentQty));
    }

    // 3. Calculate total proceeds
    const totalProceedsCents = decimalToCents(
      sellQty.times(validated.pricePerShareCents).dividedBy(100)
    );

    // 4. Verify account is active
    if (!holding.account.isActive) {
      throw new InactiveAccountError(holding.accountId);
    }

    // 5. Create INVESTMENT transaction (positive = inflow)
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
          `Sell ${validated.quantity} ${holding.symbol} @ ${validated.pricePerShareCents / 100}`,
        date: new Date(),
        ipAddress,
        userAgent,
        createdBy: session.userId,
        lastModifiedBy: session.userId,
      },
    });

    // 6. Update or soft-delete holding
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

    // 7. Update cached balance
    const newBalance = addCents(holding.account.balanceCents, totalProceedsCents);
    await tx.account.update({
      where: { id: holding.accountId },
      data: {
        balanceCents: newBalance,
        lastModifiedBy: session.userId,
      },
    });

    return transaction;
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

  return { transaction: result, wasIdempotent: false };
}

export const sellAsset = safeAction(sellAssetInternal);

// ============================================================================
// f) getStockPrice — Fetch current price for a symbol
// ============================================================================

async function getStockPriceInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetStockPriceSchema.parse(input);

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
  let updated = 0;
  let failed = 0;

  // Fetch quotes in batches (Yahoo Finance handles multiple symbols)
  for (const symbol of symbols) {
    try {
      const quote = await getStockQuote(symbol);
      const newPriceCents = decimalToCents(quote.price);

      // Update all holdings with this symbol
      await prisma.investmentAssetHolding.updateMany({
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
        },
      });

      const holdingForSymbol = holdings.find((h) => h.symbol === symbol);
      if (holdingForSymbol) {
        results.push({
          symbol,
          oldPrice: holdingForSymbol.currentPriceCents,
          newPrice: newPriceCents,
        });
      }
      updated++;
    } catch (error) {
      log.error({ symbol, error: String(error) }, 'Failed to update stock price');
      failed++;
    }
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
    transactions,
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
  return await searchStocks(symbol);
}

export const searchStocksAction = safeAction(searchStocksActionInternal);
