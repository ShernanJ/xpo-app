import type { DraftFormatPreference } from "../../../../lib/agent-v2/contracts/chat.ts";
import {
  buildCreatorChatTransportRequest,
  createClientTurnId,
  type CreatorChatTransportRequest,
} from "../../../../lib/agent-v2/contracts/chatTransport.ts";
import type {
  ChatArtifactContext,
  ChatTurnSource,
} from "../../../../lib/agent-v2/contracts/turnContract.ts";
import type { ThreadFramingStyle } from "../../../../lib/onboarding/draftArtifacts.ts";
import type {
  PostingCadenceCapacity,
  ReplyBudgetPerDay,
  ToneCasing,
  ToneRisk,
  TransformationMode,
  UserGoal,
} from "../../../../lib/onboarding/types.ts";
import {
  buildPendingStatusPlan,
  type PendingStatusPlan,
} from "../composer/pendingStatus.ts";

type ChatIntent =
  | "coach"
  | "ideate"
  | "plan"
  | "planner_feedback"
  | "draft"
  | "review"
  | "edit";

export interface DraftVersionSnapshotLike {
  messageId: string;
  versionId: string;
  content: string;
  source: "assistant_generated" | "assistant_revision" | "manual_save";
  createdAt: string;
  maxCharacterLimit?: number;
  revisionChainId?: string;
}

export interface ChatHistoryMessage {
  id: string;
  threadId?: string;
  role: "assistant" | "user";
  content: string;
  excludeFromHistory?: boolean;
}

export interface ChatStrategyInputsLike {
  goal: UserGoal;
  postingCadenceCapacity: PostingCadenceCapacity;
  replyBudgetPerDay: ReplyBudgetPerDay;
  transformationMode: TransformationMode;
}

export interface ChatToneInputsLike {
  toneCasing: ToneCasing;
  toneRisk: ToneRisk;
}

export interface PrepareAssistantReplyTransportArgs {
  prompt?: string;
  history: ChatHistoryMessage[];
  runId: string;
  threadId?: string | null;
  workspaceHandle?: string | null;
  provider?: string | null;
  turnSource?: ChatTurnSource;
  artifactContext?: ChatArtifactContext | null;
  intent?: ChatIntent;
  formatPreferenceOverride?: DraftFormatPreference | null;
  threadFramingStyleOverride?: ThreadFramingStyle | null;
  selectedDraftContext: DraftVersionSnapshotLike | null;
  selectedDraftContextOverride?: DraftVersionSnapshotLike | null;
  contentFocus?: string | null;
  preferenceSettings?: unknown;
  preferenceConstraints?: string[];
  strategyInputs: ChatStrategyInputsLike;
  toneInputs: ChatToneInputsLike;
}

export interface PreparedAssistantReplyTransport {
  shouldSkip: boolean;
  trimmedPrompt: string;
  effectiveTurnSource: ChatTurnSource;
  effectiveIntent?: ChatIntent;
  effectiveSelectedDraftContext: DraftVersionSnapshotLike | null;
  pendingStatusPlan: PendingStatusPlan | null;
  clientTurnId?: string;
  transportRequest?: CreatorChatTransportRequest;
}

export function prepareAssistantReplyTransport(
  args: PrepareAssistantReplyTransportArgs,
): PreparedAssistantReplyTransport {
  const trimmedPrompt = args.prompt?.trim() ?? "";
  const selectedDraftAction =
    args.selectedDraftContext && trimmedPrompt
      ? inferSelectedDraftAction(trimmedPrompt)
      : "ignore";
  const effectiveTurnSource =
    args.turnSource ??
    (args.artifactContext?.kind === "selected_angle"
      ? "ideation_pick"
      : args.artifactContext?.kind === "image_post_confirmation"
        ? "quick_reply"
      : args.artifactContext?.kind === "draft_selection"
        ? "draft_action"
        : args.artifactContext?.kind === "reply_option_select" ||
            args.artifactContext?.kind === "reply_confirmation"
          ? "reply_action"
          : "free_text");
  const effectiveIntent =
    args.intent ??
    (args.selectedDraftContext && selectedDraftAction === "revise"
      ? "edit"
      : undefined);
  const effectiveSelectedDraftContext =
    args.selectedDraftContextOverride !== undefined
      ? args.selectedDraftContextOverride
      : args.selectedDraftContext &&
          args.artifactContext?.kind !== "selected_angle" &&
          (effectiveIntent === "edit" || effectiveIntent === "review")
        ? args.selectedDraftContext
        : null;
  const hasStructuredIntent =
    effectiveTurnSource !== "free_text" ||
    !!args.artifactContext ||
    (effectiveIntent === "coach" &&
      (!trimmedPrompt || Boolean(args.contentFocus))) ||
    ((effectiveIntent === "ideate" || effectiveIntent === "coach") &&
      Boolean(args.contentFocus));

  if (!trimmedPrompt && !hasStructuredIntent) {
    return {
      shouldSkip: true,
      trimmedPrompt,
      effectiveTurnSource,
      effectiveIntent,
      effectiveSelectedDraftContext,
      pendingStatusPlan: null,
    };
  }

  const clientTurnId = createClientTurnId();

  return {
    shouldSkip: false,
    trimmedPrompt,
    effectiveTurnSource,
    effectiveIntent,
    effectiveSelectedDraftContext,
    pendingStatusPlan: buildPendingStatusPlan({
      message: trimmedPrompt,
      turnSource: effectiveTurnSource,
      artifactContext: args.artifactContext ?? null,
      intent: effectiveIntent ?? null,
      threadFramingStyleOverride: args.threadFramingStyleOverride ?? null,
      hasSelectedDraftContext: Boolean(effectiveSelectedDraftContext),
    }),
    clientTurnId,
    transportRequest: buildCreatorChatTransportRequest({
      runId: args.runId,
      threadId: args.threadId ?? undefined,
      workspaceHandle: args.workspaceHandle,
      clientTurnId,
      message: trimmedPrompt,
      history: args.history,
      provider: args.provider,
      stream: true,
      turnSource: effectiveTurnSource,
      artifactContext: args.artifactContext ?? null,
      intent: effectiveIntent,
      formatPreference: args.formatPreferenceOverride ?? null,
      threadFramingStyle: args.threadFramingStyleOverride ?? null,
      contentFocus: args.contentFocus,
      selectedDraftContext: effectiveSelectedDraftContext,
      preferenceSettings: args.preferenceSettings,
      preferenceConstraints:
        args.preferenceConstraints && args.preferenceConstraints.length > 0
          ? args.preferenceConstraints
          : undefined,
      ...args.toneInputs,
      ...args.strategyInputs,
    }),
  };
}

function inferSelectedDraftAction(prompt: string): "revise" | "ignore" {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) {
    return "ignore";
  }

  const explicitIgnoreCues = [
    "give me ideas",
    "post ideas",
    "write a new post",
    "write me a post",
    "write a post",
    "draft a post",
    "draft me a post",
    "different topic",
    "start over",
    "help me brainstorm",
    "brainstorm",
    "analyze my posts",
    "that was a question",
    "i was asking",
    "what does",
    "what do you mean",
    "what did you mean",
    "where did you get",
    "where did that come from",
    "wrong thread",
    "explain this",
    "explain that",
    "explain the draft",
    "explain the tweet",
  ];

  if (explicitIgnoreCues.some((cue) => normalized.includes(cue))) {
    return "ignore";
  }

  const explicitReviseCues = [
    "why does it say",
    "why does it mention",
    "don't say",
    "dont say",
    "remove \"",
    "remove '",
    "remove the",
    "delete \"",
    "delete '",
    "make it shorter",
    "shorten it",
    "tighten this",
    "make this clearer",
    "change the hook",
    "remove the last line",
    "less hype",
    "more casual",
    "this part is weird",
    "that line is off",
    "too long",
    "too much",
    "make it punchier",
    "make it sharper",
    "fix this line",
    "rewrite this",
    "reword this",
    "revise this",
  ];

  if (explicitReviseCues.some((cue) => normalized.includes(cue))) {
    return "revise";
  }

  if (
    /["“'`](.+?)["”'`]/.test(prompt) &&
    /\b(remove|delete|replace|change|fix|cut|trim)\b/i.test(normalized)
  ) {
    return "revise";
  }

  if (/^(what|why|how|where|which)\b/.test(normalized) || normalized.endsWith("?")) {
    return "ignore";
  }

  return "ignore";
}
