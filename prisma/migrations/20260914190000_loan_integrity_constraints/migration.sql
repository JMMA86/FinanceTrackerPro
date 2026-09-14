-- Loan integrity constraints (audit-finance corrections).
--
-- 1. Re-add the index on Transaction.loanInstallmentId. The previous unique
--    constraint was dropped (N payments can share one installment) without a
--    replacement index, leaving every installment payment lookup unindexed.
-- 2. DB-level CHECK constraints on the loan money/term columns (Rule 9 & 13,
--    defense in depth). They mirror the ledger invariants enforced in
--    src/services/loan.service.ts:
--      - Loan.principalCents is the immutable original principal (>= 0).
--      - Loan.balanceCents never goes negative.
--      - LoanInstallmentPayment splits add up exactly to the applied amount.
--    Existing data was verified against each predicate before this migration
--    (0 violating rows).
--
-- Produced with `prisma migrate diff --from-config-datasource
-- --to-schema=src/lib/db/schema.prisma --script` plus the manual CHECK
-- constraints (Prisma does not model CHECK constraints).

-- CreateIndex
CREATE INDEX "Transaction_loanInstallmentId_idx" ON "Transaction"("loanInstallmentId");

-- CheckConstraints: Loan
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_principalCents_nonnegative" CHECK ("principalCents" >= 0);
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_balanceCents_nonnegative" CHECK ("balanceCents" >= 0);
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_totalInterestCents_nonnegative" CHECK ("totalInterestCents" >= 0);
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_totalPayableCents_nonnegative" CHECK ("totalPayableCents" >= 0);
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_termMonths_positive" CHECK ("termMonths" > 0);
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_interestOnlyInstallments_nonnegative" CHECK ("interestOnlyInstallments" >= 0);

-- CheckConstraints: LoanInstallment
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_principalCents_nonnegative" CHECK ("principalCents" >= 0);
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_interestCents_nonnegative" CHECK ("interestCents" >= 0);
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_totalCents_nonnegative" CHECK ("totalCents" >= 0);
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_balanceCents_nonnegative" CHECK ("balanceCents" >= 0);
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_installmentNumber_positive" CHECK ("installmentNumber" > 0);
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_paidPrincipalCents_nonnegative" CHECK ("paidPrincipalCents" >= 0);
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_paidInterestCents_nonnegative" CHECK ("paidInterestCents" >= 0);

-- CheckConstraints: LoanInstallmentPayment
ALTER TABLE "LoanInstallmentPayment" ADD CONSTRAINT "LoanInstallmentPayment_amountCents_positive" CHECK ("amountCents" > 0);
ALTER TABLE "LoanInstallmentPayment" ADD CONSTRAINT "LoanInstallmentPayment_principalCents_nonnegative" CHECK ("principalCents" >= 0);
ALTER TABLE "LoanInstallmentPayment" ADD CONSTRAINT "LoanInstallmentPayment_interestCents_nonnegative" CHECK ("interestCents" >= 0);
ALTER TABLE "LoanInstallmentPayment" ADD CONSTRAINT "LoanInstallmentPayment_split_matches_amount" CHECK ("principalCents" + "interestCents" = "amountCents");

-- CheckConstraints: LoanAdjustment
ALTER TABLE "LoanAdjustment" ADD CONSTRAINT "LoanAdjustment_amountCents_positive" CHECK ("amountCents" IS NULL OR "amountCents" > 0);
