import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  createConversationMemory,
  createConversationMemorySnapshot,
  getConversationMemory,
} from "@/lib/agent-v2/memory/memoryStore";
import {
  StyleCardSchema,
  type UserPreferences,
  type VoiceStyleCard,
} from "@/lib/agent-v2/core/styleProfile";
import {
  applyGrowthStrategyToCreatorProfileHints,
  buildCreatorProfileHintsFromOnboarding,
} from "@/lib/agent-v2/grounding/creatorProfileHints";
import {
  buildPreferenceConstraintsFromPreferences,
  mergeUserPreferences,
  normalizeUserPreferences,
} from "@/lib/agent-v2/core/preferenceConstraints";
import {
  resolveOwnedThreadForWorkspace,
  resolveWorkspaceHandleForRequest,
} from "@/lib/workspaceHandle.server";
import { buildCreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";
import { buildGrowthOperatingSystemPayload } from "@/lib/onboarding/strategy/contextEnrichment";
import { readLatestOnboardingRunByHandle } from "@/lib/onboarding/store/onboardingRunStore";
import type { ConversationalDiagnosticContext } from "@/lib/agent-v2/runtime/diagnostics";
import type {
  CreatorProfileHints,
} from "@/lib/agent-v2/grounding/groundingPacket";
import type { V2ConversationMemory } from "@/lib/agent-v2/contracts/chat";
import type { NormalizedChatTurnDiagnostics } from "@/lib/agent-v2/contracts/turnContract";
import {
  buildRecommendedPlaybookSummaries,
  inferCurrentPlaybookStage,
} from "@/lib/creator/playbooks";
import {
  buildConversationContextFromHistory,
  resolveSelectedDraftContextFromHistory,
  type SelectedDraftContext,
} from "./routeLogic";

export interface RouteStoredThread {
  id: string;
  title: string | null;
  xHandle: string | null;
}

export interface RouteStoredRun {
  id: string;
  input: unknown;
  result: unknown;
}

export interface RouteProfileContext {
  isVerifiedAccount: boolean;
  creatorProfileHints: CreatorProfileHints | null;
  creatorAgentContext: ReturnType<typeof buildCreatorAgentContext> | null;
  growthOsPayload: Awaited<ReturnType<typeof buildGrowthOperatingSystemPayload>> | null;
  diagnosticContext: ConversationalDiagnosticContext | null;
  styleCard: VoiceStyleCard | null;
  effectiveUserPreferences: UserPreferences | null;
  mergedPreferenceConstraints: string[];
}

export interface RouteConversationContext {
  recentHistoryStr: string;
  activeDraft: string | undefined;
  storedMemory: V2ConversationMemory;
  selectedDraftContext: SelectedDraftContext | null;
}

function buildConversationalDiagnosticContext(args: {
  agentContext: ReturnType<typeof buildCreatorAgentContext>;
  growthOs: Awaited<ReturnType<typeof buildGrowthOperatingSystemPayload>>;
}): ConversationalDiagnosticContext {
  const reasons = [
    args.growthOs.profileConversionAudit.gaps[0],
    args.growthOs.contentInsights.cautionSignals[0],
    args.growthOs.strategyAdjustments.notes[0],
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const nextActions = [
    args.growthOs.profileConversionAudit.recommendedBioEdits[0],
    args.growthOs.strategyAdjustments.experiments[0] || args.growthOs.strategyAdjustments.reinforce[0],
    args.growthOs.contentAdjustments.experiments[0] || args.growthOs.contentAdjustments.reinforce[0],
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return {
    stage: inferCurrentPlaybookStage(args.agentContext),
    knownFor: args.agentContext.growthStrategySnapshot.knownFor,
    reasons,
    nextActions,
    recommendedPlaybooks: buildRecommendedPlaybookSummaries(args.agentContext, 2),
  };
}

export async function resolveRouteThreadState(args: {
  request: NextRequest;
  session: { user: { id: string } };
  bodyHandle: string | null;
  threadId: string;
}): Promise<
  | { ok: false; response: Response }
  | { ok: true; activeHandle: string; storedThread: RouteStoredThread }
> {
  const workspaceHandle = await resolveWorkspaceHandleForRequest({
    request: args.request,
    session: args.session,
    bodyHandle: args.bodyHandle,
  });
  if (!workspaceHandle.ok) {
    return workspaceHandle;
  }

  const activeHandle = workspaceHandle.xHandle;

  if (args.threadId) {
    const ownedThread = await resolveOwnedThreadForWorkspace({
      threadId: args.threadId,
      userId: args.session.user.id,
      xHandle: activeHandle,
    });
    if (!ownedThread.ok) {
      return ownedThread;
    }

    return {
      ok: true,
      activeHandle,
      storedThread: {
        id: ownedThread.thread.id,
        title: ownedThread.thread.title ?? null,
        xHandle: ownedThread.thread.xHandle ?? null,
      },
    };
  }

  const createdThread = await prisma.chatThread.create({
    data: {
      userId: args.session.user.id,
      xHandle: activeHandle,
    },
  });
  await createConversationMemory({
    threadId: createdThread.id,
    userId: args.session.user.id,
  });

  return {
    ok: true,
    activeHandle,
    storedThread: {
      id: createdThread.id,
      title: createdThread.title ?? null,
      xHandle: createdThread.xHandle ?? null,
    },
  };
}

export async function resolveRouteStoredRun(args: {
  runId: string;
  userId: string;
  activeHandle: string;
}): Promise<
  | { ok: false; response: Response }
  | { ok: true; storedRun: RouteStoredRun | null }
> {
  if (args.runId) {
    const matchedRun = await prisma.onboardingRun.findUnique({
      where: { id: args.runId },
    });
    const matchedRunHandle =
      matchedRun?.input &&
      typeof matchedRun.input === "object" &&
      !Array.isArray(matchedRun.input)
        ? ((matchedRun.input as { account?: string }).account?.trim().replace(/^@+/, "").toLowerCase() ||
          null)
        : null;

    if (
      !matchedRun ||
      matchedRun.userId !== args.userId ||
      matchedRunHandle !== args.activeHandle
    ) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            errors: [{ field: "runId", message: "Onboarding run not found for this handle." }],
          },
          { status: 404 },
        ),
      };
    }

    return {
      ok: true,
      storedRun: {
        id: matchedRun.id,
        input: matchedRun.input,
        result: matchedRun.result,
      },
    };
  }

  const latestRun = await readLatestOnboardingRunByHandle(args.userId, args.activeHandle);
  return {
    ok: true,
    storedRun: latestRun
      ? {
          id: latestRun.runId,
          input: latestRun.input,
          result: latestRun.result,
        }
      : null,
  };
}

export async function resolveRouteProfileContext(args: {
  userId: string;
  activeHandle: string;
  storedRun: RouteStoredRun | null;
  transientPreferenceSettings: Partial<UserPreferences> | null;
  preferenceConstraints: string[];
}): Promise<RouteProfileContext> {
  const onboardingResult = (args.storedRun?.result || null) as
    | {
        profile?: {
          isVerified?: boolean;
        };
      }
    | null;
  const isVerifiedAccount = onboardingResult?.profile?.isVerified === true;

  let creatorAgentContext: ReturnType<typeof buildCreatorAgentContext> | null = null;
  let growthOsPayload: Awaited<ReturnType<typeof buildGrowthOperatingSystemPayload>> | null = null;
  let diagnosticContext: ConversationalDiagnosticContext | null = null;
  const persistedVoiceProfilePromise = prisma.voiceProfile.findFirst({
    where: {
      userId: args.userId,
      xHandle: args.activeHandle,
    },
  });

  const creatorProfileHintsPromise =
    args.storedRun?.id && args.storedRun?.result
      ? (async () => {
          try {
            const onboarding = args.storedRun!.result as unknown as Parameters<
              typeof buildCreatorProfileHintsFromOnboarding
            >[0]["onboarding"];
            const baseHints = buildCreatorProfileHintsFromOnboarding({
              runId: args.storedRun!.id,
              onboarding,
            });
            const persistedVoiceProfile = await persistedVoiceProfilePromise;
            const parsedStyleCard = persistedVoiceProfile?.styleCard
              ? StyleCardSchema.safeParse(persistedVoiceProfile.styleCard)
              : null;
            const profileAuditState = parsedStyleCard?.success
              ? parsedStyleCard.data.profileAuditState ?? null
              : null;
            creatorAgentContext = buildCreatorAgentContext({
              runId: args.storedRun!.id,
              onboarding,
            });
            creatorAgentContext.profileAuditState = profileAuditState;
            growthOsPayload = await buildGrowthOperatingSystemPayload({
              userId: args.userId,
              xHandle: args.activeHandle,
              onboarding,
              context: creatorAgentContext,
              profileAuditState,
            });
            diagnosticContext = buildConversationalDiagnosticContext({
              agentContext: creatorAgentContext,
              growthOs: growthOsPayload,
            });

            return applyGrowthStrategyToCreatorProfileHints({
              hints: baseHints,
              growthStrategySnapshot: creatorAgentContext.growthStrategySnapshot,
              learningSignals: [
                ...growthOsPayload.replyInsights.bestSignals,
                ...growthOsPayload.replyInsights.cautionSignals,
                ...growthOsPayload.strategyAdjustments.experiments,
                ...growthOsPayload.contentInsights.bestSignals,
                ...growthOsPayload.contentInsights.cautionSignals,
                ...growthOsPayload.contentAdjustments.experiments,
              ],
            });
          } catch {
            creatorAgentContext = null;
            growthOsPayload = null;
            diagnosticContext = null;
            return null;
          }
        })()
      : Promise.resolve(null);

  const [creatorProfileHints, persistedVoiceProfile] = await Promise.all([
    creatorProfileHintsPromise,
    persistedVoiceProfilePromise,
  ]);

  const parsedPersistedStyleCard = persistedVoiceProfile?.styleCard
    ? StyleCardSchema.safeParse(persistedVoiceProfile.styleCard)
    : null;
  const styleCard: VoiceStyleCard | null =
    parsedPersistedStyleCard?.success ? parsedPersistedStyleCard.data : null;
  const storedUserPreferences = normalizeUserPreferences(
    parsedPersistedStyleCard?.success
      ? parsedPersistedStyleCard.data.userPreferences
      : null,
  );
  const effectiveUserPreferences = mergeUserPreferences(
    storedUserPreferences,
    args.transientPreferenceSettings,
  );
  const mergedPreferenceConstraints = Array.from(
    new Set([
      ...buildPreferenceConstraintsFromPreferences(effectiveUserPreferences, {
        isVerifiedAccount,
      }),
      ...args.preferenceConstraints,
    ]),
  );

  return {
    isVerifiedAccount,
    creatorProfileHints,
    creatorAgentContext,
    growthOsPayload,
    diagnosticContext,
    styleCard,
    effectiveUserPreferences,
    mergedPreferenceConstraints,
  };
}

export async function loadRouteConversationContext(args: {
  storedThread: RouteStoredThread;
  history: unknown;
  selectedDraftContext: SelectedDraftContext | null;
  transcriptMessage: string;
  routeUserMessage: string;
  clientTurnId: string | null;
  explicitIntent:
    | "coach"
    | "ideate"
    | "plan"
    | "planner_feedback"
    | "draft"
    | "review"
    | "edit"
    | "answer_question"
    | null;
  turnSource: string;
  artifactContext: unknown;
  routingDiagnostics: NormalizedChatTurnDiagnostics;
  formatPreference: "shortform" | "longform" | "thread" | null;
  threadFramingStyle: string | null;
  structuredReplyContext:
    | {
        sourceText?: string | null;
        sourceUrl?: string | null;
        authorHandle?: string | null;
      }
    | null;
}): Promise<RouteConversationContext> {
  const createdUserMessage = await prisma.chatMessage.create({
    data: {
      threadId: args.storedThread.id,
      role: "user",
      content: args.transcriptMessage || args.routeUserMessage,
      data: {
        version: "user_context_v2",
        clientTurnId: args.clientTurnId,
        explicitIntent: args.explicitIntent,
        turnSource: args.turnSource,
        artifactContext: args.artifactContext,
        routingDiagnostics: args.routingDiagnostics,
        formatPreference: args.formatPreference,
        threadFramingStyle: args.threadFramingStyle,
        selectedDraftContext: args.selectedDraftContext,
        replyContext: args.structuredReplyContext,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  const [loadedThreadMessages, conversationMemory] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { threadId: args.storedThread.id },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: {
        id: true,
        role: true,
        content: true,
        data: true,
        createdAt: true,
      },
    }),
    getConversationMemory({ threadId: args.storedThread.id }),
  ]);

  const storedMemory = createConversationMemorySnapshot(conversationMemory);
  const chronologicalHistory = [...loadedThreadMessages].reverse();
  const selectedDraftContext = resolveSelectedDraftContextFromHistory({
    history: chronologicalHistory,
    selectedDraftContext: args.selectedDraftContext,
    activeDraftRef: storedMemory.activeDraftRef,
  });
  const context = buildConversationContextFromHistory({
    history: chronologicalHistory,
    selectedDraftContext,
    excludeMessageId: createdUserMessage.id,
  });

  return {
    recentHistoryStr: context.recentHistory,
    activeDraft: context.activeDraft,
    storedMemory,
    selectedDraftContext,
  };
}

export function loadInlineConversationContext(args: {
  history: unknown;
  selectedDraftContext: SelectedDraftContext | null;
}): RouteConversationContext {
  const context = buildConversationContextFromHistory({
    history: args.history,
    selectedDraftContext: args.selectedDraftContext,
  });

  return {
    recentHistoryStr: context.recentHistory,
    activeDraft: context.activeDraft,
    storedMemory: createConversationMemorySnapshot(null),
    selectedDraftContext: args.selectedDraftContext,
  };
}
