import type { V2ChatIntent } from "../../../../../lib/agent-v2/contracts/chat.ts";
import type { CreatorChatTransportRequest } from "../../../../../lib/agent-v2/contracts/chatTransport.ts";
import type {
  ChatArtifactContext,
  ChatResolvedWorkflow,
  ChatTurnSource,
  NormalizedChatTurn,
  ReplyConfirmationArtifactContext,
  ReplyOptionSelectArtifactContext,
  SelectedAngleArtifactContext,
  SelectedDraftContextPayload,
} from "../../../../../lib/agent-v2/contracts/turnContract.ts";
import { buildSelectedAngleDraftPrompt } from "../../../../../lib/agent-v2/orchestrator/selectedAnglePrompt.ts";
import {
  parseSelectedDraftContext,
  resolveEffectiveExplicitIntent,
  type SelectedDraftContext,
} from "./route.logic.ts";

type CreatorChatTurnBody = CreatorChatTransportRequest & Record<string, unknown>;

function parseTurnSource(value: unknown): ChatTurnSource | null {
  return value === "free_text" ||
    value === "ideation_pick" ||
    value === "quick_reply" ||
    value === "draft_action" ||
    value === "reply_action"
    ? value
    : null;
}

function parseSelectedDraftPayload(
  value: unknown,
): SelectedDraftContextPayload | null {
  return parseSelectedDraftContext(value);
}

function parseSelectedAngleArtifactContext(
  value: unknown,
): SelectedAngleArtifactContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const angle = typeof record.angle === "string" ? record.angle.trim() : "";
  const formatHint = record.formatHint === "thread" ? "thread" : "post";
  if (record.kind !== "selected_angle" || !angle) {
    return null;
  }

  return {
    kind: "selected_angle",
    angle,
    formatHint,
  };
}

function parseDraftSelectionArtifactContext(value: unknown): ChatArtifactContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const selectedDraftContext = parseSelectedDraftPayload(record.selectedDraftContext);
  if (record.kind !== "draft_selection" || !selectedDraftContext) {
    return null;
  }

  return {
    kind: "draft_selection",
    action: record.action === "review" ? "review" : "edit",
    selectedDraftContext,
  };
}

function parseReplyOptionSelectArtifactContext(
  value: unknown,
): ReplyOptionSelectArtifactContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const optionIndex =
    typeof record.optionIndex === "number" && Number.isInteger(record.optionIndex)
      ? record.optionIndex
      : typeof record.optionIndex === "string"
        ? Number.parseInt(record.optionIndex, 10)
        : NaN;
  if (record.kind !== "reply_option_select" || !Number.isFinite(optionIndex) || optionIndex < 0) {
    return null;
  }

  return {
    kind: "reply_option_select",
    optionIndex,
  };
}

function parseReplyConfirmationArtifactContext(
  value: unknown,
): ReplyConfirmationArtifactContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    record.kind !== "reply_confirmation" ||
    (record.decision !== "confirm" && record.decision !== "decline")
  ) {
    return null;
  }

  return {
    kind: "reply_confirmation",
    decision: record.decision,
  };
}

function parseArtifactContext(value: unknown): ChatArtifactContext | null {
  return (
    parseSelectedAngleArtifactContext(value) ||
    parseDraftSelectionArtifactContext(value) ||
    parseReplyOptionSelectArtifactContext(value) ||
    parseReplyConfirmationArtifactContext(value)
  );
}

function inferLegacyArtifactContext(args: {
  selectedAngle: string;
  intent: string;
  selectedDraftContext: SelectedDraftContext | null;
}): ChatArtifactContext | null {
  if (args.selectedDraftContext) {
    return {
      kind: "draft_selection",
      action: args.intent === "review" ? "review" : "edit",
      selectedDraftContext: args.selectedDraftContext,
    };
  }

  if (args.selectedAngle) {
    return {
      kind: "selected_angle",
      angle: args.selectedAngle,
      formatHint: args.intent === "thread" ? "thread" : "post",
    };
  }

  return null;
}

function resolveTurnSource(args: {
  explicitTurnSource: ChatTurnSource | null;
  artifactContext: ChatArtifactContext | null;
  hasMessage: boolean;
  hasContentFocus: boolean;
}): ChatTurnSource {
  if (args.artifactContext?.kind === "selected_angle") {
    return "ideation_pick";
  }

  if (args.artifactContext?.kind === "draft_selection") {
    return "draft_action";
  }

  if (
    args.artifactContext?.kind === "reply_option_select" ||
    args.artifactContext?.kind === "reply_confirmation"
  ) {
    return "reply_action";
  }

  if (args.explicitTurnSource) {
    return args.explicitTurnSource;
  }

  if (!args.hasMessage && args.hasContentFocus) {
    return "quick_reply";
  }

  return "free_text";
}

function resolveExplicitIntent(args: {
  intent: string;
  turnSource: ChatTurnSource;
  artifactContext: ChatArtifactContext | null;
  selectedDraftContext: SelectedDraftContext | null;
}): V2ChatIntent | null {
  if (args.artifactContext?.kind === "selected_angle") {
    return "draft";
  }

  if (args.artifactContext?.kind === "draft_selection") {
    return args.artifactContext.action === "review" ? "review" : "edit";
  }

  if (args.turnSource === "quick_reply" && args.intent === "ideate") {
    return "ideate";
  }

  return resolveEffectiveExplicitIntent({
    intent: args.intent,
    selectedDraftContext: args.selectedDraftContext,
  });
}

function resolveResolvedWorkflow(args: {
  turnSource: ChatTurnSource;
  explicitIntent: V2ChatIntent | null;
  artifactContext: ChatArtifactContext | null;
}): ChatResolvedWorkflow {
  if (args.artifactContext?.kind === "selected_angle") {
    return "plan_then_draft";
  }

  if (args.artifactContext?.kind === "draft_selection") {
    return "revise_draft";
  }

  if (
    args.artifactContext?.kind === "reply_option_select" ||
    args.artifactContext?.kind === "reply_confirmation"
  ) {
    return "reply_to_post";
  }

  if (args.explicitIntent === "ideate") {
    return "ideate";
  }

  return "free_text";
}

function buildContentFocusMessage(args: {
  intent: string;
  contentFocus: string;
}): { transcriptMessage: string; orchestrationMessage: string } | null {
  const contentFocus = args.contentFocus.trim();
  if (!contentFocus) {
    return null;
  }

  const transcriptMessage = `i want to focus on ${contentFocus}`;
  if (args.intent === "coach" || args.intent === "ideate") {
    return {
      transcriptMessage,
      orchestrationMessage: `I want to focus on ${contentFocus}. Help me find one concrete moment worth turning into a post.`,
    };
  }

  return null;
}

export function normalizeChatTurn(args: {
  body: CreatorChatTurnBody;
}): NormalizedChatTurn {
  const message = typeof args.body.message === "string" ? args.body.message.trim() : "";
  const intent = typeof args.body.intent === "string" ? args.body.intent.trim() : "";
  const selectedAngle =
    typeof args.body.selectedAngle === "string" ? args.body.selectedAngle.trim() : "";
  const contentFocus =
    typeof args.body.contentFocus === "string" ? args.body.contentFocus.trim() : "";
  const explicitTurnSource = parseTurnSource(args.body.turnSource);
  const explicitArtifactContext = parseArtifactContext(args.body.artifactContext);
  const legacySelectedDraftContext = parseSelectedDraftPayload(args.body.selectedDraftContext);
  const artifactContext =
    explicitArtifactContext ||
    inferLegacyArtifactContext({
      selectedAngle,
      intent,
      selectedDraftContext: legacySelectedDraftContext,
    });
  const selectedDraftContext =
    artifactContext?.kind === "draft_selection"
      ? artifactContext.selectedDraftContext
      : legacySelectedDraftContext;
  const turnSource = resolveTurnSource({
    explicitTurnSource,
    artifactContext,
    hasMessage: Boolean(message),
    hasContentFocus: Boolean(contentFocus),
  });
  const explicitIntent = resolveExplicitIntent({
    intent,
    turnSource,
    artifactContext,
    selectedDraftContext,
  });

  let transcriptMessage = message;
  let orchestrationMessage = message;
  let planSeedSource: NormalizedChatTurn["diagnostics"]["planSeedSource"] = message ? "message" : null;

  if (artifactContext?.kind === "selected_angle") {
    transcriptMessage = `> ${artifactContext.angle}`;
    orchestrationMessage = buildSelectedAngleDraftPrompt({
      angle: artifactContext.angle,
      formatHint: artifactContext.formatHint,
    });
    planSeedSource = "selected_angle";
  } else if (artifactContext?.kind === "reply_option_select") {
    transcriptMessage = message || `> option ${artifactContext.optionIndex + 1}`;
    orchestrationMessage = message || `go with option ${artifactContext.optionIndex + 1}`;
    planSeedSource = "message";
  } else if (artifactContext?.kind === "reply_confirmation") {
    transcriptMessage = message || artifactContext.decision;
    orchestrationMessage = message || artifactContext.decision;
    planSeedSource = "message";
  } else if (!message) {
    const contentFocusMessage = buildContentFocusMessage({
      intent,
      contentFocus,
    });
    if (contentFocusMessage) {
      transcriptMessage = contentFocusMessage.transcriptMessage;
      orchestrationMessage = contentFocusMessage.orchestrationMessage;
      planSeedSource = "content_focus";
    } else if (intent === "coach") {
      transcriptMessage = "help me find one concrete moment worth turning into a post.";
      orchestrationMessage = transcriptMessage;
      planSeedSource = "content_focus";
    }
  }

  const replyHandlingBypassedReason =
    turnSource === "free_text" ? null : `turn_source_${turnSource}`;
  const resolvedWorkflow = resolveResolvedWorkflow({
    turnSource,
    explicitIntent,
    artifactContext,
  });

  return {
    source: turnSource,
    message,
    transcriptMessage,
    orchestrationMessage,
    explicitIntent,
    selectedDraftContext,
    artifactContext,
    diagnostics: {
      turnSource,
      artifactKind: artifactContext?.kind || null,
      planSeedSource,
      replyHandlingBypassedReason,
      resolvedWorkflow,
    },
    shouldAllowReplyHandling: turnSource === "free_text",
  };
}
