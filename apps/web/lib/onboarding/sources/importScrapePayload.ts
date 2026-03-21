import {
  normalizeScrapeAccount,
  parseUserTweetsGraphqlPayload,
} from "./scrapeUserTweetsParser";
import { persistScrapeCapture } from "../store/scrapeCaptureStore";

type ScrapeImportSource = "manual_import" | "agent" | "bootstrap";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function looksLikeUserTweetsPayload(value: unknown): boolean {
  const root = asRecord(value);
  const data = asRecord(root?.data);
  const user = asRecord(data?.user);
  const userResult = asRecord(user?.result);
  const timeline = asRecord(asRecord(userResult?.timeline)?.timeline);
  const timelineV2 = asRecord(asRecord(userResult?.timeline_v2)?.timeline);
  if (timeline || timelineV2) {
    return true;
  }

  const searchByRawQuery = asRecord(data?.search_by_raw_query);
  const searchTimeline = asRecord(asRecord(searchByRawQuery?.search_timeline)?.timeline);
  return Boolean(searchTimeline);
}

function mapPersistSource(source: ScrapeImportSource): "manual_import" | "agent" {
  if (source === "manual_import") {
    return "manual_import";
  }

  return "agent";
}

export async function importUserTweetsPayload(params: {
  account?: string | null;
  payload: unknown;
  captureState?: unknown;
  profileOverride?: unknown;
  pinnedPostOverride?: unknown;
  source?: ScrapeImportSource;
  userAgent: string | null;
  mergeWithExisting?: boolean;
}) {
  const payloadInput =
    params.payload !== undefined
      ? params.payload
      : looksLikeUserTweetsPayload(params)
        ? params
        : undefined;

  if (payloadInput === undefined) {
    throw new Error(
      "payload is required (or send the raw UserTweets response as body).",
    );
  }

  let payload: unknown = payloadInput;
  if (typeof payloadInput === "string") {
    try {
      payload = JSON.parse(payloadInput);
    } catch {
      throw new Error("payload string must be valid JSON.");
    }
  }

  const account = normalizeScrapeAccount(params.account ?? "");

  const parsed = parseUserTweetsGraphqlPayload({
    payload,
    account: account ?? undefined,
  });
  const profile =
    params.profileOverride &&
    typeof params.profileOverride === "object" &&
    !Array.isArray(params.profileOverride)
      ? params.profileOverride
      : parsed.profile;
  const pinnedPost =
    params.pinnedPostOverride &&
    typeof params.pinnedPostOverride === "object" &&
    !Array.isArray(params.pinnedPostOverride)
      ? params.pinnedPostOverride
      : parsed.pinnedPost;

  const normalizedParsedAccount = normalizeScrapeAccount(
    (profile as { username?: string }).username ?? parsed.profile.username,
  );
  const resolvedAccount = account ?? normalizedParsedAccount;
  if (!resolvedAccount) {
    throw new Error(
      "Provide @username, username, or x.com/username (or include a parseable username in payload).",
    );
  }

  const persisted = await persistScrapeCapture({
    account: resolvedAccount,
    profile: profile as never,
    pinnedPost: pinnedPost as never,
    posts: parsed.posts,
    replyPosts: parsed.replyPosts,
    quotePosts: parsed.quotePosts,
    captureState:
      params.captureState &&
      typeof params.captureState === "object" &&
      !Array.isArray(params.captureState)
        ? (params.captureState as never)
        : undefined,
    source: mapPersistSource(params.source ?? "manual_import"),
    userAgent: params.userAgent,
    mergeWithExisting: params.mergeWithExisting,
  });

  return {
    captureId: persisted.captureId,
    capturedAt: persisted.capturedAt,
    account: resolvedAccount,
    profile,
    pinnedPost,
    postsImported: parsed.posts.length,
    replyPostsImported: parsed.replyPosts.length,
    quotePostsImported: parsed.quotePosts.length,
  };
}
