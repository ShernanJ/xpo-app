-- CreateEnum
CREATE TYPE "ReplyOpportunityState" AS ENUM ('opened', 'generated', 'selected', 'copied', 'posted', 'dismissed', 'observed');

-- CreateTable
CREATE TABLE "ExtensionApiToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ExtensionApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplyOpportunity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xHandle" TEXT,
    "tweetId" TEXT NOT NULL,
    "authorHandle" TEXT NOT NULL,
    "tweetText" TEXT NOT NULL,
    "tweetUrl" TEXT NOT NULL,
    "tweetSnapshot" JSONB NOT NULL,
    "heuristicScore" INTEGER,
    "heuristicTier" TEXT,
    "stage" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "strategyPillar" TEXT,
    "generatedAngleLabel" TEXT,
    "state" "ReplyOpportunityState" NOT NULL DEFAULT 'opened',
    "openedAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3),
    "selectedAt" TIMESTAMP(3),
    "copiedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3),
    "generatedOptions" JSONB,
    "notes" JSONB,
    "selectedOptionId" TEXT,
    "selectedOptionText" TEXT,
    "selectedAngleLabel" TEXT,
    "observedMetrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplyOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExtensionApiToken_tokenHash_key" ON "ExtensionApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ExtensionApiToken_userId_createdAt_idx" ON "ExtensionApiToken"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ExtensionApiToken_userId_revokedAt_expiresAt_idx" ON "ExtensionApiToken"("userId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReplyOpportunity_userId_tweetId_key" ON "ReplyOpportunity"("userId", "tweetId");

-- CreateIndex
CREATE INDEX "ReplyOpportunity_userId_xHandle_updatedAt_idx" ON "ReplyOpportunity"("userId", "xHandle", "updatedAt");

-- CreateIndex
CREATE INDEX "ReplyOpportunity_userId_state_updatedAt_idx" ON "ReplyOpportunity"("userId", "state", "updatedAt");

-- CreateIndex
CREATE INDEX "ReplyOpportunity_xHandle_updatedAt_idx" ON "ReplyOpportunity"("xHandle", "updatedAt");

-- AddForeignKey
ALTER TABLE "ExtensionApiToken" ADD CONSTRAINT "ExtensionApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyOpportunity" ADD CONSTRAINT "ReplyOpportunity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
