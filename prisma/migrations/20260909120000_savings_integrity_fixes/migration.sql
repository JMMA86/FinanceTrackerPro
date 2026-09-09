-- Savings Integrity Fixes (M6)
-- 1. SavingsGoal: extended audit fields (Rule 14 — ipAddress/userAgent)
-- 2. SavingsContribution.goal FK: ON DELETE CASCADE -> ON DELETE RESTRICT so a
--    goal with historical contributions can NEVER be physically deleted
--    (soft deletes only — Rule 6).
-- 3. DB-level CHECK constraints on the money columns of SavingsGoal /
--    SavingsContribution (Rule 13 defense in depth).

-- AlterTable: extended audit on SavingsGoal
ALTER TABLE "SavingsGoal" ADD COLUMN "ipAddress" TEXT,
ADD COLUMN "userAgent" TEXT;

-- AlterForeignKey: contributions must restrict goal deletion
ALTER TABLE "SavingsContribution" DROP CONSTRAINT "SavingsContribution_goalId_fkey";
ALTER TABLE "SavingsContribution" ADD CONSTRAINT "SavingsContribution_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "SavingsGoal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Check constraints (columns are BIGINT after 20260905194010 bigint migration)
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_currentAmountCents_nonnegative" CHECK ("currentAmountCents" >= 0);
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_targetAmountCents_positive" CHECK ("targetAmountCents" > 0);
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_monthlyContributionCents_positive" CHECK ("monthlyContributionCents" IS NULL OR "monthlyContributionCents" > 0);
ALTER TABLE "SavingsContribution" ADD CONSTRAINT "SavingsContribution_amountCents_positive" CHECK ("amountCents" > 0);
