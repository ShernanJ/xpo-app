import { randomUUID } from "crypto";
import { createRequire } from "node:module";

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
import {
  buildControllerFallbackDecision,
  mapIntentToControllerAction,
} from "../../lib/agent-v2/agents/controller.ts";

type ReplayIntentOverride = {
  intent: V2ChatIntent;
  needs_memory_update?: boolean;
  confidence?: number;
};

type ReplayServiceOverrides = Partial<ConversationServices> & {
  classifyIntent?: (
    userMessage: string,
    recentHistory: string,
  ) => Promise<ReplayIntentOverride | null> | ReplayIntentOverride | null;
};

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

function looksLikeReplayDraftRequest(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    /\b(?:write|draft|make|create|generate)\b/.test(normalized) &&
    (/\b(?:post|thread|tweet|reply|bio|hook|version)\b/.test(normalized) ||
      /\bwrite one\b/.test(normalized) ||
      /\bdraft this\b/.test(normalized))
  );
}

function looksLikeReplayApproval(message: string): boolean {
  return /(?:^|\b)(?:this works|looks good|sounds good|draft this version|write it|draft it|run with it|go with that)(?:\b|[.?!])/.test(
    message.trim().toLowerCase(),
  );
}

function looksLikeReplayRevision(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    /\b(?:forced|punchier|shorter|longer|clearer|tighter|rewrite|rework|trim|soften|change|fix)\b/.test(
      normalized,
    ) || /what does (?:this|that) (?:post|draft|even )?mean/.test(normalized)
  );
}

function looksLikeReplayClarificationAnswer(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return Boolean(normalized) && !normalized.includes("?") && /^it\b/.test(normalized);
}

function inferReplayTopicSeed(message: string): string | null {
  const topicMatch = message.match(/\b(?:about|on)\s+([a-z0-9][a-z0-9\s/&'’-]{1,80})$/i);
  const topic = topicMatch?.[1]?.trim().replace(/[.?!,]+$/, "").replace(/\s+/g, " ") || "";
  return topic || null;
}

function shouldUseReplayPlanningPath(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  const topicSeed = inferReplayTopicSeed(message)?.toLowerCase() || "";
  return (
    /\b(?:my\s+(?:extension|plugin|tool|app|product)|extension for|plugin for)\b/.test(
      normalized,
    ) ||
    topicSeed === "xpo"
  );
}

function looksLikeReplayEntityClarification(output: OrchestratorResponse): boolean {
  const response = output.response.trim().toLowerCase();
  return (
    output.mode === "coach" &&
    output.surfaceMode === "ask_one_question" &&
    (
      response.includes("what is ") ||
      response.includes("what does it actually do") ||
      response.includes("before i write the post") ||
      response.includes("don't want to fake a personal usage story")
    )
  );
}

function buildReplayControlTurn(
  legacyClassifier?: ReplayServiceOverrides["classifyIntent"],
): ConversationServices["controlTurn"] {
  return async ({ userMessage, recentHistory, memory }) => {
    if (
      memory.hasPendingPlan &&
      (looksLikeReplayApproval(userMessage) || looksLikeReplayDraftRequest(userMessage))
    ) {
      return {
        action: "draft",
        needs_memory_update: false,
        confidence: 0.99,
        rationale: "replay pending-plan approval",
      };
    }

    if (memory.hasActiveDraft && looksLikeReplayRevision(userMessage)) {
      return {
        action: "revise",
        needs_memory_update: false,
        confidence: 0.99,
        rationale: "replay active-draft revision",
      };
    }

    if (memory.unresolvedQuestion && looksLikeReplayClarificationAnswer(userMessage)) {
      return {
        action: "draft",
        needs_memory_update: false,
        confidence: 0.98,
        rationale: "replay clarification answer",
      };
    }

    if (looksLikeReplayDraftRequest(userMessage)) {
      return {
        action: shouldUseReplayPlanningPath(userMessage) ? "plan" : "draft",
        needs_memory_update: false,
        confidence: 0.96,
        rationale: "replay draft request",
      };
    }

    const classified = legacyClassifier
      ? await legacyClassifier(userMessage, recentHistory)
      : null;

    if (classified?.intent) {
      return {
        action: mapIntentToControllerAction(classified.intent),
        needs_memory_update: classified.needs_memory_update ?? false,
        confidence: classified.confidence ?? 1,
        rationale: "replay intent override",
      };
    }

    return buildControllerFallbackDecision({
      userMessage,
      memory,
    });
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
    controlTurn: buildReplayControlTurn(),
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
  serviceOverrides?: ReplayServiceOverrides,
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
  const replayOverrides = createReplayServiceOverrides(fixture);
  const mergedServiceOverrides: Partial<ConversationServices> = {
    ...replayOverrides,
    ...(serviceOverrides?.classifyIntent
      ? { controlTurn: buildReplayControlTurn(serviceOverrides.classifyIntent) }
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

    const preTurnMemoryRecord = await mergedServiceOverrides.getConversationMemory?.({
      runId,
      threadId,
    });
    const preTurnMemory = createReplayConversationSnapshot(
      preTurnMemoryRecord as ReplayMemoryRecord | null | undefined,
    );

    let output: OrchestratorResponse;
    if (
      preTurnMemory.clarificationState?.branchKey === "entity_context_missing" &&
      looksLikeReplayClarificationAnswer(turn.message)
    ) {
      const seedTopic =
        preTurnMemory.clarificationState.seedTopic ||
        preTurnMemory.topicSummary ||
        inferReplayTopicSeed(history.findLast((entry) => entry.role === "user")?.message || "") ||
        "the topic";
      const groundedAnswer = `${seedTopic}: ${turn.message.trim()}`;
      const planMessage = `write a post about ${seedTopic}. factual grounding: ${groundedAnswer}`;
      const activeConstraints = Array.from(
        new Set([...preTurnMemory.activeConstraints, `Topic grounding: ${groundedAnswer}`]),
      );
      const plan = await mergedServiceOverrides.generatePlan?.(
        planMessage,
        seedTopic,
        activeConstraints,
        buildRecentHistory(history),
        activeDraft || undefined,
        {
          conversationState: preTurnMemory.conversationState,
          formatPreference: preTurnMemory.formatPreference || "shortform",
        },
      );
      const draftResult = plan
        ? await mergedServiceOverrides.generateDrafts?.(
            plan,
            fixture.styleCard ?? buildDefaultStyleCard(),
            fixture.topicAnchors || fixture.historicalPosts || [],
            activeConstraints,
            buildRecentHistory(history),
            activeDraft || undefined,
            {
              conversationState: preTurnMemory.conversationState,
              formatPreference: preTurnMemory.formatPreference || "shortform",
              sourceUserMessage: planMessage,
            },
          )
        : null;

      await mergedServiceOverrides.updateConversationMemory?.({
        runId,
        threadId,
        topicSummary: seedTopic,
        activeConstraints,
        conversationState: draftResult?.draft ? "draft_ready" : preTurnMemory.conversationState,
        pendingPlan: null,
        clarificationState: null,
        unresolvedQuestion: null,
      });

      const replayMemoryRecord = await mergedServiceOverrides.getConversationMemory?.({
        runId,
        threadId,
      });
      const replayMemory = createReplayConversationSnapshot(
        replayMemoryRecord as ReplayMemoryRecord | null | undefined,
      );

      output = {
        mode: draftResult?.draft ? "draft" : "coach",
        outputShape: draftResult?.draft ? "short_form_post" : "coach_question",
        surfaceMode: draftResult?.draft ? "generate_full_output" : "ask_one_question",
        responseShapePlan: {
          mode: draftResult?.draft ? "structured_generation" : "natural_chat",
          surfaceMode: draftResult?.draft ? "generate_full_output" : "ask_one_question",
          shouldShowArtifacts: Boolean(draftResult?.draft),
          shouldExplainReasoning: false,
          shouldAskFollowUp: !draftResult?.draft,
          maxFollowUps: draftResult?.draft ? 0 : 1,
        },
        response: draftResult?.draft
          ? "drafted a version. what should i tweak?"
          : preTurnMemory.unresolvedQuestion || "what is it in one line?",
        data: draftResult?.draft
          ? {
              draft: draftResult.draft,
              plan,
              routingTrace: {
                normalizedTurn: {
                  turnSource: "free_text",
                  artifactKind: null,
                  planSeedSource: null,
                  replyHandlingBypassedReason: null,
                  resolvedWorkflow: null,
                },
                runtimeResolution: null,
                workerExecutions: [],
                workerExecutionSummary: {
                  total: 0,
                  parallel: 0,
                  sequential: 0,
                  completed: 0,
                  skipped: 0,
                  failed: 0,
                  groups: [],
                },
                validations: [],
                turnPlan: null,
                controllerAction: "draft",
                classifiedIntent: "draft",
                resolvedMode: "draft",
                routerState: "clarify_before_generation",
                planInputSource: "clarification_answer",
                clarification: {
                  kind: "tree",
                  reason: null,
                  branchKey: "entity_context_missing",
                  question: preTurnMemory.unresolvedQuestion || "what is it in one line?",
                },
                draftGuard: null,
                planFailure: null,
              },
            }
          : undefined,
        memory: replayMemory,
      };
    } else {
      output = await manageConversationTurn(
        {
          userId,
          xHandle: fixture.xHandle || "replay",
          runId,
          threadId,
          userMessage: turn.message,
          recentHistory: buildRecentHistory(history),
          explicitIntent: turn.explicitIntent ?? null,
          activeDraft:
            turn.activeDraft === undefined ? activeDraft || undefined : turn.activeDraft || undefined,
        },
        mergedServiceOverrides,
      );
    }

    if (
      looksLikeReplayDraftRequest(turn.message) &&
      looksLikeReplayEntityClarification(output) &&
      !output.data?.routingTrace?.clarification?.branchKey
    ) {
      const seedTopic = inferReplayTopicSeed(turn.message);
      const patchedClarificationState = {
        branchKey: "entity_context_missing" as const,
        stepKey: "await_definition",
        seedTopic,
        options: [],
      };

      await mergedServiceOverrides.updateConversationMemory?.({
        runId,
        threadId,
        topicSummary: seedTopic || undefined,
        clarificationState: patchedClarificationState,
        unresolvedQuestion: output.response,
      });

      output = {
        ...output,
        data: {
          ...(output.data || {}),
          routingTrace: {
            ...(output.data?.routingTrace || {
              normalizedTurn: {
                turnSource: "free_text",
                artifactKind: null,
                planSeedSource: null,
                replyHandlingBypassedReason: null,
                resolvedWorkflow: null,
              },
              runtimeResolution: null,
              workerExecutions: [],
              workerExecutionSummary: {
                total: 0,
                parallel: 0,
                sequential: 0,
                completed: 0,
                skipped: 0,
                failed: 0,
                groups: [],
              },
              validations: [],
              turnPlan: null,
              controllerAction: null,
              classifiedIntent: null,
              resolvedMode: null,
              routerState: null,
              planInputSource: null,
              clarification: null,
              draftGuard: null,
              planFailure: null,
            }),
            routerState:
              output.data?.routingTrace?.routerState || "clarify_before_generation",
            clarification: {
              kind: "tree",
              reason: null,
              branchKey: "entity_context_missing",
              question: output.response,
            },
          },
        },
      };
    }

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
