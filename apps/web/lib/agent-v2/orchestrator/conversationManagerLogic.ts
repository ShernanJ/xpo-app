export function isBareDraftRequest(message: string): boolean {
  const normalized = message
    .trim()
    .toLowerCase()
    .replace(/[.?!,]+$/, "")
    .replace(/\s+/g, " ");
  if ([
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
    "give me random post",
    "give me a random post i would use",
    "give me random post i would use",
    "give me a post i would use",
  ].includes(normalized)) {
    return true;
  }

  return /^(?:give|write|draft|make|create|generate)\s+(?:me\s+)?(?:a\s+)?random\s+post(?:\s+i(?:\s+would|\s*'d)\s+use)?$/.test(
    normalized,
  );
}

export function isBareIdeationRequest(message: string): boolean {
  const normalized = message
    .trim()
    .toLowerCase()
    .replace(/[.?!,]+$/, "")
    .replace(/\s+/g, " ");

  if (
    [
      "give me post ideas",
      "give me some post ideas",
      "give me more post ideas",
      "give me ideas",
      "give me some ideas",
      "give me more ideas",
      "more post ideas",
      "more ideas",
      "try again",
      "another round",
      "one more round",
      "post ideas",
      "ideas",
      "brainstorm",
      "brainstorm with me",
      "what should i post",
      "what do i post",
      "help me figure out what to post",
      "give me angles",
      "give me some angles",
      "give me more angles",
      "give me another idea",
      "give me another post idea",
      "give me another set of ideas",
      "give me a different set of ideas",
    ].includes(normalized)
  ) {
    return true;
  }

  if (/^(?:give|show|share|suggest|brainstorm)\s+me\s+(?:(?:some|more)\s+)?(?:post\s+)?ideas?$/.test(normalized)) {
    return true;
  }

  if (/^(?:try|run)\s+(?:that\s+)?again$/.test(normalized)) {
    return true;
  }

  if (/^(?:give|show|share|suggest)\s+me\s+(?:another|different|new)\s+(?:set\s+of\s+)?(?:post\s+)?ideas?$/.test(normalized)) {
    return true;
  }

  return /^(?:give|show|share|suggest)\s+me\s+another\s+(?:post\s+)?idea$/.test(
    normalized,
  );
}

export function resolveConversationMode(args: {
  explicitIntent?: string | null;
  userMessage: string;
  classifiedIntent: string;
  activeDraft?: string;
}): string {
  let mode = args.classifiedIntent;
  const normalized = args.userMessage.toLowerCase().trim();

  if (
    !args.explicitIntent &&
    ["hello", "hi", "help me grow", "i want to grow"].includes(normalized)
  ) {
    mode = "coach";
  }

  if (!args.explicitIntent && !args.activeDraft && isBareDraftRequest(args.userMessage)) {
    return "plan";
  }

  if (!args.explicitIntent && !args.activeDraft && isBareIdeationRequest(args.userMessage)) {
    return "ideate";
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
