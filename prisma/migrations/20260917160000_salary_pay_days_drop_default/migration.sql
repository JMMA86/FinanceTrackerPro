-- Salary recurrence: drop the misleading `payDays` DEFAULT.
--
-- `20260917130000_salary_pay_days` added `payDays INTEGER[] NOT NULL DEFAULT
-- ARRAY[]::INTEGER[]` and then a CHECK constraint that REQUIRES a frequency-correct
-- non-empty array. The default therefore contradicted the constraint: a write that
-- omitted `payDays` would be rejected by the CHECK anyway, so the default only made
-- the schema look like an empty array was a valid state. The application always
-- sets `payDays` (it is required by `SaveSalaryConfigurationSchema`), so the
-- fallback is removed here.
--
-- This migration is HAND-AUTHORED on purpose: migrations already applied are NOT
-- edited (that would change their checksum); the change is expressed as a new,
-- forward-only migration.
--
-- Apply with: npx prisma migrate deploy   (then npx prisma generate)

ALTER TABLE "SalaryConfiguration" ALTER COLUMN "payDays" DROP DEFAULT;
