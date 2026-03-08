-- CreateEnum
CREATE TYPE "DraftCandidateStatus" AS ENUM ('pending', 'approved', 'rejected', 'edited', 'posted', 'observed');

-- CreateTable
CREATE TABLE "DraftCandidate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xHandle" TEXT,
    "threadId" TEXT,
    "runId" TEXT,
    "title" TEXT NOT NULL,
    "sourcePrompt" TEXT NOT NULL,
    "sourcePlaybook" TEXT,
    "outputShape" TEXT NOT NULL,
    "status" "DraftCandidateStatus" NOT NULL DEFAULT 'pending',
    "artifact" JSONB NOT NULL,
    "voiceTarget" JSONB,
    "noveltyNotes" JSONB,
    "rejectionReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3),
    "observedMetrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DraftCandidate_userId_xHandle_status_createdAt_idx" ON "DraftCandidate"("userId", "xHandle", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DraftCandidate_threadId_createdAt_idx" ON "DraftCandidate"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "DraftCandidate_runId_createdAt_idx" ON "DraftCandidate"("runId", "createdAt");

-- AddForeignKey
ALTER TABLE "DraftCandidate" ADD CONSTRAINT "DraftCandidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftCandidate" ADD CONSTRAINT "DraftCandidate_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftCandidate" ADD CONSTRAINT "DraftCandidate_runId_fkey" FOREIGN KEY ("runId") REFERENCES "OnboardingRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
