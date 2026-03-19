import { NextRequest, NextResponse } from "next/server.js";

import { Prisma } from "../../../../lib/generated/prisma/client.ts";
import { prisma } from "../../../../lib/db.ts";
import { authenticateExtensionRequest } from "../../../../lib/extension/auth.ts";
import { loadExtensionUserContext } from "../../../../lib/extension/context.ts";
import {
  buildExtensionBadRequestResponse,
  buildExtensionUnauthorizedResponse,
  logExtensionRouteFailure,
} from "../../../../lib/extension/http.ts";
import {
  mergeStoredOpportunityNotes,
  serializeStoredOpportunity,
} from "../../../../lib/extension/opportunityBatch.ts";
import {
  buildExtensionReplyOptions,
  prepareExtensionReplyOptionsPolicy,
} from "../../../../lib/extension/replyOptions.ts";
import { getReplyInsightsForUser } from "../../../../lib/extension/replyOpportunities.ts";
import { recordProductEvent } from "../../../../lib/productEvents.ts";
import {
  assertExtensionReplyOptionsResponseShape,
  parseExtensionReplyOptionsRequest,
} from "./route.logic.ts";

function buildContextErrorResponse(args: {
  status: number;
  field: string;
  message: string;
}) {
  return NextResponse.json(
    { ok: false, errors: [{ field: args.field, message: args.message }] },
    { status: args.status },
  );
}

export async function POST(request: NextRequest) {
  const auth = await authenticateExtensionRequest(request);
  if (!auth?.user?.id) {
    return buildExtensionUnauthorizedResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return buildExtensionBadRequestResponse("body", "Request body must be valid JSON.");
  }

  const parsed = parseExtensionReplyOptionsRequest(body);
  if (!parsed.ok) {
    return buildExtensionBadRequestResponse("body", parsed.message);
  }

  const userContext = await loadExtensionUserContext({
    userId: auth.user.id,
    activeXHandle: auth.user.activeXHandle,
  });
  if (!userContext.ok) {
    return buildContextErrorResponse(userContext);
  }

  const record = await prisma.replyOpportunity.findFirst({
    where: {
      id: parsed.data.opportunityId,
      userId: auth.user.id,
      xHandle: userContext.xHandle,
    },
  });

  if (!record) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "opportunityId", message: "Reply opportunity was not found." }] },
      { status: 404 },
    );
  }

  if (
    parsed.data.opportunity.opportunityId !== parsed.data.opportunityId ||
    parsed.data.post.postId !== record.tweetId ||
    parsed.data.opportunity.postId !== record.tweetId ||
    parsed.data.post.url !== record.tweetUrl
  ) {
    return buildExtensionBadRequestResponse(
      "opportunityId",
      "Reply opportunity request does not match the persisted opportunity.",
    );
  }

  const persistedOpportunity = serializeStoredOpportunity(record);
  if (!persistedOpportunity) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "opportunityId", message: "Persisted opportunity metadata is incomplete." }] },
      { status: 409 },
    );
  }

  if (persistedOpportunity.verdict === "dont_reply") {
    return buildExtensionBadRequestResponse(
      "opportunityId",
      "This opportunity was scored as dont_reply and cannot generate reply options.",
    );
  }

  try {
    const replyInsights = await getReplyInsightsForUser({
      userId: auth.user.id,
      xHandle: userContext.xHandle,
    });
    const { preflightResult, policy } = await prepareExtensionReplyOptionsPolicy({
      post: parsed.data.post,
      strategy: userContext.context.growthStrategySnapshot,
    });
    const response = buildExtensionReplyOptions({
      post: parsed.data.post,
      opportunity: persistedOpportunity,
      strategy: userContext.context.growthStrategySnapshot,
      strategyPillar:
        record.strategyPillar ||
        userContext.context.growthStrategySnapshot.contentPillars[0] ||
        userContext.context.growthStrategySnapshot.knownFor,
      styleCard: userContext.styleCard,
      stage: record.stage,
      tone: record.tone,
      goal: record.goal,
      replyInsights,
      preflightResult,
      policy,
    });

    if (!assertExtensionReplyOptionsResponseShape(response)) {
      logExtensionRouteFailure({
        route: "reply-options",
        userId: auth.user.id,
        error: new Error("Generated invalid reply options response."),
      });
      return NextResponse.json(
        { ok: false, errors: [{ field: "response", message: "Generated invalid reply options response." }] },
        { status: 500 },
      );
    }

    const nextNotes = mergeStoredOpportunityNotes(record, {
      analytics: {
        lastLoggedEvent: "generated",
        generatedReplyIds: response.options.map((option) => option.id),
        generatedReplyLabels: response.options.map((option) => option.label),
        generatedReplyIntents: response.options
          .map((option) => option.intent)
          .filter(
            (
              intent,
            ): intent is NonNullable<(typeof response.options)[number]["intent"]> => Boolean(intent),
          )
          .map((intent) => ({
            label: intent.label,
            strategyPillar: intent.strategyPillar,
            anchor: intent.anchor,
            rationale: intent.rationale,
          })),
      },
    });

    await prisma.replyOpportunity.update({
      where: { id: record.id },
      data: {
        generatedOptions: response.options as unknown as Prisma.InputJsonArray,
        generatedAngleLabel: persistedOpportunity.suggestedAngle,
        state: "generated",
        generatedAt: new Date(),
        notes: nextNotes as unknown as Prisma.InputJsonObject,
      },
    });

    void recordProductEvent({
      userId: auth.user.id,
      xHandle: userContext.xHandle,
      eventType: "extension_reply_options_generated",
      properties: {
        opportunityId: record.id,
        postId: record.tweetId,
        optionCount: response.options.length,
        verdict: persistedOpportunity.verdict,
        suggestedAngle: persistedOpportunity.suggestedAngle,
      },
    }).catch((error) =>
      logExtensionRouteFailure({
        route: "reply-options",
        userId: auth.user.id,
        error,
        details: { eventType: "extension_reply_options_generated" },
      }),
    );

    return NextResponse.json(response);
  } catch (error) {
    logExtensionRouteFailure({
      route: "reply-options",
      userId: auth.user.id,
      error,
      details: {
        opportunityId: parsed.data.opportunityId,
        postId: parsed.data.post.postId,
      },
    });

    return NextResponse.json(
      { ok: false, errors: [{ field: "server", message: "Failed to generate reply options." }] },
      { status: 500 },
    );
  }
}
