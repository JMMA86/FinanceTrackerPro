-- Revert: single monthly savings target
--
-- Reverts `20260917140000_projection_target_frequency`. Prisma Migrate is
-- forward-only, so the previous migration is NOT edited/removed; this migration
-- reverses its effect. The authoritative value is collapsed back to a MONTHLY
-- figure (ANNUAL ÷ 12, ROUND_HALF_EVEN) BEFORE the frequency columns are dropped.
--
-- Apply with: npx prisma migrate deploy   (then npx prisma generate)

-- AddColumn: restore the monthly-only savings target (0 default for safety).
ALTER TABLE "ProjectionSettings" ADD COLUMN "monthlySavingsTargetCents" BIGINT NOT NULL DEFAULT 0;

-- Data migration: collapse the authoritative amount to a monthly figure.
UPDATE "ProjectionSettings"
SET "monthlySavingsTargetCents" = CASE
  WHEN "targetFrequency" = 'ANNUAL' THEN ROUND("targetAmountCents" / 12.0)::bigint
  ELSE "targetAmountCents"
END;

-- DropColumn/DropType: superseded by the single monthly target.
ALTER TABLE "ProjectionSettings" DROP COLUMN "targetAmountCents";
ALTER TABLE "ProjectionSettings" DROP COLUMN "targetFrequency";
DROP TYPE "ProjectionTargetFrequency";
