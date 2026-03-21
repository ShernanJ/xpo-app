-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "Persona" AS ENUM ('EDUCATOR', 'CURATOR', 'ENTERTAINER', 'DOCUMENTARIAN', 'PROVOCATEUR', 'CASUAL');

-- AlterTable
ALTER TABLE "VoiceProfile" ADD COLUMN     "primaryPersona" "Persona",
ADD COLUMN     "secondaryPersona" "Persona";

-- CreateTable
CREATE TABLE "SemanticCluster" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SemanticCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldenExample" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "intent" TEXT,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoldenExample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SemanticCluster_profileId_idx" ON "SemanticCluster"("profileId");

-- CreateIndex
CREATE INDEX "GoldenExample_profileId_idx" ON "GoldenExample"("profileId");

-- Create an HNSW index for cosine distance on the embedding column
CREATE INDEX "GoldenExample_embedding_idx" ON "GoldenExample" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "SemanticCluster" ADD CONSTRAINT "SemanticCluster_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "VoiceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldenExample" ADD CONSTRAINT "GoldenExample_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "VoiceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
