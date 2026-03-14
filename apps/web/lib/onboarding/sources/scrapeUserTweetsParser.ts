import { normalizeXAvatarUrl } from "../profile/avatarUrl";
import { normalizeAccountInput } from "../validation";
import type { XPublicPost, XPublicProfile } from "../types";

interface ParsedScrapeTimeline {
  profile: XPublicProfile;
  posts: XPublicPost[];
  replyPosts: XPublicPost[];
  quotePosts: XPublicPost[];
}

const MAX_PARSED_SCRAPE_POSTS = 250;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  return null;
}

function toIsoDate(value: unknown): string {
  const raw = asString(value);
  if (!raw) {
    return new Date(0).toISOString();
  }

  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) {
    return new Date(0).toISOString();
  }

  return parsed.toISOString();
}

function unwrapTweetResultNode(value: unknown): Record<string, unknown> | null {
  const node = asRecord(value);
  if (!node) {
    return null;
  }

  if (node.__typename === "Tweet" && asRecord(node.legacy)) {
    return node;
  }

  const tweet = asRecord(node.tweet);
  if (tweet) {
    return unwrapTweetResultNode(tweet);
  }

  const result = asRecord(node.result);
  if (result) {
    return unwrapTweetResultNode(result);
  }

  if (asRecord(node.legacy)) {
    return node;
  }

  return null;
}

function extractTimelineTweetNode(value: unknown): Record<string, unknown> | null {
  const node = asRecord(value);
  if (!node) {
    return null;
  }

  const itemContent = asRecord(node.itemContent);
  const tweetResults =
    asRecord(node.tweet_results) ?? asRecord(itemContent?.tweet_results);

  return unwrapTweetResultNode(tweetResults?.result);
}

function getTimelineFromPayload(payload: unknown): Record<string, unknown> | null {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const user = asRecord(data?.user);
  const userResult = asRecord(user?.result);

  const timeline = asRecord(asRecord(userResult?.timeline)?.timeline);
  if (timeline) {
    return timeline;
  }

  const timelineV2 = asRecord(asRecord(userResult?.timeline_v2)?.timeline);
  if (timelineV2) {
    return timelineV2;
  }

  return null;
}

function collectTweetResultNodesFromTimeline(payload: unknown): Record<string, unknown>[] {
  const timeline = getTimelineFromPayload(payload);
  if (!timeline) {
    return [];
  }

  const instructions = Array.isArray(timeline.instructions) ? timeline.instructions : [];
  const nodes: Record<string, unknown>[] = [];

  for (const instructionValue of instructions) {
    const instruction = asRecord(instructionValue);
    if (!instruction) {
      continue;
    }

    const entries: unknown[] = [];
    if (Array.isArray(instruction.entries)) {
      entries.push(...instruction.entries);
    }

    const singleEntry = asRecord(instruction.entry);
    if (singleEntry) {
      entries.push(singleEntry);
    }

    for (const entryValue of entries) {
      const entry = asRecord(entryValue);
      const content = asRecord(entry?.content);
      if (!content) {
        continue;
      }

      const contentTweetNode = extractTimelineTweetNode(content);
      if (contentTweetNode) {
        nodes.push(contentTweetNode);
      }

      const contentItem = asRecord(content.item);
      if (contentItem) {
        const contentItemTweetNode = extractTimelineTweetNode(contentItem);
        if (contentItemTweetNode) {
          nodes.push(contentItemTweetNode);
        }
      }

      const moduleItems = Array.isArray(content.items) ? content.items : [];
      for (const moduleItemValue of moduleItems) {
        const moduleItem = asRecord(moduleItemValue);
        if (!moduleItem) {
          continue;
        }

        const moduleItemTweetNode = extractTimelineTweetNode(moduleItem);
        if (moduleItemTweetNode) {
          nodes.push(moduleItemTweetNode);
        }

        const moduleItemItem = asRecord(moduleItem.item);
        if (!moduleItemItem) {
          continue;
        }

        const moduleItemItemTweetNode = extractTimelineTweetNode(moduleItemItem);
        if (moduleItemItemTweetNode) {
          nodes.push(moduleItemItemTweetNode);
        }
      }
    }
  }

  return nodes;
}

function extractProfileFromTweetNode(
  tweetNode: Record<string, unknown>,
): XPublicProfile | null {
  const core = asRecord(tweetNode.core);
  const userResults = asRecord(core?.user_results);
  const userNode = asRecord(userResults?.result);
  if (!userNode) {
    return null;
  }

  const userCore = asRecord(userNode.core);
  const userLegacy = asRecord(userNode.legacy);
  const profileBio = asRecord(userNode.profile_bio);
  const avatar = asRecord(userNode.avatar);
  const verification = asRecord(userNode.verification);

  const username = asString(userCore?.screen_name) ?? asString(userLegacy?.screen_name);
  if (!username) {
    return null;
  }

  return {
    username,
    name: asString(userCore?.name) ?? asString(userLegacy?.name) ?? username,
    bio:
      asString(userLegacy?.description) ??
      asString(profileBio?.description) ??
      "",
    avatarUrl: normalizeXAvatarUrl(
      asString(avatar?.image_url) ??
        asString(userLegacy?.profile_image_url_https) ??
        asString(userLegacy?.profile_image_url) ??
        null,
    ),
    isVerified:
      asBoolean(verification?.verified) ??
      asBoolean(userNode.is_blue_verified) ??
      asBoolean(userLegacy?.verified) ??
      false,
    followersCount: asNumber(
      userLegacy?.followers_count ?? userLegacy?.normal_followers_count,
    ),
    followingCount: asNumber(userLegacy?.friends_count),
    createdAt: toIsoDate(userCore?.created_at ?? userLegacy?.created_at),
  };
}

function extractPostFromTweetNode(
  tweetNode: Record<string, unknown>,
  accountFilter: string | null,
  options: {
    includeRetweets: boolean;
    includeReplies: boolean;
    includeQuotes?: boolean;
  },
): XPublicPost | null {
  const legacy = asRecord(tweetNode.legacy);
  if (!legacy) {
    return null;
  }

  const id =
    asString(legacy.id_str) ??
    asString(tweetNode.rest_id) ??
    asString(tweetNode.id_str) ??
    asString(tweetNode.id);
  const text = asString(legacy.full_text) ?? asString(legacy.text);

  if (!id || !text) {
    return null;
  }

  const isRetweet =
    text.startsWith("RT @") ||
    asRecord(legacy.retweeted_status_result) !== null ||
    asString(legacy.retweeted_status_id_str) !== null ||
    asRecord(tweetNode.retweeted_status_result) !== null;
  if (!options.includeRetweets && isRetweet) {
    return null;
  }

  const isQuote =
    asBoolean(legacy.is_quote_status) === true ||
    asString(legacy.quoted_status_id_str) !== null ||
    asRecord(tweetNode.quoted_status_result) !== null;
  if (!(options.includeQuotes ?? false) && isQuote) {
    return null;
  }

  const isReply =
    asString(legacy.in_reply_to_status_id_str) !== null ||
    asString(legacy.in_reply_to_user_id_str) !== null ||
    asString(legacy.in_reply_to_screen_name) !== null;
  if (!options.includeReplies && isReply) {
    return null;
  }

  if (accountFilter) {
    const profile = extractProfileFromTweetNode(tweetNode);
    if (profile && profile.username.toLowerCase() !== accountFilter.toLowerCase()) {
      return null;
    }
  }

  return {
    id,
    text,
    createdAt: toIsoDate(legacy.created_at ?? tweetNode.created_at),
    metrics: {
      likeCount: asNumber(legacy.favorite_count),
      replyCount: asNumber(legacy.reply_count),
      repostCount: asNumber(legacy.retweet_count),
      quoteCount: asNumber(legacy.quote_count),
    },
  };
}

function isReplyPost(tweetNode: Record<string, unknown>): boolean {
  const legacy = asRecord(tweetNode.legacy);
  if (!legacy) {
    return false;
  }

  return (
    asString(legacy.in_reply_to_status_id_str) !== null ||
    asString(legacy.in_reply_to_user_id_str) !== null ||
    asString(legacy.in_reply_to_screen_name) !== null
  );
}

function isQuotePost(tweetNode: Record<string, unknown>): boolean {
  const legacy = asRecord(tweetNode.legacy);
  if (!legacy) {
    return false;
  }

  return (
    asBoolean(legacy.is_quote_status) === true ||
    asString(legacy.quoted_status_id_str) !== null ||
    asRecord(tweetNode.quoted_status_result) !== null
  );
}

function sortAndLimitPosts(postsById: Map<string, XPublicPost>): XPublicPost[] {
  return Array.from(postsById.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_PARSED_SCRAPE_POSTS);
}

export function parseUserTweetsGraphqlPayload(params: {
  payload: unknown;
  account?: string;
  includeRetweets?: boolean;
  includeReplies?: boolean;
  includeQuotes?: boolean;
}): ParsedScrapeTimeline {
  const accountNormalized = params.account
    ? normalizeAccountInput(params.account)
    : null;
  const includeRetweets = params.includeRetweets ?? false;
  const includeReplies = params.includeReplies ?? false;
  const includeQuotes = params.includeQuotes ?? false;
  const nodes = collectTweetResultNodesFromTimeline(params.payload);

  const postsById = new Map<string, XPublicPost>();
  const fallbackPostsById = new Map<string, XPublicPost>();
  const replyPostsById = new Map<string, XPublicPost>();
  const quotePostsById = new Map<string, XPublicPost>();
  let profileCandidate: XPublicProfile | null = null;

  for (const node of nodes) {
    const nodeProfile = extractProfileFromTweetNode(node);
    if (nodeProfile) {
      if (!profileCandidate) {
        profileCandidate = nodeProfile;
      }

      if (
        accountNormalized &&
        nodeProfile.username.toLowerCase() === accountNormalized.toLowerCase()
      ) {
        profileCandidate = nodeProfile;
      }
    }

    const fallbackPost = extractPostFromTweetNode(node, accountNormalized, {
      includeRetweets: true,
      includeReplies: true,
      includeQuotes: true,
    });
    if (fallbackPost && !fallbackPostsById.has(fallbackPost.id)) {
      fallbackPostsById.set(fallbackPost.id, fallbackPost);
    }

    if (isReplyPost(node)) {
      const replyPost = extractPostFromTweetNode(node, accountNormalized, {
        includeRetweets: false,
        includeReplies: true,
        includeQuotes: false,
      });
      if (replyPost && !replyPostsById.has(replyPost.id)) {
        replyPostsById.set(replyPost.id, replyPost);
      }
    }

    if (isQuotePost(node)) {
      const quotePost = extractPostFromTweetNode(node, accountNormalized, {
        includeRetweets: false,
        includeReplies: false,
        includeQuotes: true,
      });
      if (quotePost && !quotePostsById.has(quotePost.id)) {
        quotePostsById.set(quotePost.id, quotePost);
      }
    }

    const post = extractPostFromTweetNode(node, accountNormalized, {
      includeRetweets,
      includeReplies,
      includeQuotes,
    });
    if (!post) {
      continue;
    }

    if (!postsById.has(post.id)) {
      postsById.set(post.id, post);
    }
  }

  let posts = sortAndLimitPosts(postsById);
  if (posts.length === 0 && (!includeRetweets || !includeReplies)) {
    posts = sortAndLimitPosts(fallbackPostsById);
  }

  if (posts.length === 0) {
    throw new Error(
      "No timeline tweets were parsed from payload. Confirm this is a UserTweets GraphQL response.",
    );
  }

  const inferredUsername =
    accountNormalized ?? profileCandidate?.username ?? "unknown";

  const profile: XPublicProfile =
    profileCandidate ??
    ({
      username: inferredUsername,
      name: inferredUsername,
      bio: "",
      avatarUrl: null,
      isVerified: false,
      followersCount: 0,
      followingCount: 0,
      createdAt: new Date(0).toISOString(),
    } satisfies XPublicProfile);

  return {
    profile: {
      ...profile,
      username: accountNormalized ?? profile.username,
    },
    posts,
    replyPosts: sortAndLimitPosts(replyPostsById),
    quotePosts: sortAndLimitPosts(quotePostsById),
  };
}

export function normalizeScrapeAccount(input: string): string | null {
  return normalizeAccountInput(input);
}
