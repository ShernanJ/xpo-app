import { setTimeout as delay } from "node:timers/promises";

import { processNextQueuedChatTurn } from "../app/api/creator/v2/chat/_lib/worker/chatTurnWorker.ts";
import { processNextOnboardingBackfillJob } from "../lib/onboarding/pipeline/backfill.ts";

const IDLE_DELAY_MS = Number.parseInt(process.env.BACKGROUND_WORKER_IDLE_MS ?? "2000", 10);
const ACTIVE_DELAY_MS = Number.parseInt(process.env.BACKGROUND_WORKER_ACTIVE_MS ?? "250", 10);

let shuttingDown = false;

function handleSignal(signal) {
  process.stderr.write(`Received ${signal}. Shutting down background worker...\n`);
  shuttingDown = true;
}

process.on("SIGINT", handleSignal);
process.on("SIGTERM", handleSignal);

while (!shuttingDown) {
  try {
    const chatResult = await processNextQueuedChatTurn();
    if (chatResult.ok && chatResult.claimed && chatResult.turnId) {
      process.stdout.write(
        `Processed chat turn ${chatResult.turnId} with status ${chatResult.status}.\n`,
      );
      await delay(ACTIVE_DELAY_MS);
      continue;
    }

    const result = await processNextOnboardingBackfillJob();
    if (result.ok && result.jobId) {
      process.stdout.write(
        `Processed onboarding backfill job ${result.jobId} with status ${result.status}.\n`,
      );
      await delay(ACTIVE_DELAY_MS);
      continue;
    }

    await delay(IDLE_DELAY_MS);
  } catch (error) {
    process.stderr.write(
      `Background worker loop failed: ${error instanceof Error ? error.stack || error.message : String(error)}\n`,
    );
    await delay(IDLE_DELAY_MS);
  }
}
