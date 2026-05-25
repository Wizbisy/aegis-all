-- AddColumn
ALTER TABLE "LimitOrder" ADD COLUMN "eligibleAt" TIMESTAMP(3);

-- Backfill existing rows so current pending orders remain eligible for evaluation
UPDATE "LimitOrder"
SET "eligibleAt" = COALESCE("eligibleAt", CURRENT_TIMESTAMP)
WHERE "eligibleAt" IS NULL;

-- Apply the default for newly created limit orders
ALTER TABLE "LimitOrder" ALTER COLUMN "eligibleAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Enforce non-null after backfill
ALTER TABLE "LimitOrder" ALTER COLUMN "eligibleAt" SET NOT NULL;

-- AddIndex
CREATE INDEX "LimitOrder_status_eligibleAt_createdAt_idx" ON "LimitOrder"("status", "eligibleAt", "createdAt");
