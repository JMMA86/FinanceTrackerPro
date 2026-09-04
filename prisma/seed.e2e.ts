/**
 * E2E Test Seed Script
 * Creates test data in the isolated E2E database (financetracker-postgres-e2e)
 *
 * Run via: npm run db:seed:e2e
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as argon2 from 'argon2';

// Load environment variables from .env.e2e
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
const envResult = dotenv.config({ path: '.env.e2e' });
if (!envResult.error) {
  dotenvExpand.expand(envResult);
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required. Set it or use .env.e2e file.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const sharedPassword = process.env.E2E_TEST_PASSWORD || 'E2ePassword123';

async function upsertUserAndGet(email: string, name: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✓ ${name} already exists: ${email}`);
    return existing;
  }
  const passwordHash = await argon2.hash(sharedPassword, {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 1,
    parallelism: 1,
  });
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      baseCurrency: 'COP',
      language: 'SPANISH',
      theme: 'SYSTEM',
      baseSalaryCents: 500000000,
    },
  });
  console.log(`✓ ${name} created: ${email}`);
  return user;
}

async function main() {
  console.log('🌱 Starting E2E seed...');

  // Three isolated users — one per feature file — so parallel workers never share account state.
  await upsertUserAndGet(
    process.env.E2E_TEST_USER || 'e2e@financetrackerpro.com',
    'E2E Test User' // auth.feature
  );
  await upsertUserAndGet(
    process.env.E2E_ACCOUNTS_USER || 'accounts@e2e.financetrackerpro.com',
    'Accounts E2E User' // accounts.feature
  );
  await upsertUserAndGet(
    process.env.E2E_DASHBOARD_USER || 'dashboard@e2e.financetrackerpro.com',
    'Dashboard E2E User' // dashboard.feature
  );

  // Investments E2E user with pre-seeded COP bank account for deposit tests
  const invUserEmail = process.env.E2E_INVESTMENTS_USER || 'investments@e2e.financetrackerpro.com';
  const invUser = await upsertUserAndGet(invUserEmail, 'Investments E2E User');

  // Create a COP bank account for the investment user (needed for deposits)
  const invBankAccount = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-inv-bank-account' },
    create: {
      idempotencyKey: 'e2e-inv-bank-account',
      userId: invUser.id,
      name: 'Cuenta Bancaria COP',
      type: 'CHECKING',
      currency: 'COP',
      balanceCents: 100000000, // $1,000,000 COP
      createdBy: invUser.id,
      lastModifiedBy: invUser.id,
      isActive: true,
    },
    update: {},
  });

  // Create an initial INCOME transaction for true balance reconciliation
  const invInitialTxExists = await prisma.transaction.findFirst({
    where: { idempotencyKey: 'e2e-inv-bank-initial' },
  });
  if (!invInitialTxExists) {
    await prisma.transaction.create({
      data: {
        idempotencyKey: 'e2e-inv-bank-initial',
        userId: invUser.id,
        accountId: invBankAccount.id,
        type: 'INCOME',
        amountCents: 100000000,
        currency: 'COP',
        description: 'Saldo inicial cuenta bancaria COP',
        date: new Date('2026-01-01'),
        createdBy: invUser.id,
        lastModifiedBy: invUser.id,
        isActive: true,
      },
    });
  }

  console.log('✓ Investments user seeded with COP bank account and initial transaction');

  // Transactions E2E user with pre-seeded accounts and transactions
  const txUserEmail = process.env.E2E_TRANSACTIONS_USER || 'transactions@e2e.financetrackerpro.com';
  const txUser = await upsertUserAndGet(txUserEmail, 'Transactions E2E User');

  // Create accounts for transactions user
  const cashAccount = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-tx-cash-account' },
    create: {
      idempotencyKey: 'e2e-tx-cash-account',
      userId: txUser.id,
      name: 'Efectivo',
      type: 'CASH',
      currency: 'COP',
      balanceCents: 50000000, // $500,000 COP
      createdBy: txUser.id,
      lastModifiedBy: txUser.id,
      isActive: true,
    },
    update: {},
  });

  const savingsAccount = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-tx-savings-account' },
    create: {
      idempotencyKey: 'e2e-tx-savings-account',
      userId: txUser.id,
      name: 'Bancolombia Ahorros',
      type: 'SAVINGS',
      currency: 'COP',
      balanceCents: 150000000, // $1,500,000 COP
      createdBy: txUser.id,
      lastModifiedBy: txUser.id,
      isActive: true,
    },
    update: {},
  });

  // Create 20 transactions for pagination tests (10 income + 10 expense)
  const now = new Date();
  for (let i = 0; i < 10; i++) {
    await prisma.transaction.create({
      data: {
        idempotencyKey: `e2e-tx-income-${i}`,
        userId: txUser.id,
        accountId: i % 2 === 0 ? cashAccount.id : savingsAccount.id,
        type: 'INCOME',
        amountCents: 500000 + i * 100000, // 500,000 to 1,400,000
        currency: 'COP',
        description: `Ingreso de nómina ${i + 1}`,
        date: new Date(now.getTime() - i * 86400000),
        createdBy: txUser.id,
        lastModifiedBy: txUser.id,
        isActive: true,
      },
    });

    await prisma.transaction.create({
      data: {
        idempotencyKey: `e2e-tx-expense-${i}`,
        userId: txUser.id,
        accountId: i % 2 === 0 ? cashAccount.id : savingsAccount.id,
        type: 'EXPENSE',
        amountCents: -(200000 + i * 50000), // -200,000 to -650,000
        currency: 'COP',
        description: `Gasto de supermercado ${i + 1}`,
        date: new Date(now.getTime() - i * 86400000),
        createdBy: txUser.id,
        lastModifiedBy: txUser.id,
        isActive: true,
      },
    });
  }

  console.log('✓ Transactions user seeded with 2 accounts and 20 transactions');

  // ============================================================================
  // Savings E2E user with pre-seeded bank account for goals
  // ============================================================================
  const savingsUserEmail = process.env.E2E_SAVINGS_USER || 'savings@e2e.financetrackerpro.com';
  const savingsUser = await upsertUserAndGet(savingsUserEmail, 'Savings E2E User');

  // Create a CHECKING bank account for savings user (source account for contributions)
  const savingsBankAccount = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-savings-bank-account' },
    create: {
      idempotencyKey: 'e2e-savings-bank-account',
      userId: savingsUser.id,
      name: 'Cuenta Corriente',
      type: 'CHECKING',
      currency: 'COP',
      balanceCents: 10000000, // $100,000 COP
      createdBy: savingsUser.id,
      lastModifiedBy: savingsUser.id,
      isActive: true,
    },
    update: {},
  });

  // Create initial income transaction for true balance reconciliation
  const savingsInitialTxExists = await prisma.transaction.findFirst({
    where: { idempotencyKey: 'e2e-savings-bank-initial' },
  });
  if (!savingsInitialTxExists) {
    await prisma.transaction.create({
      data: {
        idempotencyKey: 'e2e-savings-bank-initial',
        userId: savingsUser.id,
        accountId: savingsBankAccount.id,
        type: 'INCOME',
        amountCents: 10000000,
        currency: 'COP',
        description: 'Saldo inicial cuenta corriente',
        date: new Date('2026-01-01'),
        createdBy: savingsUser.id,
        lastModifiedBy: savingsUser.id,
        isActive: true,
      },
    });
  }

  // Create a SAVINGS account linked to savings user (for goals)
  const savingsUserSavingsAccount = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-savings-account' },
    create: {
      idempotencyKey: 'e2e-savings-account',
      userId: savingsUser.id,
      name: 'Cuenta de Ahorros',
      type: 'SAVINGS',
      currency: 'COP',
      balanceCents: 5000000, // $50,000 COP
      createdBy: savingsUser.id,
      lastModifiedBy: savingsUser.id,
      isActive: true,
    },
    update: {},
  });

  // Pre-seed goals for faster and more reliable E2E tests
  // These are referenced by name in savings.feature scenarios
  await prisma.savingsGoal.upsert({
    where: { idempotencyKey: 'e2e-savings-emergency-goal' },
    create: {
      idempotencyKey: 'e2e-savings-emergency-goal',
      userId: savingsUser.id,
      name: 'Fondo de Emergencia',
      type: 'EMERGENCY',
      targetAmountCents: 2000000,
      currency: 'COP',
      currentAmountCents: 0,
      monthlyContributionCents: 200000,
      linkedAccountId: savingsUserSavingsAccount.id,
      color: 'from-red-500 to-rose-500',
      createdBy: savingsUser.id,
      lastModifiedBy: savingsUser.id,
      isActive: true,
    },
    update: {},
  });

  await prisma.savingsGoal.upsert({
    where: { idempotencyKey: 'e2e-savings-partial-goal' },
    create: {
      idempotencyKey: 'e2e-savings-partial-goal',
      userId: savingsUser.id,
      name: 'Pequeña Meta',
      type: 'SHORT_TERM',
      targetAmountCents: 50000,
      currency: 'COP',
      currentAmountCents: 40000, // 80% complete
      monthlyContributionCents: 10000,
      linkedAccountId: savingsUserSavingsAccount.id,
      color: 'from-amber-500 to-orange-500',
      createdBy: savingsUser.id,
      lastModifiedBy: savingsUser.id,
      isActive: true,
    },
    update: {},
  });

  await prisma.savingsGoal.upsert({
    where: { idempotencyKey: 'e2e-savings-editable-goal' },
    create: {
      idempotencyKey: 'e2e-savings-editable-goal',
      userId: savingsUser.id,
      name: 'Meta Original',
      type: 'CUSTOM',
      targetAmountCents: 100000,
      currency: 'COP',
      currentAmountCents: 0,
      color: 'from-violet-500 to-purple-500',
      createdBy: savingsUser.id,
      lastModifiedBy: savingsUser.id,
      isActive: true,
    },
    update: {},
  });

  await prisma.savingsGoal.upsert({
    where: { idempotencyKey: 'e2e-savings-deletable-goal' },
    create: {
      idempotencyKey: 'e2e-savings-deletable-goal',
      userId: savingsUser.id,
      name: 'Meta Eliminable',
      type: 'SHORT_TERM',
      targetAmountCents: 75000,
      currency: 'COP',
      currentAmountCents: 0,
      color: 'from-blue-500 to-cyan-500',
      createdBy: savingsUser.id,
      lastModifiedBy: savingsUser.id,
      isActive: true,
    },
    update: {},
  });

  // Completed goal for summary tests
  await prisma.savingsGoal.upsert({
    where: { idempotencyKey: 'e2e-savings-completed-goal' },
    create: {
      idempotencyKey: 'e2e-savings-completed-goal',
      userId: savingsUser.id,
      name: 'Meta Completada',
      type: 'CUSTOM',
      targetAmountCents: 100000,
      currency: 'COP',
      currentAmountCents: 100000,
      status: 'COMPLETED',
      color: 'from-emerald-500 to-teal-500',
      createdBy: savingsUser.id,
      lastModifiedBy: savingsUser.id,
      isActive: true,
    },
    update: {},
  });

  console.log('✓ Savings user seeded with bank account, savings account, and 5 goals');

  // ============================================================================
  // Pockets E2E user (transfers.feature @pockets scenarios)
  // Isolated from the transactions user so balance assertions never collide.
  // Accounts (COP):
  //   - "Cuenta Principal" (CHECKING) balanceCents =  700.000  (external)
  //   - "Bolsillo Viajes"  (POCKET)   balanceCents =  200.000  (parent = Cuenta Principal)
  //   - "Bolsillo Mercado" (POCKET)   balanceCents =  100.000  (parent = Cuenta Principal)
  //   - "Cuenta Externa"   (SAVINGS)  balanceCents =  500.000
  // Parent card displays external + pockets = 700.000 + 200.000 + 100.000 = 1.000.000.
  // ============================================================================
  const pocketsUserEmail = process.env.E2E_POCKETS_USER || 'pockets@e2e.financetrackerpro.com';
  const pocketsUser = await upsertUserAndGet(pocketsUserEmail, 'Pockets E2E User');

  const pocketsPrincipal = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-pockets-principal-account' },
    create: {
      idempotencyKey: 'e2e-pockets-principal-account',
      userId: pocketsUser.id,
      name: 'Cuenta Principal',
      type: 'CHECKING',
      currency: 'COP',
      balanceCents: 700000,
      createdBy: pocketsUser.id,
      lastModifiedBy: pocketsUser.id,
      isActive: true,
    },
    update: {},
  });

  const pocketsViajes = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-pockets-viajes-account' },
    create: {
      idempotencyKey: 'e2e-pockets-viajes-account',
      userId: pocketsUser.id,
      name: 'Bolsillo Viajes',
      type: 'POCKET',
      currency: 'COP',
      balanceCents: 200000,
      parentAccountId: pocketsPrincipal.id,
      createdBy: pocketsUser.id,
      lastModifiedBy: pocketsUser.id,
      isActive: true,
    },
    update: {},
  });

  const pocketsMercado = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-pockets-mercado-account' },
    create: {
      idempotencyKey: 'e2e-pockets-mercado-account',
      userId: pocketsUser.id,
      name: 'Bolsillo Mercado',
      type: 'POCKET',
      currency: 'COP',
      balanceCents: 100000,
      parentAccountId: pocketsPrincipal.id,
      createdBy: pocketsUser.id,
      lastModifiedBy: pocketsUser.id,
      isActive: true,
    },
    update: {},
  });

  const pocketsExternal = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-pockets-external-account' },
    create: {
      idempotencyKey: 'e2e-pockets-external-account',
      userId: pocketsUser.id,
      name: 'Cuenta Externa',
      type: 'SAVINGS',
      currency: 'COP',
      balanceCents: 500000,
      createdBy: pocketsUser.id,
      lastModifiedBy: pocketsUser.id,
      isActive: true,
    },
    update: {},
  });

  // Transactions that fund those balances (idempotency-guarded so re-seeding is
  // a no-op). Double-entry transfers use a FIXED transferId to link the pair.
  const pocketsTxs: Array<{
    idempotencyKey: string;
    accountId: string;
    type: 'INCOME' | 'TRANSFER_OUT' | 'TRANSFER_IN';
    amountCents: number;
    description: string;
    transferId?: string;
    transferToAccountId?: string;
    transferFromAccountId?: string;
  }> = [
    {
      idempotencyKey: 'e2e-pockets-principal-opening',
      accountId: pocketsPrincipal.id,
      type: 'INCOME',
      amountCents: 1000000,
      description: 'Apertura Cuenta Principal',
    },
    {
      idempotencyKey: 'e2e-pockets-viajes-out',
      accountId: pocketsPrincipal.id,
      type: 'TRANSFER_OUT',
      amountCents: -200000,
      description: 'Alimentar Bolsillo Viajes',
      transferId: 'e2e-pockets-transfer-viajes',
      transferToAccountId: pocketsViajes.id,
    },
    {
      idempotencyKey: 'e2e-pockets-viajes-in',
      accountId: pocketsViajes.id,
      type: 'TRANSFER_IN',
      amountCents: 200000,
      description: 'Alimentar Bolsillo Viajes',
      transferId: 'e2e-pockets-transfer-viajes',
      transferFromAccountId: pocketsPrincipal.id,
    },
    {
      idempotencyKey: 'e2e-pockets-mercado-out',
      accountId: pocketsPrincipal.id,
      type: 'TRANSFER_OUT',
      amountCents: -100000,
      description: 'Alimentar Bolsillo Mercado',
      transferId: 'e2e-pockets-transfer-mercado',
      transferToAccountId: pocketsMercado.id,
    },
    {
      idempotencyKey: 'e2e-pockets-mercado-in',
      accountId: pocketsMercado.id,
      type: 'TRANSFER_IN',
      amountCents: 100000,
      description: 'Alimentar Bolsillo Mercado',
      transferId: 'e2e-pockets-transfer-mercado',
      transferFromAccountId: pocketsPrincipal.id,
    },
    {
      idempotencyKey: 'e2e-pockets-external-opening',
      accountId: pocketsExternal.id,
      type: 'INCOME',
      amountCents: 500000,
      description: 'Apertura Cuenta Externa',
    },
  ];

  for (const tx of pocketsTxs) {
    const exists = await prisma.transaction.findFirst({
      where: { idempotencyKey: tx.idempotencyKey },
    });
    if (!exists) {
      await prisma.transaction.create({
        data: {
          idempotencyKey: tx.idempotencyKey,
          userId: pocketsUser.id,
          accountId: tx.accountId,
          type: tx.type,
          amountCents: tx.amountCents,
          currency: 'COP',
          description: tx.description,
          date: new Date('2026-01-15'),
          transferId: tx.transferId,
          transferToAccountId: tx.transferToAccountId,
          transferFromAccountId: tx.transferFromAccountId,
          createdBy: pocketsUser.id,
          lastModifiedBy: pocketsUser.id,
          isActive: true,
        },
      });
    }
  }

  console.log('✓ Pockets user seeded with parent account, 2 pockets, and external account');

  // ============================================================================
  // System categories (shared, userId: null)
  // ============================================================================
  const systemCategories = [
    {
      id: 'e2e-cat-groceries',
      name: 'Mercado',
      type: 'GROCERIES' as const,
      color: '#3B82F6',
      icon: 'shopping-cart',
    },
    {
      id: 'e2e-cat-transportation',
      name: 'Transporte',
      type: 'TRANSPORTATION' as const,
      color: '#EF4444',
      icon: 'bus',
    },
    {
      id: 'e2e-cat-utilities',
      name: 'Servicios',
      type: 'UTILITIES' as const,
      color: '#10B981',
      icon: 'zap',
    },
    {
      id: 'e2e-cat-entertainment',
      name: 'Entretenimiento',
      type: 'ENTERTAINMENT' as const,
      color: '#F59E0B',
      icon: 'film',
    },
    {
      id: 'e2e-cat-healthcare',
      name: 'Salud',
      type: 'HEALTHCARE' as const,
      color: '#8B5CF6',
      icon: 'heart-pulse',
    },
    {
      id: 'e2e-cat-education',
      name: 'Educación',
      type: 'EDUCATION' as const,
      color: '#06B6D4',
      icon: 'graduation-cap',
    },
    {
      id: 'e2e-cat-shopping',
      name: 'Compras',
      type: 'SHOPPING' as const,
      color: '#EC4899',
      icon: 'shopping-bag',
    },
    {
      id: 'e2e-cat-dining',
      name: 'Restaurantes',
      type: 'DINING' as const,
      color: '#F97316',
      icon: 'utensils',
    },
    {
      id: 'e2e-cat-other',
      name: 'Otros',
      type: 'OTHER' as const,
      color: '#64748B',
      icon: 'more-horizontal',
    },
  ];

  for (const cat of systemCategories) {
    await prisma.category.upsert({
      where: { id: cat.id },
      update: {},
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

  console.log('✅ E2E seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ E2E seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
