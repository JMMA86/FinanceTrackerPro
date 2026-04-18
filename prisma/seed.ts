/**
 * Prisma Seed Script
 * Generates test data for FinanceTrackerPro
 *
 * Run: npx tsx prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Create test user
  console.log('Creating test user...');
  const user = await prisma.user.upsert({
    where: { email: 'demo@financetracker.com' },
    update: {},
    create: {
      email: 'demo@financetracker.com',
      name: 'Juan Manuel Demo',
      passwordHash: '$2a$10$demoHashForTestingPurposes', // Not a real hash
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

  const binance = await prisma.account.create({
    data: {
      userId: user.id,
      name: 'Binance (Inversión)',
      type: 'INVESTMENT',
      currency: 'USD',
      balanceCents: 150000, // $1,500 USD
      interestRateEA: new Decimal('8.2'), // 8.2% E.A.
      createdBy: user.id,
    },
  });

  console.log(`✓ Created 4 accounts`);

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

  // Credit payment
  transactions.push(
    await prisma.transaction.create({
      data: {
        idempotencyKey: crypto.randomUUID(),
        userId: user.id,
        accountId: bancolombia.id,
        type: 'CREDIT_PAYMENT',
        amountCents: -5000000, // -$50,000 COP
        currency: 'COP',
        description: 'Pago tarjeta NuBank',
        date: new Date('2026-01-26'),
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
          accountId: Math.random() > 0.5 ? efectivo.id : nubank.id,
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

  // Update account balances (reconciliation)
  console.log('Updating account balances...');
  await prisma.account.update({
    where: { id: efectivo.id },
    data: { balanceCents: 50000000, lastReconciled: new Date() },
  });
  await prisma.account.update({
    where: { id: bancolombia.id },
    data: { balanceCents: 250000000, lastReconciled: new Date() },
  });
  await prisma.account.update({
    where: { id: nubank.id },
    data: { balanceCents: -15000000, lastReconciled: new Date() },
  });
  await prisma.account.update({
    where: { id: binance.id },
    data: { balanceCents: 150000, lastReconciled: new Date() },
  });

  console.log('✓ Account balances updated');
  console.log('✅ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
