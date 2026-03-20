import {
  StyleCardSchema,
  type ProfileAuditState,
  type VoiceStyleCard,
} from "../agent-v2/core/styleProfile";
import { prisma } from "../db";
import { buildCreatorGenerationContract } from "../onboarding/contracts/generationContract";
import type { CreatorGenerationContract } from "../onboarding/contracts/generationContract";
import {
  hydrateOnboardingProfileForAnalysis,
} from "../onboarding/profile/profileHydration";
import { shouldDeferLiveScrapesToWorker } from "../onboarding/pipeline/liveScrapePolicy";
import { enqueueProfileRefreshJobIfNeeded } from "../onboarding/pipeline/scrapeJob";
import {
  readLatestOnboardingRunByHandle,
  type StoredOnboardingRun,
} from "../onboarding/store/onboardingRunStore";
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

export interface CreatorWorkspaceSnapshotSuccess {
  ok: true;
  storedRun: CreatorWorkspaceSnapshotStoredRun;
  onboarding: OnboardingResult;
  tonePreference: TonePreference;
  styleCard: VoiceStyleCard | null;
  profileAuditState: ProfileAuditState | null;
  creatorAgentContext: CreatorAgentContext;
  growthOsPayload: GrowthOperatingSystemPayload;
  contextData: CreatorWorkspaceSnapshotContextData;
  contractData: CreatorGenerationContract;
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
  storedRun?: CreatorWorkspaceSnapshotStoredRun | null;
  allowMockFallback?: boolean;
}

type LoadCreatorWorkspaceSnapshotSerializedArgs = {
  userId: string;
  xHandle: string;
  input: Record<string, unknown>;
  refreshPinnedProfile: boolean;
};

function resolveAllowMockFallback(): boolean {
  return (
    process.env.ONBOARDING_ALLOW_MOCK_FALLBACK?.trim() === "1" ||
    process.env.NODE_ENV !== "production"
  );
}

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
  const allowMockFallback =
    args.allowMockFallback === true ? true : resolveAllowMockFallback();
  if (!allowMockFallback && storedOnboardingResult.source === "mock") {
    return {
      ok: false,
      code: "ONBOARDING_SOURCE_INVALID",
      message:
        "This account was set up with fallback data. Re-run onboarding after configuring scrape credentials.",
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
  const onboarding = await hydrateOnboardingProfileForAnalysis(overriddenOnboarding);

  const persistedVoiceProfile = await prisma.voiceProfile.findFirst({
    where: {
      userId: args.userId,
      xHandle: args.xHandle,
    },
    select: {
      styleCard: true,
    },
  });
  const parsedStyleCard = persistedVoiceProfile?.styleCard
    ? StyleCardSchema.safeParse(persistedVoiceProfile.styleCard)
    : null;
  const styleCard = parsedStyleCard?.success ? parsedStyleCard.data : null;
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

  return {
    ok: true,
    storedRun,
    onboarding,
    tonePreference,
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
        } satisfies LoadCreatorWorkspaceSnapshotSerializedArgs),
  );
}
