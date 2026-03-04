export type V2ChatIntent =
  | "coach"
  | "ideate"
  | "plan"
  | "planner_feedback"
  | "draft"
  | "review"
  | "edit"
  | "answer_question";

export type ConversationState =
  | "collecting_context"
  | "needs_more_context"
  | "ready_to_ideate"
  | "plan_pending_approval"
  | "draft_ready"
  | "editing";

export type DraftPreference =
  | "balanced"
  | "voice_first"
  | "growth_first";

export type DraftFormatPreference = "shortform" | "longform";

export interface StrategyPlan {
  objective: string;
  angle: string;
  targetLane: "original" | "reply" | "quote";
  mustInclude: string[];
  mustAvoid: string[];
  hookType: string;
  pitchResponse: string;
  deliveryPreference?: DraftPreference;
  formatPreference?: DraftFormatPreference;
}

export type ClarificationBranchKey =
  | "vague_draft_request"
  | "lazy_request"
  | "plan_reject"
  | "topic_known_but_direction_missing"
  | "abstract_topic_focus_pick"
  | "semantic_repair"
  | "entity_context_missing";

export interface CreatorChatQuickReply {
  kind:
    | "content_focus"
    | "example_reply"
    | "planner_action"
    | "clarification_choice";
  value: string;
  label: string;
  suggestedFocus?: string;
  explicitIntent?: V2ChatIntent;
  formatPreference?: DraftFormatPreference;
}

export interface ClarificationState {
  branchKey: ClarificationBranchKey;
  stepKey: string;
  seedTopic: string | null;
  options: CreatorChatQuickReply[];
}

export interface V2ConversationMemory {
  conversationState: ConversationState;
  activeConstraints: string[];
  topicSummary: string | null;
  concreteAnswerCount: number;
  currentDraftArtifactId: string | null;
  rollingSummary: string | null;
  pendingPlan: StrategyPlan | null;
  clarificationState: ClarificationState | null;
  assistantTurnCount: number;
  formatPreference: DraftFormatPreference | null;
  voiceFidelity: "balanced";
}

export type V2ChatOutputShape =
  | "coach_question"
  | "ideation_angles"
  | "planning_outline"
  | "short_form_post"
  | "long_form_post";
