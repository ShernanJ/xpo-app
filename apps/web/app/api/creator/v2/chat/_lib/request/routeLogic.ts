import { applyFinalDraftPolicy } from "../../../../../../../lib/agent-v2/core/finalDraftPolicy.ts";
import type {
  DraftFormatPreference,
  ResponseShapePlan,
  StrategyPlan,
  SurfaceMode,
  V2ConversationMemory,
  V2ChatOutputShape,
} from "../../../../../../../lib/agent-v2/contracts/chat.ts";
import type {
  GroundingPacketSourceMaterial,
} from "../../../../../../../lib/agent-v2/grounding/groundingPacket.ts";
import type { VoiceTarget } from "../../../../../../../lib/agent-v2/core/voiceTarget.ts";
import type {
  UserPreferences,
  VoiceStyleCard,
} from "../../../../../../../lib/agent-v2/core/styleProfile.ts";
import type {
  ChatArtifactContext,
  NormalizedChatTurnDiagnostics,
  ChatTurnSource,
  SelectedDraftContextPayload,
} from "../../../../../../../lib/agent-v2/contracts/turnContract.ts";
import {
  buildDraftArtifact,
  buildDraftArtifactTitle,
  computeXWeightedCharacterCount,
  getXCharacterLimitForAccount,
  resolveThreadFramingStyle,
  type DraftArtifactDetails,
} from "../../../../../../../lib/onboarding/draftArtifacts.ts";
import type { DraftBundleResult } from "../../../../../../../lib/agent-v2/capabilities/drafting/draftBundles.ts";
import { shapeAssistantResponse } from "../../../../../../../lib/agent-v2/runtime/responseShaper.ts";
import { selectResponseShapePlan } from "../../../../../../../lib/agent-v2/runtime/surfaceModeSelector.ts";
import type {
  ChatReplyArtifacts,
  ChatReplyParseEnvelope,
} from "../../../../../../../lib/agent-v2/capabilities/reply/replyTurnLogic.ts";
import type { RawOrchestratorResponse } from "../../../../../../../lib/agent-v2/orchestrator/conversationManager.ts";

type DraftVersionSource = "assistant_generated" | "assistant_revision" | "manual_save";

export interface DraftVersionEntry {
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

export interface PreviousVersionSnapshot {
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

export type ChatRouteOutputShape =
  | V2ChatOutputShape
  | "reply_candidate"
  | "quote_candidate";

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
  "turned it into a thread. want to tighten the opener, pacing, or close?",
  "made it a thread. should we sharpen the hook, middle, or ending?",
  "here's the thread version. want to tweak the opener, flow, or close?",
  "turned it into a thread.",
  "made it a thread.",
  "reworked it as a thread.",
  "here's the thread.",
  "put together the thread.",
  "ran with that angle as a thread.",
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
  outputShape: string;
  surfaceMode?: SurfaceMode;
  shouldAskFollowUp?: boolean;
}): string {
  const isThread = args.outputShape === "thread_seed";
  const options = isThread
    ? args.shouldAskFollowUp === false
      ? args.surfaceMode === "revise_and_return"
        ? [
            "turned it into a thread.",
            "made it a thread.",
            "reworked it as a thread.",
          ]
        : [
            "here's the thread.",
            "put together the thread.",
            "ran with that angle as a thread.",
          ]
      : [
          "turned it into a thread. want to tighten the opener, pacing, or close?",
          "made it a thread. should we sharpen the hook, middle, or ending?",
          "here's the thread version. want to tweak the opener, flow, or close?",
        ]
    : args.shouldAskFollowUp === false
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

export type SelectedDraftContext = SelectedDraftContextPayload;

interface ActiveDraftLocator {
  messageId: string;
  versionId: string;
  revisionChainId?: string | null;
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
        outputShape: args.outputShape,
        surfaceMode: args.surfaceMode,
        shouldAskFollowUp: args.shouldAskFollowUp,
      });
    } else if (draft) {
      drafts = drafts.length > 0 ? drafts : [draft];

      if (!trimmedReply || trimmedReply === draft || replyLooksLikeDraft) {
        reply = buildDefaultDraftHandoffReply({
          seed: draft || trimmedReply || "draft",
          outputShape: args.outputShape,
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

function normalizeHistoryEntry(entry: unknown): Record<string, unknown> | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const record = entry as Record<string, unknown>;
  const data =
    record.data && typeof record.data === "object" && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : {};

  return {
    ...data,
    ...record,
  };
}

function buildSelectedDraftContextFromEntry(args: {
  entry: Record<string, unknown>;
  versionId?: string | null;
}): SelectedDraftContext | null {
  const messageId = typeof args.entry.id === "string" ? args.entry.id.trim() : "";
  if (!messageId) {
    return null;
  }

  const draftVersions = Array.isArray(args.entry.draftVersions) ? args.entry.draftVersions : [];
  const requestedVersionId = args.versionId?.trim() || null;
  const activeDraftVersionId =
    requestedVersionId ||
    (typeof args.entry.activeDraftVersionId === "string"
      ? args.entry.activeDraftVersionId.trim()
      : null);

  const matchingVersion =
    draftVersions.find(
      (version) =>
        version &&
        typeof version === "object" &&
        (version as Record<string, unknown>).id === activeDraftVersionId,
    ) ||
    draftVersions[draftVersions.length - 1];
  if (
    matchingVersion &&
    typeof matchingVersion === "object" &&
    typeof (matchingVersion as Record<string, unknown>).id === "string" &&
    typeof (matchingVersion as Record<string, unknown>).content === "string"
  ) {
    const record = matchingVersion as Record<string, unknown>;
    return parseSelectedDraftContext({
      messageId,
      versionId: record.id,
      content: record.content,
      source: record.source,
      createdAt: record.createdAt,
      maxCharacterLimit: record.maxCharacterLimit,
      revisionChainId:
        typeof args.entry.revisionChainId === "string"
          ? args.entry.revisionChainId
          : undefined,
    });
  }

  const draftBundle =
    args.entry.draftBundle &&
    typeof args.entry.draftBundle === "object" &&
    !Array.isArray(args.entry.draftBundle)
      ? (args.entry.draftBundle as Record<string, unknown>)
      : null;
  if (draftBundle && Array.isArray(draftBundle.options)) {
    const matchingOption =
      draftBundle.options.find(
        (option) =>
          option &&
          typeof option === "object" &&
          (option as Record<string, unknown>).versionId === activeDraftVersionId,
      ) ||
      draftBundle.options.find(
        (option) =>
          option &&
          typeof option === "object" &&
          (option as Record<string, unknown>).id === draftBundle.selectedOptionId,
      ) ||
      draftBundle.options[0];
    if (
      matchingOption &&
      typeof matchingOption === "object" &&
      typeof (matchingOption as Record<string, unknown>).versionId === "string" &&
      typeof (matchingOption as Record<string, unknown>).content === "string"
    ) {
      const record = matchingOption as Record<string, unknown>;
      return parseSelectedDraftContext({
        messageId,
        versionId: record.versionId,
        content: record.content,
        revisionChainId:
          typeof args.entry.revisionChainId === "string"
            ? args.entry.revisionChainId
            : undefined,
      });
    }
  }

  const contextPacket =
    args.entry.contextPacket &&
    typeof args.entry.contextPacket === "object" &&
    !Array.isArray(args.entry.contextPacket)
      ? (args.entry.contextPacket as Record<string, unknown>)
      : null;
  const draftRef =
    contextPacket?.draftRef &&
    typeof contextPacket.draftRef === "object" &&
    !Array.isArray(contextPacket.draftRef)
      ? (contextPacket.draftRef as Record<string, unknown>)
      : null;
  if (
    draftRef &&
    typeof draftRef.excerpt === "string" &&
    draftRef.excerpt.trim() &&
    typeof draftRef.activeDraftVersionId === "string" &&
    draftRef.activeDraftVersionId.trim() &&
    (!requestedVersionId || draftRef.activeDraftVersionId === requestedVersionId)
  ) {
    return parseSelectedDraftContext({
      messageId,
      versionId: draftRef.activeDraftVersionId,
      content: draftRef.excerpt,
      revisionChainId:
        typeof draftRef.revisionChainId === "string" ? draftRef.revisionChainId : undefined,
    });
  }

  return null;
}

export function resolveSelectedDraftContextFromHistory(args: {
  history: unknown;
  selectedDraftContext: SelectedDraftContext | null;
  activeDraftRef?: ActiveDraftLocator | null;
}): SelectedDraftContext | null {
  const normalizedEntries = (Array.isArray(args.history) ? args.history : [])
    .map((entry) => normalizeHistoryEntry(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));

  if (args.activeDraftRef?.messageId && args.activeDraftRef.versionId) {
    const preferredEntry = normalizedEntries.find(
      (entry) => entry.id === args.activeDraftRef?.messageId,
    );
    const preferredContext = preferredEntry
      ? buildSelectedDraftContextFromEntry({
          entry: preferredEntry,
          versionId: args.activeDraftRef.versionId,
        })
      : null;
    if (preferredContext) {
      return preferredContext;
    }
  }

  if (args.selectedDraftContext) {
    const matchingEntry = normalizedEntries.find(
      (entry) => entry.id === args.selectedDraftContext?.messageId,
    );
    const matchingContext = matchingEntry
      ? buildSelectedDraftContextFromEntry({
          entry: matchingEntry,
          versionId: args.selectedDraftContext.versionId,
        })
      : null;
    return matchingContext || args.selectedDraftContext;
  }

  for (const entry of [...normalizedEntries].reverse()) {
    const inferredContext = buildSelectedDraftContextFromEntry({ entry });
    if (inferredContext) {
      return inferredContext;
    }
  }

  return null;
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
  const extractDraft = (entry: Record<string, unknown>): string | undefined => {
    const contextPacket =
      entry.contextPacket &&
      typeof entry.contextPacket === "object" &&
      !Array.isArray(entry.contextPacket)
        ? (entry.contextPacket as Record<string, unknown>)
        : null;
    const draftRef =
      contextPacket?.draftRef &&
      typeof contextPacket.draftRef === "object" &&
      !Array.isArray(contextPacket.draftRef)
        ? (contextPacket.draftRef as Record<string, unknown>)
        : null;
    if (draftRef && typeof draftRef.excerpt === "string" && draftRef.excerpt.trim()) {
      return draftRef.excerpt.trim();
    }

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

      return base;
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

export function shouldBypassEmbeddedReplyHandling(args: {
  selectedDraftContext?: SelectedDraftContext | null;
  turnSource?: ChatTurnSource | null;
  artifactContext?: ChatArtifactContext | null;
}): boolean {
  if (args.turnSource && args.turnSource !== "free_text") {
    return true;
  }

  if (args.artifactContext) {
    return true;
  }

  return Boolean(args.selectedDraftContext);
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

export interface ChatRouteMappedDataSeed {
  reply: string;
  angles: unknown[];
  quickReplies: unknown[];
  plan: StrategyPlan | null;
  draft: string | null;
  drafts: string[];
  draftArtifacts: DraftArtifactDetails[];
  draftVersions?: DraftVersionEntry[];
  activeDraftVersionId?: string;
  previousVersionSnapshot?: PreviousVersionSnapshot;
  revisionChainId?: string;
  draftBundle: DraftBundlePayload | null;
  supportAsset: string | null;
  groundingSources: GroundingPacketSourceMaterial[];
  autoSavedSourceMaterials: {
    count: number;
    assets: Array<{
      id: string;
      title: string;
      deletable: boolean;
    }>;
  } | null;
  outputShape: ChatRouteOutputShape;
  surfaceMode: SurfaceMode;
  memory: V2ConversationMemory;
  routingDiagnostics: NormalizedChatTurnDiagnostics;
  requestTrace: {
    clientTurnId: string | null;
  };
  replyArtifacts: ChatReplyArtifacts | null;
  replyParse: ChatReplyParseEnvelope | null;
}

export interface AssistantContextPacket {
  version: "assistant_context_v2";
  summary: string;
  planRef: {
    objective: string;
    angle: string;
    targetLane: StrategyPlan["targetLane"];
    formatPreference: StrategyPlan["formatPreference"] | null;
  } | null;
  draftRef: {
    excerpt: string;
    activeDraftVersionId: string | null;
    revisionChainId: string | null;
  } | null;
  grounding: {
    mode: string | null;
    explanation: string | null;
    sourceTitles: string[];
  };
  critique: {
    issuesFixed: string[];
  };
  replyRef: {
    kind: "reply_options" | "reply_draft";
    sourceExcerpt: string;
    sourceUrl: string | null;
    authorHandle: string | null;
    selectedOptionId: string | null;
    optionLabels: string[];
  } | null;
  replyParse: ChatReplyParseEnvelope | null;
  artifacts: {
    outputShape: string;
    surfaceMode: string | null;
    quickReplyCount: number;
    hasDraft: boolean;
  };
}

export interface ChatRouteResponseData extends ChatRouteMappedDataSeed {
  threadTitle: string;
  billing: null;
  contextPacket: AssistantContextPacket;
}

export interface ChatRouteDraftCandidateCreate {
  title: string;
  artifact: DraftArtifactDetails;
  voiceTarget: VoiceTarget | null;
  noveltyNotes: string[];
}

export interface ChatRoutePersistencePlan {
  assistantMessageData: ChatRouteResponseData;
  memoryUpdate: {
    preferredSurfaceMode: V2ConversationMemory["preferredSurfaceMode"];
    activeDraftVersionId: string | null;
    revisionChainId: string | null;
    shouldClearReplyWorkflow: boolean;
  };
  threadUpdate: {
    updatedAt: Date;
    title?: string;
  };
  draftCandidateCreates: ChatRouteDraftCandidateCreate[];
  analytics: {
    primaryGroundingMode: DraftArtifactDetails["groundingMode"] | null;
    primaryGroundingSourceCount: number;
    autoSavedSourceMaterialCount: number;
  };
}

export interface PreparedChatRouteTurn {
  rawResponse: RawOrchestratorResponse;
  responseShapePlan: ResponseShapePlan;
  surfaceMode: SurfaceMode;
  shapedResponse: string;
  mappedDataSeed: ChatRouteMappedDataSeed;
  persistencePlan: ChatRoutePersistencePlan;
}

function clipContextLine(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

export function buildAssistantContextPacket(args: {
  reply: string;
  plan: StrategyPlan | null;
  draft: string | null;
  activeDraftVersionId?: string | null;
  revisionChainId?: string | null;
  outputShape: string;
  surfaceMode: string | null | undefined;
  issuesFixed: string[];
  groundingMode: string | null;
  groundingExplanation: string | null;
  groundingSources: GroundingPacketSourceMaterial[];
  quickReplies: unknown[];
  replyArtifacts?: ChatReplyArtifacts | null;
  replyParse?: ChatReplyParseEnvelope | null;
}): AssistantContextPacket {
  const summaryLines = [
    args.plan
      ? `plan: ${clipContextLine(args.plan.objective, 100)} | ${clipContextLine(args.plan.angle, 120)}`
      : null,
    args.draft ? `draft: ${clipContextLine(args.draft, 220)}` : null,
    args.groundingExplanation ? `grounding: ${clipContextLine(args.groundingExplanation, 140)}` : null,
    args.issuesFixed[0] ? `critique: ${clipContextLine(args.issuesFixed[0], 120)}` : null,
    args.replyArtifacts
      ? `reply_source: ${clipContextLine(args.replyArtifacts.sourceText, 180)}`
      : null,
    !args.plan && !args.draft && args.reply
      ? `reply: ${clipContextLine(args.reply, 180)}`
      : null,
  ].filter((value): value is string => Boolean(value));

  return {
    version: "assistant_context_v2",
    summary: summaryLines.join("\n"),
    planRef: args.plan
      ? {
          objective: args.plan.objective,
          angle: args.plan.angle,
          targetLane: args.plan.targetLane,
          formatPreference: args.plan.formatPreference || null,
        }
      : null,
    draftRef: args.draft
      ? {
          excerpt: clipContextLine(args.draft, 220),
          activeDraftVersionId: args.activeDraftVersionId || null,
          revisionChainId: args.revisionChainId || null,
        }
      : null,
    grounding: {
      mode: args.groundingMode,
      explanation: args.groundingExplanation,
      sourceTitles: args.groundingSources.map((source) => source.title).slice(0, 3),
    },
    critique: {
      issuesFixed: args.issuesFixed.slice(0, 5),
    },
    replyRef: args.replyArtifacts
      ? {
          kind: args.replyArtifacts.kind,
          sourceExcerpt: clipContextLine(args.replyArtifacts.sourceText, 220),
          sourceUrl: args.replyArtifacts.sourceUrl,
          authorHandle: args.replyArtifacts.authorHandle,
          selectedOptionId: args.replyArtifacts.selectedOptionId,
          optionLabels:
            args.replyArtifacts.kind === "reply_options"
              ? args.replyArtifacts.options.map((option) => option.label).slice(0, 3)
              : args.replyArtifacts.options.map((option) => option.label).slice(0, 2),
        }
      : null,
    replyParse: args.replyParse || null,
    artifacts: {
      outputShape: args.outputShape,
      surfaceMode: args.surfaceMode || null,
      quickReplyCount: args.quickReplies.length,
      hasDraft: Boolean(args.draft),
    },
  };
}

export function buildChatRouteMappedData(args: {
  result: {
    outputShape: V2ChatOutputShape;
    response: string;
    surfaceMode: SurfaceMode;
    responseShapePlan: ResponseShapePlan;
    memory: V2ConversationMemory;
    data?: unknown;
  };
  plan: StrategyPlan | null;
  selectedDraftContext: SelectedDraftContext | null;
  formatPreference: DraftFormatPreference | null;
  isVerifiedAccount: boolean;
  userPreferences: UserPreferences | null;
  styleCard: VoiceStyleCard | null;
  routingDiagnostics: NormalizedChatTurnDiagnostics;
  clientTurnId: string | null;
}): {
  mappedData: ChatRouteMappedDataSeed;
  responseVoiceTarget: VoiceTarget | null;
  responseNoveltyNotes: string[];
  responseGroundingMode: DraftArtifactDetails["groundingMode"] | null;
  responseGroundingExplanation: string | null;
} {
  const resultData =
    args.result.data &&
    typeof args.result.data === "object" &&
    !Array.isArray(args.result.data)
      ? (args.result.data as Record<string, unknown>)
      : undefined;
  const normalizedDraftPayload = normalizeDraftPayload({
    reply: args.result.response,
    draft: (resultData?.draft as string) ?? null,
    drafts:
      resultData?.draftBundle &&
      typeof resultData.draftBundle === "object" &&
      !Array.isArray(resultData.draftBundle)
        ? (((resultData.draftBundle as DraftBundleResult).options || []).map((option) => option.draft))
        : (resultData?.draft ? [resultData.draft as string] : []),
    outputShape: args.result.outputShape,
    surfaceMode: args.result.surfaceMode,
    shouldAskFollowUp:
      args.result.responseShapePlan.shouldAskFollowUp &&
      args.result.responseShapePlan.maxFollowUps > 0,
  });

  const effectiveFormatPreference =
    args.plan?.formatPreference ||
    args.formatPreference ||
    args.result.memory.formatPreference ||
    (args.result.outputShape === "thread_seed"
      ? "thread"
      : args.result.outputShape === "long_form_post"
        ? "longform"
        : "shortform");
  const responseThreadFramingStyle =
    resolveThreadFramingStyle(resultData?.threadFramingStyle);
  const policyDraft =
    normalizedDraftPayload.draft && (
      args.result.outputShape === "short_form_post" ||
      args.result.outputShape === "long_form_post" ||
      args.result.outputShape === "thread_seed"
    )
      ? applyFinalDraftPolicy({
          draft: normalizedDraftPayload.draft,
          formatPreference: effectiveFormatPreference,
          isVerifiedAccount: args.isVerifiedAccount,
          userPreferences: args.userPreferences,
          styleCard: args.styleCard,
          threadFramingStyle: responseThreadFramingStyle,
        })
      : normalizedDraftPayload.draft;
  const responseVoiceTarget =
    typeof resultData?.voiceTarget === "object" || resultData?.voiceTarget === null
      ? ((resultData?.voiceTarget as VoiceTarget | null) ?? null)
      : null;
  const responseNoveltyNotes = Array.isArray(resultData?.noveltyNotes)
    ? (resultData.noveltyNotes as string[])
    : [];
  const responseGroundingSources = Array.isArray(resultData?.groundingSources)
    ? (resultData.groundingSources as GroundingPacketSourceMaterial[])
    : [];
  const responseGroundingMode =
    typeof resultData?.groundingMode === "string"
      ? (resultData.groundingMode as DraftArtifactDetails["groundingMode"])
      : null;
  const responseGroundingExplanation =
    typeof resultData?.groundingExplanation === "string"
      ? (resultData.groundingExplanation as string)
      : null;
  const rawDraftBundle =
    resultData?.draftBundle &&
    typeof resultData.draftBundle === "object" &&
    !Array.isArray(resultData.draftBundle)
      ? (resultData.draftBundle as DraftBundleResult)
      : null;
  const policyDraftBundle = rawDraftBundle
    ? {
        ...rawDraftBundle,
        options: rawDraftBundle.options.map((option) => ({
          ...option,
          draft: applyFinalDraftPolicy({
            draft: option.draft,
            formatPreference: effectiveFormatPreference,
            isVerifiedAccount: args.isVerifiedAccount,
            userPreferences: args.userPreferences,
            styleCard: args.styleCard,
            threadFramingStyle: option.threadFramingStyle ?? responseThreadFramingStyle,
          }),
        })),
      }
    : null;
  const selectedBundleOption =
    policyDraftBundle?.options.find(
      (option) => option.id === policyDraftBundle.selectedOptionId,
    ) ?? policyDraftBundle?.options[0] ?? null;
  const resolvedPolicyDraft = selectedBundleOption?.draft ?? policyDraft;
  const policyDrafts =
    policyDraftBundle?.options.map((option) => option.draft) ??
    (resolvedPolicyDraft ? [resolvedPolicyDraft] : normalizedDraftPayload.drafts);
  const draftBundlePayload = policyDraftBundle
    ? buildDraftBundleVersionPayload({
        draftBundle: policyDraftBundle,
        outputShape: args.result.outputShape,
        groundingSources: responseGroundingSources,
        groundingMode: responseGroundingMode,
        groundingExplanation: responseGroundingExplanation,
        threadPostMaxCharacterLimit: getXCharacterLimitForAccount(args.isVerifiedAccount),
      })
    : null;
  const singleDraftVersionPayload = !policyDraftBundle
    ? buildInitialDraftVersionPayload({
        draft: resolvedPolicyDraft,
        outputShape: args.result.outputShape,
        supportAsset: (resultData?.supportAsset as string) || null,
        selectedDraftContext: args.selectedDraftContext,
        groundingSources: responseGroundingSources,
        groundingMode: responseGroundingMode,
        groundingExplanation: responseGroundingExplanation,
        voiceTarget: responseVoiceTarget,
        noveltyNotes: responseNoveltyNotes,
        threadPostMaxCharacterLimit: getXCharacterLimitForAccount(args.isVerifiedAccount),
        threadFramingStyle: responseThreadFramingStyle,
      })
    : null;
  const draftVersionPayload = draftBundlePayload ?? singleDraftVersionPayload ?? {
    draftArtifacts: [],
  };

  return {
    mappedData: {
      reply: normalizedDraftPayload.reply,
      angles: args.result.responseShapePlan.shouldShowArtifacts
        ? ((resultData?.angles as unknown[]) || [])
        : [],
      quickReplies: args.result.responseShapePlan.shouldShowArtifacts
        ? ((resultData?.quickReplies as unknown[]) || [])
        : [],
      plan: args.result.responseShapePlan.shouldShowArtifacts ? args.plan : null,
      draft: resolvedPolicyDraft,
      drafts: policyDrafts,
      draftArtifacts: draftVersionPayload.draftArtifacts,
      draftVersions: draftVersionPayload.draftVersions,
      activeDraftVersionId: draftVersionPayload.activeDraftVersionId,
      previousVersionSnapshot:
        "previousVersionSnapshot" in draftVersionPayload
          ? (draftVersionPayload.previousVersionSnapshot ?? undefined)
          : undefined,
      revisionChainId: draftVersionPayload.revisionChainId,
      draftBundle: draftBundlePayload?.draftBundle ?? null,
      supportAsset:
        selectedBundleOption?.supportAsset ?? ((resultData?.supportAsset as string) || null),
      groundingSources: responseGroundingSources,
      autoSavedSourceMaterials:
        resultData?.autoSavedSourceMaterials &&
        typeof resultData.autoSavedSourceMaterials === "object"
          ? (resultData.autoSavedSourceMaterials as {
              count: number;
              assets: Array<{
                id: string;
                title: string;
                deletable: boolean;
              }>;
            })
          : null,
      outputShape: args.result.outputShape,
      surfaceMode: args.result.surfaceMode,
      memory: args.result.memory,
      routingDiagnostics: args.routingDiagnostics,
      requestTrace: {
        clientTurnId: args.clientTurnId,
      },
      replyArtifacts: null,
      replyParse: null,
    },
    responseVoiceTarget,
    responseNoveltyNotes,
    responseGroundingMode,
    responseGroundingExplanation,
  };
}

export function prepareChatRouteTurn(args: {
  rawResponse: RawOrchestratorResponse;
  plan: StrategyPlan | null;
  selectedDraftContext: SelectedDraftContext | null;
  formatPreference: DraftFormatPreference | null;
  isVerifiedAccount: boolean;
  userPreferences: UserPreferences | null;
  styleCard: VoiceStyleCard | null;
  routingDiagnostics: NormalizedChatTurnDiagnostics;
  clientTurnId: string | null;
  issuesFixed: string[];
  defaultThreadTitle: string;
  currentThreadTitle: string | null | undefined;
  nextThreadTitle: string | null;
  preferredSurfaceMode: V2ConversationMemory["preferredSurfaceMode"];
  shouldClearReplyWorkflow: boolean;
}): PreparedChatRouteTurn {
  const resultData =
    args.rawResponse.data &&
    typeof args.rawResponse.data === "object" &&
    !Array.isArray(args.rawResponse.data)
      ? (args.rawResponse.data as Record<string, unknown>)
      : undefined;
  const responseShapePlan = selectResponseShapePlan({
    outputShape: args.rawResponse.outputShape,
    response: args.rawResponse.response,
    hasQuickReplies:
      Array.isArray(resultData?.quickReplies) && resultData.quickReplies.length > 0,
    hasAngles: Array.isArray(resultData?.angles) && resultData.angles.length > 0,
    hasPlan: Boolean(resultData?.plan),
    hasDraft: typeof resultData?.draft === "string" && resultData.draft.length > 0,
    conversationState: args.rawResponse.memory.conversationState,
    preferredSurfaceMode: args.rawResponse.memory.preferredSurfaceMode,
  });
  const shapedResponse = shapeAssistantResponse({
    response: args.rawResponse.response,
    outputShape: args.rawResponse.outputShape,
    plan: responseShapePlan,
  });
  const preparedResponse = {
    ...args.rawResponse,
    response: shapedResponse,
    surfaceMode: responseShapePlan.surfaceMode,
    responseShapePlan,
  };
  const {
    mappedData: mappedDataSeed,
    responseGroundingMode,
    responseGroundingExplanation,
  } = buildChatRouteMappedData({
    result: preparedResponse,
    plan: args.plan,
    selectedDraftContext: args.selectedDraftContext,
    formatPreference: args.formatPreference,
    isVerifiedAccount: args.isVerifiedAccount,
    userPreferences: args.userPreferences,
    styleCard: args.styleCard,
    routingDiagnostics: args.routingDiagnostics,
    clientTurnId: args.clientTurnId,
  });

  return {
    rawResponse: args.rawResponse,
    responseShapePlan,
    surfaceMode: responseShapePlan.surfaceMode,
    shapedResponse,
    mappedDataSeed,
    persistencePlan: buildChatRoutePersistencePlan({
      mappedDataSeed,
      issuesFixed: args.issuesFixed,
      responseGroundingMode,
      responseGroundingExplanation,
      defaultThreadTitle: args.defaultThreadTitle,
      currentThreadTitle: args.currentThreadTitle,
      nextThreadTitle: args.nextThreadTitle,
      preferredSurfaceMode: args.preferredSurfaceMode,
      shouldClearReplyWorkflow: args.shouldClearReplyWorkflow,
    }),
  };
}

export function buildChatRoutePersistencePlan(args: {
  mappedDataSeed: ChatRouteMappedDataSeed;
  issuesFixed: string[];
  responseGroundingMode: DraftArtifactDetails["groundingMode"] | null;
  responseGroundingExplanation: string | null;
  defaultThreadTitle: string;
  currentThreadTitle: string | null | undefined;
  nextThreadTitle: string | null;
  preferredSurfaceMode: V2ConversationMemory["preferredSurfaceMode"];
  shouldClearReplyWorkflow: boolean;
}): ChatRoutePersistencePlan {
  const assistantMessageData: ChatRouteResponseData = {
    ...args.mappedDataSeed,
    threadTitle: args.currentThreadTitle || args.defaultThreadTitle,
    billing: null,
    contextPacket: buildAssistantContextPacket({
      reply: args.mappedDataSeed.reply,
      plan: args.mappedDataSeed.plan,
      draft: args.mappedDataSeed.draft,
      activeDraftVersionId: args.mappedDataSeed.activeDraftVersionId,
      revisionChainId: args.mappedDataSeed.revisionChainId,
      outputShape: args.mappedDataSeed.outputShape,
      surfaceMode: args.mappedDataSeed.surfaceMode,
      issuesFixed: args.issuesFixed,
      groundingMode: args.responseGroundingMode,
      groundingExplanation: args.responseGroundingExplanation,
      groundingSources: args.mappedDataSeed.groundingSources,
      quickReplies: args.mappedDataSeed.quickReplies,
      replyArtifacts: null,
      replyParse: null,
    }),
  };

  const primaryDraftArtifact =
    assistantMessageData.draftBundle
      ? (
          assistantMessageData.draftBundle.options.find(
            (option) => option.id === assistantMessageData.draftBundle?.selectedOptionId,
          )?.artifact ?? assistantMessageData.draftArtifacts[0]
        )
      : assistantMessageData.draftArtifacts[0] ?? null;

  return {
    assistantMessageData,
    memoryUpdate: {
      preferredSurfaceMode: args.preferredSurfaceMode,
      activeDraftVersionId: assistantMessageData.activeDraftVersionId ?? null,
      revisionChainId: assistantMessageData.revisionChainId ?? null,
      shouldClearReplyWorkflow: args.shouldClearReplyWorkflow,
    },
    threadUpdate: {
      updatedAt: new Date(),
      ...(args.nextThreadTitle ? { title: args.nextThreadTitle } : {}),
    },
    draftCandidateCreates: assistantMessageData.draftBundle?.options.map((option) => ({
      title: option.label,
      artifact: option.artifact,
      voiceTarget: option.artifact.voiceTarget ?? null,
      noveltyNotes: option.artifact.noveltyNotes ?? [],
    })) ?? [],
    analytics: {
      primaryGroundingMode: primaryDraftArtifact?.groundingMode ?? null,
      primaryGroundingSourceCount: primaryDraftArtifact?.groundingSources?.length ?? 0,
      autoSavedSourceMaterialCount: assistantMessageData.autoSavedSourceMaterials?.count ?? 0,
    },
  };
}
