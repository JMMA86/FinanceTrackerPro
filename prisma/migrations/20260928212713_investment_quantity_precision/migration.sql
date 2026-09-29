-- AlterTable
ALTER TABLE "InvestmentAssetHolding" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(24,12);

-- AlterTable
ALTER TABLE "Transaction" ALTER COLUMN "assetQuantity" SET DATA TYPE DECIMAL(24,12);
