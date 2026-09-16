-- Drop the loan counterparty column entirely.
--
-- The loan module no longer models a named counterparty; the loan `name` is the
-- single human-readable label. This removes the column (and its nullable data).
--
-- Produced with `prisma migrate diff --from-config-datasource
-- --to-schema=src/lib/db/schema.prisma --script`.

-- AlterTable
ALTER TABLE "Loan" DROP COLUMN "counterpartyName";
