-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('COP', 'USD', 'EUR');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('SPANISH', 'ENGLISH', 'GERMAN');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CHECKING', 'CASH', 'SAVINGS', 'POCKET', 'INVESTMENT', 'CREDIT_CARD');

-- CreateEnum
CREATE TYPE "CardNetwork" AS ENUM ('NONE', 'VISA', 'MASTERCARD', 'AMEX');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER_OUT', 'TRANSFER_IN', 'INVESTMENT', 'LOAN_PAYMENT', 'CREDIT_PAYMENT');

-- CreateEnum
CREATE TYPE "FixedExpenseFrequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "VariableExpenseCategory" AS ENUM ('GROCERIES', 'TRANSPORTATION', 'UTILITIES', 'ENTERTAINMENT', 'HEALTHCARE', 'EDUCATION', 'SHOPPING', 'DINING', 'OTHER');

-- CreateEnum
CREATE TYPE "LoanType" AS ENUM ('PERSONAL', 'MORTGAGE', 'AUTO', 'STUDENT', 'BUSINESS');

-- CreateEnum
CREATE TYPE "InvestmentTransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'BUY', 'SELL', 'DIVIDEND');

-- CreateEnum
CREATE TYPE "SavingsGoalType" AS ENUM ('ANNUAL', 'SHORT_TERM', 'EMERGENCY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SavingsGoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "baseSalaryCents" INTEGER,
    "baseCurrency" "Currency" NOT NULL DEFAULT 'COP',
    "language" "Language" NOT NULL DEFAULT 'SPANISH',
    "theme" "Theme" NOT NULL DEFAULT 'SYSTEM',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BiometricCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "deviceName" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiometricCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'COP',
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "lastReconciled" TIMESTAMP(3),
    "interestRateEA" DECIMAL(20,8),
    "creditLimitCents" INTEGER,
    "cutoffDay" INTEGER,
    "paymentDueDay" INTEGER,
    "parentAccountId" TEXT,
    "cardColor" TEXT,
    "cardImageUrl" TEXT,
    "cardNetwork" "CardNetwork" NOT NULL DEFAULT 'NONE',
    "idempotencyKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amountCents" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "originalAmountCents" INTEGER,
    "originalCurrency" "Currency",
    "exchangeRate" DECIMAL(20,8),
    "transferId" TEXT,
    "transferToAccountId" TEXT,
    "transferFromAccountId" TEXT,
    "categoryId" TEXT,
    "fixedExpensePaymentId" TEXT,
    "loanInstallmentId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedExpense" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'COP',
    "frequency" "FixedExpenseFrequency" NOT NULL,
    "dayOfPayment" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,

    CONSTRAINT "FixedExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedExpensePayment" (
    "id" TEXT NOT NULL,
    "fixedExpenseId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidDate" TIMESTAMP(3),
    "expectedAmountCents" INTEGER NOT NULL,
    "paidAmountCents" INTEGER,
    "currency" "Currency" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,

    CONSTRAINT "FixedExpensePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "VariableExpenseCategory" NOT NULL DEFAULT 'OTHER',
    "color" TEXT,
    "icon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LoanType" NOT NULL,
    "principalCents" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'COP',
    "interestRateEA" DECIMAL(20,8) NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "firstPaymentDate" TIMESTAMP(3) NOT NULL,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "lastReconciled" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanInstallment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "principalCents" INTEGER NOT NULL,
    "interestCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "balanceCents" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "paidDate" TIMESTAMP(3),
    "paidAmountCents" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,

    CONSTRAINT "LoanInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentAssetHolding" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(20,8) NOT NULL,
    "avgCostCents" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "currentPriceCents" INTEGER NOT NULL DEFAULT 0,
    "lastPriceUpdate" TIMESTAMP(3),
    "originalCurrency" "Currency",
    "originalCostCents" INTEGER,
    "exchangeRate" DECIMAL(20,8),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,

    CONSTRAINT "InvestmentAssetHolding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "SavingsGoalType" NOT NULL DEFAULT 'CUSTOM',
    "targetAmountCents" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'COP',
    "currentAmountCents" INTEGER NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3),
    "monthlyContributionCents" INTEGER,
    "linkedAccountId" TEXT,
    "status" "SavingsGoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "icon" TEXT,
    "idempotencyKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,

    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsContribution" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceAccountId" TEXT,
    "transactionId" TEXT,
    "notes" TEXT,
    "idempotencyKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "SavingsContribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BiometricCredential_credentialId_key" ON "BiometricCredential"("credentialId");

-- CreateIndex
CREATE INDEX "BiometricCredential_userId_idx" ON "BiometricCredential"("userId");

-- CreateIndex
CREATE INDEX "BiometricCredential_credentialId_idx" ON "BiometricCredential"("credentialId");

-- CreateIndex
CREATE INDEX "BiometricCredential_isActive_idx" ON "BiometricCredential"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Account_idempotencyKey_key" ON "Account"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Account_type_idx" ON "Account"("type");

-- CreateIndex
CREATE INDEX "Account_isActive_idx" ON "Account"("isActive");

-- CreateIndex
CREATE INDEX "Account_parentAccountId_idx" ON "Account"("parentAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_idempotencyKey_key" ON "Transaction"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_fixedExpensePaymentId_key" ON "Transaction"("fixedExpensePaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_loanInstallmentId_key" ON "Transaction"("loanInstallmentId");

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transaction_accountId_idx" ON "Transaction"("accountId");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");

-- CreateIndex
CREATE INDEX "Transaction_isActive_idx" ON "Transaction"("isActive");

-- CreateIndex
CREATE INDEX "Transaction_idempotencyKey_idx" ON "Transaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");

-- CreateIndex
CREATE INDEX "Transaction_transferId_idx" ON "Transaction"("transferId");

-- CreateIndex
CREATE INDEX "FixedExpense_userId_idx" ON "FixedExpense"("userId");

-- CreateIndex
CREATE INDEX "FixedExpense_isActive_idx" ON "FixedExpense"("isActive");

-- CreateIndex
CREATE INDEX "FixedExpense_frequency_idx" ON "FixedExpense"("frequency");

-- CreateIndex
CREATE INDEX "FixedExpensePayment_fixedExpenseId_idx" ON "FixedExpensePayment"("fixedExpenseId");

-- CreateIndex
CREATE INDEX "FixedExpensePayment_dueDate_idx" ON "FixedExpensePayment"("dueDate");

-- CreateIndex
CREATE INDEX "FixedExpensePayment_isActive_idx" ON "FixedExpensePayment"("isActive");

-- CreateIndex
CREATE INDEX "Category_isActive_idx" ON "Category"("isActive");

-- CreateIndex
CREATE INDEX "Category_type_idx" ON "Category"("type");

-- CreateIndex
CREATE INDEX "Loan_userId_idx" ON "Loan"("userId");

-- CreateIndex
CREATE INDEX "Loan_type_idx" ON "Loan"("type");

-- CreateIndex
CREATE INDEX "Loan_isActive_idx" ON "Loan"("isActive");

-- CreateIndex
CREATE INDEX "LoanInstallment_loanId_idx" ON "LoanInstallment"("loanId");

-- CreateIndex
CREATE INDEX "LoanInstallment_dueDate_idx" ON "LoanInstallment"("dueDate");

-- CreateIndex
CREATE INDEX "LoanInstallment_isActive_idx" ON "LoanInstallment"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LoanInstallment_loanId_installmentNumber_key" ON "LoanInstallment"("loanId", "installmentNumber");

-- CreateIndex
CREATE INDEX "InvestmentAssetHolding_accountId_idx" ON "InvestmentAssetHolding"("accountId");

-- CreateIndex
CREATE INDEX "InvestmentAssetHolding_symbol_idx" ON "InvestmentAssetHolding"("symbol");

-- CreateIndex
CREATE INDEX "InvestmentAssetHolding_isActive_idx" ON "InvestmentAssetHolding"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentAssetHolding_accountId_symbol_key" ON "InvestmentAssetHolding"("accountId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "SavingsGoal_idempotencyKey_key" ON "SavingsGoal"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SavingsGoal_userId_idx" ON "SavingsGoal"("userId");

-- CreateIndex
CREATE INDEX "SavingsGoal_status_idx" ON "SavingsGoal"("status");

-- CreateIndex
CREATE INDEX "SavingsGoal_isActive_idx" ON "SavingsGoal"("isActive");

-- CreateIndex
CREATE INDEX "SavingsGoal_deadline_idx" ON "SavingsGoal"("deadline");

-- CreateIndex
CREATE UNIQUE INDEX "SavingsContribution_idempotencyKey_key" ON "SavingsContribution"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SavingsContribution_goalId_idx" ON "SavingsContribution"("goalId");

-- CreateIndex
CREATE INDEX "SavingsContribution_date_idx" ON "SavingsContribution"("date");

-- CreateIndex
CREATE INDEX "SavingsContribution_isActive_idx" ON "SavingsContribution"("isActive");

-- AddForeignKey
ALTER TABLE "BiometricCredential" ADD CONSTRAINT "BiometricCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentAccountId_fkey" FOREIGN KEY ("parentAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fixedExpensePaymentId_fkey" FOREIGN KEY ("fixedExpensePaymentId") REFERENCES "FixedExpensePayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_loanInstallmentId_fkey" FOREIGN KEY ("loanInstallmentId") REFERENCES "LoanInstallment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedExpensePayment" ADD CONSTRAINT "FixedExpensePayment_fixedExpenseId_fkey" FOREIGN KEY ("fixedExpenseId") REFERENCES "FixedExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentAssetHolding" ADD CONSTRAINT "InvestmentAssetHolding_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_linkedAccountId_fkey" FOREIGN KEY ("linkedAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsContribution" ADD CONSTRAINT "SavingsContribution_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "SavingsGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsContribution" ADD CONSTRAINT "SavingsContribution_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsContribution" ADD CONSTRAINT "SavingsContribution_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
