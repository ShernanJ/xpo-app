ALTER TABLE "DraftCandidate"
  ADD COLUMN IF NOT EXISTS "messageId" TEXT;

UPDATE "DraftCandidate" AS candidate
SET "messageId" = message."id"
FROM "ChatMessage" AS message
WHERE candidate."threadId" = message."threadId"
  AND message."role" = 'assistant'
  AND message."data" IS NOT NULL
  AND message."data"->>'activeDraftVersionId' = candidate."draftVersionId"
  AND candidate."messageId" IS NULL;

CREATE INDEX IF NOT EXISTS "DraftCandidate_messageId_idx"
  ON "DraftCandidate"("messageId");
