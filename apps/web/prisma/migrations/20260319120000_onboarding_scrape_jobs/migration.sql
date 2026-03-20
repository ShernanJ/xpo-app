CREATE TYPE "OnboardingScrapeJobStatus" AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
);

CREATE TYPE "OnboardingScrapeJobKind" AS ENUM (
    'onboarding_run',
    'profile_refresh'
);

CREATE TABLE "OnboardingScrapeJob" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "kind" "OnboardingScrapeJobKind" NOT NULL,
    "status" "OnboardingScrapeJobStatus" NOT NULL DEFAULT 'pending',
    "requestInput" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "resultPayload" JSONB,
    "completedRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingScrapeJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnboardingScrapeJob_dedupeKey_key"
ON "OnboardingScrapeJob"("dedupeKey");

CREATE INDEX "OnboardingScrapeJob_userId_status_updatedAt_idx"
ON "OnboardingScrapeJob"("userId", "status", "updatedAt");

CREATE INDEX "OnboardingScrapeJob_account_kind_status_updatedAt_idx"
ON "OnboardingScrapeJob"("account", "kind", "status", "updatedAt");

CREATE INDEX "OnboardingScrapeJob_leaseExpiresAt_status_idx"
ON "OnboardingScrapeJob"("leaseExpiresAt", "status");

ALTER TABLE "OnboardingScrapeJob"
    ADD CONSTRAINT "OnboardingScrapeJob_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
