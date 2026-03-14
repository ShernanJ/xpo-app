import {
  buildGroundedTopicDraftInput,
  inferDraftPreference,
  extractPriorUserTurn,
  buildPlanPitch,
  buildAmbiguousReferenceQuestion,
  inferMissingSpecificQuestion,
  buildNaturalDraftClarificationQuestion,
  looksLikeOpaqueEntityTopic,
  isLazyDraftRequest,
  inferLooseClarificationSeed,
  inferAbstractTopicSeed,
  withPlanPreferences,
  looksGenericTopicSummary,
  buildDraftGroundingSummary,
  inferDraftFormatPreference,
  resolveRequestedThreadFramingStyle,
  type ConversationServices,
  type OrchestratorResponse,
} from "./draftPipelineHelpers";
import {
  buildPlanFailureResponse,
  isBareDraftRequest,
  isMultiDraftRequest,
  resolveDraftOutputShape,
  shouldRouteCareerClarification,
  shouldUseRevisionDraftPath,
} from "./conversationManagerLogic";
import type { WriterOutput } from "../agents/writer";
import type { CriticOutput } from "../agents/critic";
import {
  buildEffectiveContext,
  buildFactSafeReferenceHints,
  retrieveRelevantContext,
} from "../memory/contextRetriever";
import {
  buildRollingSummary,
  shouldRefreshRollingSummary,
} from "../memory/summaryManager";
import { resolveVoiceTarget, type VoiceTarget } from "../core/voiceTarget";
import {
  getXCharacterLimitForFormat,
  getXCharacterLimitForAccount,
  type ThreadFramingStyle,
} from "../../onboarding/draftArtifacts";
import { prisma } from "../../db";
import { buildClarificationTree } from "./clarificationTree";
import { buildPlannerQuickReplies } from "./plannerQuickReplies";
import {
  buildSemanticCorrectionAcknowledgment,
  buildSemanticRepairDirective,
  buildSemanticRepairState,
  hasConcreteCorrectionDetail,
  inferCorrectionRepairQuestion,
  inferIdeationRationaleReply,
  inferPostReferenceReply,
  inferSourceTransparencyReply,
  looksLikeConfusionPing,
  looksLikePostReferenceRequest,
  looksLikeSourceTransparencyRequest,
  looksLikeSemanticCorrection,
} from "./correctionRepair";
import { normalizeDraftRevisionInstruction } from "./draftRevision";
import {
  assessGroundedProductDrift,
  assessConcreteSceneDrift,
  buildGroundedProductRetryConstraint,
  buildUnsupportedClaimRetryConstraint,
  buildConcreteSceneRetryConstraint,
  extractConcreteSceneAnchors,
  NO_FABRICATION_CONSTRAINT,
  NO_FABRICATION_MUST_AVOID,
} from "./draftGrounding";
import { isConstraintDeclaration } from "./chatResponder";
import { buildDraftReply } from "./draftReply";
import {
  buildFeedbackMemoryNotice,
  prependFeedbackMemoryNotice,
} from "./feedbackMemoryNotice";
import { interpretPlannerFeedback } from "./plannerFeedback";
import {
  inferBroadTopicDraftRequest,
  isOpenEndedWildcardDraftRequest,
  shouldForceLooseDraftIdeation,
  shouldFastStartGroundedDraft,
} from "./draftFastStart.ts";
import { stripSelectedAnglePromptPrefix } from "./selectedAnglePrompt.ts";
import { resolveConversationRouterState } from "./conversationRouterMachine";
import { evaluateDraftContextSlots } from "./draftContextSlots";
import {
  appendNoFabricationConstraint,
  buildDraftMeaningResponse,
  hasNoFabricationPlanGuardrail,
  isDraftMeaningQuestion,
  shouldForceNoFabricationPlanGuardrail,
  withNoFabricationPlanGuardrail,
} from "./draftGrounding";
import {
  addGroundingUnknowns,
  buildGroundingPacket,
  buildSafeFrameworkConstraint,
  hasAutobiographicalGrounding,
  type GroundingPacket,
} from "./groundingPacket";
import {
  applyCreatorProfileHintsToPlan,
  mapPreferredOutputShapeToFormatPreference,
} from "./creatorHintPolicy";
import { checkDraftClaimsAgainstGrounding } from "./claimChecker";
import { applySourceMaterialBiasToPlan } from "./sourceMaterialPlanPolicy";
import { buildSourceMaterialDraftConstraints } from "./sourceMaterialDraftPolicy";
import {
  mergeSourceMaterialsIntoGroundingPacket,
  selectRelevantSourceMaterials,
  type SourceMaterialAssetRecord,
} from "./sourceMaterials";
import {
  buildDraftBundleBriefs,
  type DraftBundleResult,
} from "./draftBundles";
import type {
  CreatorChatQuickReply,
  DraftFormatPreference,
  DraftPreference,
  StrategyPlan,
  V2ConversationMemory,
} from "../contracts/chat";
import type { TurnContext } from "./turnContextBuilder";
import type { RoutingPolicyResult } from "./routingPolicy";
import { saveConversationTurnMemory } from "./memoryPolicy";
import { summarizeRuntimeWorkerExecutions } from "../runtime/runtimeTrace.ts";
import type { AgentRuntimeWorkflow } from "../runtime/runtimeContracts.ts";
import { executeIdeationCapability } from "./ideationExecutor.ts";
import { executePlanningCapability } from "./planningExecutor.ts";
import { executeDraftingCapability } from "./draftingExecutor.ts";
import { executeRevisingCapability } from "./revisingExecutor.ts";

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

function resolveLegacyRuntimeWorkflow(mode: string): AgentRuntimeWorkflow {
  switch (mode) {
    case "ideate":
      return "ideate";
    case "plan":
    case "draft":
      return "plan_then_draft";
    case "edit":
    case "review":
      return "revise_draft";
    default:
      return "answer_question";
  }
}

export async function executeDraftPipeline(args: {
  context: TurnContext;
  routing: RoutingPolicyResult;
  services: ConversationServices;
  extractedFacts: string[] | null;
  extractedRules: string[] | null;
  sourceMaterialAssets: SourceMaterialAssetRecord[];
  autoSavedSourceMaterials:
    | {
        count: number;
        assets: Array<{
          id: string;
          title: string;
          deletable: boolean;
        }>;
      }
    | undefined;
  antiPatternResult: {
    antiPatterns: string[];
    remembered: boolean;
  };
  rememberedStyleRuleCount: number;
  rememberedFactCount: number;
  feedbackMemoryNotice?: string;
  preloadedRun?: Awaited<ReturnType<ConversationServices["getOnboardingRun"]>>;
}): Promise<RawOrchestratorResponse> {
  const {
    context,
    routing,
    services,
    extractedFacts,
    sourceMaterialAssets,
    antiPatternResult,
    preloadedRun,
    rememberedStyleRuleCount,
    rememberedFactCount,
  } = args;
  
  // Destructure context
  let { memory } = context;
  const {
    userId,
    userMessage,
    planSeedMessage,
    recentHistory,
    activeDraft,
    styleCard,
    anchors,
    effectiveXHandle,
    effectiveActiveConstraints,
    formatPreference,
    creatorProfileHints,
    runId,
    threadId,
    turnPlan,
    explicitIntent,
    threadFramingStyle
  } = context;

  const { routingTrace } = routing;
  let mode = routing.resolvedMode; // resolvedMode;
  let runtimeWorkflow =
    routingTrace.runtimeResolution?.workflow || resolveLegacyRuntimeWorkflow(mode);
  const applyPipelineWorkflowOverride = (nextMode: typeof mode) => {
    mode = nextMode;
    runtimeWorkflow = resolveLegacyRuntimeWorkflow(nextMode);
    routingTrace.runtimeResolution = {
      workflow: runtimeWorkflow,
      source: "pipeline_continuation",
    };
  };
  const mergeCapabilityExecutionMeta = (args: {
    workers?: NonNullable<typeof routingTrace.workerExecutions>;
    validations?: NonNullable<typeof routingTrace.validations>;
  }) => {
    if (args.workers?.length) {
      routingTrace.workerExecutions.push(...args.workers);
      routingTrace.workerExecutionSummary = summarizeRuntimeWorkerExecutions(
        routingTrace.workerExecutions,
      );
    }
    if (args.validations?.length) {
      routingTrace.validations.push(...args.validations);
    }
  };

  // We rewrite writeMemory locally to call saveConversationTurnMemory

  const antiPatterns = antiPatternResult.antiPatterns;
  const suppressFeedbackMemoryNotice =
    looksLikeSemanticCorrection(userMessage) ||
    looksLikeSourceTransparencyRequest(userMessage) ||
    looksLikePostReferenceRequest(userMessage) ||
    looksLikeConfusionPing(userMessage);
  const feedbackMemoryNotice = buildFeedbackMemoryNotice({
    styleCard,
    rememberedStyleRuleCount,
    rememberedFactCount,
    rememberedAntiPattern: antiPatternResult.remembered,
    suppress: suppressFeedbackMemoryNotice,
  });

  const selectedSourceMaterials = selectRelevantSourceMaterials({
    assets: sourceMaterialAssets,
    userMessage,
    topicSummary: memory.topicSummary,
    limit: 2,
  });
  const buildGroundingPacketForContext = (
    activeConstraints: string[],
    sourceText: string,
  ): GroundingPacket => {
    let nextPacket = buildGroundingPacket({
      styleCard,
      activeConstraints,
      extractedFacts,
    });
    nextPacket = mergeSourceMaterialsIntoGroundingPacket({
      groundingPacket: nextPacket,
      sourceMaterials: selectedSourceMaterials,
    });
    return addGroundingUnknowns(
      nextPacket,
      evaluateDraftContextSlots({
        userMessage: sourceText,
        topicSummary: memory.topicSummary,
        contextAnchors: [
          ...(nextPacket.factualAuthority || nextPacket.durableFacts),
          ...(nextPacket.voiceContextHints || []),
        ],
      }),
      sourceText.trim().length,
    );
  };
  const groundingPacket = buildGroundingPacketForContext(
    effectiveActiveConstraints,
    userMessage,
  );
  const factualContext = groundingPacket.factualAuthority || groundingPacket.durableFacts;
  const voiceContextHints = groundingPacket.voiceContextHints || [];
  const slotContextAnchors = [...factualContext, ...voiceContextHints];
  const groundingSourcesForTurn = groundingPacket.sourceMaterials.slice(0, 2);
  if (selectedSourceMaterials.length > 0) {
    services.markSourceMaterialAssetsUsed(selectedSourceMaterials.map((asset) => asset.id)).catch((error: unknown) =>
      console.error("Failed to update source material last-used timestamps:", error),
    );
  }
  const turnDraftContextSlots = evaluateDraftContextSlots({
    userMessage,
    topicSummary: memory.topicSummary,
    contextAnchors: slotContextAnchors,
  });
  const relevantTopicAnchors = retrieveRelevantContext({
    userMessage,
    topicSummary: memory.topicSummary,
    rollingSummary: memory.rollingSummary,
    topicAnchors: anchors.topicAnchors,
    factualContext,
    voiceContextHints,
    activeConstraints: effectiveActiveConstraints,
  });
  const shouldForceNoFabricationGuardrailForTurn = shouldForceNoFabricationPlanGuardrail({
    userMessage,
    behaviorKnown: turnDraftContextSlots.behaviorKnown,
    stakesKnown: turnDraftContextSlots.stakesKnown,
  });
  const missingAutobiographicalGroundingForTurn =
    (turnDraftContextSlots.domainHint === "product" ||
      turnDraftContextSlots.domainHint === "career") &&
    groundingPacket.unknowns.length > 0 &&
    !hasAutobiographicalGrounding(groundingPacket);

  const storedRun = preloadedRun;
  const onboardingResult = storedRun?.result as Record<string, unknown> | undefined;
  const onboardingProfile = onboardingResult?.profile as Record<string, unknown> | undefined;
  const isVerifiedAccount = onboardingProfile?.isVerified === true;
  const stage = typeof onboardingResult?.growthStage === "string"
    ? onboardingResult.growthStage
    : "Unknown";
  const strategyState = onboardingResult?.strategyState as Record<string, unknown> | undefined;
  const goal = typeof strategyState?.goal === "string" ? strategyState.goal : "Audience growth";
  const contextAnchorsStr =
    factualContext.length > 0
      ? `\n- Known Facts: ${factualContext.join(" | ")}`
      : "";
  const voiceHintsStr =
    voiceContextHints.length > 0
      ? `\n- Voice/Territory Hints: ${voiceContextHints.join(" | ")}`
      : "";

  const userContextString = `
User Profile Summary:
- Stage: ${stage}
- Primary Goal: ${goal}${contextAnchorsStr}${voiceHintsStr}
  `.trim();

  const writeMemoryLocal = async (
    patch: Parameters<typeof saveConversationTurnMemory>[0]["patch"],
  ) => {
    memory = await saveConversationTurnMemory({
      memory,
      patch,
      runId,
      threadId,
      services
    });
  };

  function buildClarificationPatch(question: string) {
    return {
      unresolvedQuestion: question,
      clarificationQuestionsAsked: memory.clarificationQuestionsAsked + 1,
    } as const;
  }

  function clearClarificationPatch() {
    return {
      unresolvedQuestion: null,
    } as const;
  }

  const nextAssistantTurnCount = memory.assistantTurnCount + 1;
  const groundedTopicDraftInput = buildGroundedTopicDraftInput({
    userMessage,
    activeConstraints: effectiveActiveConstraints,
  });
  const turnDraftPreference = inferDraftPreference(
    userMessage,
    memory.pendingPlan?.deliveryPreference || "balanced",
  );
  const hintedFormatFallback =
    memory.pendingPlan?.formatPreference ||
    memory.formatPreference ||
    mapPreferredOutputShapeToFormatPreference(
      creatorProfileHints?.preferredOutputShape,
    ) ||
    "shortform";
  const requestedFormatPreference = inferDraftFormatPreference(
    userMessage,
    hintedFormatFallback,
    formatPreference,
  );
  const turnFormatPreference =
    requestedFormatPreference === "thread"
      ? "thread"
      : isVerifiedAccount
        ? requestedFormatPreference
        : "shortform";
  const sourceMaterialDraftConstraints = buildSourceMaterialDraftConstraints({
    sourceMaterials: selectedSourceMaterials,
    formatPreference: turnFormatPreference,
    hasAutobiographicalGrounding: hasAutobiographicalGrounding(groundingPacket),
  });
  const turnThreadFramingStyle = resolveRequestedThreadFramingStyle({
    userMessage,
    activeDraft,
    formatPreference: turnFormatPreference,
    explicitThreadFramingStyle: threadFramingStyle,
  });
  const isMultiDraftTurn =
    turnFormatPreference === "shortform" && isMultiDraftRequest(userMessage);
  const threadPostMaxCharacterLimit =
    turnFormatPreference === "thread"
      ? getXCharacterLimitForAccount(isVerifiedAccount)
      : undefined;
  const maxCharacterLimit = getXCharacterLimitForFormat(
    isVerifiedAccount,
    turnFormatPreference,
  );
  const forceSafeFrameworkModeForTurn =
    missingAutobiographicalGroundingForTurn &&
    (runtimeWorkflow === "plan_then_draft" ||
      runtimeWorkflow === "revise_draft" ||
      turnPlan?.shouldAutoDraftFromPlan === true ||
      Boolean(memory.pendingPlan) ||
      Boolean(activeDraft));
  const safeFrameworkConstraint = forceSafeFrameworkModeForTurn
    ? buildSafeFrameworkConstraint(groundingPacket)
    : null;
  const draftGroundingSummary = buildDraftGroundingSummary({
    groundingSources: groundingSourcesForTurn,
    hasCurrentChatGrounding: groundingPacket.turnGrounding.length > 0,
    usesSafeFramework: Boolean(safeFrameworkConstraint),
  });
  const hasReusableGroundingForTurn =
    groundingSourcesForTurn.length > 0 ||
    groundingPacket.turnGrounding.length > 0 ||
    hasAutobiographicalGrounding(groundingPacket) ||
    Boolean(memory.topicSummary?.trim() && memory.concreteAnswerCount >= 1);
  const baseVoiceTarget = resolveVoiceTarget({
    styleCard,
    userMessage,
    draftPreference: turnDraftPreference,
    formatPreference: turnFormatPreference,
  });
  const hasStructuredTruthSourcesForTurn =
    groundingPacket.durableFacts.length > 0 ||
    groundingPacket.turnGrounding.length > 0 ||
    groundingPacket.sourceMaterials.length > 0;
  const hasStrictFactualReferenceGuardrails = (constraints: string[]): boolean =>
    constraints.some(
      (constraint) =>
        /^Correction lock:/i.test(constraint) ||
        /^Topic grounding:/i.test(constraint) ||
        constraint === NO_FABRICATION_CONSTRAINT ||
        constraint === NO_FABRICATION_MUST_AVOID ||
        /factual guardrail/i.test(constraint),
    );
  const shouldUseFactSafeReferenceHints = (args: {
    sourceText: string;
    activeConstraints: string[];
  }): boolean => {
    if (
      hasStrictFactualReferenceGuardrails(args.activeConstraints) ||
      hasStructuredTruthSourcesForTurn
    ) {
      return true;
    }

    const sourceSlots = evaluateDraftContextSlots({
      userMessage: args.sourceText,
      topicSummary: memory.topicSummary,
      contextAnchors: slotContextAnchors,
    });

    return sourceSlots.isProductLike;
  };
  const useFactSafeReferenceHintsForTurn =
    shouldForceNoFabricationGuardrailForTurn ||
    missingAutobiographicalGroundingForTurn ||
    shouldUseFactSafeReferenceHints({
      sourceText: userMessage,
      activeConstraints: effectiveActiveConstraints,
    });
  const modelReferenceAnchors = useFactSafeReferenceHintsForTurn
    ? buildFactSafeReferenceHints({
        lane: memory.pendingPlan?.targetLane || "original",
        formatPreference: turnFormatPreference,
      })
    : relevantTopicAnchors;
  const effectiveContext = buildEffectiveContext({
    recentHistory,
    rollingSummary: memory.rollingSummary,
    relevantTopicAnchors: modelReferenceAnchors,
    factualContext,
    voiceContextHints,
    activeConstraints: effectiveActiveConstraints,
    ...(useFactSafeReferenceHintsForTurn
      ? { referenceLabel: "REFERENCE HINTS" }
      : {}),
  });
  let draftInstruction = planSeedMessage || userMessage;

  function buildLooseDraftIdeationPrompt(args: {
    formatPreference: DraftFormatPreference;
    seedTopic?: string | null;
  }): string {
    const topic = args.seedTopic?.trim();

    if (args.formatPreference === "thread") {
      return topic
        ? `give me 3 grounded thread directions for ${topic}. each should fit a 4 to 6 post x thread, feel native to x, and stay close to what i usually post about.`
        : "give me 3 grounded thread directions in my usual lane. each should fit a 4 to 6 post x thread, feel native to x, and stay close to what i usually post about.";
    }

    return topic
      ? `give me 3 grounded post directions for ${topic}. keep them close to what i usually post about, keep them concrete enough to draft fast, and avoid generic filler.`
      : "give me 3 grounded post directions in my usual lane. keep them close to what i usually post about, keep them concrete enough to draft fast, and avoid generic filler.";
  }

  async function returnClarificationQuestion(args: {
    question: string;
    reply?: string;
    clarificationState?: V2ConversationMemory["clarificationState"] | null;
    quickReplies?: CreatorChatQuickReply[];
    topicSummary?: string | null;
    pendingPlan?: StrategyPlan | null;
    traceReason?: string | null;
    traceKind?: "question" | "tree";
  }): Promise<RawOrchestratorResponse> {
    routingTrace.clarification = {
      kind: args.traceKind || "question",
      reason: args.traceReason || null,
      branchKey: args.clarificationState?.branchKey || null,
      question: args.question,
    };
    await writeMemoryLocal({
      ...(args.topicSummary !== undefined ? { topicSummary: args.topicSummary } : {}),
      ...(args.pendingPlan !== undefined ? { pendingPlan: args.pendingPlan } : {}),
      conversationState: "needs_more_context",
      clarificationState: args.clarificationState ?? null,
      assistantTurnCount: nextAssistantTurnCount,
      ...buildClarificationPatch(args.question),
    });

    return {
      mode: "coach",
      outputShape: "coach_question",
      response: prependFeedbackMemoryNotice(
        args.reply || args.question,
        feedbackMemoryNotice,
      ),
      ...(args.quickReplies?.length
        ? {
            data: {
              quickReplies: args.quickReplies,
            },
          }
        : {}),
      memory,
    };
  }

  async function returnClarificationTree(args: {
    branchKey: Parameters<typeof buildClarificationTree>[0]["branchKey"];
    seedTopic: string | null;
    isVerifiedAccount?: boolean;
    requestedFormatPreference?: DraftFormatPreference | null;
    topicSummary?: string | null;
    pendingPlan?: StrategyPlan | null;
    replyOverride?: string;
  }): Promise<RawOrchestratorResponse> {
    const clarification = buildClarificationTree({
      branchKey: args.branchKey,
      seedTopic: args.seedTopic,
      styleCard,
      topicAnchors: relevantTopicAnchors,
      requestedFormatPreference: args.requestedFormatPreference ?? turnFormatPreference,
      ...(args.isVerifiedAccount !== undefined
        ? { isVerifiedAccount: args.isVerifiedAccount }
        : {}),
    });

    return returnClarificationQuestion({
      question: clarification.reply,
      reply: args.replyOverride,
      clarificationState: clarification.clarificationState,
      quickReplies: clarification.quickReplies,
      traceReason: args.branchKey,
      traceKind: "tree",
      ...(args.topicSummary !== undefined ? { topicSummary: args.topicSummary } : {}),
      ...(args.pendingPlan !== undefined ? { pendingPlan: args.pendingPlan } : {}),
    });
  }

  function buildConcreteSceneClarificationQuestion(sourceUserMessage: string): string {
    const anchors = extractConcreteSceneAnchors(sourceUserMessage);
    const anchorSummary =
      anchors.length > 0 ? anchors.join(", ") : "the scene you mentioned";

    return `i can write this, but i don't want to make up a lesson around ${anchorSummary}. do you want it to land as the funny loss itself, or tie to a takeaway you actually want to make?`;
  }

  function normalizeDraftSourceForUserFacingCopy(sourceUserMessage: string): string {
    return stripSelectedAnglePromptPrefix(sourceUserMessage);
  }

  function buildGroundedProductClarificationQuestion(sourceUserMessage: string): string {
    if (
      isBareDraftRequest(sourceUserMessage) ||
      isOpenEndedWildcardDraftRequest(sourceUserMessage)
    ) {
      return "i can do that. what should this pull from: a real story, a product point, or a growth lesson?";
    }

    const normalized = normalizeDraftSourceForUserFacingCopy(sourceUserMessage);
    if (/^(?:what|why|how|when|where|who|which)\b/i.test(normalized) || normalized.endsWith("?")) {
      return "i can write this, but i need one thing first: should this come from your own build experience, or should i keep it as a plain product point?";
    }
    return `i can write this, but i don't want to fake a personal usage story around ${normalized}. should i keep it as a plain product claim, or are you speaking from your own use/build experience?`;
  }

  function buildPlanSourceMessage(plan: StrategyPlan): string {
    return [plan.objective, ...plan.mustInclude]
      .map((entry) => entry.trim())
      .filter(Boolean)
      .join(". ");
  }

  function buildClarificationAwarePlanInput(args: {
    userMessage: string;
    activeConstraints: string[];
  }): {
    planMessage: string;
    activeConstraints: string[];
  } {
    const trimmed = args.userMessage.trim().replace(/\s+/g, " ");
    if (!trimmed || trimmed.includes("?") || !memory.unresolvedQuestion?.trim()) {
      return {
        planMessage: args.userMessage,
        activeConstraints: args.activeConstraints,
      };
    }

    const seedTopic =
      memory.clarificationState?.seedTopic?.trim() || memory.topicSummary?.trim() || null;
    if (!seedTopic) {
      return {
        planMessage: args.userMessage,
        activeConstraints: args.activeConstraints,
      };
    }

    const branchKey = memory.clarificationState?.branchKey;
    const normalizedSeedTopic = seedTopic.toLowerCase();
    const normalizedAnswer = trimmed.toLowerCase();
    const groundedAnswer = normalizedAnswer.startsWith(`${normalizedSeedTopic} `)
      ? trimmed
      : `${seedTopic}: ${trimmed}`;
    const priorUserTurn = extractPriorUserTurn(recentHistory);
    const priorDraftRequest =
      priorUserTurn &&
      /^(?:can you\s+)?(?:write|draft|make|create|generate|do)\b/i.test(priorUserTurn)
        ? priorUserTurn
        : null;

    if (branchKey === "entity_context_missing") {
      const basePrompt = priorDraftRequest || `write a post about ${seedTopic}`;

      return {
        planMessage: `${basePrompt}. factual grounding: ${groundedAnswer}`,
        activeConstraints: Array.from(
          new Set([...args.activeConstraints, `Topic grounding: ${groundedAnswer}`]),
        ),
      };
    }

    if (branchKey === "topic_known_but_direction_missing") {
      return {
        planMessage: `write a post about ${seedTopic}. direction: ${trimmed}`,
        activeConstraints: args.activeConstraints,
      };
    }

    if (priorDraftRequest) {
      return {
        planMessage: `${priorDraftRequest}. factual grounding: ${groundedAnswer}`,
        activeConstraints: Array.from(
          new Set([...args.activeConstraints, `Topic grounding: ${groundedAnswer}`]),
        ),
      };
    }

    return {
      planMessage: args.userMessage,
      activeConstraints: args.activeConstraints,
    };
  }

  async function resolveDraftAnchorsForPlan(args: {
    plan: StrategyPlan;
    formatPreference: DraftFormatPreference;
    activeConstraints: string[];
  }): Promise<{
    topicAnchors: string[];
    retrievalReasons: string[];
    referenceAnchorMode: "historical_posts" | "reference_hints";
  }> {
    const retrieval = await services.retrieveAnchors(
      userId,
      effectiveXHandle,
      `${args.plan.objective}. ${args.plan.angle}`,
      {
        targetLane: args.plan.targetLane,
        preferredFormat: args.formatPreference,
        limit: 5,
      },
    );
    const mergedAnchors = [
      ...retrieval.topicAnchors,
      ...retrieval.laneAnchors,
      ...retrieval.formatAnchors,
    ];
    const useFactSafeReferenceHintsForPlan = shouldUseFactSafeReferenceHints({
      sourceText: [args.plan.objective, args.plan.angle, ...args.plan.mustInclude].join(" "),
      activeConstraints: args.activeConstraints,
    });
    const referenceModeReason =
      useFactSafeReferenceHintsForPlan && hasStructuredTruthSourcesForTurn
        ? "kept historical posts in style-only mode because grounded truth sources were already available"
        : null;

    return {
      topicAnchors: useFactSafeReferenceHintsForPlan
        ? buildFactSafeReferenceHints({
            lane: args.plan.targetLane,
            formatPreference: args.formatPreference,
          })
        : retrieveRelevantContext({
            userMessage: args.plan.objective,
            topicSummary: memory.topicSummary,
            rollingSummary: memory.rollingSummary,
            topicAnchors: mergedAnchors,
            factualContext,
            voiceContextHints,
            activeConstraints: args.activeConstraints,
          }),
      retrievalReasons: retrieval.rankedAnchors
        .slice(0, 3)
        .map((anchor) => anchor.reason)
        .concat(referenceModeReason ? [referenceModeReason] : [])
        .filter(Boolean),
      referenceAnchorMode: useFactSafeReferenceHintsForPlan
        ? "reference_hints"
        : "historical_posts",
    };
  }

  function buildNoveltyNotes(args: {
    noveltyCheck?: { isNovel: boolean; reason: string | null; maxSimilarity: number };
    retrievalReasons?: string[];
  }): string[] {
    const notes = [
      args.noveltyCheck?.reason ||
        (args.noveltyCheck
          ? `Max similarity against recent history: ${Math.round(args.noveltyCheck.maxSimilarity * 100)}%.`
          : null),
      ...(args.retrievalReasons || []).map((reason) => `Grounded on ${reason}.`),
    ].filter(Boolean) as string[];

    return Array.from(new Set(notes)).slice(0, 3);
  }

  async function generateDraftWithGroundingRetry(args: {
    plan: StrategyPlan;
    activeConstraints: string[];
    activeDraft?: string;
    sourceUserMessage?: string | null;
    draftPreference: DraftPreference;
    formatPreference: DraftFormatPreference;
    threadFramingStyle?: ThreadFramingStyle | null;
    fallbackToWriterWhenCriticRejected: boolean;
    topicSummary?: string | null;
    pendingPlan?: StrategyPlan | null;
    groundingPacket?: GroundingPacket;
  }): Promise<
    | {
        kind: "success";
        writerOutput: WriterOutput;
        criticOutput: CriticOutput;
        draftToDeliver: string;
        voiceTarget: VoiceTarget;
        retrievalReasons: string[];
        threadFramingStyle: ThreadFramingStyle | null;
    }
    | {
      kind: "response";
        response: RawOrchestratorResponse;
      }
  > {
    const draftGroundingPacket = args.groundingPacket || groundingPacket;
    const applyClaimCheck = (attempt: {
      writerOutput: WriterOutput;
      criticOutput: CriticOutput;
      draftToDeliver: string;
      voiceTarget: VoiceTarget;
      retrievalReasons: string[];
      threadFramingStyle: ThreadFramingStyle | null;
    }) => {
      const claimCheck = checkDraftClaimsAgainstGrounding({
        draft: attempt.draftToDeliver,
        groundingPacket: draftGroundingPacket,
      });
      const validationStatus = claimCheck.needsClarification
        ? "clarification_required"
        : claimCheck.hasUnsupportedClaims || claimCheck.issues.length > 0
          ? "failed"
          : "passed";
      routingTrace.workerExecutions.push({
        worker: "claim_checker",
        capability: "drafting",
        phase: "validation",
        mode: "sequential",
        status: "completed",
        groupId: null,
        details: {
          status: validationStatus,
          issueCount: claimCheck.issues.length,
        },
      });
      routingTrace.workerExecutionSummary = summarizeRuntimeWorkerExecutions(
        routingTrace.workerExecutions,
      );
      routingTrace.validations.push({
        validator: "claim_checker",
        capability: "drafting",
        status: validationStatus,
        issues: claimCheck.issues,
        corrected: Boolean(claimCheck.draft && claimCheck.draft !== attempt.draftToDeliver),
      });

      return {
        ...attempt,
        criticOutput: {
          ...attempt.criticOutput,
          finalDraft: claimCheck.draft || attempt.criticOutput.finalDraft,
          issues: Array.from(new Set([...attempt.criticOutput.issues, ...claimCheck.issues])),
        },
        draftToDeliver: claimCheck.draft || attempt.draftToDeliver,
        hasUnsupportedClaims: claimCheck.hasUnsupportedClaims,
        claimNeedsClarification: claimCheck.needsClarification,
      };
    };

    const runAttempt = async (
      extraConstraints: string[] = [],
    ): Promise<{
      writerOutput: WriterOutput | null;
      criticOutput: CriticOutput | null;
      draftToDeliver: string | null;
      voiceTarget: VoiceTarget;
      retrievalReasons: string[];
      threadFramingStyle: ThreadFramingStyle | null;
    }> => {
      const attemptConstraints = Array.from(
        new Set([
          ...args.activeConstraints,
          ...(safeFrameworkConstraint ? [safeFrameworkConstraint] : []),
          ...sourceMaterialDraftConstraints,
          ...extraConstraints,
        ]),
      );
      const voiceTarget = resolveVoiceTarget({
        styleCard,
        userMessage: args.sourceUserMessage || args.plan.objective,
        draftPreference: args.draftPreference,
        formatPreference: args.formatPreference,
        lane: args.plan.targetLane,
      });
      const requestConditionedAnchors = await resolveDraftAnchorsForPlan({
        plan: args.plan,
        formatPreference: args.formatPreference,
        activeConstraints: attemptConstraints,
      });
      const writerOutput = await services.generateDrafts(
        args.plan,
        styleCard,
        requestConditionedAnchors.topicAnchors,
        attemptConstraints,
        effectiveContext,
        args.activeDraft,
        {
          conversationState: memory.conversationState,
          antiPatterns,
          maxCharacterLimit,
          goal,
          draftPreference: args.draftPreference,
          formatPreference: args.formatPreference,
          sourceUserMessage: args.sourceUserMessage || undefined,
          voiceTarget,
          referenceAnchorMode: requestConditionedAnchors.referenceAnchorMode,
          threadPostMaxCharacterLimit,
          threadFramingStyle: args.threadFramingStyle,
          activePlan: args.pendingPlan || args.plan,
          latestRefinementInstruction: memory.latestRefinementInstruction,
          lastIdeationAngles: memory.lastIdeationAngles,
          groundingPacket: draftGroundingPacket,
          creatorProfileHints,
        },
      );

      if (!writerOutput) {
        return {
          writerOutput: null,
          criticOutput: null,
          draftToDeliver: null,
          voiceTarget,
          retrievalReasons: requestConditionedAnchors.retrievalReasons,
          threadFramingStyle: args.threadFramingStyle ?? null,
        };
      }

      const criticOutput = await services.critiqueDrafts(
        writerOutput,
        attemptConstraints,
        styleCard,
        {
          maxCharacterLimit,
          draftPreference: args.draftPreference,
          formatPreference: args.formatPreference,
          sourceUserMessage: args.sourceUserMessage || undefined,
          voiceTarget,
          threadPostMaxCharacterLimit,
          threadFramingStyle: args.threadFramingStyle,
          groundingPacket: draftGroundingPacket,
        },
      );

      if (!criticOutput) {
        return {
          writerOutput,
          criticOutput: null,
          draftToDeliver: null,
          voiceTarget,
          retrievalReasons: requestConditionedAnchors.retrievalReasons,
          threadFramingStyle: args.threadFramingStyle ?? null,
        };
      }

      const draftToDeliver =
        criticOutput.approved || !args.fallbackToWriterWhenCriticRejected
          ? criticOutput.finalDraft
          : writerOutput.draft;

      return {
        writerOutput,
        criticOutput,
        draftToDeliver,
        voiceTarget,
        retrievalReasons: requestConditionedAnchors.retrievalReasons,
        threadFramingStyle: args.threadFramingStyle ?? null,
      };
    };

    const firstAttempt = await runAttempt();
    if (!firstAttempt.writerOutput) {
      return {
        kind: "response",
        response: {
          mode: "error",
          outputShape: "coach_question",
          response: "Failed to write draft.",
          memory,
        },
      };
    }

    if (!firstAttempt.criticOutput || !firstAttempt.draftToDeliver) {
      return {
        kind: "response",
        response: {
          mode: "error",
          outputShape: "coach_question",
          response: "Failed to critique draft.",
          memory,
        },
      };
    }

    const firstAttemptWithClaimCheck = applyClaimCheck({
      writerOutput: firstAttempt.writerOutput,
      criticOutput: firstAttempt.criticOutput,
      draftToDeliver: firstAttempt.draftToDeliver,
      voiceTarget: firstAttempt.voiceTarget,
      retrievalReasons: firstAttempt.retrievalReasons,
      threadFramingStyle: firstAttempt.threadFramingStyle,
    });
    if (firstAttemptWithClaimCheck.claimNeedsClarification) {
      routingTrace.draftGuard = {
        reason: "claim_needs_clarification",
        issues: firstAttemptWithClaimCheck.criticOutput.issues,
      };
      return {
        kind: "response",
        response: await returnClarificationQuestion({
          question: buildGroundedProductClarificationQuestion(
            args.sourceUserMessage || args.plan.objective,
          ),
          traceReason: "claim_needs_clarification",
          ...(args.topicSummary !== undefined
            ? { topicSummary: args.topicSummary }
            : {}),
          ...(args.pendingPlan !== undefined
            ? { pendingPlan: args.pendingPlan }
            : {}),
        }),
      };
    }

    const firstAssessment = assessConcreteSceneDrift({
      sourceUserMessage: args.sourceUserMessage,
      draft: firstAttemptWithClaimCheck.draftToDeliver,
    });
    const firstProductAssessment = assessGroundedProductDrift({
      activeConstraints: args.activeConstraints,
      sourceUserMessage: args.sourceUserMessage,
      draft: firstAttemptWithClaimCheck.draftToDeliver,
    });

    if (
      !firstAssessment.hasDrift &&
      !firstProductAssessment.hasDrift &&
      !firstAttemptWithClaimCheck.hasUnsupportedClaims
    ) {
      return {
        kind: "success",
        writerOutput: firstAttemptWithClaimCheck.writerOutput,
        criticOutput: firstAttemptWithClaimCheck.criticOutput,
        draftToDeliver: firstAttemptWithClaimCheck.draftToDeliver,
        voiceTarget: firstAttemptWithClaimCheck.voiceTarget,
        retrievalReasons: firstAttemptWithClaimCheck.retrievalReasons,
        threadFramingStyle: firstAttemptWithClaimCheck.threadFramingStyle,
      };
    }

    const retryConstraints = [
      ...(firstAttemptWithClaimCheck.hasUnsupportedClaims
        ? [buildUnsupportedClaimRetryConstraint()]
        : []),
      ...(firstAssessment.hasDrift
        ? [buildConcreteSceneRetryConstraint(args.sourceUserMessage || "")]
        : []),
      ...(firstProductAssessment.hasDrift
        ? [buildGroundedProductRetryConstraint()]
        : []),
    ].filter(Boolean) as string[];
    const secondAttempt = retryConstraints.length > 0
      ? await runAttempt(retryConstraints)
      : firstAttempt;

    if (!secondAttempt.writerOutput) {
      return {
        kind: "response",
        response: {
          mode: "error",
          outputShape: "coach_question",
          response: "Failed to write draft.",
          memory,
        },
      };
    }

    if (!secondAttempt.criticOutput || !secondAttempt.draftToDeliver) {
      return {
        kind: "response",
        response: {
          mode: "error",
          outputShape: "coach_question",
          response: "Failed to critique draft.",
          memory,
        },
      };
    }

    const secondAttemptWithClaimCheck = applyClaimCheck({
      writerOutput: secondAttempt.writerOutput,
      criticOutput: secondAttempt.criticOutput,
      draftToDeliver: secondAttempt.draftToDeliver,
      voiceTarget: secondAttempt.voiceTarget,
      retrievalReasons: secondAttempt.retrievalReasons,
      threadFramingStyle: secondAttempt.threadFramingStyle,
    });
    if (secondAttemptWithClaimCheck.claimNeedsClarification) {
      routingTrace.draftGuard = {
        reason: "claim_needs_clarification",
        issues: secondAttemptWithClaimCheck.criticOutput.issues,
      };
      return {
        kind: "response",
        response: await returnClarificationQuestion({
          question: buildGroundedProductClarificationQuestion(
            args.sourceUserMessage || args.plan.objective,
          ),
          traceReason: "claim_needs_clarification",
          ...(args.topicSummary !== undefined
            ? { topicSummary: args.topicSummary }
            : {}),
          ...(args.pendingPlan !== undefined
            ? { pendingPlan: args.pendingPlan }
            : {}),
        }),
      };
    }

    const secondAssessment = assessConcreteSceneDrift({
      sourceUserMessage: args.sourceUserMessage,
      draft: secondAttemptWithClaimCheck.draftToDeliver,
    });
    const secondProductAssessment = assessGroundedProductDrift({
      activeConstraints: args.activeConstraints,
      sourceUserMessage: args.sourceUserMessage,
      draft: secondAttemptWithClaimCheck.draftToDeliver,
    });

    if (secondAssessment.hasDrift || secondProductAssessment.hasDrift) {
      routingTrace.draftGuard = secondAssessment.hasDrift
        ? {
            reason: "concrete_scene_drift",
            issues: [secondAssessment.reason || "Concrete scene drift."],
          }
        : {
            reason: "product_drift",
            issues: [secondProductAssessment.reason || "Grounded product drift."],
          };
      return {
        kind: "response",
        response: secondAssessment.hasDrift
          ? await returnClarificationQuestion({
              question: buildConcreteSceneClarificationQuestion(
                args.sourceUserMessage || args.plan.objective,
              ),
              traceReason: "concrete_scene_drift",
              ...(args.topicSummary !== undefined
                ? { topicSummary: args.topicSummary }
                : {}),
              ...(args.pendingPlan !== undefined
                ? { pendingPlan: args.pendingPlan }
                : {}),
            })
          : await returnClarificationQuestion({
              question: buildGroundedProductClarificationQuestion(
                args.sourceUserMessage || args.plan.objective,
              ),
              traceReason: "product_drift",
              ...(args.topicSummary !== undefined
                ? { topicSummary: args.topicSummary }
                : {}),
              ...(args.pendingPlan !== undefined
                ? { pendingPlan: args.pendingPlan }
                : {}),
            }),
      };
    }

    return {
      kind: "success",
      writerOutput: secondAttemptWithClaimCheck.writerOutput,
      criticOutput: secondAttemptWithClaimCheck.criticOutput,
      draftToDeliver: secondAttemptWithClaimCheck.draftToDeliver,
      voiceTarget: secondAttemptWithClaimCheck.voiceTarget,
      retrievalReasons: secondAttemptWithClaimCheck.retrievalReasons,
      threadFramingStyle: secondAttemptWithClaimCheck.threadFramingStyle,
    };
  }

  async function generateDraftBundleWithGroundingRetry(args: {
    plan: StrategyPlan;
    activeConstraints: string[];
    sourceUserMessage?: string | null;
    draftPreference: DraftPreference;
    topicSummary?: string | null;
    groundingPacket?: GroundingPacket;
  }): Promise<
    | {
        kind: "success";
        draftBundle: DraftBundleResult;
        draft: string;
        drafts: string[];
        supportAsset: string | null;
        issuesFixed: string[];
      }
    | {
        kind: "response";
        response: RawOrchestratorResponse;
      }
  > {
    const bundleBriefs = buildDraftBundleBriefs({
      userMessage: args.sourceUserMessage || userMessage,
      basePlan: args.plan,
      sourceMaterials: selectedSourceMaterials,
    });

    if (bundleBriefs.length === 0) {
      return {
        kind: "response",
        response: {
          mode: "error",
          outputShape: "coach_question",
          response: "Failed to build draft options.",
          memory,
        },
      };
    }

    const historicalTexts = await services.getHistoricalPosts({
      userId,
      xHandle: effectiveXHandle,
    });
    const options: DraftBundleResult["options"] = [];

    for (const brief of bundleBriefs) {
      const bundlePlan: StrategyPlan = {
        ...args.plan,
        objective: brief.objective,
        angle: brief.angle,
        hookType: brief.hookType,
        mustInclude: Array.from(new Set([...args.plan.mustInclude, ...brief.mustInclude])),
        mustAvoid: Array.from(new Set([...args.plan.mustAvoid, ...brief.mustAvoid])),
        formatPreference: "shortform",
      };

      let bundleDraftResult = await generateDraftWithGroundingRetry({
        plan: bundlePlan,
        activeConstraints: args.activeConstraints,
        sourceUserMessage: brief.prompt,
        draftPreference: args.draftPreference,
        formatPreference: "shortform",
        threadFramingStyle: null,
        fallbackToWriterWhenCriticRejected: false,
        topicSummary: args.topicSummary,
        groundingPacket: args.groundingPacket,
      });

      if (bundleDraftResult.kind === "response") {
        return bundleDraftResult;
      }

      const earlierDrafts = options.map((option) => option.draft);
      let noveltyCheck = services.checkDeterministicNovelty(
        bundleDraftResult.draftToDeliver,
        [...historicalTexts, ...earlierDrafts],
      );

      if (!noveltyCheck.isNovel && earlierDrafts.length > 0) {
        bundleDraftResult = await generateDraftWithGroundingRetry({
          plan: {
            ...bundlePlan,
            mustAvoid: Array.from(
              new Set([
                ...bundlePlan.mustAvoid,
                "Do not mirror the opener, structure, or payoff from the earlier bundle options.",
              ]),
            ),
          },
          activeConstraints: Array.from(
            new Set([
              ...args.activeConstraints,
              `Sibling novelty: make "${brief.label}" clearly distinct from the earlier bundle options.`,
            ]),
          ),
          sourceUserMessage: `${brief.prompt} Keep it clearly distinct from the earlier bundle options.`,
          draftPreference: args.draftPreference,
          formatPreference: "shortform",
          threadFramingStyle: null,
          fallbackToWriterWhenCriticRejected: false,
          topicSummary: args.topicSummary,
          groundingPacket: args.groundingPacket,
        });

        if (bundleDraftResult.kind === "response") {
          return bundleDraftResult;
        }

        noveltyCheck = services.checkDeterministicNovelty(
          bundleDraftResult.draftToDeliver,
          [...historicalTexts, ...earlierDrafts],
        );
      }

      options.push({
        id: `bundle-${brief.id}`,
        label: brief.label,
        framing: brief.id,
        draft: bundleDraftResult.draftToDeliver,
        supportAsset: bundleDraftResult.writerOutput.supportAsset ?? null,
        issuesFixed: bundleDraftResult.criticOutput.issues,
        voiceTarget: bundleDraftResult.voiceTarget,
        noveltyNotes: buildNoveltyNotes({
          noveltyCheck,
          retrievalReasons: bundleDraftResult.retrievalReasons,
        }),
        threadFramingStyle: bundleDraftResult.threadFramingStyle,
        groundingSources: groundingSourcesForTurn,
        groundingMode: draftGroundingSummary.groundingMode,
        groundingExplanation: draftGroundingSummary.groundingExplanation,
      });
    }

    if (options.length === 0) {
      return {
        kind: "response",
        response: {
          mode: "error",
          outputShape: "coach_question",
          response: "Failed to write draft options.",
          memory,
        },
      };
    }

    return {
      kind: "success",
      draftBundle: {
        kind: "sibling_options",
        selectedOptionId: options[0].id,
        options,
      },
      draft: options[0].draft,
      drafts: options.map((option) => option.draft),
      supportAsset: options[0].supportAsset,
      issuesFixed: Array.from(new Set(options.flatMap((option) => option.issuesFixed))),
    };
  }

  if (
    !explicitIntent &&
    activeDraft &&
    memory.clarificationState?.branchKey === "semantic_repair"
  ) {
    const repairDirective = buildSemanticRepairDirective(
      userMessage,
      memory.topicSummary,
    );
    const nextConstraints = Array.from(
      new Set([...memory.activeConstraints, repairDirective.constraint]),
    );

    await writeMemoryLocal({
      activeConstraints: nextConstraints,
      clarificationState: null,
      conversationState: "editing",
      latestRefinementInstruction: repairDirective.rewriteRequest,
      ...clearClarificationPatch(),
    });

    applyPipelineWorkflowOverride("edit");
    draftInstruction = repairDirective.rewriteRequest;
  }

  if (!explicitIntent && activeDraft && isDraftMeaningQuestion(userMessage)) {
    await writeMemoryLocal({
      conversationState:
        memory.conversationState === "draft_ready" ? "draft_ready" : "needs_more_context",
      clarificationState: null,
      assistantTurnCount: nextAssistantTurnCount,
      ...clearClarificationPatch(),
    });

    return {
      mode: "coach",
      outputShape: "coach_question",
      response: prependFeedbackMemoryNotice(
        buildDraftMeaningResponse(activeDraft),
        feedbackMemoryNotice,
      ),
      memory,
    };
  }

  const hadPendingPlan =
    memory.conversationState === "plan_pending_approval" && Boolean(memory.pendingPlan);
  const hasCorrectionLock = memory.activeConstraints.some((constraint) =>
    /^Correction lock:/i.test(constraint),
  );
  const shouldUseNonDraftCorrectionPath =
    !explicitIntent &&
    !activeDraft &&
    (
      looksLikeSemanticCorrection(userMessage) ||
      (hasConcreteCorrectionDetail(userMessage) && (hadPendingPlan || hasCorrectionLock))
    );

  if (shouldUseNonDraftCorrectionPath) {
    const correctionReply = buildSemanticCorrectionAcknowledgment({
      userMessage,
      activeConstraints: memory.activeConstraints,
      hadPendingPlan,
    });

    if (correctionReply) {
      const nextConstraints = hasConcreteCorrectionDetail(userMessage)
        ? Array.from(
            new Set([
              ...memory.activeConstraints,
              buildSemanticRepairDirective(userMessage, memory.topicSummary).constraint,
            ]),
          )
        : memory.activeConstraints;

      await writeMemoryLocal({
        activeConstraints: nextConstraints,
        conversationState:
          memory.conversationState === "ready_to_ideate"
            ? "ready_to_ideate"
            : "needs_more_context",
        pendingPlan: hadPendingPlan ? null : memory.pendingPlan,
        clarificationState: null,
        assistantTurnCount: nextAssistantTurnCount,
        latestRefinementInstruction: null,
        ...clearClarificationPatch(),
      });

      return {
        mode: "coach",
        outputShape: "coach_question",
        response: prependFeedbackMemoryNotice(
          correctionReply,
          feedbackMemoryNotice,
        ),
        memory,
      };
    }

    const correctionRepairQuestion = inferCorrectionRepairQuestion(
      userMessage,
      memory.topicSummary,
    );

    if (correctionRepairQuestion) {
      return returnClarificationQuestion({
        question: correctionRepairQuestion,
        pendingPlan: hadPendingPlan ? null : memory.pendingPlan,
      });
    }
  }

  if (
    resolveConversationRouterState({
      explicitIntent,
      mode,
      conversationState: memory.conversationState,
      hasPendingPlan: Boolean(memory.pendingPlan),
      hasOutstandingClarification: false,
      shouldAutoDraftFromPlan: false,
      hasEnoughContextToAct: false,
      clarificationBranchKey: memory.clarificationState?.branchKey ?? null,
    }) === "approve_pending_plan" &&
    memory.pendingPlan
  ) {
    const pendingPlanHasNoFabrication = hasNoFabricationPlanGuardrail(memory.pendingPlan);
    const baseDraftActiveConstraints = Array.from(
      new Set([
        ...effectiveActiveConstraints,
        ...(safeFrameworkConstraint ? [safeFrameworkConstraint] : []),
      ]),
    );
    const draftActiveConstraints = pendingPlanHasNoFabrication
      ? appendNoFabricationConstraint(baseDraftActiveConstraints)
      : baseDraftActiveConstraints;
    const decision = await interpretPlannerFeedback(userMessage, memory.pendingPlan);

    if (decision === "approve") {
      const approvedPlan = memory.pendingPlan;
      const historicalTexts = await services.getHistoricalPosts({
        userId,
        xHandle: effectiveXHandle,
      });
      const approvedPlanGroundingPacket = buildGroundingPacketForContext(
        draftActiveConstraints,
        buildPlanSourceMessage(approvedPlan),
      );

      const execution = await executeDraftingCapability({
        workflow: "plan_then_draft",
        capability: "drafting",
        activeContextRefs: [
          "memory.pendingPlan",
          "memory.topicSummary",
          "memory.rollingSummary",
        ],
        context: {
          memory,
          plan: approvedPlan,
          activeConstraints: draftActiveConstraints,
          historicalTexts,
          userMessage,
          draftPreference: approvedPlan.deliveryPreference || turnDraftPreference,
          turnFormatPreference,
          styleCard,
          feedbackMemoryNotice,
          nextAssistantTurnCount,
          latestDraftStatus: "Draft delivered",
          refreshRollingSummary: true,
          groundingSources: groundingSourcesForTurn,
          groundingMode: draftGroundingSummary.groundingMode,
          groundingExplanation: draftGroundingSummary.groundingExplanation,
        },
        services: {
          checkDeterministicNovelty: services.checkDeterministicNovelty,
          runDraft: () =>
            generateDraftWithGroundingRetry({
              plan: approvedPlan,
              activeConstraints: draftActiveConstraints,
              activeDraft,
              sourceUserMessage: buildPlanSourceMessage(approvedPlan),
              draftPreference: approvedPlan.deliveryPreference || turnDraftPreference,
              formatPreference: approvedPlan.formatPreference || turnFormatPreference,
              threadFramingStyle: turnThreadFramingStyle,
              fallbackToWriterWhenCriticRejected: false,
              topicSummary: approvedPlan.objective,
              pendingPlan: approvedPlan,
              groundingPacket: approvedPlanGroundingPacket,
            }),
          handleNoveltyConflict: () =>
            returnClarificationTree({
              branchKey: "plan_reject",
              seedTopic: approvedPlan.objective,
              pendingPlan: null,
              replyOverride:
                "this version felt too close to something you've already posted. let's shift it.",
            }),
          buildNoveltyNotes,
        },
      });

      mergeCapabilityExecutionMeta(execution);
      if (execution.output.kind === "response") {
        return execution.output.response;
      }

      await writeMemoryLocal(execution.output.memoryPatch);

      return {
        ...execution.output.responseSeed,
        memory,
      };
    }

    if (decision === "revise") {
      const revisionPrompt = [
        `Current plan objective: ${memory.pendingPlan.objective}`,
        `Current plan angle: ${memory.pendingPlan.angle}`,
        `Requested revision: ${userMessage}`,
      ].join("\n");

      const revisedPlan = await services.generatePlan(
        revisionPrompt,
        memory.topicSummary,
        effectiveActiveConstraints,
        effectiveContext,
        activeDraft,
      {
        goal,
        conversationState: memory.conversationState,
        antiPatterns,
        draftPreference: turnDraftPreference,
        formatPreference: memory.pendingPlan.formatPreference || turnFormatPreference,
        activePlan: memory.pendingPlan,
        latestRefinementInstruction: memory.latestRefinementInstruction,
        lastIdeationAngles: memory.lastIdeationAngles,
        voiceTarget: baseVoiceTarget,
        groundingPacket,
        creatorProfileHints,
      },
    );

      if (!revisedPlan) {
        return {
          mode: "error",
          outputShape: "coach_question",
          response: "Failed to revise the plan.",
          memory,
        };
      }

      const revisedPlanWithPreference = applySourceMaterialBiasToPlan(
        applyCreatorProfileHintsToPlan(
          withPlanPreferences(
            revisedPlan,
            turnDraftPreference,
            memory.pendingPlan.formatPreference || turnFormatPreference,
          ),
          creatorProfileHints,
        ),
        selectedSourceMaterials,
        {
          hasAutobiographicalGrounding: hasAutobiographicalGrounding(groundingPacket),
        },
      );
      const guardedRevisedPlan = pendingPlanHasNoFabrication
        ? withNoFabricationPlanGuardrail(revisedPlanWithPreference)
        : revisedPlanWithPreference;

      await writeMemoryLocal({
        topicSummary: guardedRevisedPlan.objective,
        conversationState: "plan_pending_approval",
        pendingPlan: guardedRevisedPlan,
        clarificationState: null,
        assistantTurnCount: nextAssistantTurnCount,
        formatPreference:
          guardedRevisedPlan.formatPreference || turnFormatPreference,
        latestRefinementInstruction: null,
        ...clearClarificationPatch(),
      });

      return {
        mode: "plan",
        outputShape: "planning_outline",
        response: prependFeedbackMemoryNotice(
          buildPlanPitch(guardedRevisedPlan),
          feedbackMemoryNotice,
        ),
        data: {
          plan: guardedRevisedPlan,
          quickReplies: buildPlannerQuickReplies({
            plan: guardedRevisedPlan,
            styleCard,
            context: "approval",
          }),
        },
        memory,
      };
    }

    if (decision === "reject") {
      return returnClarificationTree({
        branchKey: "plan_reject",
        seedTopic: memory.pendingPlan.objective,
        pendingPlan: null,
      });
    }

    await writeMemoryLocal({
      conversationState: "plan_pending_approval",
      pendingPlan: memory.pendingPlan,
      assistantTurnCount: nextAssistantTurnCount,
      formatPreference: memory.pendingPlan.formatPreference || turnFormatPreference,
      ...clearClarificationPatch(),
    });

    return {
      mode: "plan",
      outputShape: "planning_outline",
      response: prependFeedbackMemoryNotice(
        "say the word and i'll draft it, or tell me what to tweak.",
        feedbackMemoryNotice,
      ),
      data: {
        plan: memory.pendingPlan,
        quickReplies: buildPlannerQuickReplies({
          plan: memory.pendingPlan,
          styleCard,
          context: "approval",
        }),
      },
      memory,
    };
  }

  // V3: Over-questioning guard. After 2 concrete answers from the user,
  // skip ALL clarification gates and proceed to ideation or plan generation.
  // This prevents the "keeps asking questions" problem.
  const hasOutstandingClarification = Boolean(memory.unresolvedQuestion?.trim());
  const shouldFastStartFromGroundedContext = shouldFastStartGroundedDraft({
    userMessage,
    mode,
    explicitIntent,
    hasActiveDraft: Boolean(activeDraft),
    memoryTopicSummary: memory.topicSummary,
    hasTopicGrounding: Boolean(groundedTopicDraftInput.grounding),
    hasAutobiographicalGrounding: hasAutobiographicalGrounding(groundingPacket),
    groundingSourceCount: groundingSourcesForTurn.length,
    turnGroundingCount: groundingPacket.turnGrounding.length,
    creatorHintsAvailable: Boolean(
      creatorProfileHints?.topExampleSnippets.length ||
        creatorProfileHints?.preferredHookPatterns.length ||
        creatorProfileHints?.toneGuidelines.length,
    ),
  });
  const hasEnoughContextToAct =
    memory.concreteAnswerCount >= 2 ||
    Boolean(memory.topicSummary && memory.pendingPlan) ||
    Boolean(
      memory.topicSummary &&
      memory.concreteAnswerCount >= 1 &&
      memory.assistantTurnCount >= 3,
    ) ||
    Boolean(groundedTopicDraftInput.grounding) ||
    shouldFastStartFromGroundedContext;
  const routerState = resolveConversationRouterState({
    explicitIntent,
    mode,
    conversationState: memory.conversationState,
    hasPendingPlan: Boolean(memory.pendingPlan),
    hasOutstandingClarification,
    shouldAutoDraftFromPlan: turnPlan?.shouldAutoDraftFromPlan === true,
    hasEnoughContextToAct,
    clarificationBranchKey: memory.clarificationState?.branchKey ?? null,
  });
  routingTrace.routerState = routerState;
  const canAskPlanClarification = (): boolean =>
    routerState === "clarify_before_generation";

  if (
    shouldForceLooseDraftIdeation({
      userMessage,
      explicitIntent,
      hasActiveDraft: Boolean(activeDraft),
    })
  ) {
    return handleIdeateMode({
      promptMessage: buildLooseDraftIdeationPrompt({
        formatPreference: turnFormatPreference,
      }),
      topicSummaryOverride: null,
    });
  }

  if (canAskPlanClarification()) {
    if (
      turnDraftContextSlots.ambiguousReferenceNeedsClarification &&
      turnDraftContextSlots.ambiguousReference
    ) {
      const question = buildAmbiguousReferenceQuestion(
        turnDraftContextSlots.ambiguousReference,
      );
      return returnClarificationQuestion({ question });
    }

    if (
      shouldRouteCareerClarification({
        explicitIntent,
        mode,
        domainHint: turnDraftContextSlots.domainHint,
        behaviorKnown: turnDraftContextSlots.behaviorKnown,
        stakesKnown: turnDraftContextSlots.stakesKnown,
      }) &&
      missingAutobiographicalGroundingForTurn
    ) {
      return returnClarificationTree({
        branchKey: "career_context_missing",
        seedTopic: inferBroadTopicDraftRequest(userMessage) || memory.topicSummary,
        isVerifiedAccount,
      });
    }

    if (
      turnDraftContextSlots.isProductLike &&
      (!turnDraftContextSlots.behaviorKnown || !turnDraftContextSlots.stakesKnown) &&
      missingAutobiographicalGroundingForTurn
    ) {
      const clarificationQuestion = inferMissingSpecificQuestion(userMessage);

      if (clarificationQuestion) {
        return returnClarificationQuestion({
          question: clarificationQuestion,
          topicSummary: inferBroadTopicDraftRequest(userMessage) || memory.topicSummary,
        });
      }
    }

    if (turnDraftContextSlots.entityNeedsDefinition && turnDraftContextSlots.namedEntity) {
      const prefersBroaderProductSeed =
        /\b(?:extension|plugin|tool|app|product)\b/i.test(userMessage) &&
        inferBroadTopicDraftRequest(userMessage);
      return returnClarificationTree({
        branchKey: "entity_context_missing",
        seedTopic: prefersBroaderProductSeed || turnDraftContextSlots.namedEntity,
      });
    }
  }

  if (canAskPlanClarification()) {
    const clarificationQuestion = inferMissingSpecificQuestion(userMessage);

    if (clarificationQuestion && missingAutobiographicalGroundingForTurn) {
      return returnClarificationQuestion({
        question: clarificationQuestion,
      });
    }
  }

  if (canAskPlanClarification()) {
    if (isOpenEndedWildcardDraftRequest(userMessage)) {
      return handleIdeateMode({
        promptMessage: buildLooseDraftIdeationPrompt({
          formatPreference: turnFormatPreference,
        }),
        topicSummaryOverride: null,
      });
    }

    if (isMultiDraftTurn && !hasReusableGroundingForTurn) {
      return returnClarificationQuestion({
        question: buildNaturalDraftClarificationQuestion({
          multiple: true,
          topicSummary: inferBroadTopicDraftRequest(userMessage) || memory.topicSummary,
        }),
        topicSummary: inferBroadTopicDraftRequest(userMessage) || memory.topicSummary,
      });
    }

    const broadTopic = inferBroadTopicDraftRequest(userMessage);

    if (broadTopic) {
      if (
        looksLikeOpaqueEntityTopic({
          topic: broadTopic,
          userMessage,
          activeConstraints: memory.activeConstraints,
        })
      ) {
        return returnClarificationTree({
          branchKey: "entity_context_missing",
          seedTopic: broadTopic,
        });
      }

      return returnClarificationTree({
        branchKey: "topic_known_but_direction_missing",
        seedTopic: broadTopic,
        isVerifiedAccount,
        topicSummary: broadTopic,
      });
    }
  }

  if (canAskPlanClarification() && isBareDraftRequest(userMessage)) {
    const currentTopicSummary = looksGenericTopicSummary(memory.topicSummary)
      ? null
      : memory.topicSummary;
    return handleIdeateMode({
      promptMessage: buildLooseDraftIdeationPrompt({
        formatPreference: turnFormatPreference,
        seedTopic: currentTopicSummary,
      }),
      topicSummaryOverride: currentTopicSummary,
    });
  }

  if (
    canAskPlanClarification() &&
    !memory.topicSummary &&
    memory.concreteAnswerCount < 2 &&
    routing.classifiedIntent === "plan"
  ) {
    const branchKey = isLazyDraftRequest(userMessage)
      ? "lazy_request"
      : "vague_draft_request";
    return returnClarificationTree({
      branchKey,
      seedTopic: inferLooseClarificationSeed(userMessage, memory.topicSummary),
    });
  }

  if (canAskPlanClarification()) {
    const abstractTopicSeed = inferAbstractTopicSeed(userMessage, recentHistory, memory);

    if (abstractTopicSeed) {
      return returnClarificationTree({
        branchKey: "abstract_topic_focus_pick",
        seedTopic: abstractTopicSeed,
        topicSummary: abstractTopicSeed,
      });
    }
  }

  if (!explicitIntent && !activeDraft) {
    const sourceTransparencyReply = inferSourceTransparencyReply({
      userMessage,
      activeDraft: null,
      referenceText: memory.lastIdeationAngles.join(" "),
      recentHistory,
      contextAnchors: factualContext,
    });

    if (sourceTransparencyReply) {
      await writeMemoryLocal({
        conversationState: "needs_more_context",
        clarificationState: null,
        assistantTurnCount: nextAssistantTurnCount,
        ...clearClarificationPatch(),
      });

      return {
        mode: "coach",
        outputShape: "coach_question",
        response: prependFeedbackMemoryNotice(
          sourceTransparencyReply,
          feedbackMemoryNotice,
        ),
        memory,
      };
    }

    const postReferenceReply = inferPostReferenceReply({
      userMessage,
      recentHistory,
    });
    if (postReferenceReply) {
      await writeMemoryLocal({
        conversationState: "needs_more_context",
        clarificationState: null,
        assistantTurnCount: nextAssistantTurnCount,
        ...clearClarificationPatch(),
      });

      return {
        mode: "coach",
        outputShape: "coach_question",
        response: prependFeedbackMemoryNotice(
          postReferenceReply,
          feedbackMemoryNotice,
        ),
        memory,
      };
    }

    const ideationRationaleReply =
      memory.conversationState === "ready_to_ideate"
        ? inferIdeationRationaleReply({
          userMessage,
          topicSummary: memory.topicSummary,
          recentHistory,
          lastIdeationAngles: memory.lastIdeationAngles,
        })
        : null;
    if (ideationRationaleReply) {
      await writeMemoryLocal({
        conversationState: "ready_to_ideate",
        clarificationState: null,
        assistantTurnCount: nextAssistantTurnCount,
        ...clearClarificationPatch(),
      });

      return {
        mode: "coach",
        outputShape: "coach_question",
        response: prependFeedbackMemoryNotice(
          ideationRationaleReply,
          feedbackMemoryNotice,
        ),
        memory,
      };
    }

    if (looksLikeConfusionPing(userMessage)) {
      const confusionReply =
        memory.conversationState === "ready_to_ideate"
          ? "my bad - that was unclear. i should keep this grounded in what you've actually said. want a clean new set in the same lane, or a different direction?"
          : "my bad - that was unclear. i can rephrase it plainly, or we can reset and keep going.";

      await writeMemoryLocal({
        conversationState:
          memory.conversationState === "ready_to_ideate"
            ? "ready_to_ideate"
            : "needs_more_context",
        clarificationState: null,
        assistantTurnCount: nextAssistantTurnCount,
        ...clearClarificationPatch(),
      });

      return {
        mode: "coach",
        outputShape: "coach_question",
        response: prependFeedbackMemoryNotice(
          confusionReply,
          feedbackMemoryNotice,
        ),
        memory,
      };
    }
  }

  if (!explicitIntent && activeDraft) {
    const sourceTransparencyReply = inferSourceTransparencyReply({
      userMessage,
      activeDraft,
      referenceText: memory.lastIdeationAngles.join(" "),
      recentHistory,
      contextAnchors: factualContext,
    });

    if (sourceTransparencyReply) {
      await writeMemoryLocal({
        conversationState:
          memory.conversationState === "draft_ready" ? "draft_ready" : "needs_more_context",
        clarificationState: null,
        assistantTurnCount: nextAssistantTurnCount,
        ...clearClarificationPatch(),
      });

      return {
        mode: "coach",
        outputShape: "coach_question",
        response: prependFeedbackMemoryNotice(
          sourceTransparencyReply,
          feedbackMemoryNotice,
        ),
        memory,
      };
    }

    const correctionRepairQuestion = inferCorrectionRepairQuestion(
      userMessage,
      memory.topicSummary,
    );

    if (correctionRepairQuestion) {
      await writeMemoryLocal({
        conversationState: "needs_more_context",
        clarificationState: buildSemanticRepairState(memory.topicSummary),
        assistantTurnCount: nextAssistantTurnCount,
        ...buildClarificationPatch(correctionRepairQuestion),
      });

      return {
        mode: "coach",
        outputShape: "coach_question",
        response: prependFeedbackMemoryNotice(
          correctionRepairQuestion,
          feedbackMemoryNotice,
        ),
        memory,
      };
    }

    if (looksLikeSemanticCorrection(userMessage)) {
      const repairDirective = buildSemanticRepairDirective(
        userMessage,
        memory.topicSummary,
      );
      const nextConstraints = Array.from(
        new Set([...memory.activeConstraints, repairDirective.constraint]),
      );

      await writeMemoryLocal({
        activeConstraints: nextConstraints,
        clarificationState: null,
        conversationState: "editing",
        assistantTurnCount: nextAssistantTurnCount,
        latestRefinementInstruction: repairDirective.rewriteRequest,
        ...clearClarificationPatch(),
      });

      applyPipelineWorkflowOverride("edit");
      draftInstruction = repairDirective.rewriteRequest;
    }
  }

  // ---------------------------------------------------------------------------
  // Mode Handlers
  // ---------------------------------------------------------------------------

  async function handleIdeateMode(args?: {
    promptMessage?: string;
    topicSummaryOverride?: string | null;
    responseUserMessage?: string;
  }): Promise<RawOrchestratorResponse> {
    const execution = await executeIdeationCapability({
      workflow: "ideate",
      capability: "ideation",
      activeContextRefs: ["memory.topicSummary", "memory.lastIdeationAngles"],
      context: {
        userMessage,
        promptMessage: args?.promptMessage,
        responseUserMessage: args?.responseUserMessage,
        topicSummaryOverride: args?.topicSummaryOverride,
        memory,
        effectiveContext,
        styleCard,
        relevantTopicAnchors,
        userContextString,
        goal,
        antiPatterns,
        effectiveActiveConstraints,
        turnFormatPreference,
        nextAssistantTurnCount,
        feedbackMemoryNotice,
      },
      services,
    });

    mergeCapabilityExecutionMeta(execution);
    await writeMemoryLocal(execution.output.memoryPatch);

    return {
      ...execution.output.responseSeed,
      memory,
    };
  }

  async function handlePlanMode(): Promise<RawOrchestratorResponse> {
    const clarificationAwarePlanInput = buildClarificationAwarePlanInput({
      userMessage,
      activeConstraints: effectiveActiveConstraints,
    });
    const usesClarificationPlanInput =
      clarificationAwarePlanInput.planMessage !== userMessage ||
      clarificationAwarePlanInput.activeConstraints !== effectiveActiveConstraints;
    const usesGroundedTopicPlanInput =
      !usesClarificationPlanInput && Boolean(groundedTopicDraftInput.planMessage);
    const planInput = usesClarificationPlanInput
      ? clarificationAwarePlanInput
      : groundedTopicDraftInput.planMessage
        ? {
            planMessage: groundedTopicDraftInput.planMessage,
            activeConstraints: groundedTopicDraftInput.nextConstraints,
          }
        : clarificationAwarePlanInput;
    routingTrace.planInputSource = usesClarificationPlanInput
      ? "clarification_answer"
      : usesGroundedTopicPlanInput
        ? "grounded_topic"
        : "raw_user_message";
    const preparedPlanActiveConstraints = Array.from(
      new Set([
        ...planInput.activeConstraints,
        ...(safeFrameworkConstraint ? [safeFrameworkConstraint] : []),
      ]),
    );
    const preparedPlanGroundingPacket = buildGroundingPacketForContext(
      preparedPlanActiveConstraints,
      planInput.planMessage,
    );
    const execution = await executePlanningCapability({
      workflow: "plan_then_draft",
      capability: "planning",
      activeContextRefs: [
        "memory.pendingPlan",
        "memory.topicSummary",
        "memory.latestRefinementInstruction",
        "memory.lastIdeationAngles",
      ],
      context: {
        planInputMessage: planInput.planMessage,
        planActiveConstraints: preparedPlanActiveConstraints,
        planGroundingPacket: preparedPlanGroundingPacket,
        memory,
        effectiveContext,
        activeDraft,
        goal,
        antiPatterns,
        turnDraftPreference,
        turnFormatPreference,
        baseVoiceTarget,
        creatorProfileHints,
        selectedSourceMaterials,
        shouldForceNoFabricationGuardrailForTurn,
        styleCard,
        nextAssistantTurnCount,
        feedbackMemoryNotice,
      },
      services,
    });

    mergeCapabilityExecutionMeta(execution);

    if (execution.output.kind === "plan_failure") {
      routingTrace.planFailure = execution.output.failureReason
        ? { reason: execution.output.failureReason }
        : { reason: "the planner request failed" };
      return {
        ...execution.output.responseSeed,
        memory,
      };
    }

    routingTrace.planFailure = null;

    const {
      plan: guardedPlan,
      planActiveConstraints,
      planGroundingPacket,
      responseSeed: planResponseSeed,
      memoryPatch: planMemoryPatch,
    } = execution.output;

    // V3: Rough draft mode. When the turn planner forced draft (user said
    // "just write it" / "go ahead"), auto-approve the plan and proceed
    // directly to drafting instead of waiting for explicit approval.
    if (
      ((turnPlan?.userGoal === "draft" &&
        (hasEnoughContextToAct || turnPlan.shouldAutoDraftFromPlan === true)) ||
        shouldFastStartFromGroundedContext)
    ) {
      if (isMultiDraftTurn) {
        const draftBundleResult = await generateDraftBundleWithGroundingRetry({
          plan: guardedPlan,
          activeConstraints: planActiveConstraints,
          sourceUserMessage: planInput.planMessage,
          draftPreference: turnDraftPreference,
          topicSummary: guardedPlan.objective,
          groundingPacket: planGroundingPacket,
        });

        if (draftBundleResult.kind === "response" && draftBundleResult.response.mode === "error") {
          await writeMemoryLocal(planMemoryPatch);
          return {
            ...planResponseSeed,
            memory,
          };
        }

        if (draftBundleResult.kind === "response") {
          return draftBundleResult.response;
        }

        const rollingSummary = shouldRefreshRollingSummary(nextAssistantTurnCount, true)
          ? buildRollingSummary({
              currentSummary: memory.rollingSummary,
              topicSummary: guardedPlan.objective,
              approvedPlan: guardedPlan,
              activeConstraints: planActiveConstraints,
              latestDraftStatus: "Draft bundle generated",
              formatPreference: guardedPlan.formatPreference || turnFormatPreference,
            })
          : memory.rollingSummary;

        await writeMemoryLocal({
          topicSummary: guardedPlan.objective,
          activeConstraints: planActiveConstraints,
          conversationState: "draft_ready",
          pendingPlan: null,
          clarificationState: null,
          assistantTurnCount: nextAssistantTurnCount,
          rollingSummary,
          formatPreference: guardedPlan.formatPreference || turnFormatPreference,
          latestRefinementInstruction: null,
          ...clearClarificationPatch(),
        });

        return {
          mode: "draft",
          outputShape: "short_form_post",
          response: prependFeedbackMemoryNotice(
            "pulled four different post directions from what i already know about you.",
            feedbackMemoryNotice,
          ),
          data: {
            draft: draftBundleResult.draft,
            drafts: draftBundleResult.drafts,
            draftBundle: draftBundleResult.draftBundle,
            supportAsset: draftBundleResult.supportAsset,
            plan: guardedPlan,
            issuesFixed: draftBundleResult.issuesFixed,
            groundingSources: groundingSourcesForTurn,
            groundingMode: draftGroundingSummary.groundingMode,
            groundingExplanation: draftGroundingSummary.groundingExplanation,
          },
          memory,
        };
      }

      const draftResult = await generateDraftWithGroundingRetry({
        plan: guardedPlan,
        activeConstraints: planActiveConstraints,
        activeDraft,
        sourceUserMessage: planInput.planMessage,
        draftPreference: turnDraftPreference,
        formatPreference: turnFormatPreference,
        threadFramingStyle: turnThreadFramingStyle,
        fallbackToWriterWhenCriticRejected: true,
        topicSummary: guardedPlan.objective,
        groundingPacket: planGroundingPacket,
      });

      if (draftResult.kind === "response" && draftResult.response.mode === "error") {
        // Fall through to plan presentation if draft generation fails.
        await writeMemoryLocal(planMemoryPatch);
        return {
          ...planResponseSeed,
          memory,
        };
      }

      if (draftResult.kind === "response") {
        return draftResult.response;
      }

      const historicalTexts = await services.getHistoricalPosts({
        userId,
        xHandle: effectiveXHandle,
      });
      const execution = await executeDraftingCapability({
        workflow: "plan_then_draft",
        capability: "drafting",
        activeContextRefs: [
          "memory.pendingPlan",
          "memory.topicSummary",
          "memory.rollingSummary",
        ],
        context: {
          memory,
          plan: guardedPlan,
          activeConstraints: planActiveConstraints,
          historicalTexts,
          userMessage,
          draftPreference: turnDraftPreference,
          turnFormatPreference,
          styleCard,
          feedbackMemoryNotice,
          nextAssistantTurnCount,
          latestDraftStatus: "Rough draft generated",
          refreshRollingSummary: shouldRefreshRollingSummary(
            nextAssistantTurnCount,
            true,
          ),
          groundingSources: groundingSourcesForTurn,
          groundingMode: draftGroundingSummary.groundingMode,
          groundingExplanation: draftGroundingSummary.groundingExplanation,
        },
        services: {
          checkDeterministicNovelty: services.checkDeterministicNovelty,
          runDraft: async () => draftResult,
          buildNoveltyNotes,
        },
      });

      mergeCapabilityExecutionMeta(execution);
      if (execution.output.kind === "response") {
        return execution.output.response;
      }

      await writeMemoryLocal({
        ...execution.output.memoryPatch,
        activeConstraints: planActiveConstraints,
      });

      return {
        ...execution.output.responseSeed,
        data: {
          ...execution.output.responseSeed.data,
          plan: guardedPlan,
        },
        memory,
      };
    }

    await writeMemoryLocal(planMemoryPatch);
    return {
      ...planResponseSeed,
      memory,
    };
  }

  async function handleDraftEditReviewMode(): Promise<RawOrchestratorResponse> {
    // V3: Harden the edit path. If mode is edit/review but the frontend
    // did not send activeDraft, try to recover the last draft from the
    // most recent assistant message in the thread.
    let effectiveActiveDraft = activeDraft;
    if (
      !effectiveActiveDraft &&
      runtimeWorkflow === "revise_draft" &&
      threadId
    ) {
      try {
        const lastDraftMessage = await prisma.chatMessage.findFirst({
          where: {
            threadId,
            role: "assistant",
          },
          orderBy: { createdAt: "desc" },
          select: { data: true },
        });
        const messageData = lastDraftMessage?.data as
          | Record<string, unknown>
          | undefined;
        if (
          messageData?.draft &&
          typeof messageData.draft === "string"
        ) {
          effectiveActiveDraft = messageData.draft;
        }
      } catch {
        // Non-critical — if recovery fails, fall through to fresh draft.
      }
    }

    if (runtimeWorkflow === "revise_draft" && !effectiveActiveDraft) {
      return returnClarificationQuestion({
        question: "paste the draft you want me to improve, or open one from this thread and i'll revise it.",
        traceReason: "missing_active_draft_for_edit",
      });
    }

    const revisionActiveConstraints = Array.from(
      new Set([
        ...(isConstraintDeclaration(userMessage)
          ? [...effectiveActiveConstraints, userMessage.trim()]
          : effectiveActiveConstraints),
        ...(safeFrameworkConstraint ? [safeFrameworkConstraint] : []),
      ]),
    );

    if (
      shouldUseRevisionDraftPath({
        mode,
        workflow: runtimeWorkflow,
        activeDraft: effectiveActiveDraft,
      }) &&
      effectiveActiveDraft
    ) {
      const revision = normalizeDraftRevisionInstruction(
        draftInstruction,
        effectiveActiveDraft,
      );
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
          memory,
          activeDraft: effectiveActiveDraft,
          revision,
          revisionActiveConstraints,
          effectiveContext,
          relevantTopicAnchors,
          styleCard,
          maxCharacterLimit,
          goal,
          antiPatterns,
          turnDraftPreference,
          turnFormatPreference,
          threadPostMaxCharacterLimit,
          turnThreadFramingStyle,
          userMessage,
          groundingPacket,
          feedbackMemoryNotice,
          nextAssistantTurnCount,
          refreshRollingSummary: shouldRefreshRollingSummary(
            nextAssistantTurnCount,
            false,
          ),
          latestRefinementInstruction: draftInstruction,
          groundingSources: groundingSourcesForTurn,
          groundingMode: draftGroundingSummary.groundingMode,
          groundingExplanation: draftGroundingSummary.groundingExplanation,
        },
        services: {
          generateRevisionDraft: services.generateRevisionDraft,
          critiqueDrafts: services.critiqueDrafts,
          buildClarificationResponse: () =>
            returnClarificationQuestion({
              question: buildGroundedProductClarificationQuestion(
                effectiveActiveDraft || memory.topicSummary || userMessage,
              ),
            }),
        },
      });

      mergeCapabilityExecutionMeta(execution);
      if (execution.output.kind === "response") {
        return execution.output.response;
      }

      await writeMemoryLocal(execution.output.memoryPatch);

      return {
        ...execution.output.responseSeed,
        memory,
      };
    }

    const historicalTexts = await services.getHistoricalPosts({
      userId,
      xHandle: effectiveXHandle,
    });

    let planFailureReason: string | null = null;
    const plan = await services.generatePlan(
      draftInstruction,
      memory.topicSummary,
      Array.from(
        new Set([
          ...revisionActiveConstraints,
          ...(safeFrameworkConstraint ? [safeFrameworkConstraint] : []),
        ]),
      ),
      effectiveContext,
      activeDraft,
      {
        goal,
        conversationState: memory.conversationState,
        antiPatterns,
        draftPreference: turnDraftPreference,
        formatPreference: turnFormatPreference,
        activePlan: memory.pendingPlan,
        latestRefinementInstruction: memory.latestRefinementInstruction,
        lastIdeationAngles: memory.lastIdeationAngles,
        voiceTarget: baseVoiceTarget,
        groundingPacket,
        creatorProfileHints,
        onFailureReason: (reason: string) => {
          planFailureReason = reason;
        },
      },
    );

    if (!plan) {
      routingTrace.planFailure = planFailureReason
        ? { reason: planFailureReason }
        : { reason: "the planner request failed" };
      return {
        mode: "error",
        outputShape: "coach_question",
        response: buildPlanFailureResponse(planFailureReason),
        memory,
      };
    }

    routingTrace.planFailure = null;

    const planWithPreference = applySourceMaterialBiasToPlan(
      applyCreatorProfileHintsToPlan(
        withPlanPreferences(
          plan,
          turnDraftPreference,
          turnFormatPreference,
        ),
        creatorProfileHints,
      ),
      selectedSourceMaterials,
      {
        hasAutobiographicalGrounding: hasAutobiographicalGrounding(groundingPacket),
      },
    );
    const guardedPlan = shouldForceNoFabricationGuardrailForTurn
      ? withNoFabricationPlanGuardrail(planWithPreference)
      : planWithPreference;
    const draftActiveConstraints = hasNoFabricationPlanGuardrail(guardedPlan)
      ? appendNoFabricationConstraint(revisionActiveConstraints)
      : revisionActiveConstraints;
    const draftGroundingPacket = buildGroundingPacketForContext(
      draftActiveConstraints,
      draftInstruction,
    );

    const execution = await executeDraftingCapability({
      workflow: "plan_then_draft",
      capability: "drafting",
      activeContextRefs: [
        "memory.pendingPlan",
        "memory.topicSummary",
        "memory.rollingSummary",
      ],
      context: {
        memory,
        plan: guardedPlan,
        activeConstraints: draftActiveConstraints,
        historicalTexts,
        userMessage,
        draftPreference: guardedPlan.deliveryPreference || turnDraftPreference,
        turnFormatPreference,
        styleCard,
        feedbackMemoryNotice,
        nextAssistantTurnCount,
        latestDraftStatus: "Draft delivered",
        refreshRollingSummary: shouldRefreshRollingSummary(
          nextAssistantTurnCount,
          false,
        ),
        groundingSources: groundingSourcesForTurn,
        groundingMode: draftGroundingSummary.groundingMode,
        groundingExplanation: draftGroundingSummary.groundingExplanation,
      },
      services: {
        checkDeterministicNovelty: services.checkDeterministicNovelty,
        runDraft: () =>
          generateDraftWithGroundingRetry({
            plan: guardedPlan,
            activeConstraints: draftActiveConstraints,
            activeDraft,
            sourceUserMessage: draftInstruction,
            draftPreference: guardedPlan.deliveryPreference || turnDraftPreference,
            formatPreference: guardedPlan.formatPreference || turnFormatPreference,
            threadFramingStyle: turnThreadFramingStyle,
            fallbackToWriterWhenCriticRejected: false,
            topicSummary: guardedPlan.objective,
            groundingPacket: draftGroundingPacket,
          }),
        handleNoveltyConflict: () =>
          returnClarificationTree({
            branchKey: "plan_reject",
            seedTopic: plan.objective,
            pendingPlan: null,
            replyOverride:
              "that version felt too close to something you've already posted. let's shift it.",
          }),
        buildNoveltyNotes,
      },
    });

    mergeCapabilityExecutionMeta(execution);
    if (execution.output.kind === "response") {
      return execution.output.response;
    }

    await writeMemoryLocal({
      ...execution.output.memoryPatch,
      activeConstraints: draftActiveConstraints,
    });

    return {
      ...execution.output.responseSeed,
      memory,
    };
  }

  async function handleCoachMode(): Promise<RawOrchestratorResponse> {
    // The deterministic/fast-LLM fast path was moved up to run before the 
    // heavy Promise.all orchestration. If we are here, we need the full coach response.

    const coachReply = await services.generateCoachReply(
      userMessage,
      effectiveContext,
      memory.topicSummary,
      styleCard,
      relevantTopicAnchors,
      userContextString,
      {
        goal,
        conversationState: memory.conversationState,
        antiPatterns,
      },
    );

    const nextConcreteAnswerCount =
      userMessage.length > 15
        ? memory.concreteAnswerCount + 1
        : memory.concreteAnswerCount;

    const rollingSummary = shouldRefreshRollingSummary(nextAssistantTurnCount, false)
      ? buildRollingSummary({
        currentSummary: memory.rollingSummary,
        topicSummary: memory.topicSummary,
        approvedPlan: memory.pendingPlan,
        activeConstraints: effectiveActiveConstraints,
        latestDraftStatus: "Context gathering",
        formatPreference: memory.formatPreference || turnFormatPreference,
        unresolvedQuestion: coachReply?.probingQuestion || null,
      })
      : memory.rollingSummary;

    await writeMemoryLocal({
      conversationState:
        memory.pendingPlan && memory.conversationState === "plan_pending_approval"
          ? "plan_pending_approval"
          : "needs_more_context",
      concreteAnswerCount: nextConcreteAnswerCount,
      rollingSummary,
      assistantTurnCount: nextAssistantTurnCount,
      unresolvedQuestion: coachReply?.probingQuestion || null,
      clarificationQuestionsAsked: coachReply?.probingQuestion
        ? memory.clarificationQuestionsAsked + 1
        : memory.clarificationQuestionsAsked,
    });

    const finalResponse =
      coachReply?.response ||
      "i can help with ideas, drafts, revisions, or figuring out what to post.";

    return {
      mode: "coach",
      outputShape: "coach_question",
      response: prependFeedbackMemoryNotice(finalResponse, feedbackMemoryNotice),
      memory,
    };
  }

  // ---------------------------------------------------------------------------
  // Execution Routing
  // ---------------------------------------------------------------------------

  routingTrace.resolvedMode = mode;
  switch (runtimeWorkflow) {
    case "ideate":
      return handleIdeateMode();
    case "plan_then_draft":
      return mode === "plan" ? handlePlanMode() : handleDraftEditReviewMode();
    case "revise_draft":
      return handleDraftEditReviewMode();
    case "reply_to_post":
    case "analyze_post":
    case "answer_question":
    default:
      return handleCoachMode();
  }

  throw new Error("Pipeline fell through");
}
