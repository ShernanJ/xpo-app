import { prisma } from "../../db";

export interface RetrievalResult {
  topicAnchors: string[];
  laneAnchors: string[];
  formatAnchors: string[];
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
      tokens.filter(
        (token) =>
          token.length >= 3 &&
          !TOPIC_STOPWORDS.has(token),
      ),
    ),
  ).slice(0, 8);
}

/**
 * Searches past posts to find dynamic anchors based on the user's focus/topic.
 * Currently uses simple keyword matching before transitioning to full vector search.
 */
export async function retrieveAnchors(
  userId: string,
  xHandle: string,
  focusTopic: string,
  limit: number = 2
): Promise<RetrievalResult> {
  const normalizedHandle = normalizeHandle(xHandle);
  const keywords = extractTopicKeywords(focusTopic);
  const boundedLimit = Math.max(2, Math.min(8, limit));

  // Always keep a recent fallback so generic prompts still carry profile context.
  const readRecentFallback = async () => {
    const recentPosts = await prisma.post.findMany({
      where: {
        userId,
        xHandle: normalizedHandle,
      },
      orderBy: { createdAt: "desc" },
      take: boundedLimit,
      select: {
        text: true,
        lane: true,
      },
    });

    return {
      topicAnchors: recentPosts.map((post) => post.text),
      laneAnchors: Array.from(new Set(recentPosts.map((post) => post.lane))),
      formatAnchors: [],
    };
  };

  try {
    if (keywords.length === 0) {
      return readRecentFallback();
    }

    const orConditions = keywords.map((kw) => ({
      text: { contains: kw, mode: "insensitive" as const },
    }));

    const relevantPosts = await prisma.post.findMany({
      where: {
        userId,
        xHandle: normalizedHandle,
        OR: orConditions,
      },
      orderBy: { createdAt: "desc" },
      take: boundedLimit,
      select: {
        text: true,
        lane: true,
      },
    });

    if (relevantPosts.length === 0) {
      return readRecentFallback();
    }

    return {
      topicAnchors: relevantPosts.map((p) => p.text),
      laneAnchors: Array.from(new Set(relevantPosts.map((p) => p.lane))),
      formatAnchors: [], // To be implemented with format classification
    };
  } catch (error) {
    console.error("Retrieval failed:", error);
    return {
      topicAnchors: [],
      laneAnchors: [],
      formatAnchors: [],
    };
  }
}
