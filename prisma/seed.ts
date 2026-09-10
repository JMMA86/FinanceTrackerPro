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

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = 'Demo123@';

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
      baseSalaryCents: 500000000, // $5,000,000 COP
      baseCurrency: 'COP',
      language: 'SPANISH',
      theme: 'SYSTEM',
      lastLoginAt: new Date(),
    },
  });
  console.log(`✓ User created: ${user.email}`);

  // 2. Create 4 accounts
  console.log('Creating accounts...');

  // Find-or-create guard for investment demo accounts: re-seeding must never
  // duplicate an existing investment account (matched by name + userId).
  const findOrCreateAccount = async (params: {
    name: string;
    type: 'INVESTMENT';
    currency: 'USD' | 'EUR';
    balanceCents: number;
    interestRateEA?: Decimal;
  }) => {
    const existing = await prisma.account.findFirst({
      where: { userId: user.id, name: params.name, isActive: true },
    });
    if (existing) {
      console.log(`↩ ${params.name} already exists, skipping creation`);
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
        createdBy: user.id,
      },
    });
  };

  const efectivo = await prisma.account.create({
    data: {
      userId: user.id,
      name: 'Efectivo',
      type: 'SAVINGS',
      currency: 'COP',
      balanceCents: 50000000, // $500,000 COP
      createdBy: user.id,
    },
  });

  const bancolombia = await prisma.account.create({
    data: {
      userId: user.id,
      name: 'Bancolombia (Ahorros)',
      type: 'SAVINGS',
      currency: 'COP',
      balanceCents: 250000000, // $2,500,000 COP
      interestRateEA: new Decimal('4.5'), // 4.5% E.A.
      createdBy: user.id,
    },
  });

  const nubank = await prisma.account.create({
    data: {
      userId: user.id,
      name: 'NuBank (Crédito)',
      type: 'CREDIT_CARD',
      currency: 'COP',
      balanceCents: -15000000, // -$150,000 COP (deuda)
      creditLimitCents: 300000000, // $3,000,000 COP
      cutoffDay: 15,
      paymentDueDay: 25,
      createdBy: user.id,
    },
  });

  const binance = await findOrCreateAccount({
    name: 'Binance (Inversión)',
    type: 'INVESTMENT',
    currency: 'USD',
    balanceCents: 2699, // coherent with seeded transactions (computed below)
    interestRateEA: new Decimal('8.2'), // 8.2% E.A.
  });

  // 2b. Additional investment demo accounts (find-or-create by name + userId)
  const portafolioUsa = await findOrCreateAccount({
    name: 'Portafolio USA (USD)',
    type: 'INVESTMENT',
    currency: 'USD',
    balanceCents: 8704, // coherent with seeded transactions (computed below)
    interestRateEA: new Decimal('6.5'), // 6.5% E.A.
  });

  const portafolioEuropa = await findOrCreateAccount({
    name: 'Portafolio Europa (EUR)',
    type: 'INVESTMENT',
    currency: 'EUR',
    balanceCents: 7350, // coherent with seeded transactions (computed below)
    interestRateEA: new Decimal('5.2'), // 5.2% E.A.
  });

  const portafolioGlobal = await findOrCreateAccount({
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

  // Update account balances (reconciliation)
  console.log('Updating account balances...');
  await prisma.account.update({
    where: { id: efectivo.id },
    data: { balanceCents: 50000000, lastReconciled: new Date() },
  });
  await prisma.account.update({
    where: { id: bancolombia.id },
    // Deterministic ledger: Jan salary (+500M) + Feb salary (+500M) − rent
    // (−120M) − Efectivo transfer (−30M) − Binance transfer (−40M) − card
    // payment (−5M) − investment outflows (−405M) = 400M (minus ~0.2M of
    // random expenses seeded above, which are non-deterministic)
    data: { balanceCents: 400000000, lastReconciled: new Date() },
  });
  await prisma.account.update({
    where: { id: nubank.id },
    // Deterministic sum of card transactions: Netflix/Spotify (-45k) + Restaurante
    // (-68k) + Amazon (-20k) + Éxito (-15k) + Pago tarjeta (+50k) = -98k COP
    data: { balanceCents: -9800000, lastReconciled: new Date() },
  });
  await prisma.account.update({
    where: { id: binance.id },
    // Ledger: deposits (14,634 + 11,765 + 10,000) + income (500) − buys
    // (−19,000 −15,200) = 2,699 USD-cents
    data: { balanceCents: 2699, lastReconciled: new Date() },
  });
  await prisma.account.update({
    where: { id: portafolioUsa.id },
    // Ledger: deposits (19,512 + 11,905 + 6,977) + income (1,000) − buys
    // (−7,200 −5,000 −12,600 −7,200) + sell (1,310) = 8,704 USD-cents
    data: { balanceCents: 8704, lastReconciled: new Date() },
  });
  await prisma.account.update({
    where: { id: portafolioEuropa.id },
    // Ledger: deposits (8,511 + 7,609) + income (350) − buys (−8,700 −420)
    // = 7,350 EUR-cents
    data: { balanceCents: 7350, lastReconciled: new Date() },
  });
  await prisma.account.update({
    where: { id: portafolioGlobal.id },
    // Ledger: deposit (13,953) + income (200) − buys (−5,500 −2,240)
    // = 6,413 USD-cents
    data: { balanceCents: 6413, lastReconciled: new Date() },
  });

  console.log('✓ Account balances updated');

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
