import { buildCreatorProfileHintsFromOnboarding } from "../grounding/creatorProfileHints";
import { buildProfileReplyContext } from "../grounding/profileReplyContext";
import { buildUserContextString } from "../grounding/userContextString";
import { planTurn } from "../runtime/turnPlanner";
import { hydrateTurnContextWorkers } from "../workers/turnContextHydrationWorkers.ts";
import { createConversationMemorySnapshot } from "../memory/memoryStore";
import { scopeMemoryForCurrentTurn } from "../memory/turnScopedMemory";
import { buildSessionConstraints } from "../core/sessionConstraints";
import {
  normalizeHandleForContext,
  type ConversationServices,
  type StoredOnboardingRun,
} from "./services.ts";
import type { OrchestratorInput } from "./types.ts";
import type { SessionConstraint, V2ConversationMemory } from "../contracts/chat";
import type { CreatorProfileHints } from "../grounding/groundingPacket";
import type { ProfileReplyContext } from "../grounding/profileReplyContext";
import type { VoiceStyleCard } from "../core/styleProfile";
import {
  createEmptyVoiceProfileContext,
  type VoiceProfileContext,
} from "../core/voiceProfileContext";
import type { RetrievalResult } from "../core/retrieval";
import type { RuntimeWorkerExecution } from "../runtime/runtimeContracts.ts";

export interface TurnContext {
  userId: string;
  xHandle: string | null;
  effectiveXHandle: string;
  runId: string | undefined;
  threadId: string | undefined;
  userMessage: string;
  planSeedMessage: string | null;
  recentHistory: string;
  activeDraft: string | undefined;
  focusedThreadPostIndex: number | null;
  turnSource: OrchestratorInput["turnSource"];
  artifactContext: OrchestratorInput["artifactContext"];
  planSeedSource: OrchestratorInput["planSeedSource"];
  resolvedWorkflow: OrchestratorInput["resolvedWorkflow"];
  replyHandlingBypassedReason: OrchestratorInput["replyHandlingBypassedReason"];
  formatPreference: OrchestratorInput["formatPreference"];
  threadFramingStyle: OrchestratorInput["threadFramingStyle"];
  explicitIntent: OrchestratorInput["explicitIntent"];
  diagnosticContext: OrchestratorInput["diagnosticContext"];
  preloadedRun: StoredOnboardingRun | null;
  
  creatorProfileHints: CreatorProfileHints | null;
  userContextString: string;
  profileReplyContext: ProfileReplyContext | null;
  memory: V2ConversationMemory;
  effectiveActiveConstraints: string[];
  sessionConstraints: SessionConstraint[];
  turnPlan: ReturnType<typeof planTurn>;
  
  voiceProfile: VoiceProfileContext;
  voiceProfileId: string | null;
  primaryPersona: VoiceProfileContext["primaryPersona"];
  goldenExampleCount: number;
  styleCard: VoiceStyleCard | null;
  anchors: RetrievalResult;
  initialWorkerExecutions: RuntimeWorkerExecution[];
}

export async function buildTurnContext(
  input: OrchestratorInput,
  services: ConversationServices,
): Promise<TurnContext> {
  const {
    userId,
    xHandle,
    runId,
    threadId,
    userMessage,
    planSeedMessage,
    recentHistory,
    explicitIntent,
    activeDraft,
    focusedThreadPostIndex,
    turnSource,
    artifactContext,
    planSeedSource,
    resolvedWorkflow,
    replyHandlingBypassedReason,
    formatPreference,
    threadFramingStyle,
    creatorProfileHints: inputCreatorProfileHints,
    userContextString: inputUserContextString,
    profileReplyContext: inputProfileReplyContext,
    diagnosticContext,
    preferenceConstraints,
    preloadedRun: inputPreloadedRun,
    preloadedVoiceProfile,
    preloadedStyleCard,
  } = input;

  const resolvedFormatPreference =
    formatPreference ??
    (artifactContext?.kind === "selected_angle" && artifactContext.formatHint === "thread"
      ? "thread"
      : null);

  const preloadedRun = inputPreloadedRun ?? (runId ? await services.getOnboardingRun(runId) : null);
  const runInputRecord = preloadedRun?.input as Record<string, unknown> | undefined;
  const runInputHandle =
    typeof runInputRecord?.account === "string" ? runInputRecord.account : null;
  
  const effectiveXHandle =
    normalizeHandleForContext(xHandle) ??
    normalizeHandleForContext(runInputHandle) ??
    "default";

  const creatorProfileHints =
    inputCreatorProfileHints ||
    (() => {
      const onboarding = preloadedRun?.result;
      if (!runId || !onboarding) {
        return null;
      }

      try {
        return buildCreatorProfileHintsFromOnboarding({
          runId,
          onboarding: onboarding as Parameters<typeof buildCreatorProfileHintsFromOnboarding>[0]["onboarding"],
        });
      } catch {
        return null;
      }
    })();
  const userContextString =
    typeof inputUserContextString === "string" && inputUserContextString.trim().length > 0
      ? inputUserContextString.trim()
      : buildUserContextString({
          onboardingResult:
            (preloadedRun?.result as Parameters<typeof buildUserContextString>[0]["onboardingResult"]) ??
            null,
          creatorProfileHints,
        });
  const profileReplyContext =
    inputProfileReplyContext ??
    buildProfileReplyContext({
      onboardingResult:
        (preloadedRun?.result as Parameters<typeof buildProfileReplyContext>[0]["onboardingResult"]) ??
        null,
      creatorProfileHints,
      diagnosticContext,
    });

  let memoryRecord = await services.getConversationMemory({ runId, threadId });
  if (!memoryRecord) {
    memoryRecord = await services.createConversationMemory({
      runId,
      threadId,
      userId: userId === "anonymous" ? null : userId,
    });
  }

  const persistedMemory = createConversationMemorySnapshot(
    memoryRecord as unknown as Record<string, unknown>,
  );
  const memory = scopeMemoryForCurrentTurn({
    userMessage,
    activeDraft,
    memory: persistedMemory,
    resolvedWorkflow,
  });
  
  const effectiveActiveConstraints = Array.from(
    new Set([
      ...memory.activeConstraints,
      ...((preferenceConstraints || []).filter((value) => value.trim().length > 0)),
    ]),
  );
  const sessionConstraints = buildSessionConstraints({
    activeConstraints: effectiveActiveConstraints,
    inferredConstraints: memory.inferredSessionConstraints,
    pendingPlan: memory.pendingPlan,
  });

  const turnPlan = planTurn({
    userMessage,
    recentHistory,
    activeDraft,
    memory,
    explicitIntent,
  });

  const {
    styleCard,
    anchors,
    workerExecutions: initialWorkerExecutions,
  } = await hydrateTurnContextWorkers({
    userId,
    effectiveXHandle,
    userMessage,
    topicSummary: memory.topicSummary,
    preloadedStyleCard:
      typeof preloadedStyleCard !== "undefined"
        ? preloadedStyleCard
        : preloadedVoiceProfile?.styleCard,
    services,
  });
  const voiceProfileBase =
    typeof preloadedVoiceProfile !== "undefined"
      ? preloadedVoiceProfile ?? createEmptyVoiceProfileContext()
      : typeof preloadedStyleCard !== "undefined"
        ? createEmptyVoiceProfileContext({
            styleCard: preloadedStyleCard,
          })
      : await services.getVoiceProfileContext({
          userId,
          xHandle: effectiveXHandle,
        });
  const voiceProfile: VoiceProfileContext = {
    ...voiceProfileBase,
    styleCard,
  };

  return {
    userId,
    xHandle: xHandle ?? null,
    effectiveXHandle,
    runId,
    threadId,
    userMessage,
    planSeedMessage: planSeedMessage ?? null,
    recentHistory,
    activeDraft,
    focusedThreadPostIndex: focusedThreadPostIndex ?? null,
    turnSource,
    artifactContext,
    planSeedSource,
    resolvedWorkflow,
    replyHandlingBypassedReason,
    formatPreference: resolvedFormatPreference,
    threadFramingStyle,
    explicitIntent,
    diagnosticContext,
    preloadedRun,
    creatorProfileHints,
    userContextString,
    profileReplyContext,
    memory,
    effectiveActiveConstraints,
    sessionConstraints,
    turnPlan,
    voiceProfile,
    voiceProfileId: voiceProfile.id,
    primaryPersona: voiceProfile.primaryPersona,
    goldenExampleCount: voiceProfile.goldenExampleCount,
    styleCard,
    anchors,
    initialWorkerExecutions,
  };
}
