-- Onboarding tracking for first-run walkthrough
ALTER TABLE "User" ADD COLUMN "onboardingStep" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

-- Backfill: users created before this feature are considered already onboarded,
-- so only brand-new accounts go through the first-run walkthrough.
UPDATE "User" SET "onboardingCompletedAt" = NOW() WHERE "onboardingCompletedAt" IS NULL;
