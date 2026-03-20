import {
  mapControllerActionToIntent,
  mapIntentToControllerAction,
  resolveArtifactContinuationAction,
  resolveTopLevelAction,
  type ControllerDecision,
  type ControllerMemorySummary,
} from "../agents/controller.ts";
import type { TurnPlan, V2ChatIntent } from "../contracts/chat.ts";
import type {
  ChatArtifactContext,
  ChatResolvedWorkflow,
  ChatTurnSource,
} from "../contracts/turnContract.ts";
import type {
  AgentRuntimeWorkflow,
  RuntimeResolutionSource,
} from "./runtimeContracts.ts";
import { isBareDraftRequest } from "../core/conversationHeuristics.ts";
import { looksLikeSimpleSocialTurn } from "../core/simpleSocialTurn.ts";
import { isRevisionRetryApproval } from "./turnRelation.ts";

export interface RuntimeActionResolution {
  workflow: AgentRuntimeWorkflow;
  classifiedIntent: V2ChatIntent;
  source: RuntimeResolutionSource;
  decision: ControllerDecision;
}

function buildStructuredDecision(args: {
  action: ControllerDecision["action"];
  rationale: string;
}): ControllerDecision {
  return {
    action: args.action,
    needs_memory_update: false,
    confidence: 1,
    rationale: args.rationale,
  };
}

function resolveStructuredTurnAction(args: {
  turnSource?: ChatTurnSource | null;
  artifactContext?: ChatArtifactContext | null;
  explicitIntent?: V2ChatIntent | null;
  resolvedWorkflowHint?: ChatResolvedWorkflow | null;
}): RuntimeActionResolution | null {
  if (
    args.artifactContext?.kind === "selected_angle" ||
    args.turnSource === "ideation_pick" ||
    args.resolvedWorkflowHint === "plan_then_draft"
  ) {
    return {
      workflow: "plan_then_draft",
      classifiedIntent: "draft",
      source: "structured_turn",
      decision: buildStructuredDecision({
        action: "draft",
        rationale: "structured ideation pick",
      }),
    };
  }

  if (args.artifactContext?.kind === "generation_retry") {
    return {
      workflow: "plan_then_draft",
      classifiedIntent: "draft",
      source: "structured_turn",
      decision: buildStructuredDecision({
        action: "draft",
        rationale: "structured generation retry",
      }),
    };
  }

  if (args.artifactContext?.kind === "draft_selection" || args.turnSource === "draft_action") {
    const classifiedIntent =
      args.artifactContext?.kind === "draft_selection" && args.artifactContext.action === "review"
        ? "review"
        : "edit";
    return {
      workflow: "revise_draft",
      classifiedIntent,
      source: "structured_turn",
      decision: buildStructuredDecision({
        action: "revise",
        rationale: "structured draft action",
      }),
    };
  }

  if (
    args.artifactContext?.kind === "reply_option_select" ||
    args.artifactContext?.kind === "reply_confirmation" ||
    args.turnSource === "reply_action" ||
    args.resolvedWorkflowHint === "reply_to_post"
  ) {
    return {
      workflow: "reply_to_post",
      classifiedIntent: "coach",
      source: "structured_turn",
      decision: buildStructuredDecision({
        action: "answer",
        rationale: "structured reply workflow",
      }),
    };
  }

  if (
    args.turnSource === "quick_reply" &&
    (args.explicitIntent === "ideate" || args.resolvedWorkflowHint === "ideate")
  ) {
    return {
      workflow: "ideate",
      classifiedIntent: "ideate",
      source: "structured_turn",
      decision: buildStructuredDecision({
        action: "plan",
        rationale: "structured quick reply ideation",
      }),
    };
  }

  return null;
}

function normalizeContinuationMessage(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, " ");
}

function isDraftRetryLikeMessage(message: string): boolean {
  return /^(?:retry|try again|rerun it|run it again|regenerate|do it|go ahead|yes|yep|yeah|ok|okay|please do)[.?!]*$/.test(
    normalizeContinuationMessage(message),
  );
}

function isDraftContinuationAnswer(message: string): boolean {
  const normalized = normalizeContinuationMessage(message);
  if (!normalized || normalized.length > 120) {
    return false;
  }

  if (normalized.includes("?") || /^(?:write|draft|make|create|generate|help)\b/.test(normalized)) {
    return false;
  }

  if (isDraftRetryLikeMessage(normalized) || looksLikeSimpleSocialTurn(normalized)) {
    return false;
  }

  return true;
}

function isDraftContinuationResumeTurn(args: {
  artifactContext?: ChatArtifactContext | null;
  userMessage: string;
  memory: ControllerMemorySummary;
}): boolean {
  const continuationState = args.memory.continuationState;
  if (!continuationState || continuationState.capability !== "drafting") {
    return false;
  }

  if (args.artifactContext?.kind === "generation_retry") {
    return continuationState.pendingAction === "retry_delivery";
  }

  if (continuationState.pendingAction === "retry_delivery") {
    return isDraftRetryLikeMessage(args.userMessage);
  }

  if (continuationState.pendingAction === "awaiting_grounding_answer") {
    return isDraftContinuationAnswer(args.userMessage);
  }

  return false;
}

export function mapIntentToRuntimeWorkflow(args: {
  classifiedIntent: V2ChatIntent;
  controllerAction: ControllerDecision["action"];
}): AgentRuntimeWorkflow {
  if (args.controllerAction === "analyze") {
    return "analyze_post";
  }

  if (args.classifiedIntent === "ideate") {
    return "ideate";
  }

  if (
    args.classifiedIntent === "plan" ||
    args.classifiedIntent === "draft" ||
    args.classifiedIntent === "planner_feedback"
  ) {
    return "plan_then_draft";
  }

  if (args.classifiedIntent === "edit" || args.classifiedIntent === "review") {
    return "revise_draft";
  }

  return "answer_question";
}

export async function resolveRuntimeAction(args: {
  turnSource?: ChatTurnSource | null;
  artifactContext?: ChatArtifactContext | null;
  explicitIntent?: V2ChatIntent | null;
  resolvedWorkflowHint?: ChatResolvedWorkflow | null;
  turnPlan?: Pick<TurnPlan, "overrideClassifiedIntent"> | null;
  userMessage: string;
  recentHistory: string;
  memory: ControllerMemorySummary;
  controlTurnImpl?: Parameters<typeof resolveTopLevelAction>[0]["controlTurnImpl"];
}): Promise<RuntimeActionResolution> {
  const structuredResolution = resolveStructuredTurnAction({
    turnSource: args.turnSource,
    artifactContext: args.artifactContext,
    explicitIntent: args.explicitIntent,
    resolvedWorkflowHint: args.resolvedWorkflowHint,
  });
  if (structuredResolution) {
    return structuredResolution;
  }

  if (!args.explicitIntent) {
    if (
      args.memory.hasActiveDraft &&
      Boolean(args.memory.latestRefinementInstruction?.trim()) &&
      isRevisionRetryApproval({
        message: args.userMessage,
        recentHistory: args.recentHistory,
      })
    ) {
      return {
        workflow: "revise_draft",
        classifiedIntent: "edit",
        source: "structured_turn",
        decision: buildStructuredDecision({
          action: "revise",
          rationale: "deterministic malformed revision retry approval",
        }),
      };
    }

    if (
      isDraftContinuationResumeTurn({
        artifactContext: args.artifactContext,
        userMessage: args.userMessage,
        memory: args.memory,
      })
    ) {
      return {
        workflow: "plan_then_draft",
        classifiedIntent: "plan",
        source: "structured_turn",
        decision: buildStructuredDecision({
          action: "draft",
          rationale: "deterministic draft continuation resume",
        }),
      };
    }

    const continuationAction = resolveArtifactContinuationAction({
      userMessage: args.userMessage,
      memory: args.memory,
    });

    if (continuationAction) {
      const classifiedIntent = mapControllerActionToIntent({
        action: continuationAction,
        memory: args.memory,
      });

      return {
        workflow: mapIntentToRuntimeWorkflow({
          classifiedIntent,
          controllerAction: continuationAction,
        }),
        classifiedIntent,
        source: "structured_turn",
        decision: buildStructuredDecision({
          action: continuationAction,
          rationale: "deterministic artifact continuation",
        }),
      };
    }
  }

  if (!args.explicitIntent && isBareDraftRequest(args.userMessage)) {
    return {
      workflow: "plan_then_draft",
      classifiedIntent: "plan",
      source: "structured_turn",
      decision: buildStructuredDecision({
        action: "plan",
        rationale: "deterministic bare draft ideation",
      }),
    };
  }

  if (!args.explicitIntent && looksLikeSimpleSocialTurn(args.userMessage)) {
    return {
      workflow: "answer_question",
      classifiedIntent: "answer_question",
      source: "structured_turn",
      decision: buildStructuredDecision({
        action: "answer",
        rationale: "deterministic simple social turn",
      }),
    };
  }

  const topLevelResolution = await resolveTopLevelAction({
    explicitIntent: args.explicitIntent,
    turnPlan: args.turnPlan,
    userMessage: args.userMessage,
    recentHistory: args.recentHistory,
    memory: args.memory,
    controlTurnImpl: args.controlTurnImpl,
  });

  return {
    workflow: mapIntentToRuntimeWorkflow({
      classifiedIntent: topLevelResolution.classifiedIntent,
      controllerAction: topLevelResolution.decision.action,
    }),
    classifiedIntent: topLevelResolution.classifiedIntent,
    source: topLevelResolution.source,
    decision: topLevelResolution.decision,
  };
}

export function buildRuntimeDecisionForIntent(intent: V2ChatIntent): ControllerDecision {
  return buildStructuredDecision({
    action: mapIntentToControllerAction(intent),
    rationale: "runtime intent mapping",
  });
}
