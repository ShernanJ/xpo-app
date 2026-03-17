import { NextResponse } from "next/server";

import { buildGuestOnboardingAnalysis } from "@/lib/onboarding/guestAnalysis";
import { normalizeAccountInput } from "@/lib/onboarding/contracts/validation";
import { resolveOnboardingProfilePreview } from "@/lib/onboarding/profile/profilePreview";
import { readLatestScrapeCaptureByAccount } from "@/lib/onboarding/store/scrapeCaptureStore";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawAccount = searchParams.get("account") ?? "";
  const account = normalizeAccountInput(rawAccount);

  if (!account) {
    return NextResponse.json(
      {
        ok: false,
        errors: [
          {
            field: "account",
            message: "Provide @username, username, or x.com/username.",
          },
        ],
      },
      { status: 400 },
    );
  }

  try {
    const [preview, latestCapture] = await Promise.all([
      resolveOnboardingProfilePreview(account),
      readLatestScrapeCaptureByAccount(account),
    ]);
    const profile = preview.profile ?? latestCapture?.profile ?? null;

    if (!profile) {
      return NextResponse.json(
        {
          ok: false,
          errors: [
            {
              field: "account",
              message: `No onboarding analysis is available for @${account}.`,
            },
          ],
        },
        { status: 404 },
      );
    }

    const analysis = buildGuestOnboardingAnalysis({
      profile,
      source: preview.source,
      pinnedPost: latestCapture?.pinnedPost ?? null,
      recentPosts: latestCapture?.posts ?? [],
    });

    return NextResponse.json(
      {
        ok: true,
        account,
        analysis,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        errors: [
          {
            field: "account",
            message: "Failed to build the onboarding analysis preview.",
          },
        ],
      },
      { status: 500 },
    );
  }
}
