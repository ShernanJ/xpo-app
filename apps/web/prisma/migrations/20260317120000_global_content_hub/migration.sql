-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "DraftCandidate" RENAME COLUMN "status" TO "reviewStatus";

ALTER TABLE "DraftCandidate"
    ADD COLUMN "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN "folderId" TEXT,
    ADD COLUMN "publishedTweetId" TEXT,
    ADD COLUMN "draftVersionId" TEXT,
    ADD COLUMN "basedOnVersionId" TEXT,
    ADD COLUMN "revisionChainId" TEXT,
    ADD COLUMN "messageId" TEXT,
    ADD COLUMN "isLatestVersion" BOOLEAN NOT NULL DEFAULT true;

UPDATE "DraftCandidate"
SET
    "status" = CASE
        WHEN "reviewStatus" IN ('posted', 'observed') THEN 'PUBLISHED'::"PostStatus"
        ELSE 'DRAFT'::"PostStatus"
    END,
    "isLatestVersion" = true;

UPDATE "DraftCandidate" AS candidate
SET "messageId" = message."id"
FROM "ChatMessage" AS message
WHERE candidate."threadId" = message."threadId"
  AND message."role" = 'assistant'
  AND message."data" IS NOT NULL
  AND message."data"->>'activeDraftVersionId' = candidate."draftVersionId"
  AND candidate."messageId" IS NULL;

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- DropIndex
DROP INDEX "DraftCandidate_userId_xHandle_status_createdAt_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Folder_userId_name_key" ON "Folder"("userId", "name");

-- CreateIndex
CREATE INDEX "Folder_userId_createdAt_idx" ON "Folder"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DraftCandidate_userId_xHandle_reviewStatus_createdAt_idx" ON "DraftCandidate"("userId", "xHandle", "reviewStatus", "createdAt");

-- CreateIndex
CREATE INDEX "DraftCandidate_userId_xHandle_status_isLatestVersion_updatedAt_idx" ON "DraftCandidate"("userId", "xHandle", "status", "isLatestVersion", "updatedAt");

-- CreateIndex
CREATE INDEX "DraftCandidate_revisionChainId_isLatestVersion_idx" ON "DraftCandidate"("revisionChainId", "isLatestVersion");

-- CreateIndex
CREATE INDEX "DraftCandidate_messageId_idx" ON "DraftCandidate"("messageId");

-- CreateIndex
CREATE INDEX "DraftCandidate_folderId_updatedAt_idx" ON "DraftCandidate"("folderId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftCandidate" ADD CONSTRAINT "DraftCandidate_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
