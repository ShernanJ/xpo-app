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

export function retrieveRelevantContext(args: {
  userMessage: string;
  topicSummary: string | null;
  rollingSummary: string | null;
  topicAnchors: string[];
}): string[] {
  const terms = new Set<string>([
    ...collectTerms(args.userMessage),
    ...collectTerms(args.topicSummary || ""),
    ...collectTerms(args.rollingSummary || ""),
  ]);

  const ranked = args.topicAnchors
    .map((snippet) => ({
      snippet,
      score: scoreSnippet(snippet, Array.from(terms)),
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
}): string {
  const recentLines = args.recentHistory
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-6);

  const sections = [
    args.rollingSummary ? `ROLLING SUMMARY:\n${args.rollingSummary}` : null,
    recentLines.length > 0 ? `RECENT TURNS:\n${recentLines.join("\n")}` : null,
    args.relevantTopicAnchors.length > 0
      ? `RELEVANT TOPIC ANCHORS:\n${args.relevantTopicAnchors.join("\n---\n")}`
      : null,
  ].filter(Boolean);

  return sections.join("\n\n") || "None";
}
