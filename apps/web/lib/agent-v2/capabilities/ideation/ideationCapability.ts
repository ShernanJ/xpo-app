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
} from "../../orchestrator/conversationManagerLogic.ts";
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
    },
  );

  const currentIdeaTitles = extractIdeaTitlesFromIdeas(ideas?.angles);
  const inferredIdeaTopic = inferTopicFromIdeaTitles(currentIdeaTitles);
  const currentTopicSummary = looksGenericTopicSummary(ideationTopicSummary)
    ? null
    : ideationTopicSummary;
  const nextIdeationTopicSummary =
    isBareIdeationRequest(ideationReplyMessage) ||
    isBareDraftRequest(ideationReplyMessage) ||
    isOpenEndedWildcardDraftRequest(ideationReplyMessage)
      ? currentTopicSummary || inferredIdeaTopic
      : ideationPromptMessage;

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
          }),
          context.feedbackMemoryNotice ?? null,
        ),
        data: ideas
          ? {
              angles: ideas.angles,
              quickReplies: buildIdeationQuickReplies({
                styleCard: context.styleCard,
                seedTopic: nextIdeationTopicSummary || currentTopicSummary,
              }),
            }
          : undefined,
      },
      memoryPatch: {
        ...(nextIdeationTopicSummary !== context.memory.topicSummary
          ? { topicSummary: nextIdeationTopicSummary }
          : {}),
        ...(currentIdeaTitles.length > 0
          ? { lastIdeationAngles: currentIdeaTitles }
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
              unresolvedQuestion: ideas?.close || null,
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
          angleCount: ideas?.angles?.length ?? 0,
          topicSummary: nextIdeationTopicSummary,
        },
      },
    ],
  };
}
