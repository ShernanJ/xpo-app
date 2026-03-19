-- CreateEnum
CREATE TYPE "ReplyMode" AS ENUM (
    'joke_riff',
    'agree_and_amplify',
    'contrarian_pushback',
    'insightful_add_on',
    'empathetic_support'
);

-- CreateTable
CREATE TABLE "ReplyGoldenExample" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xHandle" TEXT,
    "replyMode" "ReplyMode" NOT NULL,
    "text" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplyGoldenExample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReplyGoldenExample_userId_xHandle_replyMode_normalizedText_key"
ON "ReplyGoldenExample"("userId", "xHandle", "replyMode", "normalizedText");

-- CreateIndex
CREATE INDEX "ReplyGoldenExample_userId_xHandle_replyMode_createdAt_idx"
ON "ReplyGoldenExample"("userId", "xHandle", "replyMode", "createdAt");

-- AddForeignKey
ALTER TABLE "ReplyGoldenExample"
ADD CONSTRAINT "ReplyGoldenExample_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
