import type {
  ExtensionReplyEditLogRequest,
  ExtensionReplyLogRequest,
} from "../../../../lib/extension/types.ts";
import {
  ExtensionReplyEditLogRequestSchema,
  ExtensionReplyLogRequestSchema,
  ExtensionReplyModeSchema,
} from "../contracts.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeReplyMode(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  const parsed = ExtensionReplyModeSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function parseExtensionReplyLogRequest(body: unknown):
  | { ok: true; kind: "lifecycle"; data: ExtensionReplyLogRequest }
  | { ok: true; kind: "edit"; data: ExtensionReplyEditLogRequest }
  | { ok: false; message: string } {
  const root = isRecord(body) ? body : null;
  const editCandidate = root
    ? {
        originalDraft: readString(root.originalDraft),
        finalPostedText: readString(root.finalPostedText),
        replyMode: normalizeReplyMode(root.replyMode),
      }
    : body;

  const parsedEdit = ExtensionReplyEditLogRequestSchema.safeParse(editCandidate);
  if (parsedEdit.success && !readString(root?.event, root?.type, root?.action)) {
    return { ok: true, kind: "edit", data: parsedEdit.data };
  }

  const post = isRecord(root?.post) ? root.post : null;
  const opportunity = isRecord(root?.opportunity) ? root.opportunity : null;
  const author = isRecord(post?.author) ? post.author : null;
  const observedMetrics = isRecord(root?.observedMetrics)
    ? root.observedMetrics
    : isRecord(root?.metrics)
      ? root.metrics
      : null;

  const postId = readString(root?.postId, root?.tweetId, root?.id, post?.postId, post?.tweetId, post?.id);
  const authorHandle = readString(
    root?.authorHandle,
    root?.handle,
    post?.authorHandle,
    author?.handle,
  );
  const postUrl =
    readString(root?.postUrl, root?.tweetUrl, root?.url, post?.postUrl, post?.tweetUrl, post?.url) ||
    (postId && authorHandle
      ? `https://x.com/${authorHandle.replace(/^@+/, "")}/status/${postId}`
      : null);

  const normalizedBody = root
    ? {
        event: readString(root.event, root.type, root.action),
        opportunityId: readString(root.opportunityId, opportunity?.opportunityId, opportunity?.id),
        postId,
        postText: readString(
          root.postText,
          root.tweetText,
          root.text,
          post?.postText,
          post?.tweetText,
          post?.text,
        ),
        postUrl,
        authorHandle,
        surface: readString(root.surface, post?.surface, opportunity?.surface) || "unknown",
        verdict: readString(root.verdict, opportunity?.verdict),
        angle: readString(root.angle, root.replyLabel, root.selectedAngle, opportunity?.suggestedAngle),
        expectedValue:
          root.expectedValue ??
          opportunity?.expectedValue ??
          null,
        riskFlags: Array.isArray(root.riskFlags)
          ? root.riskFlags
          : Array.isArray(opportunity?.riskFlags)
            ? opportunity.riskFlags
            : undefined,
        source: readString(root.source, root.origin),
        generatedReplyIds:
          readStringArray(root.generatedReplyIds) ||
          readStringArray(root.replyIds) ||
          undefined,
        generatedReplyLabels:
          readStringArray(root.generatedReplyLabels) ||
          readStringArray(root.replyLabels) ||
          undefined,
        generatedReplyIntents: Array.isArray(root.generatedReplyIntents)
          ? root.generatedReplyIntents
          : undefined,
        copiedReplyId: readString(root.copiedReplyId, root.replyId, root.selectedReplyId),
        copiedReplyLabel: readString(root.copiedReplyLabel, root.replyLabel, root.selectedReplyLabel),
        copiedReplyText: readString(root.copiedReplyText, root.replyText, root.selectedReplyText),
        copiedReplyIntent: isRecord(root.copiedReplyIntent)
          ? root.copiedReplyIntent
          : isRecord(root.replyIntent)
            ? root.replyIntent
            : null,
        originalDraft: readString(root.originalDraft),
        finalPostedText: readString(root.finalPostedText),
        replyMode: normalizeReplyMode(root.replyMode),
        observedMetrics: observedMetrics
          ? {
              likeCount: observedMetrics.likeCount,
              replyCount: observedMetrics.replyCount,
              profileClicks: observedMetrics.profileClicks,
              followerDelta: observedMetrics.followerDelta,
            }
          : null,
      }
    : body;

  const parsed = ExtensionReplyLogRequestSchema.safeParse(normalizedBody);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message || "Invalid extension reply log request.",
    };
  }

  return { ok: true, kind: "lifecycle", data: parsed.data };
}
