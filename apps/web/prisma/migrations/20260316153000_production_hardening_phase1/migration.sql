CREATE TYPE "ChatTurnStatus" AS ENUM (
    'queued',
    'running',
    'cancel_requested',
    'cancelled',
    'completed',
    'failed'
);

CREATE TYPE "OnboardingBackfillJobStatus" AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
);

ALTER TABLE "ChatTurnControl"
    ADD COLUMN "userMessageId" TEXT,
    ADD COLUMN "progressStepId" TEXT,
    ADD COLUMN "progressLabel" TEXT,
    ADD COLUMN "progressExplanation" TEXT,
    ADD COLUMN "billingIdempotencyKey" TEXT,
    ADD COLUMN "creditCost" INTEGER,
    ADD COLUMN "requestPayload" JSONB,
    ADD COLUMN "errorCode" TEXT,
    ADD COLUMN "errorMessage" TEXT,
    ADD COLUMN "startedAt" TIMESTAMP(3),
    ADD COLUMN "heartbeatAt" TIMESTAMP(3),
    ADD COLUMN "leaseOwner" TEXT,
    ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
    ADD COLUMN "failedAt" TIMESTAMP(3);

ALTER TABLE "ChatTurnControl"
    ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "ChatTurnControl"
    ALTER COLUMN "status" TYPE "ChatTurnStatus"
    USING (
        CASE "status"
            WHEN 'running' THEN 'running'::"ChatTurnStatus"
            WHEN 'cancel_requested' THEN 'cancel_requested'::"ChatTurnStatus"
            WHEN 'cancelled' THEN 'cancelled'::"ChatTurnStatus"
            WHEN 'completed' THEN 'completed'::"ChatTurnStatus"
            WHEN 'failed' THEN 'failed'::"ChatTurnStatus"
            ELSE 'queued'::"ChatTurnStatus"
        END
    );

ALTER TABLE "ChatTurnControl"
    ALTER COLUMN "status" SET DEFAULT 'queued';

UPDATE "ChatTurnControl"
SET
    "startedAt" = COALESCE("startedAt", "createdAt"),
    "heartbeatAt" = COALESCE("heartbeatAt", "updatedAt");

ALTER TABLE "ChatTurnControl"
    ADD CONSTRAINT "ChatTurnControl_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ChatTurnControl_threadId_status_updatedAt_idx"
ON "ChatTurnControl"("threadId", "status", "updatedAt");

CREATE INDEX "ChatTurnControl_leaseExpiresAt_status_idx"
ON "ChatTurnControl"("leaseExpiresAt", "status");

CREATE TABLE "OnboardingBackfillJob" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "sourceRunId" TEXT NOT NULL,
    "status" "OnboardingBackfillJobStatus" NOT NULL DEFAULT 'pending',
    "targetPostCount" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastCaptureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingBackfillJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnboardingBackfillJob_dedupeKey_key"
ON "OnboardingBackfillJob"("dedupeKey");

CREATE INDEX "OnboardingBackfillJob_status_updatedAt_idx"
ON "OnboardingBackfillJob"("status", "updatedAt");

CREATE INDEX "OnboardingBackfillJob_account_status_updatedAt_idx"
ON "OnboardingBackfillJob"("account", "status", "updatedAt");

CREATE INDEX "OnboardingBackfillJob_leaseExpiresAt_status_idx"
ON "OnboardingBackfillJob"("leaseExpiresAt", "status");

CREATE TABLE "RequestRateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestRateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RequestRateLimitBucket_updatedAt_idx"
ON "RequestRateLimitBucket"("updatedAt");
