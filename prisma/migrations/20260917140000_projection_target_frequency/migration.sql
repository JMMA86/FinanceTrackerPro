-- Projection savings target: support a MONTHLY or ANNUAL amount, where the value
-- the user typed in their chosen frequency is the AUTHORITATIVE one.
--
-- `targetAmountCents` + `targetFrequency` supersede the monthly-only
-- `monthlySavingsTargetCents`. The projection derives the monthly figure to
-- prorate (ANNUAL ÷ 12, Decimal ROUND_HALF_EVEN) instead of mutating the stored
-- value, so no round-trip precision drift is introduced.
--
-- Apply with: npx prisma migrate deploy   (then npx prisma generate)

-- CreateEnum
CREATE TYPE "ProjectionTargetFrequency" AS ENUM ('MONTHLY', 'ANNUAL');

-- AddColumn: authoritative amount in `targetFrequency` (0 default for safety).
ALTER TABLE "ProjectionSettings" ADD COLUMN "targetAmountCents" BIGINT NOT NULL DEFAULT 0;

-- AddColumn: frequency of the authoritative amount (existing rows are monthly-only).
ALTER TABLE "ProjectionSettings" ADD COLUMN "targetFrequency" "ProjectionTargetFrequency" NOT NULL DEFAULT 'MONTHLY';

-- Data migration: the legacy monthly target becomes the new authoritative amount.
UPDATE "ProjectionSettings" SET "targetAmountCents" = "monthlySavingsTargetCents";

-- DropColumn: superseded by targetAmountCents + targetFrequency.
ALTER TABLE "ProjectionSettings" DROP COLUMN "monthlySavingsTargetCents";
