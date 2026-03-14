import type { V2ChatIntent } from "../../../../lib/agent-v2/contracts/chat.ts";
import type {
  ChatArtifactContext,
  ChatTurnSource,
} from "../../../../lib/agent-v2/contracts/turnContract.ts";
import type { ThreadFramingStyle } from "../../../../lib/onboarding/draftArtifacts.ts";

export type PendingStatusWorkflow =
  | "answer_question"
  | "ideate"
  | "plan_then_draft"
  | "revise_draft"
  | "reply_to_post"
  | "analyze_post";

export interface PendingStatusStep {
  label: string;
  afterMs: number | null;
}

export interface PendingStatusPlan {
  workflow: PendingStatusWorkflow;
  steps: PendingStatusStep[];
  fallbackLabel: string;
}

const STEP_TWO_DELAY_MS = 1400;

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
    /what should i post|give me (?:some )?ideas|help me come up with|brainstorm/.test(normalized)
  );
}

function looksLikeDraftRequest(message: string): boolean {
  const normalized = normalizeMessage(message);
  return /\b(write|draft|turn this into|make this into)\b/.test(normalized) &&
    /\b(post|thread|tweet)\b/.test(normalized);
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
    normalized.includes("make it a thread") ||
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
    args.artifactContext?.kind === "reply_confirmation"
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

function buildStatusSteps(args: {
  workflow: PendingStatusWorkflow;
  isThreadConversion: boolean;
}): PendingStatusStep[] {
  switch (args.workflow) {
    case "ideate":
      return [
        { label: "thinking of a few directions", afterMs: null },
        { label: "picking the strongest one", afterMs: STEP_TWO_DELAY_MS },
      ];
    case "plan_then_draft":
      return [
        { label: "figuring out the angle", afterMs: null },
        { label: "drafting it now", afterMs: STEP_TWO_DELAY_MS },
      ];
    case "revise_draft":
      if (args.isThreadConversion) {
        return [
          { label: "mapping the thread flow", afterMs: null },
          { label: "turning it into a thread", afterMs: STEP_TWO_DELAY_MS },
        ];
      }

      return [
        { label: "reworking the draft", afterMs: null },
        { label: "tightening the wording", afterMs: STEP_TWO_DELAY_MS },
      ];
    case "reply_to_post":
      return [
        { label: "reading the post", afterMs: null },
        { label: "drafting a reply", afterMs: STEP_TWO_DELAY_MS },
      ];
    case "analyze_post":
      return [
        { label: "looking at what's working", afterMs: null },
        { label: "pulling out the main issue", afterMs: STEP_TWO_DELAY_MS },
      ];
    case "answer_question":
    default:
      return [{ label: "thinking this through", afterMs: null }];
  }
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
    fallbackLabel: steps[steps.length - 1]?.label ?? "thinking this through",
  };
}

export function normalizeBackendPendingStatus(
  status?: string | null,
): string | null {
  const trimmed = status?.trim();
  if (!trimmed) {
    return null;
  }

  switch (trimmed) {
    case "Planning the next move.":
      return "figuring out the angle";
    case "Writing draft options.":
      return "drafting it now";
    case "Tightening the response.":
      return "tightening the wording";
    case "Finalizing the reply.":
      return "getting it ready";
    case "Analyzing this draft.":
      return "looking at what's working";
    case "Comparing versions.":
      return "comparing the options";
    default:
      return trimmed;
  }
}

export function resolvePendingStatusLabel(args: {
  plan: PendingStatusPlan | null;
  elapsedMs: number;
  backendStatus?: string | null;
}): string | null {
  const backendLabel = normalizeBackendPendingStatus(args.backendStatus);
  if (backendLabel) {
    return backendLabel;
  }

  if (!args.plan) {
    return null;
  }

  let currentLabel = args.plan.steps[0]?.label ?? args.plan.fallbackLabel;
  for (const step of args.plan.steps.slice(1)) {
    if (typeof step.afterMs === "number" && args.elapsedMs >= step.afterMs) {
      currentLabel = step.label;
    }
  }

  return currentLabel;
}
