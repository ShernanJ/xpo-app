import type { XPublicPost } from "../onboarding/contracts/types";
import type { DraftArtifactDetails } from "../onboarding/shared/draftArtifacts";
import {
  listPendingContentForMatching,
  updateContentItemById,
} from "./contentHub";

export const AUTO_PUBLISH_SIMILARITY_THRESHOLD = 0.8;

interface PendingMatchDraft {
  id: string;
  reviewStatus: string;
  artifact: DraftArtifactDetails | null;
}

export interface AutoPublishMatchResult {
  draftId: string;
  tweetId: string;
  similarity: number;
}

function stripUrls(value: string): string {
  return value.replace(/https?:\/\/\S+/gi, " ");
}

function stripThreadNoise(value: string): string {
  return value
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/^\s*(?:post|tweet)\s+\d+\s*:\s*/i, "")
        .replace(/^\s*\d+\s*[/.:)\-]\s*\d*\s*/, "")
        .replace(/^\s*\d+\)\s*/, ""),
    )
    .join(" ");
}

export function normalizeAutoPublishText(value: string): string {
  return stripThreadNoise(stripUrls(value))
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCharacterTrigrams(value: string): Set<string> {
  if (value.length === 0) {
    return new Set();
  }

  if (value.length < 3) {
    return new Set([value]);
  }

  const trigrams = new Set<string>();
  for (let index = 0; index <= value.length - 3; index += 1) {
    trigrams.add(value.slice(index, index + 3));
  }

  return trigrams;
}

export function computeTrigramSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeAutoPublishText(left);
  const normalizedRight = normalizeAutoPublishText(right);

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  const leftTrigrams = buildCharacterTrigrams(normalizedLeft);
  const rightTrigrams = buildCharacterTrigrams(normalizedRight);
  if (leftTrigrams.size === 0 || rightTrigrams.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const trigram of leftTrigrams) {
    if (rightTrigrams.has(trigram)) {
      overlap += 1;
    }
  }

  return (2 * overlap) / (leftTrigrams.size + rightTrigrams.size);
}

export function resolveComparableDraftText(
  artifact: DraftArtifactDetails | null | undefined,
): string | null {
  if (!artifact) {
    return null;
  }

  if (artifact.kind === "thread_seed") {
    const firstPost = artifact.posts?.[0]?.content?.trim();
    if (firstPost) {
      return firstPost;
    }
  }

  return artifact.content?.trim() || null;
}

function asDraftArtifact(value: unknown): DraftArtifactDetails | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as DraftArtifactDetails;
}

function pickBestMatch(args: {
  draftPool: PendingMatchDraft[];
  livePost: XPublicPost;
  matchedDraftIds: Set<string>;
}) {
  let bestMatch: AutoPublishMatchResult | null = null;

  for (const draft of args.draftPool) {
    if (args.matchedDraftIds.has(draft.id)) {
      continue;
    }

    const candidateText = resolveComparableDraftText(draft.artifact);
    if (!candidateText) {
      continue;
    }

    const similarity = computeTrigramSimilarity(candidateText, args.livePost.text);
    if (similarity < AUTO_PUBLISH_SIMILARITY_THRESHOLD) {
      continue;
    }

    if (!bestMatch || similarity > bestMatch.similarity) {
      bestMatch = {
        draftId: draft.id,
        tweetId: args.livePost.id,
        similarity,
      };
    }
  }

  return bestMatch;
}

export function findAutoPublishMatches(args: {
  drafts: PendingMatchDraft[];
  posts: XPublicPost[];
}) {
  const matchedDraftIds = new Set<string>();
  const matches: AutoPublishMatchResult[] = [];

  for (const post of args.posts) {
    const bestMatch = pickBestMatch({
      draftPool: args.drafts,
      livePost: post,
      matchedDraftIds,
    });
    if (!bestMatch) {
      continue;
    }

    matchedDraftIds.add(bestMatch.draftId);
    matches.push(bestMatch);
  }

  return matches;
}

export async function detectAutoPublishedDrafts(args: {
  userId: string;
  xHandle: string;
  posts: XPublicPost[];
}) {
  if (args.posts.length === 0) {
    return [];
  }

  const pendingDrafts = await listPendingContentForMatching({
    userId: args.userId,
    xHandle: args.xHandle,
  });
  if (pendingDrafts.length === 0) {
    return [];
  }

  const draftPool: PendingMatchDraft[] = pendingDrafts.map((draft) => ({
    id: draft.id,
    reviewStatus: draft.reviewStatus,
    artifact: asDraftArtifact(draft.artifact),
  }));
  const matches = findAutoPublishMatches({
    drafts: draftPool,
    posts: args.posts,
  });

  for (const match of matches) {
    const sourceDraft = draftPool.find((draft) => draft.id === match.draftId) ?? null;
    const sourcePost = args.posts.find((post) => post.id === match.tweetId) ?? null;
    if (!sourcePost) {
      continue;
    }

    await updateContentItemById({
      id: match.draftId,
      data: {
        status: "PUBLISHED",
        publishedTweetId: match.tweetId,
        postedAt: new Date(sourcePost.createdAt),
        ...(sourceDraft &&
        sourceDraft.reviewStatus !== "posted" &&
        sourceDraft.reviewStatus !== "observed"
          ? { reviewStatus: "posted" }
          : {}),
      },
    });
  }

  return matches;
}
