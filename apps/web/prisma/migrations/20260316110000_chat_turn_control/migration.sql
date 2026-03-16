CREATE TABLE "ChatTurnControl" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "threadId" TEXT,
    "clientTurnId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "cancelRequestedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "assistantMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatTurnControl_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatTurnControl_userId_runId_clientTurnId_key"
ON "ChatTurnControl"("userId", "runId", "clientTurnId");

CREATE INDEX "ChatTurnControl_threadId_updatedAt_idx"
ON "ChatTurnControl"("threadId", "updatedAt");

CREATE INDEX "ChatTurnControl_status_updatedAt_idx"
ON "ChatTurnControl"("status", "updatedAt");
