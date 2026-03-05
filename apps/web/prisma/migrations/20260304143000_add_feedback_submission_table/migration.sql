CREATE TABLE "FeedbackSubmission" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "xHandle" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "title" TEXT,
  "message" TEXT NOT NULL,
  "fields" JSONB NOT NULL,
  "context" JSONB NOT NULL,
  "attachments" JSONB NOT NULL,
  "submittedByUserHandle" TEXT,
  "submittedByXHandle" TEXT,
  "statusUpdatedAt" TIMESTAMP(3),
  "statusUpdatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedbackSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedbackSubmission_userId_xHandle_createdAt_idx"
ON "FeedbackSubmission"("userId", "xHandle", "createdAt");

CREATE INDEX "FeedbackSubmission_userId_xHandle_status_createdAt_idx"
ON "FeedbackSubmission"("userId", "xHandle", "status", "createdAt");

ALTER TABLE "FeedbackSubmission"
ADD CONSTRAINT "FeedbackSubmission_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
