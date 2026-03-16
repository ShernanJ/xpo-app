import { NextResponse } from "next/server";

import { buildCreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";
import { buildCreatorGenerationContract } from "@/lib/onboarding/contracts/generationContract";
import { buildGrowthOperatingSystemPayload } from "@/lib/onboarding/strategy/contextEnrichment";
import {
  applyCreatorToneOverrides,
  applyCreatorStrategyOverrides,
  extractCreatorToneOverrides,
  extractCreatorStrategyOverrides,
} from "@/lib/onboarding/strategy/strategyOverrides";
import { readLatestOnboardingRunByHandle } from "@/lib/onboarding/store/onboardingRunStore";
import { getServerSession } from "@/lib/auth/serverSession";
import { resolveWorkspaceHandleForRequest } from "@/lib/workspaceHandle.server";
import {
  enforceSessionMutationRateLimit,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

interface CreatorGenerationContractRequest extends Record<string, unknown> {
  runId?: unknown;
}

export async function POST(request: Request) {
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
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

  const rateLimitError = await enforceSessionMutationRateLimit(request, {
    userId: session.user.id,
    scope: "creator:generation_contract",
    user: {
      limit: 20,
      windowMs: 5 * 60 * 1000,
      message: "Too many generation contract requests. Please wait before trying again.",
    },
    ip: {
      limit: 50,
      windowMs: 5 * 60 * 1000,
      message: "Too many generation contract requests from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  const bodyResult = await parseJsonBody<CreatorGenerationContractRequest>(request, {
    maxBytes: 16 * 1024,
    field: "runId",
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }
  const body = bodyResult.value;

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

  const onboarding = applyCreatorStrategyOverrides({
    onboarding: storedRun.result,
    overrides: extractCreatorStrategyOverrides(body),
  });
  const tonePreference = applyCreatorToneOverrides({
    baseTone: storedRun.input.tone,
    overrides: extractCreatorToneOverrides(body),
  });
  const agentContext = buildCreatorAgentContext({
    runId: storedRun.runId,
    onboarding,
  });
  const growthOs = await buildGrowthOperatingSystemPayload({
    userId: session.user.id,
    xHandle: workspaceHandle.xHandle,
    onboarding,
    context: agentContext,
  });

  return NextResponse.json(
    {
      ok: true,
      data: buildCreatorGenerationContract({
        runId: storedRun.runId,
        onboarding,
        tonePreference,
        agentContext,
        replyInsights: growthOs.replyInsights,
        strategyAdjustments: growthOs.strategyAdjustments,
        contentInsights: growthOs.contentInsights,
        contentAdjustments: growthOs.contentAdjustments,
      }),
    },
    { status: 200 },
  );
}
