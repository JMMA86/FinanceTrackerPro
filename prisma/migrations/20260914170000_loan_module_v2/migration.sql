-- Loan module v2 (Fase A): direction, richer rate/amortization config, payment
-- receipts and loan adjustments.
--
-- This migration was produced with `prisma migrate diff` (migrate dev requires an
-- interactive TTY). It is non-destructive: `Loan.interestRateEA` / `Loan.termMonths`
-- columns are preserved via Prisma @map (interestRateValue / termCount).
--
-- CreateEnum
CREATE TYPE "LoanDirection" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED', 'DEFAULTED');

-- CreateEnum
CREATE TYPE "LoanRateType" AS ENUM ('EA', 'NAMV', 'PERIODIC', 'DAILY');

-- CreateEnum
CREATE TYPE "LoanInterestMode" AS ENUM ('COMPOUND', 'SIMPLE');

-- CreateEnum
CREATE TYPE "LoanDayCountBasis" AS ENUM ('ACTUAL_365', 'ACTUAL_360', 'THIRTY_360');

-- CreateEnum
CREATE TYPE "LoanInterestAccrual" AS ENUM ('PERIODIC', 'DAILY');

-- CreateEnum
CREATE TYPE "LoanAmortizationType" AS ENUM ('FRENCH', 'GERMAN', 'AMERICAN', 'CUSTOM');

-- CreateEnum
CREATE TYPE "LoanPaymentFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "LoanInstallmentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED');

-- CreateEnum
CREATE TYPE "LoanAdjustmentType" AS ENUM ('EXTRA_DISBURSEMENT', 'EXTRA_PAYMENT', 'RATE_CHANGE', 'RESCHEDULE', 'CUSTOM_INSTALLMENT', 'INTEREST_ONLY_PERIOD');

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'LOAN_RECEIPT';

-- DropForeignKey
ALTER TABLE "LoanInstallment" DROP CONSTRAINT "LoanInstallment_loanId_fkey";

-- DropIndex
DROP INDEX "Transaction_loanInstallmentId_key";

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "amortizationType" "LoanAmortizationType" NOT NULL DEFAULT 'FRENCH',
ADD COLUMN     "color" TEXT,
ADD COLUMN     "counterpartyContact" TEXT,
ADD COLUMN     "counterpartyName" TEXT NOT NULL,
ADD COLUMN     "dayCountBasis" "LoanDayCountBasis" NOT NULL DEFAULT 'ACTUAL_365',
ADD COLUMN     "direction" "LoanDirection" NOT NULL,
ADD COLUMN     "effectiveYieldPct" DECIMAL(20,8),
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "installmentAmountCents" BIGINT,
ADD COLUMN     "interestAccrual" "LoanInterestAccrual" NOT NULL DEFAULT 'PERIODIC',
ADD COLUMN     "interestMode" "LoanInterestMode" NOT NULL DEFAULT 'COMPOUND',
ADD COLUMN     "interestOnlyInstallments" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paymentFrequency" "LoanPaymentFrequency" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "rateType" "LoanRateType" NOT NULL DEFAULT 'EA',
ADD COLUMN     "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "totalInterestCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "totalPayableCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "LoanInstallment" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "isCustomTotal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isInterestOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paidInterestCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "paidPrincipalCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "status" "LoanInstallmentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "userAgent" TEXT;

-- CreateTable
CREATE TABLE "LoanInstallmentPayment" (
    "id" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "transactionId" TEXT,
    "amountCents" BIGINT NOT NULL,
    "principalCents" BIGINT NOT NULL,
    "interestCents" BIGINT NOT NULL,
    "currency" "Currency" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "LoanInstallmentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanAdjustment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "type" "LoanAdjustmentType" NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "amountCents" BIGINT,
    "newRateValue" DECIMAL(20,8),
    "newTermCount" INTEGER,
    "installmentNumber" INTEGER,
    "notes" TEXT,
    "transactionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "LoanAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoanInstallmentPayment_transactionId_key" ON "LoanInstallmentPayment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanInstallmentPayment_idempotencyKey_key" ON "LoanInstallmentPayment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LoanInstallmentPayment_installmentId_idx" ON "LoanInstallmentPayment"("installmentId");

-- CreateIndex
CREATE INDEX "LoanInstallmentPayment_transactionId_idx" ON "LoanInstallmentPayment"("transactionId");

-- CreateIndex
CREATE INDEX "LoanInstallmentPayment_paidAt_idx" ON "LoanInstallmentPayment"("paidAt");

-- CreateIndex
CREATE INDEX "LoanInstallmentPayment_isActive_idx" ON "LoanInstallmentPayment"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LoanAdjustment_transactionId_key" ON "LoanAdjustment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanAdjustment_idempotencyKey_key" ON "LoanAdjustment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LoanAdjustment_loanId_idx" ON "LoanAdjustment"("loanId");

-- CreateIndex
CREATE INDEX "LoanAdjustment_effectiveDate_idx" ON "LoanAdjustment"("effectiveDate");

-- CreateIndex
CREATE INDEX "LoanAdjustment_type_idx" ON "LoanAdjustment"("type");

-- CreateIndex
CREATE INDEX "LoanAdjustment_isActive_idx" ON "LoanAdjustment"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_idempotencyKey_key" ON "Loan"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Loan_direction_idx" ON "Loan"("direction");

-- CreateIndex
CREATE INDEX "Loan_status_idx" ON "Loan"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LoanInstallment_idempotencyKey_key" ON "LoanInstallment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LoanInstallment_status_idx" ON "LoanInstallment"("status");

-- AddForeignKey
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanInstallmentPayment" ADD CONSTRAINT "LoanInstallmentPayment_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "LoanInstallment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanInstallmentPayment" ADD CONSTRAINT "LoanInstallmentPayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanAdjustment" ADD CONSTRAINT "LoanAdjustment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanAdjustment" ADD CONSTRAINT "LoanAdjustment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
