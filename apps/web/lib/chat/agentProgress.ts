import type { V2ChatIntent } from "../agent-v2/contracts/chat.ts";
import type {
  ChatArtifactContext,
  ChatTurnSource,
} from "../agent-v2/contracts/turnContract.ts";
import type { ThreadFramingStyle } from "../onboarding/draftArtifacts.ts";

export type PendingStatusWorkflow =
  | "answer_question"
  | "ideate"
  | "plan_then_draft"
  | "revise_draft"
  | "reply_to_post"
  | "analyze_post";

export type PendingStatusStepId =
  | "queued"
  | "understand_request"
  | "gather_context"
  | "plan_response"
  | "generate_output"
  | "validate_output"
  | "persist_response";

export type PendingStatusStepState = "pending" | "active" | "completed";
export type AgentProgressPhase = "active" | "completed" | "failed";

export interface PendingStatusStep {
  id: PendingStatusStepId;
  label: string;
  explanation: string;
  afterMs: number | null;
}

export interface PendingStatusResolvedStep extends PendingStatusStep {
  status: PendingStatusStepState;
}

export interface PendingStatusStepOverride {
  label?: string | null;
  explanation?: string | null;
}

export interface PendingStatusPlan {
  workflow: PendingStatusWorkflow;
  steps: PendingStatusStep[];
  fallbackLabel: string;
}

export interface PendingStatusSnapshot {
  workflow: PendingStatusWorkflow;
  steps: PendingStatusResolvedStep[];
  activeStepId: PendingStatusStepId | null;
  summaryLabel: string;
}

export interface AgentProgressRun {
  workflow: PendingStatusWorkflow;
  plan: PendingStatusPlan;
  phase: AgentProgressPhase;
  startedAtMs: number;
  endedAtMs: number | null;
  activeStepId: PendingStatusStepId | null;
  backendStatus: string | null;
  stepOverrides: Partial<Record<PendingStatusStepId, PendingStatusStepOverride>>;
  frozenSnapshot: PendingStatusSnapshot | null;
}

const STEP_DELAYS_MS = [null, 900, 2200, 4200] as const;

const PENDING_STATUS_WORKFLOWS: readonly PendingStatusWorkflow[] = [
  "answer_question",
  "ideate",
  "plan_then_draft",
  "revise_draft",
  "reply_to_post",
  "analyze_post",
];

const PENDING_STATUS_STEP_IDS: readonly PendingStatusStepId[] = [
  "queued",
  "understand_request",
  "gather_context",
  "plan_response",
  "generate_output",
  "validate_output",
  "persist_response",
];

function normalizeMessage(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, " ");
}

function looksLikeBareDraftRequest(message: string): boolean {
  const normalized = normalizeMessage(message);
  return [
    "write a post",
    "write me a post",
    "draft a post",
    "give me a post",
    "write a thread",
    "write me a thread",
    "draft a thread",
    "give me a thread",
    "write a post about anything",
    "write a thread about anything",
  ].includes(normalized);
}

function looksLikeIdeationPrompt(message: string): boolean {
  const normalized = normalizeMessage(message);
  return (
    looksLikeBareDraftRequest(normalized) ||
    /what should i post|give me (?:some )?ideas|help me come up with|brainstorm/.test(
      normalized,
    )
  );
}

function looksLikeDraftRequest(message: string): boolean {
  const normalized = normalizeMessage(message);
  return (
    /\b(write|draft|turn this into|make this into)\b/.test(normalized) &&
    /\b(post|thread|tweet)\b/.test(normalized)
  );
}

function looksLikeThreadConversionRequest(args: {
  message: string;
  threadFramingStyleOverride?: ThreadFramingStyle | null;
}): boolean {
  if (args.threadFramingStyleOverride) {
    return true;
  }

  const normalized = normalizeMessage(args.message);
  return (
    normalized.includes("turn this into a thread") ||
    normalized.includes("turn this into thread") ||
    normalized.includes("turn into a thread") ||
    normalized.includes("turn into thread") ||
    normalized.includes("convert to thread") ||
    normalized.includes("convert this into a thread") ||
    normalized.includes("make it a thread") ||
    normalized === "make thread" ||
    normalized.includes("keep the same thread") ||
    normalized.includes("remove thread numbering") ||
    normalized.includes("make the opener clearly signal the thread")
  );
}

function looksLikeReplyRequest(message: string): boolean {
  const normalized = normalizeMessage(message);
  return (
    /\b(reply|quote reply)\b/.test(normalized) &&
    /\b(this|post|tweet)\b/.test(normalized)
  );
}

function looksLikeAnalyzeRequest(message: string): boolean {
  const normalized = normalizeMessage(message);
  return (
    /\banaly[sz]e\b/.test(normalized) ||
    normalized.includes("underperforming") ||
    normalized.includes("what's working") ||
    normalized.includes("what is working") ||
    normalized.includes("break this down")
  );
}

function withDelay(step: Omit<PendingStatusStep, "afterMs">, index: number): PendingStatusStep {
  return {
    ...step,
    afterMs: STEP_DELAYS_MS[index] ?? null,
  };
}

function buildStatusSteps(args: {
  workflow: PendingStatusWorkflow;
  isThreadConversion: boolean;
}): PendingStatusStep[] {
  switch (args.workflow) {
    case "ideate":
      return [
        withDelay(
          {
            id: "understand_request",
            label: "Understanding what kind of idea would help most",
            explanation: "This helps the assistant focus on the job you actually want done.",
          },
          0,
        ),
        withDelay(
          {
            id: "gather_context",
            label: "Looking through the relevant context",
            explanation: "This helps ground the next ideas in your lane and recent conversation.",
          },
          1,
        ),
        withDelay(
          {
            id: "plan_response",
            label: "Picking the strongest angle",
            explanation: "This helps narrow things down to the clearest direction to run with.",
          },
          2,
        ),
        withDelay(
          {
            id: "generate_output",
            label: "Packaging the ideas",
            explanation: "This helps turn the best direction into a clean, easy-to-read response.",
          },
          3,
        ),
      ];
    case "plan_then_draft":
      return [
        withDelay(
          {
            id: "understand_request",
            label: "Understanding the request",
            explanation: "This helps the assistant lock onto the job you want done before writing.",
          },
          0,
        ),
        withDelay(
          {
            id: "gather_context",
            label: "Gathering the right context",
            explanation: "This helps the draft fit your topic, tone, and current conversation.",
          },
          1,
        ),
        withDelay(
          {
            id: "generate_output",
            label: "Drafting the post",
            explanation: "This is where the first working version gets written.",
          },
          2,
        ),
        withDelay(
          {
            id: "persist_response",
            label: "Saving the draft back into the chat",
            explanation: "This helps return the finished draft cleanly and keep the thread in sync.",
          },
          3,
        ),
      ];
    case "revise_draft":
      return [
        withDelay(
          {
            id: "understand_request",
            label: args.isThreadConversion
              ? "Understanding the thread change"
              : "Understanding the revision",
            explanation: args.isThreadConversion
              ? "This helps the assistant keep the main idea while reshaping the format."
              : "This helps the assistant focus on the exact change you want made.",
          },
          0,
        ),
        withDelay(
          {
            id: "gather_context",
            label: args.isThreadConversion
              ? "Mapping the thread flow"
              : "Checking the current draft",
            explanation: args.isThreadConversion
              ? "This helps the thread feel connected from one post to the next."
              : "This helps the assistant revise the draft without losing the original intent.",
          },
          1,
        ),
        withDelay(
          {
            id: "generate_output",
            label: args.isThreadConversion
              ? "Turning it into a thread"
              : "Reworking the draft",
            explanation: args.isThreadConversion
              ? "This is where the content gets reshaped into a thread structure."
              : "This is where the requested edits are applied to the draft.",
          },
          2,
        ),
        withDelay(
          {
            id: "persist_response",
            label: "Saving the revision back into the chat",
            explanation: "This helps the revised version come back cleanly and stay attached to the right draft.",
          },
          3,
        ),
      ];
    case "reply_to_post":
      return [
        withDelay(
          {
            id: "understand_request",
            label: "Understanding the post",
            explanation: "This helps the assistant catch the tone and main point before replying.",
          },
          0,
        ),
        withDelay(
          {
            id: "gather_context",
            label: "Gathering the right context",
            explanation: "This helps the reply feel relevant to the conversation around it.",
          },
          1,
        ),
        withDelay(
          {
            id: "generate_output",
            label: "Writing the reply",
            explanation: "This is where the response is drafted in a way that feels natural.",
          },
          2,
        ),
        withDelay(
          {
            id: "persist_response",
            label: "Saving the reply back into the chat",
            explanation: "This helps make sure the reply lands cleanly in the thread.",
          },
          3,
        ),
      ];
    case "analyze_post":
      return [
        withDelay(
          {
            id: "understand_request",
            label: "Understanding what to review",
            explanation: "This helps the assistant focus on the post or result you want explained.",
          },
          0,
        ),
        withDelay(
          {
            id: "gather_context",
            label: "Gathering the key context",
            explanation: "This helps the feedback stay tied to what is actually in front of it.",
          },
          1,
        ),
        withDelay(
          {
            id: "generate_output",
            label: "Pulling out the main insight",
            explanation: "This is where the assistant turns the review into a clear takeaway.",
          },
          2,
        ),
        withDelay(
          {
            id: "persist_response",
            label: "Saving the breakdown back into the chat",
            explanation: "This helps the feedback come back in a clean, usable format.",
          },
          3,
        ),
      ];
    case "answer_question":
    default:
      return [
        withDelay(
          {
            id: "understand_request",
            label: "Understanding the request",
            explanation: "This helps the assistant lock onto what you are asking for.",
          },
          0,
        ),
        withDelay(
          {
            id: "gather_context",
            label: "Gathering the right context",
            explanation: "This helps the answer fit the conversation instead of sounding generic.",
          },
          1,
        ),
        withDelay(
          {
            id: "generate_output",
            label: "Writing the response",
            explanation: "This is where the answer is put together in plain language.",
          },
          2,
        ),
        withDelay(
          {
            id: "persist_response",
            label: "Saving the response back into the chat",
            explanation: "This helps the final answer come back clearly and stay attached to the right turn.",
          },
          3,
        ),
      ];
  }
}

function resolveStepIndexFromElapsed(plan: PendingStatusPlan, elapsedMs: number): number {
  let activeIndex = 0;
  for (const [index, step] of plan.steps.entries()) {
    if (typeof step.afterMs === "number" && elapsedMs >= step.afterMs) {
      activeIndex = index;
    }
  }

  return activeIndex;
}

function resolveStepIndexFromId(
  plan: PendingStatusPlan,
  stepId: PendingStatusStepId | null | undefined,
): number | null {
  if (!stepId) {
    return null;
  }

  const index = plan.steps.findIndex((step) => step.id === stepId);
  return index >= 0 ? index : null;
}

function resolveBackendPendingStatusStepId(
  status?: string | null,
): PendingStatusStepId | null {
  const trimmed = status?.trim();
  if (!trimmed) {
    return null;
  }

  switch (trimmed) {
    case "Planning the next move.":
      return "gather_context";
    case "Writing draft options.":
      return "generate_output";
    case "Tightening the response.":
      return "validate_output";
    case "Finalizing the reply.":
      return "persist_response";
    case "Analyzing this draft.":
      return "gather_context";
    case "Comparing versions.":
      return "validate_output";
    default:
      return null;
  }
}

function resolveAppliedStep(
  step: PendingStatusStep,
  override?: PendingStatusStepOverride | null,
): PendingStatusStep {
  const nextLabel = override?.label?.trim();
  const nextExplanation = override?.explanation?.trim();

  return {
    ...step,
    label: nextLabel && nextLabel.length > 0 ? nextLabel : step.label,
    explanation:
      nextExplanation && nextExplanation.length > 0
        ? nextExplanation
        : step.explanation,
  };
}

export function isPendingStatusWorkflow(
  value: unknown,
): value is PendingStatusWorkflow {
  return typeof value === "string" && PENDING_STATUS_WORKFLOWS.includes(value as PendingStatusWorkflow);
}

export function isPendingStatusStepId(value: unknown): value is PendingStatusStepId {
  return typeof value === "string" && PENDING_STATUS_STEP_IDS.includes(value as PendingStatusStepId);
}

export function resolvePendingStatusWorkflow(args: {
  message: string;
  turnSource?: ChatTurnSource;
  artifactContext?: ChatArtifactContext | null;
  intent?: V2ChatIntent | null;
  threadFramingStyleOverride?: ThreadFramingStyle | null;
  hasSelectedDraftContext?: boolean;
}): PendingStatusWorkflow {
  if (
    args.turnSource === "reply_action" ||
    args.artifactContext?.kind === "reply_option_select" ||
    args.artifactContext?.kind === "reply_confirmation" ||
    args.artifactContext?.kind === "reply_request"
  ) {
    return "reply_to_post";
  }

  if (
    args.turnSource === "draft_action" ||
    args.artifactContext?.kind === "draft_selection" ||
    args.intent === "edit" ||
    args.intent === "review" ||
    args.hasSelectedDraftContext
  ) {
    return "revise_draft";
  }

  if (
    args.turnSource === "ideation_pick" ||
    args.artifactContext?.kind === "selected_angle"
  ) {
    return "plan_then_draft";
  }

  if (looksLikeThreadConversionRequest(args) && args.hasSelectedDraftContext) {
    return "revise_draft";
  }

  if (looksLikeReplyRequest(args.message)) {
    return "reply_to_post";
  }

  if (looksLikeAnalyzeRequest(args.message)) {
    return "analyze_post";
  }

  if (
    args.turnSource === "quick_reply" ||
    args.intent === "ideate" ||
    looksLikeIdeationPrompt(args.message)
  ) {
    return "ideate";
  }

  if (args.intent === "draft" || looksLikeDraftRequest(args.message)) {
    return "plan_then_draft";
  }

  return "answer_question";
}

export function buildPendingStatusPlan(args: {
  message: string;
  turnSource?: ChatTurnSource;
  artifactContext?: ChatArtifactContext | null;
  intent?: V2ChatIntent | null;
  threadFramingStyleOverride?: ThreadFramingStyle | null;
  hasSelectedDraftContext?: boolean;
}): PendingStatusPlan {
  const workflow = resolvePendingStatusWorkflow(args);
  const isThreadConversion =
    workflow === "revise_draft" && looksLikeThreadConversionRequest(args);
  const steps = buildStatusSteps({
    workflow,
    isThreadConversion,
  });

  return {
    workflow,
    steps,
    fallbackLabel: steps[steps.length - 1]?.label ?? "Understanding the request",
  };
}

export function normalizeBackendPendingStatus(
  status?: string | null,
): string | null {
  const trimmed = status?.trim();
  if (!trimmed) {
    return null;
  }

  const mappedStepId = resolveBackendPendingStatusStepId(trimmed);
  if (!mappedStepId) {
    return trimmed;
  }

  return mappedStepId
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function resolvePendingStatusSnapshot(args: {
  plan: PendingStatusPlan | null;
  elapsedMs: number;
  backendStatus?: string | null;
  activeStepId?: PendingStatusStepId | null;
  stepOverrides?: Partial<Record<PendingStatusStepId, PendingStatusStepOverride>>;
}): PendingStatusSnapshot | null {
  if (!args.plan) {
    return null;
  }

  const activeIndex =
    resolveStepIndexFromId(args.plan, args.activeStepId) ??
    resolveStepIndexFromId(
      args.plan,
      resolveBackendPendingStatusStepId(args.backendStatus),
    ) ??
    resolveStepIndexFromElapsed(args.plan, args.elapsedMs);

  const steps = args.plan.steps.map((step, index) => ({
    ...resolveAppliedStep(step, args.stepOverrides?.[step.id]),
    status:
      index < activeIndex
        ? "completed"
        : index === activeIndex
          ? "active"
          : "pending",
  })) satisfies PendingStatusResolvedStep[];
  const activeStep = steps[activeIndex] ?? null;

  return {
    workflow: args.plan.workflow,
    steps,
    activeStepId: activeStep?.id ?? null,
    summaryLabel: activeStep?.label ?? args.plan.fallbackLabel,
  };
}

export function resolvePendingStatusLabel(args: {
  plan: PendingStatusPlan | null;
  elapsedMs: number;
  backendStatus?: string | null;
  activeStepId?: PendingStatusStepId | null;
}): string | null {
  return (
    resolvePendingStatusSnapshot(args)?.summaryLabel ??
    normalizeBackendPendingStatus(args.backendStatus)
  );
}

export function createAgentProgressRun(args: {
  plan: PendingStatusPlan;
  startedAtMs?: number;
}): AgentProgressRun {
  return {
    workflow: args.plan.workflow,
    plan: args.plan,
    phase: "active",
    startedAtMs: args.startedAtMs ?? Date.now(),
    endedAtMs: null,
    activeStepId: args.plan.steps[0]?.id ?? null,
    backendStatus: null,
    stepOverrides: {},
    frozenSnapshot: null,
  };
}

export function applyAgentProgressStep(
  run: AgentProgressRun | null,
  args: {
    workflow: PendingStatusWorkflow;
    activeStepId: PendingStatusStepId;
    label?: string | null;
    explanation?: string | null;
  },
): AgentProgressRun | null {
  if (!run || run.plan.workflow !== args.workflow || run.phase !== "active") {
    return run;
  }

  if (!run.plan.steps.some((step) => step.id === args.activeStepId)) {
    return run;
  }

  const nextLabel = args.label?.trim();
  const nextExplanation = args.explanation?.trim();
  const shouldUpdateOverride =
    Boolean(nextLabel && nextLabel.length > 0) ||
    Boolean(nextExplanation && nextExplanation.length > 0);

  return {
    ...run,
    activeStepId: args.activeStepId,
    backendStatus: null,
    stepOverrides: shouldUpdateOverride
      ? {
          ...run.stepOverrides,
          [args.activeStepId]: {
            ...run.stepOverrides[args.activeStepId],
            ...(nextLabel && nextLabel.length > 0 ? { label: nextLabel } : {}),
            ...(nextExplanation && nextExplanation.length > 0
              ? { explanation: nextExplanation }
              : {}),
          },
        }
      : run.stepOverrides,
  };
}

export function applyAgentProgressBackendStatus(
  run: AgentProgressRun | null,
  status?: string | null,
): AgentProgressRun | null {
  if (!run || run.phase !== "active") {
    return run;
  }

  return {
    ...run,
    backendStatus: status?.trim() || null,
  };
}

export function resolveAgentProgressSnapshot(
  run: AgentProgressRun,
  nowMs?: number,
): PendingStatusSnapshot {
  if (run.frozenSnapshot) {
    return run.frozenSnapshot;
  }

  const elapsedMs = Math.max(0, (nowMs ?? Date.now()) - run.startedAtMs);
  return (
    resolvePendingStatusSnapshot({
      plan: run.plan,
      elapsedMs,
      backendStatus: run.backendStatus,
      activeStepId: run.activeStepId,
      stepOverrides: run.stepOverrides,
    }) ?? {
      workflow: run.workflow,
      steps: [],
      activeStepId: null,
      summaryLabel: run.plan.fallbackLabel,
    }
  );
}

export function completeAgentProgressRun(
  run: AgentProgressRun | null,
  phase: Exclude<AgentProgressPhase, "active">,
  endedAtMs?: number,
): AgentProgressRun | null {
  if (!run) {
    return null;
  }

  const resolvedEndedAtMs = endedAtMs ?? Date.now();
  const frozenSnapshot = resolveAgentProgressSnapshot(run, resolvedEndedAtMs);

  return {
    ...run,
    phase,
    endedAtMs: resolvedEndedAtMs,
    activeStepId:
      phase === "completed"
        ? run.plan.steps[run.plan.steps.length - 1]?.id ?? run.activeStepId
        : frozenSnapshot.activeStepId,
    frozenSnapshot:
      phase === "completed"
        ? {
            ...frozenSnapshot,
            activeStepId: run.plan.steps[run.plan.steps.length - 1]?.id ?? frozenSnapshot.activeStepId,
            summaryLabel:
              run.plan.steps[run.plan.steps.length - 1]?.label ??
              frozenSnapshot.summaryLabel,
            steps: frozenSnapshot.steps.map((step) => ({
              ...step,
              status: "completed",
            })),
          }
        : frozenSnapshot,
  };
}

export function formatAgentProgressDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatAgentProgressThoughtDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (seconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}
