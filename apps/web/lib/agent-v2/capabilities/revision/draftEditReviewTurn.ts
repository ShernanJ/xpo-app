import {
  shouldUseRevisionDraftPath,
} from "../../core/conversationHeuristics.ts";
import { buildDraftReply } from "../../responses/draftReply.ts";
import { appendCoachNote } from "../../responses/coachNote.ts";
import { prependFeedbackMemoryNotice } from "../../responses/feedbackMemoryNotice.ts";
import { isConstraintDeclaration } from "../../responses/chatResponder.ts";
import { normalizeDraftRevisionInstruction } from "./draftRevision.ts";
import { executeReplanningCapability } from "./replanningExecutor.ts";
import { prisma } from "../../../db";
import {
  executeRevisingCapability,
} from "./revisingCapability.ts";
import type { ConversationServices } from "../../runtime/services.ts";
import type {
  OrchestratorResponse,
  RoutingTracePatch,
} from "../../runtime/types.ts";
import type {
  DraftFormatPreference,
  DraftPreference,
  SessionConstraint,
  StrategyPlan,
  V2ConversationMemory,
} from "../../contracts/chat.ts";
import type { VoiceStyleCard } from "../../core/styleProfile.ts";
import type { VoiceTarget } from "../../core/voiceTarget.ts";
import type {
  CreatorProfileHints,
  GroundingPacket,
  GroundingPacketSourceMaterial,
} from "../../grounding/groundingPacket.ts";
import type { DraftRequestPolicy } from "../../grounding/requestPolicy.ts";
import type { SourceMaterialAssetRecord } from "../../grounding/sourceMaterials.ts";
import type {
  DraftGroundingMode,
  ThreadFramingStyle,
} from "../../../onboarding/draftArtifacts.ts";
import { splitSerializedThreadPosts } from "../../../onboarding/draftArtifacts.ts";
import type {
  AgentRuntimeWorkflow,
  RuntimeValidationResult,
  RuntimeWorkerExecution,
} from "../../runtime/runtimeContracts.ts";
import type { DraftingCapabilityRunResult } from "../drafting/draftingCapability.ts";
import { buildSessionConstraints } from "../../core/sessionConstraints.ts";

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

type MemoryPatch = Partial<V2ConversationMemory>;

export async function handleDraftEditReviewTurn(args: {
  memory: V2ConversationMemory;
  getMemory: () => V2ConversationMemory;
  userMessage: string;
  mode: string;
  runtimeWorkflow: AgentRuntimeWorkflow;
  threadId?: string;
  activeDraft?: string;
  focusedThreadPostIndex?: number | null;
  draftInstruction: string;
  effectiveActiveConstraints: string[];
  sessionConstraints: SessionConstraint[];
  safeFrameworkConstraint?: string | null;
  effectiveContext: string;
  relevantTopicAnchors: string[];
  styleCard: VoiceStyleCard | null;
  maxCharacterLimit: number;
  threadPostMaxCharacterLimit?: number;
  goal: string;
  antiPatterns: string[];
  turnDraftPreference: DraftPreference;
  turnFormatPreference: DraftFormatPreference;
  turnThreadFramingStyle: ThreadFramingStyle | null;
  groundingPacket: GroundingPacket;
  feedbackMemoryNotice?: string | null;
  nextAssistantTurnCount: number;
  refreshRollingSummary: boolean;
  groundingSources: GroundingPacketSourceMaterial[];
  groundingMode: DraftGroundingMode | null;
  groundingExplanation: string | null;
  baseVoiceTarget: VoiceTarget;
  creatorProfileHints?: CreatorProfileHints | null;
  requestPolicy: DraftRequestPolicy;
  selectedSourceMaterials: SourceMaterialAssetRecord[];
  shouldForceNoFabricationGuardrailForTurn: boolean;
  writeMemory: (patch: MemoryPatch) => Promise<void>;
  loadHistoricalTexts: () => Promise<string[]>;
  applyExecutionMeta: (args: {
    workers?: RuntimeWorkerExecution[];
    validations?: RuntimeValidationResult[];
  }) => void;
  applyRoutingTracePatch: (patch?: RoutingTracePatch) => void;
  setPlanFailure: (reason: string | null, failed: boolean) => void;
  buildGroundedProductClarificationQuestion: (sourceUserMessage: string) => string;
  buildGroundingPacketForContext: (
    activeConstraints: string[],
    sourceText: string,
  ) => GroundingPacket;
  runGroundedDraft: (args: {
    plan: StrategyPlan;
    activeConstraints: string[];
    sessionConstraints?: SessionConstraint[];
    activeDraft?: string;
    sourceUserMessage?: string;
    draftPreference: DraftPreference;
    formatPreference: DraftFormatPreference;
    threadFramingStyle: ThreadFramingStyle | null;
    fallbackToWriterWhenCriticRejected: boolean;
    topicSummary?: string | null;
    groundingPacket?: GroundingPacket;
    pendingPlan?: StrategyPlan | null;
  }) => Promise<DraftingCapabilityRunResult>;
  buildNoveltyNotes: (args: {
    noveltyCheck?: { isNovel: boolean; reason: string | null; maxSimilarity: number };
    retrievalReasons?: string[];
  }) => string[];
  returnClarificationQuestion: (args: {
    question: string;
    clarificationState?: V2ConversationMemory["clarificationState"] | null;
    traceReason?: string | null;
  }) => Promise<RawOrchestratorResponse>;
  returnClarificationTree: (args: {
    branchKey: "plan_reject";
    seedTopic: string | null;
    pendingPlan?: StrategyPlan | null;
    replyOverride?: string;
  }) => Promise<RawOrchestratorResponse>;
  services: Pick<
    ConversationServices,
    "generatePlan" | "generateRevisionDraft" | "critiqueDrafts" | "checkDeterministicNovelty"
  >;
}): Promise<RawOrchestratorResponse> {
  let effectiveActiveDraft = args.activeDraft;

  if (
    !effectiveActiveDraft &&
    args.runtimeWorkflow === "revise_draft" &&
    args.threadId
  ) {
    try {
      const lastDraftMessage = await prisma.chatMessage.findFirst({
        where: {
          threadId: args.threadId,
          role: "assistant",
        },
        orderBy: { createdAt: "desc" },
        select: { data: true },
      });
      const messageData = lastDraftMessage?.data as Record<string, unknown> | undefined;
      if (messageData?.draft && typeof messageData.draft === "string") {
        effectiveActiveDraft = messageData.draft;
      }
    } catch {
      // Non-critical: if recovery fails, fall through to the clarification response.
    }
  }

  if (args.runtimeWorkflow === "revise_draft" && !effectiveActiveDraft) {
    return args.returnClarificationQuestion({
      question:
        "paste the draft you want me to improve, or open one from this thread and i'll revise it.",
      traceReason: "missing_active_draft_for_edit",
    });
  }

  const persistedRevisionActiveConstraints = Array.from(
    new Set([
      ...(isConstraintDeclaration(args.userMessage)
        ? [...args.effectiveActiveConstraints, args.userMessage.trim()]
        : args.effectiveActiveConstraints),
      ...(args.safeFrameworkConstraint ? [args.safeFrameworkConstraint] : []),
    ]),
  );
  const revisionActiveConstraints = buildSessionConstraints({
    activeConstraints: persistedRevisionActiveConstraints,
    inferredConstraints: args.memory.inferredSessionConstraints,
  }).map((constraint) => constraint.text);

  if (
    shouldUseRevisionDraftPath({
      mode: args.mode,
      workflow: args.runtimeWorkflow,
      activeDraft: effectiveActiveDraft,
    }) &&
    effectiveActiveDraft
  ) {
    const revision = normalizeDraftRevisionInstruction(
      args.draftInstruction,
      effectiveActiveDraft,
      args.focusedThreadPostIndex ?? undefined,
      splitSerializedThreadPosts(effectiveActiveDraft).length > 1
        ? (args.threadPostMaxCharacterLimit ?? args.maxCharacterLimit)
        : args.maxCharacterLimit,
    );

    if (revision.scope === "thread_span" && !revision.targetSpan) {
      return args.returnClarificationQuestion({
        question:
          "which part of the thread should i change: the opener, a specific post, the ending, or the whole thread?",
        traceReason: "ambiguous_thread_revision_target",
      });
    }

    const execution = await executeRevisingCapability({
      workflow: "revise_draft",
      capability: "revising",
      activeContextRefs: [
        "memory.latestRefinementInstruction",
        "memory.activeDraftRef",
        "memory.topicSummary",
        "memory.rollingSummary",
      ],
      context: {
        memory: args.memory,
        activeDraft: effectiveActiveDraft,
        revision,
        revisionActiveConstraints,
        persistedActiveConstraints: persistedRevisionActiveConstraints,
        inferredSessionConstraints: args.memory.inferredSessionConstraints || [],
        sessionConstraints: buildSessionConstraints({
          activeConstraints: persistedRevisionActiveConstraints,
          inferredConstraints: args.memory.inferredSessionConstraints,
        }),
        effectiveContext: args.effectiveContext,
        relevantTopicAnchors: args.relevantTopicAnchors,
        styleCard: args.styleCard,
        maxCharacterLimit: args.maxCharacterLimit,
        goal: args.goal,
        antiPatterns: args.antiPatterns,
        turnDraftPreference: args.turnDraftPreference,
        turnFormatPreference: args.turnFormatPreference,
        threadPostMaxCharacterLimit: args.threadPostMaxCharacterLimit,
        turnThreadFramingStyle: args.turnThreadFramingStyle,
        userMessage: args.userMessage,
        groundingPacket: args.groundingPacket,
        feedbackMemoryNotice: args.feedbackMemoryNotice,
        creatorProfileHints: args.creatorProfileHints,
        requestPolicy: args.requestPolicy,
        nextAssistantTurnCount: args.nextAssistantTurnCount,
        refreshRollingSummary: args.refreshRollingSummary,
        latestRefinementInstruction: args.draftInstruction,
        groundingSources: args.groundingSources,
        groundingMode: args.groundingMode,
        groundingExplanation: args.groundingExplanation,
      },
      services: {
        generateRevisionDraft: args.services.generateRevisionDraft,
        critiqueDrafts: args.services.critiqueDrafts,
        buildClarificationResponse: () =>
          args.returnClarificationQuestion({
            question: args.buildGroundedProductClarificationQuestion(
              effectiveActiveDraft || args.memory.topicSummary || args.userMessage,
            ),
          }),
        escalateFormatConversion: async () => {
          if (revision.targetFormat !== "thread") {
            return null;
          }

          const historicalTexts = await args.loadHistoricalTexts();
          const replanningExecution = await executeReplanningCapability({
            workflow: "plan_then_draft",
            capability: "planning",
            activeContextRefs: [
              "memory.pendingPlan",
              "memory.latestRefinementInstruction",
              "memory.topicSummary",
              "memory.rollingSummary",
            ],
            context: {
              memory: args.memory,
              userMessage: args.userMessage,
              draftInstruction: revision.instruction,
              revisionActiveConstraints,
              persistedActiveConstraints: persistedRevisionActiveConstraints,
              inferredSessionConstraints: args.memory.inferredSessionConstraints || [],
              sessionConstraints: buildSessionConstraints({
                activeConstraints: persistedRevisionActiveConstraints,
                inferredConstraints: args.memory.inferredSessionConstraints,
              }),
              effectiveContext: args.effectiveContext,
              activeDraft: effectiveActiveDraft,
              historicalTexts,
              goal: args.goal,
              antiPatterns: args.antiPatterns,
              turnDraftPreference: args.turnDraftPreference,
              turnFormatPreference: "thread",
              baseVoiceTarget: args.baseVoiceTarget,
              creatorProfileHints: args.creatorProfileHints,
              selectedSourceMaterials: args.selectedSourceMaterials,
              shouldForceNoFabricationGuardrailForTurn:
                args.shouldForceNoFabricationGuardrailForTurn,
              styleCard: args.styleCard,
              nextAssistantTurnCount: args.nextAssistantTurnCount,
              refreshRollingSummary: args.refreshRollingSummary,
              feedbackMemoryNotice: args.feedbackMemoryNotice,
              requestPolicy: args.requestPolicy,
              turnThreadFramingStyle: args.turnThreadFramingStyle,
              groundingPacket: args.groundingPacket,
              groundingSources: args.groundingSources,
              groundingMode: args.groundingMode,
              groundingExplanation: args.groundingExplanation,
            },
            services: {
              generatePlan: args.services.generatePlan,
              checkDeterministicNovelty: args.services.checkDeterministicNovelty,
              buildGroundingPacketForContext: args.buildGroundingPacketForContext,
              runDraft: ({ plan, activeConstraints, groundingPacket }) =>
                args.runGroundedDraft({
                  plan,
                  activeConstraints,
                  sessionConstraints: buildSessionConstraints({
                    activeConstraints: persistedRevisionActiveConstraints,
                    inferredConstraints: plan.extractedConstraints,
                  }),
                  activeDraft: effectiveActiveDraft,
                  sourceUserMessage: revision.instruction,
                  draftPreference: plan.deliveryPreference || args.turnDraftPreference,
                  formatPreference: "thread",
                  threadFramingStyle: args.turnThreadFramingStyle,
                  fallbackToWriterWhenCriticRejected: false,
                  topicSummary: plan.objective,
                  groundingPacket,
                }),
              handleNoveltyConflict: (planObjective) =>
                args.returnClarificationTree({
                  branchKey: "plan_reject",
                  seedTopic: planObjective,
                  pendingPlan: null,
                  replyOverride:
                    "that version felt too close to something you've already posted. let's shift it.",
                }),
              buildNoveltyNotes: args.buildNoveltyNotes,
            },
          });

          if (replanningExecution.output.kind !== "draft_ready") {
            return null;
          }

          const issuesFixed =
            replanningExecution.output.responseSeed.data?.issuesFixed ?? [
              "rebuilt the draft into a thread",
            ];

          return {
            workflow: "revise_draft",
            capability: "revising",
            output: {
              kind: "revision_ready",
              responseSeed: {
                ...replanningExecution.output.responseSeed,
                response: prependFeedbackMemoryNotice(
                  appendCoachNote({
                    response: buildDraftReply({
                      userMessage: args.userMessage,
                      draftPreference: args.turnDraftPreference,
                      isEdit: true,
                      issuesFixed,
                      styleCard: args.styleCard,
                      revisionChangeKind: revision.changeKind,
                      revisionTargetFormat: revision.targetFormat ?? null,
                      directReturn: true,
                    }),
                    userMessage: args.userMessage,
                    plan:
                      replanningExecution.output.responseSeed.data?.plan ?? null,
                    creatorProfileHints: args.creatorProfileHints,
                    requestPolicy: args.requestPolicy,
                  }),
                  args.feedbackMemoryNotice ?? null,
                ),
              },
              memoryPatch: {
                conversationState: "editing",
                activeConstraints: replanningExecution.output.memoryPatch.activeConstraints,
                inferredSessionConstraints:
                  replanningExecution.output.memoryPatch.inferredSessionConstraints,
                pendingPlan: null,
                clarificationState: null,
                rollingSummary: replanningExecution.output.memoryPatch.rollingSummary,
                assistantTurnCount: replanningExecution.output.memoryPatch.assistantTurnCount,
                formatPreference: "thread",
                latestRefinementInstruction: args.draftInstruction,
                unresolvedQuestion: null,
              },
            },
            workers: replanningExecution.workers,
            validations: replanningExecution.validations,
          };
        },
      },
    });

    args.applyExecutionMeta({
      workers: execution.workers,
      validations: execution.validations,
    });

    if (execution.output.kind === "response") {
      return execution.output.response;
    }

    await args.writeMemory(execution.output.memoryPatch);

    return {
      ...execution.output.responseSeed,
      memory: args.getMemory(),
    };
  }

  const historicalTexts = await args.loadHistoricalTexts();
  const execution = await executeReplanningCapability({
    workflow: "plan_then_draft",
    capability: "planning",
    activeContextRefs: [
      "memory.pendingPlan",
      "memory.latestRefinementInstruction",
      "memory.topicSummary",
      "memory.rollingSummary",
    ],
    context: {
      memory: args.memory,
      userMessage: args.userMessage,
      draftInstruction: args.draftInstruction,
      revisionActiveConstraints,
      persistedActiveConstraints: persistedRevisionActiveConstraints,
      inferredSessionConstraints: args.memory.inferredSessionConstraints || [],
      sessionConstraints: buildSessionConstraints({
        activeConstraints: persistedRevisionActiveConstraints,
        inferredConstraints: args.memory.inferredSessionConstraints,
      }),
      effectiveContext: args.effectiveContext,
      activeDraft: args.activeDraft,
      historicalTexts,
      goal: args.goal,
      antiPatterns: args.antiPatterns,
      turnDraftPreference: args.turnDraftPreference,
      turnFormatPreference: args.turnFormatPreference,
      baseVoiceTarget: args.baseVoiceTarget,
      creatorProfileHints: args.creatorProfileHints,
      selectedSourceMaterials: args.selectedSourceMaterials,
      shouldForceNoFabricationGuardrailForTurn:
        args.shouldForceNoFabricationGuardrailForTurn,
      styleCard: args.styleCard,
      nextAssistantTurnCount: args.nextAssistantTurnCount,
      refreshRollingSummary: args.refreshRollingSummary,
      feedbackMemoryNotice: args.feedbackMemoryNotice,
      requestPolicy: args.requestPolicy,
      turnThreadFramingStyle: args.turnThreadFramingStyle,
      groundingPacket: args.groundingPacket,
      groundingSources: args.groundingSources,
      groundingMode: args.groundingMode,
      groundingExplanation: args.groundingExplanation,
    },
    services: {
      generatePlan: args.services.generatePlan,
      checkDeterministicNovelty: args.services.checkDeterministicNovelty,
      buildGroundingPacketForContext: args.buildGroundingPacketForContext,
      runDraft: ({ plan, activeConstraints, groundingPacket }) =>
        args.runGroundedDraft({
          plan,
          activeConstraints,
          sessionConstraints: buildSessionConstraints({
            activeConstraints: persistedRevisionActiveConstraints,
            inferredConstraints: args.memory.inferredSessionConstraints,
            pendingPlan: plan,
          }),
          activeDraft: args.activeDraft,
          sourceUserMessage: args.draftInstruction,
          draftPreference: plan.deliveryPreference || args.turnDraftPreference,
          formatPreference: plan.formatPreference || args.turnFormatPreference,
          threadFramingStyle: args.turnThreadFramingStyle,
          fallbackToWriterWhenCriticRejected: false,
          topicSummary: plan.objective,
          groundingPacket,
        }),
      handleNoveltyConflict: (planObjective) =>
        args.returnClarificationTree({
          branchKey: "plan_reject",
          seedTopic: planObjective,
          pendingPlan: null,
          replyOverride:
            "that version felt too close to something you've already posted. let's shift it.",
        }),
      buildNoveltyNotes: args.buildNoveltyNotes,
    },
  });

  args.applyExecutionMeta({
    workers: execution.workers,
    validations: execution.validations,
  });

  if (execution.output.kind === "plan_failure") {
    args.setPlanFailure(execution.output.failureReason, true);
    return {
      ...execution.output.responseSeed,
      memory: args.getMemory(),
    };
  }

  args.setPlanFailure(null, false);

  if (execution.output.kind === "response") {
    args.applyRoutingTracePatch(execution.output.routingTracePatch);
    return execution.output.response;
  }

  await args.writeMemory(execution.output.memoryPatch);

  return {
    ...execution.output.responseSeed,
    memory: args.getMemory(),
  };
}
