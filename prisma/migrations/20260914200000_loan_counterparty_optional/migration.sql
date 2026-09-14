-- Make the loan counterparty optional.
--
-- A loan can be recorded without naming the debtor/creditor (e.g. an anonymous
-- personal loan or a quick entry). The existing column was NOT NULL; this drops
-- the constraint so the backend can persist SQL NULL.
--
-- Produced with `prisma migrate diff --from-config-datasource
-- --to-schema=src/lib/db/schema.prisma --script`.

-- AlterTable
ALTER TABLE "Loan" ALTER COLUMN "counterpartyName" DROP NOT NULL;
