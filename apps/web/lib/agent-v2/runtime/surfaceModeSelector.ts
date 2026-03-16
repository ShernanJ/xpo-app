import type {
  ConversationState,
  ResponseShapePlan,
  SurfaceMode,
  V2ChatOutputShape,
} from "../contracts/chat";

interface SelectSurfaceModeArgs {
  outputShape: V2ChatOutputShape;
  response: string;
  hasQuickReplies: boolean;
  hasAngles: boolean;
  hasPlan: boolean;
  hasDraft: boolean;
  conversationState: ConversationState;
  preferredSurfaceMode?: "natural" | "structured" | null;
}

function responseLooksQuestionLike(response: string): boolean {
  return /\?\s*$/.test(response.trim());
}

function resolveDraftSurfaceMode(args: SelectSurfaceModeArgs): SurfaceMode {
  if (args.conversationState === "editing") {
    return "revise_and_return";
  }

  return "generate_full_output";
}

export function selectResponseShapePlan(
  args: SelectSurfaceModeArgs,
): ResponseShapePlan {
  if (
    args.outputShape === "short_form_post" ||
    args.outputShape === "long_form_post" ||
    args.outputShape === "thread_seed"
  ) {
    return {
      mode: "structured_generation",
      surfaceMode: resolveDraftSurfaceMode(args),
      shouldShowArtifacts: true,
      shouldExplainReasoning: false,
      shouldAskFollowUp: false,
      maxFollowUps: 0,
    };
  }

  if (args.outputShape === "ideation_angles" || args.outputShape === "planning_outline") {
    return {
      mode: "structured_generation",
      surfaceMode: "offer_options",
      shouldShowArtifacts: true,
      shouldExplainReasoning: false,
      shouldAskFollowUp: true,
      maxFollowUps: 1,
    };
  }

  if (args.outputShape === "profile_analysis") {
    return {
      mode: "structured_generation",
      surfaceMode: "answer_directly",
      shouldShowArtifacts: true,
      shouldExplainReasoning: false,
      shouldAskFollowUp: false,
      maxFollowUps: 0,
    };
  }

  if (args.hasQuickReplies || args.hasAngles || args.hasPlan) {
    return {
      mode: "light_guidance",
      surfaceMode: "offer_options",
      shouldShowArtifacts: true,
      shouldExplainReasoning: false,
      shouldAskFollowUp: true,
      maxFollowUps: 1,
    };
  }

  if (responseLooksQuestionLike(args.response)) {
    return {
      mode: args.preferredSurfaceMode === "structured" ? "light_guidance" : "natural_chat",
      surfaceMode: "ask_one_question",
      shouldShowArtifacts: false,
      shouldExplainReasoning: false,
      shouldAskFollowUp: true,
      maxFollowUps: 1,
    };
  }

  return {
    mode: args.preferredSurfaceMode === "structured" ? "light_guidance" : "natural_chat",
    surfaceMode: "answer_directly",
    shouldShowArtifacts: false,
    shouldExplainReasoning: false,
    shouldAskFollowUp: false,
    maxFollowUps: 0,
  };
}
