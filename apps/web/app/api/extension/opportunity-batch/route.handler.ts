import type { ExtensionOpportunityBatchRequest } from "../../../../lib/extension/types.ts";

interface ExtensionAuthResult {
  user: {
    id: string;
    activeXHandle?: string | null;
  };
}

interface ExtensionUserContextSuccess {
  ok: true;
  xHandle: string;
  styleCard: unknown;
  storedRun: {
    result: {
      growthStage?: string;
      strategyState?: {
        growthStage?: string;
        goal?: string;
      };
    };
  };
  context: {
    growthStrategySnapshot: unknown;
  };
}

interface ExtensionUserContextFailure {
  ok: false;
  status: number;
  field: string;
  message: string;
}

interface RankedOpportunityBatch {
  scores: Array<{
    tweetId: string;
    opportunityScore: number;
    reason: string;
  }>;
}

interface OpportunityBatchHandlerDeps {
  authenticateExtensionRequest(request: Request): Promise<ExtensionAuthResult | null>;
  parseExtensionOpportunityBatchRequest(body: unknown):
    | { ok: true; data: ExtensionOpportunityBatchRequest }
    | { ok: false; message: string };
  loadExtensionUserContext(args: {
    userId: string;
    activeXHandle: string | null | undefined;
  }): Promise<ExtensionUserContextSuccess | ExtensionUserContextFailure>;
  getReplyInsightsForUser(args: {
    userId: string;
    xHandle?: string | null;
  }): Promise<unknown>;
  scoreOpportunityBatch(args: {
    request: ExtensionOpportunityBatchRequest;
    strategy: unknown;
    replyInsights?: unknown;
    growthStage: string;
    goal: string;
  }): Promise<RankedOpportunityBatch>;
  assertExtensionOpportunityBatchResponseShape(response: unknown): boolean;
  recordProductEvent(args: {
    userId: string;
    xHandle: string;
    eventType: string;
    properties: Record<string, unknown>;
  }): Promise<void>;
  logExtensionRouteFailure(args: {
    route: string;
    userId?: string | null;
    error: unknown;
    details?: Record<string, unknown>;
  }): void;
}

function jsonError(status: number, field: string, message: string) {
  return Response.json(
    { ok: false, errors: [{ field, message }] },
    { status },
  );
}

export async function handleExtensionOpportunityBatchPost(
  request: Request,
  deps: OpportunityBatchHandlerDeps,
) {
  const auth = await deps.authenticateExtensionRequest(request);
  if (!auth?.user?.id) {
    return jsonError(401, "auth", "Unauthorized");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "body", "Request body must be valid JSON.");
  }

  const parsed = deps.parseExtensionOpportunityBatchRequest(body);
  if (!parsed.ok) {
    return jsonError(400, "body", parsed.message);
  }

  const userContext = await deps.loadExtensionUserContext({
    userId: auth.user.id,
    activeXHandle: auth.user.activeXHandle,
  });
  if (!userContext.ok) {
    return jsonError(userContext.status, userContext.field, userContext.message);
  }

  try {
    const replyInsights = await deps.getReplyInsightsForUser({
      userId: auth.user.id,
      xHandle: userContext.xHandle,
    });
    const growthStage =
      userContext.storedRun.result.strategyState?.growthStage ||
      userContext.storedRun.result.growthStage ||
      "0-1k";
    const goal = userContext.storedRun.result.strategyState?.goal || "followers";
    const response = await deps.scoreOpportunityBatch({
      request: parsed.data,
      strategy: userContext.context.growthStrategySnapshot,
      replyInsights,
      growthStage,
      goal,
    });

    if (!deps.assertExtensionOpportunityBatchResponseShape(response)) {
      deps.logExtensionRouteFailure({
        route: "opportunity-batch",
        userId: auth.user.id,
        error: new Error("Generated invalid opportunity batch response."),
      });
      return jsonError(500, "response", "Generated invalid opportunity batch response.");
    }

    void deps.recordProductEvent({
      userId: auth.user.id,
      xHandle: userContext.xHandle,
      eventType: "extension_opportunity_batch_ranked",
      properties: {
        candidateCount: parsed.data.candidates.length,
        returnedCount: response.scores.length,
        pageUrl: parsed.data.pageUrl,
        surface: parsed.data.surface,
      },
    }).catch((error) =>
      deps.logExtensionRouteFailure({
        route: "opportunity-batch",
        userId: auth.user.id,
        error,
        details: { eventType: "extension_opportunity_batch_ranked" },
      }),
    );

    return Response.json(response);
  } catch (error) {
    deps.logExtensionRouteFailure({
      route: "opportunity-batch",
      userId: auth.user.id,
      error,
      details: {
        pageUrl: parsed.data.pageUrl,
        candidateCount: parsed.data.candidates.length,
      },
    });

    return jsonError(500, "server", "Failed to score extension opportunities.");
  }
}
