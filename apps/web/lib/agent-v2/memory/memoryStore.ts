import { prisma } from "../../db";
import { Prisma } from "../../generated/prisma/client";
import type {
  ActiveDraftRef,
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
    ...(record.formatPreference === "shortform" || record.formatPreference === "longform"
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
        | undefined =
        item.formatPreference === "shortform" || item.formatPreference === "longform"
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
    .filter((item) => item.value && item.label);
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
    seedTopic: typeof record.seedTopic === "string" ? record.seedTopic : null,
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
      record.formatPreference === "shortform" || record.formatPreference === "longform"
        ? record.formatPreference
        : null,
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
  } as Prisma.InputJsonValue;
}

export function createConversationMemorySnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  memory: Record<string, any> | null | undefined,
): V2ConversationMemory {
  const envelope = parseMemoryEnvelope(memory?.activeConstraints);

  return {
    conversationState: envelope.conversationState,
    activeConstraints: envelope.constraints,
    topicSummary: typeof memory?.topicSummary === "string" ? memory.topicSummary : null,
    lastIdeationAngles: envelope.lastIdeationAngles,
    concreteAnswerCount:
      typeof memory?.concreteAnswerCount === "number" && Number.isFinite(memory.concreteAnswerCount)
        ? memory.concreteAnswerCount
        : 0,
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
    voiceFidelity: "balanced",
  };
}

export async function getConversationMemory({ runId, threadId }: { runId?: string, threadId?: string }) {
  if (!runId && !threadId) return null;
  try {
    const memory = await prisma.conversationMemory.findFirst({
      where: threadId ? { threadId } : { runId },
    });
    return memory;
  } catch (error) {
    console.error(`Failed to fetch memory for thread ${threadId} / run ${runId}:`, error);
    return null;
  }
}

export async function createConversationMemory(args: CreateMemoryArgs) {
  try {
    const memory = await prisma.conversationMemory.create({
      data: {
        runId: args.runId,
        threadId: args.threadId,
        userId: args.userId,
        activeConstraints: serializeMemoryEnvelope({
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
        }),
        concreteAnswerCount: 0,
      },
    });
    return memory;
  } catch (error) {
    console.error(`Failed to create memory for thread ${args.threadId} / run ${args.runId}:`, error);
    return null;
  }
}

export async function updateConversationMemory(args: UpdateMemoryArgs) {
  if (!args.runId && !args.threadId) return null;
  try {
    const existing = await prisma.conversationMemory.findFirst({
      where: args.threadId ? { threadId: args.threadId } : { runId: args.runId },
    });

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
    };

    const dataToUpdate: Prisma.ConversationMemoryUpdateInput = {
      activeConstraints: serializeMemoryEnvelope(nextEnvelope),
    };
    if (args.topicSummary !== undefined) dataToUpdate.topicSummary = args.topicSummary;
    if (args.concreteAnswerCount !== undefined) dataToUpdate.concreteAnswerCount = args.concreteAnswerCount;
    if (args.lastDraftArtifactId !== undefined) {
      dataToUpdate.lastDraftArtifactId = args.lastDraftArtifactId;
    } else if (args.activeDraftRef !== undefined) {
      dataToUpdate.lastDraftArtifactId = args.activeDraftRef?.versionId ?? null;
    }

    const memory = await prisma.conversationMemory.update({
      where: { id: existing.id },
      data: dataToUpdate,
    });
    return memory;
  } catch (error) {
    console.error(`Failed to update memory for thread ${args.threadId} / run ${args.runId}:`, error);
    return null;
  }
}
