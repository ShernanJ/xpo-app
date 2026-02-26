import { NextResponse } from "next/server";

import { runMockOnboarding } from "@/lib/onboarding/service";
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

  const result = runMockOnboarding(parsed.data);

  return NextResponse.json(
    {
      ok: true,
      data: result,
    },
    { status: 200 },
  );
}
