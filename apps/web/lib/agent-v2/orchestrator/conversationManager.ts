
import { buildTurnContext } from "./turnContextBuilder";
import { resolveRoutingPolicy } from "./routingPolicy";
import { executeDraftPipeline } from "./draftPipeline";
import { syncStyleProfileMemory, syncAutoSourceMaterials } from "./memoryPolicy";
import {
  createDefaultConversationServices,
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
  inferDraftPreference,
  inferDraftFormatPreference,
  resolveRequestedThreadFramingStyle,
  withPlanPreferences,
  type ConversationServices,
} from "./draftPipelineHelpers";
import {
  getDurableFactsFromStyleCard,
  type VoiceStyleCard,
} from "../core/styleProfile";
import { type VoiceTarget } from "../core/voiceTarget";
import {
  type DraftGroundingMode,
  type ThreadFramingStyle,
} from "../../onboarding/draftArtifacts";
import {
  hasConcreteCorrectionDetail,
  looksLikeSemanticCorrection,
  normalizeRepairDetail,
} from "./correctionRepair";
import {
  extractAutoSourceMaterialInputs,
  filterNewSourceMaterialInputs,
} from "./sourceMaterials";
import {
  looksLikeMechanicalEdit,
  looksLikeNegativeFeedback,
} from "../agents/antiPatternExtractor";
import {
  countNewMemoryEntries,
} from "./feedbackMemoryNotice";
import type { ConversationalDiagnosticContext } from "./conversationalDiagnostics.ts";
import {
  type ConversationRouterState,
} from "./conversationRouterMachine";
import {
  type CreatorProfileHints,
  type GroundingPacketSourceMaterial,
} from "./groundingPacket";
import {
  type DraftBundleResult,
} from "./draftBundles";
import { finalizeResponseEnvelope } from "./responseEnvelope";
import type {
  CreatorChatQuickReply,
  DraftFormatPreference,
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
  RuntimeResolutionSource,
  RuntimeValidationResult,
  RuntimeWorkerExecution,
  RuntimeWorkerExecutionSummary,
} from "../runtime/runtimeContracts.ts";
import { summarizeRuntimeWorkerExecutions } from "../runtime/runtimeTrace.ts";

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
  turnSource?: ChatTurnSource;
  artifactContext?: ChatArtifactContext | null;
  planSeedSource?: ChatPlanSeedSource | null;
  resolvedWorkflow?: ChatResolvedWorkflow | null;
  replyHandlingBypassedReason?: string | null;
  formatPreference?: DraftFormatPreference | null;
  threadFramingStyle?: ThreadFramingStyle | null;
  preferenceConstraints?: string[];
  creatorProfileHints?: CreatorProfileHints | null;
  diagnosticContext?: ConversationalDiagnosticContext | null;
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
          | "product_drift";
        issues: string[];
      }
    | null;
  planFailure:
    | {
        reason: string;
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

export type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

export {
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
  inferDraftPreference,
  inferDraftFormatPreference,
  resolveRequestedThreadFramingStyle,
  withPlanPreferences,
};
export type { ConversationServices } from "./draftPipelineHelpers";

export { buildPlanPitch } from "../core/planPitch";

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

export async function manageConversationTurn(
  input: OrchestratorInput,
  overrides?: Partial<ConversationServices>,
): Promise<OrchestratorResponse> {
  const services = { ...createDefaultConversationServices(), ...overrides } as ConversationServices;
  const context = await buildTurnContext(input, services);
  const route = await resolveRoutingPolicy(context, services);

  if (route.isFastReply && route.fastReplyResponse) {
    return route.fastReplyResponse;
  }

  // Heavy Orchestration
  const [extractedRules, extractedFacts, rawSourceMaterialAssets] = await Promise.all([
    context.userId !== "anonymous"
      ? services.extractStyleRules(context.userMessage, context.recentHistory)
      : Promise.resolve(null),
    context.userId !== "anonymous"
      ? services.extractCoreFacts(context.userMessage, context.recentHistory)
      : Promise.resolve(null),
    context.userId !== "anonymous"
      ? services.getSourceMaterialAssets({
          userId: context.userId,
          xHandle: context.effectiveXHandle,
        })
      : Promise.resolve([]),
  ]);

  route.routingTrace.workerExecutions.push(
    {
      worker: "extract_style_rules",
      capability: "shared",
      phase: "context_load",
      mode: "parallel",
      status: context.userId !== "anonymous" ? "completed" : "skipped",
      groupId: "initial_context_load",
      details:
        context.userId !== "anonymous"
          ? { hasRules: Array.isArray(extractedRules) && extractedRules.length > 0 }
          : { reason: "anonymous_user" },
    },
    {
      worker: "extract_core_facts",
      capability: "shared",
      phase: "context_load",
      mode: "parallel",
      status: context.userId !== "anonymous" ? "completed" : "skipped",
      groupId: "initial_context_load",
      details:
        context.userId !== "anonymous"
          ? { hasFacts: Array.isArray(extractedFacts) && extractedFacts.length > 0 }
          : { reason: "anonymous_user" },
    },
    {
      worker: "load_source_material_assets",
      capability: "shared",
      phase: "context_load",
      mode: "parallel",
      status: context.userId !== "anonymous" ? "completed" : "skipped",
      groupId: "initial_context_load",
      details:
        context.userId !== "anonymous"
          ? {
              assetCount: Array.isArray(rawSourceMaterialAssets)
                ? rawSourceMaterialAssets.length
                : 0,
            }
          : { reason: "anonymous_user" },
    },
  );
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
    preloadedRun: context.runId ? await services.getOnboardingRun(context.runId) : null,
  });

  const shouldIncludeRoutingTrace = context.diagnosticContext?.includeRoutingTrace === true;
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

  const responseWithRoutingTrace =
    shouldIncludeRoutingTrace
      ? {
          ...responseWithAutoSavedSources,
          data: {
            ...(responseWithAutoSavedSources.data || {}),
            routingTrace: route.routingTrace,
          },
        }
      : responseWithAutoSavedSources;

  return finalizeOrchestratorResponse(responseWithRoutingTrace);
}
