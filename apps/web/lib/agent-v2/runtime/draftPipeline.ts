import {
  inferDraftPreference,
  buildDraftGroundingSummary,
  inferDraftFormatPreference,
  resolveRequestedThreadFramingStyle,
} from "../grounding/preferences.ts";
import {
  buildGroundedTopicDraftInput,
  extractPriorUserTurn,
} from "../capabilities/planning/clarificationHeuristics.ts";
import type { ConversationServices } from "./services.ts";
import type { OrchestratorResponse, RoutingTracePatch } from "./types.ts";
import {
  isBareDraftRequest,
  isConcreteTopicfulThreadDraftRequest,
  inferFormatIntent,
  isMultiDraftRequest,
  resolveDraftOutputShape,
} from "../core/conversationHeuristics";
import {
  buildEffectiveContext,
  buildFactSafeReferenceHints,
  retrieveRelevantContext,
} from "../memory/contextRetriever";
import {
  buildRollingSummary,
  shouldRefreshRollingSummary,
} from "../memory/summaryManager";
import { resolveVoiceTarget } from "../core/voiceTarget";
import { analyzeSourceTweet } from "../core/replyContextExtractor.ts";
import {
  getXCharacterLimitForFormat,
  getXCharacterLimitForAccount,
  splitSerializedThreadPosts,
  type ThreadFramingStyle,
} from "../../onboarding/shared/draftArtifacts.ts";
import { buildClarificationTree } from "../capabilities/planning/clarificationTree";
import {
  hasConcreteCorrectionDetail,
  looksLikeSemanticCorrection,
} from "../responses/semanticRepair";
import {
  looksLikeConfusionPing,
  looksLikePostReferenceRequest,
  looksLikeSourceTransparencyRequest,
} from "../responses/sourceTransparency";
import {
  extractConcreteSceneAnchors,
  NO_FABRICATION_CONSTRAINT,
  NO_FABRICATION_MUST_AVOID,
} from "../grounding/draftGrounding";
import { buildDraftReply } from "../responses/draftReply";
import {
  buildFeedbackMemoryNotice,
  prependFeedbackMemoryNotice,
} from "../responses/feedbackMemoryNotice";
import {
  inferBroadTopicDraftRequest,
  isOpenEndedWildcardDraftRequest,
  shouldForceLooseDraftIdeation,
  shouldFastStartGroundedDraft,
} from "../capabilities/planning/draftFastStart.ts";
import { stripSelectedAnglePromptPrefix } from "../capabilities/drafting/selectedAnglePrompt.ts";
import { resolveConversationRouterState } from "./conversationRouterMachine";
import {
  buildSessionConstraints,
  sessionConstraintsToLegacyStrings,
} from "../core/sessionConstraints";
import { evaluateDraftContextSlots } from "../capabilities/planning/draftContextSlots";
import {
  shouldForceNoFabricationPlanGuardrail,
} from "../grounding/draftGrounding";
import {
  addGroundingUnknowns,
  buildGroundingPacket,
  buildSafeFrameworkConstraint,
  deriveTurnScopedGrounding,
  hasAutobiographicalGrounding,
  type GroundingPacket,
} from "../grounding/groundingPacket";
import {
  buildDraftRequestPolicy,
  type DraftRequestPolicy,
} from "../grounding/requestPolicy.ts";
import {
  mapPreferredOutputShapeToFormatPreference,
} from "../grounding/creatorHintPolicy";
import { buildUserContextString } from "../grounding/userContextString";
import { buildSourceMaterialDraftConstraints } from "../grounding/sourceMaterialDraftPolicy";
import {
  mergeSourceMaterialsIntoGroundingPacket,
  selectRelevantSourceMaterials,
  type SourceMaterialAssetRecord,
} from "../grounding/sourceMaterials";
import type {
  ContinuationState,
  CreatorChatQuickReply,
  DraftFormatPreference,
  DraftPreference,
  SessionConstraint,
  StrategyPlan,
  V2ConversationMemory,
} from "../contracts/chat";
import type { TurnContext } from "./turnContextBuilder";
import type { RoutingPolicyResult } from "./routingPolicy";
import { saveConversationTurnMemory } from "./memoryPolicy";
import { summarizeRuntimeWorkerExecutions } from "./runtimeTrace.ts";
import type { AgentRuntimeWorkflow } from "./runtimeContracts.ts";
import { executeIdeationCapability } from "../capabilities/ideation/ideationCapability.ts";
import { buildDraftClarificationQuickReplies } from "../responses/draftClarificationQuickReplies.ts";
import {
  handleNonDraftCoachTurn,
  handleNonDraftCorrectionTurn,
} from "../capabilities/planning/nonDraftCoachTurn.ts";
import { handlePlanClarificationTurn } from "../capabilities/planning/planClarificationTurn.ts";
import { handlePlanModeTurn } from "../capabilities/planning/planModeTurn.ts";
import { handlePendingPlanTurn } from "../capabilities/planning/pendingPlanTurn.ts";
import {
  executeDraftingCapability,
  type DraftingCapabilityRunResult,
} from "../capabilities/drafting/draftingCapability.ts";
import { runGroundedDraftRetry } from "../capabilities/drafting/groundedDraftRetry.ts";
import { handleDraftEditReviewTurn } from "../capabilities/revision/draftEditReviewTurn.ts";
import {
  handleActiveDraftCoachTurn,
  resumeActiveDraftSemanticRepair,
} from "../capabilities/revision/activeDraftTurn.ts";
import { executeReplyingCapability } from "../capabilities/reply/replyingCapability.ts";
import { executeAnalysisCapability } from "../capabilities/analysis/analysisCapability.ts";
import { isRevisionRetryApproval } from "./turnRelation.ts";
import { resolveLiveContextForPlan } from "./liveContext.ts";

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
    focusedThreadPostIndex,
    voiceProfileId,
    primaryPersona,
    goldenExampleCount,
    styleCard,
    anchors,
    effectiveXHandle,
    effectiveActiveConstraints,
    sessionConstraints,
    formatPreference,
    creatorProfileHints,
    userContextString: preloadedUserContextString,
    runId,
    threadId,
    turnPlan,
    explicitIntent,
    threadFramingStyle
  } = context;

  const { routingTrace } = routing;
  const effectiveSessionConstraintTexts = sessionConstraintsToLegacyStrings(
    sessionConstraints || [],
  );
  let mode = routing.resolvedMode; // resolvedMode;
  const runtimeWorkflow =
    routingTrace.runtimeResolution?.workflow || resolveLegacyRuntimeWorkflow(mode);
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
  const applyRoutingTracePatch = (patch?: RoutingTracePatch) => {
    if (patch?.clarification) {
      routingTrace.clarification = patch.clarification;
    }
    if (patch?.draftGuard) {
      routingTrace.draftGuard = patch.draftGuard;
    }
  };
  const loadHistoricalTextsWithTrace = async (capability: "drafting" | "planning") => {
    const result = await services.loadHistoricalTexts({
      userId,
      xHandle: effectiveXHandle,
      capability,
    });

    mergeCapabilityExecutionMeta({
      workers: result.workerExecutions,
    });

    return result.texts;
  };

  // We rewrite writeMemory locally to call saveConversationTurnMemory

  const antiPatterns = antiPatternResult.antiPatterns;
  const draftContinuationState =
    memory.continuationState?.capability === "drafting"
      ? memory.continuationState
      : null;
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
  const turnFormatIntent = inferFormatIntent(userMessage);
  const turnRequestPolicy = buildDraftRequestPolicy({
    userMessage,
    formatIntent: turnFormatIntent,
  });
  const buildGroundingPacketForContext = (
    activeConstraints: string[],
    sourceText: string,
  ): GroundingPacket => {
    let nextPacket = buildGroundingPacket({
      styleCard,
      activeConstraints,
      extractedFacts,
      turnScopedGrounding: deriveTurnScopedGrounding(sourceText),
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
    effectiveSessionConstraintTexts,
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
    activeConstraints: effectiveSessionConstraintTexts,
  });
  const shouldForceNoFabricationGuardrailForTurn = shouldForceNoFabricationPlanGuardrail({
    userMessage,
    behaviorKnown: turnDraftContextSlots.behaviorKnown,
    stakesKnown: turnDraftContextSlots.stakesKnown,
    formatIntent: turnFormatIntent,
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
  const userContextString =
    preloadedUserContextString ||
    buildUserContextString({
      onboardingResult:
        (storedRun?.result as Parameters<typeof buildUserContextString>[0]["onboardingResult"]) ??
        null,
      creatorProfileHints,
      stage,
      goal,
      factualContext,
      voiceContextHints,
    });

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
    activeConstraints: effectiveSessionConstraintTexts,
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
  const activeDraftIsThread =
    typeof activeDraft === "string" && splitSerializedThreadPosts(activeDraft).length > 1;
  const threadPostMaxCharacterLimit =
    turnFormatPreference === "thread" || activeDraftIsThread
      ? getXCharacterLimitForAccount(isVerifiedAccount)
      : undefined;
  const maxCharacterLimit = getXCharacterLimitForFormat(
    isVerifiedAccount,
    turnFormatPreference,
  );
  const forceSafeFrameworkModeForTurn =
    turnRequestPolicy.formatIntent !== "story" &&
    turnRequestPolicy.formatIntent !== "joke" &&
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
    creatorProfileHints,
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
      activeConstraints: effectiveSessionConstraintTexts,
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
    activeConstraints: effectiveSessionConstraintTexts,
    approvedPlan: memory.pendingPlan,
    activeDraft: activeDraft || null,
    sourceMaterialRefs: selectedSourceMaterials,
    ...(useFactSafeReferenceHintsForTurn
      ? { referenceLabel: "REFERENCE HINTS" }
      : {}),
  });
  let draftInstruction = planSeedMessage || userMessage;
  let revisionUserMessage = userMessage;

  if (
    activeDraft &&
    memory.latestRefinementInstruction?.trim() &&
    isRevisionRetryApproval({
      message: userMessage,
      recentHistory,
    })
  ) {
    draftInstruction = memory.latestRefinementInstruction.trim();
    revisionUserMessage = draftInstruction;
  }

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

  function normalizeContinuationMessage(value: string): string {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
  }

  function isDraftRetryLikeMessage(value: string): boolean {
    const normalized = normalizeContinuationMessage(value);
    return (
      normalized === "retry" ||
      normalized === "try again" ||
      normalized === "regenerate" ||
      normalized === "rerun" ||
      normalized === "run it again"
    );
  }

  function buildFormatAwareDraftPrompt(
    seedTopic: string,
    formatPreference: DraftFormatPreference,
  ): string {
    return formatPreference === "thread"
      ? `write a thread about ${seedTopic}`
      : `write a post about ${seedTopic}`;
  }

  function resolveRequestPolicy(args: {
    plan?: StrategyPlan | null;
    sourceUserMessage?: string | null;
  }): DraftRequestPolicy {
    return buildDraftRequestPolicy({
      userMessage:
        args.sourceUserMessage?.trim() ||
        args.plan?.objective ||
        userMessage,
      formatIntent: args.plan?.formatIntent || turnFormatIntent,
    });
  }

  function hasStoryAnchorDetail(value: string): boolean {
    const normalized = value.trim();
    if (!normalized) {
      return false;
    }

    return (
      /\b\d+\s*(?:day|days|week|weeks|month|months|year|years|%|percent)\b/i.test(
        normalized,
      ) ||
      /\b(?:project|client|tool|bug|feature|role|interview|company|startup|product|team)\b/i.test(
        normalized,
      ) ||
      /\b(?:at|with|for)\s+[A-Z][a-z0-9]+/i.test(normalized)
    );
  }

  function buildStoryClarificationQuestion(sourceUserMessage: string): string {
    const normalized = sourceUserMessage.trim();

    if (/\b(?:role|interview|job)\b/i.test(normalized)) {
      return "love the story angle. what specific role, company, or interview moment should anchor it?";
    }

    if (/\b(?:build|built|shipped|launch|launched|bug|client|project)\b/i.test(normalized)) {
      return "love the angle. what's the specific project, bug, or client moment this story should center on?";
    }

    return "love the angle. what's the specific project, tool, or moment you want this story anchored to?";
  }

  function shouldAskStoryClarification(args: {
    plan: StrategyPlan;
    sourceUserMessage: string;
    groundingPacket: GroundingPacket;
    storyClarificationAsked?: boolean;
  }): boolean {
    if (args.storyClarificationAsked || args.plan.formatIntent !== "story") {
      return false;
    }

    const source = args.sourceUserMessage.trim();
    if (!source || hasStoryAnchorDetail(source)) {
      return false;
    }

    const lowGroundingDensity =
      args.groundingPacket.factualAuthority?.length
        ? args.groundingPacket.factualAuthority.length < 2
        : args.groundingPacket.turnGrounding.length < 2;

    return lowGroundingDensity;
  }

  function buildDraftContinuationState(args: {
    pendingAction: "retry_delivery" | "awaiting_grounding_answer";
    plan: StrategyPlan;
    activeConstraints: string[];
    sourceUserMessage?: string | null;
    sourcePrompt?: string | null;
    formatPreference: DraftFormatPreference;
    formatIntent?: StrategyPlan["formatIntent"];
    threadFramingStyle?: ThreadFramingStyle | null;
    storyClarificationAsked?: boolean;
  }): ContinuationState {
    return {
      capability: "drafting",
      pendingAction: args.pendingAction,
      formatPreference: args.formatPreference,
      formatIntent: args.formatIntent || args.plan.formatIntent || null,
      threadFramingStyle: args.threadFramingStyle ?? null,
      sourceUserMessage: args.sourceUserMessage?.trim() || null,
      sourcePrompt: args.sourcePrompt?.trim() || null,
      activeConstraints: args.activeConstraints,
      plan: args.plan,
      storyClarificationAsked: args.storyClarificationAsked === true,
    };
  }

  function buildGroundingFollowUpConstraints(answer: string): string[] {
    const trimmed = answer.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      return [];
    }

    const normalized = trimmed.toLowerCase();
    const constraints = [
      `Grounding follow-up from user: ${trimmed}. Keep the draft grounded to this answer and do not invent missing details.`,
    ];

    if (normalized.includes("plain product claim")) {
      constraints.push(
        "Grounding lane: plain product claim only. Do not use first-person usage or build stories unless explicitly grounded.",
      );
    }

    if (
      normalized.includes("own use/build experience") ||
      normalized.includes("your own use/build experience") ||
      normalized.includes("build experience") ||
      normalized.includes("use/build")
    ) {
      constraints.push(
        "Grounding lane: use only explicitly grounded build or use experience. If direct first-person grounding is missing, stay factual and avoid autobiographical claims.",
      );
    }

    if (normalized.includes("funny loss") || normalized.includes("loss itself")) {
      constraints.push(
        "Grounding lane: land on the funny loss itself. Keep the draft anchored in the concrete scene rather than abstract lessons.",
      );
    }

    if (normalized.includes("actual takeaway") || normalized.includes("takeaway")) {
      constraints.push(
        "Grounding lane: land on the actual takeaway. Center the lesson without inventing extra scene details.",
      );
    }

    return Array.from(new Set(constraints));
  }

  async function returnClarificationQuestion(args: {
    question: string;
    reply?: string;
    clarificationState?: V2ConversationMemory["clarificationState"] | null;
    quickReplies?: CreatorChatQuickReply[];
    topicSummary?: string | null;
    pendingPlan?: StrategyPlan | null;
    continuationState?: ContinuationState | null;
    traceReason?: string | null;
    traceKind?: "question" | "tree";
  }): Promise<RawOrchestratorResponse> {
    const synthesizedQuickReplies =
      args.quickReplies && args.quickReplies.length > 0
        ? args.quickReplies
        : buildDraftClarificationQuickReplies({
            question: args.reply || args.question,
            userMessage,
            styleCard,
            topicAnchors: relevantTopicAnchors,
            seedTopic:
              args.clarificationState?.seedTopic ||
              args.topicSummary ||
              memory.topicSummary,
            isVerifiedAccount,
            requestedFormatPreference: turnFormatPreference,
          });
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
      continuationState: args.continuationState ?? null,
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
      ...(synthesizedQuickReplies.length
        ? {
            data: {
              quickReplies: synthesizedQuickReplies,
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

  async function returnDeliveryValidationFallback(args: {
    issues: string[];
    response?: string;
    plan: StrategyPlan;
    activeConstraints: string[];
    sourceUserMessage?: string | null;
    sourcePrompt?: string | null;
    formatPreference: DraftFormatPreference;
    threadFramingStyle?: ThreadFramingStyle | null;
  }): Promise<RawOrchestratorResponse> {
    const retryQuickReply: CreatorChatQuickReply = {
      kind: "retry_action",
      label: "retry",
      value: "retry",
      explicitIntent: "draft",
      formatPreference: args.formatPreference,
    };

    await writeMemoryLocal({
      assistantTurnCount: nextAssistantTurnCount,
      clarificationState: null,
      continuationState: buildDraftContinuationState({
        pendingAction: "retry_delivery",
        plan: args.plan,
        activeConstraints: args.activeConstraints,
        sourceUserMessage: args.sourceUserMessage,
        sourcePrompt: args.sourcePrompt,
        formatPreference: args.formatPreference,
        formatIntent: args.plan.formatIntent || turnFormatIntent,
        threadFramingStyle: args.threadFramingStyle,
      }),
      ...clearClarificationPatch(),
    });

    return {
      mode: "coach",
      outputShape: "coach_question",
      response: prependFeedbackMemoryNotice(
        args.response ||
          buildHumanDeliveryFallbackResponse({
            issues: args.issues,
            formatPreference: args.formatPreference,
          }),
        feedbackMemoryNotice,
      ),
      data: {
        quickReplies: [retryQuickReply],
      },
      memory,
    };
  }

  function buildConcreteSceneClarificationQuestion(sourceUserMessage: string): string {
    const anchors = extractConcreteSceneAnchors(sourceUserMessage);
    const anchorSummary =
      anchors.length > 0 ? anchors.join(", ") : "the scene you mentioned";

    return `i can write this, but i don't want to make up a lesson around ${anchorSummary}. what should it land as - the funny loss itself or the actual takeaway?`;
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
      return "i can write this, but i need one thing first - your own build experience or a plain product point?";
    }
    return `i can write this, but i don't want to fake a personal usage story around ${normalized}. what lane should i use here - plain product claim or your own use/build experience?`;
  }

  function buildHumanDeliveryFallbackResponse(args: {
    issues: string[];
    formatPreference: DraftFormatPreference;
  }): string {
    const normalizedIssues = args.issues.map((issue) => issue.toLowerCase());
    const mentionsMissingThreadShape = normalizedIssues.some(
      (issue) =>
        issue.includes("not contain enough distinct posts") ||
        issue.includes("opener is malformed") ||
        issue.includes("missing substantive hook"),
    );
    const mentionsWeakThreadHook = normalizedIssues.some((issue) =>
      issue.includes("summary block instead of a sharp hook"),
    );
    const mentionsPromptEcho = normalizedIssues.some((issue) =>
      issue.includes("echoing the user's prompt") ||
      issue.includes("restates the user's prompt"),
    );
    const mentionsTruncation = normalizedIssues.some((issue) =>
      issue.includes("cut off before a complete ending"),
    );
    const mentionsWrongShape = normalizedIssues.some((issue) =>
      issue.includes("looks like a thread even though a single post was requested"),
    );

    if (args.formatPreference === "thread" && mentionsMissingThreadShape) {
      return "i don't have enough grounded detail yet to turn that direction into a clean thread. you can retry with the same direction, or send one concrete detail and i'll use that.";
    }

    if (args.formatPreference === "thread" && mentionsWeakThreadHook) {
      return "the thread opener came back too generic to post cleanly. you can retry with the same direction, or send one concrete detail so i can ground the hook better.";
    }

    if (mentionsWrongShape) {
      return "that came back in the wrong shape for what you asked. you can retry with the same direction, or send one concrete detail and i'll anchor it better.";
    }

    if (mentionsTruncation) {
      return "that draft got cut off before it finished cleanly. you can retry with the same direction, or send one concrete detail and i'll anchor it better.";
    }

    if (mentionsPromptEcho) {
      return "that draft repeated your instruction instead of turning it into a clean post. you can retry with the same direction, or send one concrete detail and i'll anchor it better.";
    }

    return "i don't have enough grounded detail yet to turn that into a clean draft. you can retry with the same direction, or send one concrete detail and i'll use that.";
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
    const preferredPlanFormat =
      draftContinuationState?.formatPreference ||
      memory.pendingPlan?.formatPreference ||
      turnFormatPreference;
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
      const basePrompt =
        priorDraftRequest || buildFormatAwareDraftPrompt(seedTopic, preferredPlanFormat);

      return {
        planMessage: `${basePrompt}. factual grounding: ${groundedAnswer}`,
        activeConstraints: Array.from(
          new Set([...args.activeConstraints, `Topic grounding: ${groundedAnswer}`]),
        ),
      };
    }

    if (branchKey === "topic_known_but_direction_missing") {
      return {
        planMessage: `${buildFormatAwareDraftPrompt(seedTopic, preferredPlanFormat)}. direction: ${trimmed}`,
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
    sessionConstraints?: SessionConstraint[];
    activeDraft?: string;
    sourceUserMessage?: string | null;
    draftPreference: DraftPreference;
    formatPreference: DraftFormatPreference;
    threadFramingStyle?: ThreadFramingStyle | null;
    fallbackToWriterWhenCriticRejected: boolean;
    topicSummary?: string | null;
    pendingPlan?: StrategyPlan | null;
    groundingPacket?: GroundingPacket;
    requestPolicy?: DraftRequestPolicy;
    storyClarificationAsked?: boolean;
  }): Promise<DraftingCapabilityRunResult> {
    const draftGroundingPacket = args.groundingPacket || groundingPacket;
    const liveContext = await resolveLiveContextForPlan({
      plan: args.plan,
      memory,
      executeWebSearch: services.executeWebSearch,
      writeMemory: async (patch) => {
        await writeMemoryLocal(patch);
      },
    });
    const requestPolicy =
      args.requestPolicy ||
      resolveRequestPolicy({
        plan: args.plan,
        sourceUserMessage: args.sourceUserMessage,
      });
    const replyContext =
      args.plan.targetLane === "reply" || Boolean(memory.activeReplyContext?.sourceText)
        ? memory.activeReplyContext?.replyContext ||
          await analyzeSourceTweet(
            memory.activeReplyContext?.sourceText || args.sourceUserMessage || "",
          )
        : null;
    let draftingMs = 0;
    const attemptDraft = async (
      extraConstraints: string[] = [],
    ) => {
      const attemptStartedAt = Date.now();
      try {
        const attemptConstraints = Array.from(
          new Set([
            ...args.activeConstraints,
            ...(safeFrameworkConstraint ? [safeFrameworkConstraint] : []),
            ...sourceMaterialDraftConstraints,
            ...extraConstraints,
          ]),
        );
        const attemptSessionConstraints = buildSessionConstraints({
          activeConstraints: [
            ...((args.sessionConstraints || [])
              .filter((constraint) => constraint.source === "explicit")
              .map((constraint) => constraint.text)),
            ...(safeFrameworkConstraint ? [safeFrameworkConstraint] : []),
            ...sourceMaterialDraftConstraints,
            ...extraConstraints,
          ],
          inferredConstraints:
            (args.sessionConstraints || [])
              .filter((constraint) => constraint.source === "inferred")
              .map((constraint) => constraint.text),
        });
        const voiceTarget = resolveVoiceTarget({
          styleCard,
          userMessage: args.sourceUserMessage || args.plan.objective,
          draftPreference: args.draftPreference,
          formatPreference: args.formatPreference,
          lane: args.plan.targetLane,
          creatorProfileHints,
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
            formatIntent: requestPolicy.formatIntent,
            sourceUserMessage: args.sourceUserMessage || undefined,
            voiceTarget,
            referenceAnchorMode: requestConditionedAnchors.referenceAnchorMode,
            threadPostMaxCharacterLimit,
            threadFramingStyle: args.threadFramingStyle,
            voiceProfileId,
            goldenExampleCount,
            primaryPersona,
            activePlan: args.pendingPlan || args.plan,
            latestRefinementInstruction: memory.latestRefinementInstruction,
            lastIdeationAngles: memory.lastIdeationAngles,
            groundingPacket: draftGroundingPacket,
            creatorProfileHints,
            userContextString,
            sessionConstraints: attemptSessionConstraints,
            activeTaskSummary: memory.rollingSummary,
            liveContext,
            replyContext,
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
            creatorProfileHints,
            userContextString,
            sessionConstraints: attemptSessionConstraints,
            activeTaskSummary: memory.rollingSummary,
            activePlan: args.pendingPlan || args.plan,
            latestRefinementInstruction: memory.latestRefinementInstruction,
            liveContext,
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
      } finally {
        draftingMs += Date.now() - attemptStartedAt;
      }
    };
    const validationStartedAt = Date.now();
    const result = await runGroundedDraftRetry({
      memory,
      plan: args.plan,
      activeConstraints: args.activeConstraints,
      sourceUserMessage: args.sourceUserMessage || undefined,
      formatPreference: args.formatPreference,
      threadFramingStyle: args.threadFramingStyle ?? null,
      ...(args.topicSummary !== undefined && args.topicSummary !== null
        ? { topicSummary: args.topicSummary }
        : {}),
      ...(args.pendingPlan !== undefined && args.pendingPlan !== null
        ? { pendingPlan: args.pendingPlan }
        : {}),
      draftGroundingPacket,
      requestPolicy,
      storyClarificationQuestion: shouldAskStoryClarification({
        plan: args.plan,
        sourceUserMessage: args.sourceUserMessage || args.plan.objective,
        groundingPacket: draftGroundingPacket,
        storyClarificationAsked: args.storyClarificationAsked,
      })
        ? buildStoryClarificationQuestion(
            args.sourceUserMessage || args.plan.objective,
          )
        : null,
      storyClarificationAsked: args.storyClarificationAsked === true,
      attemptDraft,
      buildConcreteSceneClarificationQuestion,
      buildGroundedProductClarificationQuestion,
      returnClarificationQuestion,
      returnDeliveryValidationFallback,
    });
    const validationWindowMs = Date.now() - validationStartedAt;
    routingTrace.timings = {
      ...(routingTrace.timings || {}),
      draftingMs: (routingTrace.timings?.draftingMs || 0) + draftingMs,
      validationMs:
        (routingTrace.timings?.validationMs || 0) +
        Math.max(0, validationWindowMs - draftingMs),
    };
    return result;
  }

  async function handleDraftContinuationTurn(): Promise<RawOrchestratorResponse | null> {
    if (!draftContinuationState?.plan) {
      return null;
    }

    const isStructuredRetry = context.artifactContext?.kind === "generation_retry";
    const shouldRetryStoredDraft =
      draftContinuationState.pendingAction === "retry_delivery" &&
      (isStructuredRetry || isDraftRetryLikeMessage(userMessage));
    const shouldResumeFromGroundingAnswer =
      draftContinuationState.pendingAction === "awaiting_grounding_answer" &&
      userMessage.trim().length > 0;

    if (!shouldRetryStoredDraft && !shouldResumeFromGroundingAnswer) {
      return null;
    }

    const resumedPlan = draftContinuationState.plan;
    const resumedFormatPreference =
      draftContinuationState.formatPreference ||
      resumedPlan.formatPreference ||
      turnFormatPreference;
    const resumedRequestPolicy = resolveRequestPolicy({
      plan: {
        ...resumedPlan,
        formatIntent:
          draftContinuationState.formatIntent ||
          resumedPlan.formatIntent ||
          turnFormatIntent,
      },
      sourceUserMessage:
        draftContinuationState.sourceUserMessage ||
        draftContinuationState.sourcePrompt ||
        userMessage,
    });
    const resumedThreadFramingStyle =
      draftContinuationState.threadFramingStyle ?? turnThreadFramingStyle;
    const resumedSourceUserMessage =
      draftContinuationState.sourceUserMessage?.trim() ||
      draftContinuationState.sourcePrompt?.trim() ||
      userMessage;
    const groundingFollowUpConstraints = shouldResumeFromGroundingAnswer
      ? buildGroundingFollowUpConstraints(userMessage)
      : [];
    const resumedPersistedActiveConstraints = Array.from(
      new Set([
        ...effectiveActiveConstraints,
        ...groundingFollowUpConstraints,
      ]),
    );
    const resumedActiveConstraints = Array.from(
      new Set([
        ...(draftContinuationState.activeConstraints?.length
          ? draftContinuationState.activeConstraints
          : effectiveSessionConstraintTexts),
        ...groundingFollowUpConstraints,
      ]),
    );
    const resumedSessionConstraints = buildSessionConstraints({
      activeConstraints: resumedPersistedActiveConstraints,
      inferredConstraints: resumedPlan.extractedConstraints,
    });
    const resumedGroundingPacket = buildGroundingPacketForContext(
      resumedActiveConstraints,
      resumedSourceUserMessage,
    );
    const draftResult = await generateDraftWithGroundingRetry({
      plan: resumedPlan,
      activeConstraints: resumedActiveConstraints,
      sessionConstraints: resumedSessionConstraints,
      activeDraft,
      sourceUserMessage: resumedSourceUserMessage,
      draftPreference: turnDraftPreference,
      formatPreference: resumedFormatPreference,
      threadFramingStyle: resumedThreadFramingStyle,
      fallbackToWriterWhenCriticRejected: true,
      topicSummary: resumedPlan.objective,
      groundingPacket: resumedGroundingPacket,
      requestPolicy: resumedRequestPolicy,
      storyClarificationAsked:
        draftContinuationState.storyClarificationAsked === true,
    });

    mergeCapabilityExecutionMeta({
      workers: draftResult.workers,
      validations: draftResult.validations,
    });
    applyRoutingTracePatch(draftResult.routingTracePatch);

    if (draftResult.kind === "response") {
      return draftResult.response;
    }

    const historicalTexts = await loadHistoricalTextsWithTrace("drafting");
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
        plan: resumedPlan,
        activeConstraints: resumedActiveConstraints,
        sessionConstraints: resumedSessionConstraints,
        historicalTexts,
        userMessage: resumedSourceUserMessage,
        draftPreference: turnDraftPreference,
        turnFormatPreference: resumedFormatPreference,
        styleCard,
        feedbackMemoryNotice,
        nextAssistantTurnCount,
        latestDraftStatus: "Rough draft generated",
        refreshRollingSummary: true,
        groundingSources: groundingSourcesForTurn,
        groundingMode: draftGroundingSummary.groundingMode,
        groundingExplanation: draftGroundingSummary.groundingExplanation,
        creatorProfileHints,
        requestPolicy: resumedRequestPolicy,
      },
      services: {
        checkDeterministicNovelty: services.checkDeterministicNovelty,
        runDraft: async () => draftResult,
        buildNoveltyNotes,
      },
    });

    mergeCapabilityExecutionMeta(execution);

    if (execution.output.kind === "response") {
      applyRoutingTracePatch(execution.output.routingTracePatch);
      return execution.output.response;
    }

    routingTrace.planInputSource = shouldResumeFromGroundingAnswer
      ? "clarification_answer"
      : routingTrace.planInputSource;
    routingTrace.clarification = null;

    await writeMemoryLocal({
      ...execution.output.memoryPatch,
      activeConstraints: resumedPersistedActiveConstraints,
      inferredSessionConstraints: resumedPlan.extractedConstraints,
      continuationState: null,
    });

    return {
      ...execution.output.responseSeed,
      data: {
        ...execution.output.responseSeed.data,
        plan: resumedPlan,
      },
      memory,
    };
  }

  if (
    !explicitIntent &&
    activeDraft &&
    memory.clarificationState?.branchKey === "semantic_repair"
  ) {
    const activeDraftRepair = await resumeActiveDraftSemanticRepair({
      userMessage,
      activeDraft,
      memory,
      feedbackMemoryNotice,
      nextAssistantTurnCount,
      writeMemory: writeMemoryLocal,
      clearClarificationPatch,
    });

    if (activeDraftRepair.kind === "edit_transition") {
      mode = "edit";
      draftInstruction = activeDraftRepair.draftInstruction;
    }
  }

  const draftContinuationResponse = await handleDraftContinuationTurn();
  if (draftContinuationResponse) {
    return draftContinuationResponse;
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
    const nonDraftCorrection = await handleNonDraftCorrectionTurn({
      userMessage,
      memory,
      hadPendingPlan,
      feedbackMemoryNotice,
      nextAssistantTurnCount,
      writeMemory: writeMemoryLocal,
      clearClarificationPatch,
      returnClarificationQuestion,
    });

    if (nonDraftCorrection.kind === "response") {
      return nonDraftCorrection.response;
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
    return handlePendingPlanTurn({
      userMessage,
      memory,
      getMemory: () => memory,
      effectiveActiveConstraints,
      sessionConstraints,
      safeFrameworkConstraint,
      activeDraft,
      effectiveContext,
      goal,
      antiPatterns,
      turnDraftPreference,
      turnFormatPreference,
      baseVoiceTarget,
      groundingPacket,
      requestPolicy: turnRequestPolicy,
      creatorProfileHints,
      selectedSourceMaterials,
      styleCard,
      feedbackMemoryNotice,
      nextAssistantTurnCount,
      groundingSources: groundingSourcesForTurn,
      groundingMode: draftGroundingSummary.groundingMode,
      groundingExplanation: draftGroundingSummary.groundingExplanation,
      turnThreadFramingStyle,
      writeMemory: writeMemoryLocal,
      clearClarificationPatch,
      buildGroundingPacketForContext,
      buildPlanSourceMessage,
      loadHistoricalTexts: () => loadHistoricalTextsWithTrace("drafting"),
      applyExecutionMeta: mergeCapabilityExecutionMeta,
      applyRoutingTracePatch,
      runGroundedDraft: generateDraftWithGroundingRetry,
      checkDeterministicNovelty: services.checkDeterministicNovelty,
      buildNoveltyNotes,
      returnClarificationTree,
      services: {
        generatePlan: services.generatePlan,
      },
    });
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
  const shouldAutoDraftConcreteThread =
    turnPlan?.userGoal === "draft" &&
    turnFormatPreference === "thread" &&
    isConcreteTopicfulThreadDraftRequest(userMessage);
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
    const planClarificationTurn = await handlePlanClarificationTurn({
      userMessage,
      recentHistory,
      memory,
      routing,
      explicitIntent,
      mode,
      turnDraftContextSlots,
      missingAutobiographicalGroundingForTurn,
      isVerifiedAccount,
      turnFormatPreference,
      hasReusableGroundingForTurn,
      returnClarificationQuestion,
      returnClarificationTree,
      handleIdeateMode,
      buildLooseDraftIdeationPrompt,
    });

    if (planClarificationTurn) {
      return planClarificationTurn;
    }
  }

  if (!explicitIntent && !activeDraft) {
    const nonDraftCoachTurn = await handleNonDraftCoachTurn({
      userMessage,
      memory,
      recentHistory,
      factualContext,
      historicalPostAnchors: anchors.topicAnchors,
      feedbackMemoryNotice,
      nextAssistantTurnCount,
      writeMemory: writeMemoryLocal,
      clearClarificationPatch,
    });

    if (nonDraftCoachTurn.kind === "response") {
      return nonDraftCoachTurn.response;
    }
  }

  if (!explicitIntent && activeDraft) {
    const activeDraftTurn = await handleActiveDraftCoachTurn({
      userMessage,
      activeDraft,
      memory,
      recentHistory,
      factualContext,
      feedbackMemoryNotice,
      nextAssistantTurnCount,
      sessionConstraints,
      writeMemory: writeMemoryLocal,
      clearClarificationPatch,
      returnClarificationQuestion,
    });

    if (activeDraftTurn.kind === "response") {
      return activeDraftTurn.response;
    }

    if (activeDraftTurn.kind === "edit_transition") {
      mode = "edit";
      draftInstruction = activeDraftTurn.draftInstruction;
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
        voiceProfileId,
        primaryPersona,
        goldenExampleCount,
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
    return handlePlanModeTurn({
      memory,
      getMemory: () => memory,
      userMessage,
      effectiveActiveConstraints,
      sessionConstraints,
      safeFrameworkConstraint,
      groundedTopicDraftInput,
      effectiveContext,
      activeDraft,
      goal,
      antiPatterns,
      turnDraftPreference,
      turnFormatPreference,
      baseVoiceTarget,
      creatorProfileHints,
      requestPolicy: turnRequestPolicy,
      selectedSourceMaterials,
      shouldForceNoFabricationGuardrailForTurn,
      styleCard,
      nextAssistantTurnCount,
      feedbackMemoryNotice,
      shouldAutoDraft:
        ((turnPlan?.userGoal === "draft" &&
          (
            hasEnoughContextToAct ||
            turnPlan.shouldAutoDraftFromPlan === true ||
            shouldAutoDraftConcreteThread
          )) ||
          shouldFastStartFromGroundedContext),
      isMultiDraftTurn,
      groundingSources: groundingSourcesForTurn,
      groundingMode: draftGroundingSummary.groundingMode,
      groundingExplanation: draftGroundingSummary.groundingExplanation,
      turnThreadFramingStyle,
      buildClarificationAwarePlanInput,
      buildGroundingPacketForContext,
      setPlanInputSource: (source) => {
        routingTrace.planInputSource = source;
      },
      setPlanFailure: (reason, failed) => {
        routingTrace.planFailure = failed
          ? { reason: reason || "the planner request failed" }
          : null;
      },
      loadHistoricalTexts: () => loadHistoricalTextsWithTrace("drafting"),
      writeMemory: writeMemoryLocal,
      applyExecutionMeta: mergeCapabilityExecutionMeta,
      applyRoutingTracePatch,
      runGroundedDraft: generateDraftWithGroundingRetry,
      checkDeterministicNovelty: services.checkDeterministicNovelty,
      buildNoveltyNotes,
      services: {
        generatePlan: services.generatePlan,
      },
    });
  }

  async function handleDraftEditReviewMode(): Promise<RawOrchestratorResponse> {
    return handleDraftEditReviewTurn({
      memory,
      getMemory: () => memory,
      userMessage: revisionUserMessage,
      mode,
      runtimeWorkflow,
      threadId,
      activeDraft,
      focusedThreadPostIndex,
      draftInstruction,
      effectiveActiveConstraints,
      sessionConstraints,
      safeFrameworkConstraint,
      effectiveContext,
      relevantTopicAnchors,
      styleCard,
      maxCharacterLimit,
      threadPostMaxCharacterLimit,
      goal,
      antiPatterns,
      turnDraftPreference,
      turnFormatPreference,
      turnThreadFramingStyle,
      groundingPacket,
      feedbackMemoryNotice,
      requestPolicy: turnRequestPolicy,
      nextAssistantTurnCount,
      refreshRollingSummary: shouldRefreshRollingSummary(
        nextAssistantTurnCount,
        false,
      ),
      groundingSources: groundingSourcesForTurn,
      groundingMode: draftGroundingSummary.groundingMode,
      groundingExplanation: draftGroundingSummary.groundingExplanation,
      baseVoiceTarget,
      creatorProfileHints,
      selectedSourceMaterials,
      shouldForceNoFabricationGuardrailForTurn,
      writeMemory: writeMemoryLocal,
      loadHistoricalTexts: () => loadHistoricalTextsWithTrace("planning"),
      applyExecutionMeta: mergeCapabilityExecutionMeta,
      applyRoutingTracePatch,
      setPlanFailure: (reason, failed) => {
        routingTrace.planFailure = failed
          ? { reason: reason || "the planner request failed" }
          : null;
      },
      buildGroundedProductClarificationQuestion,
      buildGroundingPacketForContext,
      runGroundedDraft: generateDraftWithGroundingRetry,
      buildNoveltyNotes,
      returnClarificationQuestion,
      returnClarificationTree,
      services: {
        generatePlan: services.generatePlan,
        generateRevisionDraft: services.generateRevisionDraft,
        critiqueDrafts: services.critiqueDrafts,
        checkDeterministicNovelty: services.checkDeterministicNovelty,
      },
    });
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
        activeConstraints: effectiveSessionConstraintTexts,
        sessionConstraints,
        creatorProfileHints,
        activeTaskSummary: memory.rollingSummary,
        activePlan: memory.pendingPlan,
        activeDraft,
        latestRefinementInstruction: memory.latestRefinementInstruction,
        lastIdeationAngles: memory.lastIdeationAngles,
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
        activeConstraints: memory.activeConstraints,
        inferredSessionConstraints: memory.inferredSessionConstraints,
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
      preferredSurfaceMode: "structured",
    });

    const finalResponse =
      coachReply?.response ||
      "post, draft, revision, or profile read?";

    return {
      mode: "coach",
      outputShape: "coach_question",
      response: prependFeedbackMemoryNotice(finalResponse, feedbackMemoryNotice),
      memory,
    };
  }

  async function handleReplyMode(): Promise<RawOrchestratorResponse> {
    const execution = await executeReplyingCapability({
      workflow: "reply_to_post",
      capability: "replying",
      activeContextRefs: [
        "memory.activeReplyContext",
        "memory.selectedReplyOptionId",
        "memory.topicSummary",
        "memory.rollingSummary",
      ],
      context: {
        userMessage,
        effectiveContext,
        topicSummary: memory.topicSummary,
        styleCard,
        relevantTopicAnchors,
        userContextString,
        goal,
        memory,
        antiPatterns,
        feedbackMemoryNotice,
        nextAssistantTurnCount,
        turnFormatPreference,
        refreshRollingSummary: shouldRefreshRollingSummary(
          nextAssistantTurnCount,
          false,
        ),
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

  async function handleAnalyzeMode(): Promise<RawOrchestratorResponse> {
    const execution = await executeAnalysisCapability({
      workflow: "analyze_post",
      capability: "analysis",
      activeContextRefs: [
        "memory.topicSummary",
        "memory.rollingSummary",
      ],
      context: {
        userMessage,
        effectiveContext,
        topicSummary: memory.topicSummary,
        styleCard,
        relevantTopicAnchors,
        userContextString,
        goal,
        memory,
        antiPatterns,
        feedbackMemoryNotice,
        nextAssistantTurnCount,
        turnFormatPreference,
        refreshRollingSummary: shouldRefreshRollingSummary(
          nextAssistantTurnCount,
          false,
        ),
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
      return handleReplyMode();
    case "analyze_post":
      return handleAnalyzeMode();
    case "answer_question":
    default:
      return handleCoachMode();
  }

  throw new Error("Pipeline fell through");
}
