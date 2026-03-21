import { generateStyleProfile } from "@/lib/agent-v2/core/styleProfile";
import { prisma } from "@/lib/db";
import type { OnboardingInput, OnboardingResult } from "@/lib/onboarding/contracts/types";
import { maybeEnqueueOnboardingBackfillJob } from "@/lib/onboarding/pipeline/backfill";
import {
  persistOnboardingRun,
  syncOnboardingPostsToDb,
} from "@/lib/onboarding/store/onboardingRunStore";

export interface FinalizedOnboardingRunPayload {
  ok: true;
  runId: string;
  persistedAt: string;
  backfill: Awaited<ReturnType<typeof maybeEnqueueOnboardingBackfillJob>>;
  data: OnboardingResult;
}

export interface FinalizedOnboardingRunResult {
  normalizedHandle: string;
  payload: FinalizedOnboardingRunPayload;
}

export async function finalizeOnboardingRunForUser(params: {
  input: OnboardingInput;
  runId?: string;
  result: OnboardingResult;
  userAgent: string | null;
  userId: string;
}): Promise<FinalizedOnboardingRunResult> {
  const persisted = await persistOnboardingRun({
    input: params.input,
    runId: params.runId,
    result: params.result,
    userAgent: params.userAgent,
    userId: params.userId,
  });
  const normalizedHandle = params.input.account.replace(/^@/, "").toLowerCase();

  await syncOnboardingPostsToDb(params.userId, params.input.account, params.result).catch((error) =>
    console.error("Failed to sync posts to DB:", error),
  );
  await generateStyleProfile(
    params.userId,
    normalizedHandle,
    80,
    { forceRegenerate: true },
  ).catch((error) =>
    console.error("Failed to refresh style profile after onboarding sync:", error),
  );
  const backfill = await maybeEnqueueOnboardingBackfillJob({
    runId: persisted.runId,
    input: params.input,
    result: params.result,
  });

  await prisma.user.update({
    where: { id: params.userId },
    data: { activeXHandle: normalizedHandle },
  });

  await prisma.voiceProfile.createMany({
    data: [
      {
        userId: params.userId,
        xHandle: normalizedHandle,
        styleCard: {},
      },
    ],
    skipDuplicates: true,
  });

  return {
    normalizedHandle,
    payload: {
      ok: true,
      runId: persisted.runId,
      persistedAt: persisted.persistedAt,
      backfill,
      data: params.result,
    },
  };
}
