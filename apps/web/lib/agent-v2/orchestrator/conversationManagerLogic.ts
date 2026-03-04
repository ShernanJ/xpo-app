export function isBareDraftRequest(message: string): boolean {
  const normalized = message.trim().toLowerCase().replace(/[.?!,]+$/, "");
  return [
    "write me a post",
    "write a post for me",
    "write me a post for me",
    "draft a post",
    "draft a post for me",
    "draft me a post",
    "make a post",
    "make me a post",
    "give me a post",
    "give me a post to use",
    "give me a random post",
  ].includes(normalized);
}

export function resolveConversationMode(args: {
  explicitIntent?: string | null;
  userMessage: string;
  classifiedIntent: string;
  activeDraft?: string;
}): string {
  let mode = args.classifiedIntent;

  if (
    !args.explicitIntent &&
    ["hello", "hi", "help me grow", "i want to grow"].includes(
      args.userMessage.toLowerCase().trim(),
    )
  ) {
    mode = "coach";
  }

  if (!args.explicitIntent && mode === "draft" && !args.activeDraft) {
    mode = "plan";
  }

  return mode;
}

export function shouldUsePendingPlanApprovalPath(args: {
  mode: string;
  conversationState: string;
  hasPendingPlan: boolean;
}): boolean {
  return (
    args.mode === "planner_feedback" &&
    args.conversationState === "plan_pending_approval" &&
    args.hasPendingPlan
  );
}

export function shouldRouteCareerClarification(args: {
  explicitIntent?: string | null;
  mode: string;
  domainHint: "product" | "career" | "creator" | "general";
  behaviorKnown: boolean;
  stakesKnown: boolean;
}): boolean {
  return (
    !args.explicitIntent &&
    args.mode === "plan" &&
    args.domainHint === "career" &&
    (!args.behaviorKnown || !args.stakesKnown)
  );
}

export function shouldUseRevisionDraftPath(args: {
  mode: string;
  activeDraft?: string;
}): boolean {
  return Boolean(args.activeDraft) && (args.mode === "review" || args.mode === "edit");
}

export function resolveDraftOutputShape(
  formatPreference: "shortform" | "longform",
): "short_form_post" | "long_form_post" {
  return formatPreference === "longform" ? "long_form_post" : "short_form_post";
}
