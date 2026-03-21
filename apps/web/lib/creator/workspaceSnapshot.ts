import {
  StyleCardSchema,
  type ProfileAuditState,
  type VoiceStyleCard,
} from "../agent-v2/core/styleProfile";
import {
  createEmptyVoiceProfileContext,
  type VoiceProfileContext,
} from "../agent-v2/core/voiceProfileContext";
import { prisma } from "../db";
import { buildCreatorGenerationContract } from "../onboarding/contracts/generationContract";
import type { CreatorGenerationContract } from "../onboarding/contracts/generationContract";
import {
  hydrateOnboardingProfileForAnalysis,
} from "../onboarding/profile/profileHydration";
import { shouldDeferLiveScrapesToWorker } from "../onboarding/pipeline/liveScrapePolicy";
import { enqueueProfileRefreshJobIfNeeded } from "../onboarding/pipeline/scrapeJob";
import { bootstrapScrapeCaptureWithOptions } from "../onboarding/sources/scrapeBootstrap";
import {
  readLatestOnboardingRunByHandle,
  type StoredOnboardingRun,
} from "../onboarding/store/onboardingRunStore";
import { readLatestActiveOnboardingSyncJobForUser } from "../onboarding/store/onboardingScrapeJobStore";
import { buildCreatorAgentContext } from "../onboarding/strategy/agentContext";
import type { CreatorAgentContext } from "../onboarding/strategy/agentContext";
import {
  buildGrowthOperatingSystemPayload,
  type GrowthOperatingSystemPayload,
} from "../onboarding/strategy/contextEnrichment";
import {
  applyCreatorStrategyOverrides,
  applyCreatorToneOverrides,
  extractCreatorStrategyOverrides,
  extractCreatorToneOverrides,
} from "../onboarding/strategy/strategyOverrides";
import type {
  OnboardingInput,
  OnboardingResult,
  TonePreference,
} from "../onboarding/types";

export type CreatorWorkspaceSnapshotFailureCode =
  | "MISSING_ONBOARDING_RUN"
  | "ONBOARDING_SOURCE_INVALID";

export interface CreatorWorkspaceSnapshotStoredRun {
  id: string;
  input: unknown;
  result: unknown;
}

export type CreatorWorkspaceSnapshotContextData =
  CreatorAgentContext & GrowthOperatingSystemPayload;

export interface CreatorWorkspaceBackgroundSync {
  jobId: string;
  phase: "primer" | "archive";
}

export interface CreatorWorkspaceSnapshotSuccess {
  ok: true;
  storedRun: CreatorWorkspaceSnapshotStoredRun;
  onboarding: OnboardingResult;
  tonePreference: TonePreference;
  voiceProfile: VoiceProfileContext;
  styleCard: VoiceStyleCard | null;
  profileAuditState: ProfileAuditState | null;
  creatorAgentContext: CreatorAgentContext;
  growthOsPayload: GrowthOperatingSystemPayload;
  contextData: CreatorWorkspaceSnapshotContextData;
  contractData: CreatorGenerationContract;
  backgroundSync: CreatorWorkspaceBackgroundSync | null;
}

export interface CreatorWorkspaceSnapshotFailure {
  ok: false;
  code: CreatorWorkspaceSnapshotFailureCode;
  message: string;
}

export type CreatorWorkspaceSnapshotResult =
  | CreatorWorkspaceSnapshotSuccess
  | CreatorWorkspaceSnapshotFailure;

export interface LoadCreatorWorkspaceSnapshotArgs {
  userId: string;
  xHandle: string;
  input?: Record<string, unknown>;
  refreshPinnedProfile?: boolean;
  forceFreshScrapeForAnalysis?: boolean;
  storedRun?: CreatorWorkspaceSnapshotStoredRun | null;
  allowMockFallback?: boolean;
}

type LoadCreatorWorkspaceSnapshotSerializedArgs = {
  userId: string;
  xHandle: string;
  input: Record<string, unknown>;
  refreshPinnedProfile: boolean;
  forceFreshScrapeForAnalysis: boolean;
};

function normalizeStoredRun(
  storedRun: StoredOnboardingRun | CreatorWorkspaceSnapshotStoredRun | null | undefined,
): CreatorWorkspaceSnapshotStoredRun | null {
  if (!storedRun) {
    return null;
  }

  if ("runId" in storedRun) {
    return {
      id: storedRun.runId,
      input: storedRun.input,
      result: storedRun.result,
    };
  }

  return {
    id: storedRun.id,
    input: storedRun.input,
    result: storedRun.result,
  };
}

async function resolveStoredRun(
  args: LoadCreatorWorkspaceSnapshotArgs,
): Promise<CreatorWorkspaceSnapshotStoredRun | null> {
  const providedRun = normalizeStoredRun(args.storedRun);
  if (providedRun) {
    return providedRun;
  }

  return normalizeStoredRun(
    await readLatestOnboardingRunByHandle(args.userId, args.xHandle),
  );
}

function buildContextData(args: {
  creatorAgentContext: CreatorAgentContext;
  growthOsPayload: GrowthOperatingSystemPayload;
}): CreatorWorkspaceSnapshotContextData {
  return {
    ...args.creatorAgentContext,
    ...args.growthOsPayload,
    unknowns: args.growthOsPayload.unknowns,
  };
}

async function loadCreatorWorkspaceSnapshotImpl(
  args: LoadCreatorWorkspaceSnapshotArgs,
): Promise<CreatorWorkspaceSnapshotResult> {
  const input = args.input ?? {};
  const storedRun = await resolveStoredRun(args);
  if (!storedRun) {
    return {
      ok: false,
      code: "MISSING_ONBOARDING_RUN",
      message: "No onboarding run found for this handle.",
    };
  }

  const storedOnboardingResult = storedRun.result as OnboardingResult;
  if (storedOnboardingResult.source === "mock") {
    return {
      ok: false,
      code: "ONBOARDING_SOURCE_INVALID",
      message:
        "This account was set up with mock fallback data. Re-run onboarding after fixing the real scrape path.",
    };
  }

  const strategyOverrides = extractCreatorStrategyOverrides(input);
  const toneOverrides = extractCreatorToneOverrides(input);
  const overriddenOnboarding = applyCreatorStrategyOverrides({
    onboarding: storedOnboardingResult,
    overrides: strategyOverrides,
  });
  const shouldDeferPinnedRefresh =
    args.refreshPinnedProfile === true && shouldDeferLiveScrapesToWorker();
  if (shouldDeferPinnedRefresh) {
    await enqueueProfileRefreshJobIfNeeded({
      account: args.xHandle,
      userId: args.userId,
    }).catch((error) =>
      console.error("Failed to queue pinned profile refresh:", error),
    );
  }
  if (args.forceFreshScrapeForAnalysis) {
    try {
      await bootstrapScrapeCaptureWithOptions(args.xHandle, {
        pages: 2,
        count: 40,
        targetOriginalPostCount: 40,
        maxDurationMs: 12_000,
        captureMode: "user_tweets",
        forceRefresh: true,
        mergeWithExisting: true,
        userAgent: "chat-inline-profile-analysis",
      });
    } catch (error) {
      console.error("Failed to refresh profile-analysis scrape capture:", error);
    }
  }
  const onboarding = await hydrateOnboardingProfileForAnalysis(overriddenOnboarding);

  const persistedVoiceProfile = await prisma.voiceProfile.findFirst({
    where: {
      userId: args.userId,
      xHandle: args.xHandle,
    },
    select: {
      id: true,
      primaryPersona: true,
      styleCard: true,
      _count: {
        select: {
          goldenExamples: true,
        },
      },
    },
  });
  const parsedStyleCard = persistedVoiceProfile?.styleCard
    ? StyleCardSchema.safeParse(persistedVoiceProfile.styleCard)
    : null;
  const voiceProfile = createEmptyVoiceProfileContext({
    id: persistedVoiceProfile?.id ?? null,
    primaryPersona: persistedVoiceProfile?.primaryPersona ?? null,
    styleCard: parsedStyleCard?.success ? parsedStyleCard.data : null,
    goldenExampleCount: persistedVoiceProfile?._count.goldenExamples ?? 0,
  });
  const styleCard = voiceProfile.styleCard;
  const profileAuditState = styleCard?.profileAuditState ?? null;

  const creatorAgentContext = buildCreatorAgentContext({
    runId: storedRun.id,
    onboarding,
  });
  creatorAgentContext.profileAuditState = profileAuditState;

  const growthOsPayload = await buildGrowthOperatingSystemPayload({
    userId: args.userId,
    xHandle: args.xHandle,
    onboarding,
    context: creatorAgentContext,
    profileAuditState,
  });
  const tonePreference = applyCreatorToneOverrides({
    baseTone: (storedRun.input as OnboardingInput).tone,
    overrides: toneOverrides,
  });
  const backgroundSyncJob = await readLatestActiveOnboardingSyncJobForUser({
    account: args.xHandle,
    userId: args.userId,
  });
  const backgroundSync =
    backgroundSyncJob?.kind === "historical_backfill_year"
      ? {
          jobId: backgroundSyncJob.jobId,
          phase: "archive" as const,
        }
      : backgroundSyncJob?.kind === "context_primer"
        ? {
            jobId: backgroundSyncJob.jobId,
            phase: "primer" as const,
          }
        : null;

  return {
    ok: true,
    storedRun,
    onboarding,
    tonePreference,
    voiceProfile,
    styleCard,
    profileAuditState,
    creatorAgentContext,
    growthOsPayload,
    contextData: buildContextData({
      creatorAgentContext,
      growthOsPayload,
    }),
    contractData: buildCreatorGenerationContract({
      runId: storedRun.id,
      onboarding,
      tonePreference,
      agentContext: creatorAgentContext,
      replyInsights: growthOsPayload.replyInsights,
      strategyAdjustments: growthOsPayload.strategyAdjustments,
      contentInsights: growthOsPayload.contentInsights,
      contentAdjustments: growthOsPayload.contentAdjustments,
    }),
    backgroundSync,
  };
}

export async function loadCreatorWorkspaceSnapshot(
  args: LoadCreatorWorkspaceSnapshotArgs,
): Promise<CreatorWorkspaceSnapshotResult> {
  return loadCreatorWorkspaceSnapshotImpl(
    args.storedRun
      ? args
      : ({
          userId: args.userId,
          xHandle: args.xHandle,
          input: args.input ?? {},
          refreshPinnedProfile: args.refreshPinnedProfile === true,
          forceFreshScrapeForAnalysis: args.forceFreshScrapeForAnalysis === true,
        } satisfies LoadCreatorWorkspaceSnapshotSerializedArgs),
  );
}
