import { NextResponse } from "next/server";

import { runOnboarding } from "@/lib/onboarding/service";
import { persistOnboardingRun } from "@/lib/onboarding/store";
import { parseOnboardingInput } from "@/lib/onboarding/validation";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "account", message: "Request body must be valid JSON." }],
      },
      { status: 400 },
    );
  }

  const parsed = parseOnboardingInput(body);
  if (!parsed.ok) {
    return NextResponse.json(parsed, { status: 400 });
  }

  const result = await runOnboarding(parsed.data);
  const persisted = await persistOnboardingRun({
    input: parsed.data,
    result,
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json(
    {
      ok: true,
      runId: persisted.runId,
      persistedAt: persisted.persistedAt,
      data: result,
    },
    { status: 200 },
  );
}
