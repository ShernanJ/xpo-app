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
