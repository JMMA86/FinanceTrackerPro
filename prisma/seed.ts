/**
 * Prisma Seed Script
 * Generates test data for FinanceTrackerPro
 *
 * Run: npm run db:seed
 * Credentials: demo@financetracker.com / Demo123@
 */

import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
dotenvExpand.expand(dotenv.config({ override: true }));

import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { Decimal } from 'decimal.js';
import {
  computeDueDates,
  getMaterializationHorizon,
  startOfDay,
} from '@/lib/fixed-expense-recurrence';
import { addMonths } from 'date-fns';
import { buildAmortizationSchedule, computeLoanSummary } from '@/lib/loans/interest';
import { seedVariableExpenses } from './seed-variable-expenses';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = 'Demo123@';

/**
 * Ensure an account's ledger matches its target cached balance (Rule 13).
 *
 * Transactions are the source of truth; `Account.balanceCents` is only a cache.
 * The seed historically wrote the cache without a backing opening transaction,
 * so funds checks (getTrueBalanceFromTx) saw a lower ledger and failed with
 * INSUFFICIENT_FUNDS. This helper:
 *   1. sums the account's active transactions with Decimal,
 *   2. computes `diff = target - ledger`,
 *   3. upserts a deterministic opening transaction for the difference,
 *   4. only then sets the cache to the target so ledger === cache.
 *
 * Idempotent: the opening transaction is keyed by
 * `seed-opening-balance-<accountId>` and updated (not duplicated) on re-runs.
 */
async function reconcileSeedAccountLedger(
  accountId: string,
  targetBalanceCents: number,
  currency: 'COP' | 'USD' | 'EUR',
  userId: string,
  date: Date = new Date('2025-01-01')
): Promise<void> {
  const openingKey = `seed-opening-balance-${accountId}`;
  const accountTransactions = await prisma.transaction.findMany({
    where: { accountId, isActive: true },
    select: { amountCents: true, idempotencyKey: true },
  });

  // The opening transaction is EXCLUDED from the ledger sum: it is the absorber,
  // so the required opening is `target - ledgerWithoutOpening`. Including it
  // (the previous behavior) made the helper non-idempotent — a second call
  // replaced the opening with the whole difference and drifted the cache.
  let ledger = new Decimal(0);
  let existingOpening = new Decimal(0);
  for (const transaction of accountTransactions) {
    const amount = new Decimal(transaction.amountCents.toString());
    if (transaction.idempotencyKey === openingKey) {
      existingOpening = amount;
      continue;
    }
    ledger = ledger.plus(amount);
  }

  const requiredOpening = new Decimal(targetBalanceCents).minus(ledger);
  const changed = !requiredOpening.equals(existingOpening);

  if (changed) {
    const openingCents = requiredOpening.toNumber();
    const type = requiredOpening.isNegative() ? 'EXPENSE' : 'INCOME';
    await prisma.transaction.upsert({
      where: { idempotencyKey: openingKey },
      update: {
        type,
        amountCents: BigInt(openingCents),
        currency,
        description: 'Saldo inicial',
        openingBalance: true,
        isActive: true,
        lastModifiedBy: userId,
      },
      create: {
        idempotencyKey: openingKey,
        userId,
        accountId,
        type,
        amountCents: BigInt(openingCents),
        currency,
        description: 'Saldo inicial',
        date,
        openingBalance: true,
        createdBy: userId,
        lastModifiedBy: userId,
      },
    });
  }

  await prisma.account.update({
    where: { id: accountId },
    data: { balanceCents: targetBalanceCents, lastReconciled: new Date() },
  });

  console.log(
    `  ${changed ? '➕' : '✓'} ledger ${ledger.toString()} → cache ${targetBalanceCents} (opening ${requiredOpening.toString()})`
  );
}

async function main() {
  console.log('🌱 Starting database seed...');

  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  // 1. Create test user
  console.log('Creating test user...');
  const user = await prisma.user.upsert({
    where: { email: 'demo@financetracker.com' },
    update: { passwordHash },
    create: {
      email: 'demo@financetracker.com',
      name: 'Juan Manuel Demo',
      passwordHash,
      baseCurrency: 'COP',
      language: 'SPANISH',
      theme: 'SYSTEM',
      lastLoginAt: new Date(),
      // Seeded demo users must never enter the first-run walkthrough.
      onboardingCompletedAt: new Date(),
    },
  });
  console.log(`✓ User created: ${user.email}`);

  // 1b. Salary configuration (replaces the legacy `User.baseSalaryCents` scalar).
  // `amountCents` is the amount PER PERIOD: the demo salary is BIWEEKLY (paid on
  // the 15th and 30th of each month) for $5.000.000 COP. Upsert is keyed by the
  // 1:1 `userId` so re-seeding is a no-op.
  console.log('Creating salary configuration...');
  const salaryConfig = await prisma.salaryConfiguration.upsert({
    where: { userId: user.id },
    update: {
      amountCents: 500000000, // $5,000,000 COP
      currency: 'COP',
      frequency: 'BIWEEKLY',
      payDays: [15, 30],
      isActive: true,
      deletedAt: null,
      lastModifiedBy: user.id,
    },
    create: {
      userId: user.id,
      amountCents: 500000000, // $5,000,000 COP
      currency: 'COP',
      frequency: 'BIWEEKLY',
      // Two pay days per month (15th and 30th; the 30th is clamped to the end of
      // short months by the projection engine).
      payDays: [15, 30],
      createdBy: user.id,
      lastModifiedBy: user.id,
    },
  });

  // Half-yearly bonus ("Prima de servicios"): months 6 and 12 (SEMIANNUAL,
  // anchored on June). Deterministic idempotency key so re-seeding is a no-op.
  const bonusKey = 'seed-salary-bonus-prima-servicios';
  await prisma.salaryBonus.upsert({
    where: { idempotencyKey: bonusKey },
    update: {
      name: 'Prima de servicios',
      amountCents: 250000000, // $2,500,000 COP
      currency: 'COP',
      frequency: 'SEMIANNUAL',
      anchorMonth: 6,
      dayOfMonth: 30,
      isActive: true,
      deletedAt: null,
      lastModifiedBy: user.id,
    },
    create: {
      salaryConfigId: salaryConfig.id,
      name: 'Prima de servicios',
      amountCents: 250000000, // $2,500,000 COP
      currency: 'COP',
      frequency: 'SEMIANNUAL',
      anchorMonth: 6,
      dayOfMonth: 30,
      idempotencyKey: bonusKey,
      createdBy: user.id,
      lastModifiedBy: user.id,
    },
  });

  // Projection settings (configurable savings target — NOT a SavingsGoal). The
  // MONTHLY amount is kept modest for the demo so the projection is meaningful.
  await prisma.projectionSettings.upsert({
    where: { userId: user.id },
    update: {
      monthlySavingsTargetCents: 50000000, // $500,000 COP per month
      currency: 'COP',
      isActive: true,
      deletedAt: null,
      lastModifiedBy: user.id,
    },
    create: {
      userId: user.id,
      monthlySavingsTargetCents: 50000000, // $500,000 COP per month
      currency: 'COP',
      createdBy: user.id,
      lastModifiedBy: user.id,
    },
  });

  console.log('✓ Salary configuration + half-yearly bonus + projection settings seeded');

  // 2. Create 4 accounts
  console.log('Creating accounts...');

  // Find-or-create guard for demo accounts: re-seeding must never duplicate an
  // account. Matching is idempotent by `{ userId, name, type }`; when copies
  // already exist we reuse the oldest one (`orderBy: createdAt asc`) instead of
  // piling up new duplicates. Newly created rows carry a deterministic
  // `idempotencyKey` (`seed-account-<slug>`) as a database-level guard.
  const findOrCreateAccount = async (params: {
    slug: string;
    name: string;
    type: 'CHECKING' | 'CASH' | 'SAVINGS' | 'POCKET' | 'INVESTMENT' | 'CREDIT_CARD';
    currency: 'COP' | 'USD' | 'EUR';
    balanceCents: number;
    interestRateEA?: Decimal;
    creditLimitCents?: number;
    cutoffDay?: number;
    paymentDueDay?: number;
  }) => {
    const existing = await prisma.account.findFirst({
      where: { userId: user.id, name: params.name, type: params.type, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) {
      console.log(`↩ ${params.name} already exists, reusing oldest copy`);
      return existing;
    }
    return prisma.account.create({
      data: {
        userId: user.id,
        name: params.name,
        type: params.type,
        currency: params.currency,
        balanceCents: params.balanceCents,
        ...(params.interestRateEA != null ? { interestRateEA: params.interestRateEA } : {}),
        ...(params.creditLimitCents != null ? { creditLimitCents: params.creditLimitCents } : {}),
        ...(params.cutoffDay != null ? { cutoffDay: params.cutoffDay } : {}),
        ...(params.paymentDueDay != null ? { paymentDueDay: params.paymentDueDay } : {}),
        idempotencyKey: `seed-account-${params.slug}`,
        createdBy: user.id,
      },
    });
  };

  const efectivo = await findOrCreateAccount({
    slug: 'efectivo',
    name: 'Efectivo',
    type: 'CASH',
    currency: 'COP',
    balanceCents: 50000000, // $500,000 COP
  });

  const bancolombia = await findOrCreateAccount({
    slug: 'bancolombia-ahorros',
    name: 'Bancolombia (Ahorros)',
    type: 'SAVINGS',
    currency: 'COP',
    balanceCents: 250000000, // $2,500,000 COP
    interestRateEA: new Decimal('4.5'), // 4.5% E.A.
  });

  const nubank = await findOrCreateAccount({
    slug: 'nubank-credito',
    name: 'NuBank (Crédito)',
    type: 'CREDIT_CARD',
    currency: 'COP',
    balanceCents: -15000000, // -$150,000 COP (deuda)
    creditLimitCents: 300000000, // $3,000,000 COP
    cutoffDay: 15,
    paymentDueDay: 25,
  });

  const binance = await findOrCreateAccount({
    slug: 'binance-inversion',
    name: 'Binance (Inversión)',
    type: 'INVESTMENT',
    currency: 'USD',
    balanceCents: 2699, // coherent with seeded transactions (computed below)
    interestRateEA: new Decimal('8.2'), // 8.2% E.A.
  });

  // 2b. Additional investment demo accounts (find-or-create by name + type + userId)
  const portafolioUsa = await findOrCreateAccount({
    slug: 'portafolio-usa',
    name: 'Portafolio USA (USD)',
    type: 'INVESTMENT',
    currency: 'USD',
    balanceCents: 8704, // coherent with seeded transactions (computed below)
    interestRateEA: new Decimal('6.5'), // 6.5% E.A.
  });

  const portafolioEuropa = await findOrCreateAccount({
    slug: 'portafolio-europa',
    name: 'Portafolio Europa (EUR)',
    type: 'INVESTMENT',
    currency: 'EUR',
    balanceCents: 7350, // coherent with seeded transactions (computed below)
    interestRateEA: new Decimal('5.2'), // 5.2% E.A.
  });

  const portafolioGlobal = await findOrCreateAccount({
    slug: 'portafolio-global',
    name: 'Portafolio Global (USD)',
    type: 'INVESTMENT',
    currency: 'USD',
    balanceCents: 6413, // coherent with seeded transactions (computed below)
    interestRateEA: new Decimal('5.8'), // 5.8% E.A.
  });

  console.log(`✓ Created/verified 7 accounts (4 base + 3 investment demo)`);

  // 3. Create 20 mixed transactions (Income, Expenses, Transfers)
  console.log('Creating transactions...');

  const transactions = [];

  // Income 1: Salary
  transactions.push(
    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: bancolombia.id,
        type: 'INCOME',
        amountCents: 500000000, // $5,000,000 COP
        currency: 'COP',
        description: 'Salario Enero 2026',
        date: new Date('2026-01-05'),
        createdBy: user.id,
      },
    })
  );

  // Expense 1: Rent
  transactions.push(
    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: bancolombia.id,
        type: 'EXPENSE',
        amountCents: -120000000, // -$1,200,000 COP
        currency: 'COP',
        description: 'Arriendo Enero',
        date: new Date('2026-01-10'),
        createdBy: user.id,
      },
    })
  );

  // Transfer 1: Bancolombia -> Efectivo (DOUBLE-ENTRY)
  const transfer1Id = crypto.randomUUID();
  transactions.push(
    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: bancolombia.id,
        type: 'TRANSFER_OUT',
        amountCents: -30000000, // -$300,000 COP
        currency: 'COP',
        description: 'Retiro efectivo supermercado',
        date: new Date('2026-01-12'),
        transferId: transfer1Id,
        transferToAccountId: efectivo.id,
        createdBy: user.id,
      },
    })
  );
  transactions.push(
    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: efectivo.id,
        type: 'TRANSFER_IN',
        amountCents: 30000000, // +$300,000 COP
        currency: 'COP',
        description: 'Retiro efectivo supermercado',
        date: new Date('2026-01-12'),
        transferId: transfer1Id,
        transferFromAccountId: bancolombia.id,
        createdBy: user.id,
      },
    })
  );

  // Expense 2: Groceries
  transactions.push(
    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: efectivo.id,
        type: 'EXPENSE',
        amountCents: -8500000, // -$85,000 COP
        currency: 'COP',
        description: 'Supermercado D1',
        date: new Date('2026-01-13'),
        createdBy: user.id,
      },
    })
  );

  // Expense 3: Credit card payment
  transactions.push(
    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: nubank.id,
        type: 'EXPENSE',
        amountCents: -4500000, // -$45,000 COP
        currency: 'COP',
        description: 'Netflix + Spotify',
        date: new Date('2026-01-15'),
        createdBy: user.id,
      },
    })
  );

  // Transfer 2: Bancolombia -> Binance (COP to USD conversion)
  const transfer2Id = crypto.randomUUID();
  const exchangeRate = new Decimal('0.00025'); // 1 COP = 0.00025 USD (4000 COP/USD)
  transactions.push(
    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: bancolombia.id,
        type: 'TRANSFER_OUT',
        amountCents: -40000000, // -$400,000 COP
        currency: 'COP',
        description: 'Inversión en Binance',
        date: new Date('2026-01-20'),
        transferId: transfer2Id,
        transferToAccountId: binance.id,
        createdBy: user.id,
      },
    })
  );
  transactions.push(
    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: binance.id,
        type: 'TRANSFER_IN',
        amountCents: 10000, // +$100 USD
        currency: 'USD',
        originalAmountCents: 40000000, // Original: 400,000 COP
        originalCurrency: 'COP',
        exchangeRate,
        description: 'Inversión desde Bancolombia',
        date: new Date('2026-01-20'),
        transferId: transfer2Id,
        transferFromAccountId: bancolombia.id,
        createdBy: user.id,
      },
    })
  );

  // More expenses
  transactions.push(
    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: efectivo.id,
        type: 'EXPENSE',
        amountCents: -2500000, // -$25,000 COP
        currency: 'COP',
        description: 'Transporte (Uber)',
        date: new Date('2026-01-22'),
        createdBy: user.id,
      },
    })
  );

  transactions.push(
    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: nubank.id,
        type: 'EXPENSE',
        amountCents: -6800000, // -$68,000 COP
        currency: 'COP',
        description: 'Restaurante japonés',
        date: new Date('2026-01-25'),
        createdBy: user.id,
      },
    })
  );

  // Credit payment (DOUBLE-ENTRY: EXPENSE negative on the bank account +
  // CREDIT_PAYMENT positive on the card — reduces debt)
  const payment1Id = crypto.randomUUID();
  transactions.push(
    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: bancolombia.id,
        type: 'EXPENSE',
        amountCents: -5000000, // -$50,000 COP
        currency: 'COP',
        description: 'Pago tarjeta NuBank',
        date: new Date('2026-01-26'),
        transferId: payment1Id,
        transferToAccountId: nubank.id,
        createdBy: user.id,
      },
    })
  );
  transactions.push(
    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: nubank.id,
        type: 'CREDIT_PAYMENT',
        amountCents: 5000000, // +$50,000 COP (positive: reduces debt)
        currency: 'COP',
        description: 'Pago tarjeta NuBank',
        date: new Date('2026-01-26'),
        transferId: payment1Id,
        transferFromAccountId: bancolombia.id,
        createdBy: user.id,
      },
    })
  );

  // Additional credit card consumptions (Feb)
  transactions.push(
    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: nubank.id,
        type: 'EXPENSE',
        amountCents: -2000000, // -$20,000 COP
        currency: 'COP',
        description: 'Compra online (Amazon)',
        date: new Date('2026-02-05'),
        createdBy: user.id,
      },
    })
  );
  transactions.push(
    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: nubank.id,
        type: 'EXPENSE',
        amountCents: -1500000, // -$15,000 COP
        currency: 'COP',
        description: 'Supermercado Éxito',
        date: new Date('2026-02-08'),
        createdBy: user.id,
      },
    })
  );

  // Investment income
  transactions.push(
    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: binance.id,
        type: 'INCOME',
        amountCents: 500, // +$5 USD
        currency: 'USD',
        description: 'Rendimientos staking',
        date: new Date('2026-02-01'),
        createdBy: user.id,
      },
    })
  );

  // More daily expenses
  for (let i = 0; i < 8; i++) {
    const expenseTypes = ['Almuerzo', 'Café', 'Transporte', 'Farmacia', 'Supermercado'];
    const randomType = expenseTypes[Math.floor(Math.random() * expenseTypes.length)];
    const randomAmount = -Math.floor(Math.random() * 5000000) - 1000000; // -$10k to -$50k COP
    const randomDays = Math.floor(Math.random() * 15) + 1;

    transactions.push(
      await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: user.id,
          accountId: Math.random() > 0.5 ? efectivo.id : bancolombia.id,
          type: 'EXPENSE',
          amountCents: randomAmount,
          currency: 'COP',
          description: `${randomType} #${i + 1}`,
          date: new Date(`2026-02-${String(randomDays).padStart(2, '0')}`),
          createdBy: user.id,
        },
      })
    );
  }

  console.log(
    `✓ Created ${transactions.length} transactions (including transfers with double-entry)`
  );

  // 3b. Investment demo data (2025-09 → 2026-02) so the performance chart has
  //     a rich series per account. Deposits book a double-entry pair:
  //     TRANSFER_OUT on Bancolombia ↔ TRANSFER_IN on the investment account.
  //     Buys/sells use INVESTMENT (+/-) and income uses INCOME.
  console.log('Creating investment demo transactions and holdings...');

  let investmentTxCount = 0;

  const createInvestmentDeposit = async (params: {
    bankAccountId: string;
    investmentAccountId: string;
    amountCopCents: number;
    exchangeRate: number; // COP per 1 foreign unit
    description: string;
    date: Date;
    investmentCurrency: 'USD' | 'EUR';
  }) => {
    const transferId = crypto.randomUUID();
    const convertedCents = new Decimal(params.amountCopCents)
      .dividedBy(params.exchangeRate)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
      .toNumber();

    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: params.bankAccountId,
        type: 'TRANSFER_OUT',
        amountCents: -params.amountCopCents,
        currency: 'COP',
        description: params.description,
        date: params.date,
        transferId,
        transferToAccountId: params.investmentAccountId,
        createdBy: user.id,
      },
    });
    investmentTxCount++;

    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: params.investmentAccountId,
        type: 'TRANSFER_IN',
        amountCents: convertedCents,
        currency: params.investmentCurrency,
        description: params.description,
        date: params.date,
        transferId,
        transferFromAccountId: params.bankAccountId,
        originalAmountCents: params.amountCopCents,
        originalCurrency: 'COP',
        exchangeRate: new Decimal(params.exchangeRate),
        createdBy: user.id,
      },
    });
    investmentTxCount++;

    return convertedCents;
  };

  const createInvestmentBuy = async (params: {
    accountId: string;
    symbol: string;
    name: string;
    quantity: string;
    pricePerShareCents: number;
    currentPriceCents: number;
    date: Date;
    lastPriceUpdate: Date;
    currency: 'USD' | 'EUR';
  }) => {
    const totalCostCents = new Decimal(params.quantity)
      .times(params.pricePerShareCents)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
      .toNumber();

    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: params.accountId,
        type: 'INVESTMENT',
        amountCents: -totalCostCents,
        currency: params.currency,
        description: `Compra ${params.quantity} ${params.symbol}`,
        date: params.date,
        createdBy: user.id,
      },
    });
    investmentTxCount++;

    await prisma.investmentAssetHolding.upsert({
      where: { accountId_symbol: { accountId: params.accountId, symbol: params.symbol } },
      update: {
        currentPriceCents: params.currentPriceCents,
        lastPriceUpdate: params.lastPriceUpdate,
        lastModifiedBy: user.id,
      },
      create: {
        accountId: params.accountId,
        symbol: params.symbol,
        name: params.name,
        quantity: new Decimal(params.quantity),
        avgCostCents: params.pricePerShareCents,
        currency: params.currency,
        currentPriceCents: params.currentPriceCents,
        lastPriceUpdate: params.lastPriceUpdate,
        createdBy: user.id,
        lastModifiedBy: user.id,
      },
    });

    return totalCostCents;
  };

  const createInvestmentSell = async (params: {
    accountId: string;
    symbol: string;
    quantity: string;
    pricePerShareCents: number;
    date: Date;
    currency: 'USD' | 'EUR';
  }) => {
    const proceedsCents = new Decimal(params.quantity)
      .times(params.pricePerShareCents)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
      .toNumber();

    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: params.accountId,
        type: 'INVESTMENT',
        amountCents: proceedsCents,
        currency: params.currency,
        description: `Venta ${params.quantity} ${params.symbol}`,
        date: params.date,
        createdBy: user.id,
      },
    });
    investmentTxCount++;

    const holding = await prisma.investmentAssetHolding.findUniqueOrThrow({
      where: { accountId_symbol: { accountId: params.accountId, symbol: params.symbol } },
    });
    const remainingQty = new Decimal(holding.quantity.toString()).minus(params.quantity);
    await prisma.investmentAssetHolding.update({
      where: { id: holding.id },
      data: {
        quantity: remainingQty,
        currentPriceCents: params.pricePerShareCents,
        lastPriceUpdate: params.date,
        lastModifiedBy: user.id,
      },
    });

    return proceedsCents;
  };

  const createInvestmentIncome = async (params: {
    accountId: string;
    amountCents: number;
    currency: 'USD' | 'EUR';
    description: string;
    date: Date;
  }) => {
    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: params.accountId,
        type: 'INCOME',
        amountCents: params.amountCents,
        currency: params.currency,
        description: params.description,
        date: params.date,
        createdBy: user.id,
      },
    });
    investmentTxCount++;
  };

  const priceAsOf = new Date('2026-02-10');

  // --- Portafolio USA (USD) ---
  await createInvestmentDeposit({
    bankAccountId: bancolombia.id,
    investmentAccountId: portafolioUsa.id,
    amountCopCents: 80000000, // $800,000 COP
    exchangeRate: 4100, // → 19,512 USD-cents
    description: 'Aporte Portafolio USA (sept)',
    date: new Date('2025-09-15'),
    investmentCurrency: 'USD',
  });
  await createInvestmentBuy({
    accountId: portafolioUsa.id,
    symbol: 'AAPL',
    name: 'Apple Inc.',
    quantity: '0.4',
    pricePerShareCents: 18000,
    currentPriceCents: 18600,
    date: new Date('2025-09-20'),
    lastPriceUpdate: priceAsOf,
    currency: 'USD',
  });
  await createInvestmentDeposit({
    bankAccountId: bancolombia.id,
    investmentAccountId: portafolioUsa.id,
    amountCopCents: 50000000, // $500,000 COP
    exchangeRate: 4200, // → 11,905 USD-cents
    description: 'Aporte Portafolio USA (oct)',
    date: new Date('2025-10-10'),
    investmentCurrency: 'USD',
  });
  await createInvestmentBuy({
    accountId: portafolioUsa.id,
    symbol: 'TSLA',
    name: 'Tesla Inc.',
    quantity: '0.2',
    pricePerShareCents: 25000,
    currentPriceCents: 26200,
    date: new Date('2025-10-20'),
    lastPriceUpdate: priceAsOf,
    currency: 'USD',
  });
  await createInvestmentBuy({
    accountId: portafolioUsa.id,
    symbol: 'MSFT',
    name: 'Microsoft Corp.',
    quantity: '0.3',
    pricePerShareCents: 42000,
    currentPriceCents: 43100,
    date: new Date('2025-11-05'),
    lastPriceUpdate: priceAsOf,
    currency: 'USD',
  });
  // Partial sell (reduces TSLA 0.2 → 0.15, keeps cash inside the account)
  await createInvestmentSell({
    accountId: portafolioUsa.id,
    symbol: 'TSLA',
    quantity: '0.05',
    pricePerShareCents: 26200,
    date: new Date('2025-11-20'),
    currency: 'USD',
  });
  await createInvestmentDeposit({
    bankAccountId: bancolombia.id,
    investmentAccountId: portafolioUsa.id,
    amountCopCents: 30000000, // $300,000 COP
    exchangeRate: 4300, // → 6,977 USD-cents
    description: 'Aporte Portafolio USA (dic)',
    date: new Date('2025-12-05'),
    investmentCurrency: 'USD',
  });
  await createInvestmentBuy({
    accountId: portafolioUsa.id,
    symbol: 'VOO',
    name: 'Vanguard S&P 500 ETF',
    quantity: '0.15',
    pricePerShareCents: 48000,
    currentPriceCents: 48700,
    date: new Date('2025-12-10'),
    lastPriceUpdate: priceAsOf,
    currency: 'USD',
  });
  await createInvestmentIncome({
    accountId: portafolioUsa.id,
    amountCents: 1000,
    currency: 'USD',
    description: 'Rendimientos',
    date: new Date('2026-02-01'),
  });

  // --- Portafolio Europa (EUR) ---
  await createInvestmentDeposit({
    bankAccountId: bancolombia.id,
    investmentAccountId: portafolioEuropa.id,
    amountCopCents: 40000000, // $400,000 COP
    exchangeRate: 4700, // → 8,511 EUR-cents
    description: 'Aporte Portafolio Europa (dic)',
    date: new Date('2025-12-08'),
    investmentCurrency: 'EUR',
  });
  await createInvestmentBuy({
    accountId: portafolioEuropa.id,
    symbol: 'VWRA',
    name: 'Vanguard FTSE All-World UCITS ETF',
    quantity: '0.3',
    pricePerShareCents: 29000,
    currentPriceCents: 29500,
    date: new Date('2025-12-15'),
    lastPriceUpdate: priceAsOf,
    currency: 'EUR',
  });
  await createInvestmentDeposit({
    bankAccountId: bancolombia.id,
    investmentAccountId: portafolioEuropa.id,
    amountCopCents: 35000000, // $350,000 COP
    exchangeRate: 4600, // → 7,609 EUR-cents
    description: 'Aporte Portafolio Europa (ene)',
    date: new Date('2026-01-12'),
    investmentCurrency: 'EUR',
  });
  await createInvestmentBuy({
    accountId: portafolioEuropa.id,
    symbol: 'SGGD',
    name: 'iShares Core S&P 500 UCITS ETF',
    quantity: '0.5',
    pricePerShareCents: 840,
    currentPriceCents: 860,
    date: new Date('2026-01-15'),
    lastPriceUpdate: priceAsOf,
    currency: 'EUR',
  });
  await createInvestmentIncome({
    accountId: portafolioEuropa.id,
    amountCents: 350,
    currency: 'EUR',
    description: 'Rendimientos',
    date: new Date('2026-02-05'),
  });

  // --- Portafolio Global (USD) ---
  await createInvestmentDeposit({
    bankAccountId: bancolombia.id,
    investmentAccountId: portafolioGlobal.id,
    amountCopCents: 60000000, // $600,000 COP
    exchangeRate: 4300, // → 13,953 USD-cents
    description: 'Aporte Portafolio Global (ene)',
    date: new Date('2026-01-20'),
    investmentCurrency: 'USD',
  });
  await createInvestmentBuy({
    accountId: portafolioGlobal.id,
    symbol: 'SPY',
    name: 'SPDR S&P 500 ETF Trust',
    quantity: '0.1',
    pricePerShareCents: 55000,
    currentPriceCents: 55800,
    date: new Date('2026-01-25'),
    lastPriceUpdate: priceAsOf,
    currency: 'USD',
  });
  await createInvestmentBuy({
    accountId: portafolioGlobal.id,
    symbol: 'VTI',
    name: 'Vanguard Total Stock Market ETF',
    quantity: '0.08',
    pricePerShareCents: 28000,
    currentPriceCents: 28400,
    date: new Date('2026-01-28'),
    lastPriceUpdate: priceAsOf,
    currency: 'USD',
  });
  await createInvestmentIncome({
    accountId: portafolioGlobal.id,
    amountCents: 200,
    currency: 'USD',
    description: 'Rendimientos',
    date: new Date('2026-02-08'),
  });

  // --- Binance (Inversión, USD) — crypto holdings ---
  await createInvestmentDeposit({
    bankAccountId: bancolombia.id,
    investmentAccountId: binance.id,
    amountCopCents: 60000000, // $600,000 COP
    exchangeRate: 4100, // → 14,634 USD-cents
    description: 'Aporte Binance (sept)',
    date: new Date('2025-09-10'),
    investmentCurrency: 'USD',
  });
  await createInvestmentBuy({
    accountId: binance.id,
    symbol: 'BTC',
    name: 'Bitcoin',
    quantity: '0.002',
    pricePerShareCents: 9500000, // $95,000 BTC
    currentPriceCents: 9700000, // $97,000 BTC
    date: new Date('2025-09-25'),
    lastPriceUpdate: priceAsOf,
    currency: 'USD',
  });
  await createInvestmentDeposit({
    bankAccountId: bancolombia.id,
    investmentAccountId: binance.id,
    amountCopCents: 50000000, // $500,000 COP
    exchangeRate: 4250, // → 11,765 USD-cents
    description: 'Aporte Binance (nov)',
    date: new Date('2025-11-15'),
    investmentCurrency: 'USD',
  });
  await createInvestmentBuy({
    accountId: binance.id,
    symbol: 'ETH',
    name: 'Ethereum',
    quantity: '0.04',
    pricePerShareCents: 380000, // $3,800 ETH
    currentPriceCents: 390000, // $3,900 ETH
    date: new Date('2025-11-30'),
    lastPriceUpdate: priceAsOf,
    currency: 'USD',
  });

  // Extra salary so Bancolombia stays funded after the investment outflows
  await prisma.transaction.create({
    data: {
      idempotencyKey: crypto.randomUUID(),
      userId: user.id,
      accountId: bancolombia.id,
      type: 'INCOME',
      amountCents: 500000000, // $5,000,000 COP
      currency: 'COP',
      description: 'Salario Febrero 2026',
      date: new Date('2026-02-05'),
      createdBy: user.id,
    },
  });

  console.log(`✓ Created ${investmentTxCount} investment demo transactions + holdings`);

  // Update account balances (reconciliation). Each call reconciles the ledger
  // first (inserting a deterministic opening transaction when needed) and only
  // then sets the cache, so `ledger === balanceCents` after the seed (Rule 13).
  console.log('Reconciling account balances (ledger + cache)...');

  // Efectivo: target $500,000 COP, backed by an opening transaction.
  await reconcileSeedAccountLedger(efectivo.id, 50000000, 'COP', user.id);

  // Bancolombia (Ahorros): deterministic ledger = Jan salary (+500M) + Feb
  // salary (+500M) − rent (−120M) − Efectivo transfer (−30M) − Binance transfer
  // (−40M) − card payment (−5M) − investment outflows (−405M) = ~400M (minus
  // the non-deterministic random expenses above); the opening transaction
  // absorbs the remainder so the cache stays at $4,000,000 COP.
  await reconcileSeedAccountLedger(bancolombia.id, 400000000, 'COP', user.id);

  // NuBank: deterministic card ledger = Netflix/Spotify (−45k) + Restaurante
  // (−68k) + Amazon (−20k) + Éxito (−15k) + Pago tarjeta (+50k) = −98k COP.
  await reconcileSeedAccountLedger(nubank.id, -9800000, 'COP', user.id);

  // Binance: deposits (14,634 + 11,765 + 10,000) + income (500) − buys
  // (−19,000 −15,200) = 2,699 USD-cents.
  await reconcileSeedAccountLedger(binance.id, 2699, 'USD', user.id);

  // Portafolio USA: deposits (19,512 + 11,905 + 6,977) + income (1,000) − buys
  // (−7,200 −5,000 −12,600 −7,200) + sell (1,310) = 8,704 USD-cents.
  await reconcileSeedAccountLedger(portafolioUsa.id, 8704, 'USD', user.id);

  // Portafolio Europa: deposits (8,511 + 7,609) + income (350) − buys
  // (−8,700 −420) = 7,350 EUR-cents.
  await reconcileSeedAccountLedger(portafolioEuropa.id, 7350, 'EUR', user.id);

  // Portafolio Global: deposit (13,953) + income (200) − buys (−5,500 −2,240)
  // = 6,413 USD-cents.
  await reconcileSeedAccountLedger(portafolioGlobal.id, 6413, 'USD', user.id);

  console.log('✓ Account balances reconciled (ledger === cache)');

  // 4. Seed system categories (shared, userId: null)
  console.log('Seeding system categories...');
  const systemCategories = [
    {
      id: 'cgroceries000000000000000',
      name: 'Mercado',
      type: 'GROCERIES' as const,
      color: '#3B82F6',
      icon: 'shopping-cart',
    },
    {
      id: 'ctransportation000000000000',
      name: 'Transporte',
      type: 'TRANSPORTATION' as const,
      color: '#EF4444',
      icon: 'bus',
    },
    {
      id: 'cutilities0000000000000000',
      name: 'Servicios',
      type: 'UTILITIES' as const,
      color: '#10B981',
      icon: 'zap',
    },
    {
      id: 'centertainment00000000000',
      name: 'Entretenimiento',
      type: 'ENTERTAINMENT' as const,
      color: '#F59E0B',
      icon: 'film',
    },
    {
      id: 'chealthcare00000000000000',
      name: 'Salud',
      type: 'HEALTHCARE' as const,
      color: '#8B5CF6',
      icon: 'heart-pulse',
    },
    {
      id: 'ceducation000000000000000',
      name: 'Educación',
      type: 'EDUCATION' as const,
      color: '#06B6D4',
      icon: 'graduation-cap',
    },
    {
      id: 'cshopping0000000000000000',
      name: 'Compras',
      type: 'SHOPPING' as const,
      color: '#EC4899',
      icon: 'shopping-bag',
    },
    {
      id: 'cdining000000000000000000',
      name: 'Restaurantes',
      type: 'DINING' as const,
      color: '#F97316',
      icon: 'utensils',
    },
    {
      id: 'cother0000000000000000000',
      name: 'Otros',
      type: 'OTHER' as const,
      color: '#64748B',
      icon: 'more-horizontal',
    },
    // System-only income categories (SALARY / BONUS). They must NEVER be exposed
    // as creatable categories in the UI; the backend auto-assigns SALARY to an
    // INCOME transaction created without a category when a salary is configured.
    {
      id: 'csalary000000000000000000',
      name: 'Sueldo',
      type: 'SALARY' as const,
      color: '#0EA5E9',
      icon: 'banknote',
    },
    {
      id: 'cbonus0000000000000000000',
      name: 'Prima/Bono',
      type: 'BONUS' as const,
      color: '#8B5CF6',
      icon: 'gift',
    },
  ];

  // Migrate legacy system category rows that used non-CUID ids (cat-*) before the
  // strict CUID validation was enforced on Transaction.categoryId. Re-point any
  // transactions that reference them and remove the old rows, so re-seeding an
  // existing database does not create duplicates or violate the CUID contract.
  for (const cat of systemCategories) {
    const legacyId = `cat-${cat.type.toLowerCase()}`;
    if (legacyId === cat.id) continue;
    await prisma.transaction.updateMany({
      where: { categoryId: legacyId },
      data: { categoryId: cat.id },
    });
    await prisma.category.deleteMany({
      where: { id: legacyId, userId: null },
    });
  }

  for (const cat of systemCategories) {
    await prisma.category.upsert({
      where: { id: cat.id },
      update: { name: cat.name, color: cat.color, icon: cat.icon, isActive: true },
      create: {
        id: cat.id,
        name: cat.name,
        type: cat.type,
        color: cat.color,
        icon: cat.icon,
        isActive: true,
      },
    });
  }
  console.log(`✓ Seeded ${systemCategories.length} system categories`);

  // Register the demo salary INCOME rows under the system SALARY category. The
  // category is a FK target, so this runs AFTER the categories exist (the salary
  // transactions themselves are created earlier in the script).
  const salaryUpdate = await prisma.transaction.updateMany({
    where: { userId: user.id, type: 'INCOME', description: { startsWith: 'Salario' } },
    data: { categoryId: 'csalary000000000000000000', lastModifiedBy: user.id },
  });
  console.log(`✓ Assigned SALARY category to ${salaryUpdate.count} salary transactions`);

  // Savings goals
  console.log('Creating savings goals...');
  const goalsData = [
    {
      name: 'Vacaciones Europa 2027',
      description: 'Viaje de 3 semanas por España, Francia e Italia',
      type: 'ANNUAL' as const,
      targetAmountCents: 1500000000,
      currentAmountCents: 420000000,
      currency: 'COP' as const,
      deadline: new Date('2027-06-01'),
      monthlyContributionCents: 90000000,
      status: 'ACTIVE' as const,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      name: 'Fondo de Emergencia',
      description: '6 meses de gastos fijos',
      type: 'EMERGENCY' as const,
      targetAmountCents: 1800000000,
      currentAmountCents: 900000000,
      currency: 'COP' as const,
      monthlyContributionCents: 150000000,
      status: 'ACTIVE' as const,
      color: 'from-red-500 to-rose-500',
    },
    {
      name: 'MacBook Pro',
      description: 'Portátil nuevo para trabajo',
      type: 'SHORT_TERM' as const,
      targetAmountCents: 900000000,
      currentAmountCents: 900000000,
      currency: 'COP' as const,
      deadline: new Date('2026-03-01'),
      status: 'COMPLETED' as const,
      color: 'from-emerald-500 to-teal-500',
    },
    {
      name: 'Inversión ETF',
      description: 'Acumulación mensual para invertir en ETFs',
      type: 'CUSTOM' as const,
      targetAmountCents: 500000000,
      currentAmountCents: 125000000,
      currency: 'COP' as const,
      monthlyContributionCents: 50000000,
      status: 'ACTIVE' as const,
      color: 'from-violet-500 to-purple-500',
    },
  ];

  for (const goalData of goalsData) {
    const goal = await prisma.savingsGoal.create({
      data: {
        userId: user.id,
        ...goalData,
        createdBy: user.id,
        lastModifiedBy: user.id,
      },
    });

    // Add contributions to back the cached balance (Rule 13): ACTIVE goals with
    // progress, AND COMPLETED goals. COMPLETED goals are reconciled from the
    // ledger on the first read (reconcileGoalBalances), so a completed goal
    // without real contributions would be auto-zeroed — we must seed the real
    // contributions that support its currentAmountCents (e.g. "MacBook Pro").
    if (goalData.currentAmountCents > 0) {
      const contributionAmount = Math.floor(goalData.currentAmountCents / 3);
      const months = [3, 2, 1];
      for (const monthsAgo of months) {
        const date = new Date();
        date.setMonth(date.getMonth() - monthsAgo);
        await prisma.savingsContribution.create({
          data: {
            goalId: goal.id,
            amountCents: contributionAmount,
            currency: goalData.currency,
            idempotencyKey: crypto.randomUUID(),
            date,
            createdBy: user.id,
            lastModifiedBy: user.id,
          },
        });
      }
    }
  }

  console.log(`✓ Created ${goalsData.length} savings goals with contributions`);

  // Fixed expenses (recurring templates + coherent materialized payments).
  // No linked Transaction rows are created on purpose: the account balances are
  // set deterministically above, and the source-of-truth reconciliation would
  // otherwise drift the documented demo balances.
  console.log('Creating fixed expenses...');

  const now = new Date();
  const year = now.getFullYear();
  const today = startOfDay(now);

  // Shared recurrence engine (the same pure module the service uses) so every
  // seeded payment is a genuine occurrence of the template series. Otherwise the
  // first `ensureUpcomingPayments` materializes the true series and the seeded
  // rows become ghost/duplicate payments double-counted in the summaries.
  const { from: horizonStart, to: horizonEnd } = getMaterializationHorizon(now);

  interface SeedFixedExpense {
    name: string;
    description: string;
    amountCents: number;
    currency: 'COP';
    frequency: 'MONTHLY' | 'BIWEEKLY' | 'YEARLY';
    dayOfPayment: number | null;
    startDate: Date;
    color: string;
    icon: string;
    /** Occurrences of the series to seed, by role (unpaid unless `paid`). */
    plan: { paid?: boolean; pending?: boolean; overdue?: boolean };
  }

  const fixedExpenses: SeedFixedExpense[] = [
    {
      name: 'Arriendo',
      description: 'Arriendo apartamento',
      amountCents: 120000000, // $1,200,000 COP
      currency: 'COP',
      frequency: 'MONTHLY',
      dayOfPayment: 5,
      startDate: startOfDay(new Date(year - 1, 0, 1)),
      color: '#EF4444',
      icon: 'home',
      plan: { paid: true, pending: true },
    },
    {
      name: 'Netflix',
      description: 'Suscripción mensual',
      amountCents: 4500000, // $45,000 COP
      currency: 'COP',
      frequency: 'MONTHLY',
      dayOfPayment: 15,
      startDate: startOfDay(new Date(year - 1, 0, 1)),
      color: '#DC2626',
      icon: 'tv',
      plan: { pending: true },
    },
    {
      name: 'Internet',
      description: 'Plan de fibra óptica',
      amountCents: 12000000, // $120,000 COP
      currency: 'COP',
      frequency: 'MONTHLY',
      dayOfPayment: 10,
      startDate: startOfDay(new Date(year - 1, 0, 1)),
      color: '#3B82F6',
      icon: 'wifi',
      plan: { overdue: true },
    },
    {
      name: 'Gimnasio',
      description: 'Mensualidad gimnasio',
      amountCents: 8000000, // $80,000 COP
      currency: 'COP',
      frequency: 'BIWEEKLY',
      dayOfPayment: null,
      startDate: startOfDay(new Date(2025, 0, 1)),
      color: '#10B981',
      icon: 'dumbbell',
      plan: { paid: true, pending: true },
    },
    {
      name: 'Seguro Anual',
      description: 'Seguro todo riesgo',
      amountCents: 90000000, // $900,000 COP
      currency: 'COP',
      frequency: 'YEARLY',
      dayOfPayment: 1,
      startDate: startOfDay(new Date(year - 1, 0, 1)),
      color: '#8B5CF6',
      icon: 'shield',
      plan: { pending: true },
    },
  ];

  let fixedExpensePaymentCount = 0;
  for (const expenseData of fixedExpenses) {
    const existing = await prisma.fixedExpense.findFirst({
      where: { userId: user.id, name: expenseData.name, isActive: true },
    });

    const expense =
      existing ??
      (await prisma.fixedExpense.create({
        data: {
          userId: user.id,
          name: expenseData.name,
          description: expenseData.description,
          amountCents: expenseData.amountCents,
          currency: expenseData.currency,
          frequency: expenseData.frequency,
          dayOfPayment: expenseData.dayOfPayment,
          startDate: expenseData.startDate,
          color: expenseData.color,
          icon: expenseData.icon,
          createdBy: user.id,
          lastModifiedBy: user.id,
        },
      }));

    // Derive from the persisted template's own schedule so dates always align
    // with what the service will materialize (even when re-seeding).
    const occurrences = computeDueDates(expense, horizonStart, horizonEnd);
    const pastOccurrences = occurrences.filter((date) => date < today);
    const futureOccurrences = occurrences.filter((date) => date >= today);

    const payments: Array<{
      dueDate: Date;
      paidDate?: Date;
      paidAmountCents?: number;
      notes?: string;
    }> = [];
    const usedDueDates = new Set<number>();

    if (expenseData.plan.paid && pastOccurrences.length > 0) {
      const paidDueDate = pastOccurrences[pastOccurrences.length - 1];
      usedDueDates.add(paidDueDate.getTime());
      payments.push({
        dueDate: paidDueDate,
        paidDate: paidDueDate,
        paidAmountCents: expenseData.amountCents,
        notes: 'Pagado',
      });
    }

    if (expenseData.plan.overdue && pastOccurrences.length > 0) {
      const overdueDueDate = [...pastOccurrences]
        .reverse()
        .find((date) => !usedDueDates.has(date.getTime()));
      if (overdueDueDate) {
        usedDueDates.add(overdueDueDate.getTime());
        payments.push({ dueDate: overdueDueDate, notes: 'Vencido' });
      }
    }

    if (expenseData.plan.pending && futureOccurrences.length > 0) {
      const pendingDueDate = futureOccurrences[0];
      usedDueDates.add(pendingDueDate.getTime());
      payments.push({ dueDate: pendingDueDate, notes: 'Pendiente' });
    }

    for (const payment of payments) {
      await prisma.fixedExpensePayment.upsert({
        where: {
          fixedExpenseId_dueDate: {
            fixedExpenseId: expense.id,
            dueDate: payment.dueDate,
          },
        },
        update: {},
        create: {
          fixedExpenseId: expense.id,
          dueDate: payment.dueDate,
          paidDate: payment.paidDate ?? null,
          expectedAmountCents: expenseData.amountCents,
          paidAmountCents: payment.paidAmountCents ?? null,
          currency: expenseData.currency,
          notes: payment.notes ?? null,
          idempotencyKey: crypto.randomUUID(),
          createdBy: user.id,
          lastModifiedBy: user.id,
        },
      });
      fixedExpensePaymentCount++;
    }
  }

  console.log(
    `✓ Created ${fixedExpenses.length} fixed expenses with ${fixedExpensePaymentCount} payments`
  );

  // 6. Demo variable expenses (per-category breakdown + 6-month trend + the
  // "Sin categoría" bucket). These EXPENSE rows land on the COP accounts, so the
  // cached balances must be reconciled again afterwards to keep
  // `ledger === cache` (Rule 13). `seedVariableExpenses` reconciles them to the
  // current cache; the explicit calls below re-anchor the demo targets.
  console.log('Creating demo variable expenses...');
  await seedVariableExpenses(prisma, user.id, { now });
  console.log('✓ Seeded demo variable expenses');

  await reconcileSeedAccountLedger(efectivo.id, 50000000, 'COP', user.id);
  await reconcileSeedAccountLedger(bancolombia.id, 400000000, 'COP', user.id);
  await reconcileSeedAccountLedger(nubank.id, -9800000, 'COP', user.id);

  // 7. Loans (Módulo de Préstamos — Fase B).
  //
  // 2–3 realistic loans so the module is visible end-to-end: RECEIVABLE and
  // PAYABLE, COP and USD, FRENCH and GERMAN (with an interest-only period).
  // The amortization schedule is produced by the SAME pure engine the service
  // uses (never hardcoded). Everything is idempotent: loans are upserted by a
  // deterministic `idempotencyKey`, installments by UNIQUE(loanId,
  // installmentNumber) and payments by deterministic idempotency keys.
  console.log('Creating loans...');

  const loanStartDate = new Date(now.getFullYear(), now.getMonth() - 3, 10);
  const loanFirstPaymentDate = addMonths(loanStartDate, 1);

  interface SeedLoanDefinition {
    slug: string;
    name: string;
    direction: 'RECEIVABLE' | 'PAYABLE';
    notes: string;
    principalCents: number;
    currency: 'COP' | 'USD';
    interestRateValue: number;
    amortizationType: 'FRENCH' | 'GERMAN';
    termCount: number;
    interestOnlyInstallments?: number;
    paidCount: number;
    accountId: string;
    color: string;
    icon: string;
  }

  const seedLoans: SeedLoanDefinition[] = [
    {
      slug: 'carlos',
      name: 'Préstamo a Carlos',
      direction: 'RECEIVABLE',
      notes: 'Préstamo personal acordado con Carlos',
      principalCents: 300000000, // $3.000.000 COP
      currency: 'COP',
      interestRateValue: 24, // E.A.
      amortizationType: 'FRENCH',
      termCount: 12,
      paidCount: 3,
      accountId: bancolombia.id,
      color: '#0EA5E9',
      icon: 'hand-coins',
    },
    {
      slug: 'bancolombia-credito',
      name: 'Crédito Bancolombia',
      direction: 'PAYABLE',
      notes: 'Crédito personal con Bancolombia',
      principalCents: 500000000, // $5.000.000 COP
      currency: 'COP',
      interestRateValue: 18, // E.A.
      amortizationType: 'FRENCH',
      termCount: 24,
      paidCount: 2,
      accountId: bancolombia.id,
      color: '#F59E0B',
      icon: 'landmark',
    },
    {
      slug: 'ana-usd',
      name: 'Préstamo a Ana',
      direction: 'RECEIVABLE',
      notes: 'Préstamo en dólares a Ana (1 cuota solo interés)',
      principalCents: 100000, // USD 1.000
      currency: 'USD',
      interestRateValue: 12, // E.A.
      amortizationType: 'GERMAN',
      termCount: 6,
      interestOnlyInstallments: 1,
      paidCount: 2,
      accountId: binance.id,
      color: '#8B5CF6',
      icon: 'hand-coins',
    },
  ];

  let seededLoanCount = 0;
  let seededInstallmentCount = 0;
  let seededPaymentCount = 0;

  for (const definition of seedLoans) {
    const schedule = buildAmortizationSchedule({
      principalCents: definition.principalCents,
      rateType: 'EA',
      interestRateValue: definition.interestRateValue,
      interestMode: 'COMPOUND',
      interestAccrual: 'PERIODIC',
      dayCountBasis: 'ACTUAL_365',
      amortizationType: definition.amortizationType,
      paymentFrequency: 'MONTHLY',
      termCount: definition.termCount,
      interestOnlyInstallments: definition.interestOnlyInstallments ?? 0,
      startDate: loanStartDate,
      firstPaymentDate: loanFirstPaymentDate,
    });
    const summary = computeLoanSummary(schedule, definition.principalCents);
    const loanKey = `seed-loan-${definition.slug}`;

    const loan = await prisma.loan.upsert({
      where: { idempotencyKey: loanKey },
      update: { lastModifiedBy: user.id },
      create: {
        userId: user.id,
        name: definition.name,
        type: 'PERSONAL',
        direction: definition.direction,
        status: 'ACTIVE',
        notes: definition.notes,
        principalCents: definition.principalCents,
        currency: definition.currency,
        interestRateValue: new Decimal(definition.interestRateValue),
        rateType: 'EA',
        interestMode: 'COMPOUND',
        interestAccrual: 'PERIODIC',
        dayCountBasis: 'ACTUAL_365',
        amortizationType: definition.amortizationType,
        paymentFrequency: 'MONTHLY',
        termCount: definition.termCount,
        interestOnlyInstallments: definition.interestOnlyInstallments ?? 0,
        totalInterestCents: summary.totalInterestCents,
        totalPayableCents: summary.totalPayableCents,
        effectiveYieldPct: new Decimal(summary.effectiveYieldPct),
        startDate: loanStartDate,
        firstPaymentDate: loanFirstPaymentDate,
        balanceCents: definition.principalCents,
        color: definition.color,
        icon: definition.icon,
        idempotencyKey: loanKey,
        createdBy: user.id,
        lastModifiedBy: user.id,
      },
    });
    seededLoanCount++;

    const paymentAccount = await prisma.account.findFirst({
      where: {
        id: definition.accountId,
        userId: user.id,
        isActive: true,
        currency: definition.currency,
      },
      select: { id: true },
    });

    const isReceivable = definition.direction === 'RECEIVABLE';
    let paidPrincipalTotal = 0;

    for (const row of schedule) {
      const installment = await prisma.loanInstallment.upsert({
        where: {
          loanId_installmentNumber: {
            loanId: loan.id,
            installmentNumber: row.installmentNumber,
          },
        },
        update: {},
        create: {
          loanId: loan.id,
          installmentNumber: row.installmentNumber,
          dueDate: row.dueDate,
          principalCents: row.principalCents,
          interestCents: row.interestCents,
          totalCents: row.totalCents,
          balanceCents: row.balanceCents,
          currency: definition.currency,
          isCustomTotal: row.isCustomTotal,
          isInterestOnly: row.isInterestOnly,
          status: 'PENDING',
          source: 'SCHEDULE',
          idempotencyKey: `${loanKey}-inst-${row.installmentNumber}`,
          createdBy: user.id,
          lastModifiedBy: user.id,
        },
      });
      seededInstallmentCount++;

      if (row.installmentNumber > definition.paidCount) continue;

      const paymentKey = `${loanKey}-pay-${row.installmentNumber}`;
      const signedAmount = isReceivable ? row.totalCents : -row.totalCents;

      let transactionId: string | null = null;
      if (paymentAccount) {
        const transaction = await prisma.transaction.upsert({
          where: { idempotencyKey: `${paymentKey}-tx` },
          update: { amountCents: BigInt(signedAmount) },
          create: {
            idempotencyKey: `${paymentKey}-tx`,
            userId: user.id,
            accountId: paymentAccount.id,
            type: isReceivable ? 'LOAN_RECEIPT' : 'LOAN_PAYMENT',
            amountCents: signedAmount,
            currency: definition.currency,
            description: `${isReceivable ? 'Recibo' : 'Pago'} cuota ${row.installmentNumber}: ${definition.name}`,
            date: row.dueDate,
            loanInstallmentId: installment.id,
            createdBy: user.id,
            lastModifiedBy: user.id,
          },
        });
        transactionId = transaction.id;

        await prisma.account.update({
          where: { id: paymentAccount.id },
          data: { balanceCents: { increment: signedAmount }, lastModifiedBy: user.id },
        });
      }

      const existingPayment = await prisma.loanInstallmentPayment.findUnique({
        where: { idempotencyKey: paymentKey },
      });
      if (!existingPayment) {
        await prisma.loanInstallmentPayment.create({
          data: {
            installmentId: installment.id,
            transactionId,
            amountCents: row.totalCents,
            principalCents: row.principalCents,
            interestCents: row.interestCents,
            currency: definition.currency,
            paidAt: row.dueDate,
            notes: 'Pagado (seed)',
            idempotencyKey: paymentKey,
            createdBy: user.id,
            lastModifiedBy: user.id,
          },
        });
        seededPaymentCount++;
      }

      await prisma.loanInstallment.update({
        where: { id: installment.id },
        data: {
          status: 'PAID',
          paidDate: row.dueDate,
          paidAmountCents: row.totalCents,
          paidPrincipalCents: row.principalCents,
          paidInterestCents: row.interestCents,
          lastModifiedBy: user.id,
        },
      });

      paidPrincipalTotal += row.principalCents;
    }

    // Cache the outstanding balance (principal − paid principal). Adjustments
    // are intentionally not seeded here, so the ledger formula simplifies.
    await prisma.loan.update({
      where: { id: loan.id },
      data: {
        balanceCents: definition.principalCents - paidPrincipalTotal,
        lastReconciled: new Date(),
      },
    });

    console.log(
      `  ✓ ${definition.name} (${definition.direction} ${definition.currency}) — ${schedule.length} cuotas, ${definition.paidCount} pagadas`
    );
  }

  console.log(
    `✓ Created/verified ${seededLoanCount} loans with ${seededInstallmentCount} installments and ${seededPaymentCount} payments`
  );

  // Loan payments/receipts changed the ledger of the accounts they touched.
  // Re-reconcile so `Account.balanceCents` (cache) still equals the ledger
  // (Rule 13): the deterministic opening transaction absorbs the difference.
  await reconcileSeedAccountLedger(efectivo.id, 50000000, 'COP', user.id);
  await reconcileSeedAccountLedger(bancolombia.id, 400000000, 'COP', user.id);
  await reconcileSeedAccountLedger(nubank.id, -9800000, 'COP', user.id);
  await reconcileSeedAccountLedger(binance.id, 2699, 'USD', user.id);

  console.log('✅ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
