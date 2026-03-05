CREATE TYPE "ChatMessageFeedbackValue" AS ENUM ('up', 'down');

CREATE TABLE "ChatMessageFeedback" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "value" "ChatMessageFeedbackValue" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatMessageFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatMessageFeedback_userId_messageId_key"
ON "ChatMessageFeedback"("userId", "messageId");

CREATE INDEX "ChatMessageFeedback_messageId_idx"
ON "ChatMessageFeedback"("messageId");

CREATE INDEX "ChatMessageFeedback_threadId_createdAt_idx"
ON "ChatMessageFeedback"("threadId", "createdAt");

CREATE INDEX "ChatMessageFeedback_userId_createdAt_idx"
ON "ChatMessageFeedback"("userId", "createdAt");

ALTER TABLE "ChatMessageFeedback"
ADD CONSTRAINT "ChatMessageFeedback_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessageFeedback"
ADD CONSTRAINT "ChatMessageFeedback_threadId_fkey"
FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessageFeedback"
ADD CONSTRAINT "ChatMessageFeedback_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
