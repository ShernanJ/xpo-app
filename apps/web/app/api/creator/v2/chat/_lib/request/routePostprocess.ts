import type {
  UserPreferences,
  VoiceStyleCard,
} from "../../../../../../../lib/agent-v2/core/styleProfile.ts";
import type {
  DraftFormatPreference,
  StrategyPlan,
} from "../../../../../../../lib/agent-v2/contracts/chat.ts";
import type {
  NormalizedChatTurnDiagnostics,
} from "../../../../../../../lib/agent-v2/contracts/turnContract.ts";
import type { RawOrchestratorResponse } from "../../../../../../../lib/agent-v2/runtime/conversationManager.ts";
import {
  prepareChatRouteTurn,
  type PreparedChatRouteTurn,
  type SelectedDraftContext,
} from "./routeLogic.ts";

const DEFAULT_THREAD_TITLE = "New Chat";

function isPlaceholderThreadTitle(title: string | null | undefined): boolean {
  const normalized = title?.trim() || "";
  return !normalized || normalized === DEFAULT_THREAD_TITLE;
}

function isGenericThreadPrompt(message: string): boolean {
  const normalized = message
    .trim()
    .toLowerCase()
    .replace(/[.?!,:;]+$/g, "")
    .replace(/\s+/g, " ");
  return [
    "give me some ideas",
    "i need some ideas",
    "brainstorm with me",
    "brainstorm",
    "ideas",
    "write me a post",
    "write a post",
    "write me something",
    "write something",
    "help me write",
    "help me figure out what to post",
    "what should i post",
    "what should i post today",
    "what should i post this week",
    "what should i post right now",
    "what should i post on x",
    "what should i post on twitter",
    "what should i tweet",
    "what should i tweet today",
    "what should i tweet this week",
    "what do i post",
    "what do i post today",
    "what do i post this week",
    "what do i post on x",
    "what do i post on twitter",
    "what do i tweet",
    "what do i tweet today",
    "what do i tweet this week",
    "write it",
    "looks good",
    "sounds good",
    "ok",
    "okay",
  ].some((candidate) => normalized === candidate);
}

export function canPromoteThreadTitle(args: {
  currentTitle: string | null | undefined;
  conversationState: string | null | undefined;
  topicSummary: string | null | undefined;
}): boolean {
  const canPromote =
    args.conversationState === "ready_to_ideate" ||
    args.conversationState === "plan_pending_approval" ||
    args.conversationState === "draft_ready";

  if (!canPromote) {
    return false;
  }

  if (!args.topicSummary?.trim()) {
    return false;
  }

  if (isGenericThreadPrompt(args.topicSummary)) {
    return false;
  }

  return isPlaceholderThreadTitle(args.currentTitle) || isGenericThreadPrompt(args.currentTitle || "");
}

export function validatePreparedTurnPlan(planCandidate: unknown): StrategyPlan | null {
  if (!planCandidate || typeof planCandidate !== "object" || Array.isArray(planCandidate)) {
    return null;
  }

  const plan = planCandidate as {
    objective?: string;
    angle?: string;
    targetLane?: "original" | "reply" | "quote";
    mustInclude?: string[];
    mustAvoid?: string[];
    hookType?: string;
    pitchResponse?: string;
    formatPreference?: "shortform" | "longform" | "thread";
  };

  if (
    typeof plan.objective !== "string" ||
    typeof plan.angle !== "string" ||
    (plan.targetLane !== "original" &&
      plan.targetLane !== "reply" &&
      plan.targetLane !== "quote") ||
    !Array.isArray(plan.mustInclude) ||
    !Array.isArray(plan.mustAvoid) ||
    typeof plan.hookType !== "string" ||
    typeof plan.pitchResponse !== "string"
  ) {
    return null;
  }

  return {
    objective: plan.objective,
    angle: plan.angle,
    targetLane: plan.targetLane,
    mustInclude: plan.mustInclude.filter((value): value is string => typeof value === "string"),
    mustAvoid: plan.mustAvoid.filter((value): value is string => typeof value === "string"),
    hookType: plan.hookType,
    pitchResponse: plan.pitchResponse,
    ...(plan.formatPreference ? { formatPreference: plan.formatPreference } : {}),
  };
}

export async function prepareManagedMainTurnWithDeps(
  args: {
    rawResponse: RawOrchestratorResponse;
    recentHistory: string;
    selectedDraftContext: SelectedDraftContext | null;
    formatPreference: DraftFormatPreference | null;
    isVerifiedAccount: boolean;
    userPreferences: UserPreferences | null;
    styleCard: VoiceStyleCard | null;
    routingDiagnostics: NormalizedChatTurnDiagnostics;
    clientTurnId: string | null;
    currentThreadTitle: string | null | undefined;
    shouldClearReplyWorkflow: boolean;
  },
  deps: {
    generateThreadTitle: (args: {
      topicSummary: string | null;
      recentHistory: string;
      plan: StrategyPlan | null;
    }) => Promise<string | null>;
    prepareChatRouteTurn: typeof prepareChatRouteTurn;
  },
): Promise<PreparedChatRouteTurn> {
  const resultData =
    args.rawResponse.data &&
    typeof args.rawResponse.data === "object" &&
    !Array.isArray(args.rawResponse.data)
      ? (args.rawResponse.data as Record<string, unknown>)
      : undefined;
  const validatedPlan = validatePreparedTurnPlan(resultData?.plan);
  const shouldPromoteTitle = canPromoteThreadTitle({
    currentTitle: args.currentThreadTitle,
    topicSummary: args.rawResponse.memory.topicSummary,
    conversationState: args.rawResponse.memory.conversationState,
  });
  const nextThreadTitle = shouldPromoteTitle
    ? await deps.generateThreadTitle({
        topicSummary: args.rawResponse.memory.topicSummary,
        recentHistory: args.recentHistory || "None",
        plan: validatedPlan,
      })
    : null;

  return deps.prepareChatRouteTurn({
    rawResponse: args.rawResponse,
    plan: validatedPlan,
    selectedDraftContext: args.selectedDraftContext,
    formatPreference: args.formatPreference,
    isVerifiedAccount: args.isVerifiedAccount,
    userPreferences: args.userPreferences,
    styleCard: args.styleCard,
    routingDiagnostics: args.routingDiagnostics,
    clientTurnId: args.clientTurnId,
    issuesFixed:
      Array.isArray(resultData?.issuesFixed)
        ? (resultData.issuesFixed as string[]).filter((value) => typeof value === "string")
        : [],
    defaultThreadTitle: DEFAULT_THREAD_TITLE,
    currentThreadTitle: args.currentThreadTitle,
    nextThreadTitle,
    preferredSurfaceMode: args.rawResponse.memory.preferredSurfaceMode ?? "natural",
    shouldClearReplyWorkflow: args.shouldClearReplyWorkflow,
  });
}

export async function prepareManagedMainTurn(args: {
  rawResponse: RawOrchestratorResponse;
  recentHistory: string;
  selectedDraftContext: SelectedDraftContext | null;
  formatPreference: DraftFormatPreference | null;
  isVerifiedAccount: boolean;
  userPreferences: UserPreferences | null;
  styleCard: VoiceStyleCard | null;
  routingDiagnostics: NormalizedChatTurnDiagnostics;
  clientTurnId: string | null;
  currentThreadTitle: string | null | undefined;
  shouldClearReplyWorkflow: boolean;
}): Promise<PreparedChatRouteTurn> {
  const { generateThreadTitle } = await import(
    "../../../../../../../lib/agent-v2/agents/threadTitle.ts"
  );
  return prepareManagedMainTurnWithDeps(args, {
    generateThreadTitle,
    prepareChatRouteTurn,
  });
}
