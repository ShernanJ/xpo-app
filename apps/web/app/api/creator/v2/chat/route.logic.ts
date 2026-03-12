import type { SurfaceMode } from "../../../../../lib/agent-v2/contracts/chat.ts";
import { buildDraftArtifact, buildDraftArtifactTitle, computeXWeightedCharacterCount, type DraftArtifactDetails } from "../../../../../lib/onboarding/draftArtifacts.ts";
import type { DraftBundleResult } from "../../../../../lib/agent-v2/orchestrator/draftBundles.ts";

type DraftVersionSource = "assistant_generated" | "assistant_revision" | "manual_save";

interface DraftVersionEntry {
  id: string;
  content: string;
  source: DraftVersionSource;
  createdAt: string;
  basedOnVersionId: string | null;
  weightedCharacterCount: number;
  maxCharacterLimit: number;
  supportAsset: string | null;
  artifact?: DraftArtifactDetails;
}

interface PreviousVersionSnapshot {
  messageId: string;
  versionId: string;
  content: string;
  source: DraftVersionSource;
  createdAt: string;
  maxCharacterLimit?: number;
  revisionChainId?: string;
}

export interface DraftBundleOptionEntry {
  id: string;
  label: string;
  framing?: string;
  versionId: string;
  content: string;
  artifact: DraftArtifactDetails;
}

export interface DraftBundlePayload {
  kind: DraftBundleResult["kind"];
  selectedOptionId: string;
  options: DraftBundleOptionEntry[];
}

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

  if (
    args.outputShape === "short_form_post" ||
    args.outputShape === "long_form_post" ||
    args.outputShape === "thread_seed"
  ) {
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
  excludeMessageId?: string | null;
}): {
  recentHistory: string;
  activeDraft: string | undefined;
} {
  const rawHistory = Array.isArray(args.history) ? args.history : [];
  const normalizeEntry = (entry: Record<string, unknown>): Record<string, unknown> => {
    const data =
      entry.data && typeof entry.data === "object" && !Array.isArray(entry.data)
        ? (entry.data as Record<string, unknown>)
        : {};

    return {
      ...data,
      ...entry,
    };
  };
  const trimLine = (value: string): string => value.trim().replace(/\s+/g, " ");
  const clip = (value: string, maxLength: number): string => {
    const trimmed = trimLine(value);
    if (trimmed.length <= maxLength) {
      return trimmed;
    }

    return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
  };
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
  const extractDraft = (entry: Record<string, unknown>): string | undefined => {
    if (typeof entry.draft === "string" && entry.draft.trim()) {
      return entry.draft.trim();
    }

    const draftBundle =
      entry.draftBundle && typeof entry.draftBundle === "object" && !Array.isArray(entry.draftBundle)
        ? (entry.draftBundle as Record<string, unknown>)
        : null;
    if (draftBundle) {
      const selectedOptionId =
        typeof draftBundle.selectedOptionId === "string" ? draftBundle.selectedOptionId : null;
      const options = Array.isArray(draftBundle.options) ? draftBundle.options : [];
      const selectedOption =
        options.find(
          (option) =>
            option &&
            typeof option === "object" &&
            (option as Record<string, unknown>).id === selectedOptionId,
        ) ||
        options[0];
      if (
        selectedOption &&
        typeof selectedOption === "object" &&
        typeof (selectedOption as Record<string, unknown>).content === "string"
      ) {
        return ((selectedOption as Record<string, unknown>).content as string).trim();
      }
    }

    const draftVersions = Array.isArray(entry.draftVersions) ? entry.draftVersions : [];
    const activeDraftVersionId =
      typeof entry.activeDraftVersionId === "string" ? entry.activeDraftVersionId : null;
    const activeDraftVersion =
      draftVersions.find(
        (version) =>
          version &&
          typeof version === "object" &&
          (version as Record<string, unknown>).id === activeDraftVersionId,
      ) ||
      draftVersions[draftVersions.length - 1];
    if (
      activeDraftVersion &&
      typeof activeDraftVersion === "object" &&
      typeof (activeDraftVersion as Record<string, unknown>).content === "string"
    ) {
      return ((activeDraftVersion as Record<string, unknown>).content as string).trim();
    }

    const draftArtifacts = Array.isArray(entry.draftArtifacts) ? entry.draftArtifacts : [];
    const primaryArtifact = draftArtifacts[0];
    if (
      primaryArtifact &&
      typeof primaryArtifact === "object" &&
      typeof (primaryArtifact as Record<string, unknown>).content === "string"
    ) {
      return ((primaryArtifact as Record<string, unknown>).content as string).trim();
    }

    return undefined;
  };
  const buildAssistantContext = (entry: Record<string, unknown>): string | null => {
    const blocks: string[] = [];
    const contextPacket =
      entry.contextPacket &&
      typeof entry.contextPacket === "object" &&
      !Array.isArray(entry.contextPacket)
        ? (entry.contextPacket as Record<string, unknown>)
        : null;
    const contextSummary =
      contextPacket && typeof contextPacket.summary === "string"
        ? contextPacket.summary.trim()
        : "";

    if (contextSummary) {
      blocks.push(`assistant_context:\n${contextSummary}`);
      return blocks.join("\n");
    }

    const plan =
      entry.plan && typeof entry.plan === "object" && !Array.isArray(entry.plan)
        ? (entry.plan as Record<string, unknown>)
        : null;
    if (plan) {
      const planLines = [
        typeof plan.objective === "string" ? `- objective: ${clip(plan.objective, 180)}` : null,
        typeof plan.angle === "string" ? `- angle: ${clip(plan.angle, 180)}` : null,
        typeof plan.targetLane === "string" ? `- lane: ${plan.targetLane}` : null,
      ].filter((value): value is string => Boolean(value));
      if (planLines.length > 0) {
        blocks.push(`assistant_plan:\n${planLines.join("\n")}`);
      }
    }

    const draft = extractDraft(entry);
    if (draft) {
      blocks.push(`assistant_draft:\n${clip(draft, 280)}`);
    }

    const groundingExplanation =
      typeof entry.groundingExplanation === "string" ? entry.groundingExplanation.trim() : "";
    const groundingSources = Array.isArray(entry.groundingSources)
      ? entry.groundingSources
          .map((source) =>
            source && typeof source === "object" && typeof (source as Record<string, unknown>).title === "string"
              ? ((source as Record<string, unknown>).title as string).trim()
              : "",
          )
          .filter(Boolean)
          .slice(0, 2)
      : [];
    if (groundingExplanation || groundingSources.length > 0) {
      const groundingLines = [
        groundingExplanation ? `- ${clip(groundingExplanation, 180)}` : null,
        groundingSources.length > 0
          ? `- sources: ${groundingSources.map((title) => clip(title, 80)).join(" | ")}`
          : null,
      ].filter((value): value is string => Boolean(value));
      if (groundingLines.length > 0) {
        blocks.push(`assistant_grounding:\n${groundingLines.join("\n")}`);
      }
    }

    const issuesFixed = Array.isArray(entry.issuesFixed)
      ? entry.issuesFixed
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .slice(0, 3)
      : [];
    if (issuesFixed.length > 0) {
      blocks.push(`assistant_critique:\n${issuesFixed.map((issue) => `- ${clip(issue, 160)}`).join("\n")}`);
    }

    const titles = extractAngleTitles(entry);
    if (titles.length > 0) {
      blocks.push(`assistant_angles:\n${titles.map((title, index) => `${index + 1}. ${title}`).join("\n")}`);
    }

    return blocks.length > 0 ? blocks.join("\n") : null;
  };
  const isHistoryEntry = (
    entry: Record<string, unknown> | null,
  ): entry is Record<string, unknown> => {
    if (!entry) {
      return false;
    }

    return (
      typeof entry["role"] === "string" &&
      typeof entry["content"] === "string" &&
      (!args.excludeMessageId || entry["id"] !== args.excludeMessageId)
    );
  };
  const recentHistory = rawHistory
    .map((entry) => (entry && typeof entry === "object" ? normalizeEntry(entry as Record<string, unknown>) : null))
    .filter(isHistoryEntry)
    .map((entry) => {
      const base = `${entry.role}: ${trimLine(entry.content as string)}`;
      if (entry.role !== "assistant") {
        return base;
      }

      const assistantContext = buildAssistantContext(entry);
      if (!assistantContext) {
        return base;
      }

      return `${base}\n${assistantContext}`;
    })
    .slice(-16)
    .join("\n");

  const lastDraftEntry = rawHistory
    .slice()
    .reverse()
    .map((entry) => (entry && typeof entry === "object" ? normalizeEntry(entry as Record<string, unknown>) : null))
    .find(
      (entry) =>
        Boolean(entry) &&
        (!args.excludeMessageId || entry?.id !== args.excludeMessageId) &&
        Boolean(entry && extractDraft(entry)),
    );
  const historyDraft = lastDraftEntry ? extractDraft(lastDraftEntry) : undefined;
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
    buildRevisionChainId(args.selectedDraftContext?.messageId);

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

function buildRevisionChainId(seed?: string): string {
  const normalizedSeed = typeof seed === "string" ? seed.trim() : "";
  if (normalizedSeed) {
    return `revision-chain-${normalizedSeed}`;
  }

  return `revision-chain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildInitialDraftVersionPayload(args: {
  draft: string | null;
  outputShape: string;
  supportAsset: string | null;
  selectedDraftContext: SelectedDraftContext | null;
  groundingSources?: DraftArtifactDetails["groundingSources"];
  groundingMode?: DraftArtifactDetails["groundingMode"];
  groundingExplanation?: DraftArtifactDetails["groundingExplanation"];
  posts?: string[];
  replyPlan?: string[];
  voiceTarget?: DraftArtifactDetails["voiceTarget"];
  noveltyNotes?: string[];
  threadPostMaxCharacterLimit?: number;
  threadFramingStyle?: DraftArtifactDetails["threadFramingStyle"];
}): {
  draftArtifacts: DraftArtifactDetails[];
  draftVersions?: DraftVersionEntry[];
  activeDraftVersionId?: string;
  previousVersionSnapshot?: PreviousVersionSnapshot | null;
  revisionChainId?: string;
} {
  if (!args.draft) {
    return {
      draftArtifacts: [],
    };
  }

  const artifactKind = resolveDraftArtifactKind(args.outputShape);
  if (!artifactKind) {
    return {
      draftArtifacts: [],
    };
  }

  const createdAt = new Date().toISOString();
  const versionId = `version-${Date.now()}`;
  const metadata = buildDraftVersionMetadata({
    selectedDraftContext: args.selectedDraftContext,
  });
  const revisionChainId = metadata.revisionChainId;
  const primaryArtifact = buildDraftArtifact({
    id: `${artifactKind}-1`,
    title: buildDraftArtifactTitle(artifactKind, 0),
    kind: artifactKind,
    content: args.draft,
    supportAsset: args.supportAsset,
    ...(args.groundingSources?.length ? { groundingSources: args.groundingSources } : {}),
    ...(args.groundingMode ? { groundingMode: args.groundingMode } : {}),
    ...(args.groundingExplanation ? { groundingExplanation: args.groundingExplanation } : {}),
    ...(args.posts?.length ? { posts: args.posts } : {}),
    ...(args.replyPlan?.length ? { replyPlan: args.replyPlan } : {}),
    ...(args.voiceTarget ? { voiceTarget: args.voiceTarget } : {}),
    ...(args.noveltyNotes?.length ? { noveltyNotes: args.noveltyNotes } : {}),
    ...(args.threadPostMaxCharacterLimit
      ? { threadPostMaxCharacterLimit: args.threadPostMaxCharacterLimit }
      : {}),
    ...(args.threadFramingStyle
      ? { threadFramingStyle: args.threadFramingStyle }
      : {}),
  });
  const maxCharacterLimit =
    args.selectedDraftContext?.maxCharacterLimit ?? primaryArtifact.maxCharacterLimit;
  const adjustedPrimaryArtifact =
    maxCharacterLimit === primaryArtifact.maxCharacterLimit
      ? primaryArtifact
      : {
          ...primaryArtifact,
          maxCharacterLimit,
          isWithinXLimit: primaryArtifact.weightedCharacterCount <= maxCharacterLimit,
        };

  const draftVersion: DraftVersionEntry = {
    id: versionId,
    content: args.draft,
    source: metadata.source,
    createdAt,
    basedOnVersionId: metadata.basedOnVersionId,
    weightedCharacterCount:
      adjustedPrimaryArtifact.weightedCharacterCount ?? computeXWeightedCharacterCount(args.draft),
    maxCharacterLimit,
    supportAsset: args.supportAsset,
    artifact: adjustedPrimaryArtifact,
  };

  const previousVersionSnapshot = args.selectedDraftContext
    ? {
        messageId: args.selectedDraftContext.messageId,
        versionId: args.selectedDraftContext.versionId,
        content: args.selectedDraftContext.content,
        source: args.selectedDraftContext.source ?? "assistant_generated",
        createdAt: args.selectedDraftContext.createdAt ?? createdAt,
        ...(args.selectedDraftContext.maxCharacterLimit
          ? { maxCharacterLimit: args.selectedDraftContext.maxCharacterLimit }
          : {}),
        ...(args.selectedDraftContext.revisionChainId
          ? { revisionChainId: args.selectedDraftContext.revisionChainId }
          : {}),
      }
    : undefined;

  return {
    draftArtifacts: [adjustedPrimaryArtifact],
    draftVersions: [draftVersion],
    activeDraftVersionId: versionId,
    revisionChainId,
    ...(previousVersionSnapshot ? { previousVersionSnapshot } : {}),
  };
}

export function buildDraftBundleVersionPayload(args: {
  draftBundle: DraftBundleResult | null | undefined;
  outputShape: string;
  groundingSources?: DraftArtifactDetails["groundingSources"];
  groundingMode?: DraftArtifactDetails["groundingMode"];
  groundingExplanation?: DraftArtifactDetails["groundingExplanation"];
  threadPostMaxCharacterLimit?: number;
}): {
  draftArtifacts: DraftArtifactDetails[];
  draftVersions?: DraftVersionEntry[];
  activeDraftVersionId?: string;
  draftBundle?: DraftBundlePayload;
  revisionChainId?: string;
} {
  if (!args.draftBundle || args.draftBundle.options.length === 0) {
    return {
      draftArtifacts: [],
    };
  }

  const artifactKind = resolveDraftArtifactKind(args.outputShape);
  if (!artifactKind) {
    return {
      draftArtifacts: [],
    };
  }

  const createdAt = new Date().toISOString();
  const revisionChainId = buildRevisionChainId();
  const draftArtifacts: DraftArtifactDetails[] = [];
  const draftVersions: DraftVersionEntry[] = [];
  const bundleOptions: DraftBundleOptionEntry[] = [];

  for (const [index, option] of args.draftBundle.options.entries()) {
    const versionId = `version-${Date.now()}-${index + 1}`;
    const artifact = buildDraftArtifact({
      id: `${artifactKind}-${index + 1}`,
      title: option.label || buildDraftArtifactTitle(artifactKind, index),
      kind: artifactKind,
      content: option.draft,
      supportAsset: option.supportAsset,
      ...(option.groundingSources?.length ? { groundingSources: option.groundingSources } : {}),
      ...(option.groundingMode ? { groundingMode: option.groundingMode } : {}),
      ...(option.groundingExplanation
        ? { groundingExplanation: option.groundingExplanation }
        : {}),
      ...(option.voiceTarget ? { voiceTarget: option.voiceTarget } : {}),
      ...(option.noveltyNotes?.length ? { noveltyNotes: option.noveltyNotes } : {}),
      ...(args.threadPostMaxCharacterLimit
        ? { threadPostMaxCharacterLimit: args.threadPostMaxCharacterLimit }
        : {}),
    });

    draftArtifacts.push(artifact);
    draftVersions.push({
      id: versionId,
      content: option.draft,
      source: "assistant_generated",
      createdAt,
      basedOnVersionId: null,
      weightedCharacterCount:
        artifact.weightedCharacterCount ?? computeXWeightedCharacterCount(option.draft),
      maxCharacterLimit: artifact.maxCharacterLimit,
      supportAsset: option.supportAsset,
      artifact,
    });
    bundleOptions.push({
      id: option.id,
      label: option.label,
      ...(option.framing ? { framing: option.framing } : {}),
      versionId,
      content: option.draft,
      artifact,
    });
  }

  const selectedOptionId =
    bundleOptions.some((option) => option.id === args.draftBundle?.selectedOptionId)
      ? args.draftBundle.selectedOptionId
      : bundleOptions[0].id;
  const activeDraftVersionId =
    bundleOptions.find((option) => option.id === selectedOptionId)?.versionId ??
    draftVersions[0]?.id;

  return {
    draftArtifacts,
    draftVersions,
    activeDraftVersionId,
    draftBundle: {
      kind: args.draftBundle.kind,
      selectedOptionId,
      options: bundleOptions,
    },
    revisionChainId,
  };
}
