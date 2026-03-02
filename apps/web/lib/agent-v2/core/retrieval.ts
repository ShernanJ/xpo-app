import { prisma } from "../../db";

export interface RetrievalResult {
  topicAnchors: string[];
  laneAnchors: string[];
  formatAnchors: string[];
}

/**
 * Searches past posts to find dynamic anchors based on the user's focus/topic.
 * Currently uses simple keyword matching before transitioning to full vector search.
 */
export async function retrieveAnchors(
  userId: string,
  focusTopic: string,
  limit: number = 2
): Promise<RetrievalResult> {
  // Extract keywords from the focus topic (naive approach for MVP)
  const keywords = focusTopic
    .toLowerCase()
    .replace(/[^\w\s]/gi, "")
    .split(/\s+/)
    .filter((word) => word.length > 3); // Ignore short words

  if (keywords.length === 0) {
    return {
      topicAnchors: [],
      laneAnchors: [],
      formatAnchors: [],
    };
  }

  // Find posts containing ANY of the keywords
  // A proper tsvector search or embeddings would be better here for production
  const orConditions = keywords.map((kw) => ({
    text: { contains: kw, mode: "insensitive" as const },
  }));

  try {
    const relevantPosts = await prisma.post.findMany({
      where: {
        userId,
        OR: orConditions,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        text: true,
        lane: true,
      },
    });

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
