-- Investment trade integrity constraints (SonarQube/audit follow-up).
--
-- DB-level CHECK constraints on the structured investment trade columns
-- (Rules 2, 11, 13 — defense in depth). Prisma does not model CHECK
-- constraints, so this migration is hand-written following the
-- `*_loan_integrity_constraints` pattern.
--
-- Existing data was verified against both predicates before applying this
-- migration (0 violating rows): `assetQuantity` / `assetPricePerShareCents`
-- are either NULL (non-structured rows) or strictly positive.

-- CheckConstraints: Transaction (investment trade traceability)
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_assetQuantity_positive" CHECK ("assetQuantity" IS NULL OR "assetQuantity" > 0);
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_assetPricePerShareCents_positive" CHECK ("assetPricePerShareCents" IS NULL OR "assetPricePerShareCents" > 0);
