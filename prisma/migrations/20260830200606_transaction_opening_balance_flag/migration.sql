-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "openingBalance" BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing opening balance transactions
UPDATE "Transaction" SET "openingBalance" = true WHERE "description" IN ('Saldo inicial', 'Initial balance');
