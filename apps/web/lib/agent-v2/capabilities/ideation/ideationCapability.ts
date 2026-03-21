import {
  extractIdeaTitlesFromIdeas,
  inferTopicFromIdeaTitles,
  looksGenericTopicSummary,
} from "../planning/clarificationHeuristics.ts";
import type { ConversationServices } from "../../runtime/services.ts";
import type { OrchestratorResponse } from "../../runtime/types.ts";
import { buildIdeationReply } from "../../responses/ideationReply.ts";
import { buildIdeationQuickReplies } from "../../responses/ideationQuickReplies.ts";
import {
  isBareDraftRequest,
  isBareIdeationRequest,
} from "../../core/conversationHeuristics.ts";
import { isOpenEndedWildcardDraftRequest } from "../planning/draftFastStart.ts";
import { prependFeedbackMemoryNotice } from "../../responses/feedbackMemoryNotice.ts";
import {
  buildRollingSummary,
  shouldRefreshRollingSummary,
} from "../../memory/summaryManager.ts";
import type {
  DraftFormatPreference,
  V2ConversationMemory,
} from "../../contracts/chat.ts";
import type { VoiceStyleCard } from "../../core/styleProfile.ts";
import type {
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  RuntimeResponseSeed,
} from "../../runtime/runtimeContracts.ts";
import { compactTopicLabel } from "../../responses/draftTopicSelector.ts";

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

type RawResponseSeed = RuntimeResponseSeed<RawOrchestratorResponse>;

export interface IdeationCapabilityContext {
  userMessage: string;
  promptMessage?: string;
  responseUserMessage?: string;
  topicSummaryOverride?: string | null;
  memory: V2ConversationMemory;
  effectiveContext: string;
  styleCard: VoiceStyleCard | null;
  relevantTopicAnchors: string[];
  userContextString: string;
  goal: string;
  antiPatterns: string[];
  effectiveActiveConstraints: string[];
  turnFormatPreference: DraftFormatPreference;
  nextAssistantTurnCount: number;
  feedbackMemoryNotice?: string | null;
}

export interface IdeationCapabilityMemoryPatch {
  topicSummary?: string | null;
  lastIdeationAngles?: string[];
  conversationState: "ready_to_ideate";
  pendingPlan: null;
  clarificationState: null;
  assistantTurnCount: number;
  rollingSummary: string | null;
  latestRefinementInstruction: null;
  unresolvedQuestion: null;
}

export interface IdeationCapabilityOutput {
  responseSeed: RawResponseSeed;
  memoryPatch: IdeationCapabilityMemoryPatch;
}

function extractAngleTitle(angle: { title?: string | null } | string): string {
  if (typeof angle === "string") {
    return angle.trim();
  }

  return typeof angle.title === "string" ? angle.title.trim() : "";
}

function normalizePrimaryAngleTitle(value: string): string {
  return value
    .trim()
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^(?:angle|idea|option|hook)\s*[:\-]\s*/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/, "")
    .trim();
}

function sanitizeAngleSeed(value: string | null | undefined): string | null {
  const compact = value ? compactTopicLabel(value) : null;
  if (!compact || compact === "your usual lane") {
    return null;
  }

  return compact;
}

function buildPrimaryAngleFallbacks(args: {
  seed: string | null;
  formatHint: "post" | "thread";
}): string[] {
  if (args.seed) {
    return args.formatHint === "thread"
      ? [
          `the hard lesson behind ${args.seed}`,
          `the mistake most people make with ${args.seed}`,
          `the playbook for ${args.seed}`,
        ]
      : [
          `the hard lesson behind ${args.seed}`,
          `the mistake most people make with ${args.seed}`,
          `the playbook behind ${args.seed}`,
        ];
  }

  return args.formatHint === "thread"
    ? [
        "the hard lesson behind a recent win",
        "the mistake people keep repeating",
        "the playbook behind a result",
      ]
    : [
        "a hard lesson that changed how you work",
        "the mistake people keep repeating",
        "the playbook behind a recent win",
      ];
}

function looksUnusablePrimaryAngleTitle(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return (
    normalized.length < 12 ||
    normalized.length > 96 ||
    /\?$/.test(normalized) ||
    /^(?:what|why|how|where|when|who|which|is|are|do|does|did|can|could|would|should)\b/.test(
      normalized,
    ) ||
    /\b(?:example angle|one-sentence summary|bullet list|max 5 words|cta|structure)\b/.test(
      normalized,
    )
  );
}

function coercePrimaryIdeationAngles(args: {
  angles: Array<{ title?: string | null } | string> | null | undefined;
  formatHint: "post" | "thread";
  fallbackSeed: string | null;
}): Array<{ title: string }> {
  const normalizedAngles: Array<{ title: string }> = [];
  const seen = new Set<string>();
  const fallbacks = buildPrimaryAngleFallbacks({
    seed: args.fallbackSeed,
    formatHint: args.formatHint,
  });

  const addAngle = (title: string) => {
    const normalizedTitle = normalizePrimaryAngleTitle(title);
    if (!normalizedTitle) {
      return;
    }

    const key = normalizedTitle.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    normalizedAngles.push({ title: normalizedTitle });
  };

  for (const [index, angle] of (args.angles || []).entries()) {
    const rawTitle = normalizePrimaryAngleTitle(extractAngleTitle(angle));
    if (!rawTitle) {
      continue;
    }

    addAngle(looksUnusablePrimaryAngleTitle(rawTitle) ? fallbacks[index % fallbacks.length] : rawTitle);
    if (normalizedAngles.length >= 3) {
      return normalizedAngles.slice(0, 3);
    }
  }

  for (const fallback of fallbacks) {
    addAngle(fallback);
    if (normalizedAngles.length >= 3) {
      return normalizedAngles.slice(0, 3);
    }
  }

  return normalizedAngles.slice(0, 3);
}

export async function executeIdeationCapability(
  args: CapabilityExecutionRequest<IdeationCapabilityContext> & {
    services: Pick<ConversationServices, "generateIdeasMenu">;
  },
): Promise<CapabilityExecutionResult<IdeationCapabilityOutput>> {
  const {
    context,
    services,
  } = args;
  const ideationPromptMessage = context.promptMessage || context.userMessage;
  const ideationReplyMessage = context.responseUserMessage || context.userMessage;
  const ideationTopicSummary =
    context.topicSummaryOverride !== undefined
      ? context.topicSummaryOverride
      : context.memory.topicSummary;

  const ideas = await services.generateIdeasMenu(
    ideationPromptMessage,
    ideationTopicSummary,
    context.effectiveContext,
    context.styleCard,
    context.relevantTopicAnchors,
    context.userContextString,
    {
      goal: context.goal,
      conversationState: context.memory.conversationState,
      antiPatterns: context.antiPatterns,
      activeConstraints: context.effectiveActiveConstraints,
      activeTaskSummary: context.memory.rollingSummary,
      activePlan: context.memory.pendingPlan,
      latestRefinementInstruction: context.memory.latestRefinementInstruction,
      lastIdeationAngles: context.memory.lastIdeationAngles,
    },
  );

  const currentIdeaTitles = extractIdeaTitlesFromIdeas(ideas?.angles);
  const inferredIdeaTopic = inferTopicFromIdeaTitles(currentIdeaTitles);
  const currentTopicSummary = looksGenericTopicSummary(ideationTopicSummary)
    ? null
    : ideationTopicSummary;
  const ideationFormatHint =
    context.turnFormatPreference === "thread" ? "thread" : "post";
  const usesPrimaryAngleChips =
    isBareDraftRequest(ideationReplyMessage) ||
    isOpenEndedWildcardDraftRequest(ideationReplyMessage);
  const primaryAngles = usesPrimaryAngleChips
    ? coercePrimaryIdeationAngles({
        angles: ideas?.angles,
        formatHint: ideationFormatHint,
        fallbackSeed:
          sanitizeAngleSeed(currentTopicSummary) ||
          sanitizeAngleSeed(inferredIdeaTopic) ||
          sanitizeAngleSeed(context.relevantTopicAnchors[0]) ||
          null,
      })
    : [];
  const responseAngles = usesPrimaryAngleChips ? primaryAngles : ideas?.angles || [];
  const responseIdeaTitles = extractIdeaTitlesFromIdeas(responseAngles);
  const responseInferredIdeaTopic = inferTopicFromIdeaTitles(responseIdeaTitles);
  const nextIdeationTopicSummary =
    isBareIdeationRequest(ideationReplyMessage) ||
    isBareDraftRequest(ideationReplyMessage) ||
    isOpenEndedWildcardDraftRequest(ideationReplyMessage)
      ? currentTopicSummary || responseInferredIdeaTopic
      : ideationPromptMessage;
  const quickReplies = buildIdeationQuickReplies({
    styleCard: context.styleCard,
    seedTopic: nextIdeationTopicSummary || currentTopicSummary,
    mode: usesPrimaryAngleChips ? "primary_angle_picks" : "follow_up",
    angles: responseAngles,
    formatHint: ideationFormatHint,
  });

  return {
    workflow: args.workflow,
    capability: args.capability,
    output: {
      responseSeed: {
        mode: "ideate",
        outputShape: "ideation_angles",
        response: prependFeedbackMemoryNotice(
          buildIdeationReply({
            intro: ideas?.intro || "",
            close: ideas?.close || "",
            userMessage: ideationReplyMessage,
            styleCard: context.styleCard,
            primaryAngleChipMode: usesPrimaryAngleChips,
          }),
          context.feedbackMemoryNotice ?? null,
        ),
        data: responseAngles.length > 0 || quickReplies.length > 0
          ? {
              angles: responseAngles,
              ideationFormatHint,
              quickReplies,
            }
          : undefined,
      },
      memoryPatch: {
        ...(nextIdeationTopicSummary !== context.memory.topicSummary
          ? { topicSummary: nextIdeationTopicSummary }
          : {}),
        ...(responseIdeaTitles.length > 0
          ? { lastIdeationAngles: responseIdeaTitles }
          : {}),
        conversationState: "ready_to_ideate",
        pendingPlan: null,
        clarificationState: null,
        assistantTurnCount: context.nextAssistantTurnCount,
        rollingSummary: shouldRefreshRollingSummary(
          context.nextAssistantTurnCount,
          false,
        )
          ? buildRollingSummary({
              currentSummary: context.memory.rollingSummary,
              topicSummary: nextIdeationTopicSummary || currentTopicSummary,
              approvedPlan: null,
              activeConstraints: context.effectiveActiveConstraints,
              latestDraftStatus: "Ideation in progress",
              formatPreference:
                context.memory.formatPreference || context.turnFormatPreference,
              unresolvedQuestion: usesPrimaryAngleChips ? null : ideas?.close || null,
            })
          : context.memory.rollingSummary,
        latestRefinementInstruction: null,
        unresolvedQuestion: null,
      },
    },
    workers: [
      {
        worker: "ideator",
        capability: "ideation",
        phase: "execution",
        mode: "sequential",
        status: "completed",
        groupId: null,
        details: {
          angleCount: responseAngles.length,
          topicSummary: nextIdeationTopicSummary,
        },
      },
    ],
  };
}
