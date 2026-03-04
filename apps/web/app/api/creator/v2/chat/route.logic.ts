type DraftVersionSource = "assistant_generated" | "assistant_revision" | "manual_save";

export interface SelectedDraftContext {
  messageId: string;
  versionId: string;
  content: string;
  source?: DraftVersionSource;
  createdAt?: string;
  maxCharacterLimit?: number;
  revisionChainId?: string;
}

export function looksLikeDraftHandoff(reply: string): boolean {
  const normalized = reply.trim().toLowerCase();

  return [
    "here's the draft. take a look.",
    "here's a draft. take a look.",
    "made the edit. take a look.",
    "made the edit and kept it close to your voice. take a look.",
    "made the edit and kept the hook sharper. take a look.",
    "made the edit and tightened it to fit. take a look.",
    "kept it natural and close to your voice. take a look.",
    "leaned into a sharper hook for growth. take a look.",
    "kept it tight enough to post. take a look.",
  ].includes(normalized);
}

export function normalizeDraftPayload(args: {
  reply: string;
  draft: string | null;
  drafts: string[];
  outputShape: string;
}): {
  reply: string;
  draft: string | null;
  drafts: string[];
} {
  let reply = args.reply;
  let draft = args.draft;
  let drafts = args.drafts;

  if (!draft && drafts.length > 0) {
    draft = drafts[0] || null;
  }

  if (args.outputShape === "short_form_post" || args.outputShape === "long_form_post") {
    const trimmedReply = reply.trim();
    const replyLooksLikeDraft =
      trimmedReply.length > 40 && !looksLikeDraftHandoff(trimmedReply);

    if (!draft && replyLooksLikeDraft) {
      draft = trimmedReply;
      drafts = [trimmedReply];
      reply = "here's the draft. take a look.";
    } else if (draft) {
      drafts = drafts.length > 0 ? drafts : [draft];

      if (!trimmedReply || trimmedReply === draft || replyLooksLikeDraft) {
        reply = "here's the draft. take a look.";
      }
    }
  }

  return { reply, draft, drafts };
}

export function parseSelectedDraftContext(value: unknown): SelectedDraftContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const messageId = typeof candidate.messageId === "string" ? candidate.messageId.trim() : "";
  const versionId = typeof candidate.versionId === "string" ? candidate.versionId.trim() : "";
  const content = typeof candidate.content === "string" ? candidate.content.trim() : "";

  if (!messageId || !versionId || !content) {
    return null;
  }

  const source = (() => {
    switch (candidate.source) {
      case "assistant_generated":
      case "assistant_revision":
      case "manual_save":
        return candidate.source;
      default:
        return undefined;
    }
  })();

  const createdAt =
    typeof candidate.createdAt === "string" && candidate.createdAt.trim()
      ? candidate.createdAt.trim()
      : undefined;
  const maxCharacterLimit =
    typeof candidate.maxCharacterLimit === "number" && candidate.maxCharacterLimit > 0
      ? candidate.maxCharacterLimit
      : undefined;
  const revisionChainId =
    typeof candidate.revisionChainId === "string" && candidate.revisionChainId.trim()
      ? candidate.revisionChainId.trim()
      : undefined;

  return {
    messageId,
    versionId,
    content,
    ...(source ? { source } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(maxCharacterLimit ? { maxCharacterLimit } : {}),
    ...(revisionChainId ? { revisionChainId } : {}),
  };
}

export function resolveDraftArtifactKind(
  outputShape: string,
): "short_form_post" | "long_form_post" | "thread_seed" | "reply_candidate" | "quote_candidate" | null {
  switch (outputShape) {
    case "short_form_post":
    case "long_form_post":
    case "thread_seed":
    case "reply_candidate":
    case "quote_candidate":
      return outputShape;
    default:
      return null;
  }
}

export function resolveEffectiveExplicitIntent(args: {
  intent: string;
  selectedDraftContext: SelectedDraftContext | null;
}):
  | "coach"
  | "ideate"
  | "plan"
  | "planner_feedback"
  | "draft"
  | "review"
  | "edit"
  | "answer_question"
  | null {
  return [
    "coach",
    "ideate",
    "plan",
    "planner_feedback",
    "draft",
    "review",
    "edit",
    "answer_question",
  ].includes(args.intent)
    ? (args.intent as
        | "coach"
        | "ideate"
        | "plan"
        | "planner_feedback"
        | "draft"
        | "review"
        | "edit"
        | "answer_question")
    : args.selectedDraftContext
      ? "edit"
      : null;
}

export function buildDraftVersionMetadata(args: {
  selectedDraftContext: SelectedDraftContext | null;
}): {
  source: DraftVersionSource;
  basedOnVersionId: string | null;
  revisionChainId: string;
  previousVersionSnapshot?: {
    messageId: string;
    versionId: string;
    content: string;
    source: DraftVersionSource;
  };
} {
  const revisionChainId =
    args.selectedDraftContext?.revisionChainId ||
    `revision-chain-${args.selectedDraftContext?.messageId || "fresh"}`;

  return {
    source: args.selectedDraftContext ? "assistant_revision" : "assistant_generated",
    basedOnVersionId: args.selectedDraftContext?.versionId ?? null,
    revisionChainId,
    ...(args.selectedDraftContext
      ? {
          previousVersionSnapshot: {
            messageId: args.selectedDraftContext.messageId,
            versionId: args.selectedDraftContext.versionId,
            content: args.selectedDraftContext.content,
            source: args.selectedDraftContext.source ?? "assistant_generated",
          },
        }
      : {}),
  };
}
