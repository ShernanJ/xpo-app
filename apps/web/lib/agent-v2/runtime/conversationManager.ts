
import { buildTurnContext } from "./turnContextBuilder";
import { resolveRoutingPolicy } from "./routingPolicy";
import { executeDraftPipeline } from "./draftPipeline";
import { syncStyleProfileMemory, syncAutoSourceMaterials } from "./memoryPolicy";
import {
  isLazyDraftRequest,
  looksGenericTopicSummary,
  inferMissingSpecificQuestion,
  buildNaturalDraftClarificationQuestion,
  buildAmbiguousReferenceQuestion,
  extractPriorUserTurn,
  extractIdeaTitlesFromIdeas,
  inferTopicFromIdeaTitles,
  inferAbstractTopicSeed,
  inferLooseClarificationSeed,
  looksLikeOpaqueEntityTopic,
  buildGroundedTopicDraftInput,
} from "../capabilities/planning/clarificationHeuristics.ts";
import {
  inferDraftPreference,
  inferDraftFormatPreference,
  resolveRequestedThreadFramingStyle,
  withPlanPreferences,
} from "../grounding/preferences.ts";
import {
  createDefaultConversationServices,
  type ConversationServices,
  type StoredOnboardingRun,
} from "./services.ts";
import {
  getDurableFactsFromStyleCard,
  type VoiceStyleCard,
} from "../core/styleProfile";
import { type VoiceTarget } from "../core/voiceTarget";
import {
  type DraftGroundingMode,
  type ThreadFramingStyle,
} from "../../onboarding/shared/draftArtifacts.ts";
import {
  hasConcreteCorrectionDetail,
  looksLikeSemanticCorrection,
  normalizeRepairDetail,
} from "../responses/semanticRepair";
import {
  filterNewSourceMaterialInputs,
} from "../grounding/sourceMaterials";
import { extractAutoSourceMaterialInputs } from "../grounding/sourceMaterialSeeds.ts";
import { loadInitialContextWorkers } from "../workers/contextLoadWorkers.ts";
import {
  looksLikeMechanicalEdit,
  looksLikeNegativeFeedback,
} from "../agents/antiPatternExtractor";
import {
  countNewMemoryEntries,
} from "../responses/feedbackMemoryNotice";
import type { ConversationalDiagnosticContext } from "./diagnostics.ts";
import {
  type ConversationRouterState,
} from "./conversationRouterMachine";
import {
  type CreatorProfileHints,
  type GroundingPacketSourceMaterial,
} from "../grounding/groundingPacket";
import type { ProfileReplyContext } from "../grounding/profileReplyContext.ts";
import {
  type DraftBundleResult,
} from "../capabilities/drafting/draftBundles";
import { finalizeResponseEnvelope } from "./responseEnvelope";
import type {
  CreatorChatQuickReply,
  DraftFormatPreference,
  ResponsePresentationStyle,
  ResponseShapePlan,
  SurfaceMode,
  StrategyPlan,
  V2ChatIntent,
  V2ChatOutputShape,
  V2ConversationMemory,
} from "../contracts/chat";
import type {
  ChatArtifactContext,
  ChatPlanSeedSource,
  ChatResolvedWorkflow,
  ChatTurnSource,
} from "../contracts/turnContract";
import type {
  AgentRuntimeWorkflow,
  RuntimePersistedStateChanges,
  RuntimeResolutionSource,
  RuntimeValidationResult,
  RuntimeWorkerExecution,
  RuntimeWorkerExecutionSummary,
} from "./runtimeContracts.ts";
import { summarizeRuntimeWorkerExecutions } from "./runtimeTrace.ts";

export interface OrchestratorInput {
  userId: string;
  xHandle?: string | null;
  runId?: string;
  threadId?: string;
  userMessage: string;
  planSeedMessage?: string | null;
  recentHistory: string;
  explicitIntent?: V2ChatIntent | null;
  activeDraft?: string;
  focusedThreadPostIndex?: number | null;
  turnSource?: ChatTurnSource;
  artifactContext?: ChatArtifactContext | null;
  planSeedSource?: ChatPlanSeedSource | null;
  resolvedWorkflow?: ChatResolvedWorkflow | null;
  replyHandlingBypassedReason?: string | null;
  formatPreference?: DraftFormatPreference | null;
  threadFramingStyle?: ThreadFramingStyle | null;
  preferenceConstraints?: string[];
  creatorProfileHints?: CreatorProfileHints | null;
  userContextString?: string | null;
  profileReplyContext?: ProfileReplyContext | null;
  diagnosticContext?: ConversationalDiagnosticContext | null;
  preloadedRun?: StoredOnboardingRun | null;
  preloadedStyleCard?: VoiceStyleCard | null;
}

export interface OrchestratorData {
  angles?: unknown[];
  plan?: StrategyPlan | null;
  draft?: string | null;
  drafts?: string[];
  draftBundle?: DraftBundleResult | null;
  supportAsset?: string | null;
  issuesFixed?: string[];
  quickReplies?: CreatorChatQuickReply[];
  voiceTarget?: VoiceTarget | null;
  noveltyNotes?: string[];
  threadFramingStyle?: ThreadFramingStyle | null;
  groundingSources?: GroundingPacketSourceMaterial[];
  groundingMode?: DraftGroundingMode | null;
  groundingExplanation?: string | null;
  autoSavedSourceMaterials?: {
    count: number;
    assets: Array<{
      id: string;
      title: string;
      deletable: boolean;
    }>;
  };
  routingTrace?: RoutingTrace;
}

export interface RoutingTrace {
  normalizedTurn: {
    turnSource: ChatTurnSource;
    artifactKind: ChatArtifactContext["kind"] | null;
    planSeedSource: ChatPlanSeedSource | null;
    replyHandlingBypassedReason: string | null;
    resolvedWorkflow: ChatResolvedWorkflow | null;
  };
  runtimeResolution:
    | {
        workflow: AgentRuntimeWorkflow;
        source: RuntimeResolutionSource;
      }
    | null;
  workerExecutions: RuntimeWorkerExecution[];
  workerExecutionSummary: RuntimeWorkerExecutionSummary;
  persistedStateChanges: RuntimePersistedStateChanges | null;
  validations: RuntimeValidationResult[];
  turnPlan: {
    userGoal: string;
    overrideClassifiedIntent: string | null;
    shouldAutoDraftFromPlan: boolean;
  } | null;
  controllerAction: string | null;
  classifiedIntent: string | null;
  resolvedMode: string | null;
  routerState: ConversationRouterState | null;
  planInputSource: "raw_user_message" | "clarification_answer" | "grounded_topic" | null;
  clarification:
    | {
        kind: "question" | "tree";
        reason: string | null;
        branchKey: string | null;
        question: string;
      }
    | null;
  draftGuard:
    | {
        reason:
        | "claim_needs_clarification"
        | "concrete_scene_drift"
        | "product_drift"
        | "delivery_validation_failed";
        issues: string[];
      }
    | null;
  planFailure:
    | {
        reason: string;
      }
    | null;
  timings:
    | {
        preflightMs?: number;
        runtimeContextLoadMs?: number;
        draftingMs?: number;
        validationMs?: number;
        persistenceMs?: number;
        totalMs?: number;
      }
    | null;
}

export type OrchestratorResponse = {
  mode: "coach" | "ideate" | "plan" | "draft" | "error";
  outputShape: V2ChatOutputShape;
  response: string;
  surfaceMode: SurfaceMode;
  responseShapePlan: ResponseShapePlan;
  data?: OrchestratorData;
  memory: V2ConversationMemory;
};

export type RawOrchestratorResponse = {
  mode: "coach" | "ideate" | "plan" | "draft" | "error";
  outputShape: V2ChatOutputShape;
  response: string;
  data?: OrchestratorData;
  memory: V2ConversationMemory;
  presentationStyle?: ResponsePresentationStyle | null;
};

export interface ManagedConversationTurnRawResult {
  rawResponse: RawOrchestratorResponse;
  routingTrace: RoutingTrace;
}

function finalizeOrchestratorResponse(
  rawResponse: RawOrchestratorResponse,
): OrchestratorResponse {
  return finalizeResponseEnvelope(rawResponse) as OrchestratorResponse;
}

async function maybeCaptureAntiPattern(args: {
  userId: string;
  userMessage: string;
  activeDraft?: string;
  recentHistory: string;
  styleCard: VoiceStyleCard | null;
  xHandle: string;
},
  services: Pick<ConversationServices, "extractAntiPattern" | "saveStyleProfile">,
): Promise<{ antiPatterns: string[]; remembered: boolean }> {
  const antiExamples = args.styleCard?.antiExamples || [];
  const currentGuidance =
    antiExamples.length > 0
      ? antiExamples
        .slice(-2)
        .map((example) => example.guidance.trim())
        .filter(Boolean)
      : args.styleCard?.customGuidelines?.slice(-2) || [];

  if (
    args.userId === "anonymous" ||
    !args.styleCard ||
    !args.activeDraft ||
    !looksLikeNegativeFeedback(args.userMessage) ||
    looksLikeMechanicalEdit(args.userMessage)
  ) {
    return { antiPatterns: currentGuidance, remembered: false };
  }

  const extracted = await services.extractAntiPattern(
    args.userMessage,
    args.activeDraft,
    args.recentHistory,
  );

  if (!extracted?.shouldCapture || extracted.patternTags.length === 0) {
    return { antiPatterns: currentGuidance, remembered: false };
  }

  const nextGuidelines = Array.from(
    new Set([
      ...(args.styleCard.customGuidelines || []),
      ...(extracted.guidance ? [extracted.guidance] : []),
      ...extracted.patternTags.map((tag) => `avoid ${tag}`),
    ]),
  );
  const nextAntiExamples = [
    ...(args.styleCard.antiExamples || []),
    {
      badSnippet: extracted.badSnippet || "",
      reason: extracted.feedbackReason || "",
      guidance:
        extracted.guidance ||
        `avoid ${extracted.patternTags.join(" | ")}` ||
        "avoid repeating that rejected phrasing",
      createdAt: new Date().toISOString(),
    },
  ].slice(-5);

  args.styleCard.customGuidelines = nextGuidelines;
  args.styleCard.antiExamples = nextAntiExamples;
  services.saveStyleProfile(args.userId, args.xHandle, args.styleCard).catch((error) =>
    console.error("Failed to save anti-pattern guidance:", error),
  );

  return {
    antiPatterns: nextAntiExamples
      .slice(-2)
      .map((example) => example.guidance.trim())
      .filter(Boolean),
    remembered: true,
  };
}

/**
 * The V2 state machine.
 */

export async function manageConversationTurnRaw(
  input: OrchestratorInput,
  overrides?: Partial<ConversationServices>,
): Promise<ManagedConversationTurnRawResult> {
  const services = { ...createDefaultConversationServices(), ...overrides } as ConversationServices;
  const runtimeContextLoadStartedAt = Date.now();
  const context = await buildTurnContext(input, services);
  const route = await resolveRoutingPolicy(context, services);
  route.routingTrace.timings = route.routingTrace.timings ?? null;

  if (route.isFastReply && route.fastReplyResponse) {
    return {
      rawResponse: stripSerializedRoutingTrace(route.fastReplyResponse),
      routingTrace: route.routingTrace,
    };
  }

  // Heavy Orchestration
  const {
    extractedRules,
    extractedFacts,
    sourceMaterialAssets: rawSourceMaterialAssets,
    workerExecutions,
  } = await loadInitialContextWorkers({
    userId: context.userId,
    effectiveXHandle: context.effectiveXHandle,
    userMessage: context.userMessage,
    recentHistory: context.recentHistory,
    services,
  });

  route.routingTrace.workerExecutions.push(...workerExecutions);
  route.routingTrace.workerExecutionSummary = summarizeRuntimeWorkerExecutions(
    route.routingTrace.workerExecutions,
  );

  const semanticCorrectionDetail =
    looksLikeSemanticCorrection(context.userMessage) && hasConcreteCorrectionDetail(context.userMessage)
      ? normalizeRepairDetail(context.userMessage)
      : null;

  const styleCard = await syncStyleProfileMemory({
    userId: context.userId,
    effectiveXHandle: context.effectiveXHandle,
    styleCard: context.styleCard,
    extractedRules,
    extractedFacts,
    semanticCorrectionDetail,
    services
  });

  const autoSourceMaterialInputs =
    context.userId !== "anonymous"
      ? extractAutoSourceMaterialInputs({
          userMessage: context.userMessage,
          recentHistory: context.recentHistory,
          extractedFacts,
        })
      : [];
      
  const newAutoSourceMaterialInputs =
    autoSourceMaterialInputs.length > 0
      ? filterNewSourceMaterialInputs({
          existing: [
            ...(rawSourceMaterialAssets || []),
            ...((styleCard?.factLedger?.sourceMaterials || []).map((asset) => ({
              type: asset.type,
              title: asset.title,
              claims: asset.claims,
              snippets: asset.snippets,
            })) || []),
          ],
          incoming: autoSourceMaterialInputs,
        })
      : [];

  const { styleCard: finalStyleCard, assets: sourceMaterialAssets, autoSavedReport } = await syncAutoSourceMaterials({
    userId: context.userId,
    effectiveXHandle: context.effectiveXHandle,
    styleCard,
    newAutoInputs: newAutoSourceMaterialInputs,
    existingAssets: rawSourceMaterialAssets,
    services
  });

  context.styleCard = finalStyleCard;
  
  const antiPatternResult = await maybeCaptureAntiPattern(
    {
      userId: context.userId,
      userMessage: context.userMessage,
      activeDraft: context.activeDraft,
      recentHistory: context.recentHistory,
      styleCard: context.styleCard,
      xHandle: context.effectiveXHandle,
    },
    services,
  );

  const prevRules = context.styleCard?.customGuidelines || [];
  const nextRules = finalStyleCard?.customGuidelines || [];
  const rememberedStyleRuleCount = countNewMemoryEntries(prevRules, nextRules);

  const prevFacts = getDurableFactsFromStyleCard(context.styleCard);
  const nextFacts = getDurableFactsFromStyleCard(finalStyleCard);
  const rememberedFactCount = countNewMemoryEntries(prevFacts, nextFacts);
  route.routingTrace.timings = {
    ...(route.routingTrace.timings || {}),
    runtimeContextLoadMs: Date.now() - runtimeContextLoadStartedAt,
  };

  const rawResponse = await executeDraftPipeline({
    context,
    routing: route,
    services,
    extractedFacts,
    extractedRules,
    sourceMaterialAssets,
    autoSavedSourceMaterials: autoSavedReport,
    antiPatternResult,
    rememberedStyleRuleCount,
    rememberedFactCount,
    preloadedRun:
      context.preloadedRun ??
      (context.runId ? await services.getOnboardingRun(context.runId) : null),
  });

  const responseWithAutoSavedSources =
    autoSavedReport
      ? {
          ...rawResponse,
          data: {
            ...(rawResponse.data || {}),
            autoSavedSourceMaterials: autoSavedReport,
          },
        }
      : rawResponse;

  return {
    rawResponse: stripSerializedRoutingTrace(responseWithAutoSavedSources),
    routingTrace: route.routingTrace,
  };
}

export async function manageConversationTurn(
  input: OrchestratorInput,
  overrides?: Partial<ConversationServices>,
): Promise<OrchestratorResponse> {
  const { rawResponse, routingTrace } = await manageConversationTurnRaw(input, overrides);
  const response = finalizeOrchestratorResponse(rawResponse);
  if (input.diagnosticContext?.includeRoutingTrace !== true) {
    return response;
  }

  return {
    ...response,
    data: {
      ...(response.data || {}),
      routingTrace,
    },
  };
}

function stripSerializedRoutingTrace(
  rawResponse: RawOrchestratorResponse,
): RawOrchestratorResponse {
  const resultData =
    rawResponse.data &&
    typeof rawResponse.data === "object" &&
    !Array.isArray(rawResponse.data)
      ? (rawResponse.data as Record<string, unknown>)
      : null;

  if (!resultData || !("routingTrace" in resultData)) {
    return rawResponse;
  }

  const { routingTrace: _routingTrace, ...rest } = resultData;
  if (Object.keys(rest).length === 0) {
    const { data: _data, ...responseWithoutData } = rawResponse;
    return responseWithoutData;
  }

  return {
    ...rawResponse,
    data: rest,
  };
}
