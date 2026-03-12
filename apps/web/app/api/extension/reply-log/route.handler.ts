import type { ReplyOpportunity } from "../../../../lib/generated/prisma/client.ts";

interface ExtensionAuthResult {
  user: {
    id: string;
    activeXHandle?: string | null;
  };
}

interface ReplyLogRequest {
  event: string;
  opportunityId?: string | null;
  postId: string;
  postText: string;
  postUrl: string;
  authorHandle: string;
  surface: string;
  verdict?: string | null;
  angle?: string | null;
  expectedValue?: unknown;
  riskFlags?: string[] | null;
  source?: string | null;
  generatedReplyIds?: string[] | null;
  generatedReplyLabels?: string[] | null;
  generatedReplyIntents?: Array<{
    label: string;
    strategyPillar: string;
    anchor: string;
    rationale: string;
  }> | null;
  copiedReplyId?: string | null;
  copiedReplyLabel?: string | null;
  copiedReplyText?: string | null;
  copiedReplyIntent?: {
    label: string;
    strategyPillar: string;
    anchor: string;
    rationale: string;
  } | null;
}

type ReplyOpportunityRecord = ReplyOpportunity;

interface ReplyLogHandlerDeps {
  authenticateExtensionRequest(request: Request): Promise<ExtensionAuthResult | null>;
  parseExtensionReplyLogRequest(body: unknown):
    | { ok: true; data: ReplyLogRequest }
    | { ok: false; message: string };
  findReplyOpportunity(args: {
    opportunityId?: string | null;
    userId: string;
    postId: string;
  }): Promise<ReplyOpportunityRecord | null>;
  mergeStoredOpportunityNotes(record: ReplyOpportunityRecord, patch: Record<string, unknown>): unknown;
  updateReplyOpportunity(args: {
    id: string;
    data: Record<string, unknown>;
  }): Promise<void>;
  recordProductEvent(args: {
    userId: string;
    xHandle: string | null;
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

function getLifecycleUpdate(event: string) {
  const now = new Date();

  if (event === "generated") {
    return { state: "generated", generatedAt: now };
  }
  if (event === "selected") {
    return { state: "selected", selectedAt: now };
  }
  if (event === "copied") {
    return { state: "copied", copiedAt: now };
  }
  if (event === "posted") {
    return { state: "posted", postedAt: now };
  }
  if (event === "dismissed") {
    return { state: "dismissed", dismissedAt: now };
  }
  if (event === "observed") {
    return { state: "observed", observedAt: now };
  }

  return { state: "ranked" };
}

function jsonError(status: number, field: string, message: string) {
  return Response.json(
    { ok: false, errors: [{ field, message }] },
    { status },
  );
}

export async function handleExtensionReplyLogPost(
  request: Request,
  deps: ReplyLogHandlerDeps,
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

  const parsed = deps.parseExtensionReplyLogRequest(body);
  if (!parsed.ok) {
    return jsonError(400, "body", parsed.message);
  }

  try {
    const existing = await deps.findReplyOpportunity({
      opportunityId: parsed.data.opportunityId,
      userId: auth.user.id,
      postId: parsed.data.postId,
    });

    if (existing) {
      const lifecycleUpdate = getLifecycleUpdate(parsed.data.event);
      const nextNotes = deps.mergeStoredOpportunityNotes(existing, {
        verdict: parsed.data.verdict ?? undefined,
        riskFlags: parsed.data.riskFlags ?? undefined,
        expectedValue: parsed.data.expectedValue ?? undefined,
        suggestedAngle: parsed.data.angle ?? undefined,
        analytics: {
          surface: parsed.data.surface,
          source: parsed.data.source ?? null,
          generatedReplyIds: parsed.data.generatedReplyIds ?? undefined,
          generatedReplyLabels: parsed.data.generatedReplyLabels ?? undefined,
          generatedReplyIntents: parsed.data.generatedReplyIntents ?? undefined,
          copiedReplyId: parsed.data.copiedReplyId ?? null,
          copiedReplyLabel: parsed.data.copiedReplyLabel ?? null,
          copiedReplyText: parsed.data.copiedReplyText ?? null,
          copiedReplyIntent: parsed.data.copiedReplyIntent ?? null,
          lastLoggedEvent: parsed.data.event,
        },
      });

      await deps.updateReplyOpportunity({
        id: existing.id,
        data: {
          tweetText: parsed.data.postText,
          tweetUrl: parsed.data.postUrl,
          authorHandle: parsed.data.authorHandle.replace(/^@+/, "").toLowerCase(),
          ...lifecycleUpdate,
          selectedOptionId: parsed.data.copiedReplyId ?? existing.selectedOptionId,
          selectedAngleLabel:
            parsed.data.copiedReplyIntent?.label ??
            parsed.data.copiedReplyLabel ??
            parsed.data.angle ??
            existing.selectedAngleLabel,
          selectedOptionText: parsed.data.copiedReplyText ?? existing.selectedOptionText,
          notes: nextNotes,
        },
      });
    }

    void deps.recordProductEvent({
      userId: auth.user.id,
      xHandle: auth.user.activeXHandle?.trim().replace(/^@+/, "").toLowerCase() || null,
      eventType: `extension_reply_${parsed.data.event}`,
      properties: {
        opportunityId: parsed.data.opportunityId ?? existing?.id ?? null,
        postId: parsed.data.postId,
        verdict: parsed.data.verdict ?? null,
        angle: parsed.data.angle ?? null,
        intentLabel: parsed.data.copiedReplyIntent?.label ?? null,
        intentAnchor: parsed.data.copiedReplyIntent?.anchor ?? null,
        intentStrategyPillar: parsed.data.copiedReplyIntent?.strategyPillar ?? null,
      },
    }).catch((error) =>
      deps.logExtensionRouteFailure({
        route: "reply-log",
        userId: auth.user.id,
        error,
        details: { eventType: `extension_reply_${parsed.data.event}` },
      }),
    );
  } catch (error) {
    deps.logExtensionRouteFailure({
      route: "reply-log",
      userId: auth.user.id,
      error,
      details: {
        opportunityId: parsed.data.opportunityId ?? null,
        postId: parsed.data.postId,
        event: parsed.data.event,
      },
    });
  }

  return Response.json({ ok: true });
}
