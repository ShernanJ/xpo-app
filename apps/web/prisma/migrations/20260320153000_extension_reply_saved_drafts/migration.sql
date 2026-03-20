ALTER TABLE "DraftCandidate"
ADD COLUMN "replySourcePostId" TEXT;

CREATE INDEX "DraftCandidate_userId_xHandle_replySourcePostId_status_idx"
ON "DraftCandidate"("userId", "xHandle", "replySourcePostId", "status");
