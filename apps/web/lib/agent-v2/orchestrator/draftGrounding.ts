import type { StrategyPlan } from "../contracts/chat";

export const NO_FABRICATION_CONSTRAINT =
  "Factual guardrail: do not invent personal anecdotes, offline events, timelines, named places, product behavior, product features, internal tools, metrics, lessons, or causal claims. If facts are missing, stay literal or use opinion/framework language instead.";
export const NO_FABRICATION_MUST_AVOID =
  "Invented personal anecdotes, offline events, timelines, named places, product behavior, product features, internal tools, metrics, lessons, or causal claims that were not explicitly provided by the user.";

function normalizeMessage(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/[.?!,:;]+/g, " ")
    .replace(/\s+/g, " ");
}

function looksLikeDraftRequest(normalized: string): boolean {
  if (
    [
      "write me a post",
      "write a post",
      "draft me a post",
      "draft a post",
      "write me something",
      "tweet about",
      "post about",
      "turn this into a post",
      "turn that into a post",
      "can you write me a post",
    ].some((candidate) => normalized.includes(candidate))
  ) {
    return true;
  }

  return [
    /(?:^|\b)(?:can you\s+)?(?:write|draft|make|do)\s+(?:me\s+)?(?:one|something|this|that)\s+(?:about|on)\b/,
    /(?:^|\b)(?:write|draft|make)\s+(?:me\s+)?(?:a\s+)?(?:post|tweet)\s+(?:about|on)\b/,
    /(?:^|\b)(?:tweet|post)\s+on\b/,
  ].some((pattern) => pattern.test(normalized));
}

export function isRandomizedDraftRequest(message: string): boolean {
  const normalized = normalizeMessage(message);

  return [
    "random post",
    "give me a random post",
    "give me a random post i would use",
    "write me a random post",
    "draft me a random post",
    "write anything",
    "just write anything",
    "whatever works",
    "anything is fine",
    "idk just write it",
  ].some((candidate) => normalized.includes(candidate));
}

export function isConcreteAnecdoteDraftRequest(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!looksLikeDraftRequest(normalized)) {
    return false;
  }

  const sceneCues = [
    "office",
    "ceo",
    "founder",
    "meeting",
    "call",
    "league",
    "game",
    "match",
    "team",
    "against",
    "with the",
    "at the",
    "playing",
    "played",
    "losing",
    "lost",
    "won",
    "yesterday",
    "last night",
  ];

  const cueCount = sceneCues.reduce(
    (count, cue) => (normalized.includes(cue) ? count + 1 : count),
    0,
  );

  return cueCount >= 2;
}

export function hasNoFabricationPlanGuardrail(
  plan: StrategyPlan | null | undefined,
): boolean {
  if (!plan) {
    return false;
  }

  return [...plan.mustAvoid, ...plan.mustInclude, plan.angle, plan.objective].some(
    (entry) =>
      /(factual guardrail|invent(?:ed|ing)? personal anecdote|fabricat(?:ed|ing)|offline event|named place|timeline)/i.test(
        entry,
      ),
  );
}

export function withNoFabricationPlanGuardrail(plan: StrategyPlan): StrategyPlan {
  if (hasNoFabricationPlanGuardrail(plan)) {
    return plan;
  }

  return {
    ...plan,
    mustAvoid: Array.from(new Set([...plan.mustAvoid, NO_FABRICATION_MUST_AVOID])),
  };
}

export function appendNoFabricationConstraint(activeConstraints: string[]): string[] {
  if (activeConstraints.some((constraint) => constraint === NO_FABRICATION_CONSTRAINT)) {
    return activeConstraints;
  }

  return [...activeConstraints, NO_FABRICATION_CONSTRAINT];
}

export function shouldForceNoFabricationPlanGuardrail(args: {
  userMessage: string;
  behaviorKnown: boolean;
  stakesKnown: boolean;
}): boolean {
  if (isConcreteAnecdoteDraftRequest(args.userMessage)) {
    return true;
  }

  if (!isRandomizedDraftRequest(args.userMessage)) {
    return false;
  }

  return !args.behaviorKnown || !args.stakesKnown;
}

export function isDraftMeaningQuestion(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized) {
    return false;
  }

  return [
    "what does this mean",
    "what does this even mean",
    "what does that mean",
    "what does that even mean",
    "what does this tweet mean",
    "what does this tweet even mean",
    "what does that tweet mean",
    "what does that tweet even mean",
    "what does this post mean",
    "what does this post even mean",
    "what does that post mean",
    "what does that post even mean",
    "what does this draft mean",
    "what does this draft even mean",
    "what does that draft mean",
    "what does that draft even mean",
    "what did you mean",
    "what do you mean",
    "what were you trying to say",
    "explain this",
    "explain that",
    "explain the draft",
    "explain the tweet",
  ].some((cue) => normalized.includes(cue));
}

export function buildDraftMeaningResponse(draft: string): string {
  const normalizedDraft = draft.trim().replace(/\s+/g, " ");
  if (!normalizedDraft) {
    return "fair question. point to the muddy line and i'll rewrite it plainly.";
  }

  return "fair question. as written, it's muddy. i should rewrite it more plainly instead of explaining around it.";
}
