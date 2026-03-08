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
import { buildEffectiveContext, retrieveRelevantContext } from "../memory/contextRetriever";
import {
  buildRollingSummary,
  shouldRefreshRollingSummary,
} from "../memory/summaryManager";
import { retrieveAnchors } from "../core/retrieval";
import { generateStyleProfile, saveStyleProfile } from "../core/styleProfile";
import { checkDeterministicNovelty } from "../core/noveltyGate";
import { getXCharacterLimitForFormat } from "../../onboarding/draftArtifacts";
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
  assessConcreteSceneDrift,
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
  isBareDraftRequest,
  isBareIdeationRequest,
  resolveConversationMode,
  resolveDraftOutputShape,
  shouldRouteCareerClarification,
  shouldUsePendingPlanApprovalPath,
  shouldUseRevisionDraftPath,
} from "./conversationManagerLogic";
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
  preferenceConstraints?: string[];
}

export interface OrchestratorData {
  angles?: unknown[];
  plan?: StrategyPlan | null;
  draft?: string | null;
  supportAsset?: string | null;
  issuesFixed?: string[];
  quickReplies?: CreatorChatQuickReply[];
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
}

function normalizeHandleForContext(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/^@+/, "").toLowerCase();
  return normalized || null;
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
      const posts = await prisma.post.findMany({
        where: {
          userId: args.userId,
          ...(normalizedHandle ? { xHandle: normalizedHandle } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { text: true },
      });
      return posts.map((post) => post.text);
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
  const comparisonReference = inferComparisonReference(message);

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

function inferBroadTopicDraftRequest(message: string): string | null {
  const normalized = message.trim().toLowerCase();
  const isDraftRequest = [
    "write me a post",
    "write a post",
    "draft a post",
    "draft me a post",
    "make a post",
    "make me a post",
    "give me a post",
  ].some((cue) => normalized.includes(cue));

  if (!isDraftRequest) {
    return null;
  }

  const hasDirectionCue = [
    "in my voice",
    "my voice",
    "random",
    "whatever",
    "optimized for growth",
    "optimize it for growth",
    "optimize for growth",
    "for reach",
    "for engagement",
    "to grow",
    "viral",
    "hook",
    "hot take",
    "story",
    "lesson",
    "mistake",
    "opinion",
    "personal",
    "thread",
    "announcement",
    "launch",
    "tips",
    "how to",
    "why ",
    "vs ",
    "versus",
    "counter-",
    "contrarian",
  ].some((cue) => normalized.includes(cue));

  if (hasDirectionCue) {
    return null;
  }

  const topicMatch = message.match(/\b(?:about|on)\s+([a-z0-9][a-z0-9\s/&'’-]{1,80})$/i);
  const topic = topicMatch?.[1]?.trim().replace(/[.?!,]+$/, "").replace(/\s+/g, " ") || "";

  if (!topic) {
    return null;
  }

  const normalizedTopic = topic.toLowerCase();
  if (
    ["it", "this", "that", "something", "anything", "stuff"].includes(normalizedTopic) ||
    topic.split(/\s+/).length > 5
  ) {
    return null;
  }

  if (
    [
      "why ",
      "how ",
      "when ",
      "mistake",
      "lesson",
      "story",
      "hot take",
      "opinion",
      "tips",
      "launch",
      "announcement",
      "review",
      "breakdown",
    ].some((cue) => normalizedTopic.includes(cue))
  ) {
    return null;
  }

  return topic;
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
  } = input;
  const preloadedRun = runId ? await services.getOnboardingRun(runId) : null;
  const runInputRecord = preloadedRun?.input as Record<string, unknown> | undefined;
  const runInputHandle =
    typeof runInputRecord?.account === "string" ? runInputRecord.account : null;
  const effectiveXHandle =
    normalizeHandleForContext(xHandle) ??
    normalizeHandleForContext(runInputHandle) ??
    "default";

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

  const [styleCard, anchors, extractedRules, extractedFacts] = await Promise.all([
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
    rememberedFactCount = countNewMemoryEntries(
      styleCard.contextAnchors || [],
      extractedFacts,
    );
    styleCard.contextAnchors = Array.from(
      new Set([...(styleCard.contextAnchors || []), ...extractedFacts]),
    );
    services.saveStyleProfile(userId, effectiveXHandle, styleCard).catch((error) =>
      console.error("Failed to save style profile:", error),
    );
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

  const relevantTopicAnchors = retrieveRelevantContext({
    userMessage,
    topicSummary: memory.topicSummary,
    rollingSummary: memory.rollingSummary,
    topicAnchors: anchors.topicAnchors,
    contextAnchors: styleCard?.contextAnchors || [],
    activeConstraints: effectiveActiveConstraints,
  });

  const effectiveContext = buildEffectiveContext({
    recentHistory,
    rollingSummary: memory.rollingSummary,
    relevantTopicAnchors,
    contextAnchors: styleCard?.contextAnchors || [],
    activeConstraints: effectiveActiveConstraints,
  });
  const turnDraftContextSlots = evaluateDraftContextSlots({
    userMessage,
    topicSummary: memory.topicSummary,
    contextAnchors: styleCard?.contextAnchors || [],
  });
  const shouldForceNoFabricationGuardrailForTurn = shouldForceNoFabricationPlanGuardrail({
    userMessage,
    behaviorKnown: turnDraftContextSlots.behaviorKnown,
    stakesKnown: turnDraftContextSlots.stakesKnown,
  });

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
    styleCard && styleCard.contextAnchors?.length > 0
      ? `\n- Known Facts: ${styleCard.contextAnchors.join(" | ")}`
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
  const turnDraftPreference = inferDraftPreference(
    userMessage,
    memory.pendingPlan?.deliveryPreference || "balanced",
  );
  const requestedFormatPreference = inferDraftFormatPreference(
    userMessage,
    memory.pendingPlan?.formatPreference || memory.formatPreference || "shortform",
    formatPreference,
  );
  const turnFormatPreference = isVerifiedAccount
    ? requestedFormatPreference
    : "shortform";
  const maxCharacterLimit = getXCharacterLimitForFormat(
    isVerifiedAccount,
    turnFormatPreference,
  );
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
    topicSummary?: string | null;
    pendingPlan?: StrategyPlan | null;
    replyOverride?: string;
  }): Promise<RawOrchestratorResponse> {
    const clarification = buildClarificationTree({
      branchKey: args.branchKey,
      seedTopic: args.seedTopic,
      styleCard,
      topicAnchors: relevantTopicAnchors,
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

    if (branchKey === "entity_context_missing") {
      return {
        planMessage: `write a post about ${seedTopic}. factual grounding: ${groundedAnswer}`,
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

    return {
      planMessage: args.userMessage,
      activeConstraints: args.activeConstraints,
    };
  }

  async function generateDraftWithGroundingRetry(args: {
    plan: StrategyPlan;
    activeConstraints: string[];
    activeDraft?: string;
    sourceUserMessage?: string | null;
    draftPreference: DraftPreference;
    formatPreference: DraftFormatPreference;
    fallbackToWriterWhenCriticRejected: boolean;
    topicSummary?: string | null;
    pendingPlan?: StrategyPlan | null;
  }): Promise<
    | {
        kind: "success";
        writerOutput: WriterOutput;
        criticOutput: CriticOutput;
        draftToDeliver: string;
      }
    | {
        kind: "response";
        response: RawOrchestratorResponse;
      }
  > {
    const runAttempt = async (
      extraConstraints: string[] = [],
    ): Promise<{
      writerOutput: WriterOutput | null;
      criticOutput: CriticOutput | null;
      draftToDeliver: string | null;
    }> => {
      const attemptConstraints = Array.from(
        new Set([...args.activeConstraints, ...extraConstraints]),
      );
      const writerOutput = await services.generateDrafts(
        args.plan,
        styleCard,
        relevantTopicAnchors,
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
        },
      );

      if (!writerOutput) {
        return {
          writerOutput: null,
          criticOutput: null,
          draftToDeliver: null,
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
        },
      );

      if (!criticOutput) {
        return {
          writerOutput,
          criticOutput: null,
          draftToDeliver: null,
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

    const firstAssessment = assessConcreteSceneDrift({
      sourceUserMessage: args.sourceUserMessage,
      draft: firstAttempt.draftToDeliver,
    });

    if (!firstAssessment.hasDrift) {
      return {
        kind: "success",
        writerOutput: firstAttempt.writerOutput,
        criticOutput: firstAttempt.criticOutput,
        draftToDeliver: firstAttempt.draftToDeliver,
      };
    }

    const retryConstraint = buildConcreteSceneRetryConstraint(
      args.sourceUserMessage || "",
    );
    const secondAttempt = retryConstraint
      ? await runAttempt([retryConstraint])
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

    const secondAssessment = assessConcreteSceneDrift({
      sourceUserMessage: args.sourceUserMessage,
      draft: secondAttempt.draftToDeliver,
    });

    if (secondAssessment.hasDrift) {
      return {
        kind: "response",
        response: await returnClarificationQuestion({
          question: buildConcreteSceneClarificationQuestion(
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
      writerOutput: secondAttempt.writerOutput,
      criticOutput: secondAttempt.criticOutput,
      draftToDeliver: secondAttempt.draftToDeliver,
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
    shouldUsePendingPlanApprovalPath({
      mode,
      conversationState: memory.conversationState,
      hasPendingPlan: Boolean(memory.pendingPlan),
    }) &&
    memory.pendingPlan
  ) {
    const pendingPlanHasNoFabrication = hasNoFabricationPlanGuardrail(memory.pendingPlan);
    const draftActiveConstraints = pendingPlanHasNoFabrication
      ? appendNoFabricationConstraint(effectiveActiveConstraints)
      : effectiveActiveConstraints;
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
        fallbackToWriterWhenCriticRejected: false,
        topicSummary: approvedPlan.objective,
        pendingPlan: approvedPlan,
      });

      if (draftResult.kind === "response") {
        return draftResult.response;
      }

      const { writerOutput, criticOutput, draftToDeliver } = draftResult;

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

      const revisedPlanWithPreference = withPlanPreferences(
        revisedPlan,
        turnDraftPreference,
        memory.pendingPlan.formatPreference || turnFormatPreference,
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
  const hasEnoughContextToAct =
    memory.concreteAnswerCount >= 2 ||
    (memory.topicSummary && memory.pendingPlan) ||
    (memory.topicSummary && memory.concreteAnswerCount >= 1 && memory.assistantTurnCount >= 3);
  const canAskPlanClarification = (): boolean =>
    !explicitIntent &&
    !hasEnoughContextToAct &&
    mode === "plan" &&
    !hasOutstandingClarification;

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
      })
    ) {
      return returnClarificationTree({
        branchKey: "career_context_missing",
        seedTopic: inferBroadTopicDraftRequest(userMessage) || memory.topicSummary,
        isVerifiedAccount,
      });
    }

    if (turnDraftContextSlots.entityNeedsDefinition && turnDraftContextSlots.namedEntity) {
      return returnClarificationTree({
        branchKey: "entity_context_missing",
        seedTopic: turnDraftContextSlots.namedEntity,
      });
    }

    if (
      turnDraftContextSlots.isProductLike &&
      (!turnDraftContextSlots.behaviorKnown || !turnDraftContextSlots.stakesKnown)
    ) {
      const clarificationQuestion = inferMissingSpecificQuestion(userMessage);

      if (clarificationQuestion) {
        return returnClarificationQuestion({
          question: clarificationQuestion,
        });
      }
    }
  }

  if (canAskPlanClarification()) {
    const clarificationQuestion = inferMissingSpecificQuestion(userMessage);

    if (clarificationQuestion) {
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
      seedTopic: userMessage || memory.topicSummary,
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
      contextAnchors: styleCard?.contextAnchors || [],
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
      contextAnchors: styleCard?.contextAnchors || [],
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
    const plan = await services.generatePlan(
      clarificationAwarePlanInput.planMessage,
      memory.topicSummary,
      clarificationAwarePlanInput.activeConstraints,
      effectiveContext,
      activeDraft,
      {
        goal,
        conversationState: memory.conversationState,
        antiPatterns,
        draftPreference: turnDraftPreference,
        formatPreference: turnFormatPreference,
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

    const planWithPreference = withPlanPreferences(
      plan,
      turnDraftPreference,
      turnFormatPreference,
    );
    const guardedPlan = shouldForceNoFabricationGuardrailForTurn
      ? withNoFabricationPlanGuardrail(planWithPreference)
      : planWithPreference;
    const planActiveConstraints = clarificationAwarePlanInput.activeConstraints;

    // V3: Rough draft mode. When the turn planner forced draft (user said
    // "just write it" / "go ahead"), auto-approve the plan and proceed
    // directly to drafting instead of waiting for explicit approval.
    if (
      turnPlan?.userGoal === "draft" &&
      (hasEnoughContextToAct || turnPlan.shouldAutoDraftFromPlan === true)
    ) {
      const draftResult = await generateDraftWithGroundingRetry({
        plan: guardedPlan,
        activeConstraints: planActiveConstraints,
        activeDraft,
        sourceUserMessage: clarificationAwarePlanInput.planMessage,
        draftPreference: turnDraftPreference,
        formatPreference: turnFormatPreference,
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

      const { writerOutput, criticOutput, draftToDeliver: finalDraft } = draftResult;

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

    const revisionActiveConstraints = isConstraintDeclaration(userMessage)
      ? Array.from(new Set([...effectiveActiveConstraints, userMessage.trim()]))
      : effectiveActiveConstraints;

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
          previousDraft: effectiveActiveDraft,
          revisionChangeKind: revision.changeKind,
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

      const revisionWasRejectedByCritic = !criticOutput.approved;
      const finalizedRevisionDraft = revisionWasRejectedByCritic
        ? reviserOutput.revisedDraft
        : criticOutput.finalDraft;
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
      revisionActiveConstraints,
      effectiveContext,
      activeDraft,
      {
        goal,
        conversationState: memory.conversationState,
        antiPatterns,
        draftPreference: turnDraftPreference,
        formatPreference: turnFormatPreference,
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

    const planWithPreference = withPlanPreferences(
      plan,
      turnDraftPreference,
      turnFormatPreference,
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
      fallbackToWriterWhenCriticRejected: false,
      topicSummary: guardedPlan.objective,
    });

    if (draftResult.kind === "response") {
      return draftResult.response;
    }

    const { writerOutput, criticOutput, draftToDeliver } = draftResult;

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

  return finalizeOrchestratorResponse(rawResponse);
}
