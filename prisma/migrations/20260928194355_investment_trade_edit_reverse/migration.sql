-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ApiAction" ADD VALUE 'INVESTMENT_TRADE_UPDATE';
ALTER TYPE "ApiAction" ADD VALUE 'INVESTMENT_TRADE_REVERSE';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "assetPricePerShareCents" BIGINT,
ADD COLUMN     "assetQuantity" DECIMAL(20,8),
ADD COLUMN     "assetSymbol" TEXT,
ADD COLUMN     "assetTradeType" "InvestmentTransactionType";

-- CreateIndex
CREATE INDEX "Transaction_accountId_assetSymbol_idx" ON "Transaction"("accountId", "assetSymbol");
