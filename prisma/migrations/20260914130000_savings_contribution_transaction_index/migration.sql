-- Variable expenses: support index for the anti-join that excludes EXPENSE
-- transactions linked to an active SavingsContribution.
--
-- The variable-expense predicate uses
--   savingsContributions: { none: { isActive, date: {...}, goal: {...} } }
-- so Postgres needs to efficiently probe contributions by transactionId while
-- filtering on isActive. This composite index serves that probe; the existing
-- SavingsContribution indexes cover the other predicates.

-- CreateIndex
CREATE INDEX "SavingsContribution_transactionId_isActive_idx" ON "SavingsContribution"("transactionId", "isActive");
