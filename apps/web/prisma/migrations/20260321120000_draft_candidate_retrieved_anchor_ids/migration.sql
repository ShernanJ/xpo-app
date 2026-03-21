ALTER TABLE "DraftCandidate"
ADD COLUMN "retrievedAnchorIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
