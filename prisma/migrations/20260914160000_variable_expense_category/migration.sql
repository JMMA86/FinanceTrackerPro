-- Variable expense definitions: configured category
--
-- A definition can configure the Category that its registered transactions
-- inherit. ON DELETE SET NULL so soft/hard removal of a category never deletes
-- the definition nor its history.

-- AlterTable
ALTER TABLE "VariableExpense" ADD COLUMN "categoryId" TEXT;

-- CreateIndex
CREATE INDEX "VariableExpense_categoryId_idx" ON "VariableExpense"("categoryId");

-- AddForeignKey
ALTER TABLE "VariableExpense" ADD CONSTRAINT "VariableExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
