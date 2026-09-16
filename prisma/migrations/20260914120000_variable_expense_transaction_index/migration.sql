-- Variable expenses: composite index for the per-user, per-month EXPENSE
-- aggregation used by the /variable-expenses read path.
--
-- The variable-expense query filters by (userId, type = 'EXPENSE') and a date
-- range, so a composite (userId, type, date) btree index serves both the monthly
-- summary/transactions reads and the trend range scan without touching the
-- per-column indexes.

-- CreateIndex
CREATE INDEX "Transaction_userId_type_date_idx" ON "Transaction"("userId", "type", "date");
