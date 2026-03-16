import type { VoiceStyleCard } from "../core/styleProfile";
import type { ConversationState } from "../contracts/chat";
import { generateCoachReply } from "../agents/coach.ts";
import type { ConversationalDiagnosticContext } from "../runtime/diagnostics.ts";
import type { ProfileReplyContext } from "../grounding/profileReplyContext.ts";
import {
  buildConstraintAcknowledgment,
  isConstraintDeclaration,
} from "./constraintAcknowledgment.ts";
import {
  getDeterministicChatReplySpec,
  type DeterministicChatReplySpec,
} from "./chatResponderDeterministic.ts";

// ---------------------------------------------------------------------------
// Chat Responder (V3)
// ---------------------------------------------------------------------------
// Lightweight responder for conversational turns that don't need the full
// generation pipeline. Handles angle comparison, explanations, constraint
// acknowledgment, and general discussion about content strategy.
// ---------------------------------------------------------------------------

export { buildConstraintAcknowledgment, isConstraintDeclaration } from "./constraintAcknowledgment.ts";

function responseLooksStructured(response: string): boolean {
  return (
    /^\s*(?:[-*]\s+|\d+\.\s+|#\s+|##\s+|###\s+|>\s+)/m.test(response) ||
    /\*\*[^*\n]+:\*\*/.test(response)
  );
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
  profileReplyContext?: ProfileReplyContext | null;
  activeConstraints?: string[];
  diagnosticContext?: ConversationalDiagnosticContext | null;
  options?: {
    goal?: string;
    conversationState?: ConversationState;
    antiPatterns?: string[];
  };
}): Promise<DeterministicChatReplySpec | null> {
  // Short-circuit for constraint declarations — no LLM call needed.
  if (isConstraintDeclaration(args.userMessage)) {
    return {
      response: buildConstraintAcknowledgment({
        message: args.userMessage,
        recentHistory: args.recentHistory,
      }),
    };
  }

  const deterministicReply = getDeterministicChatReplySpec({
    userMessage: args.userMessage,
    recentHistory: args.recentHistory,
    userContextString: args.userContextString,
    profileReplyContext: args.profileReplyContext,
    activeConstraints: args.activeConstraints,
    topicAnchors: args.topicAnchors,
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

  return reply?.response
    ? {
        response: reply.response,
        presentationStyle: responseLooksStructured(reply.response)
          ? "preserve_authored_structure"
          : undefined,
      }
    : null;
}
