ALTER TABLE "DraftCandidate"
ADD COLUMN "publishedText" TEXT,
ADD COLUMN "publishedAt" TIMESTAMP(3),
ADD COLUMN "deltaAnalyzed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "VoiceProfile"
ADD COLUMN "learnedStyleRules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
