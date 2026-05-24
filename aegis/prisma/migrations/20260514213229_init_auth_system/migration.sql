-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "walletId" TEXT,
    "walletAddress" TEXT,
    "walletSetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentApiToken" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "allowedIps" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectChallenge" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthLog" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "tokenId" TEXT,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPolicy" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "perTxLimitUsdc" DECIMAL(18,6) NOT NULL DEFAULT 1.00,
    "dailyLimitUsdc" DECIMAL(18,6) NOT NULL DEFAULT 5.00,
    "weeklyLimitUsdc" DECIMAL(18,6) NOT NULL DEFAULT 20.00,
    "monthlyLimitUsdc" DECIMAL(18,6) NOT NULL DEFAULT 50.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "amountUsdc" DECIMAL(18,6),
    "status" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "signature" TEXT,
    "resultHash" TEXT,
    "metadata" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_email_key" ON "Agent"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_walletId_key" ON "Agent"("walletId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_walletAddress_key" ON "Agent"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_walletSetId_key" ON "Agent"("walletSetId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentApiToken_tokenHash_key" ON "AgentApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AgentApiToken_agentId_revokedAt_expiresAt_createdAt_idx" ON "AgentApiToken"("agentId", "revokedAt", "expiresAt", "createdAt");

-- CreateIndex
CREATE INDEX "AgentApiToken_expiresAt_revokedAt_idx" ON "AgentApiToken"("expiresAt", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectChallenge_email_key" ON "ConnectChallenge"("email");

-- CreateIndex
CREATE INDEX "ConnectChallenge_expiresAt_idx" ON "ConnectChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthLog_agentId_createdAt_idx" ON "AuthLog"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "AuthLog_tokenId_createdAt_idx" ON "AuthLog"("tokenId", "createdAt");

-- CreateIndex
CREATE INDEX "AuthLog_outcome_createdAt_idx" ON "AuthLog"("outcome", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentPolicy_agentId_key" ON "AgentPolicy"("agentId");

-- CreateIndex
CREATE INDEX "IdempotencyKey_lockedUntil_idx" ON "IdempotencyKey"("lockedUntil");

-- CreateIndex
CREATE INDEX "IdempotencyKey_status_updatedAt_idx" ON "IdempotencyKey"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_agentId_status_updatedAt_idx" ON "IdempotencyKey"("agentId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_agentId_keyHash_key" ON "IdempotencyKey"("agentId", "keyHash");

-- CreateIndex
CREATE INDEX "AuditLog_agentId_createdAt_idx" ON "AuditLog"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_status_idx" ON "AuditLog"("status");

-- CreateIndex
CREATE INDEX "AuditLog_agentId_status_createdAt_idx" ON "AuditLog"("agentId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_agentId_createdAt_idx" ON "AuditLog"("action", "agentId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentApiToken" ADD CONSTRAINT "AgentApiToken_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthLog" ADD CONSTRAINT "AuthLog_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthLog" ADD CONSTRAINT "AuthLog_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "AgentApiToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPolicy" ADD CONSTRAINT "AgentPolicy_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
