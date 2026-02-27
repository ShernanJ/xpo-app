import { NextResponse } from "next/server";

import { normalizeScrapeAccount } from "@/lib/onboarding/scrapeUserTweetsParser";
import { readLatestScrapeCaptureByAccount } from "@/lib/onboarding/scrapeStore";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountRaw = searchParams.get("account") ?? "";
  const account = normalizeScrapeAccount(accountRaw);

  if (!account) {
    return NextResponse.json(
      {
        ok: false,
        errors: [
          {
            field: "account",
            message: "Provide account query param: @username, username, or x.com/username.",
          },
        ],
      },
      { status: 400 },
    );
  }

  const capture = await readLatestScrapeCaptureByAccount(account);
  if (!capture) {
    return NextResponse.json(
      {
        ok: false,
        errors: [
          {
            field: "account",
            message: `No scrape capture found for @${account}.`,
          },
        ],
      },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      capture: {
        captureId: capture.captureId,
        capturedAt: capture.capturedAt,
        account: capture.account,
        profile: capture.profile,
        postsImported: capture.posts.length,
        recentPosts: capture.posts.slice(0, 5),
      },
    },
    { status: 200 },
  );
}
