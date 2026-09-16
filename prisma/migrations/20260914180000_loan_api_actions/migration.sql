-- Loan module API rate-limit actions (Fase B).
-- Generated with `prisma migrate diff` (migrate dev requires an interactive TTY).
-- Adds the six loan-related ApiAction values used by the new Server Actions.

-- AlterEnum
ALTER TYPE "ApiAction" ADD VALUE 'LOAN_CREATE';
ALTER TYPE "ApiAction" ADD VALUE 'LOAN_UPDATE';
ALTER TYPE "ApiAction" ADD VALUE 'LOAN_DELETE';
ALTER TYPE "ApiAction" ADD VALUE 'LOAN_PAYMENT';
ALTER TYPE "ApiAction" ADD VALUE 'LOAN_RECEIVE';
ALTER TYPE "ApiAction" ADD VALUE 'LOAN_ADJUSTMENT';
