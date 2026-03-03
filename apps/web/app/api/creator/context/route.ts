import { NextResponse } from "next/server";

import { buildCreatorAgentContext } from "@/lib/onboarding/agentContext";
import {
  applyCreatorStrategyOverrides,
  extractCreatorStrategyOverrides,
} from "@/lib/onboarding/strategyOverrides";
import { readLatestOnboardingRunByHandle } from "@/lib/onboarding/store";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";

interface CreatorAgentContextRequest extends Record<string, unknown> {
  runId?: unknown;
}

export async function POST(request: Request) {
  let body: CreatorAgentContextRequest;

  try {
    body = (await request.json()) as CreatorAgentContextRequest;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "runId", message: "Request body must be valid JSON." }],
      },
      { status: 400 },
    );
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session?.user?.activeXHandle) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "auth", message: "Unauthorized or no active handle selected." }],
      },
      { status: 401 },
    );
  }

  const storedRun = await readLatestOnboardingRunByHandle(session.user.id, session.user.activeXHandle);
  if (!storedRun) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "auth", message: "No onboarding run found for this handle." }],
      },
      { status: 404 },
    );
  }

  const onboarding = applyCreatorStrategyOverrides({
    onboarding: storedRun.result,
    overrides: extractCreatorStrategyOverrides(body),
  });

  return NextResponse.json(
    {
      ok: true,
      data: buildCreatorAgentContext({
        runId: storedRun.runId,
        onboarding,
      }),
    },
    { status: 200 },
  );
}
