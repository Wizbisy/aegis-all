-- CreateTable
CREATE TABLE "LimitOrder" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "tokenIn" TEXT NOT NULL,
    "tokenOut" TEXT NOT NULL,
    "amountIn" DECIMAL(18,6) NOT NULL,
    "targetPrice" DECIMAL(18,6) NOT NULL,
    "condition" TEXT NOT NULL DEFAULT 'LTE',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LimitOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DcaSchedule" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "tokenIn" TEXT NOT NULL,
    "tokenOut" TEXT NOT NULL,
    "amountInPerTx" DECIMAL(18,6) NOT NULL,
    "frequencyHours" INTEGER NOT NULL,
    "nextExecution" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DcaSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LimitOrder_agentId_status_idx" ON "LimitOrder"("agentId", "status");

-- CreateIndex
CREATE INDEX "LimitOrder_status_tokenIn_tokenOut_idx" ON "LimitOrder"("status", "tokenIn", "tokenOut");

-- CreateIndex
CREATE INDEX "DcaSchedule_agentId_status_idx" ON "DcaSchedule"("agentId", "status");

-- CreateIndex
CREATE INDEX "DcaSchedule_status_nextExecution_idx" ON "DcaSchedule"("status", "nextExecution");

-- AddForeignKey
ALTER TABLE "LimitOrder" ADD CONSTRAINT "LimitOrder_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DcaSchedule" ADD CONSTRAINT "DcaSchedule_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
