import type { StrategyPlan } from "../contracts/chat";

export const NO_FABRICATION_CONSTRAINT =
  "Factual guardrail: do not invent personal anecdotes, offline events, timelines, named places, product behavior, product features, internal tools, metrics, lessons, or causal claims. If facts are missing, stay literal or use opinion/framework language instead.";
export const NO_FABRICATION_MUST_AVOID =
  "Invented personal anecdotes, offline events, timelines, named places, product behavior, product features, internal tools, metrics, lessons, or causal claims that were not explicitly provided by the user.";

const CONCRETE_SCENE_ANCHOR_CUES = [
  "stan office",
  "office",
  "ceo",
  "founder",
  "league",
  "game",
  "match",
  "meeting",
  "call",
  "team",
  "yesterday",
  "last night",
  "playing",
  "played",
  "losing hard",
  "losing",
  "lost",
  "won",
];

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

export function extractConcreteSceneAnchors(message: string): string[] {
  const normalized = normalizeMessage(message);
  if (!normalized) {
    return [];
  }

  const anchors: string[] = [];
  for (const cue of CONCRETE_SCENE_ANCHOR_CUES) {
    if (!normalized.includes(cue) || anchors.includes(cue)) {
      continue;
    }
    anchors.push(cue);
    if (anchors.length >= 6) {
      break;
    }
  }

  return anchors;
}

export function buildConcreteScenePlanBlock(message: string): string | null {
  if (!isConcreteAnecdoteDraftRequest(message)) {
    return null;
  }

  const sceneAnchors = extractConcreteSceneAnchors(message);

  return `CONCRETE SCENE MODE:
- The user asked for a post rooted in a literal scene. Keep the plan anchored to that exact moment instead of translating it into a cleaner growth lesson.
- Scene anchors already present in the request: ${sceneAnchors.join(" | ") || "use the exact scene from the request"}.
- If there isn't an explicit lesson in the request, keep the angle observational or story-first instead of inventing one.
- Do not introduce hashtags, analytics, product features, internal tools, or strategy jargon unless the user explicitly named them.`;
}

export function buildConcreteSceneDraftBlock(source: string): string | null {
  if (!isConcreteAnecdoteDraftRequest(source) && extractConcreteSceneAnchors(source).length === 0) {
    return null;
  }

  const sceneAnchors = extractConcreteSceneAnchors(source);

  return `CONCRETE SCENE MODE:
- This draft must stay inside the literal scene already described by the user.
- Scene anchors to preserve when they fit naturally: ${sceneAnchors.join(" | ") || "use the exact scene from the plan/request"}.
- Do not swap the scene for a product pitch, hashtag strategy, analytics lesson, or any other cleaner growth framing unless the user explicitly asked for that.
- If the scene is funny, awkward, or just an observation, let it stay that. Do not force a neat moral.
- If details are missing, write around the exact details you do have. Do not fill gaps with invented mechanics or context.`;
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
