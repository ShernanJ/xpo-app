ALTER TYPE "ReplyOpportunityState" ADD VALUE IF NOT EXISTS 'ranked';

ALTER TABLE "ExtensionApiToken"
ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'xpo-companion-extension';
