-- Variable expense definitions (monitored variable expenses)
--
-- A "variable expense" is now a user-defined monitored bucket ("Fútbol",
-- "Salidas Novia", ...). Transactions are linked to it on registration and the
-- module aggregates count/amount per definition, month over month.
--
-- 1. New table VariableExpense (owned by User).
-- 2. Transaction.variableExpenseId FK (ON DELETE SET NULL, so removing a
--    definition never deletes historical ledger rows).
-- 3. Support index for the per-definition aggregation.
-- 4. DB-level CHECKs on the monitoring targets (Rule 9 defense in depth).
--
-- NOTE: money columns are BIGINT (see 20260905194010_migrate_money_fields_to_bigint).

-- CreateTable
CREATE TABLE "VariableExpense" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "expectedTimesPerMonth" INTEGER,
    "expectedAmountCents" BIGINT,
    "currency" "Currency" NOT NULL DEFAULT 'COP',
    "idempotencyKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "VariableExpense_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "variableExpenseId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "VariableExpense_idempotencyKey_key" ON "VariableExpense"("idempotencyKey");

-- CreateIndex
CREATE INDEX "VariableExpense_userId_idx" ON "VariableExpense"("userId");

-- CreateIndex
CREATE INDEX "VariableExpense_isActive_idx" ON "VariableExpense"("isActive");

-- CreateIndex
CREATE INDEX "Transaction_variableExpenseId_idx" ON "Transaction"("variableExpenseId");

-- AddForeignKey
ALTER TABLE "VariableExpense" ADD CONSTRAINT "VariableExpense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_variableExpenseId_fkey" FOREIGN KEY ("variableExpenseId") REFERENCES "VariableExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraints (Prisma does not emit these; added manually per Rule 9)
ALTER TABLE "VariableExpense" ADD CONSTRAINT "VariableExpense_expectedTimesPerMonth_positive" CHECK ("expectedTimesPerMonth" IS NULL OR "expectedTimesPerMonth" > 0);
ALTER TABLE "VariableExpense" ADD CONSTRAINT "VariableExpense_expectedAmountCents_positive" CHECK ("expectedAmountCents" IS NULL OR "expectedAmountCents" > 0);
