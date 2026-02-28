import {
  normalizeScrapeAccount,
  parseUserTweetsGraphqlPayload,
} from "./scrapeUserTweetsParser";
import { persistScrapeCapture } from "./scrapeStore";

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
  if (!userResult) {
    return false;
  }

  const timeline = asRecord(asRecord(userResult.timeline)?.timeline);
  const timelineV2 = asRecord(asRecord(userResult.timeline_v2)?.timeline);

  return Boolean(timeline || timelineV2);
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
  source?: ScrapeImportSource;
  userAgent: string | null;
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

  const normalizedParsedAccount = normalizeScrapeAccount(parsed.profile.username);
  const resolvedAccount = account ?? normalizedParsedAccount;
  if (!resolvedAccount) {
    throw new Error(
      "Provide @username, username, or x.com/username (or include a parseable username in payload).",
    );
  }

  const persisted = await persistScrapeCapture({
    account: resolvedAccount,
    profile: parsed.profile,
    posts: parsed.posts,
    replyPosts: parsed.replyPosts,
    source: mapPersistSource(params.source ?? "manual_import"),
    userAgent: params.userAgent,
  });

  return {
    captureId: persisted.captureId,
    capturedAt: persisted.capturedAt,
    account: resolvedAccount,
    profile: parsed.profile,
    postsImported: parsed.posts.length,
    replyPostsImported: parsed.replyPosts.length,
  };
}
