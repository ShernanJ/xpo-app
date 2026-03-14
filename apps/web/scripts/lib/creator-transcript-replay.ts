import { randomUUID } from "crypto";
import { createRequire } from "node:module";

import {
  buildControllerFallbackDecision,
  mapIntentToControllerAction,
  type ControllerDecision,
} from "../../lib/agent-v2/agents/controller.ts";
import type { VoiceStyleCard } from "../../lib/agent-v2/core/styleProfile";
import type {
  ConversationServices,
  OrchestratorResponse,
} from "../../lib/agent-v2/orchestrator/conversationManager";
import type {
  SourceMaterialAssetInput,
  SourceMaterialAssetRecord,
} from "../../lib/agent-v2/orchestrator/sourceMaterials";
import type {
  DraftFormatPreference,
  StrategyPlan,
  V2ChatIntent,
  V2ConversationMemory,
} from "../../lib/agent-v2/contracts/chat";

type ReplayUpdateMemoryArgs = Parameters<ConversationServices["updateConversationMemory"]>[0];

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
        return buildControllerFallbackDecision({
          userMessage,
          memory,
        });
      }

      return {
        action: mapIntentToControllerAction(classified.intent),
        needs_memory_update: classified.needs_memory_update,
        confidence: classified.confidence,
        rationale: "replay classifyIntent override",
      } satisfies ControllerDecision;
    };
  }

  return async ({ userMessage, memory }) =>
    buildControllerFallbackDecision({
      userMessage,
      memory,
    });
}

function inferReplayIntent(args: {
  message: string;
  memory: V2ConversationMemory;
  activeDraft: string | null;
}): V2ChatIntent {
  const normalized = args.message.trim().toLowerCase();
  const hasPendingPlan = Boolean(args.memory.pendingPlan);
  const hasActiveDraft =
    Boolean(args.activeDraft) ||
    Boolean(args.memory.activeDraftRef?.versionId) ||
    args.memory.conversationState === "draft_ready" ||
    args.memory.conversationState === "editing";

  if (
    hasActiveDraft &&
    (/^(?:make|keep|turn|rewrite|change|fix|trim|shorten|lengthen|expand|tighten|soften)\b/.test(
      normalized,
    ) ||
      /\b(?:forced|shorter|longer|cleaner|clearer|less|more)\b/.test(normalized))
  ) {
    return "edit";
  }

  if (
    hasPendingPlan &&
    (/^(?:yes|yeah|yep|sure|ok|okay|go ahead|do it|run with it|let'?s do it|lets do it|write it|draft it)\b/.test(
      normalized,
    ) ||
      /\b(?:draft|write)\b/.test(normalized))
  ) {
    return "planner_feedback";
  }

  if (
    /\b(?:idea|ideas|angles|angle|brainstorm|directions?)\b/.test(normalized) &&
    !/\b(?:write|draft)\b/.test(normalized)
  ) {
    return "ideate";
  }

  if (
    /\b(?:write|draft|compose|generate|create|make)\b/.test(normalized) &&
    (/\babout\b/.test(normalized) ||
      /\bpost\b/.test(normalized) ||
      /\bthread\b/.test(normalized) ||
      /\bone\b/.test(normalized))
  ) {
    return "draft";
  }

  if (/^(?:what|how|why|when|where|who|which|can|could|would|should|do|does|did|is|are)\b/.test(normalized)) {
    return "answer_question";
  }

  return "coach";
}

async function resolveReplayExplicitIntent(args: {
  turn: TranscriptReplayTurn;
  history: TranscriptReplayTurn[];
  activeDraft: string | null;
  runId: string;
  threadId: string;
  mergedServiceOverrides: Partial<ConversationServices>;
  serviceOverrides?: Partial<ConversationServices> & ReplayLegacyServiceOverrides;
}): Promise<V2ChatIntent | null> {
  if (args.turn.explicitIntent !== undefined) {
    return args.turn.explicitIntent;
  }

  if (args.serviceOverrides?.classifyIntent) {
    const classified = await args.serviceOverrides.classifyIntent(
      args.turn.message,
      buildRecentHistory(args.history),
    );
    return classified?.intent ?? null;
  }

  const memoryRecord = await args.mergedServiceOverrides.getConversationMemory?.({
    runId: args.runId,
    threadId: args.threadId,
  });
  const memory = createReplayConversationSnapshot(
    memoryRecord as ReplayMemoryRecord | null | undefined,
  );
  return inferReplayIntent({
    message: args.turn.message,
    memory,
    activeDraft: args.activeDraft,
  });
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
    async getOnboardingRun() {
      return {
        input: {
          account: fixture.xHandle || "replay",
        },
        result: {
          profile: {
            isVerified: fixture.onboarding?.isVerified === true,
          },
          growthStage: fixture.onboarding?.stage || "Unknown",
          strategyState: {
            goal: fixture.onboarding?.goal || "Audience growth",
          },
        },
      } as Record<string, unknown>;
    },
    async getHistoricalPosts() {
      return fixture.historicalPosts || [];
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
    const module = await import("../../lib/agent-v2/orchestrator/conversationManager.ts");
    manageConversationTurn = module.manageConversationTurn;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown conversationManager import failure";
    throw new Error(
      `Live transcript replay could not load the orchestrator. Current blocker: ${message}`,
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

    const resolvedExplicitIntent = await resolveReplayExplicitIntent({
      turn,
      history,
      activeDraft,
      runId,
      threadId,
      mergedServiceOverrides,
      serviceOverrides,
    });

    const output = await manageConversationTurn(
      {
        userId,
        xHandle: fixture.xHandle || "replay",
        runId,
        threadId,
        userMessage: turn.message,
        recentHistory: buildRecentHistory(history),
        explicitIntent: resolvedExplicitIntent,
        activeDraft: turn.activeDraft === undefined ? activeDraft || undefined : turn.activeDraft || undefined,
      },
      mergedServiceOverrides,
    );

    const nextActiveDraft =
      typeof output.data?.draft === "string" ? output.data.draft : activeDraft;

    turnResults.push({
      turnNumber: turnResults.length + 1,
      userMessage: turn.message,
      note: turn.note,
      explicitIntent: turn.explicitIntent,
      output,
      activeDraftAfter: nextActiveDraft,
    });

    history.push(turn);
    history.push({
      role: "assistant",
      message: output.response,
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
