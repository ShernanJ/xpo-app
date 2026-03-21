import type { XPinnedPost, XPublicPost, XPublicProfile } from "../types";

interface StoredScrapeProfilePayload extends XPublicProfile {
  pinnedPost?: XPinnedPost | null;
}

export const MAX_MERGED_CAPTURE_POSTS = 3000;
export const MAX_MERGED_CAPTURE_REPLY_POSTS = 140;
export const MAX_MERGED_CAPTURE_QUOTE_POSTS = 100;

export function normalizeProfile(
  profile: XPublicProfile,
  account: string,
  pinnedPost?: XPinnedPost | null,
): StoredScrapeProfilePayload {
  return {
    ...profile,
    username: account,
    pinnedPost: pinnedPost ?? null,
  };
}

export function mergeProfilePayload(
  existing: StoredScrapeProfilePayload | null,
  incoming: XPublicProfile,
  account: string,
  pinnedPost?: XPinnedPost | null,
): StoredScrapeProfilePayload {
  const normalizedIncoming = normalizeProfile(incoming, account, pinnedPost ?? null);
  if (!existing) {
    return normalizedIncoming;
  }

  return {
    ...existing,
    ...normalizedIncoming,
    username: account,
    bio: normalizedIncoming.bio || existing.bio,
    avatarUrl: normalizedIncoming.avatarUrl ?? existing.avatarUrl ?? null,
    headerImageUrl:
      normalizedIncoming.headerImageUrl ?? existing.headerImageUrl ?? null,
    isVerified: normalizedIncoming.isVerified || existing.isVerified || false,
    followersCount:
      normalizedIncoming.followersCount > 0
        ? normalizedIncoming.followersCount
        : existing.followersCount,
    followingCount:
      normalizedIncoming.followingCount > 0
        ? normalizedIncoming.followingCount
        : existing.followingCount,
    createdAt:
      normalizedIncoming.createdAt !== new Date(0).toISOString()
        ? normalizedIncoming.createdAt
        : existing.createdAt,
    pinnedPost: pinnedPost ?? existing.pinnedPost ?? null,
  };
}

export function mergeScrapeCapturePosts(
  existing: XPublicPost[],
  incoming: XPublicPost[],
  limit: number,
): XPublicPost[] {
  const postsById = new Map<string, XPublicPost>();

  for (const post of [...incoming, ...existing]) {
    if (!post?.id || postsById.has(post.id)) {
      continue;
    }

    postsById.set(post.id, post);
  }

  return Array.from(postsById.values())
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
    .slice(0, Math.max(1, limit));
}
