-- Fixed Expenses Integrity (backend module)
-- 1. ApiAction: new FIXED_EXPENSE_PAY value for per-action rate limiting (Rule 10).
-- 2. FixedExpense: optional description/color/icon (UI) + extended audit
--    ipAddress/userAgent (Rule 14).
-- 3. FixedExpensePayment: notes + idempotencyKey (Rule 12) + extended audit,
--    FK switched to ON DELETE RESTRICT (soft delete only, Rules 4/6), and a
--    UNIQUE(fixedExpenseId, dueDate) so payment materialization is idempotent.
-- 4. DB-level CHECK constraints on the money columns (Rule 9 defense in depth).
--
-- NOTE: money columns are BIGINT (see 20260905194010_migrate_money_fields_to_bigint).

-- AlterEnum
ALTER TYPE "ApiAction" ADD VALUE 'FIXED_EXPENSE_PAY';

-- DropForeignKey
ALTER TABLE "FixedExpensePayment" DROP CONSTRAINT "FixedExpensePayment_fixedExpenseId_fkey";

-- AlterTable
ALTER TABLE "FixedExpense" ADD COLUMN     "color" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "FixedExpensePayment" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "FixedExpensePayment_idempotencyKey_key" ON "FixedExpensePayment"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "FixedExpensePayment_fixedExpenseId_dueDate_key" ON "FixedExpensePayment"("fixedExpenseId", "dueDate");

-- AddForeignKey
ALTER TABLE "FixedExpensePayment" ADD CONSTRAINT "FixedExpensePayment_fixedExpenseId_fkey" FOREIGN KEY ("fixedExpenseId") REFERENCES "FixedExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraints (Prisma does not emit these; added manually per Rule 9)
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_amountCents_positive" CHECK ("amountCents" > 0);
ALTER TABLE "FixedExpensePayment" ADD CONSTRAINT "FixedExpensePayment_expectedAmountCents_positive" CHECK ("expectedAmountCents" > 0);
ALTER TABLE "FixedExpensePayment" ADD CONSTRAINT "FixedExpensePayment_paidAmountCents_positive" CHECK ("paidAmountCents" IS NULL OR "paidAmountCents" > 0);
