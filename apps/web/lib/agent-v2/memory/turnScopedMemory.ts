import type { V2ConversationMemory } from "../contracts/chat.ts";
import type { ChatResolvedWorkflow } from "../contracts/turnContract.ts";

const MEMORY_STOP_TERMS = new Set([
  "about",
  "after",
  "again",
  "angle",
  "angles",
  "another",
  "better",
  "change",
  "clean",
  "create",
  "different",
  "draft",
  "drafts",
  "edit",
  "fix",
  "format",
  "help",
  "hook",
  "idea",
  "ideas",
  "improve",
  "keep",
  "less",
  "longer",
  "make",
  "making",
  "more",
  "option",
  "options",
  "plan",
  "plans",
  "post",
  "posts",
  "reply",
  "replies",
  "rewrite",
  "same",
  "shorter",
  "something",
  "style",
  "thread",
  "threads",
  "topic",
  "tweet",
  "tweets",
  "version",
  "versions",
  "write",
  "writing",
]);

function collectMemoryTerms(value: string | null | undefined): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 2 && !MEMORY_STOP_TERMS.has(term));
}

function buildTopicSignals(memory: V2ConversationMemory): string[] {
  return [
    memory.topicSummary,
    memory.pendingPlan?.objective || null,
    memory.pendingPlan?.angle || null,
    memory.rollingSummary,
    memory.latestRefinementInstruction,
    memory.unresolvedQuestion,
    ...(memory.lastIdeationAngles || []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function hasShortContinuationCue(normalized: string): boolean {
  if (!normalized || normalized.length > 140) {
    return false;
  }

  return (
    /^(?:yes|yeah|yep|sure|ok|okay|go ahead|do it|write it|draft it|use that|go with that|the first one|the second one|option \d+)/.test(
      normalized,
    ) ||
    /\b(?:make|rewrite|change|fix|trim|shorten|tighten|expand|lengthen|clean|swap|replace|remove|add|dial back|tone down)\b/.test(
      normalized,
    ) ||
    /\b(?:shorter|longer|softer|punchier|cleaner|clearer|tighter|different angle|another version|more like this)\b/.test(
      normalized,
    ) ||
    /^(?:this|that|it|same angle|same idea)\b/.test(normalized)
  );
}

function isLikelyClarificationAnswer(args: {
  userMessage: string;
  memory: V2ConversationMemory;
}): boolean {
  const normalized = args.userMessage.trim().toLowerCase();
  if (!args.memory.unresolvedQuestion?.trim()) {
    return false;
  }

  if (!normalized || normalized.length < 8) {
    return false;
  }

  if (normalized.includes("?") || /^(?:hello|hi|hey)\b/.test(normalized)) {
    return false;
  }

  if (
    /\b(?:instead|new topic|switch gears|switching gears|different topic|something else)\b/.test(
      normalized,
    )
  ) {
    return false;
  }

  return true;
}

function isLikelyArtifactContinuation(args: {
  userMessage: string;
  activeDraft?: string;
  memory: V2ConversationMemory;
}): boolean {
  const hasArtifactContext =
    Boolean(args.activeDraft) ||
    Boolean(args.memory.currentDraftArtifactId) ||
    Boolean(args.memory.activeDraftRef) ||
    Boolean(args.memory.pendingPlan) ||
    args.memory.conversationState === "draft_ready" ||
    args.memory.conversationState === "editing" ||
    args.memory.conversationState === "plan_pending_approval";

  if (!hasArtifactContext) {
    return false;
  }

  return hasShortContinuationCue(args.userMessage.trim().toLowerCase());
}

function isStrongTopicShift(args: {
  userMessage: string;
  memory: V2ConversationMemory;
  activeDraft?: string;
}): boolean {
  if (isLikelyArtifactContinuation(args)) {
    return false;
  }

  if (isLikelyClarificationAnswer(args)) {
    return false;
  }

  const normalizedMessage = args.userMessage.trim().toLowerCase();
  if (!normalizedMessage || normalizedMessage.length < 12) {
    return false;
  }

  if (
    /\b(?:instead|new topic|switch gears|switching gears|different topic|something else)\b/.test(
      normalizedMessage,
    )
  ) {
    return true;
  }

  const memorySignals = buildTopicSignals(args.memory);
  if (memorySignals.length === 0) {
    return false;
  }

  const messageTerms = new Set(collectMemoryTerms(args.userMessage));
  if (messageTerms.size === 0) {
    return false;
  }

  const signalTerms = new Set(memorySignals.flatMap((signal) => collectMemoryTerms(signal)));
  if (signalTerms.size === 0) {
    return false;
  }

  for (const term of messageTerms) {
    if (signalTerms.has(term)) {
      return false;
    }
  }

  return true;
}

export function scopeMemoryForCurrentTurn(args: {
  userMessage: string;
  activeDraft?: string;
  memory: V2ConversationMemory;
  resolvedWorkflow?: ChatResolvedWorkflow | null;
}): V2ConversationMemory {
  const shouldClearReplyWorkflow =
    Boolean(args.memory.activeReplyContext) && args.resolvedWorkflow !== "reply_to_post";
  const scopedMemory = shouldClearReplyWorkflow
    ? {
        ...args.memory,
        activeReplyContext: null,
        activeReplyArtifactRef: null,
        selectedReplyOptionId: null,
        continuationState:
          args.memory.continuationState?.capability === "replying"
            ? null
            : args.memory.continuationState,
      }
    : args.memory;

  if (!isStrongTopicShift({ ...args, memory: scopedMemory })) {
    return scopedMemory;
  }

  return {
    ...scopedMemory,
    conversationState: "ready_to_ideate",
    topicSummary: null,
    lastIdeationAngles: [],
    concreteAnswerCount: 0,
    currentDraftArtifactId: null,
    activeDraftRef: null,
    rollingSummary: null,
    pendingPlan: null,
    clarificationState: null,
    continuationState: null,
    latestRefinementInstruction: null,
    unresolvedQuestion: null,
    inferredSessionConstraints: [],
    activeReplyContext: null,
    activeReplyArtifactRef: null,
    activeProfileAnalysisRef: null,
    selectedReplyOptionId: null,
    liveContextCache: null,
  };
}
