-- CreateEnum
CREATE TYPE "ApiAction" AS ENUM ('TRANSACTION_CREATE', 'TRANSACTION_DELETE', 'TRANSFER_CREATE', 'TRANSFER_REVERSE', 'INVESTMENT_DEPOSIT', 'INVESTMENT_BUY', 'INVESTMENT_SELL', 'SAVINGS_CONTRIBUTE');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "lastModifiedBy" TEXT,
ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "ApiAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "ApiAction" NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiAttempt_userId_action_createdAt_idx" ON "ApiAttempt"("userId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "ApiAttempt_action_createdAt_idx" ON "ApiAttempt"("action", "createdAt");

-- CreateIndex
CREATE INDEX "Category_userId_isActive_idx" ON "Category"("userId", "isActive");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiAttempt" ADD CONSTRAINT "ApiAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
