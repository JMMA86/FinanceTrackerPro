-- Variable expenses: composite index for the monitored overview.
--
-- The overview/definitions reads filter by (userId, isActive) on the
-- VariableExpense table, so a composite btree index serves those scans directly
-- alongside the existing single-column indexes.

-- CreateIndex
CREATE INDEX "VariableExpense_userId_isActive_idx" ON "VariableExpense"("userId", "isActive");
