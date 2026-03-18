function collectTerms(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 2);
}

function scoreSnippet(snippet: string, terms: string[]): number {
  const normalized = snippet.toLowerCase();
  return terms.reduce((score, term) => (normalized.includes(term) ? score + 1 : score), 0);
}

function collectCorrectionLockTerms(activeConstraints: string[]): string[] {
  return activeConstraints
    .filter((constraint) => constraint.startsWith("Correction lock:"))
    .flatMap((constraint) => collectTerms(constraint.replace(/^Correction lock:\s*/i, "")));
}

export function buildFactSafeReferenceHints(args?: {
  lane?: "original" | "reply" | "quote";
  formatPreference?: "shortform" | "longform" | "thread";
}): string[] {
  const laneHint =
    args?.lane === "reply"
      ? "Shape hint: keep it reply-like and direct instead of turning it into a broad thesis."
      : args?.lane === "quote"
        ? "Shape hint: keep it reactive with one clear stance instead of a standalone essay."
        : "Shape hint: lead with one direct claim instead of a long setup.";
  const formatHint =
    args?.formatPreference === "thread"
      ? "Format hint: build one clean beat per post and let the chain carry the progression."
      : args?.formatPreference === "longform"
        ? "Format hint: allow a little more setup, but keep every section concrete and grounded."
        : "Format hint: keep it shortform with one hook and one payoff.";

  return [
    "Use historical context only for cadence, structure, and thematic fit, not for factual material.",
    laneHint,
    formatHint,
    "Let the user's supplied facts carry the draft. Do not import older anecdotes, mechanics, timelines, or metrics.",
  ];
}

export function retrieveRelevantContext(args: {
  userMessage: string;
  topicSummary: string | null;
  rollingSummary: string | null;
  topicAnchors: string[];
  factualContext?: string[];
  voiceContextHints?: string[];
  activeConstraints?: string[];
}): string[] {
  const weightedTerms = [
    ...collectTerms(args.userMessage),
    ...collectTerms(args.userMessage),
    ...collectTerms(args.userMessage),
    ...collectTerms(args.topicSummary || ""),
    ...collectTerms(args.topicSummary || ""),
    ...collectTerms(args.rollingSummary || ""),
    ...collectTerms(args.rollingSummary || ""),
    ...((args.factualContext || []).flatMap((anchor) => [
      ...collectTerms(anchor),
      ...collectTerms(anchor),
    ])),
    ...((args.voiceContextHints || []).flatMap((anchor) => collectTerms(anchor))),
    ...collectCorrectionLockTerms(args.activeConstraints || []),
    ...collectCorrectionLockTerms(args.activeConstraints || []),
  ];
  const ranked = args.topicAnchors
    .map((snippet) => ({
      snippet,
      score: scoreSnippet(snippet, weightedTerms),
    }))
    .sort((left, right) => right.score - left.score)
    .filter((item) => item.score > 0)
    .slice(0, 3)
    .map((item) => item.snippet);

  if (ranked.length > 0) {
    return ranked;
  }

  return args.topicAnchors.slice(0, 3);
}

function truncateLine(value: string, maxLength = 220): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function looksLikeStaleIdeationLine(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    /^(?:assistant(?:_angles)?\s*:\s*)?\d+\.\s+/.test(normalized) ||
    /^(?:assistant(?:_angles)?\s*:\s*)?(?:angle|idea|option)\s+\d+\b/.test(
      normalized,
    ) ||
    /\bwhich (?:of these|one|angle|idea)\b/.test(normalized) ||
    /\bwant me to draft (?:any|one) of (?:them|these)\b/.test(normalized)
  );
}

function buildRelevantRecentTurns(args: {
  recentHistory: string;
  shouldCompactIdeationHistory: boolean;
}): string[] {
  const recentLines = args.recentHistory
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const filteredLines = args.shouldCompactIdeationHistory
    ? recentLines.filter((line) => !looksLikeStaleIdeationLine(line))
    : recentLines;

  return filteredLines.slice(-6).map((line) => truncateLine(line));
}

function buildApprovedPlanSection(plan?: {
  objective?: string | null;
  angle?: string | null;
  targetLane?: string | null;
  hookType?: string | null;
  pitchResponse?: string | null;
} | null): string | null {
  if (!plan?.objective && !plan?.angle && !plan?.pitchResponse) {
    return null;
  }

  return [
    "APPROVED PLAN:",
    `Objective: ${plan?.objective || "None"}`,
    `Angle: ${plan?.angle || "None"}`,
    `Lane: ${plan?.targetLane || "None"}`,
    `Hook type: ${plan?.hookType || "None"}`,
    `Pitch: ${plan?.pitchResponse || "None"}`,
  ].join("\n");
}

function buildActiveDraftSection(activeDraft?: string | null): string | null {
  const normalizedDraft = activeDraft?.trim();
  if (!normalizedDraft) {
    return null;
  }

  const preview = normalizedDraft
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((line) => truncateLine(line, 180))
    .join("\n");

  return preview ? `CURRENT ARTIFACT SUMMARY:\n${preview}` : null;
}

function buildSourceMaterialSection(args?: {
  sourceMaterialRefs?: Array<{
    title?: string | null;
    type?: string | null;
    claims?: string[] | null;
    snippets?: string[] | null;
  }>;
}): string | null {
  const refs = (args?.sourceMaterialRefs || [])
    .map((ref) => {
      const title = ref.title?.trim() || "Untitled source";
      const type = ref.type?.trim() || "source";
      const claim = ref.claims?.find((entry) => entry.trim())?.trim() || null;
      const snippet = ref.snippets?.find((entry) => entry.trim())?.trim() || null;

      return truncateLine(
        [
          `${title} (${type})`,
          claim ? `claim: ${claim}` : null,
          snippet ? `snippet: ${snippet}` : null,
        ]
          .filter(Boolean)
          .join(" - "),
        240,
      );
    })
    .filter(Boolean)
    .slice(0, 3);

  return refs.length > 0
    ? `SOURCE MATERIAL REFERENCES:\n${refs.join("\n")}`
    : null;
}

export function buildEffectiveContext(args: {
  recentHistory: string;
  rollingSummary: string | null;
  relevantTopicAnchors: string[];
  factualContext?: string[];
  voiceContextHints?: string[];
  activeConstraints?: string[];
  referenceLabel?: string;
  approvedPlan?: {
    objective?: string | null;
    angle?: string | null;
    targetLane?: string | null;
    hookType?: string | null;
    pitchResponse?: string | null;
  } | null;
  activeDraft?: string | null;
  sourceMaterialRefs?: Array<{
    title?: string | null;
    type?: string | null;
    claims?: string[] | null;
    snippets?: string[] | null;
  }>;
}): string {
  const recentLines = buildRelevantRecentTurns({
    recentHistory: args.recentHistory,
    shouldCompactIdeationHistory: Boolean(args.approvedPlan || args.activeDraft),
  });

  const factualLocks = (args.activeConstraints || [])
    .filter((constraint) => constraint.startsWith("Correction lock:"))
    .map((constraint) => constraint.replace(/^Correction lock:\s*/i, "").trim())
    .filter(Boolean)
    .slice(-2);
  const knownFacts = Array.from(
    new Set([...(args.factualContext || []).slice(0, 3), ...factualLocks]),
  ).filter(Boolean);
  const voiceHints = Array.from(new Set((args.voiceContextHints || []).slice(0, 3))).filter(
    Boolean,
  );

  const sections = [
    knownFacts.length > 0
      ? `FACTS YOU ALREADY KNOW:\n${knownFacts.join("\n")}`
      : null,
    voiceHints.length > 0
      ? `VOICE / TERRITORY HINTS (NOT FACTS):\n${voiceHints.join("\n")}`
      : null,
    args.rollingSummary ? `ROLLING SUMMARY:\n${args.rollingSummary}` : null,
    buildApprovedPlanSection(args.approvedPlan),
    buildActiveDraftSection(args.activeDraft),
    buildSourceMaterialSection({
      sourceMaterialRefs: args.sourceMaterialRefs,
    }),
    recentLines.length > 0 ? `LATEST RELEVANT TURNS:\n${recentLines.join("\n")}` : null,
    args.relevantTopicAnchors.length > 0
      ? `${args.referenceLabel || "RELEVANT TOPIC ANCHORS"}:\n${args.relevantTopicAnchors.join("\n---\n")}`
      : null,
  ].filter(Boolean);

  return sections.join("\n\n") || "None";
}
