-- Salary configuration + end-of-period projection.
--
-- Hand-authored because the development database was not reachable
-- (`localhost:5432` refused the connection, P1001) and `prisma migrate dev`
-- therefore could not run. This file is the exact diff Prisma would generate for
-- the schema plus the data migration that REPLACES `User.baseSalaryCents` with a
-- `SalaryConfiguration` row (amount copied BEFORE the column is dropped).
--
-- Apply with: npx prisma migrate deploy   (then npx prisma generate)

-- CreateEnum
CREATE TYPE "SalaryFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "BonusFrequency" AS ENUM ('MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');

-- AlterEnum: system-only income categories (never creatable from the UI).
-- PostgreSQL 12+ allows ADD VALUE inside a migration transaction; the new values
-- are not USED in this same migration, only declared.
ALTER TYPE "VariableExpenseCategory" ADD VALUE 'SALARY';
ALTER TYPE "VariableExpenseCategory" ADD VALUE 'BONUS';

-- CreateTable
CREATE TABLE "SalaryConfiguration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'COP',
    "frequency" "SalaryFrequency" NOT NULL DEFAULT 'MONTHLY',
    "nextPayDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "SalaryConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryBonus" (
    "id" TEXT NOT NULL,
    "salaryConfigId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'COP',
    "frequency" "BonusFrequency" NOT NULL,
    "anchorMonth" INTEGER NOT NULL,
    "dayOfMonth" INTEGER,
    "idempotencyKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "SalaryBonus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectionSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthlySavingsTargetCents" BIGINT NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'COP',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "ProjectionSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalaryConfiguration_userId_key" ON "SalaryConfiguration"("userId");

-- CreateIndex
CREATE INDEX "SalaryConfiguration_userId_isActive_idx" ON "SalaryConfiguration"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryBonus_idempotencyKey_key" ON "SalaryBonus"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SalaryBonus_salaryConfigId_isActive_idx" ON "SalaryBonus"("salaryConfigId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectionSettings_userId_key" ON "ProjectionSettings"("userId");

-- CreateIndex
CREATE INDEX "ProjectionSettings_userId_isActive_idx" ON "ProjectionSettings"("userId", "isActive");

-- AddForeignKey
ALTER TABLE "SalaryConfiguration" ADD CONSTRAINT "SalaryConfiguration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryBonus" ADD CONSTRAINT "SalaryBonus_salaryConfigId_fkey" FOREIGN KEY ("salaryConfigId") REFERENCES "SalaryConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectionSettings" ADD CONSTRAINT "ProjectionSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: copy every non-null `User.baseSalaryCents` into a
-- `SalaryConfiguration` row (COP, MONTHLY) BEFORE the legacy column is dropped.
-- `nextPayDate` stays NULL: the projection anchors a MONTHLY series at the first
-- day of the current month when the anchor is missing (documented in
-- `src/lib/projection.ts`). The generated id starts with `c` followed by 21
-- lowercase hex chars, so it satisfies the app-wide CUID shape.
INSERT INTO "SalaryConfiguration" (
    "id",
    "userId",
    "amountCents",
    "currency",
    "frequency",
    "nextPayDate",
    "isActive",
    "createdAt",
    "updatedAt",
    "createdBy",
    "lastModifiedBy",
    "ipAddress",
    "userAgent"
)
SELECT
    'csal' || substr(md5(random()::text || "User"."id"), 1, 21),
    "User"."id",
    "User"."baseSalaryCents",
    'COP',
    'MONTHLY',
    NULL,
    true,
    NOW(),
    NOW(),
    "User"."id",
    "User"."id",
    NULL,
    NULL
FROM "User"
WHERE "User"."baseSalaryCents" IS NOT NULL;

-- DropColumn: the scalar is fully superseded by `SalaryConfiguration`.
ALTER TABLE "User" DROP COLUMN "baseSalaryCents";
