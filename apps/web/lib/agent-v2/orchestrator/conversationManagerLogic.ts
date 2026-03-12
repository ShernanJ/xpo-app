import type { DraftFormatPreference, V2ChatIntent } from "../contracts/chat.ts";

function normalizeDraftIntentMessage(message: string): string {
  let normalized = message
    .trim()
    .toLowerCase()
    .replace(/[.?!,]+$/, "")
    .replace(/\s+/g, " ");

  const leadInPatterns = [
    /^(?:yes|yeah|yep|ok|okay|please|actually|just)\s+/,
    /^(?:no\s+)?i\s+mean\s+/,
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of leadInPatterns) {
      const nextNormalized = normalized.replace(pattern, "");
      if (nextNormalized !== normalized) {
        normalized = nextNormalized.trim();
        changed = true;
      }
    }
  }

  return normalized;
}

export function buildPlanFailureResponse(reason: string | null | undefined): string {
  const normalized = reason?.trim().replace(/[.?!]+$/, "") || "";
  if (!normalized) {
    return "Failed to generate strategy plan.";
  }

  return `Failed to generate strategy plan because ${normalized}.`;
}

export function inferExplicitDraftFormatPreference(
  message: string,
): DraftFormatPreference | null {
  const normalized = normalizeDraftIntentMessage(message);
  if (!normalized) {
    return null;
  }

  const threadPatterns = [
    /^(?:give|write|draft|make|create|generate)\s+(?:me\s+)?(?:an?\s+)?(?:(?:x|tweet)\s+)?thread\b/,
    /\b(?:turn|make)\s+(?:this|that|it)\s+into\s+(?:an?\s+)?(?:(?:x|tweet)\s+)?thread\b/,
    /\bmake\s+it\s+a\s+thread\b/,
  ];
  if (threadPatterns.some((pattern) => pattern.test(normalized))) {
    return "thread";
  }

  const longformPatterns = [
    /^(?:give|write|draft|make|create|generate)\s+(?:me\s+)?(?:an?\s+)?long(?:\s|-)?form\b/,
    /\b(?:turn|make)\s+(?:this|that|it)\s+into\s+(?:an?\s+)?long(?:\s|-)?form\b/,
    /\bwrite\s+longer\b/,
    /\bgo\s+deeper\b/,
    /\bexpand\s+this\b/,
  ];
  if (longformPatterns.some((pattern) => pattern.test(normalized))) {
    return "longform";
  }

  const shortformPatterns = [
    /^(?:give|write|draft|make|create|generate)\s+(?:me\s+)?(?:an?\s+)?(?:(?:x\s+post|tweet|post))\b/,
    /\b(?:turn|make)\s+(?:this|that|it)\s+into\s+(?:an?\s+)?(?:(?:x\s+post|tweet|post))\b/,
    /\bmake\s+it\s+a\s+(?:x\s+post|tweet|post)\b/,
    /\bturn\s+it\s+into\s+short(?:\s|-)?form\b/,
    /\bkeep\s+it\s+short\b/,
    /\bkeep\s+it\s+tight\b/,
  ];
  if (shortformPatterns.some((pattern) => pattern.test(normalized))) {
    return "shortform";
  }

  return null;
}

export function hasStrongDraftCommand(message: string): boolean {
  const normalized = normalizeDraftIntentMessage(message);
  if (!normalized) {
    return false;
  }

  if (/\b(?:idea|ideas|angle|angles|brainstorm)\b/.test(normalized)) {
    return false;
  }

  return /^(?:give|write|draft|make|create|generate)\s+(?:me\s+)?(?:a\s+)?(?:post|thread)\b/.test(
    normalized,
  );
}

export function isMultiDraftRequest(message: string): boolean {
  const normalized = normalizeDraftIntentMessage(message);
  if (!normalized) {
    return false;
  }

  const explicitBundlePatterns = [
    /^(?:give|write|draft|make|create|generate)\s+(?:me\s+)?multiple\s+(?:posts|drafts|tweets)\b/,
    /^(?:give|write|draft|make|create|generate)\s+(?:me\s+)?(?:a\s+)?few\s+(?:posts|drafts|tweets)\b/,
    /^(?:give|write|draft|make|create|generate)\s+(?:me\s+)?(?:\d+|two|three|four|five)\s+(?:different\s+)?(?:posts|drafts|tweets)\b/,
    /^(?:give|write|draft|make|create|generate)\s+(?:me\s+)?multiple\s+posts\s+i(?:\s+would|\s*'d)\s+use\b/,
    /^(?:give|write|draft|make|create|generate)\s+(?:me\s+)?(?:a\s+)?random\s+post(?:\s+i(?:\s+would|\s*'d)\s+use)?$/,
    /^(?:give|write|draft|make|create|generate)\s+(?:me\s+)?multiple\s+posts(?:\s+i(?:\s+can|\s*'d)\s+use)?$/,
  ];

  return explicitBundlePatterns.some((pattern) => pattern.test(normalized));
}

export function isBareDraftRequest(message: string): boolean {
  const normalized = normalizeDraftIntentMessage(message);
  if ([
    "write me a post",
    "write a post for me",
    "write me a post for me",
    "write me a thread",
    "write a thread",
    "write a thread for me",
    "write me a thread for me",
    "draft a post",
    "draft a post for me",
    "draft me a post",
    "draft a thread",
    "draft a thread for me",
    "draft me a thread",
    "make a post",
    "make me a post",
    "make a thread",
    "make me a thread",
    "give me a post",
    "give me a post to use",
    "give me a random post",
    "give me random post",
    "give me a random post i would use",
    "give me random post i would use",
    "give me a post i would use",
    "give me a thread",
    "give me a thread to use",
    "give me a random thread",
    "give me random thread",
    "give me a random thread i would use",
    "give me random thread i would use",
    "give me a thread i would use",
    "write a thread i would use",
    "write me a thread i would use",
    "draft a thread i would use",
  ].includes(normalized)) {
    return true;
  }

  return /^(?:give|write|draft|make|create|generate)\s+(?:me\s+)?(?:a\s+)?random\s+post(?:\s+i(?:\s+would|\s*'d)\s+use)?$/.test(
    normalized,
  ) || /^(?:give|write|draft|make|create|generate)\s+(?:me\s+)?(?:a\s+)?random\s+thread(?:\s+i(?:\s+would|\s*'d)\s+use)?$/.test(
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
      "what should i post today",
      "what should i post this week",
      "what should i post right now",
      "what should i post on x",
      "what should i post on twitter",
      "what should i tweet",
      "what should i tweet today",
      "what should i tweet this week",
      "what do i post",
      "what do i post today",
      "what do i post this week",
      "what do i post on x",
      "what do i post on twitter",
      "what do i tweet",
      "what do i tweet today",
      "what do i tweet this week",
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

  if (
    /^what should i post(?:\s+(?:today|this week|right now))?(?:\s+on\s+(?:x|twitter))?$/.test(
      normalized,
    )
  ) {
    return true;
  }

  if (
    /^what do i post(?:\s+(?:today|this week))?(?:\s+on\s+(?:x|twitter))?$/.test(normalized)
  ) {
    return true;
  }

  if (/^what should i tweet(?:\s+(?:today|this week|right now))?$/.test(normalized)) {
    return true;
  }

  if (/^what do i tweet(?:\s+(?:today|this week))?$/.test(normalized)) {
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

  if (!args.explicitIntent && !args.activeDraft && hasStrongDraftCommand(args.userMessage)) {
    return "plan";
  }

  if (!args.explicitIntent && !args.activeDraft && isMultiDraftRequest(args.userMessage)) {
    return "plan";
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
  formatPreference: "shortform" | "longform" | "thread",
): "short_form_post" | "long_form_post" | "thread_seed" {
  if (formatPreference === "longform") {
    return "long_form_post";
  }

  if (formatPreference === "thread") {
    return "thread_seed";
  }

  return "short_form_post";
}
