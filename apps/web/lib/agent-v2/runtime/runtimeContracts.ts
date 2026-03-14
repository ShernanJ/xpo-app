export type AgentRuntimeWorkflow =
  | "answer_question"
  | "ideate"
  | "plan_then_draft"
  | "revise_draft"
  | "reply_to_post"
  | "analyze_post";

export type RuntimeResolutionSource =
  | "structured_turn"
  | "explicit_intent"
  | "turn_plan"
  | "controller"
  | "pipeline_continuation";

export type CapabilityName =
  | "shared"
  | "answer_question"
  | "ideation"
  | "planning"
  | "drafting"
  | "revising"
  | "replying"
  | "analysis";

export type RuntimeWorkerPhase =
  | "context_load"
  | "execution"
  | "validation"
  | "persistence";

export type RuntimeWorkerMode = "sequential" | "parallel";

export type RuntimeWorkerStatus = "completed" | "skipped" | "failed";

export interface RuntimeWorkerExecution {
  worker: string;
  capability: CapabilityName;
  phase: RuntimeWorkerPhase;
  mode: RuntimeWorkerMode;
  status: RuntimeWorkerStatus;
  groupId: string | null;
  details?: Record<string, unknown> | null;
}

export interface RuntimeWorkerExecutionSummary {
  total: number;
  parallel: number;
  sequential: number;
  completed: number;
  skipped: number;
  failed: number;
  groups: string[];
}

export interface RuntimePersistedThreadChange {
  threadId: string;
  updatedTitle: string | null;
  titleChanged: boolean;
}

export interface RuntimePersistedMemoryChange {
  updated: boolean;
  preferredSurfaceMode: "natural" | "structured" | null;
  activeDraftVersionId: string | null;
  clearedReplyWorkflow: boolean;
  selectedReplyOptionId: string | null;
}

export interface RuntimePersistedDraftCandidateChange {
  attempted: number;
  created: number;
  skipped: number;
}

export interface RuntimePersistedStateChanges {
  assistantMessageId: string | null;
  thread: RuntimePersistedThreadChange | null;
  memory: RuntimePersistedMemoryChange | null;
  draftCandidates: RuntimePersistedDraftCandidateChange | null;
}

export interface RuntimePersistenceTracePatch {
  workerExecutions: RuntimeWorkerExecution[];
  persistedStateChanges: RuntimePersistedStateChanges;
}

export type RuntimeValidationStatus =
  | "passed"
  | "failed"
  | "clarification_required";

export interface RuntimeValidationResult {
  validator: string;
  capability: CapabilityName;
  status: RuntimeValidationStatus;
  issues: string[];
  corrected: boolean;
}

export type RuntimeResponseSeed<TResponse extends { memory: unknown }> = Omit<
  TResponse,
  "memory"
>;

export interface CapabilityResponseOutput<TResponse> {
  kind: "response";
  response: TResponse;
}

export type CapabilityPatchedResponseOutput<TResponse, TPatch> =
  CapabilityResponseOutput<TResponse> & {
    routingTracePatch?: TPatch;
  };

export interface CapabilityExecutionRequest<TContext = unknown> {
  workflow: AgentRuntimeWorkflow;
  capability: CapabilityName;
  context: TContext;
  planSeed?: string | null;
  activeContextRefs?: string[];
}

export interface CapabilityExecutionResult<TOutput = unknown> {
  workflow: AgentRuntimeWorkflow;
  capability: CapabilityName;
  output: TOutput;
  workers?: RuntimeWorkerExecution[];
  validations?: RuntimeValidationResult[];
}
