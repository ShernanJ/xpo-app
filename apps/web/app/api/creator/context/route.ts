import { NextResponse } from "next/server";

import { buildCreatorAgentContext } from "@/lib/onboarding/agentContext";
import { buildGrowthOperatingSystemPayload } from "@/lib/onboarding/contextEnrichment";
import { hydrateOnboardingProfile } from "@/lib/onboarding/profile/profileHydration";
import {
  applyCreatorStrategyOverrides,
  extractCreatorStrategyOverrides,
} from "@/lib/onboarding/strategyOverrides";
import { readLatestOnboardingRunByHandle } from "@/lib/onboarding/store";
import { getServerSession } from "@/lib/auth/serverSession";
import { resolveWorkspaceHandleForRequest } from "@/lib/workspaceHandle.server";

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

  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "auth", message: "Unauthorized" }],
      },
      { status: 401 },
    );
  }

  const workspaceHandle = await resolveWorkspaceHandleForRequest({
    request,
    session,
  });
  if (!workspaceHandle.ok) {
    return workspaceHandle.response;
  }

  const storedRun = await readLatestOnboardingRunByHandle(session.user.id, workspaceHandle.xHandle);
  if (!storedRun) {
    return NextResponse.json(
      {
        ok: false,
        code: "MISSING_ONBOARDING_RUN",
        errors: [{ field: "auth", message: "No onboarding run found for this handle." }],
      },
      { status: 404 },
    );
  }

  const allowMockFallback =
    process.env.ONBOARDING_ALLOW_MOCK_FALLBACK?.trim() === "1" ||
    process.env.NODE_ENV !== "production";
  if (!allowMockFallback && storedRun.result.source === "mock") {
    return NextResponse.json(
      {
        ok: false,
        code: "ONBOARDING_SOURCE_INVALID",
        errors: [
          {
            field: "auth",
            message:
              "This account was set up with fallback data. Re-run onboarding after configuring scrape credentials.",
          },
        ],
      },
      { status: 409 },
    );
  }

  const onboarding = await hydrateOnboardingProfile(
    applyCreatorStrategyOverrides({
      onboarding: storedRun.result,
      overrides: extractCreatorStrategyOverrides(body),
    }),
  );
  const context = buildCreatorAgentContext({
    runId: storedRun.runId,
    onboarding,
  });
  const growthOs = await buildGrowthOperatingSystemPayload({
    userId: session.user.id,
    xHandle: workspaceHandle.xHandle,
    onboarding,
    context,
  });

  return NextResponse.json(
    {
      ok: true,
      data: {
        ...context,
        ...growthOs,
        unknowns: growthOs.unknowns,
      },
    },
    { status: 200 },
  );
}
