import type { ClarificationBranchKey, V2ChatIntent } from "../contracts/chat";

export type ConversationRouterState =
  | "approve_pending_plan"
  | "clarify_before_generation"
  | "continue";

export function resolveConversationRouterState(args: {
  explicitIntent?: V2ChatIntent | null;
  mode: string;
  conversationState: string;
  hasPendingPlan: boolean;
  hasOutstandingClarification: boolean;
  shouldAutoDraftFromPlan: boolean;
  hasEnoughContextToAct: boolean;
  clarificationBranchKey?: ClarificationBranchKey | null;
}): ConversationRouterState {
  if (
    !args.explicitIntent &&
    args.mode === "planner_feedback" &&
    args.conversationState === "plan_pending_approval" &&
    args.hasPendingPlan
  ) {
    return "approve_pending_plan";
  }

  if (
    !args.explicitIntent &&
    args.mode === "plan" &&
    args.shouldAutoDraftFromPlan !== true &&
    !args.hasEnoughContextToAct &&
    !args.hasOutstandingClarification
  ) {
    return "clarify_before_generation";
  }

  return "continue";
}
