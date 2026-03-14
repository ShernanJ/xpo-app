import type { VoiceStyleCard } from "../core/styleProfile";
import type { ConversationState } from "../contracts/chat";
import { generateCoachReply } from "../agents/coach.ts";
import type { ConversationalDiagnosticContext } from "../runtime/diagnostics.ts";
import {
  buildConstraintAcknowledgment,
  isConstraintDeclaration,
} from "./constraintAcknowledgment.ts";
import { getDeterministicChatReply } from "./chatResponderDeterministic.ts";

// ---------------------------------------------------------------------------
// Chat Responder (V3)
// ---------------------------------------------------------------------------
// Lightweight responder for conversational turns that don't need the full
// generation pipeline. Handles angle comparison, explanations, constraint
// acknowledgment, and general discussion about content strategy.
// ---------------------------------------------------------------------------

export { buildConstraintAcknowledgment, isConstraintDeclaration } from "./constraintAcknowledgment.ts";

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
  diagnosticContext?: ConversationalDiagnosticContext | null;
  options?: {
    goal?: string;
    conversationState?: ConversationState;
    antiPatterns?: string[];
  };
}): Promise<string | null> {
  // Short-circuit for constraint declarations — no LLM call needed.
  if (isConstraintDeclaration(args.userMessage)) {
    return buildConstraintAcknowledgment({
      message: args.userMessage,
      recentHistory: args.recentHistory,
    });
  }

  const deterministicReply = getDeterministicChatReply({
    userMessage: args.userMessage,
    recentHistory: args.recentHistory,
    userContextString: args.userContextString,
    activeConstraints: args.activeConstraints,
    diagnosticContext: args.diagnosticContext,
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
