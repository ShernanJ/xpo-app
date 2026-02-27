import { NextResponse } from "next/server";

import {
  normalizeScrapeAccount,
  parseUserTweetsGraphqlPayload,
} from "@/lib/onboarding/scrapeUserTweetsParser";
import { persistScrapeCapture } from "@/lib/onboarding/scrapeStore";

interface ScrapeImportBody {
  account?: unknown;
  payload?: unknown;
  source?: unknown;
}

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

export async function POST(request: Request) {
  let body: ScrapeImportBody;

  try {
    body = (await request.json()) as ScrapeImportBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "payload", message: "Request body must be valid JSON." }],
      },
      { status: 400 },
    );
  }

  const payloadInput =
    body.payload !== undefined
      ? body.payload
      : looksLikeUserTweetsPayload(body)
        ? body
        : undefined;

  if (payloadInput === undefined) {
    return NextResponse.json(
      {
        ok: false,
        errors: [
          {
            field: "payload",
            message: "payload is required (or send the raw UserTweets response as body).",
          },
        ],
      },
      { status: 400 },
    );
  }

  let payload: unknown = payloadInput;
  if (typeof payloadInput === "string") {
    try {
      payload = JSON.parse(payloadInput);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          errors: [{ field: "payload", message: "payload string must be valid JSON." }],
        },
        { status: 400 },
      );
    }
  }

  const accountRaw = typeof body.account === "string" ? body.account : "";
  const account = normalizeScrapeAccount(accountRaw);

  let parsed: ReturnType<typeof parseUserTweetsGraphqlPayload>;
  try {
    parsed = parseUserTweetsGraphqlPayload({
      payload,
      account: account ?? undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid scrape payload.";
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "payload", message }],
      },
      { status: 400 },
    );
  }

  const normalizedParsedAccount = normalizeScrapeAccount(parsed.profile.username);
  const resolvedAccount = account ?? normalizedParsedAccount;
  if (!resolvedAccount) {
    return NextResponse.json(
      {
        ok: false,
        errors: [
          {
            field: "account",
            message:
              "Provide @username, username, or x.com/username (or include a parseable username in payload).",
          },
        ],
      },
      { status: 400 },
    );
  }

  const source = body.source === "agent" ? "agent" : "manual_import";
  const persisted = await persistScrapeCapture({
    account: resolvedAccount,
    profile: parsed.profile,
    posts: parsed.posts,
    source,
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json(
    {
      ok: true,
      captureId: persisted.captureId,
      capturedAt: persisted.capturedAt,
      account: resolvedAccount,
      profile: parsed.profile,
      postsImported: parsed.posts.length,
    },
    { status: 200 },
  );
}
