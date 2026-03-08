import type { VoiceStyleCard } from "../core/styleProfile";
import type { ConversationState } from "../contracts/chat";
// @ts-expect-error TS5097 - orchestrator utilities are executed directly in node strip-types tests.
import { generateCoachReply } from "../agents/coach.ts";
import { getDeterministicChatReply } from "./chatResponderDeterministic";

// ---------------------------------------------------------------------------
// Chat Responder (V3)
// ---------------------------------------------------------------------------
// Lightweight responder for conversational turns that don't need the full
// generation pipeline. Handles angle comparison, explanations, constraint
// acknowledgment, and general discussion about content strategy.
// ---------------------------------------------------------------------------

/** Determines whether a message is a constraint declaration (e.g. "no emojis"). */
export function isConstraintDeclaration(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (normalized.length > 80) {
    return false;
  }

  const constraintPatterns = [
    /^no\s+\w+/,
    /^don'?t\s+(use|say|mention|include|add)\b/,
    /^never\s+(use|say|mention|include|add)\b/,
    /^avoid\s+\w+/,
    /^stop\s+(using|saying|mentioning|adding)\b/,
    /^keep\s+it\s+(under|short|tight|casual|natural)/,
    /^(less|more)\s+\w+$/,
  ];

  return constraintPatterns.some((pattern) => pattern.test(normalized));
}

/** Build a short acknowledgment for a constraint declaration. */
export function buildConstraintAcknowledgment(message: string): string {
  const normalized = message.trim().toLowerCase();

  if (normalized.includes("emoji")) {
    return "got it — no emojis from here on. anything else you want to adjust?";
  }

  if (normalized.includes("hashtag")) {
    return "noted — dropping hashtags. anything else?";
  }

  if (normalized.includes("cta") || normalized.includes("call to action")) {
    return "understood — keeping it CTA-free. want me to revise the current draft or keep going?";
  }

  if (normalized.includes("shorter") || normalized.includes("under")) {
    return "got it — keeping it tighter. want me to trim the current draft?";
  }

  if (/\bless\s+\w+/.test(normalized) || /\bmore\s+\w+/.test(normalized)) {
    return `noted — i'll apply that going forward. want me to revise the current draft with this in mind?`;
  }

  return `got it — i'll keep that in mind for this thread. anything else to lock in?`;
}

/**
 * Respond to a conversational turn without triggering generation.
 * Delegates to the existing coach agent but with a lighter prompt intent.
 *
 * Returns null if this doesn't look like a pure-chat turn (in which case
 * the caller should fall through to the standard orchestration pipeline).
 */
export async function respondConversationally(args: {
  userMessage: string;
  recentHistory: string;
  topicSummary: string | null;
  styleCard: VoiceStyleCard | null;
  topicAnchors: string[];
  userContextString: string;
  activeConstraints?: string[];
  options?: {
    goal?: string;
    conversationState?: ConversationState;
    antiPatterns?: string[];
  };
}): Promise<string | null> {
  // Short-circuit for constraint declarations — no LLM call needed.
  if (isConstraintDeclaration(args.userMessage)) {
    return buildConstraintAcknowledgment(args.userMessage);
  }

  const deterministicReply = getDeterministicChatReply({
    userMessage: args.userMessage,
    recentHistory: args.recentHistory,
    userContextString: args.userContextString,
    activeConstraints: args.activeConstraints,
  });
  if (deterministicReply) {
    return deterministicReply;
  }

  // Otherwise use the existing coach for a conversational reply.
  const reply = await generateCoachReply(
    args.userMessage,
    args.recentHistory,
    args.topicSummary,
    args.styleCard,
    args.topicAnchors,
    args.userContextString,
    args.options,
  );

  return reply?.response ?? null;
}
