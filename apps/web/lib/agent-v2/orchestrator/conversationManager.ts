import { classifyIntent } from "../agents/classifier";
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
  hasStrongDraftCommand,
  isBareDraftRequest,
  isBareIdeationRequest,
  resolveConversationMode,
  resolveDraftOutputShape,
  shouldRouteCareerClarification,
  shouldUseRevisionDraftPath,
} from "./conversationManagerLogic";
import {
  inferBroadTopicDraftRequest,
  shouldFastStartGroundedDraft,
} from "./draftFastStart.ts";
import { resolveConversationRouterState } from "./conversationRouterMachine";
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
import { selectResponseShapePlan } from "./surfaceModeSelector";
import { shapeAssistantResponse } from "./responseShaper";
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
}

export interface OrchestratorData {
  angles?: unknown[];
  plan?: StrategyPlan | null;
  draft?: string | null;
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
  classifyIntent: typeof classifyIntent;
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
}

function normalizeHandleForContext(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/^@+/, "").toLowerCase();
  return normalized || null;
}

function buildDraftGroundingSummary(args: {
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
    classifyIntent,
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
  };
}

function isLazyDraftRequest(message: string): boolean {
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

function looksGenericTopicSummary(value: string | null | undefined): boolean {
  const normalized = value?.trim();
  if (!normalized) {
    return false;
  }

  return isBareIdeationRequest(normalized) || isBareDraftRequest(normalized);
}

function looksLikeIdeationRetryCommand(message: string): boolean {
  const normalized = message
    .trim()
    .toLowerCase()
    .replace(/[.?!,]+$/, "")
    .replace(/\s+/g, " ");
  if (!normalized) {
    return false;
  }

  return (
    normalized === "try again" ||
    normalized === "another round" ||
    normalized === "one more round" ||
    /^(?:try|run)\s+(?:that\s+)?again$/.test(normalized) ||
    /^(?:give|show|share|suggest)\s+me\s+(?:another|different|new)\s+(?:set\s+of\s+)?(?:post\s+)?ideas?$/.test(
      normalized,
    )
  );
}

function inferMissingSpecificQuestion(message: string): string | null {
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

function buildAmbiguousReferenceQuestion(reference: string): string {
  const normalized = reference.trim().toLowerCase();

  if (normalized === "ampm") {
    return "when you say ampm, do you mean the downtown toronto club, the convenience store brand, or am/pm as time of day?";
  }

  return `when you say ${reference}, what exactly are you referring to in this post?`;
}

function extractPriorUserTurn(recentHistory: string): string | null {
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

function extractIdeaTitlesFromIdeas(ideas: unknown[] | undefined): string[] {
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

function inferTopicFromIdeaTitles(ideaTitles: string[]): string | null {
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

function inferAbstractTopicSeed(
  message: string,
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

function looksLikeUnsafeClarificationSeed(message: string): boolean {
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

function inferLooseClarificationSeed(
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

function hasConstraintDefinedEntity(
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

function looksLikeOpaqueEntityTopic(args: {
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

function buildGroundedTopicDraftInput(args: {
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

function inferDraftPreference(
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

function inferDraftFormatPreference(
  message: string,
  fallback: DraftFormatPreference = "shortform",
  explicitFormatPreference?: DraftFormatPreference | null,
): DraftFormatPreference {
  if (explicitFormatPreference) {
    return explicitFormatPreference;
  }

  const normalized = message.trim().toLowerCase();

  if (
    [
      "thread",
      "x thread",
      "tweet thread",
      "make it a thread",
      "turn this into a thread",
      "write a thread",
    ].some((cue) => normalized.includes(cue))
  ) {
    return "thread";
  }

  if (
    [
      "longform",
      "long form",
      "long-form",
      "write longer",
      "go deeper",
      "expand this",
    ].some((cue) => normalized.includes(cue))
  ) {
    return "longform";
  }

  if (
    [
      "shortform",
      "short form",
      "short-form",
      "keep it short",
      "keep it tight",
    ].some((cue) => normalized.includes(cue))
  ) {
    return "shortform";
  }

  return fallback;
}

function resolveRequestedThreadFramingStyle(args: {
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

function withPlanPreferences(
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

function pickDeterministic<T>(options: T[], seed: string): T {
  return options[deterministicIndex(seed, options.length)];
}

function finalizeOrchestratorResponse(
  rawResponse: RawOrchestratorResponse,
): OrchestratorResponse {
  const resultData = rawResponse.data as Record<string, unknown> | undefined;
  const responseShapePlan = selectResponseShapePlan({
    outputShape: rawResponse.outputShape,
    response: rawResponse.response,
    hasQuickReplies:
      Array.isArray(resultData?.quickReplies) && resultData.quickReplies.length > 0,
    hasAngles: Array.isArray(resultData?.angles) && resultData.angles.length > 0,
    hasPlan: Boolean(resultData?.plan),
    hasDraft: typeof resultData?.draft === "string" && resultData.draft.length > 0,
    conversationState: rawResponse.memory.conversationState,
    preferredSurfaceMode: rawResponse.memory.preferredSurfaceMode,
  });

  return {
    ...rawResponse,
    response: shapeAssistantResponse({
      response: rawResponse.response,
      outputShape: rawResponse.outputShape,
      plan: responseShapePlan,
    }),
    surfaceMode: responseShapePlan.surfaceMode,
    responseShapePlan,
  };
}

function buildPlanPitch(plan: StrategyPlan): string {
  const normalizeLine = (value: string): string =>
    value
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[.?!,;:]+$/, "");

  const toSentence = (value: string): string => {
    const normalized = normalizeLine(value);
    if (!normalized) {
      return "";
    }

    return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}.`;
  };

  const toLead = (value: string): string => {
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized) {
      return "";
    }

    const base = `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
    return /[.?!]$/.test(base) ? base : `${base}.`;
  };

  const seed = [plan.objective, plan.angle, plan.hookType, plan.targetLane]
    .join("|")
    .toLowerCase();
  const lead =
    toLead(plan.pitchResponse || "") ||
    pickDeterministic(
      [
        "this direction works best",
        "this is the cleanest angle",
        "i'd run with this angle",
        "this framing is the strongest",
        "this gives you the clearest payoff",
      ].map((entry) => toLead(entry)),
      seed,
    );

  const angleLine = toSentence(plan.angle);
  const objectiveLine = toSentence(plan.objective);
  const close = pickDeterministic(
    [
      "if that's the angle, i'll draft it.",
      "if this direction works, i'll write it from here.",
      "if you want this angle, i'll run with it.",
    ],
    `${seed}|close`,
  );

  if (angleLine && objectiveLine && angleLine !== objectiveLine) {
    return `${lead}\n\n${angleLine}\n\n${objectiveLine}\n\n${close}`;
  }

  if (angleLine) {
    return `${lead}\n\n${angleLine}\n\n${close}`;
  }

  if (objectiveLine) {
    return `${lead}\n\n${objectiveLine}\n\n${close}`;
  }

  return `${lead}\n\n${close}`;
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
  serviceOverrides: Partial<ConversationServices> = {},
): Promise<OrchestratorResponse> {
  const services: ConversationServices = {
    ...createDefaultConversationServices(),
    ...serviceOverrides,
  };
  const {
    userId,
    xHandle,
    runId,
    threadId,
    userMessage,
    recentHistory,
    explicitIntent,
    activeDraft,
    formatPreference,
    threadFramingStyle,
    creatorProfileHints: inputCreatorProfileHints,
  } = input;
  const preloadedRun = runId ? await services.getOnboardingRun(runId) : null;
  const runInputRecord = preloadedRun?.input as Record<string, unknown> | undefined;
  const runInputHandle =
    typeof runInputRecord?.account === "string" ? runInputRecord.account : null;
  const effectiveXHandle =
    normalizeHandleForContext(xHandle) ??
    normalizeHandleForContext(runInputHandle) ??
    "default";
  const creatorProfileHints =
    inputCreatorProfileHints ||
    (() => {
      const onboarding = preloadedRun?.result;
      if (!runId || !onboarding) {
        return null;
      }

      try {
        return buildCreatorProfileHintsFromOnboarding({
          runId,
          onboarding: onboarding as Parameters<typeof buildCreatorProfileHintsFromOnboarding>[0]["onboarding"],
        });
      } catch {
        return null;
      }
    })();

  let memoryRecord = await services.getConversationMemory({ runId, threadId });
  if (!memoryRecord) {
    memoryRecord = await services.createConversationMemory({
      runId,
      threadId,
      userId: userId === "anonymous" ? null : userId,
    });
  }

  let memory = createConversationMemorySnapshot(
    memoryRecord as unknown as Record<string, unknown>,
  );
  const effectiveActiveConstraints = Array.from(
    new Set([
      ...memory.activeConstraints,
      ...((input.preferenceConstraints || []).filter((value) => value.trim().length > 0)),
    ]),
  );

  // V3: deterministic turn planner runs before the LLM classifier.
  // It catches high-confidence patterns (edit instructions, immediate
  // draft commands, chat questions) and can short-circuit the classifier.
  const turnPlan = planTurn({
    userMessage,
    recentHistory,
    activeDraft,
    memory,
    explicitIntent,
  });
  let autoSavedSourceMaterials:
    | {
        count: number;
        assets: Array<{
          id: string;
          title: string;
          deletable: boolean;
        }>;
      }
    | undefined;

  const rawResponse = await (async (): Promise<RawOrchestratorResponse> => {
  let classification;
  if (turnPlan?.overrideClassifiedIntent && !explicitIntent) {
    // Deterministic override — skip LLM classification.
    classification = {
      intent: turnPlan.overrideClassifiedIntent,
      needs_memory_update: false,
      confidence: 1,
    };
  } else if (!explicitIntent) {
    classification = await services.classifyIntent(userMessage, recentHistory);
    if (!classification) {
      return {
        mode: "error",
        outputShape: "coach_question",
        response: "Failed to classify intent.",
        memory,
      };
    }
  } else {
    classification = {
      intent: explicitIntent,
      needs_memory_update: false,
      confidence: 1,
    };
  }

  if (classification.needs_memory_update) {
    const nextConstraints = Array.from(
      new Set([...memory.activeConstraints, userMessage]),
    );
    const updated = await services.updateConversationMemory({
      runId,
      threadId,
      activeConstraints: nextConstraints,
    });
    memory = createConversationMemorySnapshot(updated as unknown as Record<string, unknown>);
  }

  let mode = resolveConversationMode({
    explicitIntent,
    userMessage,
    classifiedIntent: classification.intent,
    activeDraft,
  }) as V2ChatIntent;

  if (
    !explicitIntent &&
    !activeDraft &&
    memory.conversationState === "ready_to_ideate" &&
    looksLikeIdeationRetryCommand(userMessage)
  ) {
    mode = "ideate";
  }

  let [styleCard, anchors, extractedRules, extractedFacts, sourceMaterialAssets] = await Promise.all([
    services.generateStyleProfile(userId, effectiveXHandle, 20),
    services.retrieveAnchors(
      userId,
      effectiveXHandle,
      userMessage || memory.topicSummary || "growth",
    ),
    userId !== "anonymous"
      ? services.extractStyleRules(userMessage, recentHistory)
      : Promise.resolve(null),
    userId !== "anonymous"
      ? services.extractCoreFacts(userMessage, recentHistory)
      : Promise.resolve(null),
    userId !== "anonymous"
      ? services.getSourceMaterialAssets({
          userId,
          xHandle: effectiveXHandle,
        })
      : Promise.resolve([]),
  ]);
  let rememberedStyleRuleCount = 0;
  if (styleCard && extractedRules && extractedRules.length > 0) {
    rememberedStyleRuleCount = countNewMemoryEntries(
      styleCard.customGuidelines || [],
      extractedRules,
    );
    styleCard.customGuidelines = Array.from(
      new Set([...(styleCard.customGuidelines || []), ...extractedRules]),
    );
    services.saveStyleProfile(userId, effectiveXHandle, styleCard).catch((error) =>
      console.error("Failed to save style profile:", error),
    );
  }

  let rememberedFactCount = 0;
  if (styleCard && extractedFacts && extractedFacts.length > 0) {
    const previousDurableFacts = getDurableFactsFromStyleCard(styleCard);
    styleCard = rememberFactsOnStyleCard(styleCard, extractedFacts);
    rememberedFactCount = countNewMemoryEntries(
      previousDurableFacts,
      getDurableFactsFromStyleCard(styleCard),
    );
    services.saveStyleProfile(userId, effectiveXHandle, styleCard).catch((error) =>
      console.error("Failed to save style profile:", error),
    );
  }

  if (
    styleCard &&
    userId !== "anonymous" &&
    looksLikeSemanticCorrection(userMessage) &&
    hasConcreteCorrectionDetail(userMessage)
  ) {
    const correctionDetail = normalizeRepairDetail(userMessage);
    const previousDurableFacts = getDurableFactsFromStyleCard(styleCard);
    const previousForbiddenClaims = styleCard.factLedger?.forbiddenClaims || [];
    styleCard = rememberSemanticCorrectionOnStyleCard(styleCard, correctionDetail);
    const nextDurableFacts = getDurableFactsFromStyleCard(styleCard);
    const nextForbiddenClaims = styleCard.factLedger?.forbiddenClaims || [];
    const correctionExpandedMemory =
      countNewMemoryEntries(previousDurableFacts, nextDurableFacts) > 0 ||
      countNewMemoryEntries(previousForbiddenClaims, nextForbiddenClaims) > 0;

    if (correctionExpandedMemory) {
      services.saveStyleProfile(userId, effectiveXHandle, styleCard).catch((error) =>
        console.error("Failed to save semantic correction to style profile:", error),
      );
    }
  }

  const autoSourceMaterialInputs =
    userId !== "anonymous"
      ? extractAutoSourceMaterialInputs({
          userMessage,
          recentHistory,
          extractedFacts,
        })
      : [];
  const newAutoSourceMaterialInputs =
    autoSourceMaterialInputs.length > 0
      ? filterNewSourceMaterialInputs({
          existing: [
            ...(sourceMaterialAssets || []),
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

  if (newAutoSourceMaterialInputs.length > 0) {
    if (styleCard) {
      styleCard = {
        ...styleCard,
        factLedger: {
          ...styleCard.factLedger,
          sourceMaterials: [
            ...(styleCard.factLedger?.sourceMaterials || []),
            ...newAutoSourceMaterialInputs,
          ],
        },
      };

      services.saveStyleProfile(userId, effectiveXHandle, styleCard).catch((error) =>
        console.error("Failed to save auto-captured source materials to style profile:", error),
      );
    }

    const persistedAutoSourceMaterials = await services.saveSourceMaterialAssets({
      userId,
      xHandle: effectiveXHandle,
      assets: newAutoSourceMaterialInputs,
    });

    const fallbackCreatedAt = new Date().toISOString();
    const autoSourceMaterialRecords =
      persistedAutoSourceMaterials.length > 0
        ? persistedAutoSourceMaterials
        : newAutoSourceMaterialInputs.map((asset, index) => ({
            id: `auto-source-${index}-${fallbackCreatedAt}`,
            userId,
            xHandle: effectiveXHandle || null,
            type: asset.type,
            title: asset.title,
            tags: asset.tags,
            verified: asset.verified,
            claims: asset.claims,
            snippets: asset.snippets,
            doNotClaim: asset.doNotClaim,
            lastUsedAt: null,
            createdAt: fallbackCreatedAt,
            updatedAt: fallbackCreatedAt,
          }));

    sourceMaterialAssets = [
      ...autoSourceMaterialRecords,
      ...sourceMaterialAssets,
    ];
    autoSavedSourceMaterials = {
      count: newAutoSourceMaterialInputs.length,
      assets: autoSourceMaterialRecords.map((asset) => ({
        id: asset.id,
        title: asset.title,
        deletable: !asset.id.startsWith("auto-source-"),
      })),
    };
  }

  const antiPatternResult = await maybeCaptureAntiPattern(
    {
      userId,
      userMessage,
      activeDraft,
      recentHistory,
      styleCard,
      xHandle: effectiveXHandle,
    },
    services,
  );
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

  let groundingPacket = buildGroundingPacket({
    styleCard,
    activeConstraints: effectiveActiveConstraints,
    extractedFacts,
  });
  const selectedSourceMaterials = selectRelevantSourceMaterials({
    assets: sourceMaterialAssets,
    userMessage,
    topicSummary: memory.topicSummary,
    limit: 2,
  });
  groundingPacket = mergeSourceMaterialsIntoGroundingPacket({
    groundingPacket,
    sourceMaterials: selectedSourceMaterials,
  });
  const groundingSourcesForTurn = groundingPacket.sourceMaterials.slice(0, 2);
  if (selectedSourceMaterials.length > 0) {
    services.markSourceMaterialAssetsUsed(selectedSourceMaterials.map((asset) => asset.id)).catch((error) =>
      console.error("Failed to update source material last-used timestamps:", error),
    );
  }
  const turnDraftContextSlots = evaluateDraftContextSlots({
    userMessage,
    topicSummary: memory.topicSummary,
    contextAnchors: groundingPacket.durableFacts,
  });
  groundingPacket = addGroundingUnknowns(groundingPacket, turnDraftContextSlots);
  const relevantTopicAnchors = retrieveRelevantContext({
    userMessage,
    topicSummary: memory.topicSummary,
    rollingSummary: memory.rollingSummary,
    topicAnchors: anchors.topicAnchors,
    contextAnchors: groundingPacket.durableFacts,
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
    groundingPacket.durableFacts.length > 0
      ? `\n- Known Facts: ${groundingPacket.durableFacts.join(" | ")}`
      : "";

  const userContextString = `
User Profile Summary:
- Stage: ${stage}
- Primary Goal: ${goal}${contextAnchorsStr}
  `.trim();

  const writeMemory = async (
    patch: Partial<V2ConversationMemory> & {
      topicSummary?: string | null;
      lastIdeationAngles?: string[];
      concreteAnswerCount?: number;
      currentDraftArtifactId?: string | null;
    },
  ) => {
    const optimistic = applyMemoryPatch(memory, {
      conversationState: patch.conversationState,
      activeConstraints: patch.activeConstraints,
      pendingPlan: patch.pendingPlan,
      clarificationState: patch.clarificationState,
      rollingSummary: patch.rollingSummary,
      assistantTurnCount: patch.assistantTurnCount,
      activeDraftRef: patch.activeDraftRef,
      latestRefinementInstruction: patch.latestRefinementInstruction,
      unresolvedQuestion: patch.unresolvedQuestion,
      clarificationQuestionsAsked: patch.clarificationQuestionsAsked,
      preferredSurfaceMode: patch.preferredSurfaceMode,
      formatPreference: patch.formatPreference,
      lastIdeationAngles: patch.lastIdeationAngles,
      topicSummary: patch.topicSummary ?? memory.topicSummary,
      concreteAnswerCount:
        patch.concreteAnswerCount ?? memory.concreteAnswerCount,
      currentDraftArtifactId:
        patch.currentDraftArtifactId ?? memory.currentDraftArtifactId,
    });

    const updated = await services.updateConversationMemory({
      runId,
      threadId,
      topicSummary: patch.topicSummary,
      activeConstraints: patch.activeConstraints,
      concreteAnswerCount: patch.concreteAnswerCount,
      lastDraftArtifactId: patch.currentDraftArtifactId,
      conversationState: patch.conversationState,
      pendingPlan: patch.pendingPlan,
      clarificationState: patch.clarificationState,
      rollingSummary: patch.rollingSummary,
      assistantTurnCount: patch.assistantTurnCount,
      activeDraftRef: patch.activeDraftRef,
      latestRefinementInstruction: patch.latestRefinementInstruction,
      unresolvedQuestion: patch.unresolvedQuestion,
      clarificationQuestionsAsked: patch.clarificationQuestionsAsked,
      preferredSurfaceMode: patch.preferredSurfaceMode,
      formatPreference: patch.formatPreference,
      lastIdeationAngles: patch.lastIdeationAngles,
    });

    memory = updated
      ? createConversationMemorySnapshot(updated as unknown as Record<string, unknown>)
      : optimistic;
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
    (mode === "draft" ||
      mode === "edit" ||
      mode === "review" ||
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
  const baseVoiceTarget = resolveVoiceTarget({
    styleCard,
    userMessage,
    draftPreference: turnDraftPreference,
    formatPreference: turnFormatPreference,
  });
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
    if (hasStrictFactualReferenceGuardrails(args.activeConstraints)) {
      return true;
    }

    const sourceSlots = evaluateDraftContextSlots({
      userMessage: args.sourceText,
      topicSummary: memory.topicSummary,
      contextAnchors: groundingPacket.durableFacts,
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
    contextAnchors: groundingPacket.durableFacts,
    activeConstraints: effectiveActiveConstraints,
    ...(useFactSafeReferenceHintsForTurn
      ? { referenceLabel: "REFERENCE HINTS" }
      : {}),
  });
  let draftInstruction = userMessage;

  async function returnClarificationQuestion(args: {
    question: string;
    reply?: string;
    clarificationState?: V2ConversationMemory["clarificationState"] | null;
    quickReplies?: CreatorChatQuickReply[];
    topicSummary?: string | null;
    pendingPlan?: StrategyPlan | null;
  }): Promise<RawOrchestratorResponse> {
    await writeMemory({
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

  function buildGroundedProductClarificationQuestion(sourceUserMessage: string): string {
    const normalized = sourceUserMessage.trim().replace(/\s+/g, " ");
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
            contextAnchors: groundingPacket.durableFacts,
            activeConstraints: args.activeConstraints,
          }),
      retrievalReasons: retrieval.rankedAnchors
        .slice(0, 3)
        .map((anchor) => anchor.reason)
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
        groundingPacket,
      });

      return {
        ...attempt,
        criticOutput: {
          ...attempt.criticOutput,
          finalDraft: claimCheck.draft || attempt.criticOutput.finalDraft,
          issues: Array.from(new Set([...attempt.criticOutput.issues, ...claimCheck.issues])),
        },
        draftToDeliver: claimCheck.draft || attempt.draftToDeliver,
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
          groundingPacket,
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
          groundingPacket,
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
      return {
        kind: "response",
        response: await returnClarificationQuestion({
          question: buildGroundedProductClarificationQuestion(
            args.sourceUserMessage || args.plan.objective,
          ),
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

    if (!firstAssessment.hasDrift && !firstProductAssessment.hasDrift) {
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
      return {
        kind: "response",
        response: await returnClarificationQuestion({
          question: buildGroundedProductClarificationQuestion(
            args.sourceUserMessage || args.plan.objective,
          ),
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
      return {
        kind: "response",
        response: secondAssessment.hasDrift
          ? await returnClarificationQuestion({
              question: buildConcreteSceneClarificationQuestion(
                args.sourceUserMessage || args.plan.objective,
              ),
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

    await writeMemory({
      activeConstraints: nextConstraints,
      clarificationState: null,
      conversationState: "editing",
      latestRefinementInstruction: repairDirective.rewriteRequest,
      ...clearClarificationPatch(),
    });

    mode = "edit";
    draftInstruction = repairDirective.rewriteRequest;
  }

  if (!explicitIntent && activeDraft && isDraftMeaningQuestion(userMessage)) {
    await writeMemory({
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

      await writeMemory({
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

      const draftResult = await generateDraftWithGroundingRetry({
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
      });

      if (draftResult.kind === "response") {
        return draftResult.response;
      }

      const {
        writerOutput,
        criticOutput,
        draftToDeliver,
        voiceTarget,
        retrievalReasons,
        threadFramingStyle,
      } = draftResult;

      const noveltyCheck = services.checkDeterministicNovelty(
        draftToDeliver,
        historicalTexts,
      );
      if (!noveltyCheck.isNovel) {
        return returnClarificationTree({
          branchKey: "plan_reject",
          seedTopic: approvedPlan.objective,
          pendingPlan: null,
          replyOverride:
            "this version felt too close to something you've already posted. let's shift it.",
        });
      }

      const rollingSummary = buildRollingSummary({
        currentSummary: memory.rollingSummary,
        topicSummary: approvedPlan.objective,
        approvedPlan,
        activeConstraints: draftActiveConstraints,
        latestDraftStatus: "Draft delivered",
        formatPreference: approvedPlan.formatPreference || turnFormatPreference,
      });

      await writeMemory({
        topicSummary: approvedPlan.objective,
        conversationState: "draft_ready",
        pendingPlan: null,
        clarificationState: null,
        rollingSummary,
        assistantTurnCount: nextAssistantTurnCount,
        formatPreference: approvedPlan.formatPreference || turnFormatPreference,
        latestRefinementInstruction: null,
        ...clearClarificationPatch(),
      });

      return {
        mode: "draft",
        outputShape: resolveDraftOutputShape(
          approvedPlan.formatPreference || turnFormatPreference,
        ),
        response: prependFeedbackMemoryNotice(
          buildDraftReply({
            userMessage,
            draftPreference: approvedPlan.deliveryPreference || turnDraftPreference,
            isEdit: false,
            issuesFixed: criticOutput.issues,
            styleCard,
          }),
          feedbackMemoryNotice,
        ),
        data: {
          draft: draftToDeliver,
          supportAsset: writerOutput.supportAsset,
          issuesFixed: criticOutput.issues,
          voiceTarget,
          noveltyNotes: buildNoveltyNotes({
            noveltyCheck,
            retrievalReasons,
          }),
          threadFramingStyle,
          groundingSources: groundingSourcesForTurn,
          groundingMode: draftGroundingSummary.groundingMode,
          groundingExplanation: draftGroundingSummary.groundingExplanation,
        },
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

      await writeMemory({
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

    await writeMemory({
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
  const canAskPlanClarification = (): boolean =>
    routerState === "clarify_before_generation";

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
      return returnClarificationTree({
        branchKey: "entity_context_missing",
        seedTopic: turnDraftContextSlots.namedEntity,
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
    return returnClarificationTree({
      branchKey: isLazyDraftRequest(userMessage)
        ? "lazy_request"
        : "vague_draft_request",
      seedTopic: null,
      isVerifiedAccount,
    });
  }

  if (
    canAskPlanClarification() &&
    !memory.topicSummary &&
    memory.concreteAnswerCount < 2 &&
    classification.confidence < 0.7
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
    const abstractTopicSeed = inferAbstractTopicSeed(userMessage, memory);

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
      contextAnchors: groundingPacket.durableFacts,
    });

    if (sourceTransparencyReply) {
      await writeMemory({
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
      await writeMemory({
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
      await writeMemory({
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

      await writeMemory({
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
      contextAnchors: groundingPacket.durableFacts,
    });

    if (sourceTransparencyReply) {
      await writeMemory({
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
      await writeMemory({
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

      await writeMemory({
        activeConstraints: nextConstraints,
        clarificationState: null,
        conversationState: "editing",
        assistantTurnCount: nextAssistantTurnCount,
        latestRefinementInstruction: repairDirective.rewriteRequest,
        ...clearClarificationPatch(),
      });

      mode = "edit";
      draftInstruction = repairDirective.rewriteRequest;
    }
  }

  // ---------------------------------------------------------------------------
  // Mode Handlers
  // ---------------------------------------------------------------------------

  async function handleIdeateMode(): Promise<RawOrchestratorResponse> {
    const ideas = await services.generateIdeasMenu(
      userMessage,
      memory.topicSummary,
      effectiveContext,
      styleCard,
      relevantTopicAnchors,
      userContextString,
      {
        goal,
        conversationState: memory.conversationState,
        antiPatterns,
      },
    );
    const currentIdeaTitles = extractIdeaTitlesFromIdeas(ideas?.angles);
    const inferredIdeaTopic = inferTopicFromIdeaTitles(currentIdeaTitles);

    const currentTopicSummary = looksGenericTopicSummary(memory.topicSummary)
      ? null
      : memory.topicSummary;
    const nextIdeationTopicSummary = isBareIdeationRequest(userMessage)
      ? currentTopicSummary || inferredIdeaTopic
      : userMessage;

    await writeMemory({
      ...(nextIdeationTopicSummary !== memory.topicSummary
        ? { topicSummary: nextIdeationTopicSummary }
        : {}),
      ...(currentIdeaTitles.length > 0
        ? { lastIdeationAngles: currentIdeaTitles }
        : {}),
      conversationState: "ready_to_ideate",
      clarificationState: null,
      assistantTurnCount: nextAssistantTurnCount,
      rollingSummary: shouldRefreshRollingSummary(nextAssistantTurnCount, false)
        ? buildRollingSummary({
          currentSummary: memory.rollingSummary,
          topicSummary: nextIdeationTopicSummary || currentTopicSummary,
          approvedPlan: null,
          activeConstraints: effectiveActiveConstraints,
          latestDraftStatus: "Ideation in progress",
          formatPreference: memory.formatPreference || turnFormatPreference,
          unresolvedQuestion: ideas?.close || null,
        })
        : memory.rollingSummary,
      ...clearClarificationPatch(),
    });

    return {
      mode: "ideate",
      outputShape: "ideation_angles",
      response: prependFeedbackMemoryNotice(
        buildIdeationReply({
          intro: ideas?.intro || "",
          close: ideas?.close || "",
          userMessage,
          styleCard,
        }),
        feedbackMemoryNotice,
      ),
      data: ideas
        ? {
          angles: ideas.angles,
          quickReplies: buildIdeationQuickReplies({
            styleCard,
            seedTopic: nextIdeationTopicSummary || currentTopicSummary,
          }),
        }
        : undefined,
      memory,
    };
  }

  async function handlePlanMode(): Promise<RawOrchestratorResponse> {
    const clarificationAwarePlanInput = buildClarificationAwarePlanInput({
      userMessage,
      activeConstraints: effectiveActiveConstraints,
    });
    const planInput =
      clarificationAwarePlanInput.planMessage !== userMessage ||
      clarificationAwarePlanInput.activeConstraints !== effectiveActiveConstraints
        ? clarificationAwarePlanInput
        : groundedTopicDraftInput.planMessage
          ? {
              planMessage: groundedTopicDraftInput.planMessage,
              activeConstraints: groundedTopicDraftInput.nextConstraints,
            }
          : clarificationAwarePlanInput;
    const plan = await services.generatePlan(
      planInput.planMessage,
      memory.topicSummary,
      Array.from(
        new Set([
          ...planInput.activeConstraints,
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
        voiceTarget: baseVoiceTarget,
        groundingPacket,
        creatorProfileHints,
      },
    );

    if (!plan) {
      return {
        mode: "error",
        outputShape: "coach_question",
        response: "Failed to generate strategy plan.",
        memory,
      };
    }

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
    const planActiveConstraints = Array.from(
      new Set([
        ...planInput.activeConstraints,
        ...(safeFrameworkConstraint ? [safeFrameworkConstraint] : []),
      ]),
    );

    // V3: Rough draft mode. When the turn planner forced draft (user said
    // "just write it" / "go ahead"), auto-approve the plan and proceed
    // directly to drafting instead of waiting for explicit approval.
    if (
      ((turnPlan?.userGoal === "draft" &&
        (hasEnoughContextToAct || turnPlan.shouldAutoDraftFromPlan === true)) ||
        shouldFastStartFromGroundedContext)
    ) {
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
      });

      if (draftResult.kind === "response" && draftResult.response.mode === "error") {
        // Fall through to plan presentation if draft generation fails.
        await writeMemory({
          topicSummary: guardedPlan.objective,
          activeConstraints: planActiveConstraints,
          conversationState: "plan_pending_approval",
          pendingPlan: guardedPlan,
          clarificationState: null,
          assistantTurnCount: nextAssistantTurnCount,
          formatPreference: guardedPlan.formatPreference || turnFormatPreference,
          ...clearClarificationPatch(),
        });

        return {
          mode: "plan",
          outputShape: "planning_outline",
          response: prependFeedbackMemoryNotice(
            buildPlanPitch(guardedPlan),
            feedbackMemoryNotice,
          ),
          data: {
            plan: guardedPlan,
            quickReplies: buildPlannerQuickReplies({
              plan: guardedPlan,
              styleCard,
              context: "approval",
            }),
          },
          memory,
        };
      }

      if (draftResult.kind === "response") {
        return draftResult.response;
      }

      const {
        writerOutput,
        criticOutput,
        draftToDeliver: finalDraft,
        voiceTarget,
        retrievalReasons,
        threadFramingStyle,
      } = draftResult;
      const historicalTexts = await services.getHistoricalPosts({
        userId,
        xHandle: effectiveXHandle,
      });
      const noveltyCheck = services.checkDeterministicNovelty(
        finalDraft,
        historicalTexts,
      );

      const rollingSummary = shouldRefreshRollingSummary(nextAssistantTurnCount, true)
        ? buildRollingSummary({
          currentSummary: memory.rollingSummary,
          topicSummary: guardedPlan.objective,
          approvedPlan: guardedPlan,
          activeConstraints: planActiveConstraints,
          latestDraftStatus: "Rough draft generated",
          formatPreference: guardedPlan.formatPreference || turnFormatPreference,
        })
        : memory.rollingSummary;

      await writeMemory({
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
        outputShape: resolveDraftOutputShape(guardedPlan.formatPreference || turnFormatPreference),
        response: prependFeedbackMemoryNotice(
          buildDraftReply({
            userMessage,
            draftPreference: turnDraftPreference,
            isEdit: false,
            issuesFixed: criticOutput.issues,
            styleCard,
          }),
          feedbackMemoryNotice,
        ),
        data: {
          draft: finalDraft,
          supportAsset: writerOutput.supportAsset,
          plan: guardedPlan,
          issuesFixed: criticOutput.issues,
          voiceTarget,
          noveltyNotes: buildNoveltyNotes({
            noveltyCheck,
            retrievalReasons,
          }),
          threadFramingStyle,
          groundingSources: groundingSourcesForTurn,
          groundingMode: draftGroundingSummary.groundingMode,
          groundingExplanation: draftGroundingSummary.groundingExplanation,
        },
        memory,
      };
    }

    await writeMemory({
      topicSummary: guardedPlan.objective,
      activeConstraints: planActiveConstraints,
      conversationState: "plan_pending_approval",
      pendingPlan: guardedPlan,
      clarificationState: null,
      assistantTurnCount: nextAssistantTurnCount,
      formatPreference: guardedPlan.formatPreference || turnFormatPreference,
      ...clearClarificationPatch(),
    });

    return {
      mode: "plan",
      outputShape: "planning_outline",
      response: prependFeedbackMemoryNotice(
        buildPlanPitch(guardedPlan),
        feedbackMemoryNotice,
      ),
      data: {
        plan: guardedPlan,
        quickReplies: buildPlannerQuickReplies({
          plan: guardedPlan,
          styleCard,
          context: "approval",
        }),
      },
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
      (mode === "edit" || mode === "review") &&
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

    const revisionActiveConstraints = Array.from(
      new Set([
        ...(isConstraintDeclaration(userMessage)
          ? [...effectiveActiveConstraints, userMessage.trim()]
          : effectiveActiveConstraints),
        ...(safeFrameworkConstraint ? [safeFrameworkConstraint] : []),
      ]),
    );

    if (shouldUseRevisionDraftPath({ mode, activeDraft: effectiveActiveDraft }) && effectiveActiveDraft) {
      const revision = normalizeDraftRevisionInstruction(
        draftInstruction,
        effectiveActiveDraft,
      );
      const reviserOutput = await services.generateRevisionDraft({
        activeDraft: effectiveActiveDraft,
        revision,
        styleCard,
        topicAnchors: relevantTopicAnchors,
        activeConstraints: revisionActiveConstraints,
        recentHistory: effectiveContext,
        options: {
          conversationState: "editing",
          antiPatterns,
          maxCharacterLimit,
          goal,
          draftPreference: turnDraftPreference,
          formatPreference: turnFormatPreference,
          threadPostMaxCharacterLimit,
          threadFramingStyle: turnThreadFramingStyle,
        },
      });

      if (!reviserOutput) {
        return {
          mode: "error",
          outputShape: "coach_question",
          response: "Failed to revise draft.",
          memory,
        };
      }

      const criticOutput = await services.critiqueDrafts(
        {
          angle: "Targeted revision",
          draft: reviserOutput.revisedDraft,
          supportAsset: reviserOutput.supportAsset ?? "",
          whyThisWorks: "",
          watchOutFor: "",
        },
        revisionActiveConstraints,
        styleCard,
        {
          maxCharacterLimit,
          draftPreference: turnDraftPreference,
          formatPreference: turnFormatPreference,
          threadPostMaxCharacterLimit,
          threadFramingStyle: turnThreadFramingStyle,
          previousDraft: effectiveActiveDraft,
          revisionChangeKind: revision.changeKind,
          groundingPacket,
        },
      );

      if (!criticOutput) {
        return {
          mode: "error",
          outputShape: "coach_question",
          response: "Failed to finalize revised draft.",
          memory,
        };
      }

      const claimCheck = checkDraftClaimsAgainstGrounding({
        draft: criticOutput.finalDraft,
        groundingPacket,
      });
      if (claimCheck.needsClarification) {
        return returnClarificationQuestion({
          question: buildGroundedProductClarificationQuestion(
            effectiveActiveDraft || memory.topicSummary || userMessage,
          ),
        });
      }

      const revisionWasRejectedByCritic = !criticOutput.approved;
      const finalizedRevisionDraft = revisionWasRejectedByCritic
        ? reviserOutput.revisedDraft
        : claimCheck.draft || criticOutput.finalDraft;
      const revisionVoiceTarget = resolveVoiceTarget({
        styleCard,
        userMessage,
        draftPreference: turnDraftPreference,
        formatPreference: turnFormatPreference,
      });
      const rollingSummary = shouldRefreshRollingSummary(nextAssistantTurnCount, false)
        ? buildRollingSummary({
          currentSummary: memory.rollingSummary,
          topicSummary: memory.topicSummary,
          approvedPlan: memory.pendingPlan,
          activeConstraints: revisionActiveConstraints,
          latestDraftStatus: "Draft revised",
          formatPreference: memory.formatPreference || turnFormatPreference,
        })
        : memory.rollingSummary;

      const issuesFixed = Array.from(
        new Set([
          ...(reviserOutput.issuesFixed || []),
          ...criticOutput.issues,
          ...claimCheck.issues,
          ...(revisionWasRejectedByCritic
            ? ["Kept the revision closer to the original edit scope."]
            : []),
        ]),
      );

      await writeMemory({
        conversationState: "editing",
        activeConstraints: revisionActiveConstraints,
        pendingPlan: null,
        clarificationState: null,
        rollingSummary,
        assistantTurnCount: nextAssistantTurnCount,
        formatPreference: turnFormatPreference,
        latestRefinementInstruction: draftInstruction,
        ...clearClarificationPatch(),
      });

      return {
        mode: "draft",
        outputShape: resolveDraftOutputShape(turnFormatPreference),
        response: prependFeedbackMemoryNotice(
          buildDraftReply({
            userMessage,
            draftPreference: turnDraftPreference,
            isEdit: true,
            issuesFixed,
            styleCard,
          }),
          feedbackMemoryNotice,
        ),
        data: {
          draft: finalizedRevisionDraft,
          supportAsset: reviserOutput.supportAsset,
          issuesFixed,
          voiceTarget: revisionVoiceTarget,
          noveltyNotes: buildNoveltyNotes({}),
          threadFramingStyle: turnThreadFramingStyle,
          groundingSources: groundingSourcesForTurn,
          groundingMode: draftGroundingSummary.groundingMode,
          groundingExplanation: draftGroundingSummary.groundingExplanation,
        },
        memory,
      };
    }

    const historicalTexts = await services.getHistoricalPosts({
      userId,
      xHandle: effectiveXHandle,
    });

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
        voiceTarget: baseVoiceTarget,
        groundingPacket,
        creatorProfileHints,
      },
    );

    if (!plan) {
      return {
        mode: "error",
        outputShape: "coach_question",
        response: "Failed to generate strategy plan.",
        memory,
      };
    }

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

    const draftResult = await generateDraftWithGroundingRetry({
      plan: guardedPlan,
      activeConstraints: draftActiveConstraints,
      activeDraft,
      sourceUserMessage: draftInstruction,
      draftPreference: guardedPlan.deliveryPreference || turnDraftPreference,
      formatPreference: guardedPlan.formatPreference || turnFormatPreference,
      threadFramingStyle: turnThreadFramingStyle,
      fallbackToWriterWhenCriticRejected: false,
      topicSummary: guardedPlan.objective,
    });

    if (draftResult.kind === "response") {
      return draftResult.response;
    }

    const {
      writerOutput,
      criticOutput,
      draftToDeliver,
      voiceTarget,
      retrievalReasons,
      threadFramingStyle,
    } = draftResult;

    const noveltyCheck = services.checkDeterministicNovelty(
      draftToDeliver,
      historicalTexts,
    );
    if (!noveltyCheck.isNovel) {
      return returnClarificationTree({
        branchKey: "plan_reject",
        seedTopic: plan.objective,
        pendingPlan: null,
        replyOverride:
          "that version felt too close to something you've already posted. let's shift it.",
      });
    }

    const rollingSummary = shouldRefreshRollingSummary(nextAssistantTurnCount, false)
      ? buildRollingSummary({
        currentSummary: memory.rollingSummary,
        topicSummary: guardedPlan.objective,
        approvedPlan: guardedPlan,
        activeConstraints: draftActiveConstraints,
        latestDraftStatus: "Draft delivered",
        formatPreference:
          guardedPlan.formatPreference || turnFormatPreference,
      })
      : memory.rollingSummary;

    await writeMemory({
      topicSummary: guardedPlan.objective,
      conversationState: "draft_ready",
      pendingPlan: null,
      clarificationState: null,
      rollingSummary,
      assistantTurnCount: nextAssistantTurnCount,
      formatPreference: guardedPlan.formatPreference || turnFormatPreference,
      latestRefinementInstruction: null,
      ...clearClarificationPatch(),
    });

    return {
      mode: "draft",
      outputShape: resolveDraftOutputShape(
        guardedPlan.formatPreference || turnFormatPreference,
      ),
      response: prependFeedbackMemoryNotice(
        buildDraftReply({
          userMessage,
          draftPreference:
            guardedPlan.deliveryPreference || turnDraftPreference,
          isEdit: false,
          issuesFixed: criticOutput.issues,
          styleCard,
        }),
        feedbackMemoryNotice,
      ),
      data: {
        draft: draftToDeliver,
        supportAsset: writerOutput.supportAsset,
        issuesFixed: criticOutput.issues,
        voiceTarget,
        noveltyNotes: buildNoveltyNotes({
          noveltyCheck,
          retrievalReasons,
        }),
        threadFramingStyle,
        groundingSources: groundingSourcesForTurn,
        groundingMode: draftGroundingSummary.groundingMode,
        groundingExplanation: draftGroundingSummary.groundingExplanation,
      },
      memory,
    };
  }

  async function handleCoachMode(): Promise<RawOrchestratorResponse> {
    // V3: Fast-path for non-generation turns (constraint acks, comparisons,
    // simple questions). Skips the full coach LLM call when deterministic
    // answers are sufficient.
    if ((turnPlan && !turnPlan.shouldGenerate) || mode === "answer_question") {
      const fastReply = await respondConversationally({
        userMessage,
        recentHistory: effectiveContext,
        topicSummary: memory.topicSummary,
        styleCard,
        topicAnchors: relevantTopicAnchors,
        userContextString,
        activeConstraints: memory.activeConstraints,
        options: {
          goal,
          conversationState: memory.conversationState,
          antiPatterns,
        },
      });

      if (fastReply) {
        // Capture constraints in memory if this is a constraint declaration.
        const isConstraint = isConstraintDeclaration(userMessage);
        const nextConstraints = isConstraint
          ? Array.from(new Set([...memory.activeConstraints, userMessage.trim()]))
          : undefined;

        await writeMemory({
          conversationState:
            memory.pendingPlan && memory.conversationState === "plan_pending_approval"
              ? "plan_pending_approval"
              : memory.conversationState === "draft_ready"
                ? "draft_ready"
                : "needs_more_context",
          ...(nextConstraints ? { activeConstraints: nextConstraints } : {}),
          assistantTurnCount: nextAssistantTurnCount,
          ...clearClarificationPatch(),
        });

        return {
          mode: "coach",
          outputShape: "coach_question",
          response: prependFeedbackMemoryNotice(fastReply, feedbackMemoryNotice),
          memory,
        };
      }
    }

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

    await writeMemory({
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

    let finalResponse =
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

  switch (mode) {
    case "ideate":
      return handleIdeateMode();
    case "plan":
      return handlePlanMode();
    case "draft":
    case "review":
    case "edit":
      return handleDraftEditReviewMode();
    case "coach":
    case "answer_question":
    default:
      return handleCoachMode();
  }
  })();

  const responseWithAutoSavedSources =
    autoSavedSourceMaterials
      ? {
          ...rawResponse,
          data: {
            ...(rawResponse.data || {}),
            autoSavedSourceMaterials,
          },
        }
      : rawResponse;

  return finalizeOrchestratorResponse(responseWithAutoSavedSources);
}
