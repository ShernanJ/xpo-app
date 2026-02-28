import { NextResponse } from "next/server";

import { resolveOnboardingProfilePreview } from "@/lib/onboarding/profilePreview";
import { normalizeAccountInput } from "@/lib/onboarding/validation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawAccount = searchParams.get("account") ?? "";
  const debug = searchParams.get("debug") === "1";
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
    const preview = await resolveOnboardingProfilePreview(account);

    return NextResponse.json(
      {
        ok: true,
        account,
        preview: preview.profile,
        source: preview.source,
        ...(debug ? { attempts: preview.attempts } : {}),
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        ok: true,
        account,
        preview: null,
        source: "none",
        ...(debug
          ? {
              attempts: [
                {
                  source: "html",
                  status: "error",
                  detail: "route_failed",
                },
              ],
            }
          : {}),
      },
      { status: 200 },
    );
  }
}
