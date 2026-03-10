-- CreateEnum
CREATE TYPE "SourceMaterialType" AS ENUM ('story', 'playbook', 'framework', 'case_study');

-- CreateTable
CREATE TABLE "SourceMaterialAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xHandle" TEXT,
    "type" "SourceMaterialType" NOT NULL,
    "title" TEXT NOT NULL,
    "tags" JSONB NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "claims" JSONB NOT NULL,
    "snippets" JSONB NOT NULL,
    "doNotClaim" JSONB NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceMaterialAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceMaterialAsset_userId_xHandle_verified_updatedAt_idx" ON "SourceMaterialAsset"("userId", "xHandle", "verified", "updatedAt");

-- CreateIndex
CREATE INDEX "SourceMaterialAsset_userId_xHandle_lastUsedAt_idx" ON "SourceMaterialAsset"("userId", "xHandle", "lastUsedAt");

-- AddForeignKey
ALTER TABLE "SourceMaterialAsset" ADD CONSTRAINT "SourceMaterialAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
