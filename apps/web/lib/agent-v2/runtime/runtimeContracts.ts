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
  | "controller";

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
