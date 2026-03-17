-- CreateTable
CREATE TABLE "ChatMediaAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'image',
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "previewMimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" BYTEA NOT NULL,
    "previewBytes" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMediaAsset_userId_threadId_createdAt_idx" ON "ChatMediaAsset"("userId", "threadId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMediaAsset_threadId_createdAt_idx" ON "ChatMediaAsset"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMediaAsset_messageId_idx" ON "ChatMediaAsset"("messageId");

-- AddForeignKey
ALTER TABLE "ChatMediaAsset" ADD CONSTRAINT "ChatMediaAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMediaAsset" ADD CONSTRAINT "ChatMediaAsset_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
