import { NextResponse } from "next/server";

import { importUserTweetsPayload } from "@/lib/onboarding/sources/importScrapePayload";

interface ScrapeImportBody {
  account?: unknown;
  payload?: unknown;
  source?: unknown;
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

  try {
    const imported = await importUserTweetsPayload({
      account: typeof body.account === "string" ? body.account : null,
      payload:
        body.payload !== undefined
          ? body.payload
          : body,
      source: body.source === "agent" ? "agent" : "manual_import",
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json(
      {
        ok: true,
        ...imported,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid scrape payload.";
    const field = message.toLowerCase().includes("account") ? "account" : "payload";

    return NextResponse.json(
      {
        ok: false,
        errors: [{ field, message }],
      },
      { status: 400 },
    );
  }
}
