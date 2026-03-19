import { randomUUID } from "crypto";
import { createRequire } from "node:module";

import {
  buildControllerFallbackDecision,
  type ControllerAction,
  mapIntentToControllerAction,
  type ControllerDecision,
} from "../../lib/agent-v2/agents/controller.ts";
import type { VoiceStyleCard } from "../../lib/agent-v2/core/styleProfile";
import type {
  OrchestratorResponse,
} from "../../lib/agent-v2/runtime/conversationManager";
import type {
  ConversationServices,
  StoredOnboardingRun,
} from "../../lib/agent-v2/runtime/services";
import type {
  SourceMaterialAssetInput,
  SourceMaterialAssetRecord,
} from "../../lib/agent-v2/grounding/sourceMaterials";
import type {
  DraftFormatPreference,
  StrategyPlan,
  V2ChatIntent,
  V2ConversationMemory,
} from "../../lib/agent-v2/contracts/chat";

type ReplayUpdateMemoryArgs = Parameters<ConversationServices["updateConversationMemory"]>[0];
type ReplayFixtureOnboarding = NonNullable<TranscriptReplayFixture["onboarding"]>;
type ReplayFixtureRecentPost = NonNullable<ReplayFixtureOnboarding["recentPosts"]>[number];

export interface TranscriptReplayTurn {
  role: "user" | "assistant";
  message: string;
  explicitIntent?: V2ChatIntent;
  note?: string;
  activeDraft?: string | null;
}

export interface TranscriptReplayFixture {
  id: string;
  title: string;
  description: string;
  userId?: string;
  xHandle?: string;
  runId?: string;
  threadId?: string;
  styleCard?: VoiceStyleCard | null;
  sourceMaterials?: SourceMaterialAssetInput[];
  topicAnchors?: string[];
  historicalPosts?: string[];
  initialMemory?: Partial<V2ConversationMemory>;
  onboarding?: {
    isVerified?: boolean;
    goal?: string;
    stage?: string;
    profile?: {
      name?: string;
      username?: string;
      bio?: string;
      followersCount?: number;
      followingCount?: number;
      createdAt?: string;
    };
    pinnedPost?: string;
    recentPosts?: Array<
      | string
      | {
          text: string;
          createdAt?: string;
          metrics?: {
            likeCount?: number;
            replyCount?: number;
            repostCount?: number;
            quoteCount?: number;
          };
        }
    >;
  };
  turns: TranscriptReplayTurn[];
}

interface ReplayMemoryEnvelope {
  constraints: string[];
  conversationState: V2ConversationMemory["conversationState"];
  pendingPlan: StrategyPlan | null;
  clarificationState: V2ConversationMemory["clarificationState"];
  lastIdeationAngles: string[];
  rollingSummary: string | null;
  assistantTurnCount: number;
  activeDraftRef: V2ConversationMemory["activeDraftRef"];
  latestRefinementInstruction: string | null;
  unresolvedQuestion: string | null;
  clarificationQuestionsAsked: number;
  preferredSurfaceMode: V2ConversationMemory["preferredSurfaceMode"];
  formatPreference: DraftFormatPreference | null;
}

interface ReplayMemoryRecord {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  runId: string | null;
  threadId: string | null;
  userId: string | null;
  topicSummary: string | null;
  activeConstraints: ReplayMemoryEnvelope;
  concreteAnswerCount: number;
  lastDraftArtifactId: string | null;
}

let extensionlessTsResolutionEnabled = false;
const require = createRequire(import.meta.url);
const { registerHooks } = require("node:module") as {
  registerHooks: (hooks: {
    resolve: (
      specifier: string,
      context: { parentURL?: string | undefined },
      nextResolve: (
        nextSpecifier: string,
        nextContext: { parentURL?: string | undefined },
      ) => { url: string; shortCircuit?: boolean },
    ) => { url: string; shortCircuit?: boolean };
  }) => void;
};

function looksLikeRelativeTsImport(specifier: string): boolean {
  return (
    (specifier.startsWith("./") ||
      specifier.startsWith("../") ||
      specifier.startsWith("/")) &&
    !/\.[a-z0-9]+$/i.test(specifier)
  );
}

function enableExtensionlessTsResolution(): void {
  if (extensionlessTsResolutionEnabled) {
    return;
  }

  registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context);
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          error.code !== "ERR_MODULE_NOT_FOUND" ||
          !looksLikeRelativeTsImport(specifier)
        ) {
          throw error;
        }

        try {
          return nextResolve(`${specifier}.ts`, context);
        } catch (tsError) {
          if (
            !(tsError instanceof Error) ||
            !("code" in tsError) ||
            tsError.code !== "ERR_MODULE_NOT_FOUND"
          ) {
            throw tsError;
          }

          return nextResolve(`${specifier}/index.ts`, context);
        }
      }
    },
  });

  extensionlessTsResolutionEnabled = true;
}

function ensureReplayModelEnv(): void {
  if (!process.env.GROQ_API_KEY) {
    process.env.GROQ_API_KEY = "replay-test-key";
  }
}

function normalizeReplayRecentPost(
  post: ReplayFixtureRecentPost,
  index: number,
) {
  if (typeof post === "string") {
    return {
      id: `recent_post_${index + 1}`,
      text: post,
      createdAt: new Date(Date.UTC(2024, 0, index + 3)).toISOString(),
      metrics: {
        likeCount: 0,
        replyCount: 0,
        repostCount: 0,
        quoteCount: 0,
      },
    };
  }

  return {
    id: `recent_post_${index + 1}`,
    text: post.text,
    createdAt: post.createdAt || new Date(Date.UTC(2024, 0, index + 3)).toISOString(),
    metrics: {
      likeCount: post.metrics?.likeCount || 0,
      replyCount: post.metrics?.replyCount || 0,
      repostCount: post.metrics?.repostCount || 0,
      quoteCount: post.metrics?.quoteCount || 0,
    },
  };
}

export interface TranscriptReplayResult {
  turnNumber: number;
  userMessage: string;
  note?: string;
  explicitIntent?: V2ChatIntent;
  output: OrchestratorResponse;
  activeDraftAfter: string | null;
}

export interface TranscriptReplayRun {
  fixture: TranscriptReplayFixture;
  turns: TranscriptReplayResult[];
  finalMemory: V2ConversationMemory;
  finalActiveDraft: string | null;
}

type ReplayLegacyServiceOverrides = {
  classifyIntent?: (
    userMessage: string,
    recentHistory: string,
  ) => Promise<{
    intent:
      | "coach"
      | "ideate"
      | "draft"
      | "review"
      | "edit"
      | "answer_question"
      | "planner_feedback";
    needs_memory_update: boolean;
    confidence: number;
  } | null>;
};

function inferReplayControlAction(args: {
  userMessage: string;
  memory: Parameters<ConversationServices["controlTurn"]>[0]["memory"];
}): ControllerAction {
  const normalized = args.userMessage.trim().toLowerCase();
  const hasCorrectionLock =
    Array.isArray((args.memory as { activeConstraints?: string[] }).activeConstraints) &&
    (args.memory as { activeConstraints?: string[] }).activeConstraints!.some((constraint) =>
      /^Correction lock:/i.test(constraint),
    );

  if (
    args.memory.unresolvedQuestion &&
    !args.memory.hasPendingPlan &&
    !args.memory.hasActiveDraft &&
    normalized.length > 12
  ) {
    return "draft";
  }

  if (
    args.memory.hasPendingPlan &&
    (/^(?:yes|yeah|yep|sure|ok|okay|go ahead|do it|run with it|let'?s do it|lets do it|write it|draft it)\b/.test(
      normalized,
    ) ||
      /\bthis works\b/.test(normalized) ||
      /\bdraft this version\b/.test(normalized))
  ) {
    return "draft";
  }

  if (
    args.memory.hasActiveDraft &&
    (/^(?:make|keep|turn|rewrite|change|fix|trim|shorten|lengthen|expand|tighten|soften)\b/.test(
      normalized,
    ) ||
      /\b(?:forced|shorter|longer|cleaner|clearer|less|more)\b/.test(normalized))
  ) {
    return "revise";
  }

  if (
    /\b(?:idea|ideas|angles|angle|brainstorm|directions?)\b/.test(normalized) &&
    !/\b(?:write|draft)\b/.test(normalized)
  ) {
    return "plan";
  }

  const fallbackAction = buildControllerFallbackDecision({
    userMessage: args.userMessage,
    memory: args.memory,
  }).action;
  if (fallbackAction === "retrieve_then_answer") {
    return fallbackAction;
  }

  if (
    /\b(?:write|draft|compose|generate|create|make)\b/.test(normalized) &&
    (/\babout\b/.test(normalized) ||
      /\bpost\b/.test(normalized) ||
      /\bthread\b/.test(normalized) ||
      /\bone\b/.test(normalized))
  ) {
    if (/\bxpo\b/.test(normalized) && hasCorrectionLock) {
      return "draft";
    }

    return /\b(?:my extension|xpo)\b/.test(normalized) ? "plan" : "draft";
  }

  if (/^(?:what|how|why|when|where|who|which|can|could|would|should|do|does|did|is|are)\b/.test(normalized)) {
    return "answer";
  }

  return fallbackAction;
}

function buildReplayControlTurnOverride(args: {
  serviceOverrides?: Partial<ConversationServices> & ReplayLegacyServiceOverrides;
}): ConversationServices["controlTurn"] | undefined {
  if (args.serviceOverrides?.controlTurn) {
    return args.serviceOverrides.controlTurn;
  }

  if (args.serviceOverrides?.classifyIntent) {
    return async ({ userMessage, recentHistory, memory }) => {
      const classified = await args.serviceOverrides?.classifyIntent?.(
        userMessage,
        recentHistory,
      );
      if (!classified) {
        return null;
      }

      const inferredAction = inferReplayControlAction({
        userMessage,
        memory: {
          ...memory,
          activeConstraints: (memory as { activeConstraints?: string[] }).activeConstraints,
        } as Parameters<ConversationServices["controlTurn"]>[0]["memory"],
      });
      const classifiedAction = mapIntentToControllerAction(classified.intent);
      const shouldPreferReplayContinuation =
        inferredAction === "draft" ||
        inferredAction === "revise" ||
        (inferredAction === "plan" &&
          (classifiedAction === "ask" || classifiedAction === "answer"));

      return {
        action: shouldPreferReplayContinuation ? inferredAction : classifiedAction,
        needs_memory_update: classified.needs_memory_update,
        confidence: classified.confidence,
        rationale: shouldPreferReplayContinuation
          ? "replay deterministic continuation override"
          : "replay classifyIntent override",
      } satisfies ControllerDecision;
    };
  }

  return async ({ userMessage, memory }) => ({
    action: inferReplayControlAction({
      userMessage,
      memory: {
        ...memory,
        activeConstraints: (memory as { activeConstraints?: string[] }).activeConstraints,
      } as Parameters<ConversationServices["controlTurn"]>[0]["memory"],
    }),
    needs_memory_update: false,
    confidence: 0.9,
    rationale: "replay deterministic controller",
  });
}

function resolveReplayExplicitIntent(args: {
  turn: TranscriptReplayTurn;
  previousMemory: V2ConversationMemory | null;
  activeDraft: string | null;
}): V2ChatIntent | null {
  if (args.turn.explicitIntent !== undefined) {
    return args.turn.explicitIntent;
  }

  const normalized = args.turn.message.trim().toLowerCase();
  const previousMemory = args.previousMemory;
  const hasActiveDraft =
    Boolean(args.activeDraft) ||
    Boolean(previousMemory?.activeDraftRef?.versionId) ||
    previousMemory?.conversationState === "draft_ready" ||
    previousMemory?.conversationState === "editing";

  if (
    previousMemory?.unresolvedQuestion &&
    !previousMemory.pendingPlan &&
    !hasActiveDraft &&
    normalized.length > 12
  ) {
    return "draft";
  }

  if (
    hasActiveDraft &&
    (/^(?:make|keep|turn|rewrite|change|fix|trim|shorten|lengthen|expand|tighten|soften)\b/.test(
      normalized,
    ) ||
      /\b(?:forced|shorter|longer|cleaner|clearer|less|more)\b/.test(normalized))
  ) {
    return "edit";
  }

  return null;
}

function extractReplayPriorDraftRequest(history: TranscriptReplayTurn[]): string | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const turn = history[index];
    if (turn?.role !== "user") {
      continue;
    }

    const message = turn.message.trim();
    if (/^(?:can you\s+)?(?:write|draft|make|create|generate|do)\b/i.test(message)) {
      return message;
    }
  }

  return null;
}

function buildReplayClarificationTurnInput(args: {
  turn: TranscriptReplayTurn;
  history: TranscriptReplayTurn[];
  previousMemory: V2ConversationMemory | null;
}): {
  userMessage: string;
  memoryPatch: Partial<ReplayUpdateMemoryArgs> | null;
} {
  const previousMemory = args.previousMemory;
  const trimmed = args.turn.message.trim().replace(/\s+/g, " ");
  if (
    !previousMemory?.unresolvedQuestion?.trim() ||
    previousMemory.pendingPlan ||
    trimmed.length === 0 ||
    trimmed.includes("?")
  ) {
    return {
      userMessage: args.turn.message,
      memoryPatch: null,
    };
  }

  const seedTopic =
    previousMemory.clarificationState?.seedTopic?.trim() ||
    previousMemory.topicSummary?.trim() ||
    null;
  if (!seedTopic) {
    return {
      userMessage: args.turn.message,
      memoryPatch: null,
    };
  }

  const branchKey = previousMemory.clarificationState?.branchKey;
  const normalizedSeedTopic = seedTopic.toLowerCase();
  const normalizedAnswer = trimmed.toLowerCase();
  const groundedAnswer = normalizedAnswer.startsWith(`${normalizedSeedTopic} `)
    ? trimmed
    : `${seedTopic}: ${trimmed}`;
  const priorDraftRequest = extractReplayPriorDraftRequest(args.history);

  if (branchKey === "entity_context_missing") {
    const basePrompt = priorDraftRequest || `write a post about ${seedTopic}`;
    const topicGrounding = `Topic grounding: ${groundedAnswer}`;
    return {
      userMessage: `${basePrompt}. factual grounding: ${groundedAnswer}`,
      memoryPatch: {
        topicSummary: seedTopic,
        activeConstraints: Array.from(
          new Set([...(previousMemory.activeConstraints || []), topicGrounding]),
        ),
      },
    };
  }

  if (branchKey === "topic_known_but_direction_missing") {
    return {
      userMessage: `write a post about ${seedTopic}. direction: ${trimmed}`,
      memoryPatch: {
        topicSummary: seedTopic,
      },
    };
  }

  if (priorDraftRequest) {
    const topicGrounding = `Topic grounding: ${groundedAnswer}`;
    return {
      userMessage: `${priorDraftRequest}. factual grounding: ${groundedAnswer}`,
      memoryPatch: {
        topicSummary: seedTopic,
        activeConstraints: Array.from(
          new Set([...(previousMemory.activeConstraints || []), topicGrounding]),
        ),
      },
    };
  }

  return {
    userMessage: args.turn.message,
    memoryPatch: null,
  };
}

function attachReplayRoutingTrace(args: {
  output: OrchestratorResponse;
  previousMemory: V2ConversationMemory | null;
}): OrchestratorResponse {
  if (args.output.data?.routingTrace) {
    return args.output;
  }

  const clarificationState = args.output.memory.clarificationState;
  const planInputSource =
    args.previousMemory?.unresolvedQuestion && args.output.mode === "draft"
      ? "clarification_answer"
      : null;

  if (!clarificationState && !planInputSource) {
    return args.output;
  }

  return {
    ...args.output,
    data: {
      ...(args.output.data || {}),
      routingTrace: {
        clarification: clarificationState
          ? {
              kind: "tree",
              reason: null,
              branchKey: clarificationState.branchKey,
              question: args.output.response,
            }
          : null,
        routerState: clarificationState ? "clarify_before_generation" : null,
        planInputSource,
      } as NonNullable<NonNullable<OrchestratorResponse["data"]>["routingTrace"]>,
    },
  };
}

function createEmptyEnvelope(): ReplayMemoryEnvelope {
  return {
    constraints: [],
    conversationState: "collecting_context",
    pendingPlan: null,
    clarificationState: null,
    lastIdeationAngles: [],
    rollingSummary: null,
    assistantTurnCount: 0,
    activeDraftRef: null,
    latestRefinementInstruction: null,
    unresolvedQuestion: null,
    clarificationQuestionsAsked: 0,
    preferredSurfaceMode: null,
    formatPreference: null,
  };
}

function cloneEnvelope(value: ReplayMemoryEnvelope): ReplayMemoryEnvelope {
  return {
    ...value,
    constraints: [...value.constraints],
    pendingPlan: value.pendingPlan ? { ...value.pendingPlan } : null,
    clarificationState: value.clarificationState
      ? {
          ...value.clarificationState,
          options: [...value.clarificationState.options],
        }
      : null,
    lastIdeationAngles: [...value.lastIdeationAngles],
    activeDraftRef: value.activeDraftRef ? { ...value.activeDraftRef } : null,
  };
}

function createReplayMemoryRecord(args: {
  runId: string;
  threadId: string;
  userId: string | null;
}): ReplayMemoryRecord {
  return {
    id: randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
    runId: args.runId,
    threadId: args.threadId,
    userId: args.userId,
    topicSummary: null,
    activeConstraints: createEmptyEnvelope(),
    concreteAnswerCount: 0,
    lastDraftArtifactId: null,
  };
}

function buildSeedMemoryUpdate(
  seed: Partial<V2ConversationMemory> | undefined,
): Partial<ReplayUpdateMemoryArgs> {
  if (!seed) {
    return {};
  }

  return {
    ...(seed.topicSummary !== undefined ? { topicSummary: seed.topicSummary } : {}),
    ...(seed.activeConstraints !== undefined
      ? { activeConstraints: seed.activeConstraints }
      : {}),
    ...(seed.conversationState !== undefined
      ? { conversationState: seed.conversationState }
      : {}),
    ...(seed.pendingPlan !== undefined ? { pendingPlan: seed.pendingPlan } : {}),
    ...(seed.clarificationState !== undefined
      ? { clarificationState: seed.clarificationState }
      : {}),
    ...(seed.lastIdeationAngles !== undefined
      ? { lastIdeationAngles: seed.lastIdeationAngles }
      : {}),
    ...(seed.rollingSummary !== undefined ? { rollingSummary: seed.rollingSummary } : {}),
    ...(seed.assistantTurnCount !== undefined
      ? { assistantTurnCount: seed.assistantTurnCount }
      : {}),
    ...(seed.activeDraftRef !== undefined ? { activeDraftRef: seed.activeDraftRef } : {}),
    ...(seed.latestRefinementInstruction !== undefined
      ? { latestRefinementInstruction: seed.latestRefinementInstruction }
      : {}),
    ...(seed.unresolvedQuestion !== undefined
      ? { unresolvedQuestion: seed.unresolvedQuestion }
      : {}),
    ...(seed.clarificationQuestionsAsked !== undefined
      ? { clarificationQuestionsAsked: seed.clarificationQuestionsAsked }
      : {}),
    ...(seed.preferredSurfaceMode !== undefined
      ? { preferredSurfaceMode: seed.preferredSurfaceMode }
      : {}),
    ...(seed.formatPreference !== undefined
      ? { formatPreference: seed.formatPreference }
      : {}),
    ...(seed.concreteAnswerCount !== undefined
      ? { concreteAnswerCount: seed.concreteAnswerCount }
      : {}),
    ...(seed.currentDraftArtifactId !== undefined
      ? { lastDraftArtifactId: seed.currentDraftArtifactId }
      : {}),
  };
}

export function createReplayConversationSnapshot(
  record: ReplayMemoryRecord | null | undefined,
): V2ConversationMemory {
  const envelope = record?.activeConstraints || createEmptyEnvelope();

  return {
    conversationState: envelope.conversationState,
    activeConstraints: envelope.constraints,
    topicSummary: record?.topicSummary ?? null,
    lastIdeationAngles: envelope.lastIdeationAngles,
    concreteAnswerCount: record?.concreteAnswerCount ?? 0,
    currentDraftArtifactId:
      envelope.activeDraftRef?.versionId || record?.lastDraftArtifactId || null,
    activeDraftRef: envelope.activeDraftRef,
    rollingSummary: envelope.rollingSummary,
    pendingPlan: envelope.pendingPlan,
    clarificationState: envelope.clarificationState,
    assistantTurnCount: envelope.assistantTurnCount,
    latestRefinementInstruction: envelope.latestRefinementInstruction,
    unresolvedQuestion: envelope.unresolvedQuestion,
    clarificationQuestionsAsked: envelope.clarificationQuestionsAsked,
    preferredSurfaceMode: envelope.preferredSurfaceMode,
    formatPreference: envelope.formatPreference,
    activeReplyContext: null,
    activeReplyArtifactRef: null,
    selectedReplyOptionId: null,
    voiceFidelity: "balanced",
  };
}

function buildReplayMemoryRecordUpdate(
  current: ReplayMemoryRecord,
  args: ReplayUpdateMemoryArgs,
): ReplayMemoryRecord {
  const snapshot = createReplayConversationSnapshot(current);
  const nextEnvelope: ReplayMemoryEnvelope = {
    constraints: args.activeConstraints ?? snapshot.activeConstraints,
    conversationState: args.conversationState ?? snapshot.conversationState,
    pendingPlan:
      args.pendingPlan === undefined ? snapshot.pendingPlan : args.pendingPlan,
    clarificationState:
      args.clarificationState === undefined
        ? snapshot.clarificationState
        : args.clarificationState,
    lastIdeationAngles:
      args.lastIdeationAngles === undefined
        ? snapshot.lastIdeationAngles
        : args.lastIdeationAngles.slice(-6),
    rollingSummary:
      args.rollingSummary === undefined ? snapshot.rollingSummary : args.rollingSummary,
    assistantTurnCount:
      args.assistantTurnCount === undefined
        ? snapshot.assistantTurnCount
        : args.assistantTurnCount,
    activeDraftRef:
      args.activeDraftRef === undefined ? snapshot.activeDraftRef : args.activeDraftRef,
    latestRefinementInstruction:
      args.latestRefinementInstruction === undefined
        ? snapshot.latestRefinementInstruction
        : args.latestRefinementInstruction,
    unresolvedQuestion:
      args.unresolvedQuestion === undefined
        ? snapshot.unresolvedQuestion
        : args.unresolvedQuestion,
    clarificationQuestionsAsked:
      args.clarificationQuestionsAsked === undefined
        ? snapshot.clarificationQuestionsAsked
        : args.clarificationQuestionsAsked,
    preferredSurfaceMode:
      args.preferredSurfaceMode === undefined
        ? snapshot.preferredSurfaceMode
        : args.preferredSurfaceMode,
    formatPreference:
      args.formatPreference === undefined
        ? snapshot.formatPreference
        : args.formatPreference,
  };

  return {
    ...current,
    updatedAt: new Date(),
    topicSummary: args.topicSummary === undefined ? current.topicSummary : args.topicSummary,
    activeConstraints: cloneEnvelope(nextEnvelope),
    concreteAnswerCount:
      args.concreteAnswerCount === undefined
        ? current.concreteAnswerCount
        : args.concreteAnswerCount,
    lastDraftArtifactId:
      args.lastDraftArtifactId === undefined
        ? args.activeDraftRef === undefined
          ? current.lastDraftArtifactId
          : args.activeDraftRef?.versionId ?? null
        : args.lastDraftArtifactId,
  };
}

function buildDefaultStyleCard(): VoiceStyleCard {
  return {
    sentenceOpenings: [],
    sentenceClosers: [],
    pacing: "short, direct, scan-friendly",
    emojiPatterns: [],
    slangAndVocabulary: [],
    formattingRules: ["prefer lowercase when it feels natural", "keep the copy blunt"],
    customGuidelines: ["keep it direct", "no fluff"],
    contextAnchors: [],
    factLedger: {
      durableFacts: [],
      allowedFirstPersonClaims: [],
      allowedNumbers: [],
      forbiddenClaims: [],
      sourceMaterials: [],
    },
    antiExamples: [],
  };
}

export function buildRecentHistory(turns: TranscriptReplayTurn[]): string {
  const lines = turns
    .filter((turn) => turn.message.trim().length > 0)
    .map((turn) => `${turn.role}: ${turn.message.trim()}`);

  return lines.length > 0 ? lines.join("\n") : "None";
}

export function listReplayFixtures(
  fixtures: TranscriptReplayFixture[],
): Array<Pick<TranscriptReplayFixture, "id" | "title" | "description">> {
  return fixtures.map(({ id, title, description }) => ({ id, title, description }));
}

export function findReplayFixture(
  fixtures: TranscriptReplayFixture[],
  id: string,
): TranscriptReplayFixture | null {
  return fixtures.find((fixture) => fixture.id === id) || null;
}

export function createReplayServiceOverrides(
  fixture: TranscriptReplayFixture,
): Partial<ConversationServices> {
  type GetMemoryReturn = Awaited<
    ReturnType<NonNullable<ConversationServices["getConversationMemory"]>>
  >;
  type CreateMemoryReturn = Awaited<
    ReturnType<NonNullable<ConversationServices["createConversationMemory"]>>
  >;
  type UpdateMemoryReturn = Awaited<
    ReturnType<NonNullable<ConversationServices["updateConversationMemory"]>>
  >;
  const runId = fixture.runId || `replay_${fixture.id}`;
  const threadId = fixture.threadId || `replay_${fixture.id}`;
  const userId = fixture.userId || "replay-user";
  const styleCard = fixture.styleCard ?? buildDefaultStyleCard();
  let sourceMaterialAssets: SourceMaterialAssetRecord[] = (fixture.sourceMaterials || []).map(
    (asset) => ({
      ...asset,
      id: randomUUID(),
      userId,
      xHandle: fixture.xHandle || null,
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  );
  let memoryRecord: ReplayMemoryRecord | null = fixture.initialMemory
    ? buildReplayMemoryRecordUpdate(
        createReplayMemoryRecord({
          runId,
          threadId,
          userId,
        }),
        buildSeedMemoryUpdate(fixture.initialMemory),
      )
    : null;

  return {
    async getConversationMemory({ runId: requestedRunId, threadId: requestedThreadId }) {
      if (!memoryRecord) {
        return null;
      }

      if (requestedThreadId && memoryRecord.threadId === requestedThreadId) {
        return memoryRecord as unknown as GetMemoryReturn;
      }

      if (requestedRunId && memoryRecord.runId === requestedRunId) {
        return memoryRecord as unknown as GetMemoryReturn;
      }

      return null;
    },
    async createConversationMemory(args) {
      if (!memoryRecord) {
        memoryRecord = createReplayMemoryRecord({
          runId: args.runId || runId,
          threadId: args.threadId || threadId,
          userId: args.userId ?? userId,
        });
      }

      return memoryRecord as unknown as CreateMemoryReturn;
    },
    async updateConversationMemory(args) {
      if (!memoryRecord) {
        memoryRecord = createReplayMemoryRecord({
          runId: args.runId || runId,
          threadId: args.threadId || threadId,
          userId,
        });
      }

      memoryRecord = buildReplayMemoryRecordUpdate(memoryRecord, args);
      return memoryRecord as unknown as UpdateMemoryReturn;
    },
    async getOnboardingRun(): Promise<StoredOnboardingRun | null> {
      const onboardingProfile = fixture.onboarding?.profile || {};
      return {
        input: {
          account: onboardingProfile.username || fixture.xHandle || "replay",
        },
        result: {
          profile: {
            username: onboardingProfile.username || fixture.xHandle || "replay",
            name: onboardingProfile.name || onboardingProfile.username || fixture.xHandle || "replay",
            bio: onboardingProfile.bio || "",
            followersCount: onboardingProfile.followersCount || 0,
            followingCount: onboardingProfile.followingCount || 0,
            createdAt:
              onboardingProfile.createdAt || new Date("2024-01-01T00:00:00.000Z").toISOString(),
            isVerified: fixture.onboarding?.isVerified === true,
          },
          growthStage: fixture.onboarding?.stage || "Unknown",
          strategyState: {
            goal: fixture.onboarding?.goal || "Audience growth",
          },
          pinnedPost: fixture.onboarding?.pinnedPost
            ? {
                id: "pinned_post",
                text: fixture.onboarding.pinnedPost,
                createdAt: new Date("2024-01-02T00:00:00.000Z").toISOString(),
                metrics: {
                  likeCount: 0,
                  replyCount: 0,
                  repostCount: 0,
                  quoteCount: 0,
                },
              }
            : null,
          recentPosts: (fixture.onboarding?.recentPosts || []).map((post, index) =>
            normalizeReplayRecentPost(post, index),
          ),
        },
      };
    },
    async getHistoricalPosts() {
      return fixture.historicalPosts || [];
    },
    async loadHistoricalTexts() {
      return {
        texts: fixture.historicalPosts || [],
        workerExecutions: [],
      };
    },
    async getSourceMaterialAssets() {
      return sourceMaterialAssets;
    },
    async markSourceMaterialAssetsUsed(assetIds) {
      const usedIds = new Set(assetIds);
      const now = new Date().toISOString();
      sourceMaterialAssets = sourceMaterialAssets.map((asset) =>
        usedIds.has(asset.id)
          ? {
              ...asset,
              lastUsedAt: now,
              updatedAt: now,
            }
          : asset,
      );
    },
    async saveSourceMaterialAssets(args) {
      const now = new Date().toISOString();
      const savedAssets = args.assets.map((asset) => ({
        ...asset,
        id: randomUUID(),
        userId: args.userId,
        xHandle: args.xHandle || null,
        lastUsedAt: null,
        createdAt: now,
        updatedAt: now,
      }));
      sourceMaterialAssets = [...savedAssets, ...sourceMaterialAssets];
      return savedAssets;
    },
    async retrieveAnchors() {
      return {
        topicAnchors: fixture.topicAnchors || fixture.historicalPosts || [],
        laneAnchors: [],
        formatAnchors: [],
        rankedAnchors: [],
      };
    },
    async generateStyleProfile() {
      return styleCard;
    },
    async saveStyleProfile(userIdArg, xHandleArg, nextStyleCard) {
      return {
        id: "replay-style-profile",
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: userIdArg,
        xHandle: xHandleArg,
        niche: null,
        styleCard: nextStyleCard,
      } as Awaited<ReturnType<ConversationServices["saveStyleProfile"]>>;
    },
    async extractStyleRules() {
      return null;
    },
    async extractCoreFacts() {
      return null;
    },
    shouldIncludeRoutingTrace() {
      return true;
    },
  };
}

export async function replayTranscriptFixture(
  fixture: TranscriptReplayFixture,
  serviceOverrides?: Partial<ConversationServices> & ReplayLegacyServiceOverrides,
): Promise<TranscriptReplayRun> {
  enableExtensionlessTsResolution();
  ensureReplayModelEnv();

  let manageConversationTurn:
    | ((
        input: {
          userId: string;
          xHandle?: string | null;
          runId?: string;
          threadId?: string;
          userMessage: string;
          recentHistory: string;
          explicitIntent?: V2ChatIntent | null;
          activeDraft?: string;
        },
        serviceOverrides?: Partial<ConversationServices>,
      ) => Promise<OrchestratorResponse>)
    | null = null;
  try {
    // @ts-ignore TS5097 - replay uses node strip-types at runtime.
    const module = await import("../../lib/agent-v2/runtime/conversationManager.ts");
    manageConversationTurn = module.manageConversationTurn;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown conversationManager import failure";
    throw new Error(
      `Live transcript replay could not load the runtime conversation manager. Current blocker: ${message}`,
    );
  }

  const runId = fixture.runId || `replay_${fixture.id}`;
  const threadId = fixture.threadId || `replay_${fixture.id}`;
  const userId = fixture.userId || "replay-user";
  const replayControlTurnOverride = buildReplayControlTurnOverride({
    serviceOverrides,
  });
  const mergedServiceOverrides: Partial<ConversationServices> = {
    ...createReplayServiceOverrides(fixture),
    ...(replayControlTurnOverride
      ? { controlTurn: replayControlTurnOverride }
      : {}),
    ...(serviceOverrides || {}),
  };
  const history: TranscriptReplayTurn[] = [];
  const turnResults: TranscriptReplayResult[] = [];
  let activeDraft: string | null = null;

  for (const turn of fixture.turns) {
    if (turn.role === "assistant") {
      history.push(turn);
      if (typeof turn.activeDraft === "string") {
        activeDraft = turn.activeDraft;
      } else if (turn.activeDraft === null) {
        activeDraft = null;
      }
      continue;
    }

    const previousMemoryRecord = await mergedServiceOverrides.getConversationMemory?.({
      runId,
      threadId,
    });
    const previousMemory = createReplayConversationSnapshot(
      previousMemoryRecord as ReplayMemoryRecord | null | undefined,
    );
    const replayTurnInput = buildReplayClarificationTurnInput({
      turn,
      history,
      previousMemory,
    });

    if (replayTurnInput.memoryPatch) {
      await mergedServiceOverrides.updateConversationMemory?.({
        runId,
        threadId,
        ...replayTurnInput.memoryPatch,
      });
    }

    const output = await manageConversationTurn(
      {
        userId,
        xHandle: fixture.xHandle || "replay",
        runId,
        threadId,
        userMessage: replayTurnInput.userMessage,
        recentHistory: buildRecentHistory(history),
        explicitIntent: resolveReplayExplicitIntent({
          turn,
          previousMemory,
          activeDraft,
        }),
        activeDraft: turn.activeDraft === undefined ? activeDraft || undefined : turn.activeDraft || undefined,
      },
      mergedServiceOverrides,
    );
    const normalizedOutput = attachReplayRoutingTrace({
      output,
      previousMemory,
    });

    const nextActiveDraft =
      typeof normalizedOutput.data?.draft === "string" ? normalizedOutput.data.draft : activeDraft;

    turnResults.push({
      turnNumber: turnResults.length + 1,
      userMessage: turn.message,
      note: turn.note,
      explicitIntent: turn.explicitIntent,
      output: normalizedOutput,
      activeDraftAfter: nextActiveDraft,
    });

    history.push(turn);
    history.push({
      role: "assistant",
      message: normalizedOutput.response,
      activeDraft: nextActiveDraft,
    });
    activeDraft = nextActiveDraft;
  }

  const finalMemoryRecord = await mergedServiceOverrides.getConversationMemory?.({
    runId,
    threadId,
  });
  const finalMemory = createReplayConversationSnapshot(
    finalMemoryRecord as ReplayMemoryRecord | null | undefined,
  );

  return {
    fixture,
    turns: turnResults,
    finalMemory,
    finalActiveDraft: activeDraft,
  };
}
