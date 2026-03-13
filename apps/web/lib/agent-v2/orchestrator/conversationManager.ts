
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
  inferDraftPreference,
  inferDraftFormatPreference,
  resolveRequestedThreadFramingStyle,
  withPlanPreferences,
} from "./draftPipelineHelpers";

import {
  buildControllerFallbackDecision,
  controlTurn,
  mapControllerActionToIntent,
  mapIntentToControllerAction,
} from "../agents/controller";
import { generateCoachReply } from "../agents/coach";
import { generatePlan } from "../agents/planner";
import { generateIdeasMenu } from "../agents/ideator";
import { generateDrafts } from "../agents/writer";
import { critiqueDrafts } from "../agents/critic";
import type { WriterOutput } from "../agents/writer";
import type { CriticOutput } from "../agents/critic";
import { generateRevisionDraft } from "../agents/reviser";
import { extractStyleRules } from "../agents/styleExtractor";
import { extractCoreFacts } from "../agents/factExtractor";
import {
  extractAntiPattern,
  looksLikeMechanicalEdit,
  looksLikeNegativeFeedback,
} from "../agents/antiPatternExtractor";
import {
  createConversationMemorySnapshot,
  getConversationMemory,
  createConversationMemory,
  updateConversationMemory,
} from "../memory/memoryStore";
import {
  buildEffectiveContext,
  buildFactSafeReferenceHints,
  retrieveRelevantContext,
} from "../memory/contextRetriever";
import {
  buildRollingSummary,
  shouldRefreshRollingSummary,
} from "../memory/summaryManager";
import { retrieveAnchors } from "../core/retrieval";
import {
  generateStyleProfile,
  saveStyleProfile,
  getDurableFactsFromStyleCard,
  rememberFactsOnStyleCard,
  rememberSemanticCorrectionOnStyleCard,
} from "../core/styleProfile";
import { checkDeterministicNovelty } from "../core/noveltyGate";
import { resolveVoiceTarget, type VoiceTarget } from "../core/voiceTarget";
import {
  getXCharacterLimitForFormat,
  getXCharacterLimitForAccount,
  inferThreadFramingStyleFromPosts,
  inferThreadFramingStyleFromPrompt,
  resolveThreadFramingStyle,
  type DraftGroundingMode,
  type ThreadFramingStyle,
} from "../../onboarding/draftArtifacts";
import { prisma } from "../../db";
import { Prisma } from "../../generated/prisma/client";
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
  normalizeRepairDetail,
} from "./correctionRepair";
import { normalizeDraftRevisionInstruction } from "./draftRevision";
import {
  assessGroundedProductDrift,
  assessConcreteSceneDrift,
  buildGroundedProductRetryConstraint,
  buildUnsupportedClaimRetryConstraint,
  buildConcreteSceneRetryConstraint,
  extractConcreteSceneAnchors,
  isConcreteAnecdoteDraftRequest,
  NO_FABRICATION_CONSTRAINT,
  NO_FABRICATION_MUST_AVOID,
} from "./draftGrounding";
import { planTurn } from "./turnPlanner";
import { respondConversationally, isConstraintDeclaration } from "./chatResponder";
import { buildDraftReply } from "./draftReply";
import {
  buildFeedbackMemoryNotice,
  countNewMemoryEntries,
  prependFeedbackMemoryNotice,
} from "./feedbackMemoryNotice";
import { buildIdeationReply } from "./ideationReply";
import { buildIdeationQuickReplies } from "./ideationQuickReplies";
import { interpretPlannerFeedback } from "./plannerFeedback";
import type { ConversationalDiagnosticContext } from "./conversationalDiagnostics.ts";
import {
  isMissingDraftCandidateTableError,
  isMissingSourceMaterialAssetTableError,
} from "./prismaGuards";
import {
  buildPlanFailureResponse,
  hasStrongDraftCommand,
  inferExplicitDraftFormatPreference,
  isBareDraftRequest,
  isBareIdeationRequest,
  isMultiDraftRequest,
  resolveDraftOutputShape,
  shouldRouteCareerClarification,
  shouldUseRevisionDraftPath,
} from "./conversationManagerLogic";
import {
  inferBroadTopicDraftRequest,
  shouldFastStartGroundedDraft,
} from "./draftFastStart.ts";
import {
  resolveConversationRouterState,
  type ConversationRouterState,
} from "./conversationRouterMachine";
import {
  evaluateDraftContextSlots,
} from "./draftContextSlots";
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
  type CreatorProfileHints,
  type GroundingPacket,
  type GroundingPacketSourceMaterial,
} from "./groundingPacket";
import { buildCreatorProfileHintsFromOnboarding } from "./creatorProfileHints";
import {
  applyCreatorProfileHintsToPlan,
  mapPreferredOutputShapeToFormatPreference,
} from "./creatorHintPolicy";
import { checkDraftClaimsAgainstGrounding } from "./claimChecker";
import { applySourceMaterialBiasToPlan } from "./sourceMaterialPlanPolicy";
import { buildSourceMaterialDraftConstraints } from "./sourceMaterialDraftPolicy";
import {
  buildSourceMaterialIdentityKey,
  extractAutoSourceMaterialInputs,
  filterNewSourceMaterialInputs,
  mergeSourceMaterialsIntoGroundingPacket,
  selectRelevantSourceMaterials,
  serializeSourceMaterialAsset,
  type SourceMaterialAssetInput,
  type SourceMaterialAssetRecord,
} from "./sourceMaterials";
import {
  buildDraftBundleBriefs,
  type DraftBundleResult,
} from "./draftBundles";
import { finalizeResponseEnvelope } from "./responseEnvelope";
import type {
  CreatorChatQuickReply,
  DraftFormatPreference,
  DraftPreference,
  ResponseShapePlan,
  SurfaceMode,
  StrategyPlan,
  V2ChatIntent,
  V2ChatOutputShape,
  V2ConversationMemory,
} from "../contracts/chat";

export interface OrchestratorInput {
  userId: string;
  xHandle?: string | null;
  runId?: string;
  threadId?: string;
  userMessage: string;
  recentHistory: string;
  explicitIntent?: V2ChatIntent | null;
  activeDraft?: string;
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

export interface ConversationServices {
  controlTurn: typeof controlTurn;
  generateCoachReply: typeof generateCoachReply;
  generatePlan: typeof generatePlan;
  generateIdeasMenu: typeof generateIdeasMenu;
  generateDrafts: typeof generateDrafts;
  critiqueDrafts: typeof critiqueDrafts;
  generateRevisionDraft: typeof generateRevisionDraft;
  extractStyleRules: typeof extractStyleRules;
  extractCoreFacts: typeof extractCoreFacts;
  extractAntiPattern: typeof extractAntiPattern;
  getConversationMemory: typeof getConversationMemory;
  createConversationMemory: typeof createConversationMemory;
  updateConversationMemory: typeof updateConversationMemory;
  retrieveAnchors: typeof retrieveAnchors;
  generateStyleProfile: typeof generateStyleProfile;
  saveStyleProfile: typeof saveStyleProfile;
  checkDeterministicNovelty: typeof checkDeterministicNovelty;
  getOnboardingRun: (runId?: string) => Promise<Record<string, unknown> | null>;
  getHistoricalPosts: (args: {
    userId: string;
    xHandle?: string | null;
  }) => Promise<string[]>;
  getSourceMaterialAssets: (args: {
    userId: string;
    xHandle?: string | null;
  }) => Promise<SourceMaterialAssetRecord[]>;
  markSourceMaterialAssetsUsed: (assetIds: string[]) => Promise<void>;
  saveSourceMaterialAssets: (args: {
    userId: string;
    xHandle?: string | null;
    assets: SourceMaterialAssetInput[];
  }) => Promise<SourceMaterialAssetRecord[]>;
  shouldIncludeRoutingTrace: () => boolean;
}

function normalizeHandleForContext(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/^@+/, "").toLowerCase();
  return normalized || null;
}

export function buildDraftGroundingSummary(args: {
  groundingSources: GroundingPacketSourceMaterial[];
  hasCurrentChatGrounding: boolean;
  usesSafeFramework: boolean;
}): {
  groundingMode: DraftGroundingMode | null;
  groundingExplanation: string | null;
} {
  if (args.groundingSources.length > 0 && args.hasCurrentChatGrounding) {
    return {
      groundingMode: "mixed",
      groundingExplanation:
        "Built from your saved stories and proof, plus the facts you shared in this chat.",
    };
  }

  if (args.groundingSources.length > 0) {
    return {
      groundingMode: "saved_sources",
      groundingExplanation:
        "Built from saved stories and proof you've already taught Xpo to reuse.",
    };
  }

  if (args.usesSafeFramework) {
    return {
      groundingMode: "safe_framework",
      groundingExplanation:
        "Kept in safe framework mode because there wasn't enough grounded personal proof to make a first-person claim yet.",
    };
  }

  if (args.hasCurrentChatGrounding) {
    return {
      groundingMode: "current_chat",
      groundingExplanation: "Built from details you shared in this chat.",
    };
  }

  return {
    groundingMode: null,
    groundingExplanation: null,
  };
}

export function createDefaultConversationServices(): ConversationServices {
  return {
    controlTurn,
    generateCoachReply,
    generatePlan,
    generateIdeasMenu,
    generateDrafts,
    critiqueDrafts,
    generateRevisionDraft,
    extractStyleRules,
    extractCoreFacts,
    extractAntiPattern,
    getConversationMemory,
    createConversationMemory,
    updateConversationMemory,
    retrieveAnchors,
    generateStyleProfile,
    saveStyleProfile,
    checkDeterministicNovelty,
    async getOnboardingRun(runId?: string) {
      if (!runId) {
        return null;
      }

      const record = await prisma.onboardingRun.findUnique({ where: { id: runId } });
      return (record as unknown as Record<string, unknown> | null) || null;
    },
    async getHistoricalPosts(args: { userId: string; xHandle?: string | null }) {
      const normalizedHandle = normalizeHandleForContext(args.xHandle);
      const [posts, queuedCandidates] = await Promise.all([
        prisma.post.findMany({
          where: {
            userId: args.userId,
            ...(normalizedHandle ? { xHandle: normalizedHandle } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: { text: true },
        }),
        prisma.draftCandidate
          .findMany({
            where: {
              userId: args.userId,
              ...(normalizedHandle ? { xHandle: normalizedHandle } : {}),
              status: {
                in: ["pending", "approved", "edited", "posted", "observed"],
              },
            },
            orderBy: { createdAt: "desc" },
            take: 40,
            select: { artifact: true },
          })
          .catch((error) => {
            if (isMissingDraftCandidateTableError(error)) {
              return [];
            }

            throw error;
          }),
      ]);

      const queuedDrafts = queuedCandidates
        .map((candidate) => {
          const artifact =
            candidate.artifact && typeof candidate.artifact === "object" && !Array.isArray(candidate.artifact)
              ? (candidate.artifact as Record<string, unknown>)
              : null;
          return typeof artifact?.content === "string" ? artifact.content : null;
        })
        .filter((value): value is string => Boolean(value));

      return [...posts.map((post) => post.text), ...queuedDrafts];
    },
    async getSourceMaterialAssets(args: { userId: string; xHandle?: string | null }) {
      const normalizedHandle = normalizeHandleForContext(args.xHandle);

      try {
        const assets = await prisma.sourceMaterialAsset.findMany({
          where: {
            userId: args.userId,
            ...(normalizedHandle ? { xHandle: normalizedHandle } : {}),
          },
          orderBy: [
            { verified: "desc" },
            { lastUsedAt: "desc" },
            { updatedAt: "desc" },
          ],
          take: 40,
        });

        return assets.map(serializeSourceMaterialAsset);
      } catch (error) {
        if (isMissingSourceMaterialAssetTableError(error)) {
          return [];
        }

        throw error;
      }
    },
    async markSourceMaterialAssetsUsed(assetIds: string[]) {
      if (assetIds.length === 0) {
        return;
      }

      try {
        await prisma.sourceMaterialAsset.updateMany({
          where: { id: { in: assetIds } },
          data: { lastUsedAt: new Date() },
        });
      } catch (error) {
        if (isMissingSourceMaterialAssetTableError(error)) {
          return;
        }

        throw error;
      }
    },
    async saveSourceMaterialAssets(args: {
      userId: string;
      xHandle?: string | null;
      assets: SourceMaterialAssetInput[];
    }) {
      const normalizedHandle = normalizeHandleForContext(args.xHandle);
      if (args.assets.length === 0) {
        return [];
      }

      try {
        const existing = await prisma.sourceMaterialAsset.findMany({
          where: {
            userId: args.userId,
            ...(normalizedHandle ? { xHandle: normalizedHandle } : {}),
          },
        });
        const existingKeys = new Set(
          existing.map((asset) =>
            buildSourceMaterialIdentityKey({
              type: asset.type,
              title: asset.title,
              claims: Array.isArray(asset.claims) ? (asset.claims as string[]) : [],
              snippets: Array.isArray(asset.snippets) ? (asset.snippets as string[]) : [],
            }),
          ),
        );
        const created: SourceMaterialAssetRecord[] = [];

        for (const asset of args.assets) {
          const key = buildSourceMaterialIdentityKey(asset);
          if (existingKeys.has(key)) {
            continue;
          }

          existingKeys.add(key);
          const record = await prisma.sourceMaterialAsset.create({
            data: {
              userId: args.userId,
              ...(normalizedHandle ? { xHandle: normalizedHandle } : {}),
              type: asset.type,
              title: asset.title,
              tags: asset.tags as unknown as Prisma.JsonArray,
              verified: asset.verified,
              claims: asset.claims as unknown as Prisma.JsonArray,
              snippets: asset.snippets as unknown as Prisma.JsonArray,
              doNotClaim: asset.doNotClaim as unknown as Prisma.JsonArray,
            },
          });
          created.push(serializeSourceMaterialAsset(record));
        }

        return created;
      } catch (error) {
        if (isMissingSourceMaterialAssetTableError(error)) {
          return [];
        }

        throw error;
      }
    },
    shouldIncludeRoutingTrace() {
      return false;
    },
  };
}

export { buildPlanPitch } from "../core/planPitch";

function finalizeOrchestratorResponse(
  rawResponse: RawOrchestratorResponse,
): OrchestratorResponse {
  return finalizeResponseEnvelope(rawResponse) as OrchestratorResponse;
}

function applyMemoryPatch(
  current: V2ConversationMemory,
  patch: Partial<V2ConversationMemory>,
): V2ConversationMemory {
  return {
    ...current,
    ...patch,
    lastIdeationAngles: patch.lastIdeationAngles ?? current.lastIdeationAngles,
    activeConstraints: patch.activeConstraints ?? current.activeConstraints,
    pendingPlan:
      patch.pendingPlan === undefined ? current.pendingPlan : patch.pendingPlan,
    clarificationState:
      patch.clarificationState === undefined
        ? current.clarificationState
        : patch.clarificationState,
    rollingSummary:
      patch.rollingSummary === undefined ? current.rollingSummary : patch.rollingSummary,
    activeDraftRef:
      patch.activeDraftRef === undefined ? current.activeDraftRef : patch.activeDraftRef,
    latestRefinementInstruction:
      patch.latestRefinementInstruction === undefined
        ? current.latestRefinementInstruction
        : patch.latestRefinementInstruction,
    unresolvedQuestion:
      patch.unresolvedQuestion === undefined ? current.unresolvedQuestion : patch.unresolvedQuestion,
    clarificationQuestionsAsked:
      patch.clarificationQuestionsAsked === undefined
        ? current.clarificationQuestionsAsked
        : patch.clarificationQuestionsAsked,
    preferredSurfaceMode:
      patch.preferredSurfaceMode === undefined
        ? current.preferredSurfaceMode
        : patch.preferredSurfaceMode,
    formatPreference:
      patch.formatPreference === undefined
        ? current.formatPreference
        : patch.formatPreference,
  };
}

async function maybeCaptureAntiPattern(args: {
  userId: string;
  userMessage: string;
  activeDraft?: string;
  recentHistory: string;
  styleCard: Awaited<ReturnType<typeof generateStyleProfile>>;
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
