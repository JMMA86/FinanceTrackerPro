-- AlterTable
ALTER TABLE "Account" ALTER COLUMN "balanceCents" SET DATA TYPE BIGINT,
ALTER COLUMN "creditLimitCents" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "FixedExpense" ALTER COLUMN "amountCents" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "FixedExpensePayment" ALTER COLUMN "expectedAmountCents" SET DATA TYPE BIGINT,
ALTER COLUMN "paidAmountCents" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "InvestmentAssetHolding" ALTER COLUMN "avgCostCents" SET DATA TYPE BIGINT,
ALTER COLUMN "currentPriceCents" SET DATA TYPE BIGINT,
ALTER COLUMN "originalCostCents" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "Loan" ALTER COLUMN "principalCents" SET DATA TYPE BIGINT,
ALTER COLUMN "balanceCents" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "LoanInstallment" ALTER COLUMN "principalCents" SET DATA TYPE BIGINT,
ALTER COLUMN "interestCents" SET DATA TYPE BIGINT,
ALTER COLUMN "totalCents" SET DATA TYPE BIGINT,
ALTER COLUMN "balanceCents" SET DATA TYPE BIGINT,
ALTER COLUMN "paidAmountCents" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "SavingsContribution" ALTER COLUMN "amountCents" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "SavingsGoal" ALTER COLUMN "targetAmountCents" SET DATA TYPE BIGINT,
ALTER COLUMN "currentAmountCents" SET DATA TYPE BIGINT,
ALTER COLUMN "monthlyContributionCents" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "Transaction" ALTER COLUMN "amountCents" SET DATA TYPE BIGINT,
ALTER COLUMN "originalAmountCents" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "baseSalaryCents" SET DATA TYPE BIGINT;
