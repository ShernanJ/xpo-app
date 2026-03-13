DROP INDEX IF EXISTS "ReplyOpportunity_userId_tweetId_key";

CREATE UNIQUE INDEX "ReplyOpportunity_userId_xHandle_tweetId_key"
ON "ReplyOpportunity"("userId", "xHandle", "tweetId");
