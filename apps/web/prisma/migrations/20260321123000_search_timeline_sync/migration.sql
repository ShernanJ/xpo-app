ALTER TYPE "OnboardingScrapeJobKind"
    ADD VALUE IF NOT EXISTS 'context_primer';

ALTER TYPE "OnboardingScrapeJobKind"
    ADD VALUE IF NOT EXISTS 'historical_backfill_year';

ALTER TABLE "ScrapeCaptureCache"
    ADD COLUMN "captureState" JSONB;

ALTER TABLE "OnboardingScrapeJob"
    ADD COLUMN "sourceRunId" TEXT,
    ADD COLUMN "progressPayload" JSONB;

CREATE INDEX "OnboardingScrapeJob_sourceRunId_kind_status_updatedAt_idx"
ON "OnboardingScrapeJob"("sourceRunId", "kind", "status", "updatedAt");

CREATE TABLE "ScraperProxyAccount" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "fleet" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScraperProxyAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScraperProxyAccount_sessionId_key"
ON "ScraperProxyAccount"("sessionId");

CREATE INDEX "ScraperProxyAccount_fleet_enabled_lockedUntil_idx"
ON "ScraperProxyAccount"("fleet", "enabled", "lockedUntil");
