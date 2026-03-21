import { normalizeXAvatarUrl, normalizeXHeaderUrl } from "../profile/avatarUrl.ts";
import { normalizeAccountInput } from "../contracts/validation.ts";
import type { XPinnedPost, XPublicPost, XPublicProfile } from "../types";

interface ParsedScrapeTimeline {
  profile: XPublicProfile;
  pinnedPost: XPinnedPost | null;
  posts: XPublicPost[];
  replyPosts: XPublicPost[];
  quotePosts: XPublicPost[];
}

function mergeProfiles(
  base: XPublicProfile | null,
  incoming: XPublicProfile | null,
): XPublicProfile | null {
  if (!base) {
    return incoming;
  }

  if (!incoming) {
    return base;
  }

  return {
    ...base,
    ...incoming,
    bio: incoming.bio || base.bio,
    avatarUrl: incoming.avatarUrl ?? base.avatarUrl ?? null,
    headerImageUrl: incoming.headerImageUrl ?? base.headerImageUrl ?? null,
    isVerified: incoming.isVerified ?? base.isVerified ?? false,
    followersCount:
      incoming.followersCount > 0 ? incoming.followersCount : base.followersCount,
    followingCount:
      incoming.followingCount > 0 ? incoming.followingCount : base.followingCount,
    createdAt:
      incoming.createdAt !== new Date(0).toISOString()
        ? incoming.createdAt
        : base.createdAt,
  };
}

const MAX_PARSED_SCRAPE_POSTS = 250;

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    ),
  );
}

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

function extractUserNodeFromTweetNode(tweetNode: Record<string, unknown>): Record<string, unknown> | null {
  const core = asRecord(tweetNode.core);
  const userResults = asRecord(core?.user_results);
  return asRecord(userResults?.result);
}

function getTopLevelUserResultNode(payload: unknown): Record<string, unknown> | null {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const user = asRecord(data?.user);
  return asRecord(user?.result);
}

function getSearchTimelineRoot(payload: unknown): Record<string, unknown> | null {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const searchByRawQuery = asRecord(data?.search_by_raw_query);
  const searchTimeline = asRecord(searchByRawQuery?.search_timeline);
  return asRecord(searchTimeline?.timeline);
}

function extractProfileFromUserNode(userNode: Record<string, unknown>): XPublicProfile | null {
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
    headerImageUrl: normalizeXHeaderUrl(
      asString(userLegacy?.profile_banner_url) ??
        asString(userNode.profile_banner_url) ??
        asString(asRecord(userNode.banner)?.image_url) ??
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

function extractPinnedTweetIdsFromUserNode(userNode: Record<string, unknown>): string[] {
  const userLegacy = asRecord(userNode.legacy);
  const candidates = [
    userLegacy?.pinned_tweet_ids_str,
    userNode.pinned_tweet_ids_str,
    userLegacy?.pinned_tweet_ids,
    userNode.pinned_tweet_ids,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    const ids = candidate
      .map((value) => asString(value))
      .filter((value): value is string => Boolean(value));
    if (ids.length > 0) {
      return ids;
    }
  }

  return [];
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

  const searchTimeline = getSearchTimelineRoot(payload);
  if (searchTimeline) {
    return searchTimeline;
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

function findPinnedTimelineTweetNode(payload: unknown): Record<string, unknown> | null {
  const timeline = getTimelineFromPayload(payload);
  if (!timeline) {
    return null;
  }

  const instructions = Array.isArray(timeline.instructions) ? timeline.instructions : [];

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

      const clientEventInfo = asRecord(content.clientEventInfo);
      const itemContent = asRecord(content.itemContent);
      const socialContext = asRecord(itemContent?.socialContext);
      const isPinnedEntry =
        asString(clientEventInfo?.component) === "pinned_tweets" ||
        asString(socialContext?.contextType) === "Pin" ||
        asString(socialContext?.text)?.toLowerCase() === "pinned";

      if (!isPinnedEntry) {
        continue;
      }

      const tweetNode = extractTimelineTweetNode(content);
      if (tweetNode) {
        return tweetNode;
      }
    }
  }

  return null;
}

function collectTweetResultNodesFromPayload(payload: unknown): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const queue: unknown[] = [payload];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) {
      continue;
    }

    if (typeof current === "object") {
      seen.add(current);
    }

    const tweetNode = unwrapTweetResultNode(current);
    if (tweetNode) {
      nodes.push(tweetNode);
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const record = asRecord(current);
    if (!record) {
      continue;
    }

    queue.push(...Object.values(record));
  }

  return nodes;
}

function extractProfileFromTweetNode(
  tweetNode: Record<string, unknown>,
): XPublicProfile | null {
  const userNode = extractUserNodeFromTweetNode(tweetNode);
  if (!userNode) {
    return null;
  }

  return extractProfileFromUserNode(userNode);
}

function extractPinnedTweetIdsFromTweetNode(tweetNode: Record<string, unknown>): string[] {
  const userNode = extractUserNodeFromTweetNode(tweetNode);
  if (!userNode) {
    return [];
  }

  return extractPinnedTweetIdsFromUserNode(userNode);
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

  const imageUrls = extractTweetImageUrls(tweetNode);
  const expandedUrls = extractTweetExpandedUrls(tweetNode);
  const rawUrlMatches = text.match(/https?:\/\/\S+/gi) ?? [];
  const linkSignal = resolvePostLinkSignal({
    rawUrlCount: rawUrlMatches.length,
    expandedUrls,
    imageUrls,
  });

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
    imageUrls: imageUrls.length > 0 ? imageUrls : null,
    expandedUrls: expandedUrls.length > 0 ? expandedUrls : null,
    linkSignal,
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

function extractTweetImageUrls(tweetNode: Record<string, unknown>): string[] {
  const legacy = asRecord(tweetNode.legacy);
  const extendedMedia = asRecord(legacy?.extended_entities)?.media;
  const entityMedia = asRecord(legacy?.entities)?.media;
  const mediaEntries = [
    ...(Array.isArray(extendedMedia) ? extendedMedia : []),
    ...(Array.isArray(entityMedia) ? entityMedia : []),
  ];
  const urls = mediaEntries
    .map((entryValue) => {
      const entry = asRecord(entryValue);
      const mediaType = asString(entry?.type);
      const mediaUrl =
        asString(entry?.media_url_https) ??
        asString(entry?.media_url) ??
        asString(asRecord(entry?.original_info)?.url);

      if (!mediaUrl) {
        return null;
      }

      if (mediaType && mediaType !== "photo") {
        return null;
      }

      return mediaUrl;
    })
    .filter((value): value is string => Boolean(value));

  return uniqueStrings(urls);
}

function extractTweetExpandedUrls(tweetNode: Record<string, unknown>): string[] {
  const legacy = asRecord(tweetNode.legacy);
  const entityUrls = asRecord(legacy?.entities)?.urls;

  return uniqueStrings(
    (Array.isArray(entityUrls) ? entityUrls : []).map((entryValue) => {
      const entry = asRecord(entryValue);
      return (
        asString(entry?.expanded_url) ??
        asString(entry?.expanded ?? asRecord(entry?.expanded_url)?.url) ??
        asString(entry?.url)
      );
    }),
  );
}

function resolvePostLinkSignal(args: {
  rawUrlCount: number;
  expandedUrls: string[];
  imageUrls: string[];
}): XPublicPost["linkSignal"] {
  const hasImages = args.imageUrls.length > 0;
  const hasExpandedUrls = args.expandedUrls.length > 0;
  const hasRawUrls = args.rawUrlCount > 0;

  if (!hasRawUrls && !hasExpandedUrls && !hasImages) {
    return "none";
  }

  if (hasImages && hasExpandedUrls) {
    return "mixed";
  }

  if (hasExpandedUrls) {
    return "external";
  }

  if (hasImages && hasRawUrls) {
    return "media_only";
  }

  return hasRawUrls ? "external" : "none";
}

function buildPinnedPost(
  post: XPublicPost,
  username: string,
  imageUrls: string[] = [],
): XPinnedPost {
  const mergedImageUrls = uniqueStrings([...(post.imageUrls ?? []), ...imageUrls]);
  return {
    ...post,
    url: `https://x.com/${username}/status/${post.id}`,
    imageUrls: mergedImageUrls.length > 0 ? mergedImageUrls : null,
  };
}

function findPostByTweetId(
  nodes: Record<string, unknown>[],
  tweetId: string,
  accountFilter: string | null,
): XPublicPost | null {
  const matchedNode = nodes.find((node) => {
    const legacy = asRecord(node.legacy);
    return (
      asString(legacy?.id_str) === tweetId ||
      asString(node.rest_id) === tweetId ||
      asString(node.id_str) === tweetId ||
      asString(node.id) === tweetId
    );
  });

  if (!matchedNode) {
    return null;
  }

  return extractPostFromTweetNode(matchedNode, accountFilter, {
    includeRetweets: true,
    includeReplies: true,
    includeQuotes: true,
  });
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
  const payloadTweetNodes = collectTweetResultNodesFromPayload(params.payload);

  const postsById = new Map<string, XPublicPost>();
  const fallbackPostsById = new Map<string, XPublicPost>();
  const replyPostsById = new Map<string, XPublicPost>();
  const quotePostsById = new Map<string, XPublicPost>();
  const pinnedPostCandidates = new Map<string, XPublicPost>();
  const pinnedTweetIds = new Set<string>();
  const payloadUserNode = getTopLevelUserResultNode(params.payload);
  const pinnedTimelineTweetNode = findPinnedTimelineTweetNode(params.payload);
  let profileCandidate: XPublicProfile | null = payloadUserNode
    ? extractProfileFromUserNode(payloadUserNode)
    : null;

  for (const pinnedTweetId of payloadUserNode
    ? extractPinnedTweetIdsFromUserNode(payloadUserNode)
    : []) {
    pinnedTweetIds.add(pinnedTweetId);
  }

  for (const node of nodes) {
    const nodeProfile = extractProfileFromTweetNode(node);
    const nodePinnedTweetIds = extractPinnedTweetIdsFromTweetNode(node);
    for (const pinnedTweetId of nodePinnedTweetIds) {
      pinnedTweetIds.add(pinnedTweetId);
    }
    if (nodeProfile) {
      if (!profileCandidate) {
        profileCandidate = nodeProfile;
      }

      if (
        accountNormalized &&
        nodeProfile.username.toLowerCase() === accountNormalized.toLowerCase()
      ) {
        profileCandidate = mergeProfiles(profileCandidate, nodeProfile);
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
    if (fallbackPost && pinnedTweetIds.has(fallbackPost.id) && !pinnedPostCandidates.has(fallbackPost.id)) {
      pinnedPostCandidates.set(fallbackPost.id, fallbackPost);
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

  const hasRecognizedUserTimelinePayload = getTimelineFromPayload(params.payload) !== null;

  if (posts.length === 0 && !hasRecognizedUserTimelinePayload) {
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
      headerImageUrl: null,
      isVerified: false,
      followersCount: 0,
      followingCount: 0,
      createdAt: new Date(0).toISOString(),
    } satisfies XPublicProfile);
  const pinnedTimelinePost = pinnedTimelineTweetNode
    ? extractPostFromTweetNode(pinnedTimelineTweetNode, accountNormalized, {
        includeRetweets: true,
        includeReplies: true,
        includeQuotes: true,
      })
    : null;
  const pinnedPostCandidate = pinnedTimelinePost ?? Array.from(pinnedTweetIds)
    .map(
      (id) =>
        pinnedPostCandidates.get(id) ??
        fallbackPostsById.get(id) ??
        postsById.get(id) ??
        findPostByTweetId(payloadTweetNodes, id, accountNormalized)
    )
    .find((value): value is XPublicPost => Boolean(value));
  const pinnedPostImageUrls = (() => {
    if (!pinnedPostCandidate) {
      return [];
    }

    const pinnedNode =
      pinnedTimelineTweetNode ??
      payloadTweetNodes.find((node) => {
        const legacy = asRecord(node.legacy);
        return (
          asString(legacy?.id_str) === pinnedPostCandidate.id ||
          asString(node.rest_id) === pinnedPostCandidate.id ||
          asString(node.id_str) === pinnedPostCandidate.id ||
          asString(node.id) === pinnedPostCandidate.id
        );
      }) ??
      null;

    return pinnedNode ? extractTweetImageUrls(pinnedNode) : [];
  })();

  return {
    profile: {
      ...profile,
      username: accountNormalized ?? profile.username,
    },
    pinnedPost: pinnedPostCandidate
      ? buildPinnedPost(
          pinnedPostCandidate,
          accountNormalized ?? profile.username,
          pinnedPostImageUrls,
        )
      : null,
    posts,
    replyPosts: sortAndLimitPosts(replyPostsById),
    quotePosts: sortAndLimitPosts(quotePostsById),
  };
}

export function normalizeScrapeAccount(input: string): string | null {
  return normalizeAccountInput(input);
}
