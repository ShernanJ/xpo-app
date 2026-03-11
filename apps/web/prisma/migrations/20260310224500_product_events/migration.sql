-- CreateTable
CREATE TABLE "public"."ProductEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xHandle" TEXT,
    "threadId" TEXT,
    "messageId" TEXT,
    "candidateId" TEXT,
    "eventType" TEXT NOT NULL,
    "properties" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductEvent_userId_createdAt_idx" ON "public"."ProductEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductEvent_userId_eventType_createdAt_idx" ON "public"."ProductEvent"("userId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "ProductEvent_threadId_createdAt_idx" ON "public"."ProductEvent"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."ProductEvent" ADD CONSTRAINT "ProductEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
