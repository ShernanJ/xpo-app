import { prisma } from "../../db";

export interface RetrievedPostAnchor {
  id: string;
  text: string;
  lane: "original" | "reply" | "quote";
  format: "shortform" | "longform" | "thread";
  score: number;
  reason: string;
  keywordHits: string[];
  createdAt: string;
  engagementTotal: number;
}

export interface RetrievalResult {
  topicAnchors: string[];
  laneAnchors: string[];
  formatAnchors: string[];
  rankedAnchors: RetrievedPostAnchor[];
}

const TOPIC_STOPWORDS = new Set([
  "post",
  "posts",
  "tweet",
  "tweets",
  "thread",
  "threads",
  "draft",
  "drafting",
  "write",
  "writing",
  "idea",
  "ideas",
  "help",
  "need",
  "make",
  "give",
  "about",
  "this",
  "that",
  "with",
  "from",
  "your",
  "just",
  "more",
  "some",
  "into",
  "grow",
  "growth",
  "x",
  "twitter",
  "today",
  "week",
]);

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function extractTopicKeywords(focusTopic: string): string[] {
  const tokens = focusTopic
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  return Array.from(
    new Set(
      tokens.filter((token) => token.length >= 3 && !TOPIC_STOPWORDS.has(token)),
    ),
  ).slice(0, 10);
}

function inferPostFormat(text: string): "shortform" | "longform" | "thread" {
  const normalized = text.trim();
  const lineCount = normalized.split("\n").filter((line) => line.trim().length > 0).length;
  const paragraphCount = normalized.split(/\n{2,}/).filter((line) => line.trim().length > 0).length;
  const hasNumberedBeats = /\b1[.)]\s|\b2[.)]\s|\b3[.)]\s/.test(normalized);

  if ((lineCount >= 5 && paragraphCount >= 3) || hasNumberedBeats) {
    return "thread";
  }

  if (normalized.length >= 380 || lineCount >= 8) {
    return "longform";
  }

  return "shortform";
}

function readEngagementTotal(metrics: unknown): number {
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    return 0;
  }

  const record = metrics as Record<string, unknown>;
  return [
    record.likeCount,
    record.replyCount,
    record.repostCount,
    record.quoteCount,
  ].reduce<number>((total, value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return total + value;
    }
    return total;
  }, 0);
}

function computeKeywordHits(text: string, keywords: string[]): string[] {
  const normalized = text.toLowerCase();
  return keywords.filter((keyword) => normalized.includes(keyword));
}

function scoreAnchor(args: {
  text: string;
  keywords: string[];
  lane: "original" | "reply" | "quote";
  targetLane?: "original" | "reply" | "quote";
  preferredFormat?: "shortform" | "longform" | "thread" | null;
  createdAtRank: number;
  engagementTotal: number;
}): {
  score: number;
  format: "shortform" | "longform" | "thread";
  keywordHits: string[];
  reason: string;
} {
  const keywordHits = computeKeywordHits(args.text, args.keywords);
  const format = inferPostFormat(args.text);
  let score = 12 - Math.min(args.createdAtRank, 10);

  if (keywordHits.length > 0) {
    score += keywordHits.length * 14;
  } else if (args.keywords.length === 0) {
    score += 8;
  }

  if (args.targetLane && args.lane === args.targetLane) {
    score += 16;
  } else if (!args.targetLane && args.lane === "original") {
    score += 6;
  }

  if (args.preferredFormat && format === args.preferredFormat) {
    score += 12;
  } else if (
    args.preferredFormat === "thread" &&
    format === "longform"
  ) {
    score += 4;
  } else if (
    args.preferredFormat === "longform" &&
    format === "thread"
  ) {
    score += 4;
  }

  if (args.engagementTotal > 0) {
    score += Math.min(18, Math.round(Math.log2(args.engagementTotal + 1) * 4));
  }

  const reasonParts = [
    keywordHits.length > 0 ? `matched ${keywordHits.join(", ")}` : "recent contextual fallback",
    args.targetLane && args.lane === args.targetLane ? `lane ${args.lane}` : null,
    args.preferredFormat && format === args.preferredFormat ? `${format} shape` : null,
    args.engagementTotal > 0 ? `engagement ${args.engagementTotal}` : null,
  ].filter(Boolean);

  return {
    score,
    format,
    keywordHits,
    reason: reasonParts.join(" • "),
  };
}

/**
 * Searches past posts to find dynamic anchors based on the user's focus/topic.
 * Uses a lightweight lexical + lane/format + recency scorer so the writer sees
 * the right historical examples for the current request.
 */
export async function retrieveAnchors(
  userId: string,
  xHandle: string,
  focusTopic: string,
  options?: {
    targetLane?: "original" | "reply" | "quote";
    preferredFormat?: "shortform" | "longform" | "thread" | null;
    limit?: number;
  },
): Promise<RetrievalResult> {
  const normalizedHandle = normalizeHandle(xHandle);
  const keywords = extractTopicKeywords(focusTopic);
  const boundedLimit = Math.max(3, Math.min(8, options?.limit ?? 5));

  try {
    const posts = await prisma.post.findMany({
      where: {
        userId,
        xHandle: normalizedHandle,
      },
      orderBy: { createdAt: "desc" },
      take: 120,
      select: {
        id: true,
        text: true,
        lane: true,
        metrics: true,
        createdAt: true,
      },
    });

    if (posts.length === 0) {
      return {
        topicAnchors: [],
        laneAnchors: [],
        formatAnchors: [],
        rankedAnchors: [],
      };
    }

    const rankedAnchors = posts
      .map((post, index) => {
        const engagementTotal = readEngagementTotal(post.metrics);
        const lane =
          post.lane === "reply" || post.lane === "quote" ? post.lane : "original";
        const scored = scoreAnchor({
          text: post.text,
          keywords,
          lane,
          targetLane: options?.targetLane,
          preferredFormat: options?.preferredFormat ?? null,
          createdAtRank: index,
          engagementTotal,
        });

        return {
          id: post.id,
          text: post.text,
          lane,
          format: scored.format,
          score: scored.score,
          reason: scored.reason,
          keywordHits: scored.keywordHits,
          createdAt: post.createdAt.toISOString(),
          engagementTotal,
        } satisfies RetrievedPostAnchor;
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, boundedLimit);

    const topicAnchors = rankedAnchors.map((anchor) => anchor.text);
    const laneAnchors = rankedAnchors
      .filter((anchor) => !options?.targetLane || anchor.lane === options.targetLane)
      .map((anchor) => anchor.text)
      .slice(0, 3);
    const formatAnchors = rankedAnchors
      .filter((anchor) => !options?.preferredFormat || anchor.format === options.preferredFormat)
      .map((anchor) => anchor.text)
      .slice(0, 3);

    return {
      topicAnchors,
      laneAnchors,
      formatAnchors,
      rankedAnchors,
    };
  } catch (error) {
    console.error("Retrieval failed:", error);
    return {
      topicAnchors: [],
      laneAnchors: [],
      formatAnchors: [],
      rankedAnchors: [],
    };
  }
}
