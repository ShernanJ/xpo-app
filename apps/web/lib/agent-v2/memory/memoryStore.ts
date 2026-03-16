import { prisma } from "../../db";
import { Prisma } from "../../generated/prisma/client";
import { applyMemorySaliencePolicy } from "./memorySalience";
import { looksLikeProfileContextLeak } from "../core/profileContextLeak.ts";
import type {
  ActiveDraftRef,
  ActiveReplyArtifactRef,
  ActiveReplyContext,
  ClarificationState,
  ConversationState,
  DraftFormatPreference,
  StrategyPlan,
  V2ConversationMemory,
} from "../contracts/chat";

export interface CreateMemoryArgs {
  runId?: string;
  threadId?: string;
  userId?: string | null;
}

export interface UpdateMemoryArgs {
  runId?: string;
  threadId?: string;
  tx?: Prisma.TransactionClient;
  topicSummary?: string | null;
  lastIdeationAngles?: string[];
  activeConstraints?: string[];
  concreteAnswerCount?: number;
  lastDraftArtifactId?: string | null;
  activeDraftRef?: ActiveDraftRef | null;
  conversationState?: ConversationState;
  pendingPlan?: StrategyPlan | null;
  clarificationState?: ClarificationState | null;
  rollingSummary?: string | null;
  assistantTurnCount?: number;
  latestRefinementInstruction?: string | null;
  unresolvedQuestion?: string | null;
  clarificationQuestionsAsked?: number;
  preferredSurfaceMode?: "natural" | "structured" | null;
  formatPreference?: DraftFormatPreference | null;
  activeReplyContext?: ActiveReplyContext | null;
  activeReplyArtifactRef?: ActiveReplyArtifactRef | null;
  selectedReplyOptionId?: string | null;
}

interface StoredMemoryEnvelope {
  constraints: string[];
  conversationState: ConversationState;
  pendingPlan: StrategyPlan | null;
  clarificationState: ClarificationState | null;
  lastIdeationAngles: string[];
  rollingSummary: string | null;
  assistantTurnCount: number;
  activeDraftRef: ActiveDraftRef | null;
  latestRefinementInstruction: string | null;
  unresolvedQuestion: string | null;
  clarificationQuestionsAsked: number;
  preferredSurfaceMode: "natural" | "structured" | null;
  formatPreference: DraftFormatPreference | null;
  activeReplyContext: ActiveReplyContext | null;
  activeReplyArtifactRef: ActiveReplyArtifactRef | null;
  selectedReplyOptionId: string | null;
}

function createInitialStoredMemoryEnvelope(): StoredMemoryEnvelope {
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
    activeReplyContext: null,
    activeReplyArtifactRef: null,
    selectedReplyOptionId: null,
  };
}

function normalizeConversationState(value: unknown): ConversationState {
  if (
    value === "collecting_context" ||
    value === "needs_more_context" ||
    value === "ready_to_ideate" ||
    value === "plan_pending_approval" ||
    value === "draft_ready" ||
    value === "editing"
  ) {
    return value;
  }

  return "collecting_context";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizePlan(value: unknown): StrategyPlan | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.objective !== "string" ||
    typeof record.angle !== "string" ||
    (record.targetLane !== "original" && record.targetLane !== "reply" && record.targetLane !== "quote") ||
    typeof record.hookType !== "string" ||
    typeof record.pitchResponse !== "string"
  ) {
    return null;
  }

  return {
    objective: record.objective,
    angle: record.angle,
    targetLane: record.targetLane,
    mustInclude: normalizeStringArray(record.mustInclude),
    mustAvoid: normalizeStringArray(record.mustAvoid),
    hookType: record.hookType,
    pitchResponse: record.pitchResponse,
    ...(record.deliveryPreference === "balanced" ||
    record.deliveryPreference === "voice_first" ||
    record.deliveryPreference === "growth_first"
      ? { deliveryPreference: record.deliveryPreference }
      : {}),
    ...(record.formatPreference === "shortform" ||
    record.formatPreference === "longform" ||
    record.formatPreference === "thread"
      ? { formatPreference: record.formatPreference }
      : {}),
  };
}

function normalizeActiveDraftRef(value: unknown): ActiveDraftRef | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const messageId = typeof record.messageId === "string" ? record.messageId.trim() : "";
  const versionId = typeof record.versionId === "string" ? record.versionId.trim() : "";
  const revisionChainId =
    typeof record.revisionChainId === "string" && record.revisionChainId.trim()
      ? record.revisionChainId.trim()
      : null;

  if (!messageId || !versionId) {
    return null;
  }

  return {
    messageId,
    versionId,
    ...(revisionChainId ? { revisionChainId } : {}),
  };
}

function normalizeQuickReplies(value: unknown): ClarificationState["options"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => {
      const kind:
        | "content_focus"
        | "example_reply"
        | "planner_action"
        | "clarification_choice" =
        item.kind === "content_focus" ||
        item.kind === "example_reply" ||
        item.kind === "planner_action" ||
        item.kind === "clarification_choice"
          ? item.kind
          : "example_reply";
      const explicitIntent:
        | "coach"
        | "ideate"
        | "plan"
        | "planner_feedback"
        | "draft"
        | "review"
        | "edit"
        | "answer_question"
        | undefined =
        item.explicitIntent === "coach" ||
        item.explicitIntent === "ideate" ||
        item.explicitIntent === "plan" ||
        item.explicitIntent === "planner_feedback" ||
        item.explicitIntent === "draft" ||
        item.explicitIntent === "review" ||
        item.explicitIntent === "edit" ||
        item.explicitIntent === "answer_question"
          ? item.explicitIntent
          : undefined;
      const formatPreference:
        | "shortform"
        | "longform"
        | "thread"
        | undefined =
        item.formatPreference === "shortform" ||
        item.formatPreference === "longform" ||
        item.formatPreference === "thread"
          ? item.formatPreference
          : undefined;

      return {
        kind,
        value: typeof item.value === "string" ? item.value : "",
        label: typeof item.label === "string" ? item.label : "",
        suggestedFocus: typeof item.suggestedFocus === "string" ? item.suggestedFocus : undefined,
        explicitIntent,
        ...(formatPreference ? { formatPreference } : {}),
      };
    })
    .filter(
      (item) =>
        item.value &&
        item.label &&
        !looksLikeProfileContextLeak(item.label) &&
        !looksLikeProfileContextLeak(item.value),
    );
}

function normalizeReplyOption(value: unknown): ActiveReplyContext["latestReplyOptions"][number] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const label = typeof record.label === "string" ? record.label.trim() : "";
  const text = typeof record.text === "string" ? record.text.trim() : "";
  if (!id || !label || !text) {
    return null;
  }

  const intent =
    record.intent && typeof record.intent === "object" && !Array.isArray(record.intent)
      ? (record.intent as Record<string, unknown>)
      : null;

  return {
    id,
    label,
    text,
    ...(intent &&
    typeof intent.label === "string" &&
    typeof intent.strategyPillar === "string" &&
    typeof intent.anchor === "string" &&
    typeof intent.rationale === "string"
      ? {
          intent: {
            label: intent.label,
            strategyPillar: intent.strategyPillar,
            anchor: intent.anchor,
            rationale: intent.rationale,
          },
        }
      : {}),
  };
}

function normalizeReplyOptions(value: unknown): ActiveReplyContext["latestReplyOptions"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeReplyOption(entry))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .slice(0, 6);
}

function normalizeActiveReplyContext(value: unknown): ActiveReplyContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const sourceText = typeof record.sourceText === "string" ? record.sourceText.trim() : "";
  const opportunityId = typeof record.opportunityId === "string" ? record.opportunityId.trim() : "";
  if (!sourceText || !opportunityId) {
    return null;
  }

  return {
    sourceText,
    sourceUrl: typeof record.sourceUrl === "string" ? record.sourceUrl.trim() || null : null,
    authorHandle:
      typeof record.authorHandle === "string" ? record.authorHandle.trim().replace(/^@+/, "").toLowerCase() || null : null,
    quotedUserAsk: typeof record.quotedUserAsk === "string" ? record.quotedUserAsk.trim() || null : null,
    confidence:
      record.confidence === "low" || record.confidence === "medium" || record.confidence === "high"
        ? record.confidence
        : "medium",
    parseReason: typeof record.parseReason === "string" ? record.parseReason : "unknown",
    awaitingConfirmation: record.awaitingConfirmation === true,
    stage:
      record.stage === "0_to_1k" ||
      record.stage === "1k_to_10k" ||
      record.stage === "10k_to_50k" ||
      record.stage === "50k_plus"
        ? record.stage
        : "0_to_1k",
    tone:
      record.tone === "dry" ||
      record.tone === "bold" ||
      record.tone === "builder" ||
      record.tone === "warm"
        ? record.tone
        : "builder",
    goal: typeof record.goal === "string" ? record.goal.trim() || "followers" : "followers",
    opportunityId,
    latestReplyOptions: normalizeReplyOptions(record.latestReplyOptions),
    latestReplyDraftOptions: normalizeReplyOptions(record.latestReplyDraftOptions),
    selectedReplyOptionId:
      typeof record.selectedReplyOptionId === "string" ? record.selectedReplyOptionId.trim() || null : null,
  };
}

function normalizeActiveReplyArtifactRef(value: unknown): ActiveReplyArtifactRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const messageId = typeof record.messageId === "string" ? record.messageId.trim() : "";
  if (!messageId) {
    return null;
  }

  return {
    messageId,
    kind: record.kind === "reply_draft" ? "reply_draft" : "reply_options",
  };
}

function normalizeClarificationState(value: unknown): ClarificationState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    (record.branchKey !== "vague_draft_request" &&
      record.branchKey !== "lazy_request" &&
      record.branchKey !== "plan_reject" &&
      record.branchKey !== "topic_known_but_direction_missing" &&
      record.branchKey !== "abstract_topic_focus_pick" &&
      record.branchKey !== "semantic_repair" &&
      record.branchKey !== "entity_context_missing" &&
      record.branchKey !== "career_context_missing") ||
    typeof record.stepKey !== "string"
  ) {
    return null;
  }

  return {
    branchKey: record.branchKey,
    stepKey: record.stepKey,
    seedTopic:
      typeof record.seedTopic === "string" && !looksLikeProfileContextLeak(record.seedTopic)
        ? record.seedTopic
        : null,
    options: normalizeQuickReplies(record.options),
  };
}

function parseMemoryEnvelope(value: unknown): StoredMemoryEnvelope {
  if (Array.isArray(value)) {
    return {
      constraints: normalizeStringArray(value),
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
      activeReplyContext: null,
      activeReplyArtifactRef: null,
      selectedReplyOptionId: null,
    };
  }

  if (!value || typeof value !== "object") {
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
      activeReplyContext: null,
      activeReplyArtifactRef: null,
      selectedReplyOptionId: null,
    };
  }

  const record = value as Record<string, unknown>;
  return {
    constraints: normalizeStringArray(record.constraints),
    conversationState: normalizeConversationState(record.conversationState),
    pendingPlan: normalizePlan(record.pendingPlan),
    clarificationState: normalizeClarificationState(record.clarificationState),
    lastIdeationAngles: normalizeStringArray(record.lastIdeationAngles).slice(-6),
    rollingSummary: typeof record.rollingSummary === "string" ? record.rollingSummary : null,
    assistantTurnCount:
      typeof record.assistantTurnCount === "number" && Number.isFinite(record.assistantTurnCount)
        ? record.assistantTurnCount
        : 0,
    activeDraftRef: normalizeActiveDraftRef(record.activeDraftRef),
    latestRefinementInstruction:
      typeof record.latestRefinementInstruction === "string"
        ? record.latestRefinementInstruction
        : null,
    unresolvedQuestion:
      typeof record.unresolvedQuestion === "string" ? record.unresolvedQuestion : null,
    clarificationQuestionsAsked:
      typeof record.clarificationQuestionsAsked === "number" &&
      Number.isFinite(record.clarificationQuestionsAsked)
        ? record.clarificationQuestionsAsked
        : 0,
    preferredSurfaceMode:
      record.preferredSurfaceMode === "natural" || record.preferredSurfaceMode === "structured"
        ? record.preferredSurfaceMode
        : null,
    formatPreference:
      record.formatPreference === "shortform" ||
      record.formatPreference === "longform" ||
      record.formatPreference === "thread"
        ? record.formatPreference
        : null,
    activeReplyContext: normalizeActiveReplyContext(record.activeReplyContext),
    activeReplyArtifactRef: normalizeActiveReplyArtifactRef(record.activeReplyArtifactRef),
    selectedReplyOptionId:
      typeof record.selectedReplyOptionId === "string" ? record.selectedReplyOptionId.trim() || null : null,
  };
}

function serializeMemoryEnvelope(value: StoredMemoryEnvelope): Prisma.InputJsonValue {
  return {
    constraints: value.constraints,
    conversationState: value.conversationState,
    pendingPlan: value.pendingPlan,
    clarificationState: value.clarificationState,
    lastIdeationAngles: value.lastIdeationAngles,
    rollingSummary: value.rollingSummary,
    assistantTurnCount: value.assistantTurnCount,
    activeDraftRef: value.activeDraftRef,
    latestRefinementInstruction: value.latestRefinementInstruction,
    unresolvedQuestion: value.unresolvedQuestion,
    clarificationQuestionsAsked: value.clarificationQuestionsAsked,
    preferredSurfaceMode: value.preferredSurfaceMode,
    formatPreference: value.formatPreference,
    activeReplyContext: value.activeReplyContext,
    activeReplyArtifactRef: value.activeReplyArtifactRef,
    selectedReplyOptionId: value.selectedReplyOptionId,
  } as Prisma.InputJsonValue;
}

function buildStoredMemoryEnvelopeFromSnapshot(
  snapshot: V2ConversationMemory,
): StoredMemoryEnvelope {
  return {
    constraints: snapshot.activeConstraints,
    conversationState: snapshot.conversationState,
    pendingPlan: snapshot.pendingPlan,
    clarificationState: snapshot.clarificationState,
    lastIdeationAngles: snapshot.lastIdeationAngles,
    rollingSummary: snapshot.rollingSummary,
    assistantTurnCount: snapshot.assistantTurnCount,
    activeDraftRef: snapshot.activeDraftRef,
    latestRefinementInstruction: snapshot.latestRefinementInstruction,
    unresolvedQuestion: snapshot.unresolvedQuestion,
    clarificationQuestionsAsked: snapshot.clarificationQuestionsAsked,
    preferredSurfaceMode: snapshot.preferredSurfaceMode,
    formatPreference: snapshot.formatPreference,
    activeReplyContext: snapshot.activeReplyContext,
    activeReplyArtifactRef: snapshot.activeReplyArtifactRef,
    selectedReplyOptionId: snapshot.selectedReplyOptionId,
  };
}

export function buildConversationMemoryUpdateInputFromSnapshot(
  snapshot: V2ConversationMemory,
): Prisma.ConversationMemoryUpdateInput {
  return {
    topicSummary: snapshot.topicSummary,
    concreteAnswerCount: snapshot.concreteAnswerCount,
    lastDraftArtifactId: snapshot.currentDraftArtifactId,
    activeConstraints: serializeMemoryEnvelope(
      buildStoredMemoryEnvelopeFromSnapshot(snapshot),
    ),
  };
}

export function buildConversationMemoryResetInput(): Prisma.ConversationMemoryUpdateInput {
  return buildConversationMemoryUpdateInputFromSnapshot(
    createConversationMemorySnapshot(null),
  );
}

export function createConversationMemorySnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  memory: Record<string, any> | null | undefined,
): V2ConversationMemory {
  const parsedEnvelope = parseMemoryEnvelope(memory?.activeConstraints);
  const salience = applyMemorySaliencePolicy({
    topicSummary: typeof memory?.topicSummary === "string" ? memory.topicSummary : null,
    concreteAnswerCount:
      typeof memory?.concreteAnswerCount === "number" && Number.isFinite(memory.concreteAnswerCount)
        ? memory.concreteAnswerCount
        : 0,
    envelope: {
      constraints: parsedEnvelope.constraints,
      lastIdeationAngles: parsedEnvelope.lastIdeationAngles,
      rollingSummary: parsedEnvelope.rollingSummary,
      latestRefinementInstruction: parsedEnvelope.latestRefinementInstruction,
      unresolvedQuestion: parsedEnvelope.unresolvedQuestion,
    },
  });
  const envelope = {
    ...parsedEnvelope,
    constraints: salience.envelope.constraints,
    lastIdeationAngles: salience.envelope.lastIdeationAngles,
    rollingSummary: salience.envelope.rollingSummary,
    latestRefinementInstruction: salience.envelope.latestRefinementInstruction,
    unresolvedQuestion: salience.envelope.unresolvedQuestion,
  };

  return {
    conversationState: envelope.conversationState,
    activeConstraints: envelope.constraints,
    topicSummary: salience.topicSummary,
    lastIdeationAngles: envelope.lastIdeationAngles,
    concreteAnswerCount: salience.concreteAnswerCount,
    currentDraftArtifactId:
      envelope.activeDraftRef?.versionId ||
      (typeof memory?.lastDraftArtifactId === "string" ? memory.lastDraftArtifactId : null),
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
    activeReplyContext: envelope.activeReplyContext,
    activeReplyArtifactRef: envelope.activeReplyArtifactRef,
    selectedReplyOptionId: envelope.selectedReplyOptionId,
    voiceFidelity: "balanced",
  };
}

const MEMORY_UPDATE_MAX_ATTEMPTS = 3;

function resolveConversationMemoryIdentity(args: {
  runId?: string;
  threadId?: string;
}) {
  if (args.threadId) {
    return {
      where: { threadId: args.threadId },
      label: `thread ${args.threadId}`,
    } as const;
  }

  if (args.runId) {
    return {
      where: { runId: args.runId },
      label: `run ${args.runId}`,
    } as const;
  }

  return null;
}

function isConversationMemoryUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function findConversationMemoryByIdentity(
  db: Prisma.TransactionClient | typeof prisma,
  args: {
    runId?: string;
    threadId?: string;
  },
) {
  const identity = resolveConversationMemoryIdentity(args);
  if (!identity) {
    return null;
  }

  if ("threadId" in identity.where) {
    return db.conversationMemory.findUnique({
      where: { threadId: identity.where.threadId },
    });
  }

  return db.conversationMemory.findUnique({
    where: { runId: identity.where.runId },
  });
}

export async function getConversationMemory({ runId, threadId }: { runId?: string, threadId?: string }) {
  if (!runId && !threadId) return null;
  try {
    const memory = await findConversationMemoryByIdentity(prisma, {
      runId,
      threadId,
    });
    return memory;
  } catch (error) {
    console.error(`Failed to fetch memory for thread ${threadId} / run ${runId}:`, error);
    return null;
  }
}

export async function createConversationMemory(args: CreateMemoryArgs) {
  const identity = resolveConversationMemoryIdentity(args);
  if (!identity) {
    return null;
  }

  try {
    const memory = await prisma.conversationMemory.create({
      data: {
        runId: args.runId,
        threadId: args.threadId,
        userId: args.userId,
        activeConstraints: serializeMemoryEnvelope(createInitialStoredMemoryEnvelope()),
        concreteAnswerCount: 0,
      },
    });
    return memory;
  } catch (error) {
    if (isConversationMemoryUniqueConstraintError(error)) {
      return findConversationMemoryByIdentity(prisma, args);
    }

    console.error(`Failed to create memory for thread ${args.threadId} / run ${args.runId}:`, error);
    return null;
  }
}

export async function updateConversationMemory(args: UpdateMemoryArgs) {
  if (!args.runId && !args.threadId) return null;
  try {
    const db = args.tx ?? prisma;
    for (let attempt = 0; attempt < MEMORY_UPDATE_MAX_ATTEMPTS; attempt += 1) {
      const existing = await findConversationMemoryByIdentity(db, args);

      if (!existing) {
        console.warn(`Attempted to update non-existent memory for thread ${args.threadId} / run ${args.runId}`);
        return null;
      }

      const existingSnapshot = createConversationMemorySnapshot(existing as unknown as Record<string, unknown>);
      const nextEnvelope: StoredMemoryEnvelope = {
        constraints: args.activeConstraints ?? existingSnapshot.activeConstraints,
        conversationState: args.conversationState ?? existingSnapshot.conversationState,
        pendingPlan:
          args.pendingPlan === undefined ? existingSnapshot.pendingPlan : args.pendingPlan,
        clarificationState:
          args.clarificationState === undefined
            ? existingSnapshot.clarificationState
            : args.clarificationState,
        lastIdeationAngles:
          args.lastIdeationAngles === undefined
            ? existingSnapshot.lastIdeationAngles
            : args.lastIdeationAngles.slice(-6),
        rollingSummary:
          args.rollingSummary === undefined ? existingSnapshot.rollingSummary : args.rollingSummary,
        assistantTurnCount:
          args.assistantTurnCount === undefined
            ? existingSnapshot.assistantTurnCount
            : args.assistantTurnCount,
        activeDraftRef:
          args.activeDraftRef === undefined ? existingSnapshot.activeDraftRef : args.activeDraftRef,
        latestRefinementInstruction:
          args.latestRefinementInstruction === undefined
            ? existingSnapshot.latestRefinementInstruction
            : args.latestRefinementInstruction,
        unresolvedQuestion:
          args.unresolvedQuestion === undefined
            ? existingSnapshot.unresolvedQuestion
            : args.unresolvedQuestion,
        clarificationQuestionsAsked:
          args.clarificationQuestionsAsked === undefined
            ? existingSnapshot.clarificationQuestionsAsked
            : args.clarificationQuestionsAsked,
        preferredSurfaceMode:
          args.preferredSurfaceMode === undefined
            ? existingSnapshot.preferredSurfaceMode
            : args.preferredSurfaceMode,
        formatPreference:
          args.formatPreference === undefined
            ? existingSnapshot.formatPreference
            : args.formatPreference,
        activeReplyContext:
          args.activeReplyContext === undefined
            ? existingSnapshot.activeReplyContext
            : args.activeReplyContext,
        activeReplyArtifactRef:
          args.activeReplyArtifactRef === undefined
            ? existingSnapshot.activeReplyArtifactRef
            : args.activeReplyArtifactRef,
        selectedReplyOptionId:
          args.selectedReplyOptionId === undefined
            ? existingSnapshot.selectedReplyOptionId
            : args.selectedReplyOptionId,
      };
      const salience = applyMemorySaliencePolicy({
        topicSummary:
          args.topicSummary === undefined ? existingSnapshot.topicSummary : args.topicSummary ?? null,
        concreteAnswerCount:
          args.concreteAnswerCount === undefined
            ? existingSnapshot.concreteAnswerCount
            : args.concreteAnswerCount,
        envelope: {
          constraints: nextEnvelope.constraints,
          lastIdeationAngles: nextEnvelope.lastIdeationAngles,
          rollingSummary: nextEnvelope.rollingSummary,
          latestRefinementInstruction: nextEnvelope.latestRefinementInstruction,
          unresolvedQuestion: nextEnvelope.unresolvedQuestion,
        },
      });
      nextEnvelope.constraints = salience.envelope.constraints;
      nextEnvelope.lastIdeationAngles = salience.envelope.lastIdeationAngles;
      nextEnvelope.rollingSummary = salience.envelope.rollingSummary;
      nextEnvelope.latestRefinementInstruction = salience.envelope.latestRefinementInstruction;
      nextEnvelope.unresolvedQuestion = salience.envelope.unresolvedQuestion;

      const dataToUpdate: Prisma.ConversationMemoryUpdateManyMutationInput = {
        activeConstraints: serializeMemoryEnvelope(nextEnvelope) as Prisma.InputJsonValue,
        version: {
          increment: 1,
        },
      };
      if (args.topicSummary !== undefined) dataToUpdate.topicSummary = salience.topicSummary;
      if (args.concreteAnswerCount !== undefined) {
        dataToUpdate.concreteAnswerCount = salience.concreteAnswerCount;
      }
      if (args.lastDraftArtifactId !== undefined) {
        dataToUpdate.lastDraftArtifactId = args.lastDraftArtifactId;
      } else if (args.activeDraftRef !== undefined) {
        dataToUpdate.lastDraftArtifactId = args.activeDraftRef?.versionId ?? null;
      }

      const updateResult = await db.conversationMemory.updateMany({
        where: {
          id: existing.id,
          version: existing.version,
        },
        data: dataToUpdate,
      });

      if (updateResult.count === 0) {
        continue;
      }

      return db.conversationMemory.findUnique({
        where: { id: existing.id },
      });
    }

    console.warn(
      `Conversation memory update lost a version race after ${MEMORY_UPDATE_MAX_ATTEMPTS} attempts for thread ${args.threadId} / run ${args.runId}`,
    );
    return null;
  } catch (error) {
    console.error(`Failed to update memory for thread ${args.threadId} / run ${args.runId}:`, error);
    return null;
  }
}
