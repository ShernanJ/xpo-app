export type DraftReviewMode = "analyze" | "compare";

export function buildPlanRejectReply(): string {
  return "want me to tighten it up, make it more personal, or take a different angle?";
}

export function buildDirectionChoiceReply(args: {
  verified: boolean;
  requestedFormatPreference?: "shortform" | "longform" | "thread" | null;
}): string {
  if (args.requestedFormatPreference === "thread") {
    return "want this as a story thread, a breakdown thread, or should i give you a few thread angles first?";
  }

  if (args.verified) {
    return "do you want this as a shortform post, a longform post, or do you want to sharpen the angle first?";
  }

  return "want to pick a specific angle, have me draft a solid one in your voice, or optimize it for growth?";
}

export function buildTopicFocusReply(topicLabel: string): string {
  return `which part of ${topicLabel} do you actually want to hit?`;
}

export function buildEntityContextReply(entityLabel: string): string {
  return `what is ${entityLabel} in one line, and what should i know about it before i write the post?`;
}

export function buildCareerDirectionReply(): string {
  return "what tone feels right for this - grateful, ambitious, or reflective?";
}

export function buildLooseDirectionReply(args: {
  almostReady: boolean;
  requestedFormatPreference?: "shortform" | "longform" | "thread" | null;
}): string {
  if (args.requestedFormatPreference === "thread") {
    return args.almostReady
      ? "pick one thread direction below and i'll turn it into a draft."
      : "i can do that. pick a thread direction below and i'll run with it.";
  }

  return args.almostReady
    ? "pick one direction below and i'll turn it into a post."
    : "i can do that. pick one direction below and i'll run with it.";
}

export function buildCoachFallbackResponse(args: {
  userMessage: string;
  question: string;
}): string {
  const normalized = args.userMessage.trim().toLowerCase();

  if (normalized.startsWith(">")) {
    return `answer that in one line and i'll work from it. ${args.question}`;
  }

  return args.question;
}

export function buildComparisonRelationshipQuestion(reference: string): string {
  return `how does it relate to ${reference} exactly - replacement, extension, or something that works alongside it?`;
}

export function buildProblemStakeQuestion(): string {
  return "what's the actual problem it fixes, or why does it matter enough to post about?";
}

export function buildProductCapabilityQuestion(args: {
  kind: "comparison" | "extension" | "generic";
  target?: string | null;
}): string {
  const target = args.target?.trim();

  if (args.kind === "comparison") {
    return target
      ? `what does your version actually do on ${target}, and what's different about it?`
      : "what does your version actually do, and what's different about it?";
  }

  if (args.kind === "extension") {
    return target
      ? `what does the extension do, and what should someone know about ${target}?`
      : "what does the extension actually do?";
  }

  return target
    ? `what does it do, and what should someone know about ${target}?`
    : "what does it actually do?";
}

export function buildDraftReviewPrompt(mode: DraftReviewMode): string {
  return mode === "compare"
    ? "compare this to the current version"
    : "what do you think about this post?";
}

export function buildDraftReviewLoadingLabel(mode: DraftReviewMode): string {
  return mode === "compare" ? "checking the differences." : "taking a quick look.";
}

export function buildDraftReviewFailureLabel(): string {
  return "couldn't run that review just now.";
}
