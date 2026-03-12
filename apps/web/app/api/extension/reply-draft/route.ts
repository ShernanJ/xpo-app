import { NextRequest, NextResponse } from "next/server";

import { authenticateExtensionRequest } from "@/lib/extension/auth";
import { buildExtensionReplyDraft } from "@/lib/extension/replyDraft";
import {
  buildStrategyAdjustments,
  getReplyInsightsForUser,
  upsertReplyOpportunityLifecycle,
} from "@/lib/extension/replyOpportunities";
import { recordProductEvent } from "@/lib/productEvents";
import { buildCreatorAgentContext } from "@/lib/onboarding/agentContext";
import { readLatestOnboardingRunByHandle } from "@/lib/onboarding/store";
import {
  assertExtensionReplyDraftResponseShape,
  parseExtensionReplyDraftRequest,
} from "./route.logic";

export async function POST(request: NextRequest) {
  const auth = await authenticateExtensionRequest(request);
  if (!auth?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] },
      { status: 400 },
    );
  }

  const parsed = parseExtensionReplyDraftRequest(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: parsed.message }] },
      { status: 400 },
    );
  }

  const activeHandle = auth.user.activeXHandle?.trim().replace(/^@+/, "").toLowerCase() || "";
  if (!activeHandle) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "profile", message: "No active X handle is connected for this token." }],
      },
      { status: 409 },
    );
  }

  const storedRun = await readLatestOnboardingRunByHandle(auth.user.id, activeHandle);
  if (!storedRun) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "profile", message: "No onboarding context found for the active handle." }],
      },
      { status: 404 },
    );
  }

  const context = buildCreatorAgentContext({
    runId: storedRun.runId,
    onboarding: storedRun.result,
  });
  const replyInsights = await getReplyInsightsForUser({
    userId: auth.user.id,
    xHandle: activeHandle,
  });
  const strategyAdjustments = buildStrategyAdjustments({
    strategySnapshot: context.growthStrategySnapshot,
    replyInsights,
  });
  const generated = buildExtensionReplyDraft({
    request: parsed.data,
    strategy: context.growthStrategySnapshot,
  });
  const response = {
    ...generated.response,
    notes: [
      ...(generated.response.notes || []),
      ...replyInsights.bestSignals.slice(0, 1),
      ...strategyAdjustments.experiments.slice(0, 1),
    ].slice(0, 4),
  };

  if (!assertExtensionReplyDraftResponseShape(response)) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "response", message: "Generated invalid reply option shape." }] },
      { status: 500 },
    );
  }

  await upsertReplyOpportunityLifecycle({
    userId: auth.user.id,
    xHandle: activeHandle,
    tweetId: parsed.data.tweetId,
    tweetText: parsed.data.tweetText,
    authorHandle: parsed.data.authorHandle,
    tweetUrl: parsed.data.tweetUrl,
    stage: parsed.data.stage,
    tone: parsed.data.tone,
    goal: parsed.data.goal,
    eventType: "generated",
    heuristicScore: parsed.data.heuristicScore,
    heuristicTier: parsed.data.heuristicTier,
    strategyPillar: generated.strategyPillar,
    generatedAngleLabel: generated.angleLabel,
    generatedOptions: response.options,
    notes: response.notes || [],
  });

  void recordProductEvent({
    userId: auth.user.id,
    xHandle: activeHandle,
    eventType: "extension_reply_generated",
    properties: {
      tweetId: parsed.data.tweetId,
      stage: parsed.data.stage,
      tone: parsed.data.tone,
      goal: parsed.data.goal,
      strategyPillar: generated.strategyPillar,
      angleLabel: generated.angleLabel,
      positioningConfidence: context.growthStrategySnapshot.confidence.positioning,
    },
  }).catch((error) => console.error("Failed to record extension reply generation:", error));

  return NextResponse.json(response);
}
