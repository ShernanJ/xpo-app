export interface IdeaAngleLike {
  title: string;
  [key: string]: unknown;
}

const IDEA_TITLE_SIMILARITY_STOPWORDS = new Set([
  "what",
  "how",
  "why",
  "where",
  "when",
  "which",
  "who",
  "the",
  "a",
  "an",
  "to",
  "on",
  "in",
  "for",
  "with",
  "about",
  "your",
  "you",
  "this",
  "that",
  "it",
  "do",
  "does",
  "did",
  "is",
  "are",
  "of",
  "and",
  "or",
  "most",
  "biggest",
  "one",
  "part",
  "thing",
]);

function normalizeIdeaTitleForComparison(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ");
}

function tokenizeIdeaTitle(value: string): string[] {
  return normalizeIdeaTitleForComparison(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length > 2 && !IDEA_TITLE_SIMILARITY_STOPWORDS.has(token),
    );
}

function extractRecentAngleTitles(recentHistory: string): string[] {
  if (!recentHistory.trim()) {
    return [];
  }

  const lines = recentHistory.split(/\r?\n/);
  const titles: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() || "";
    if (!line) {
      continue;
    }

    const inlineMatch = line.match(/^(?:[a-z]+:\s*)?\d+\.\s+(.+\?)$/i);
    if (inlineMatch?.[1]) {
      titles.push(inlineMatch[1].trim().replace(/\s+/g, " "));
      continue;
    }

    if (/^(?:[a-z]+:\s*)?\d+\.\s*$/i.test(line)) {
      const nextLine = (lines[index + 1] || "").trim();
      if (nextLine && /\?$/.test(nextLine)) {
        titles.push(nextLine.replace(/\s+/g, " "));
      }
    }
  }

  return titles.slice(-12);
}

function overlapRatio(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const rightSet = new Set(right);
  let overlapCount = 0;
  for (const token of left) {
    if (rightSet.has(token)) {
      overlapCount += 1;
    }
  }

  return overlapCount / Math.min(left.length, right.length);
}

function isNearDuplicateIdeaTitle(title: string, priorTitles: string[]): boolean {
  const normalized = normalizeIdeaTitleForComparison(title);
  if (!normalized) {
    return false;
  }

  const tokens = tokenizeIdeaTitle(title);
  return priorTitles.some((prior) => {
    const normalizedPrior = normalizeIdeaTitleForComparison(prior);
    if (!normalizedPrior) {
      return false;
    }

    if (normalizedPrior === normalized) {
      return true;
    }

    const priorTokens = tokenizeIdeaTitle(prior);
    return overlapRatio(tokens, priorTokens) >= 0.8;
  });
}

function deterministicIndex(seed: string, modulo: number): number {
  if (modulo <= 1) {
    return 0;
  }

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return hash % modulo;
}

function buildNovelAngleQuestion(args: {
  focusTopic: string | null;
  index: number;
  seed: string;
  seenNormalizedTitles: Set<string>;
}): string {
  const patterns = args.focusTopic
    ? [
        `where do people overcomplicate ${args.focusTopic}?`,
        `what's a counterintuitive take you have on ${args.focusTopic}?`,
        `when does the usual advice on ${args.focusTopic} fail?`,
        `what's the tradeoff nobody talks about with ${args.focusTopic}?`,
        `what do you wish people understood sooner about ${args.focusTopic}?`,
        `what's one example that explains ${args.focusTopic} best?`,
        `what's the most overrated take on ${args.focusTopic}?`,
        `where do you disagree with the common advice on ${args.focusTopic}?`,
      ]
    : [
        "what are people overcomplicating here?",
        "what's a take you have that most people disagree with?",
        "where does the common advice fail in practice?",
        "what tradeoff gets ignored most often?",
        "what do people realize too late about this?",
        "what's one real example that explains this clearly?",
      ];
  const start = deterministicIndex(
    `${args.seed}|${args.focusTopic || "broad"}|${args.index}`,
    patterns.length,
  );

  for (let offset = 0; offset < patterns.length; offset += 1) {
    const candidate = patterns[(start + offset) % patterns.length];
    const normalized = normalizeIdeaTitleForComparison(candidate);
    if (!normalized || !args.seenNormalizedTitles.has(normalized)) {
      return candidate;
    }
  }

  return patterns[start];
}

export function dedupeAngleTitlesForRetry<T extends IdeaAngleLike>(args: {
  angles: T[];
  focusTopic: string | null;
  recentHistory: string;
  seed: string;
}): T[] {
  const recentTitles = extractRecentAngleTitles(args.recentHistory);
  const seenNormalizedTitles = new Set(
    recentTitles
      .map((title) => normalizeIdeaTitleForComparison(title))
      .filter(Boolean),
  );
  const priorTitles = [...recentTitles];

  return args.angles.map((angle, index) => {
    const cleanTitle = angle.title.trim().replace(/\s+/g, " ");
    const duplicate =
      !cleanTitle || isNearDuplicateIdeaTitle(cleanTitle, priorTitles);
    const title = duplicate
      ? buildNovelAngleQuestion({
          focusTopic: args.focusTopic,
          index,
          seed: args.seed,
          seenNormalizedTitles,
        })
      : cleanTitle;
    const normalized = normalizeIdeaTitleForComparison(title);
    if (normalized) {
      seenNormalizedTitles.add(normalized);
    }
    priorTitles.push(title);

    return {
      ...angle,
      title,
    };
  });
}
