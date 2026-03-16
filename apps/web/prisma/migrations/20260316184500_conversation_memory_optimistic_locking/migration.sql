ALTER TABLE "ConversationMemory"
    ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

WITH ranked_thread_memory AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "threadId"
            ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
        ) AS row_number
    FROM "ConversationMemory"
    WHERE "threadId" IS NOT NULL
)
DELETE FROM "ConversationMemory"
WHERE "id" IN (
    SELECT "id"
    FROM ranked_thread_memory
    WHERE row_number > 1
);

WITH ranked_run_memory AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "runId"
            ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
        ) AS row_number
    FROM "ConversationMemory"
    WHERE "runId" IS NOT NULL
)
DELETE FROM "ConversationMemory"
WHERE "id" IN (
    SELECT "id"
    FROM ranked_run_memory
    WHERE row_number > 1
);

CREATE UNIQUE INDEX "ConversationMemory_runId_key"
ON "ConversationMemory"("runId")
WHERE "runId" IS NOT NULL;

CREATE UNIQUE INDEX "ConversationMemory_threadId_key"
ON "ConversationMemory"("threadId")
WHERE "threadId" IS NOT NULL;
