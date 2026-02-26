import { NextResponse } from "next/server";

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

  const result = parseOnboardingInput(body);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(
    {
      ok: true,
      data: result.data,
      validatedAt: new Date().toISOString(),
    },
    { status: 200 },
  );
}
