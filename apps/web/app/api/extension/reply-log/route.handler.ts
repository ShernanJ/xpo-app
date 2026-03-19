import type { ReplyOpportunity } from "../../../../lib/generated/prisma/client.ts";
import type { ExtensionReplyMode } from "../../../../lib/extension/types.ts";

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
  observedMetrics?: {
    likeCount: number;
    replyCount: number;
    profileClicks?: number;
    followerDelta?: number;
  } | null;
  originalDraft?: string | null;
  finalPostedText?: string | null;
  replyMode?: ExtensionReplyMode | null;
}

interface ReplyEditLogRequest {
  originalDraft: string;
  finalPostedText: string;
  replyMode: ExtensionReplyMode;
}

type ReplyOpportunityRecord = ReplyOpportunity;

interface ReplyLogHandlerDeps {
  authenticateExtensionRequest(request: Request): Promise<ExtensionAuthResult | null>;
  resolveExtensionHandleForRequest(args: {
    request: Request;
    userId: string;
    activeXHandle?: string | null;
  }): Promise<
    | {
        ok: true;
        xHandle: string;
      }
    | {
        ok: false;
        status: number;
        field: string;
        message: string;
      }
  >;
  parseExtensionReplyLogRequest(body: unknown):
    | { ok: true; kind: "lifecycle"; data: ReplyLogRequest }
    | { ok: true; kind: "edit"; data: ReplyEditLogRequest }
    | { ok: false; message: string };
  findReplyOpportunity(args: {
    opportunityId?: string | null;
    userId: string;
    postId: string;
    xHandle: string;
  }): Promise<ReplyOpportunityRecord | null>;
  mergeStoredOpportunityNotes(record: ReplyOpportunityRecord, patch: Record<string, unknown>): unknown;
  updateReplyOpportunity(args: {
    id: string;
    data: Record<string, unknown>;
  }): Promise<void>;
  recordProductEvent(args: {
    userId: string;
    xHandle: string;
    eventType: string;
    properties: Record<string, unknown>;
  }): Promise<void>;
  saveReplyGoldenExample(args: {
    userId: string;
    xHandle: string;
    replyMode: ExtensionReplyMode;
    text: string;
    source?: string;
  }): Promise<boolean>;
  logExtensionRouteFailure(args: {
    route: string;
    userId?: string | null;
    error: unknown;
    details?: Record<string, unknown>;
  }): void;
}

function normalizeDraftForComparison(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ") || "";
}

function shouldSaveGoldenExample(args: {
  originalDraft?: string | null;
  finalPostedText?: string | null;
  replyMode?: ExtensionReplyMode | null;
}) {
  if (!args.replyMode) {
    return false;
  }

  const originalDraft = normalizeDraftForComparison(args.originalDraft);
  const finalPostedText = normalizeDraftForComparison(args.finalPostedText);
  return Boolean(originalDraft && finalPostedText && originalDraft !== finalPostedText);
}

function getLifecycleUpdate(event: string) {
  const now = new Date();

  if (event === "opened") {
    return { state: "opened", openedAt: now };
  }
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

function buildFollowConversionOutcome(args: {
  parsed: ReplyLogRequest;
  existing: ReplyOpportunityRecord | null;
  lifecycleUpdate: { state: string; observedAt?: Date };
}) {
  if (!args.parsed.observedMetrics) {
    return null;
  }

  const existingAnalytics =
    args.existing?.notes &&
    typeof args.existing.notes === "object" &&
    !Array.isArray(args.existing.notes) &&
    args.existing.notes !== null &&
    "analytics" in args.existing.notes &&
    typeof args.existing.notes.analytics === "object" &&
    args.existing.notes.analytics !== null &&
    !Array.isArray(args.existing.notes.analytics)
      ? (args.existing.notes.analytics as Record<string, unknown>)
      : null;

  const copiedReplyIntent =
    args.parsed.copiedReplyIntent ??
    ((existingAnalytics?.copiedReplyIntent as ReplyLogRequest["copiedReplyIntent"]) || null);

  return {
    observedAtIso:
      args.lifecycleUpdate.observedAt?.toISOString() ?? new Date().toISOString(),
    metrics: {
      likeCount: args.parsed.observedMetrics.likeCount,
      replyCount: args.parsed.observedMetrics.replyCount,
      ...(typeof args.parsed.observedMetrics.profileClicks === "number"
        ? { profileClicks: args.parsed.observedMetrics.profileClicks }
        : {}),
      ...(typeof args.parsed.observedMetrics.followerDelta === "number"
        ? { followerDelta: args.parsed.observedMetrics.followerDelta }
        : {}),
    },
    intentLabel:
      copiedReplyIntent?.label ??
      args.parsed.copiedReplyLabel ??
      args.parsed.angle ??
      args.existing?.selectedAngleLabel ??
      null,
    intentAnchor: copiedReplyIntent?.anchor ?? null,
    intentStrategyPillar:
      copiedReplyIntent?.strategyPillar ?? args.existing?.strategyPillar ?? null,
    intentRationale: copiedReplyIntent?.rationale ?? null,
    selectedReplyId:
      args.parsed.copiedReplyId ?? args.existing?.selectedOptionId ?? null,
    hasProfileClickSignal: (args.parsed.observedMetrics.profileClicks || 0) > 0,
    hasFollowConversionSignal: (args.parsed.observedMetrics.followerDelta || 0) > 0,
  };
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
  const lifecycleData = parsed.kind === "lifecycle" ? parsed.data : null;

  try {
    const handleResolution = await deps.resolveExtensionHandleForRequest({
      request,
      userId: auth.user.id,
      activeXHandle: auth.user.activeXHandle,
    });
    if (!handleResolution.ok) {
      return jsonError(handleResolution.status, handleResolution.field, handleResolution.message);
    }
    const xHandle = handleResolution.xHandle;

    if (parsed.kind === "edit") {
      if (
        shouldSaveGoldenExample({
          originalDraft: parsed.data.originalDraft,
          finalPostedText: parsed.data.finalPostedText,
          replyMode: parsed.data.replyMode,
        })
      ) {
        const inserted = await deps.saveReplyGoldenExample({
          userId: auth.user.id,
          xHandle,
          replyMode: parsed.data.replyMode,
          text: parsed.data.finalPostedText,
          source: "human_edit",
        });

        void deps.recordProductEvent({
          userId: auth.user.id,
          xHandle,
          eventType: "extension_reply_golden_example_saved",
          properties: {
            replyMode: parsed.data.replyMode,
            inserted,
          },
        }).catch((error) =>
          deps.logExtensionRouteFailure({
            route: "reply-log",
            userId: auth.user.id,
            error,
            details: { eventType: "extension_reply_golden_example_saved" },
          }),
        );
      }

      return Response.json({ ok: true });
    }

    const existing = await deps.findReplyOpportunity({
      opportunityId: parsed.data.opportunityId,
      userId: auth.user.id,
      postId: parsed.data.postId,
      xHandle,
    });

    if (existing) {
      const lifecycleUpdate = getLifecycleUpdate(parsed.data.event);
      const followConversionOutcome = buildFollowConversionOutcome({
        parsed: parsed.data,
        existing,
        lifecycleUpdate,
      });
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
          followConversionOutcome,
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
          ...(parsed.data.observedMetrics
            ? { observedMetrics: parsed.data.observedMetrics }
            : {}),
          notes: nextNotes,
        },
      });
    }

    if (
      shouldSaveGoldenExample({
        originalDraft: parsed.data.originalDraft,
        finalPostedText: parsed.data.finalPostedText,
        replyMode: parsed.data.replyMode,
      })
    ) {
      await deps.saveReplyGoldenExample({
        userId: auth.user.id,
        xHandle,
        replyMode: parsed.data.replyMode!,
        text: parsed.data.finalPostedText!,
        source: "human_edit",
      });
    }

    void deps.recordProductEvent({
      userId: auth.user.id,
      xHandle,
      eventType: `extension_reply_${parsed.data.event}`,
      properties: {
        opportunityId: parsed.data.opportunityId ?? existing?.id ?? null,
        postId: parsed.data.postId,
        verdict: parsed.data.verdict ?? null,
        angle: parsed.data.angle ?? null,
        intentLabel: parsed.data.copiedReplyIntent?.label ?? null,
        intentAnchor: parsed.data.copiedReplyIntent?.anchor ?? null,
        intentStrategyPillar: parsed.data.copiedReplyIntent?.strategyPillar ?? null,
        replyMode: parsed.data.replyMode ?? null,
        profileClicks: parsed.data.observedMetrics?.profileClicks ?? null,
        followerDelta: parsed.data.observedMetrics?.followerDelta ?? null,
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
        opportunityId: lifecycleData?.opportunityId ?? null,
        postId: lifecycleData?.postId ?? null,
        event: lifecycleData?.event ?? null,
      },
    });
  }

  return Response.json({ ok: true });
}
