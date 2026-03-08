import type { SurfaceMode } from "../../../../../lib/agent-v2/contracts/chat.ts";

type DraftVersionSource = "assistant_generated" | "assistant_revision" | "manual_save";

const DRAFT_HANDOFF_REPLIES = new Set([
  "here's the draft. take a look.",
  "here's a draft. take a look.",
  "draft's ready. take a look.",
  "put together the draft. take a look.",
  "draft is up. tell me what to tweak.",
  "draft's ready. want any tweaks?",
  "put together a draft. thoughts?",
  "put together a draft. take a look.",
  "made the edit. take a look.",
  "updated it. give it a read.",
  "made the edit. kept your voice tight.",
  "updated it and kept your tone.",
  "edited and stayed in your voice.",
  "made the edit. sharpened the hook.",
  "updated it with a punchier hook.",
  "edited it for a stronger hook.",
  "made the edit and tightened it.",
  "updated and trimmed it down.",
  "kept it natural and in your voice.",
  "drafted it to sound like you.",
  "kept your voice front and center.",
  "leaned into a sharper hook.",
  "drafted this with a growth hook.",
  "optimized the hook for reach.",
  "kept it tight enough to post.",
  "tightened it so it's post-ready.",
  "made the edit and kept it close to your voice. take a look.",
  "made the edit and kept the hook sharper. take a look.",
  "made the edit and tightened it to fit. take a look.",
  "kept it natural and close to your voice. take a look.",
  "leaned into a sharper hook for growth. take a look.",
  "updated it and kept your voice intact. does this feel closer to how you'd post it?",
  "made that edit in your tone. want another pass or is this good?",
  "reworked it in your voice. does this version land better?",
  "updated it with a sharper hook. want it punchier or does this hit?",
  "tightened the framing for reach. do you want another tweak?",
  "reworked the opening to hit faster. should i refine it more?",
  "trimmed it down and kept the point tight. want me to tighten it one more step?",
  "shortened it and cleaned the flow. does this feel post-ready?",
  "made the edit. does this version work better for you?",
  "updated it based on your note. want any tweaks before posting?",
  "ran with your angle and kept it in your voice. want to tweak anything?",
  "drafted this to sound like you. does it feel right, or should i adjust it?",
  "put together a version that stays natural to your tone. want any edits?",
  "ran with a stronger hook for reach. do you want a softer or punchier version?",
  "drafted it with a growth-first opening. should i tune the tone?",
  "leaned into a sharper framing. want me to push it further or keep it balanced?",
  "kept it tight and post-ready. want to trim it even more?",
  "tightened it up so it reads fast. does this feel good to post?",
  "ran with that idea and drafted this. want any tweaks before you post?",
  "put together the draft from that angle. does this feel right?",
  "drafted it as-is. want to adjust tone, hook, or length?",
  "drafted a version for you. what do you want to tweak?",
  "here's one take. should we tune tone, hook, or length?",
  "put together a draft you can use. does this feel on-brand for you?",
]);

function deterministicIndex(seed: string, modulo: number): number {
  if (modulo <= 1) {
    return 0;
  }

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return hash % modulo;
}

function buildDefaultDraftHandoffReply(args: {
  seed: string;
  surfaceMode?: SurfaceMode;
  shouldAskFollowUp?: boolean;
}): string {
  const options =
    args.shouldAskFollowUp === false
      ? args.surfaceMode === "revise_and_return"
        ? [
            "updated it.",
            "made the edit.",
            "tightened it up.",
          ]
        : [
            "here's a draft.",
            "put together a draft for you.",
            "ran with that angle.",
          ]
      : [
          "drafted a version for you. what do you want to tweak?",
          "ran with that angle and drafted this. want any tweaks before you post?",
          "here's one take. should we tune tone, hook, or length?",
        ];
  return options[deterministicIndex(args.seed, options.length)];
}

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

  if (DRAFT_HANDOFF_REPLIES.has(normalized)) {
    return true;
  }

  const followUpCues = [
    "tweak",
    "tone",
    "hook",
    "post-ready",
    "post ready",
    "before you post",
    "does this feel",
    "should i",
    "want any",
    "want to",
    "another pass",
  ];
  const draftingActionCues = [
    "drafted",
    "put together",
    "ran with",
    "updated it",
    "made the edit",
    "reworked",
    "tightened",
    "shortened",
  ];
  const hasFollowUpCue = followUpCues.some((cue) => normalized.includes(cue));
  const hasDraftingAction = draftingActionCues.some((cue) => normalized.includes(cue));
  const isQuestion = normalized.includes("?");

  return hasFollowUpCue && hasDraftingAction && isQuestion && normalized.length <= 180;
}

export function normalizeDraftPayload(args: {
  reply: string;
  draft: string | null;
  drafts: string[];
  outputShape: string;
  surfaceMode?: SurfaceMode;
  shouldAskFollowUp?: boolean;
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
      reply = buildDefaultDraftHandoffReply({
        seed: trimmedReply,
        surfaceMode: args.surfaceMode,
        shouldAskFollowUp: args.shouldAskFollowUp,
      });
    } else if (draft) {
      drafts = drafts.length > 0 ? drafts : [draft];

      if (!trimmedReply || trimmedReply === draft || replyLooksLikeDraft) {
        reply = buildDefaultDraftHandoffReply({
          seed: draft || trimmedReply || "draft",
          surfaceMode: args.surfaceMode,
          shouldAskFollowUp: args.shouldAskFollowUp,
        });
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

export function buildConversationContextFromHistory(args: {
  history: unknown;
  selectedDraftContext: SelectedDraftContext | null;
}): {
  recentHistory: string;
  activeDraft: string | undefined;
} {
  const rawHistory = Array.isArray(args.history) ? args.history : [];
  const extractAngleTitles = (entry: Record<string, unknown>): string[] => {
    const rawAngles = Array.isArray(entry.angles) ? entry.angles : [];
    const titles: string[] = [];
    for (const rawAngle of rawAngles) {
      if (typeof rawAngle === "string" && rawAngle.trim()) {
        titles.push(rawAngle.trim().replace(/\s+/g, " "));
        continue;
      }

      if (!rawAngle || typeof rawAngle !== "object") {
        continue;
      }

      const title = (rawAngle as Record<string, unknown>).title;
      if (typeof title === "string" && title.trim()) {
        titles.push(title.trim().replace(/\s+/g, " "));
      }
    }

    return Array.from(new Set(titles)).slice(0, 4);
  };
  const recentHistory = rawHistory
    .filter(
      (entry: Record<string, unknown>) =>
        typeof entry?.role === "string" && typeof entry?.content === "string",
    )
    .map((entry: Record<string, unknown>) => {
      const base = `${entry.role}: ${entry.content}`;
      if (entry.role !== "assistant") {
        return base;
      }

      const titles = extractAngleTitles(entry);
      if (titles.length === 0) {
        return base;
      }

      return `${base}\nassistant_angles:\n${titles
        .map((title, index) => `${index + 1}. ${title}`)
        .join("\n")}`;
    })
    .slice(-10)
    .join("\n");

  const lastDraftEntry = rawHistory
    .slice()
    .reverse()
    .find(
      (entry: Record<string, unknown>) =>
        typeof entry?.draft === "string" && entry.draft.length > 0,
    );
  const historyDraft =
    typeof lastDraftEntry?.draft === "string" ? lastDraftEntry.draft : undefined;
  const activeDraft = args.selectedDraftContext?.content || historyDraft;

  return {
    recentHistory: recentHistory || "None",
    activeDraft,
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
