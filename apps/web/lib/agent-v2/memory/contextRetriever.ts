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
  contextAnchors?: string[];
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
    ...((args.contextAnchors || []).flatMap((anchor) => [
      ...collectTerms(anchor),
      ...collectTerms(anchor),
    ])),
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

export function buildEffectiveContext(args: {
  recentHistory: string;
  rollingSummary: string | null;
  relevantTopicAnchors: string[];
  contextAnchors?: string[];
  activeConstraints?: string[];
  referenceLabel?: string;
}): string {
  const recentLines = args.recentHistory
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-6);

  const factualLocks = (args.activeConstraints || [])
    .filter((constraint) => constraint.startsWith("Correction lock:"))
    .map((constraint) => constraint.replace(/^Correction lock:\s*/i, "").trim())
    .filter(Boolean)
    .slice(-2);
  const knownFacts = Array.from(
    new Set([...(args.contextAnchors || []).slice(0, 3), ...factualLocks]),
  ).filter(Boolean);

  const sections = [
    knownFacts.length > 0
      ? `FACTS YOU ALREADY KNOW:\n${knownFacts.join("\n")}`
      : null,
    args.rollingSummary ? `ROLLING SUMMARY:\n${args.rollingSummary}` : null,
    recentLines.length > 0 ? `RECENT TURNS:\n${recentLines.join("\n")}` : null,
    args.relevantTopicAnchors.length > 0
      ? `${args.referenceLabel || "RELEVANT TOPIC ANCHORS"}:\n${args.relevantTopicAnchors.join("\n---\n")}`
      : null,
  ].filter(Boolean);

  return sections.join("\n\n") || "None";
}
