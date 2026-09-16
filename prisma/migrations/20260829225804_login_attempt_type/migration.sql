-- CreateEnum
CREATE TYPE "AuthAttemptType" AS ENUM ('LOGIN', 'REGISTER');

-- AlterTable
ALTER TABLE "LoginAttempt" ADD COLUMN     "type" "AuthAttemptType" NOT NULL DEFAULT 'LOGIN';
