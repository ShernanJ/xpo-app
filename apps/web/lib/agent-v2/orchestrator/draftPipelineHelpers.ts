import {
  buildControllerFallbackDecision,
  controlTurn,
  mapControllerActionToIntent,
  mapIntentToControllerAction,
} from "../agents/controller";
import {
  generateCoachReply,
  generatePostAnalysis,
  generateReplyGuidance,
} from "../agents/coach";
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
import { loadHistoricalTextWorkers } from "./historicalTextWorkers.ts";
import {
  buildSemanticCorrectionAcknowledgment,
  buildSemanticRepairDirective,
  buildSemanticRepairState,
  extractTopicGrounding,
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
  buildComparisonRelationshipQuestion,
  buildProblemStakeQuestion,
  buildProductCapabilityQuestion,
} from "./assistantReplyStyle";
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
  getTurnRelationContext,
  isContextDependentFollowUp,
} from "./turnRelation.ts";
import {
  evaluateDraftContextSlots,
  hasFunctionalDetail,
  hasProblemDetail,
  hasRelationshipDetail,
  inferComparisonReference,
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
import type {
  ChatArtifactContext,
  ChatPlanSeedSource,
  ChatResolvedWorkflow,
  ChatTurnSource,
} from "../contracts/turnContract";
import type {
  CapabilityName,
  AgentRuntimeWorkflow,
  RuntimeResolutionSource,
  RuntimeValidationResult,
  RuntimeWorkerExecution,
  RuntimeWorkerExecutionSummary,
} from "../runtime/runtimeContracts.ts";

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

export interface RoutingTracePatch {
  clarification?: RoutingTrace["clarification"];
  draftGuard?: RoutingTrace["draftGuard"];
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

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

export interface ConversationServices {
  controlTurn: typeof controlTurn;
  generateCoachReply: typeof generateCoachReply;
  generateReplyGuidance: typeof generateReplyGuidance;
  generatePostAnalysis: typeof generatePostAnalysis;
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
  loadHistoricalTexts: (args: {
    userId: string;
    xHandle?: string | null;
    capability: CapabilityName;
  }) => Promise<{
    texts: string[];
    workerExecutions: RuntimeWorkerExecution[];
  }>;
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

export function normalizeHandleForContext(value: string | null | undefined): string | null {
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
  const loadHistoricalTexts = async (args: {
    userId: string;
    xHandle?: string | null;
    capability: CapabilityName;
  }) => {
    const normalizedHandle = normalizeHandleForContext(args.xHandle);

    return loadHistoricalTextWorkers({
      userId: args.userId,
      xHandle: normalizedHandle,
      capability: args.capability,
      loadPosts: ({ userId, xHandle }) =>
        prisma.post.findMany({
          where: {
            userId,
            ...(xHandle ? { xHandle } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: { text: true },
        }),
      loadDraftCandidates: ({ userId, xHandle }) =>
        prisma.draftCandidate
          .findMany({
            where: {
              userId,
              ...(xHandle ? { xHandle } : {}),
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
    });
  };

  return {
    controlTurn,
    generateCoachReply,
    generateReplyGuidance,
    generatePostAnalysis,
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
      const result = await loadHistoricalTexts({
        ...args,
        capability: "shared",
      });

      return result.texts;
    },
    loadHistoricalTexts,
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

export function isLazyDraftRequest(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return [
    "just write anything",
    "write anything",
    "idk just write it",
    "just write it",
    "whatever works",
    "anything is fine",
  ].some((candidate) => normalized.includes(candidate));
}

export function looksGenericTopicSummary(value: string | null | undefined): boolean {
  const normalized = value?.trim();
  if (!normalized) {
    return false;
  }

  return isBareIdeationRequest(normalized) || isBareDraftRequest(normalized);
}

export function inferMissingSpecificQuestion(message: string): string | null {
  const normalized = message.trim().toLowerCase();
  const slots = evaluateDraftContextSlots({
    userMessage: message,
    topicSummary: null,
    contextAnchors: [],
  });

  if (slots.domainHint === "career" || !slots.isProductLike) {
    return null;
  }

  const comparisonReference = inferComparisonReference(message);
  const buildSubjectMatch = message.match(
    /\b(?:building|making|creating|shipping|launching|working on|rebuilding)\s+([a-z0-9][a-z0-9\s'-]{1,30}?)(?:\s+for\b|\s+on\b|\s+with\b|[.?!,]|$)/i,
  );
  const buildSubject = buildSubjectMatch?.[1]?.trim().replace(/[.?!,]+$/, "") || "";

  const comparisonOnly =
    Boolean(comparisonReference) ||
    /\bbut for (x|twitter|linkedin)\b/.test(normalized) ||
    (normalized.includes("like stanley") &&
      ["app", "tool", "product", "extension", "plugin"].some((cue) =>
        normalized.includes(cue),
      ));

  const isBuildingSomething =
    ["building", "making", "working on", "creating", "shipping"].some((cue) =>
      normalized.includes(cue),
    ) &&
    ["extension", "plugin", "tool", "app", "product"].some((cue) =>
      normalized.includes(cue),
    ) ||
    (Boolean(buildSubject) &&
      ["building", "making", "working on", "creating", "shipping", "launching", "rebuilding"].some((cue) =>
        normalized.includes(cue),
      )) ||
    /^(?:can you\s+)?(?:write|draft|make|create|generate|do)\b/.test(normalized) &&
      ["extension", "plugin", "tool", "app", "product"].some((cue) =>
        normalized.includes(cue),
      ) ||
    comparisonOnly;

  if (!isBuildingSomething) {
    return null;
  }

  if (hasFunctionalDetail(normalized)) {
    if (comparisonOnly && !hasRelationshipDetail(normalized)) {
      const reference = comparisonReference || "the original tool";
      return buildComparisonRelationshipQuestion(reference);
    }

    if (!hasProblemDetail(normalized)) {
      return buildProblemStakeQuestion();
    }

    return null;
  }

  const targetMatch = message.match(/\bfor\s+([a-z0-9][a-z0-9\s'-]{1,30})/i);
  const rawTarget = targetMatch?.[1]?.trim().replace(/[.,!?]+$/, "") || "";

  if (comparisonOnly) {
    return buildProductCapabilityQuestion({
      kind: "comparison",
      target: rawTarget || null,
    });
  }

  if (normalized.includes("extension") || normalized.includes("plugin")) {
    return buildProductCapabilityQuestion({
      kind: "extension",
      target: rawTarget || null,
    });
  }

  return buildProductCapabilityQuestion({
    kind: "generic",
    target: rawTarget || null,
  });
}

export function buildNaturalDraftClarificationQuestion(args: {
  multiple: boolean;
  topicSummary?: string | null;
}): string {
  const topic = args.topicSummary?.trim();
  if (topic) {
    return args.multiple
      ? `what real story, proof point, or lesson inside ${topic} should these posts pull from?`
      : `what real story, proof point, or lesson inside ${topic} should this post pull from?`;
  }

  return args.multiple
    ? "what real story, proof point, or lesson should these posts pull from?"
    : "what real story, proof point, or lesson should this post pull from?";
}

export function buildAmbiguousReferenceQuestion(reference: string): string {
  const normalized = reference.trim().toLowerCase();

  if (normalized === "ampm") {
    return "when you say ampm, do you mean the downtown toronto club, the convenience store brand, or am/pm as time of day?";
  }

  return `when you say ${reference}, what exactly are you referring to in this post?`;
}

export function extractPriorUserTurn(recentHistory: string): string | null {
  const userTurns = recentHistory
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^user:/i.test(line))
    .map((line) => line.replace(/^user:\s*/i, "").trim())
    .filter(Boolean);

  return userTurns.length > 0 ? userTurns[userTurns.length - 1] || null : null;
}

const IDEA_TOPIC_STOPWORDS = new Set([
  "what",
  "how",
  "why",
  "where",
  "when",
  "which",
  "the",
  "and",
  "for",
  "with",
  "your",
  "you",
  "this",
  "that",
  "from",
  "into",
  "post",
  "posts",
  "tweet",
  "tweets",
  "thread",
  "threads",
  "idea",
  "ideas",
  "part",
  "thing",
  "most",
  "biggest",
  "shift",
  "change",
  "tone",
]);

export function extractIdeaTitlesFromIdeas(ideas: unknown[] | undefined): string[] {
  if (!Array.isArray(ideas) || ideas.length === 0) {
    return [];
  }

  const titles: string[] = [];
  for (const entry of ideas) {
    if (typeof entry === "string") {
      const normalized = entry.trim().replace(/\s+/g, " ");
      if (normalized) {
        titles.push(normalized);
      }
      continue;
    }

    if (!entry || typeof entry !== "object") {
      continue;
    }

    const maybeTitle = (entry as Record<string, unknown>).title;
    if (typeof maybeTitle === "string" && maybeTitle.trim()) {
      titles.push(maybeTitle.trim().replace(/\s+/g, " "));
    }
  }

  return Array.from(new Set(titles)).slice(0, 6);
}

export function inferTopicFromIdeaTitles(ideaTitles: string[]): string | null {
  if (ideaTitles.length === 0) {
    return null;
  }

  const joined = ideaTitles.join(" ").toLowerCase();
  const conversionMatch = joined.match(
    /\b(linkedin|substack|youtube|newsletter)\b[\s\w]{0,24}\b(?:to|into)\b[\s\w]{0,24}\b(x|twitter)\b/i,
  );
  if (conversionMatch?.[1] && conversionMatch?.[2]) {
    return `${conversionMatch[1]} to ${conversionMatch[2]}`;
  }

  const counts = new Map<string, number>();
  for (const title of ideaTitles) {
    const tokens = title
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(
        (token) =>
          token.length >= 4 && !IDEA_TOPIC_STOPWORDS.has(token),
      );
    for (const token of tokens) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }

  const topTokens = Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([token]) => token);

  if (topTokens.length === 0) {
    return null;
  }

  return topTokens.join(" ");
}

export function inferAbstractTopicSeed(
  message: string,
  recentHistory: string,
  memory: Pick<V2ConversationMemory, "conversationState" | "concreteAnswerCount" | "topicSummary">,
): string | null {
  if (memory.conversationState !== "needs_more_context" || memory.concreteAnswerCount >= 2) {
    return null;
  }

  const trimmed = message.trim();
  const normalized = trimmed.toLowerCase();
  if (!trimmed || normalized.startsWith(">")) {
    return null;
  }

  if (isBareDraftRequest(trimmed)) {
    return null;
  }

  if (hasStrongDraftCommand(trimmed)) {
    return null;
  }

  if (looksLikeUnsafeClarificationSeed(trimmed)) {
    return null;
  }

  if (
    getTurnRelationContext(recentHistory).lastAssistantTurn &&
    isContextDependentFollowUp(trimmed)
  ) {
    return null;
  }

  if (
    [
      "that was a question",
      "no that was a question",
      "where did you get that",
      "where did that come from",
      "falsify",
      "fake",
      "made up",
      "invented",
      "hallucinated",
      "lets do it",
      "let's do it",
      "do it",
      "go ahead",
      "sounds good",
    ].some((cue) => normalized.includes(cue))
  ) {
    return null;
  }

  const containsSpecificCue =
    hasFunctionalDetail(normalized) ||
    hasProblemDetail(normalized) ||
    [
      "my take",
      "my opinion",
      "i think",
      "i learned",
      "i realized",
      "the point is",
      "the actual point",
      "because",
      "story",
      "mistake",
      "lesson",
      "hot take",
      "contrarian",
      "vs ",
      "versus",
      "why ",
      "how ",
    ].some((cue) => normalized.includes(cue));

  if (containsSpecificCue) {
    return null;
  }

  const isShortTopic =
    trimmed.length <= 48 &&
    trimmed.split(/\s+/).length <= 5 &&
    /^[a-z0-9\s/&'’-]+$/i.test(trimmed);

  if (!isShortTopic) {
    return null;
  }

  if (["what", "this", "that", "it", "something", "anything"].includes(normalized)) {
    return null;
  }

  return trimmed.replace(/[.?!,]+$/, "") || memory.topicSummary || "this";
}

export function looksLikeUnsafeClarificationSeed(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (looksLikeNegativeFeedback(message)) {
    return true;
  }

  return [
    /^(?:this|that|it)\s+is\s+(?:way\s+too\s+|too\s+)?(?:formal|polished|generic|long|robotic|corporate|salesy|stiff)\b/,
    /^(?:what(?:'s| is)|which)\s+.*\b(?:best|top)\s+post\b/,
  ].some((pattern) => pattern.test(normalized));
}

export function inferLooseClarificationSeed(
  message: string,
  fallback: string | null,
): string | null {
  const trimmed = message.trim().replace(/[.?!,]+$/, "");
  if (!trimmed) {
    return fallback;
  }

  if (looksLikeUnsafeClarificationSeed(trimmed)) {
    return fallback;
  }

  if (
    trimmed.length > 48 ||
    trimmed.split(/\s+/).length > 5 ||
    !/^[a-z0-9\s/&'’-]+$/i.test(trimmed)
  ) {
    return fallback;
  }

  return trimmed;
}

export function hasConstraintDefinedEntity(
  activeConstraints: string[],
  entityLabel: string,
): boolean {
  const normalizedEntity = entityLabel.trim().toLowerCase();
  if (!normalizedEntity) {
    return false;
  }

  return activeConstraints.some((constraint) => {
    const normalizedConstraint = constraint.trim().toLowerCase();
    if (!normalizedConstraint.startsWith("correction lock:")) {
      return false;
    }

    return (
      normalizedConstraint.includes(`${normalizedEntity} is `) ||
      normalizedConstraint.includes(`${normalizedEntity} isn't `) ||
      normalizedConstraint.includes(`${normalizedEntity} is not `) ||
      normalizedConstraint.includes(`${normalizedEntity} does `) ||
      normalizedConstraint.includes(`${normalizedEntity} doesn't `) ||
      normalizedConstraint.includes(`${normalizedEntity} doesnt `)
    );
  });
}

export function looksLikeOpaqueEntityTopic(args: {
  topic: string;
  userMessage: string;
  activeConstraints: string[];
}): boolean {
  const topic = args.topic.trim().replace(/[.?!,]+$/, "");
  if (!topic) {
    return false;
  }

  if (hasConstraintDefinedEntity(args.activeConstraints, topic)) {
    return false;
  }

  const normalizedTopic = topic.toLowerCase();
  if (["what", "this", "that", "it", "something", "anything"].includes(normalizedTopic)) {
    return false;
  }

  const topicWordCount = topic.split(/\s+/).filter(Boolean).length;
  const isShortOpaqueLabel =
    topic.length <= 32 &&
    topicWordCount <= 3 &&
    /^[a-z0-9][a-z0-9\s/&'’-]*$/i.test(topic);

  if (!isShortOpaqueLabel) {
    return false;
  }

  const normalizedMessage = args.userMessage.trim().toLowerCase();
  const hasDefinitionCue =
    normalizedMessage.includes(`${normalizedTopic} is`) ||
    normalizedMessage.includes(`${normalizedTopic} does`) ||
    normalizedMessage.includes(`${normalizedTopic} helps`) ||
    normalizedMessage.includes(`${normalizedTopic} lets`) ||
    normalizedMessage.includes(`${normalizedTopic} turns`) ||
    normalizedMessage.includes(`${normalizedTopic} rewrites`) ||
    hasFunctionalDetail(normalizedMessage) ||
    hasProblemDetail(normalizedMessage) ||
    hasRelationshipDetail(normalizedMessage);

  return !hasDefinitionCue;
}

export function buildGroundedTopicDraftInput(args: {
  userMessage: string;
  activeConstraints: string[];
}): {
  topic: string | null;
  grounding: string | null;
  nextConstraints: string[];
  planMessage: string | null;
} {
  const topic = inferBroadTopicDraftRequest(args.userMessage);
  if (!topic) {
    return {
      topic: null,
      grounding: null,
      nextConstraints: args.activeConstraints,
      planMessage: null,
    };
  }

  const grounding = extractTopicGrounding(args.activeConstraints, topic);
  if (!grounding) {
    return {
      topic,
      grounding: null,
      nextConstraints: args.activeConstraints,
      planMessage: null,
    };
  }

  const topicGroundingConstraint = `Topic grounding: ${grounding}`;
  return {
    topic,
    grounding,
    nextConstraints: Array.from(new Set([...args.activeConstraints, topicGroundingConstraint])),
    planMessage: `write a post about ${topic}. factual grounding: ${grounding}`,
  };
}

export function inferDraftPreference(
  message: string,
  fallback: DraftPreference = "balanced",
): DraftPreference {
  const normalized = message.trim().toLowerCase();

  const voiceFirst = [
    "in my voice",
    "my voice",
    "sound like me",
    "sounds like me",
    "keep it natural",
    "natural, not growth-hacky",
    "not growth-hacky",
    "not growth hacky",
    "not too growthy",
    "less growthy",
    "less optimized",
    "more natural",
    "more casual",
    "more like me",
  ].some((cue) => normalized.includes(cue));

  if (voiceFirst) {
    return "voice_first";
  }

  const growthFirst = [
    "optimized for growth",
    "optimize it for growth",
    "optimize for growth",
    "for growth and reach",
    "for growth",
    "for reach",
    "for engagement",
    "for impressions",
    "more viral",
    "make it punchier",
    "stronger hook",
    "growth-focused",
  ].some((cue) => normalized.includes(cue));

  if (growthFirst) {
    return "growth_first";
  }

  return fallback;
}

export function inferDraftFormatPreference(
  message: string,
  fallback: DraftFormatPreference = "shortform",
  explicitFormatPreference?: DraftFormatPreference | null,
): DraftFormatPreference {
  if (explicitFormatPreference) {
    return explicitFormatPreference;
  }

  return inferExplicitDraftFormatPreference(message) || fallback;
}

export function resolveRequestedThreadFramingStyle(args: {
  userMessage: string;
  activeDraft?: string;
  formatPreference: DraftFormatPreference;
  explicitThreadFramingStyle?: ThreadFramingStyle | null;
}): ThreadFramingStyle | null {
  if (args.formatPreference !== "thread") {
    return null;
  }

  const explicitStyle = resolveThreadFramingStyle(args.explicitThreadFramingStyle);
  if (explicitStyle) {
    return explicitStyle;
  }

  const requestedStyle = inferThreadFramingStyleFromPrompt(args.userMessage);
  if (requestedStyle) {
    return requestedStyle;
  }

  if (args.activeDraft) {
    return inferThreadFramingStyleFromPosts(
      args.activeDraft
        .split(/\n\s*---\s*\n/g)
        .map((post) => post.trim())
        .filter(Boolean),
    );
  }

  return "soft_signal";
}

export function withPlanPreferences(
  plan: StrategyPlan,
  draftPreference: DraftPreference,
  formatPreference: DraftFormatPreference,
): StrategyPlan {
  const nextPlan = { ...plan, formatPreference };

  if (draftPreference === "balanced") {
    delete nextPlan.deliveryPreference;
  } else {
    nextPlan.deliveryPreference = draftPreference;
  }

  return nextPlan;
}
export function deterministicIndex(seed: string, modulo: number): number {
  if (modulo <= 1) {
    return 0;
  }

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return hash % modulo;
}

export function pickDeterministic<T>(options: T[], seed: string): T {
  return options[deterministicIndex(seed, options.length)];
}

export { buildPlanPitch } from "../core/planPitch";

export function finalizeOrchestratorResponse(
  rawResponse: RawOrchestratorResponse,
): OrchestratorResponse {
  return finalizeResponseEnvelope(rawResponse) as OrchestratorResponse;
}

export function applyMemoryPatch(
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
