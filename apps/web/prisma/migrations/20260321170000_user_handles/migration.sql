DO $$
BEGIN
  CREATE TYPE "UserHandleStatus" AS ENUM ('pending_setup', 'active');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE "UserHandle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xHandle" TEXT NOT NULL,
    "status" "UserHandleStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserHandle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserHandle_userId_xHandle_key"
ON "UserHandle"("userId", "xHandle");

CREATE INDEX "UserHandle_userId_status_idx"
ON "UserHandle"("userId", "status");

CREATE INDEX "UserHandle_xHandle_idx"
ON "UserHandle"("xHandle");

ALTER TABLE "UserHandle"
ADD CONSTRAINT "UserHandle_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

INSERT INTO "UserHandle" ("id", "userId", "xHandle", "status", "createdAt", "updatedAt")
SELECT
    CONCAT('uh_', md5(CONCAT(source."userId", ':', source."xHandle"))),
    source."userId",
    source."xHandle",
    'active'::"UserHandleStatus",
    NOW(),
    NOW()
FROM (
    SELECT
        "userId",
        lower(regexp_replace(trim("xHandle"), '^@+', '')) AS "xHandle"
    FROM "VoiceProfile"
    WHERE "userId" IS NOT NULL
      AND "xHandle" IS NOT NULL
      AND length(trim("xHandle")) > 0

    UNION

    SELECT
        "userId",
        lower(regexp_replace(trim("input"->>'account'), '^@+', '')) AS "xHandle"
    FROM "OnboardingRun"
    WHERE "userId" IS NOT NULL
      AND "input"->>'account' IS NOT NULL
      AND length(trim("input"->>'account')) > 0

    UNION

    SELECT
        "userId",
        lower(regexp_replace(trim("xHandle"), '^@+', '')) AS "xHandle"
    FROM "ChatThread"
    WHERE "userId" IS NOT NULL
      AND "xHandle" IS NOT NULL
      AND length(trim("xHandle")) > 0

    UNION

    SELECT
        "id" AS "userId",
        lower(regexp_replace(trim("activeXHandle"), '^@+', '')) AS "xHandle"
    FROM "User"
    WHERE "activeXHandle" IS NOT NULL
      AND length(trim("activeXHandle")) > 0
) AS source
WHERE source."xHandle" <> ''
ON CONFLICT ("userId", "xHandle") DO UPDATE
SET
    "status" = 'active'::"UserHandleStatus",
    "updatedAt" = NOW();
