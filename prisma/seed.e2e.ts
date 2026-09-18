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
import { buildAmortizationSchedule, computeLoanSummary } from '../src/lib/loans/interest';

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

/**
 * Creates (or reuses) an E2E user.
 *
 * `onboardingCompleted` defaults to `true` so every regular fixture user skips
 * the first-run walkthrough. Pass `false` to get a user that starts the
 * onboarding flow (`onboardingCompletedAt: null`, `onboardingStep: 0`).
 */
async function upsertUserAndGet(email: string, name: string, onboardingCompleted = true) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Non-onboarded fixture users must start the walkthrough fresh even on a
    // manual re-seed without a full DB reset. Already-onboarded users keep
    // their state untouched.
    if (!onboardingCompleted && existing.onboardingCompletedAt !== null) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { onboardingCompletedAt: null, onboardingStep: 0 },
      });
      console.log(`✓ ${name} reset to non-onboarded: ${email}`);
    } else {
      console.log(`✓ ${name} already exists: ${email}`);
    }
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
      // Onboarded by default: regular E2E users must never enter the first-run
      // walkthrough. The dedicated onboarding users below pass `false`.
      onboardingCompletedAt: onboardingCompleted ? new Date() : null,
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
  const dashboardUser = await upsertUserAndGet(
    process.env.E2E_DASHBOARD_USER || 'dashboard@e2e.financetrackerpro.com',
    'Dashboard E2E User' // dashboard.feature (seeded non-empty patrimony, see block below)
  );

  // Salary configuration + half-yearly bonus + projection target for the
  // dashboard user (replaces the legacy `User.baseSalaryCents` scalar). `upsert`
  // is keyed by the 1:1 `userId` / deterministic idempotency key so re-seeding
  // without a DB reset stays idempotent.
  const e2eSalaryConfig = await prisma.salaryConfiguration.upsert({
    where: { userId: dashboardUser.id },
    update: {
      amountCents: 500000000, // $5,000,000 COP per payday
      currency: 'COP',
      frequency: 'BIWEEKLY',
      payDays: [15, 30],
      isActive: true,
      deletedAt: null,
      lastModifiedBy: dashboardUser.id,
    },
    create: {
      userId: dashboardUser.id,
      amountCents: 500000000, // $5,000,000 COP per payday
      currency: 'COP',
      frequency: 'BIWEEKLY',
      // Two pay days per month (15th and 30th; the 30th is clamped to the end of
      // short months by the projection engine).
      payDays: [15, 30],
      createdBy: dashboardUser.id,
      lastModifiedBy: dashboardUser.id,
    },
  });

  await prisma.salaryBonus.upsert({
    where: { idempotencyKey: 'e2e-salary-bonus-prima-servicios' },
    update: {
      name: 'Prima de servicios',
      amountCents: 250000000,
      currency: 'COP',
      frequency: 'SEMIANNUAL',
      anchorMonth: 6,
      dayOfMonth: 30,
      isActive: true,
      deletedAt: null,
      lastModifiedBy: dashboardUser.id,
    },
    create: {
      salaryConfigId: e2eSalaryConfig.id,
      name: 'Prima de servicios',
      amountCents: 250000000,
      currency: 'COP',
      frequency: 'SEMIANNUAL',
      anchorMonth: 6,
      dayOfMonth: 30,
      idempotencyKey: 'e2e-salary-bonus-prima-servicios',
      createdBy: dashboardUser.id,
      lastModifiedBy: dashboardUser.id,
    },
  });

  await prisma.projectionSettings.upsert({
    where: { userId: dashboardUser.id },
    update: {
      monthlySavingsTargetCents: 50000000,
      currency: 'COP',
      isActive: true,
      deletedAt: null,
      lastModifiedBy: dashboardUser.id,
    },
    create: {
      userId: dashboardUser.id,
      monthlySavingsTargetCents: 50000000,
      currency: 'COP',
      createdBy: dashboardUser.id,
      lastModifiedBy: dashboardUser.id,
    },
  });

  console.log('✓ Dashboard user seeded with salary configuration, bonus and projection settings');

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

  // Investments VISUAL user — used ONLY by investments.feature (empty state,
  // create-modal, mobile, sidebar). Deliberately has NO investment accounts: the
  // empty-state scenario hard-deletes any leftovers. It must never share the
  // seed user with investments-accounts.feature, because that file creates,
  // deposits to and withdraws from its own investment accounts concurrently.
  await upsertUserAndGet(
    process.env.E2E_INVESTMENTS_VISUAL_USER || 'investments-visual@e2e.financetrackerpro.com',
    'Investments Visual E2E User'
  );
  console.log('✓ Investments visual user seeded (no accounts)');

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
  // Transfers E2E user — dedicated user for transfers.feature (non-pocket
  // scenarios). Mirrors the transactions seed accounts so the transfer modal has
  // a source ("Efectivo") and a destination ("Bancolombia Ahorros") to move
  // money between. Isolated so its TRANSFER_OUT/TRANSFER_IN rows never race with
  // transactions.feature's fixed 20-row pagination assertions in parallel workers.
  // ============================================================================
  const transfersUserEmail =
    process.env.E2E_TRANSFERS_USER || 'transfers@e2e.financetrackerpro.com';
  const transfersUser = await upsertUserAndGet(transfersUserEmail, 'Transfers E2E User');

  const transfersCashAccount = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-transfers-cash-account' },
    create: {
      idempotencyKey: 'e2e-transfers-cash-account',
      userId: transfersUser.id,
      name: 'Efectivo',
      type: 'CASH',
      currency: 'COP',
      balanceCents: 50000000, // $500,000 COP
      createdBy: transfersUser.id,
      lastModifiedBy: transfersUser.id,
      isActive: true,
    },
    update: {},
  });

  const transfersSavingsAccount = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-transfers-savings-account' },
    create: {
      idempotencyKey: 'e2e-transfers-savings-account',
      userId: transfersUser.id,
      name: 'Bancolombia Ahorros',
      type: 'SAVINGS',
      currency: 'COP',
      balanceCents: 150000000, // $1,500,000 COP
      createdBy: transfersUser.id,
      lastModifiedBy: transfersUser.id,
      isActive: true,
    },
    update: {},
  });

  // Opening INCOME transactions so the ledger-backed TRUE balance backs the
  // cached balanceCents. "Efectivo" is intentionally seeded with a SMALL true
  // balance ($25.000) while its cached/displayed balance stays $500.000: the
  // transfer error scenario enters an amount larger than the true balance to
  // assert the Rule 13 "fondos insuficientes" guard (the modal caps the input
  // against the cached balance, but the server validates the true ledger).
  for (const [account, amountCents, key, description] of [
    [transfersCashAccount, 2500000, 'e2e-transfers-cash-initial', 'Saldo inicial Efectivo'],
    [
      transfersSavingsAccount,
      150000000,
      'e2e-transfers-savings-initial',
      'Saldo inicial Bancolombia Ahorros',
    ],
  ] as const) {
    await prisma.transaction.upsert({
      where: { idempotencyKey: key },
      update: {
        openingBalance: true,
        description,
        isActive: true,
        lastModifiedBy: transfersUser.id,
      },
      create: {
        idempotencyKey: key,
        userId: transfersUser.id,
        accountId: account.id,
        type: 'INCOME',
        amountCents,
        currency: 'COP',
        description,
        date: new Date('2026-01-01'),
        openingBalance: true,
        createdBy: transfersUser.id,
        lastModifiedBy: transfersUser.id,
        isActive: true,
      },
    });
  }

  console.log('✓ Transfers user seeded with 2 accounts');

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

  // Rule 13 backing: "Pequeña Meta" caches 40.000 cents but reconcileGoalBalances
  // recomputes currentAmountCents from ACTIVE contributions on the first read.
  // Without a real contribution the 80% progress would be auto-zeroed. Seed one
  // backing contribution (~30 days ago) so the goal stays deterministic for the
  // edit-below-target validation scenario.
  await prisma.savingsContribution.upsert({
    where: { idempotencyKey: 'e2e-savings-partial-goal-contribution' },
    create: {
      idempotencyKey: 'e2e-savings-partial-goal-contribution',
      goalId: (
        await prisma.savingsGoal.findUniqueOrThrow({
          where: { idempotencyKey: 'e2e-savings-partial-goal' },
          select: { id: true },
        })
      ).id,
      amountCents: 40000,
      currency: 'COP',
      date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // ~30 days ago
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

  // Rule 13: COMPLETED goals are reconciled from the ledger on the first read
  // (reconcileGoalBalances), so a completed goal without real backing
  // contributions would be auto-zeroed. Seed one real contribution that
  // supports the completed goal's currentAmountCents.
  await prisma.savingsContribution.upsert({
    where: { idempotencyKey: 'e2e-savings-completed-goal-contribution' },
    create: {
      idempotencyKey: 'e2e-savings-completed-goal-contribution',
      goalId: (
        await prisma.savingsGoal.findUniqueOrThrow({
          where: { idempotencyKey: 'e2e-savings-completed-goal' },
          select: { id: true },
        })
      ).id,
      amountCents: 100000,
      currency: 'COP',
      date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // ~30 days ago
      createdBy: savingsUser.id,
      lastModifiedBy: savingsUser.id,
      isActive: true,
    },
    update: {},
  });

  console.log('✓ Savings user seeded with bank account, savings account, and 5 goals');

  // ============================================================================
  // Empty savings E2E user (savings.feature @empty)
  // Isolated from the savings user so the empty-state scenario NEVER couples to
  // another feature's user (the old test reused the auth user). This user has
  // NO goals and NO accounts — the savings page must render the empty state.
  // ============================================================================
  const emptySavingsUserEmail =
    process.env.E2E_SAVINGS_EMPTY_USER || 'savings-empty@e2e.financetrackerpro.com';
  await upsertUserAndGet(emptySavingsUserEmail, 'Empty Savings E2E User');

  console.log('✓ Empty savings user seeded with no goals');

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
  // Credit cards E2E user (credit-cards.feature)
  // Isolated so consumption/payment scenarios never collide with other features.
  //
  // Bank accounts (funding source for card payments + transfer pair):
  //   - "Cuenta Corriente" (CHECKING, COP) balanceCents = 200.000.000 ($2.000.000)
  //   - "Cuenta de Ahorros" (SAVINGS, COP) balanceCents = 100.000.000 ($1.000.000)
  // Credit cards (deterministic debt / available credit = limit - debt):
  //   - "Visa E2E"       (VISA,       COP) debt = 150.000   limit = 1.000.000  cutoff 5  due 20
  //   - "Mastercard E2E" (MASTERCARD, COP) debt = 0         limit =   800.000  cutoff 10 due 25
  //
  // IMPORTANT: scenarios in credit-cards.feature NEVER mutate these seed cards —
  // consumption/payment/delete scenarios create their own cards through the UI
  // with unique timestamp names, so the seed assertions stay deterministic for
  // the whole run.
  // ============================================================================
  const cardsUserEmail = process.env.E2E_CARDS_USER || 'cards@e2e.financetrackerpro.com';
  const cardsUser = await upsertUserAndGet(cardsUserEmail, 'Credit Cards E2E User');

  const cardsCorriente = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-cards-corriente-account' },
    create: {
      idempotencyKey: 'e2e-cards-corriente-account',
      userId: cardsUser.id,
      name: 'Cuenta Corriente',
      type: 'CHECKING',
      currency: 'COP',
      balanceCents: 200000000,
      createdBy: cardsUser.id,
      lastModifiedBy: cardsUser.id,
      isActive: true,
    },
    update: {},
  });

  const cardsAhorros = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-cards-ahorros-account' },
    create: {
      idempotencyKey: 'e2e-cards-ahorros-account',
      userId: cardsUser.id,
      name: 'Cuenta de Ahorros',
      type: 'SAVINGS',
      currency: 'COP',
      balanceCents: 100000000,
      createdBy: cardsUser.id,
      lastModifiedBy: cardsUser.id,
      isActive: true,
    },
    update: {},
  });

  const visaCard = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-cards-visa-account' },
    create: {
      idempotencyKey: 'e2e-cards-visa-account',
      userId: cardsUser.id,
      name: 'Visa E2E',
      type: 'CREDIT_CARD',
      currency: 'COP',
      balanceCents: -150000,
      creditLimitCents: 1000000,
      cutoffDay: 5,
      paymentDueDay: 20,
      cardNetwork: 'VISA',
      createdBy: cardsUser.id,
      lastModifiedBy: cardsUser.id,
      isActive: true,
    },
    update: {},
  });

  await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-cards-mastercard-account' },
    create: {
      idempotencyKey: 'e2e-cards-mastercard-account',
      userId: cardsUser.id,
      name: 'Mastercard E2E',
      type: 'CREDIT_CARD',
      currency: 'COP',
      balanceCents: 0,
      creditLimitCents: 800000,
      cutoffDay: 10,
      paymentDueDay: 25,
      cardNetwork: 'MASTERCARD',
      createdBy: cardsUser.id,
      lastModifiedBy: cardsUser.id,
      isActive: true,
    },
    update: {},
  });

  // Transactions that fund/reconcile the seeded balances (Rule 13). Idempotency-
  // guarded so re-seeding is a no-op.
  const cardsTxs: Array<{
    idempotencyKey: string;
    accountId: string;
    type: 'INCOME' | 'EXPENSE';
    amountCents: number;
    description: string;
  }> = [
    {
      idempotencyKey: 'e2e-cards-corriente-opening',
      accountId: cardsCorriente.id,
      type: 'INCOME',
      amountCents: 200000000,
      description: 'Saldo inicial Cuenta Corriente',
    },
    {
      idempotencyKey: 'e2e-cards-ahorros-opening',
      accountId: cardsAhorros.id,
      type: 'INCOME',
      amountCents: 100000000,
      description: 'Saldo inicial Cuenta de Ahorros',
    },
    {
      idempotencyKey: 'e2e-cards-visa-initial',
      accountId: visaCard.id,
      type: 'EXPENSE',
      amountCents: -150000,
      description: 'Consumo inicial Visa E2E',
    },
  ];

  for (const tx of cardsTxs) {
    const exists = await prisma.transaction.findFirst({
      where: { idempotencyKey: tx.idempotencyKey },
    });
    if (!exists) {
      await prisma.transaction.create({
        data: {
          idempotencyKey: tx.idempotencyKey,
          userId: cardsUser.id,
          accountId: tx.accountId,
          type: tx.type,
          amountCents: tx.amountCents,
          currency: 'COP',
          description: tx.description,
          date: new Date('2026-01-15'),
          createdBy: cardsUser.id,
          lastModifiedBy: cardsUser.id,
          isActive: true,
        },
      });
    }
  }

  console.log(
    '✓ Credit cards user seeded with 2 bank accounts, Visa E2E (debt), and Mastercard E2E (no debt)'
  );

  // ============================================================================
  // Fixed expenses E2E user (fixed-expenses.feature)
  // Isolated so recurring-expense scenarios never collide with other features.
  //   - CHECKING/COP account with a funded ledger (Rule 13) to pay from.
  //   - Templates with a paid, a pending and an overdue payment.
  // ============================================================================
  const fixedExpensesUserEmail =
    process.env.E2E_FIXED_EXPENSES_USER || 'fixed-expenses@e2e.financetrackerpro.com';
  const fixedExpensesUser = await upsertUserAndGet(
    fixedExpensesUserEmail,
    'Fixed Expenses E2E User'
  );

  const fixedExpensesAccount = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-fixed-expenses-bank-account' },
    create: {
      idempotencyKey: 'e2e-fixed-expenses-bank-account',
      userId: fixedExpensesUser.id,
      name: 'Cuenta Corriente',
      type: 'CHECKING',
      currency: 'COP',
      balanceCents: 50000000, // $500,000 COP
      createdBy: fixedExpensesUser.id,
      lastModifiedBy: fixedExpensesUser.id,
      isActive: true,
    },
    update: {},
  });

  // Rule 13: the CHECKING balance MUST be backed by the ledger, otherwise paying
  // a fixed expense from it fails the getTrueBalanceFromTx funds check. Upsert
  // the deterministic opening transaction so seed re-runs stay idempotent.
  await prisma.transaction.upsert({
    where: { idempotencyKey: 'e2e-fixed-expenses-bank-initial' },
    update: {
      openingBalance: true,
      description: 'Saldo inicial',
      isActive: true,
      lastModifiedBy: fixedExpensesUser.id,
    },
    create: {
      idempotencyKey: 'e2e-fixed-expenses-bank-initial',
      userId: fixedExpensesUser.id,
      accountId: fixedExpensesAccount.id,
      type: 'INCOME',
      amountCents: 50000000,
      currency: 'COP',
      description: 'Saldo inicial',
      date: new Date('2025-01-01'),
      openingBalance: true,
      createdBy: fixedExpensesUser.id,
      lastModifiedBy: fixedExpensesUser.id,
      isActive: true,
    },
  });

  const feNow = new Date();
  const feYear = feNow.getFullYear();
  const feMonth = feNow.getMonth();
  const feLocalMidnight = (y: number, m: number, d: number): Date => new Date(y, m, d, 0, 0, 0, 0);

  interface E2eFixedExpense {
    name: string;
    frequency: 'MONTHLY';
    dayOfPayment: number;
    amountCents: number;
    startDate: Date;
    payments: Array<{ dueDate: Date; paidDate?: Date; paidAmountCents?: number; notes?: string }>;
  }

  // Every template starts on the FIRST day of the CURRENT month so the 3-month
  // overdue lookback in generatePayments() cannot materialize older occurrences.
  // This keeps the calendar window and the "upcoming payments" horizon
  // deterministic while still producing the four statuses the UI supports:
  //   - Arriendo: current-month occurrence (day 5) PAID      -> "Pagado"
  //   - Internet: current-month occurrence (last day) unpaid -> "Pendiente"
  //   - Gimnasio: current-month occurrence (day 1) unpaid     -> "Vencido"
  //   - Netflix:  current-month occurrence (day 1) unpaid     -> paid by the pay
  //               scenario through the card, becoming "Pagado"
  // Day 1 is always <= today within the month; day 31 clamps to the last day of
  // the month and is therefore always >= today -> a stable "Pendiente".
  const feStartOfMonth = feLocalMidnight(feYear, feMonth, 1);
  const feClampedDay = (day: number): Date => {
    const lastDay = new Date(feYear, feMonth + 1, 0).getDate();
    return feLocalMidnight(feYear, feMonth, Math.min(day, lastDay));
  };

  const e2eFixedExpenses: E2eFixedExpense[] = [
    {
      name: 'Arriendo E2E',
      frequency: 'MONTHLY',
      dayOfPayment: 5,
      amountCents: 120000000,
      startDate: feStartOfMonth,
      payments: [
        {
          dueDate: feClampedDay(5),
          paidDate: feClampedDay(5),
          paidAmountCents: 120000000,
          notes: 'Pagado este mes',
        },
      ],
    },
    {
      name: 'Internet E2E',
      frequency: 'MONTHLY',
      dayOfPayment: 31,
      amountCents: 12000000,
      startDate: feStartOfMonth,
      payments: [],
    },
    {
      name: 'Gimnasio E2E',
      frequency: 'MONTHLY',
      dayOfPayment: 1,
      amountCents: 8000000,
      startDate: feStartOfMonth,
      payments: [],
    },
    {
      name: 'Netflix E2E',
      frequency: 'MONTHLY',
      dayOfPayment: 1,
      amountCents: 4500000,
      startDate: feStartOfMonth,
      payments: [],
    },
  ];

  for (const expenseData of e2eFixedExpenses) {
    const existing = await prisma.fixedExpense.findFirst({
      where: { userId: fixedExpensesUser.id, name: expenseData.name, isActive: true },
    });

    const expense =
      existing ??
      (await prisma.fixedExpense.create({
        data: {
          userId: fixedExpensesUser.id,
          name: expenseData.name,
          description: `Gasto fijo E2E: ${expenseData.name}`,
          amountCents: expenseData.amountCents,
          currency: 'COP',
          frequency: expenseData.frequency,
          dayOfPayment: expenseData.dayOfPayment,
          startDate: expenseData.startDate,
          color: '#3B82F6',
          icon: 'receipt',
          createdBy: fixedExpensesUser.id,
          lastModifiedBy: fixedExpensesUser.id,
        },
      }));

    for (const payment of expenseData.payments) {
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
          currency: 'COP',
          notes: payment.notes ?? null,
          createdBy: fixedExpensesUser.id,
          lastModifiedBy: fixedExpensesUser.id,
        },
      });
    }
  }

  console.log('✓ Fixed expenses user seeded with COP account and templates (paid/pending/overdue)');

  // Empty fixed-expenses user (fixed-expenses.feature @empty) — has NO fixed
  // expenses so the page renders the empty state. Isolated from every other
  // user so the empty-state scenario never couples to seeded data.
  const fixedExpensesEmptyUserEmail =
    process.env.E2E_FIXED_EXPENSES_EMPTY_USER || 'fixed-expenses-empty@e2e.financetrackerpro.com';
  await upsertUserAndGet(fixedExpensesEmptyUserEmail, 'Empty Fixed Expenses E2E User');
  console.log('✓ Empty fixed expenses user seeded with no expenses');

  // ============================================================================
  // System categories (shared, userId: null)
  // ============================================================================
  const systemCategories = [
    {
      id: 'ce2egroceries000000000000000',
      name: 'Mercado',
      type: 'GROCERIES' as const,
      color: '#3B82F6',
      icon: 'shopping-cart',
    },
    {
      id: 'ce2etransportation00000000000',
      name: 'Transporte',
      type: 'TRANSPORTATION' as const,
      color: '#EF4444',
      icon: 'bus',
    },
    {
      id: 'ce2eutilities000000000000000',
      name: 'Servicios',
      type: 'UTILITIES' as const,
      color: '#10B981',
      icon: 'zap',
    },
    {
      id: 'ce2eentertainment0000000000',
      name: 'Entretenimiento',
      type: 'ENTERTAINMENT' as const,
      color: '#F59E0B',
      icon: 'film',
    },
    {
      id: 'ce2ehealthcare00000000000000',
      name: 'Salud',
      type: 'HEALTHCARE' as const,
      color: '#8B5CF6',
      icon: 'heart-pulse',
    },
    {
      id: 'ce2eeducation000000000000000',
      name: 'Educación',
      type: 'EDUCATION' as const,
      color: '#06B6D4',
      icon: 'graduation-cap',
    },
    {
      id: 'ce2eshopping000000000000000',
      name: 'Compras',
      type: 'SHOPPING' as const,
      color: '#EC4899',
      icon: 'shopping-bag',
    },
    {
      id: 'ce2edining00000000000000000',
      name: 'Restaurantes',
      type: 'DINING' as const,
      color: '#F97316',
      icon: 'utensils',
    },
    {
      id: 'ce2eother000000000000000000',
      name: 'Otros',
      type: 'OTHER' as const,
      color: '#64748B',
      icon: 'more-horizontal',
    },
    // System-only income categories (SALARY / BONUS) — never creatable from the UI.
    {
      id: 'ce2esalary00000000000000000',
      name: 'Sueldo',
      type: 'SALARY' as const,
      color: '#0EA5E9',
      icon: 'banknote',
    },
    {
      id: 'ce2ebonus000000000000000000',
      name: 'Prima/Bono',
      type: 'BONUS' as const,
      color: '#8B5CF6',
      icon: 'gift',
    },
  ];

  // Migrate legacy system category rows that used non-CUID ids (e2e-cat-*) before
  // the strict CUID validation was enforced on Transaction.categoryId. Re-point
  // any transactions that reference them and remove the old rows.
  for (const cat of systemCategories) {
    const legacyId = `e2e-cat-${cat.type.toLowerCase()}`;
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

  // ============================================================================
  // Variable expenses E2E user (variable-expenses.feature)
  // Isolated so monitored-definition scenarios never collide with other features.
  //   - CHECKING/COP account with a ledger-backed opening balance so a UI
  //     "Registrar gasto" (a real EXPENSE) passes the funds check (Rule 13).
  //   - 4 monitored definitions with deterministic idempotency keys, a system
  //     category and monthly targets (Café / Fútbol / Salidas Novia / Mercado).
  //   - EXPENSE transactions for the last 6 months (current month included)
  //     linked to each definition and keeping the definition's categoryId.
  //   - 2 fixed-expense templates so the transaction form's Fijo nature is
  //     testable: one with a PENDING current-month occurrence (read-only amount)
  //     and one whose current-month occurrence is PAID (offer "advance").
  //
  // IMPORTANT: this block runs AFTER the system categories are seeded because
  // `VariableExpense.categoryId` is a FK to `Category`.
  // ============================================================================
  const variableExpensesUserEmail =
    process.env.E2E_VARIABLE_EXPENSES_USER || 'variable-expenses@e2e.financetrackerpro.com';
  const variableExpensesUser = await upsertUserAndGet(
    variableExpensesUserEmail,
    'Variable Expenses E2E User'
  );

  const VARIABLE_OPENING_CENTS = 500000000; // $5.000.000 COP

  const variableAccount = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-variable-expenses-bank-account' },
    create: {
      idempotencyKey: 'e2e-variable-expenses-bank-account',
      userId: variableExpensesUser.id,
      name: 'Cuenta Corriente',
      type: 'CHECKING',
      currency: 'COP',
      balanceCents: VARIABLE_OPENING_CENTS,
      createdBy: variableExpensesUser.id,
      lastModifiedBy: variableExpensesUser.id,
      isActive: true,
    },
    update: {},
  });

  // Rule 13: the cached balance must be backed by the ledger. The opening row is
  // deterministic and idempotent; the account balance is re-derived below from
  // the exact seeded expense rows so `ledger === cache` after every seed run.
  await prisma.transaction.upsert({
    where: { idempotencyKey: 'e2e-variable-expenses-bank-initial' },
    update: {
      openingBalance: true,
      description: 'Saldo inicial',
      isActive: true,
      deletedAt: null,
      lastModifiedBy: variableExpensesUser.id,
    },
    create: {
      idempotencyKey: 'e2e-variable-expenses-bank-initial',
      userId: variableExpensesUser.id,
      accountId: variableAccount.id,
      type: 'INCOME',
      amountCents: VARIABLE_OPENING_CENTS,
      currency: 'COP',
      description: 'Saldo inicial',
      date: new Date('2025-01-01'),
      openingBalance: true,
      createdBy: variableExpensesUser.id,
      lastModifiedBy: variableExpensesUser.id,
      isActive: true,
    },
  });

  interface E2eVariableDefinition {
    key: string;
    name: string;
    description: string;
    color: string;
    icon: string;
    categoryId: string;
    expectedTimesPerMonth: number;
    expectedAmountCents: number;
    /** Occurrences seeded per month (current month included). */
    perMonth: number;
    transactionDescription: string;
  }

  const e2eVariableDefinitions: E2eVariableDefinition[] = [
    {
      key: 'cafe',
      name: 'Café',
      description: 'Café y tintos',
      color: '#A16207',
      icon: 'coffee',
      categoryId: 'ce2edining00000000000000000',
      expectedTimesPerMonth: 10,
      expectedAmountCents: 800000, // $8.000 COP
      perMonth: 2,
      transactionDescription: 'Café E2E',
    },
    {
      key: 'futbol',
      name: 'Fútbol',
      description: 'Partidos y canchas',
      color: '#22C55E',
      icon: 'dumbbell',
      categoryId: 'ce2eentertainment0000000000',
      expectedTimesPerMonth: 4,
      expectedAmountCents: 4000000, // $40.000 COP
      perMonth: 1,
      transactionDescription: 'Fútbol E2E',
    },
    {
      key: 'salidas-novia',
      name: 'Salidas Novia',
      description: 'Planes con mi novia',
      color: '#F97316',
      icon: 'beer',
      categoryId: 'ce2edining00000000000000000',
      expectedTimesPerMonth: 5,
      expectedAmountCents: 8000000, // $80.000 COP
      perMonth: 1,
      transactionDescription: 'Salida novia E2E',
    },
    {
      key: 'mercado',
      name: 'Mercado',
      description: 'Mercado del hogar',
      color: '#3B82F6',
      icon: 'shoppingBag',
      categoryId: 'ce2egroceries000000000000000',
      expectedTimesPerMonth: 4,
      expectedAmountCents: 25000000, // $250.000 COP
      perMonth: 1,
      transactionDescription: 'Mercado E2E',
    },
  ];

  const variableDefinitionIds = new Map<string, string>();
  for (const definition of e2eVariableDefinitions) {
    const idempotencyKey = `e2e-variable-def-${definition.key}`;
    const row = await prisma.variableExpense.upsert({
      where: { idempotencyKey },
      update: {
        name: definition.name,
        description: definition.description,
        color: definition.color,
        icon: definition.icon,
        categoryId: definition.categoryId,
        expectedTimesPerMonth: definition.expectedTimesPerMonth,
        expectedAmountCents: BigInt(definition.expectedAmountCents),
        currency: 'COP',
        isActive: true,
        deletedAt: null,
        lastModifiedBy: variableExpensesUser.id,
      },
      create: {
        idempotencyKey,
        userId: variableExpensesUser.id,
        name: definition.name,
        description: definition.description,
        color: definition.color,
        icon: definition.icon,
        categoryId: definition.categoryId,
        expectedTimesPerMonth: definition.expectedTimesPerMonth,
        expectedAmountCents: BigInt(definition.expectedAmountCents),
        currency: 'COP',
        createdBy: variableExpensesUser.id,
        lastModifiedBy: variableExpensesUser.id,
      },
      select: { id: true },
    });
    variableDefinitionIds.set(definition.key, row.id);
  }

  const variableNow = new Date();
  let variableExpensesTotalCents = 0;
  // Last 6 months (current month included), oldest first.
  for (let offset = 5; offset >= 0; offset -= 1) {
    const monthDate = new Date(variableNow.getFullYear(), variableNow.getMonth() - offset, 1);
    const isCurrentMonth = offset === 0;
    // Keep current-month rows on/before today so the month stats never include a
    // future date (day 3 is always <= "today" on the 3rd or later; day 1 otherwise).
    const day = isCurrentMonth ? Math.min(3, variableNow.getDate()) : 10;
    for (const definition of e2eVariableDefinitions) {
      const definitionId = variableDefinitionIds.get(definition.key);
      if (!definitionId) continue;
      for (let index = 0; index < definition.perMonth; index += 1) {
        const amountCents = definition.expectedAmountCents;
        variableExpensesTotalCents += amountCents;
        const idempotencyKey = `e2e-var-tx-${definition.key}-${monthDate.getFullYear()}-${
          monthDate.getMonth() + 1
        }-${index}`;
        const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day, 12, 0, 0);
        await prisma.transaction.upsert({
          where: { idempotencyKey },
          update: {
            accountId: variableAccount.id,
            type: 'EXPENSE',
            amountCents: BigInt(-amountCents),
            currency: 'COP',
            description: definition.transactionDescription,
            date,
            categoryId: definition.categoryId,
            variableExpenseId: definitionId,
            isActive: true,
            deletedAt: null,
            lastModifiedBy: variableExpensesUser.id,
          },
          create: {
            idempotencyKey,
            userId: variableExpensesUser.id,
            accountId: variableAccount.id,
            type: 'EXPENSE',
            amountCents: BigInt(-amountCents),
            currency: 'COP',
            description: definition.transactionDescription,
            date,
            categoryId: definition.categoryId,
            variableExpenseId: definitionId,
            createdBy: variableExpensesUser.id,
            lastModifiedBy: variableExpensesUser.id,
          },
        });
      }
    }
  }

  // Rule 13: ledger === cache. The account balance absorbs the exact seeded
  // expense total on top of the opening balance.
  await prisma.account.update({
    where: { id: variableAccount.id },
    data: {
      balanceCents: BigInt(VARIABLE_OPENING_CENTS - variableExpensesTotalCents),
      lastModifiedBy: variableExpensesUser.id,
    },
  });

  // Fixed-expense templates for the transaction form's Fijo nature.
  const varFeStartOfMonth = feLocalMidnight(feYear, feMonth, 1);
  const varFeClampedDay = (day: number): Date => {
    const lastDay = new Date(feYear, feMonth + 1, 0).getDate();
    return feLocalMidnight(feYear, feMonth, Math.min(day, lastDay));
  };

  const pendingFixedName = 'Fijo Pendiente E2E';
  const existingPendingFixed = await prisma.fixedExpense.findFirst({
    where: { userId: variableExpensesUser.id, name: pendingFixedName, isActive: true },
  });
  if (!existingPendingFixed) {
    await prisma.fixedExpense.create({
      data: {
        userId: variableExpensesUser.id,
        name: pendingFixedName,
        description: 'Plantilla para el selector Fijo (ocurrencia pendiente)',
        amountCents: 12000000, // $120.000 COP
        currency: 'COP',
        frequency: 'MONTHLY',
        dayOfPayment: 31, // clamped to the last day → always >= today = Pendiente
        startDate: varFeStartOfMonth,
        color: '#3B82F6',
        icon: 'receipt',
        createdBy: variableExpensesUser.id,
        lastModifiedBy: variableExpensesUser.id,
      },
    });
  }

  const paidFixedName = 'Fijo Pagado E2E';
  const paidFixed =
    (await prisma.fixedExpense.findFirst({
      where: { userId: variableExpensesUser.id, name: paidFixedName, isActive: true },
    })) ??
    (await prisma.fixedExpense.create({
      data: {
        userId: variableExpensesUser.id,
        name: paidFixedName,
        description: 'Plantilla para el selector Fijo (ocurrencia pagada)',
        amountCents: 120000000, // $1.200.000 COP
        currency: 'COP',
        frequency: 'MONTHLY',
        dayOfPayment: 1,
        startDate: varFeStartOfMonth,
        color: '#8B5CF6',
        icon: 'receipt',
        createdBy: variableExpensesUser.id,
        lastModifiedBy: variableExpensesUser.id,
      },
    }));

  // Mark the current-month occurrence of "Fijo Pagado E2E" as PAID so the create
  // modal resolves no pending current-month payment and offers "advance next
  // month" instead. The next-month occurrence is materialized by generatePayments.
  await prisma.fixedExpensePayment.upsert({
    where: {
      fixedExpenseId_dueDate: {
        fixedExpenseId: paidFixed.id,
        dueDate: varFeClampedDay(1),
      },
    },
    update: {
      paidDate: varFeClampedDay(1),
      paidAmountCents: 120000000,
      expectedAmountCents: 120000000,
      currency: 'COP',
      notes: 'Pagado este mes',
      isActive: true,
      deletedAt: null,
      lastModifiedBy: variableExpensesUser.id,
    },
    create: {
      fixedExpenseId: paidFixed.id,
      dueDate: varFeClampedDay(1),
      paidDate: varFeClampedDay(1),
      expectedAmountCents: 120000000,
      paidAmountCents: 120000000,
      currency: 'COP',
      notes: 'Pagado este mes',
      createdBy: variableExpensesUser.id,
      lastModifiedBy: variableExpensesUser.id,
    },
  });

  console.log(
    '✓ Variable expenses user seeded with COP account, 4 monitored definitions, 6 months of expenses and 2 fixed templates'
  );

  // Empty variable-expenses user (variable-expenses.feature @empty) — has NO
  // definitions (and no accounts) so the page renders the empty state. Isolated
  // from every other user so the empty-state scenario never couples to seed data.
  const variableExpensesEmptyUserEmail =
    process.env.E2E_VARIABLE_EXPENSES_EMPTY_USER ||
    'variable-expenses-empty@e2e.financetrackerpro.com';
  await upsertUserAndGet(variableExpensesEmptyUserEmail, 'Empty Variable Expenses E2E User');
  console.log('✓ Empty variable expenses user seeded with no definitions');

  // ============================================================================
  // Loans E2E user (loans.feature)
  // Isolated so loan list/create/validation scenarios never collide with others.
  //
  // Accounts (COP):
  //   - "Bancolombia (Ahorros)" (SAVINGS) balance = opening + seeded receipts
  //     − seeded payments, always derived from the ledger (Rule 13).
  //   - "Efectivo" (CASH) balance = 50.000 ($50 COP) — deliberately small so the
  //     create-loan modal can prove the "amount exceeds available balance" guard.
  //
  // Seeded loans (read-only, generated with the real amortization engine):
  //   - RECEIVABLE "Préstamo E2E a Diego" (COP, $3.000.000, EA 24%, 12 cuotas,
  //     FRENCH) with installments #1 and #2 PAID (LoanInstallmentPayment +
  //     LOAN_RECEIPT transaction). #2 falls in the current month, so the
  //     transactions modal reports "La cuota de este mes ya fue pagada".
  //   - PAYABLE "Crédito E2E Banco" (COP, $5.000.000, EA 18%, 24 cuotas, FRENCH)
  //     with installment #1 PAID (LoanInstallmentPayment + LOAN_PAYMENT
  //     transaction). #2 is overdue, so the transactions modal reports
  //     "Cuota vencida".
  // ============================================================================
  const loansUserEmail = process.env.E2E_LOANS_USER || 'loans@e2e.financetrackerpro.com';
  const loansUser = await upsertUserAndGet(loansUserEmail, 'Loans E2E User');

  const loansBank = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-loans-bank-account' },
    create: {
      idempotencyKey: 'e2e-loans-bank-account',
      userId: loansUser.id,
      name: 'Bancolombia (Ahorros)',
      type: 'SAVINGS',
      currency: 'COP',
      balanceCents: 200000000, // $2.000.000 COP (recomputed from the ledger below)
      createdBy: loansUser.id,
      lastModifiedBy: loansUser.id,
      isActive: true,
    },
    update: {},
  });

  const loansCash = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-loans-cash-account' },
    create: {
      idempotencyKey: 'e2e-loans-cash-account',
      userId: loansUser.id,
      name: 'Efectivo',
      type: 'CASH',
      currency: 'COP',
      balanceCents: 5000000, // $50.000 COP — small on purpose (balance guard)
      createdBy: loansUser.id,
      lastModifiedBy: loansUser.id,
      isActive: true,
    },
    update: {},
  });

  // Rule 13: every cache is backed by a deterministic opening INCOME row. The
  // exact account balance is rewritten from the ledger aggregate after the loans
  // are seeded, so a manual re-seed stays consistent.
  const loanOpeningTxs: Array<{
    idempotencyKey: string;
    accountId: string;
    amountCents: number;
    description: string;
  }> = [
    {
      idempotencyKey: 'e2e-loans-bank-initial',
      accountId: loansBank.id,
      amountCents: 200000000,
      description: 'Saldo inicial Bancolombia Ahorros',
    },
    {
      idempotencyKey: 'e2e-loans-cash-initial',
      accountId: loansCash.id,
      amountCents: 5000000,
      description: 'Saldo inicial Efectivo',
    },
  ];

  for (const tx of loanOpeningTxs) {
    await prisma.transaction.upsert({
      where: { idempotencyKey: tx.idempotencyKey },
      update: {
        openingBalance: true,
        description: tx.description,
        isActive: true,
        deletedAt: null,
        lastModifiedBy: loansUser.id,
      },
      create: {
        idempotencyKey: tx.idempotencyKey,
        userId: loansUser.id,
        accountId: tx.accountId,
        type: 'INCOME',
        amountCents: tx.amountCents,
        currency: 'COP',
        description: tx.description,
        date: new Date('2025-01-01'),
        openingBalance: true,
        createdBy: loansUser.id,
        lastModifiedBy: loansUser.id,
        isActive: true,
      },
    });
  }

  const loansNow = new Date();
  const loanMonthStart = (offset: number): Date =>
    new Date(loansNow.getFullYear(), loansNow.getMonth() + offset, 1, 0, 0, 0, 0);

  interface SeedLoanSpec {
    idempotencyKey: string;
    name: string;
    direction: 'RECEIVABLE' | 'PAYABLE';
    principalCents: number;
    interestRateValue: number;
    termCount: number;
    startDate: Date;
    firstPaymentDate: Date;
    color: string;
    paidInstallments: number;
  }

  /**
   * Seed one loan with the SAME amortization engine the app uses, marking the
   * first `paidInstallments` rows PAID with their LoanInstallmentPayment bridge
   * and the matching account money movement. Skips entirely when the loan already
   * exists (idempotent manual re-seeds).
   */
  async function seedLoan(
    spec: SeedLoanSpec,
    context: { userId: string; bankAccountId: string }
  ): Promise<void> {
    const { userId, bankAccountId } = context;
    const existing = await prisma.loan.findUnique({
      where: { idempotencyKey: spec.idempotencyKey },
      select: { id: true },
    });
    if (existing) {
      console.log(`✓ Loan already exists: ${spec.name}`);
      return;
    }

    const schedule = buildAmortizationSchedule({
      principalCents: spec.principalCents,
      rateType: 'EA',
      interestRateValue: spec.interestRateValue,
      interestMode: 'COMPOUND',
      interestAccrual: 'PERIODIC',
      dayCountBasis: 'ACTUAL_365',
      amortizationType: 'FRENCH',
      paymentFrequency: 'MONTHLY',
      termCount: spec.termCount,
      startDate: spec.startDate,
      firstPaymentDate: spec.firstPaymentDate,
    });
    const summary = computeLoanSummary(schedule, spec.principalCents);

    let paidPrincipalCents = 0;
    for (const row of schedule) {
      if (row.installmentNumber <= spec.paidInstallments) {
        paidPrincipalCents += row.principalCents;
      }
    }
    const balanceCents = spec.principalCents - paidPrincipalCents;
    const isReceivable = spec.direction === 'RECEIVABLE';

    await prisma.$transaction(async (tx) => {
      const loan = await tx.loan.create({
        data: {
          userId,
          name: spec.name,
          type: 'PERSONAL',
          direction: spec.direction,
          status: 'ACTIVE',
          principalCents: spec.principalCents,
          currency: 'COP',
          interestRateValue: spec.interestRateValue,
          rateType: 'EA',
          interestMode: 'COMPOUND',
          interestAccrual: 'PERIODIC',
          dayCountBasis: 'ACTUAL_365',
          amortizationType: 'FRENCH',
          paymentFrequency: 'MONTHLY',
          termCount: spec.termCount,
          totalInterestCents: summary.totalInterestCents,
          totalPayableCents: summary.totalPayableCents,
          effectiveYieldPct: summary.effectiveYieldPct,
          startDate: spec.startDate,
          firstPaymentDate: spec.firstPaymentDate,
          balanceCents,
          color: spec.color,
          idempotencyKey: spec.idempotencyKey,
          createdBy: userId,
          lastModifiedBy: userId,
        },
      });

      for (const row of schedule) {
        const isPaid = row.installmentNumber <= spec.paidInstallments;
        const installment = await tx.loanInstallment.create({
          data: {
            loanId: loan.id,
            installmentNumber: row.installmentNumber,
            dueDate: row.dueDate,
            principalCents: row.principalCents,
            interestCents: row.interestCents,
            totalCents: row.totalCents,
            balanceCents: row.balanceCents,
            currency: 'COP',
            isCustomTotal: row.isCustomTotal,
            isInterestOnly: row.isInterestOnly,
            status: isPaid ? 'PAID' : 'PENDING',
            source: 'SCHEDULE',
            paidDate: isPaid ? row.dueDate : null,
            paidAmountCents: isPaid ? row.totalCents : null,
            paidPrincipalCents: isPaid ? row.principalCents : 0,
            paidInterestCents: isPaid ? row.interestCents : 0,
            idempotencyKey: `${spec.idempotencyKey}-installment-${row.installmentNumber}`,
            createdBy: userId,
            lastModifiedBy: userId,
          },
        });

        if (!isPaid) continue;

        // RECEIVABLE: the borrower repays us → account inflow (LOAN_RECEIPT).
        // PAYABLE: we repay the lender → account outflow (LOAN_PAYMENT).
        const signedTotalCents = isReceivable ? row.totalCents : -row.totalCents;
        const booking = await tx.transaction.create({
          data: {
            idempotencyKey: `${spec.idempotencyKey}-booking-${row.installmentNumber}`,
            userId,
            accountId: bankAccountId,
            type: isReceivable ? 'LOAN_RECEIPT' : 'LOAN_PAYMENT',
            amountCents: signedTotalCents,
            currency: 'COP',
            description: `${isReceivable ? 'Recibo' : 'Pago'} cuota ${
              row.installmentNumber
            }: ${spec.name}`,
            date: row.dueDate,
            loanInstallmentId: installment.id,
            createdBy: userId,
            lastModifiedBy: userId,
          },
        });

        await tx.loanInstallmentPayment.create({
          data: {
            installmentId: installment.id,
            transactionId: booking.id,
            amountCents: row.totalCents,
            principalCents: row.principalCents,
            interestCents: row.interestCents,
            currency: 'COP',
            paidAt: row.dueDate,
            idempotencyKey: `${spec.idempotencyKey}-payment-${row.installmentNumber}`,
            createdBy: userId,
            lastModifiedBy: userId,
          },
        });
      }
    });

    console.log(`✓ Loan seeded: ${spec.name}`);
  }

  await seedLoan(
    {
      idempotencyKey: 'e2e-loan-receivable-diego',
      name: 'Préstamo E2E a Diego',
      direction: 'RECEIVABLE',
      principalCents: 300000000, // $3.000.000 COP
      interestRateValue: 24,
      termCount: 12,
      startDate: loanMonthStart(-3),
      firstPaymentDate: loanMonthStart(-1), // #2 lands in the current month
      color: 'from-emerald-500 to-teal-500',
      paidInstallments: 2,
    },
    { userId: loansUser.id, bankAccountId: loansBank.id }
  );

  await seedLoan(
    {
      idempotencyKey: 'e2e-loan-payable-banco',
      name: 'Crédito E2E Banco',
      direction: 'PAYABLE',
      principalCents: 500000000, // $5.000.000 COP
      interestRateValue: 18,
      termCount: 24,
      startDate: loanMonthStart(-4),
      firstPaymentDate: loanMonthStart(-2), // #2 is overdue, #3 is this month
      color: 'from-amber-500 to-orange-500',
      paidInstallments: 1,
    },
    { userId: loansUser.id, bankAccountId: loansBank.id }
  );

  // Rule 13: rewrite both caches from the ledger aggregate so re-seeding a
  // partially-populated database converges to ledger === cache.
  for (const account of [loansBank, loansCash]) {
    const aggregate = await prisma.transaction.aggregate({
      where: { accountId: account.id, isActive: true },
      _sum: { amountCents: true },
    });
    await prisma.account.update({
      where: { id: account.id },
      data: {
        balanceCents: aggregate._sum.amountCents ?? 0,
        lastModifiedBy: loansUser.id,
      },
    });
  }

  console.log('✓ Loans user seeded with 2 accounts and 2 amortizing loans');

  // Empty loans user (loans.feature @empty) — has NO loans (and no accounts) so
  // the loans page renders the empty state. Isolated from every other user.
  const loansEmptyUserEmail =
    process.env.E2E_LOANS_EMPTY_USER || 'loans-empty@e2e.financetrackerpro.com';
  await upsertUserAndGet(loansEmptyUserEmail, 'Empty Loans E2E User');
  console.log('✓ Empty loans user seeded with no loans');

  // ============================================================================
  // Dashboard E2E user (dashboard.feature) — non-empty patrimony
  //
  // The redesigned "Distribución Patrimonial" (Option A) only renders the donut
  // and the Activos/Pasivos lists when the user owns assets. To verify it for
  // real, this user is seeded with a deterministic patrimony (all COP, so the
  // composition needs no FX conversion and never shows the unconverted warning):
  //   ASSETS
  //     - "Cuenta Corriente" (CHECKING)  $1.000.000  → slice "Cuenta Corriente"
  //     - "Cuenta de Ahorros" (SAVINGS)  $500.000    → slice "Ahorros"
  //     - "Efectivo" (CASH)              $200.000    → slice "Efectivo"
  //     - RECEIVABLE loan "$3.000.000"                → slice "Cuentas por Cobrar"
  //   LIABILITIES
  //     - "Tarjeta E2E" (CREDIT_CARD, debt $300.000) → "Tarjetas de Crédito"
  //     - PAYABLE loan "$5.000.000" (installment #2 overdue)
  //                                                  → "Préstamos por pagar"
  // The overdue payable installment also drives the LOANS_OVERDUE alert, which
  // exposes an actionable link to /es/loans.
  //
  // Every cached balance is ledger-backed (Rule 13): opening INCOME rows define
  // the asset balances and the card's EXPENSE row defines its debt.
  // A separate `dashboard-empty` user (below) keeps the empty-state scenarios
  // deterministic.
  // ============================================================================
  const dashboardChecking = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-dashboard-checking-account' },
    create: {
      idempotencyKey: 'e2e-dashboard-checking-account',
      userId: dashboardUser.id,
      name: 'Cuenta Corriente',
      type: 'CHECKING',
      currency: 'COP',
      balanceCents: 100000000, // $1.000.000 COP
      createdBy: dashboardUser.id,
      lastModifiedBy: dashboardUser.id,
      isActive: true,
    },
    update: {},
  });

  const dashboardSavings = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-dashboard-savings-account' },
    create: {
      idempotencyKey: 'e2e-dashboard-savings-account',
      userId: dashboardUser.id,
      name: 'Cuenta de Ahorros',
      type: 'SAVINGS',
      currency: 'COP',
      balanceCents: 50000000, // $500.000 COP
      createdBy: dashboardUser.id,
      lastModifiedBy: dashboardUser.id,
      isActive: true,
    },
    update: {},
  });

  const dashboardCash = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-dashboard-cash-account' },
    create: {
      idempotencyKey: 'e2e-dashboard-cash-account',
      userId: dashboardUser.id,
      name: 'Efectivo',
      type: 'CASH',
      currency: 'COP',
      balanceCents: 20000000, // $200.000 COP
      createdBy: dashboardUser.id,
      lastModifiedBy: dashboardUser.id,
      isActive: true,
    },
    update: {},
  });

  const dashboardCard = await prisma.account.upsert({
    where: { idempotencyKey: 'e2e-dashboard-card-account' },
    create: {
      idempotencyKey: 'e2e-dashboard-card-account',
      userId: dashboardUser.id,
      name: 'Tarjeta E2E',
      type: 'CREDIT_CARD',
      currency: 'COP',
      balanceCents: -30000000, // debt $300.000 COP
      creditLimitCents: 300000000, // limit $3.000.000 COP
      cutoffDay: 5,
      paymentDueDay: 20,
      cardNetwork: 'VISA',
      createdBy: dashboardUser.id,
      lastModifiedBy: dashboardUser.id,
      isActive: true,
    },
    update: {},
  });

  // Rule 13: ledger === cache. The opening rows fully define each balance.
  const dashboardOpeningTxs: Array<{
    idempotencyKey: string;
    accountId: string;
    type: 'INCOME' | 'EXPENSE';
    amountCents: number;
    description: string;
  }> = [
    {
      idempotencyKey: 'e2e-dashboard-checking-opening',
      accountId: dashboardChecking.id,
      type: 'INCOME',
      amountCents: 100000000,
      description: 'Saldo inicial Cuenta Corriente',
    },
    {
      idempotencyKey: 'e2e-dashboard-savings-opening',
      accountId: dashboardSavings.id,
      type: 'INCOME',
      amountCents: 50000000,
      description: 'Saldo inicial Cuenta de Ahorros',
    },
    {
      idempotencyKey: 'e2e-dashboard-cash-opening',
      accountId: dashboardCash.id,
      type: 'INCOME',
      amountCents: 20000000,
      description: 'Saldo inicial Efectivo',
    },
    {
      idempotencyKey: 'e2e-dashboard-card-opening',
      accountId: dashboardCard.id,
      type: 'EXPENSE',
      amountCents: -30000000,
      description: 'Consumo inicial Tarjeta E2E',
    },
  ];

  for (const tx of dashboardOpeningTxs) {
    await prisma.transaction.upsert({
      where: { idempotencyKey: tx.idempotencyKey },
      update: {
        accountId: tx.accountId,
        type: tx.type,
        amountCents: tx.amountCents,
        currency: 'COP',
        description: tx.description,
        isActive: true,
        deletedAt: null,
        lastModifiedBy: dashboardUser.id,
      },
      create: {
        idempotencyKey: tx.idempotencyKey,
        userId: dashboardUser.id,
        accountId: tx.accountId,
        type: tx.type,
        amountCents: tx.amountCents,
        currency: 'COP',
        description: tx.description,
        date: new Date('2026-01-15'),
        createdBy: dashboardUser.id,
        lastModifiedBy: dashboardUser.id,
        isActive: true,
      },
    });
  }

  // Loans use the same real amortization engine as the app. The PAYABLE loan
  // keeps installment #2 overdue (paidInstallments: 1, first payment 2 months
  // ago) which surfaces the LOANS_OVERDUE alert on the dashboard. Paid
  // installments book against "Cuenta de Ahorros".
  await seedLoan(
    {
      idempotencyKey: 'e2e-dashboard-loan-receivable',
      name: 'Préstamo E2E por cobrar',
      direction: 'RECEIVABLE',
      principalCents: 300000000, // $3.000.000 COP
      interestRateValue: 20,
      termCount: 12,
      startDate: loanMonthStart(-2),
      firstPaymentDate: loanMonthStart(-1),
      color: 'from-emerald-500 to-teal-500',
      paidInstallments: 0,
    },
    { userId: dashboardUser.id, bankAccountId: dashboardSavings.id }
  );

  await seedLoan(
    {
      idempotencyKey: 'e2e-dashboard-loan-payable',
      name: 'Crédito E2E por pagar',
      direction: 'PAYABLE',
      principalCents: 500000000, // $5.000.000 COP
      interestRateValue: 18,
      termCount: 24,
      startDate: loanMonthStart(-3),
      firstPaymentDate: loanMonthStart(-2), // #2 stays overdue
      color: 'from-amber-500 to-orange-500',
      paidInstallments: 1,
    },
    { userId: dashboardUser.id, bankAccountId: dashboardSavings.id }
  );

  console.log(
    '✓ Dashboard user seeded with 3 asset accounts, 1 card with debt and 2 loans (receivable + payable)'
  );

  // Empty dashboard user (dashboard.feature @empty-state) — has NO accounts,
  // cards, loans or transactions so every KPI renders $0 and the distribution
  // renders its empty state. Isolated so the empty-state scenarios never couple
  // to the seeded dashboard user.
  const dashboardEmptyUserEmail =
    process.env.E2E_DASHBOARD_EMPTY_USER || 'dashboard-empty@e2e.financetrackerpro.com';
  await upsertUserAndGet(dashboardEmptyUserEmail, 'Empty Dashboard E2E User');
  console.log('✓ Empty dashboard user seeded with no accounts');

  // ============================================================================
  // Onboarding E2E users (onboarding.feature)
  // Deliberately NOT onboarded (`onboardingCompletedAt: null`, `onboardingStep: 0`)
  // and with NO accounts, so they enter the first-run walkthrough on next login.
  //
  // Three isolated users so the destructive/terminal scenarios never race:
  //   - onboarding1: redirect + modules (read-only) and "skip"
  //   - onboarding2: welcome + first-account creation (completes via the CTA)
  //   - onboarding3: language switch (i18n) + full walkthrough completion
  // Emails are env-overridable with mandatory defaults (CI defines none).
  // ============================================================================
  await upsertUserAndGet(
    process.env.E2E_ONBOARDING_USER_1 || 'onboarding1@e2e.financetrackerpro.com',
    'Onboarding One E2E User',
    false
  );
  await upsertUserAndGet(
    process.env.E2E_ONBOARDING_USER_2 || 'onboarding2@e2e.financetrackerpro.com',
    'Onboarding Two E2E User',
    false
  );
  await upsertUserAndGet(
    process.env.E2E_ONBOARDING_USER_3 || 'onboarding3@e2e.financetrackerpro.com',
    'Onboarding Three E2E User',
    false
  );
  console.log('✓ Onboarding users seeded (non-onboarded, no accounts)');

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
