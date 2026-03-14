import type {
  ExtensionReplyDraftResponse,
  ExtensionReplyIntentMetadata,
  ExtensionReplyOption,
  ExtensionReplyOptionChoice,
} from "../../extension/types.ts";
import type {
  ActiveReplyArtifactRef,
  ActiveReplyContext,
} from "../contracts/chat.ts";

export type { ActiveReplyArtifactRef, ActiveReplyContext };

export type EmbeddedReplyClassification =
  | "plain_chat"
  | "reply_request_with_embedded_post"
  | "reply_request_missing_post"
  | "embedded_post_without_reply_request";

export type EmbeddedReplyConfidence = "low" | "medium" | "high";

export interface EmbeddedReplyContext {
  sourceText: string;
  sourceUrl: string | null;
  authorHandle: string | null;
  quotedUserAsk: string | null;
  confidence: EmbeddedReplyConfidence;
  parseReason: string;
}

export interface EmbeddedReplyParseResult {
  classification: EmbeddedReplyClassification;
  context: EmbeddedReplyContext | null;
}

export type ReplyContinuationResult =
  | { type: "confirm" }
  | { type: "decline" }
  | { type: "select_option"; optionIndex: number }
  | {
      type: "revise_draft";
      tone: "dry" | "bold" | "builder" | "warm";
      length: "same" | "shorter" | "longer";
    };

export interface ChatReplyParseEnvelope {
  detected: boolean;
  confidence: EmbeddedReplyConfidence;
  needsConfirmation: boolean;
  parseReason: string;
}

export interface ChatReplyOptionArtifact {
  id: string;
  label: string;
  text: string;
  intent?: ExtensionReplyIntentMetadata;
}

export interface ChatReplyDraftArtifact {
  id: string;
  label: string;
  text: string;
  intent?: ExtensionReplyIntentMetadata;
}

export type ChatReplyArtifacts =
  | {
      kind: "reply_options";
      sourceText: string;
      sourceUrl: string | null;
      authorHandle: string | null;
      options: ChatReplyOptionArtifact[];
      groundingNotes: string[];
      warnings: string[];
      selectedOptionId: string | null;
    }
  | {
      kind: "reply_draft";
      sourceText: string;
      sourceUrl: string | null;
      authorHandle: string | null;
      options: ChatReplyDraftArtifact[];
      notes: string[];
      selectedOptionId: string | null;
    };

interface StructuredReplyContextInput {
  sourceText?: string | null;
  sourceUrl?: string | null;
  authorHandle?: string | null;
}

const REPLY_ASK_PATTERNS = [
  /\bhow do i reply\b/,
  /\bhow should i reply\b/,
  /\bwhat should i reply\b/,
  /\bwhat do i reply\b/,
  /\bwhat should i say back\b/,
  /\bwhat do i say back\b/,
  /\bwhat should i respond\b/,
  /\bhow do i respond\b/,
  /\bwrite (?:me )?a reply\b/,
  /\bdraft (?:me )?a reply\b/,
  /\bhelp me reply\b/,
  /\breply to (?:this|that)\b/,
  /\brespond to (?:this|that)\b/,
];

const REPLY_CONFIRM_PATTERNS = [
  /^(?:yes|yeah|yep|sure|ok|okay|do it|go ahead|that'?s right|that's right|use that|treat that as the post)[.?!]*$/,
  /^(?:yes),?\s+(?:that'?s|thats)\s+the post[.?!]*$/,
];

const REPLY_DECLINE_PATTERNS = [
  /^(?:no|nope|nah|not that|don'?t|dont)\b/,
  /\bthat'?s not the post\b/,
];

const REPLY_DRAFT_SELECTION_PATTERNS = [
  /^(?:go with|pick|use|draft)\s+(?:option\s+)?(\d+)\b/,
  /^(?:option\s+)?(\d+)\b/,
  /^(?:the\s+)?(first|second|third)\b/,
];

const REPLY_DRAFT_FOLLOWUP_PATTERNS = [
  /\b(?:make|turn|keep)\b.*\b(?:bolder|bold|warmer|warm|softer|gentler|less harsh|less aggressive|shorter|shorten|tighter|trim|longer|expand)\b/,
  /\b(?:bolder|bold|warmer|warm|softer|gentler|less harsh|less aggressive|shorter|shorten|tighter|trim|longer|expand)\b/,
];

const URL_PATTERN =
  /https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})\/status\/\d+/i;

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\r/g, "").replace(/[ \t]+/g, " ");
}

function normalizeMultilineWhitespace(value: string): string {
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function looksLikeReplyAsk(value: string): boolean {
  const normalized = normalizeWhitespace(value).toLowerCase();
  return REPLY_ASK_PATTERNS.some((pattern) => pattern.test(normalized));
}

function looksLikeQuotedSnippet(value: string): boolean {
  const normalized = normalizeWhitespace(value);
  return normalized.length < 80 && /^["'“].+["'”]$/.test(normalized);
}

function extractHandleFromText(value: string): string | null {
  const trimmed = value.trim();
  const handleMatch = trimmed.match(/^@([A-Za-z0-9_]{1,15})\b/);
  if (handleMatch?.[1]) {
    return handleMatch[1].toLowerCase();
  }
  return null;
}

function buildFallbackSourceText(lines: string[]): string {
  return lines
    .filter((line) => !URL_PATTERN.test(line))
    .join("\n")
    .trim();
}

export function parseEmbeddedReplyRequest(args: {
  message: string;
  replyContext?: StructuredReplyContextInput | null;
}): EmbeddedReplyParseResult {
  const rawMessage = normalizeMultilineWhitespace(args.message);
  if (!rawMessage) {
    return {
      classification: "plain_chat",
      context: null,
    };
  }

  const structuredSourceText = normalizeMultilineWhitespace(args.replyContext?.sourceText || "");
  const structuredSourceUrl = normalizeWhitespace(args.replyContext?.sourceUrl || "") || null;
  const structuredAuthorHandle =
    normalizeWhitespace(args.replyContext?.authorHandle || "").replace(/^@+/, "").toLowerCase() ||
    null;

  if (structuredSourceText) {
    const hasReplyAsk = looksLikeReplyAsk(rawMessage);
    return {
      classification: hasReplyAsk
        ? "reply_request_with_embedded_post"
        : "embedded_post_without_reply_request",
      context: {
        sourceText: structuredSourceText,
        sourceUrl: structuredSourceUrl,
        authorHandle: structuredAuthorHandle,
        quotedUserAsk: hasReplyAsk ? rawMessage : null,
        confidence: structuredSourceUrl || structuredAuthorHandle ? "high" : "medium",
        parseReason: "structured_reply_context",
      },
    };
  }

  const lines = rawMessage
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const hasReplyAsk = looksLikeReplyAsk(rawMessage);
  const askLineIndex = lines.findIndex((line) => looksLikeReplyAsk(line));
  const askLine = askLineIndex >= 0 ? lines[askLineIndex] : hasReplyAsk ? rawMessage : null;
  const urlMatch = rawMessage.match(URL_PATTERN);
  const authorHandle = urlMatch?.[1]?.toLowerCase() || extractHandleFromText(lines[0] || "");
  const candidateLines = lines.filter((_, index) => index !== askLineIndex);
  const sourceText = normalizeMultilineWhitespace(buildFallbackSourceText(candidateLines));
  const totalNonAskLength = sourceText.length;
  const looksLikePastedPost =
    Boolean(urlMatch) ||
    Boolean(authorHandle) ||
    (lines.length >= 2 && totalNonAskLength >= 80) ||
    totalNonAskLength >= 140;

  if (hasReplyAsk && sourceText.length < 30) {
    return {
      classification: "reply_request_missing_post",
      context: null,
    };
  }

  if (
    hasReplyAsk &&
    sourceText.length >= 30 &&
    looksLikePastedPost &&
    !looksLikeQuotedSnippet(sourceText)
  ) {
    const confidence: EmbeddedReplyConfidence =
      urlMatch || authorHandle || totalNonAskLength >= 160 || lines.length >= 4 ? "high" : "medium";
    return {
      classification: "reply_request_with_embedded_post",
      context: {
        sourceText,
        sourceUrl: urlMatch?.[0] || null,
        authorHandle,
        quotedUserAsk: askLine,
        confidence,
        parseReason:
          urlMatch || authorHandle
            ? "reply_ask_with_post_metadata"
            : "reply_ask_with_multiline_post_block",
      },
    };
  }

  if (!hasReplyAsk && looksLikePastedPost && sourceText.length >= 80 && !looksLikeQuotedSnippet(sourceText)) {
    return {
      classification: "embedded_post_without_reply_request",
      context: {
        sourceText,
        sourceUrl: urlMatch?.[0] || null,
        authorHandle,
        quotedUserAsk: null,
        confidence: urlMatch || authorHandle ? "high" : "medium",
        parseReason: "embedded_post_without_reply_instruction",
      },
    };
  }

  return {
    classification: "plain_chat",
    context: null,
  };
}

export function buildReplyParseEnvelope(
  parseResult: EmbeddedReplyParseResult,
): ChatReplyParseEnvelope | null {
  if (!parseResult.context) {
    if (parseResult.classification === "reply_request_missing_post") {
      return {
        detected: true,
        confidence: "low",
        needsConfirmation: false,
        parseReason: "reply_request_missing_post",
      };
    }
    return null;
  }

  return {
    detected: parseResult.classification !== "plain_chat",
    confidence: parseResult.context.confidence,
    needsConfirmation:
      parseResult.classification === "reply_request_with_embedded_post" &&
      parseResult.context.confidence === "medium",
    parseReason: parseResult.context.parseReason,
  };
}

export function buildReplyConfirmationPrompt(context: EmbeddedReplyContext): string {
  const opener = context.authorHandle
    ? `looks like you pasted a post from @${context.authorHandle}.`
    : "looks like you pasted a post.";
  return `${opener} should i treat that block as the post and give you 3 reply options?`;
}

export function buildMissingReplyPostPrompt(): string {
  return "paste the post text or x url you want to reply to, and i'll turn it into 3 grounded reply options.";
}

export function buildEmbeddedPostWithoutReplyPrompt(context: EmbeddedReplyContext): string {
  const opener = context.authorHandle
    ? `that looks like a post from @${context.authorHandle}.`
    : "that looks like a pasted post.";
  return `${opener} do you want me to help you reply to it, analyze it, or turn it into a quote reply?`;
}

export function buildReplyConfirmationQuickReplies() {
  return [
    {
      kind: "clarification_choice" as const,
      value: "yes, treat that as the post",
      label: "Yes, that's the post",
    },
    {
      kind: "clarification_choice" as const,
      value: "no, that's not the post",
      label: "No, not that",
    },
  ];
}

export function buildReplyOptionsQuickReplies(optionCount: number) {
  return Array.from({ length: Math.min(3, optionCount) }, (_, index) => ({
    kind: "planner_action" as const,
    value: `go with option ${index + 1}`,
    label: `Go with option ${index + 1}`,
  }));
}

export function buildReplyDraftQuickReplies() {
  return [
    {
      kind: "planner_action" as const,
      value: "make it bolder",
      label: "Make it bolder",
    },
    {
      kind: "planner_action" as const,
      value: "make it less harsh",
      label: "Less harsh",
    },
    {
      kind: "planner_action" as const,
      value: "make it shorter",
      label: "Shorter",
    },
  ];
}

function normalizeFollowUp(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function resolveReplyOptionIndex(
  userMessage: string,
  optionCount: number,
): number | null {
  const normalized = normalizeFollowUp(userMessage);
  for (const pattern of REPLY_DRAFT_SELECTION_PATTERNS) {
    const match = normalized.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const raw = match[1];
    const index =
      raw === "first" ? 1 : raw === "second" ? 2 : raw === "third" ? 3 : Number.parseInt(raw, 10);
    if (Number.isFinite(index) && index >= 1 && index <= optionCount) {
      return index - 1;
    }
  }

  return null;
}

export function resolveReplyContinuation(args: {
  userMessage: string;
  activeReplyContext: ActiveReplyContext | null | undefined;
}): ReplyContinuationResult | null {
  const context = args.activeReplyContext;
  if (!context) {
    return null;
  }

  const normalized = normalizeFollowUp(args.userMessage);

  if (context.awaitingConfirmation) {
    if (REPLY_CONFIRM_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return { type: "confirm" };
    }

    if (REPLY_DECLINE_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return { type: "decline" };
    }

    return null;
  }

  if (context.latestReplyOptions.length > 0) {
    const optionIndex = resolveReplyOptionIndex(args.userMessage, context.latestReplyOptions.length);
    if (optionIndex !== null) {
      return {
        type: "select_option",
        optionIndex,
      };
    }
  }

  if (context.latestReplyDraftOptions.length > 0 && REPLY_DRAFT_FOLLOWUP_PATTERNS.some((pattern) => pattern.test(normalized))) {
    const tone =
      /\b(?:bold|bolder|punchier|spicier)\b/.test(normalized)
        ? "bold"
        : /\b(?:warm|warmer|softer|gentler|less harsh|less aggressive)\b/.test(normalized)
          ? "warm"
          : /\b(?:dry|drier)\b/.test(normalized)
            ? "dry"
            : "builder";
    const length =
      /\b(?:shorter|shorten|tighter|trim)\b/.test(normalized)
        ? "shorter"
        : /\b(?:longer|expand|more detailed)\b/.test(normalized)
          ? "longer"
          : "same";

    return {
      type: "revise_draft",
      tone,
      length,
    };
  }

  return null;
}

export function shouldClearReplyWorkflow(args: {
  activeReplyContext: ActiveReplyContext | null | undefined;
  turnSource: "free_text" | "ideation_pick" | "quick_reply" | "draft_action" | "reply_action";
  replyParseResult: EmbeddedReplyParseResult;
  replyContinuation: ReplyContinuationResult | null;
}): boolean {
  if (!args.activeReplyContext) {
    return false;
  }

  if (args.turnSource !== "free_text") {
    return true;
  }

  if (args.replyContinuation) {
    return false;
  }

  return args.replyParseResult.classification === "plain_chat";
}

export function createEmptyActiveReplyContext(args: {
  sourceText: string;
  sourceUrl: string | null;
  authorHandle: string | null;
  quotedUserAsk: string | null;
  confidence: EmbeddedReplyConfidence;
  parseReason: string;
  awaitingConfirmation: boolean;
  stage: ActiveReplyContext["stage"];
  tone: ActiveReplyContext["tone"];
  goal: string;
}): ActiveReplyContext {
  return {
    sourceText: args.sourceText,
    sourceUrl: args.sourceUrl,
    authorHandle: args.authorHandle,
    quotedUserAsk: args.quotedUserAsk,
    confidence: args.confidence,
    parseReason: args.parseReason,
    awaitingConfirmation: args.awaitingConfirmation,
    stage: args.stage,
    tone: args.tone,
    goal: args.goal,
    opportunityId: `chat-reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    latestReplyOptions: [],
    latestReplyDraftOptions: [],
    selectedReplyOptionId: null,
  };
}

export function buildReplyArtifactsFromOptions(args: {
  context: ActiveReplyContext;
  response: {
    options: ExtensionReplyOptionChoice[];
    warnings: string[];
    groundingNotes: string[];
  };
}): ChatReplyArtifacts {
  return {
    kind: "reply_options",
    sourceText: args.context.sourceText,
    sourceUrl: args.context.sourceUrl,
    authorHandle: args.context.authorHandle,
    options: args.response.options.map((option) => ({
      id: option.id,
      label: option.label,
      text: option.text,
      intent: option.intent,
    })),
    groundingNotes: args.response.groundingNotes,
    warnings: args.response.warnings,
    selectedOptionId: args.context.selectedReplyOptionId,
  };
}

export function buildReplyArtifactsFromDraft(args: {
  context: ActiveReplyContext;
  response: ExtensionReplyDraftResponse;
}): ChatReplyArtifacts {
  return {
    kind: "reply_draft",
    sourceText: args.context.sourceText,
    sourceUrl: args.context.sourceUrl,
    authorHandle: args.context.authorHandle,
    options: args.response.options.map((option) => ({
      id: option.id,
      label: option.label,
      text: option.text,
      intent: option.intent,
    })),
    notes: args.response.notes || [],
    selectedOptionId: args.context.selectedReplyOptionId,
  };
}
