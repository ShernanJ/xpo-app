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

export type DraftFormatPreference = "shortform" | "longform" | "thread";

export type ResponseMode =
  | "natural_chat"
  | "light_guidance"
  | "structured_generation";

export type SurfaceMode =
  | "answer_directly"
  | "ask_one_question"
  | "revise_and_return"
  | "offer_options"
  | "generate_full_output";

export interface ResponseShapePlan {
  mode: ResponseMode;
  surfaceMode: SurfaceMode;
  shouldShowArtifacts: boolean;
  shouldExplainReasoning: boolean;
  shouldAskFollowUp: boolean;
  maxFollowUps: 0 | 1;
}

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
  | "entity_context_missing"
  | "career_context_missing";

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

export interface ActiveDraftRef {
  messageId: string;
  versionId: string;
  revisionChainId?: string | null;
}

export interface V2ConversationMemory {
  conversationState: ConversationState;
  activeConstraints: string[];
  topicSummary: string | null;
  lastIdeationAngles: string[];
  concreteAnswerCount: number;
  currentDraftArtifactId: string | null;
  activeDraftRef: ActiveDraftRef | null;
  rollingSummary: string | null;
  pendingPlan: StrategyPlan | null;
  clarificationState: ClarificationState | null;
  assistantTurnCount: number;
  latestRefinementInstruction: string | null;
  unresolvedQuestion: string | null;
  clarificationQuestionsAsked: number;
  preferredSurfaceMode: "natural" | "structured" | null;
  formatPreference: DraftFormatPreference | null;
  voiceFidelity: "balanced";
}

export type V2ChatOutputShape =
  | "coach_question"
  | "ideation_angles"
  | "planning_outline"
  | "short_form_post"
  | "long_form_post"
  | "thread_seed";

// ---------------------------------------------------------------------------
// V3 Conversational Orchestrator Types
// ---------------------------------------------------------------------------

/** High-level user goal resolved by the turn planner. */
export type UserGoal = "chat" | "ideate" | "draft" | "edit" | "review";

/**
 * Output of the deterministic turn planner that runs before the LLM
 * classifier. When present, it can override the classified intent to
 * short-circuit unnecessary clarification loops.
 */
export interface TurnPlan {
  userGoal: UserGoal;
  shouldGenerate: boolean;
  responseStyle: "natural" | "structured";
  shouldAutoDraftFromPlan?: boolean;
  targetDraftId?: string;
  /** If set, skip LLM classification and use this intent directly. */
  overrideClassifiedIntent?: V2ChatIntent;
}

/**
 * Extended memory payload carried through the conversation.
 * Complements V2ConversationMemory with richer tracking fields.
 */
export interface AgentMemoryV3 {
  topicSummary?: string;
  activeConstraints?: string[];
  currentDraftId?: string;
  currentAngle?: string;
  unresolvedQuestions?: string[];
}

/** Multi-dimensional draft quality score (for future best-of-N selection). */
export interface DraftScore {
  hook: number;
  clarity: number;
  novelty: number;
  voiceMatch: number;
}
