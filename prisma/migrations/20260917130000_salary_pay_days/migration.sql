-- Salary recurrence: replace the single `nextPayDate` anchor with explicit
-- payment days PER frequency (`payDays`).
--
-- Meaning (Rule 9 integrity enforced by the CHECK constraint below):
--   WEEKLY   -> exactly 1 value 1..7  (ISO weekday: 1=Monday … 7=Sunday)
--   BIWEEKLY -> exactly 2 values 1..31 (days of the month, clamped to end of month)
--   MONTHLY  -> exactly 1 value 1..31 (day of the month, clamped to end of month)
--
-- Apply with: npx prisma migrate deploy   (then npx prisma generate)

-- DropColumn: the single-date anchor is superseded by the per-frequency pay days.
ALTER TABLE "SalaryConfiguration" DROP COLUMN "nextPayDate";

-- AddColumn: integer array of pay days, defaulted to empty for safety.
ALTER TABLE "SalaryConfiguration" ADD COLUMN "payDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

-- Data migration (Rule 9): pre-existing rows keep an EMPTY `payDays`, which would
-- violate the integrity CHECK added below. Backfill a sensible, frequency-correct
-- default so the constraint can be validated against every existing row.
UPDATE "SalaryConfiguration"
SET "payDays" = CASE
    WHEN "frequency" = 'WEEKLY' THEN ARRAY[5]
    WHEN "frequency" = 'BIWEEKLY' THEN ARRAY[15, 30]
    ELSE ARRAY[5]
END
WHERE cardinality("payDays") = 0;

-- Integrity constraint (Rule 9): a configuration can never hold pay days that do
-- not match its frequency, nor out-of-range values.
ALTER TABLE "SalaryConfiguration" ADD CONSTRAINT "SalaryConfiguration_payDays_frequency_check" CHECK (
  ("frequency" = 'WEEKLY'   AND cardinality("payDays") = 1 AND "payDays"[1] BETWEEN 1 AND 7) OR
  ("frequency" = 'MONTHLY'  AND cardinality("payDays") = 1 AND "payDays"[1] BETWEEN 1 AND 31) OR
  ("frequency" = 'BIWEEKLY' AND cardinality("payDays") = 2 AND "payDays"[1] BETWEEN 1 AND 31 AND "payDays"[2] BETWEEN 1 AND 31)
);
