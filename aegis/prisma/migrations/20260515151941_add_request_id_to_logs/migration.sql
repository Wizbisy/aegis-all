-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "requestId" TEXT;

-- AlterTable
ALTER TABLE "AuthLog" ADD COLUMN     "requestId" TEXT;

-- AlterTable
ALTER TABLE "IdempotencyKey" ADD COLUMN     "requestId" TEXT;
