import type { StrategyPlan } from "../contracts/chat";

export const NO_FABRICATION_CONSTRAINT =
  "Factual guardrail: do not invent personal anecdotes, offline events, timelines, named places, product behavior, product features, internal tools, metrics, lessons, or causal claims. If facts are missing, stay literal or use opinion/framework language instead.";

export const NO_FABRICATION_MUST_AVOID =
  "Invented personal anecdotes, offline events, timelines, named places, product behavior, product features, internal tools, metrics, lessons, or causal claims that were not explicitly provided by the user.";

const DRAFT_REQUEST_CUES = [
  "write me a post",
  "write a post",
  "write one about",
  "draft me a post",
  "draft a post",
  "draft one about",
  "write me something",
  "tweet about",
  "post about",
  "turn this into a post",
  "turn that into a post",
  "can you write me a post",
  "can you draft a post",
  "write me a tweet",
  "write a tweet",
];

const CONCRETE_SCENE_CUES = [
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

const EXPLICIT_GROWTH_CUES = [
  "growth",
  "growing",
  "on x",
  "on twitter",
  "for x",
  "for twitter",
  "tweet",
  "post on x",
  "reach",
  "engagement",
  "followers",
  "algorithm",
  "viral",
  "marketing",
  "distribution",
  "audience",
  "hook",
  "cta",
  "hashtag",
];

const HARD_SHIFT_TERMS = [
  "hashtag data",
  "real time data",
  "real-time data",
  "engagement scanner",
  "analytics dashboard",
  "growth dashboard",
  "internal tool",
  "scanner",
  "dashboard",
  "analytics",
  "workflow",
  "extension",
  "plugin",
];

const SOFT_SHIFT_TERMS = [
  "growth",
  "engagement",
  "reach",
  "algorithm",
  "followers",
  "viral",
  "hashtag",
  "data",
  "guessing",
  "distribution",
  "funnel",
  "retention",
  "conversion",
  "ctr",
];

const ANCHOR_PATTERNS: Array<[string, RegExp]> = [
  ["stan office", /\b(?:the\s+)?stan office\b/i],
  ["league", /\bleague\b/i],
  ["ceo", /\bceo\b/i],
  ["founder", /\bfounder\b/i],
  ["office", /\boffice\b/i],
  ["meeting", /\bmeeting\b/i],
  ["call", /\bcall\b/i],
  ["game", /\bgame\b/i],
  ["match", /\bmatch\b/i],
  ["playing", /\bplaying\b/i],
  ["played", /\bplayed\b/i],
  ["against", /\bagainst\b/i],
  ["lost", /\blost\b/i],
  ["losing hard", /\blosing hard\b/i],
  ["won", /\bwon\b/i],
  ["team", /\bteam\b/i],
];

function normalizeMessage(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/[.?!,:;]+/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeText(value: string | null | undefined): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[.?!,]+$/g, "")
    .replace(/\s+/g, " ");
}

function looksLikeDraftRequest(normalized: string): boolean {
  if (DRAFT_REQUEST_CUES.some((candidate) => normalized.includes(candidate))) {
    return true;
  }

  return [
    /(?:^|\b)(?:can you\s+)?(?:write|draft|make|do)\s+(?:me\s+)?(?:one|something|this|that)\s+(?:about|on)\b/,
    /(?:^|\b)(?:write|draft|make)\s+(?:me\s+)?(?:a\s+)?(?:post|tweet)\s+(?:about|on)\b/,
    /(?:^|\b)(?:tweet|post)\s+on\b/,
  ].some((pattern) => pattern.test(normalized));
}

function collectAbsentTerms(
  source: string,
  draft: string,
  terms: string[],
): string[] {
  const matches = terms.filter(
    (term) => draft.includes(term) && !source.includes(term),
  );
  return Array.from(new Set(matches));
}

function hasConcreteSceneCues(normalized: string): boolean {
  const cueCount = CONCRETE_SCENE_CUES.reduce(
    (count, cue) => (normalized.includes(cue) ? count + 1 : count),
    0,
  );

  return cueCount >= 2;
}

function shouldGroundConcreteScene(message: string): boolean {
  return hasConcreteSceneCues(normalizeText(message));
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

export function requestExplicitlyMentionsGrowthMechanics(message: string): boolean {
  const normalized = normalizeText(message);
  return EXPLICIT_GROWTH_CUES.some((cue) => normalized.includes(cue));
}

export function isConcreteAnecdoteDraftRequest(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!looksLikeDraftRequest(normalized)) {
    return false;
  }

  return hasConcreteSceneCues(normalized);
}

export function extractConcreteSceneAnchors(message: string): string[] {
  const anchors: string[] = [];

  for (const [label, pattern] of ANCHOR_PATTERNS) {
    if (pattern.test(message)) {
      anchors.push(label);
    }
  }

  const deduped = Array.from(new Set(anchors)).filter(
    (anchor, _, items) => anchor !== "office" || !items.includes("stan office"),
  );

  return deduped.slice(0, 5);
}

export function buildConcreteScenePlanBlock(message: string): string | null {
  if (!shouldGroundConcreteScene(message)) {
    return null;
  }

  const anchors = extractConcreteSceneAnchors(message);
  const growthAllowed = requestExplicitlyMentionsGrowthMechanics(message);

  return `
CONCRETE SCENE MODE:
- Preserve the literal scene the user named: ${message.trim()}
- Keep these scene anchors intact when possible: ${anchors.join(" | ") || "the user's named scene"}
- Treat this like a literal anecdote, self-own, or story from the exact scene.
${growthAllowed
    ? "- A growth takeaway is allowed only because the user explicitly asked for one."
    : "- Do NOT force a growth takeaway, product pitch, or X tactic unless the user explicitly asked for it."}
  `.trim();
}

export function buildConcreteSceneDraftBlock(message: string): string | null {
  if (!shouldGroundConcreteScene(message)) {
    return null;
  }

  const anchors = extractConcreteSceneAnchors(message);
  const growthAllowed = requestExplicitlyMentionsGrowthMechanics(message);

  return `
CONCRETE SCENE DRAFT MODE:
- The user's literal source scene is: ${message.trim()}
- Preserve these anchors from the source scene when you write: ${anchors.join(" | ") || "the named scene itself"}
- Keep the post grounded in that exact moment instead of drifting into a different story.
${growthAllowed
    ? "- If you add a lesson, keep it tied to the scene the user actually named."
    : "- Do NOT inject a growth lesson, product mechanic, hashtag/data angle, or app pitch that the user never mentioned."}
  `.trim();
}

export function buildConcreteSceneCriticBlock(
  message: string | null | undefined,
): string | null {
  if (!message || !shouldGroundConcreteScene(message)) {
    return null;
  }

  const anchors = extractConcreteSceneAnchors(message);
  const growthAllowed = requestExplicitlyMentionsGrowthMechanics(message);

  return `
CONCRETE SCENE QA:
- The source scene was: ${message.trim()}
- The final draft should still feel anchored to: ${anchors.join(" | ") || "that exact scene"}
${growthAllowed
    ? "- If there is a takeaway, keep it grounded in the original scene."
    : "- If the draft invents a growth lesson, product tactic, or tool that was not in the source scene, rewrite it back to the literal anecdote or reject it."}
  `.trim();
}

export function buildConcreteSceneRetryConstraint(message: string): string | null {
  if (!shouldGroundConcreteScene(message)) {
    return null;
  }

  const anchors = extractConcreteSceneAnchors(message);
  return `Concrete scene retry: keep the draft anchored to ${anchors.join(" | ") || "the user's literal scene"}. Do not add growth tactics, product behavior, or internal tools that were not in the original request.`;
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

export function appendNoFabricationConstraint(
  activeConstraints: string[],
): string[] {
  if (
    activeConstraints.some((constraint) => constraint === NO_FABRICATION_CONSTRAINT)
  ) {
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

export interface DraftGroundingAssessment {
  shouldGuard: boolean;
  hasDrift: boolean;
  sceneAnchors: string[];
  preservedAnchors: string[];
  unexpectedShiftTerms: string[];
  reason: string | null;
}

export function assessConcreteSceneDrift(args: {
  sourceUserMessage?: string | null;
  draft: string;
}): DraftGroundingAssessment {
  const source = normalizeText(args.sourceUserMessage);
  const draft = normalizeText(args.draft);

  if (!source || !shouldGroundConcreteScene(source)) {
    return {
      shouldGuard: false,
      hasDrift: false,
      sceneAnchors: [],
      preservedAnchors: [],
      unexpectedShiftTerms: [],
      reason: null,
    };
  }

  const sceneAnchors = extractConcreteSceneAnchors(source);
  const preservedAnchors = sceneAnchors.filter((anchor) => draft.includes(anchor));
  const growthAllowed = requestExplicitlyMentionsGrowthMechanics(source);
  const hardShiftTerms = growthAllowed
    ? []
    : collectAbsentTerms(source, draft, HARD_SHIFT_TERMS);
  const softShiftTerms = growthAllowed
    ? []
    : collectAbsentTerms(source, draft, SOFT_SHIFT_TERMS);
  const unexpectedShiftTerms = Array.from(
    new Set([...hardShiftTerms, ...softShiftTerms]),
  );
  const hasGrowthShift = hardShiftTerms.length > 0 || softShiftTerms.length >= 2;
  const hasAnchorLoss =
    sceneAnchors.length >= 2 && preservedAnchors.length === 0;
  const hasDrift = hasGrowthShift || hasAnchorLoss;

  let reason: string | null = null;
  if (hasGrowthShift) {
    reason =
      "Concrete scene drift: introduced a growth or product mechanic that was not in the user's prompt.";
  } else if (hasAnchorLoss) {
    reason = "Concrete scene drift: dropped the user's original scene.";
  }

  return {
    shouldGuard: true,
    hasDrift,
    sceneAnchors,
    preservedAnchors,
    unexpectedShiftTerms,
    reason,
  };
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
