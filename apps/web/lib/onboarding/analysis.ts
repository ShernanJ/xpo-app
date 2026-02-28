import type {
  ContentDistributionItem,
  ContentType,
  EngagementBaseline,
  GrowthStage,
  HookPattern,
  HookPatternItem,
  PostFeatureSnapshot,
  XPublicPost,
} from "./types";

const ENTITY_STOPWORDS = new Set([
  "a",
  "about",
  "after",
  "all",
  "also",
  "am",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "by",
  "can",
  "did",
  "do",
  "for",
  "from",
  "get",
  "had",
  "has",
  "have",
  "how",
  "i",
  "if",
  "im",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "like",
  "me",
  "more",
  "my",
  "not",
  "of",
  "on",
  "or",
  "our",
  "out",
  "so",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "too",
  "up",
  "ur",
  "was",
  "we",
  "what",
  "when",
  "with",
  "you",
  "your",
]);

const LOW_SIGNAL_ENTITY_WORDS = new Set([
  "almost",
  "back",
  "come",
  "day",
  "days",
  "friend",
  "friends",
  "going",
  "good",
  "great",
  "last",
  "life",
  "love",
  "made",
  "make",
  "next",
  "outside",
  "people",
  "planning",
  "site",
  "stuff",
  "thing",
  "things",
  "throwback",
  "time",
  "today",
  "tomorrow",
  "week",
  "weeks",
  "win",
  "years",
]);

const ENTITY_ALIAS_MAP = new Map<string, string>([
  ["ai", "artificial intelligence"],
  ["artificial intelligence", "artificial intelligence"],
  ["sf", "san francisco"],
  ["san fran", "san francisco"],
  ["bay area", "san francisco"],
  ["nyc", "new york"],
  ["new york city", "new york"],
]);

function getPostEngagement(post: XPublicPost): number {
  const { likeCount, replyCount, repostCount, quoteCount } = post.metrics;
  return likeCount + replyCount + repostCount + quoteCount;
}

export function computePostEngagement(post: XPublicPost): number {
  return getPostEngagement(post);
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

export function classifyContentType(text: string): ContentType {
  const trimmed = text.trim();
  const lines = trimmed.split("\n").map((line) => line.trim()).filter(Boolean);
  const firstLine = lines[0] ?? "";

  if (/https?:\/\//i.test(trimmed)) {
    return "link_post";
  }

  if (
    lines.length >= 3 &&
    lines.some((line) => /^(\d+\.|[-*•])\s+/.test(line))
  ) {
    return "list_post";
  }

  if (firstLine.endsWith("?")) {
    return "question_post";
  }

  if (lines.length > 1) {
    return "multi_line";
  }

  if (trimmed.length <= 120) {
    return "single_line";
  }

  return "multi_line";
}

export function detectHookPattern(text: string): HookPattern {
  const firstLine = text.trim().split("\n")[0]?.trim().toLowerCase() ?? "";

  if (!firstLine) {
    return "statement_open";
  }

  if (firstLine.endsWith("?")) {
    return "question_open";
  }

  if (/^\d+/.test(firstLine)) {
    return "numeric_open";
  }

  if (firstLine.startsWith("how to")) {
    return "how_to_open";
  }

  if (
    firstLine.includes("hot take") ||
    firstLine.includes("unpopular opinion")
  ) {
    return "hot_take_open";
  }

  if (
    firstLine.startsWith("i ") ||
    firstLine.startsWith("when i ") ||
    firstLine.startsWith("last year")
  ) {
    return "story_open";
  }

  return "statement_open";
}

export function isLowSignalEntityCandidate(candidate: string): boolean {
  const normalized = normalizeEntityCandidate(candidate);
  if (!normalized) {
    return true;
  }

  const parts = normalized
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return true;
  }

  return parts.every((part) => LOW_SIGNAL_ENTITY_WORDS.has(part));
}

export function normalizeEntityCandidate(candidate: string): string | null {
  const collapsed = candidate
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!collapsed) {
    return null;
  }

  const alias = ENTITY_ALIAS_MAP.get(collapsed) ?? collapsed;
  const parts = alias
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  if (parts.length === 1) {
    const [single] = parts;
    if (single.length < 2 || ENTITY_STOPWORDS.has(single)) {
      return null;
    }
  }

  return parts.join(" ");
}

export function extractEntityCandidates(text: string): string[] {
  const withoutUrls = text.replace(/https?:\/\/\S+/gi, " ");
  const hashtagMatches = withoutUrls.match(/#([\p{L}\p{N}_]+)/gu) ?? [];

  const normalized = withoutUrls
    .replace(/@\w+/g, " ")
    .replace(/#/g, " ")
    .replace(/[^\p{L}\p{N}\s_-]+/gu, " ")
    .toLowerCase();
  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  const candidates = new Set<string>();
  const addCandidate = (raw: string) => {
    const candidate = normalizeEntityCandidate(raw);
    if (!candidate) {
      return;
    }

    candidates.add(candidate);
  };

  for (const hashtag of hashtagMatches) {
    addCandidate(hashtag.replace(/^#/, ""));
  }

  for (const token of tokens) {
    addCandidate(token);
  }

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const first = tokens[index];
    const second = tokens[index + 1];
    if (!first || !second) {
      continue;
    }

    if (
      LOW_SIGNAL_ENTITY_WORDS.has(first) &&
      LOW_SIGNAL_ENTITY_WORDS.has(second)
    ) {
      continue;
    }

    const phrase = `${first} ${second}`;
    if (phrase.length >= 5) {
      addCandidate(phrase);
    }
  }

  return Array.from(candidates);
}

export function analyzePostFeatures(post: XPublicPost): PostFeatureSnapshot {
  const trimmed = post.text.trim();
  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const wordCount = trimmed.length > 0 ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const mentionMatches = post.text.match(/@\w+/g) ?? [];
  const linkMatches = post.text.match(/https?:\/\/\S+/gi) ?? [];
  const emojiMatches = post.text.match(/\p{Extended_Pictographic}/gu) ?? [];

  return {
    contentType: classifyContentType(post.text),
    hookPattern: detectHookPattern(post.text),
    engagementTotal: getPostEngagement(post),
    hasLinks: linkMatches.length > 0,
    linkCount: linkMatches.length,
    hasMentions: mentionMatches.length > 0,
    mentionCount: mentionMatches.length,
    hasQuestion: trimmed.includes("?"),
    hasNumbers: /\d/.test(post.text),
    hasCta:
      /\b(reply|retweet|repost|dm|follow|comment|share|bookmark|read|watch|join|apply|check out|sign up|subscribe|let'?s chat)\b/i.test(
        post.text,
      ),
    lineCount: lines.length,
    wordCount,
    emojiCount: emojiMatches.length,
    isReply: trimmed.startsWith("@"),
    entityCandidates: extractEntityCandidates(post.text),
  };
}

export function computeEngagementBaseline(
  posts: XPublicPost[],
  followersCount: number,
): EngagementBaseline {
  if (posts.length === 0) {
    return {
      averageEngagement: 0,
      medianEngagement: 0,
      engagementRate: 0,
      postingCadencePerWeek: 0,
      averagePostLength: 0,
    };
  }

  const engagements = posts.map((post) => getPostEngagement(post));
  const averageEngagement =
    engagements.reduce((sum, value) => sum + value, 0) / engagements.length;
  const medianEngagement = median(engagements);

  const sortedDates = posts
    .map((post) => new Date(post.createdAt).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  let postingCadencePerWeek = 0;
  if (sortedDates.length >= 2) {
    const spanMs = sortedDates[sortedDates.length - 1] - sortedDates[0];
    const spanDays = Math.max(spanMs / (1000 * 60 * 60 * 24), 1);
    postingCadencePerWeek = (posts.length / spanDays) * 7;
  } else {
    postingCadencePerWeek = posts.length;
  }

  const averagePostLength =
    posts.reduce((sum, post) => sum + post.text.trim().length, 0) / posts.length;

  const engagementRate =
    followersCount > 0 ? (averageEngagement / followersCount) * 100 : 0;

  return {
    averageEngagement: Number(averageEngagement.toFixed(2)),
    medianEngagement: Number(medianEngagement.toFixed(2)),
    engagementRate: Number(engagementRate.toFixed(2)),
    postingCadencePerWeek: Number(postingCadencePerWeek.toFixed(2)),
    averagePostLength: Number(averagePostLength.toFixed(2)),
  };
}

export function computeGrowthStage(
  followersCount: number,
  engagementRate: number,
): GrowthStage {
  if (followersCount < 1000) {
    return "0-1k";
  }

  if (followersCount < 10000) {
    return engagementRate >= 1 ? "1k-10k" : "0-1k";
  }

  return "10k+";
}

export function computeContentDistribution(
  posts: XPublicPost[],
): ContentDistributionItem[] {
  if (posts.length === 0) {
    return [];
  }

  const counters = new Map<
    ContentType,
    { count: number; totalEngagement: number }
  >();

  for (const post of posts) {
    const type = classifyContentType(post.text);
    const engagement = getPostEngagement(post);
    const current = counters.get(type) ?? { count: 0, totalEngagement: 0 };
    counters.set(type, {
      count: current.count + 1,
      totalEngagement: current.totalEngagement + engagement,
    });
  }

  return Array.from(counters.entries())
    .map(([type, value]) => ({
      type,
      count: value.count,
      percentage: Number(((value.count / posts.length) * 100).toFixed(2)),
      averageEngagement: Number((value.totalEngagement / value.count).toFixed(2)),
    }))
    .sort((a, b) => b.count - a.count);
}

export function computeHookPatterns(posts: XPublicPost[]): HookPatternItem[] {
  if (posts.length === 0) {
    return [];
  }

  const counters = new Map<
    HookPattern,
    { count: number; totalEngagement: number }
  >();

  for (const post of posts) {
    const pattern = detectHookPattern(post.text);
    const engagement = getPostEngagement(post);
    const current = counters.get(pattern) ?? { count: 0, totalEngagement: 0 };
    counters.set(pattern, {
      count: current.count + 1,
      totalEngagement: current.totalEngagement + engagement,
    });
  }

  return Array.from(counters.entries())
    .map(([pattern, value]) => ({
      pattern,
      count: value.count,
      percentage: Number(((value.count / posts.length) * 100).toFixed(2)),
      averageEngagement: Number((value.totalEngagement / value.count).toFixed(2)),
    }))
    .sort((a, b) => b.count - a.count);
}
