import { classifyIntent } from "../agents/classifier";
import { generateCoachReply } from "../agents/coach";
import { generatePlan } from "../agents/planner";
import { generateIdeasMenu } from "../agents/ideator";
import { generateDrafts } from "../agents/writer";
import { critiqueDrafts } from "../agents/critic";
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
  buildSemanticRepairDirective,
  buildSemanticRepairState,
  inferCorrectionRepairQuestion,
  inferSourceTransparencyReply,
  looksLikeSemanticCorrection,
} from "./correctionRepair";
import { normalizeDraftRevisionInstruction } from "./draftRevision";
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
import type {
  CreatorChatQuickReply,
  DraftFormatPreference,
  DraftPreference,
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
  data?: OrchestratorData;
  memory: V2ConversationMemory;
};

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
  getHistoricalPosts: (userId: string) => Promise<string[]>;
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
    async getHistoricalPosts(userId: string) {
      const posts = await prisma.post.findMany({
        where: { userId },
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

const NO_FABRICATION_CONSTRAINT =
  "Factual guardrail: do not invent personal anecdotes, offline events, timelines, or named places. If facts are missing, use opinion/framework language instead.";
const NO_FABRICATION_MUST_AVOID =
  "Invented personal anecdotes, offline events, timelines, or named places that were not explicitly provided by the user.";

function isRandomizedDraftRequest(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return [
    "random post",
    "give me a random post",
    "give me a random post i would use",
    "write me a random post",
    "draft me a random post",
    "write anything",
    "just write anything",
    "whatever works",
    "anything is fine",
    "idk just write it",
  ].some((candidate) => normalized.includes(candidate));
}

function hasNoFabricationPlanGuardrail(plan: StrategyPlan | null | undefined): boolean {
  if (!plan) {
    return false;
  }

  return [...plan.mustAvoid, ...plan.mustInclude, plan.angle, plan.objective].some(
    (entry) =>
      /(factual guardrail|invent(?:ed|ing)? personal anecdote|fabricat(?:ed|ing)|offline event|named place|timeline)/i.test(
        entry,
      ),
  );
}

function withNoFabricationPlanGuardrail(plan: StrategyPlan): StrategyPlan {
  if (hasNoFabricationPlanGuardrail(plan)) {
    return plan;
  }

  return {
    ...plan,
    mustAvoid: Array.from(new Set([...plan.mustAvoid, NO_FABRICATION_MUST_AVOID])),
  };
}

function appendNoFabricationConstraint(activeConstraints: string[]): string[] {
  if (activeConstraints.some((constraint) => constraint === NO_FABRICATION_CONSTRAINT)) {
    return activeConstraints;
  }

  return [...activeConstraints, NO_FABRICATION_CONSTRAINT];
}

function shouldForceNoFabricationPlanGuardrail(args: {
  userMessage: string;
  behaviorKnown: boolean;
  stakesKnown: boolean;
}): boolean {
  if (!isRandomizedDraftRequest(args.userMessage)) {
    return false;
  }

  return !args.behaviorKnown || !args.stakesKnown;
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
    return "quick check: when you say ampm, do you mean the downtown toronto club, the convenience store brand, or am/pm as time of day?";
  }

  return `quick check: when you say ${reference}, what exactly are you referring to in this post?`;
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

function isDraftMeaningQuestion(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return [
    "what does this mean",
    "what does this even mean",
    "what does that mean",
    "what does that even mean",
    "what does this tweet mean",
    "what does that tweet mean",
    "what does this post mean",
    "what does that post mean",
    "what does this draft mean",
    "what does that draft mean",
    "what did you mean",
    "what do you mean",
    "what were you trying to say",
    "explain this",
    "explain that",
    "explain the draft",
    "explain the tweet",
  ].some((cue) => normalized.includes(cue));
}

function buildDraftMeaningResponse(draft: string): string {
  const normalizedDraft = draft.trim().replace(/\s+/g, " ");
  if (!normalizedDraft) {
    return "fair question. tell me the exact line that's unclear and i'll rewrite it plainly.";
  }

  const lower = normalizedDraft.toLowerCase();

  if (lower.includes(" vs ") || lower.includes("versus")) {
    return "it's contrasting your public-facing persona with what you actually felt in that moment. if you want, i can rewrite it in cleaner language.";
  }

  if (/\bbut\b/.test(lower)) {
    return "it's saying there's a gap between what you posted publicly and what you actually felt. if you want, i can rewrite it more clearly.";
  }

  return `it's trying to say: ${normalizedDraft}. if you want, i can rewrite it in clearer language.`;
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
        "this direction feels strongest",
        "here's the cleanest angle for this",
        "this is how i'd run with it",
        "this framing should land best",
        "this direction gives you the clearest payoff",
      ].map((entry) => toLead(entry)),
      seed,
    );

  const angleLine = toSentence(plan.angle);
  const objectiveLine = toSentence(plan.objective);
  const close = pickDeterministic(
    [
      "want me to draft this as-is, or tweak the angle first?",
      "does this direction feel right, or should i adjust it before drafting?",
      "if this lands, i can draft it now - or we can tweak it first.",
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
    activeConstraints: patch.activeConstraints ?? current.activeConstraints,
    pendingPlan:
      patch.pendingPlan === undefined ? current.pendingPlan : patch.pendingPlan,
    clarificationState:
      patch.clarificationState === undefined
        ? current.clarificationState
        : patch.clarificationState,
    rollingSummary:
      patch.rollingSummary === undefined ? current.rollingSummary : patch.rollingSummary,
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
  const effectiveXHandle = xHandle || "default";

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

  let classification;
  if (!explicitIntent) {
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
  const feedbackMemoryNotice = buildFeedbackMemoryNotice({
    styleCard,
    rememberedStyleRuleCount,
    rememberedFactCount,
    rememberedAntiPattern: antiPatternResult.remembered,
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

  const storedRun = await services.getOnboardingRun(runId);
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
      formatPreference: patch.formatPreference,
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
      formatPreference: patch.formatPreference,
    });

    memory = updated
      ? createConversationMemorySnapshot(updated as unknown as Record<string, unknown>)
      : optimistic;
  };

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
      const historicalTexts = await services.getHistoricalPosts(userId);

      const writerOutput = await services.generateDrafts(
        approvedPlan,
        styleCard,
        relevantTopicAnchors,
        draftActiveConstraints,
        effectiveContext,
        activeDraft,
        {
          conversationState: memory.conversationState,
          antiPatterns,
          maxCharacterLimit,
          goal,
          draftPreference: approvedPlan.deliveryPreference || turnDraftPreference,
          formatPreference: approvedPlan.formatPreference || turnFormatPreference,
        },
      );

      if (!writerOutput) {
        return {
          mode: "error",
          outputShape: "coach_question",
          response: "Failed to write draft.",
          memory,
        };
      }

      const criticOutput = await services.critiqueDrafts(
        writerOutput,
        draftActiveConstraints,
        styleCard,
        {
          maxCharacterLimit,
          draftPreference: approvedPlan.deliveryPreference || turnDraftPreference,
          formatPreference: approvedPlan.formatPreference || turnFormatPreference,
        },
      );

      if (!criticOutput) {
        return {
          mode: "error",
          outputShape: "coach_question",
          response: "Failed to critique draft.",
          memory,
        };
      }

      const noveltyCheck = services.checkDeterministicNovelty(
        criticOutput.finalDraft,
        historicalTexts,
      );
      if (!noveltyCheck.isNovel) {
        const clarification = buildClarificationTree({
          branchKey: "plan_reject",
          seedTopic: approvedPlan.objective,
          styleCard,
          topicAnchors: relevantTopicAnchors,
        });

        await writeMemory({
          conversationState: "needs_more_context",
          pendingPlan: null,
          clarificationState: clarification.clarificationState,
          assistantTurnCount: nextAssistantTurnCount,
        });

        return {
          mode: "coach",
          outputShape: "coach_question",
          response: prependFeedbackMemoryNotice(
            "this version felt too close to something you've already posted. let's shift it.",
            feedbackMemoryNotice,
          ),
          data: { quickReplies: clarification.quickReplies },
          memory,
        };
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
          draft: criticOutput.finalDraft,
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
      const clarification = buildClarificationTree({
        branchKey: "plan_reject",
        seedTopic: memory.pendingPlan.objective,
        styleCard,
        topicAnchors: relevantTopicAnchors,
      });

      await writeMemory({
        conversationState: "needs_more_context",
        pendingPlan: null,
        clarificationState: clarification.clarificationState,
        assistantTurnCount: nextAssistantTurnCount,
      });

      return {
        mode: "coach",
        outputShape: "coach_question",
        response: prependFeedbackMemoryNotice(
          clarification.reply,
          feedbackMemoryNotice,
        ),
        data: {
          quickReplies: clarification.quickReplies,
        },
        memory,
      };
    }

    await writeMemory({
        conversationState: "plan_pending_approval",
        pendingPlan: memory.pendingPlan,
        assistantTurnCount: nextAssistantTurnCount,
        formatPreference: memory.pendingPlan.formatPreference || turnFormatPreference,
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

  if (
    !explicitIntent &&
    mode === "plan"
  ) {
    if (
      turnDraftContextSlots.ambiguousReferenceNeedsClarification &&
      turnDraftContextSlots.ambiguousReference
    ) {
      await writeMemory({
        conversationState: "needs_more_context",
        clarificationState: null,
        assistantTurnCount: nextAssistantTurnCount,
      });

      return {
        mode: "coach",
        outputShape: "coach_question",
        response: prependFeedbackMemoryNotice(
          buildAmbiguousReferenceQuestion(
            turnDraftContextSlots.ambiguousReference,
          ),
          feedbackMemoryNotice,
        ),
        memory,
      };
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
      const clarification = buildClarificationTree({
        branchKey: "career_context_missing",
        seedTopic: inferBroadTopicDraftRequest(userMessage) || memory.topicSummary,
        styleCard,
        topicAnchors: relevantTopicAnchors,
        isVerifiedAccount,
      });

      await writeMemory({
        conversationState: "needs_more_context",
        clarificationState: clarification.clarificationState,
        assistantTurnCount: nextAssistantTurnCount,
      });

      return {
        mode: "coach",
        outputShape: "coach_question",
        response: prependFeedbackMemoryNotice(
          clarification.reply,
          feedbackMemoryNotice,
        ),
        data: {
          quickReplies: clarification.quickReplies,
        },
        memory,
      };
    }

    if (turnDraftContextSlots.entityNeedsDefinition && turnDraftContextSlots.namedEntity) {
      const clarification = buildClarificationTree({
        branchKey: "entity_context_missing",
        seedTopic: turnDraftContextSlots.namedEntity,
        styleCard,
        topicAnchors: relevantTopicAnchors,
      });

      await writeMemory({
        conversationState: "needs_more_context",
        clarificationState: clarification.clarificationState,
        assistantTurnCount: nextAssistantTurnCount,
      });

      return {
        mode: "coach",
        outputShape: "coach_question",
        response: prependFeedbackMemoryNotice(
          clarification.reply,
          feedbackMemoryNotice,
        ),
        memory,
      };
    }

    if (
      turnDraftContextSlots.isProductLike &&
      (!turnDraftContextSlots.behaviorKnown || !turnDraftContextSlots.stakesKnown)
    ) {
      const clarificationQuestion = inferMissingSpecificQuestion(userMessage);

      if (clarificationQuestion) {
        await writeMemory({
          conversationState: "needs_more_context",
          clarificationState: null,
          assistantTurnCount: nextAssistantTurnCount,
        });

        return {
          mode: "coach",
          outputShape: "coach_question",
          response: prependFeedbackMemoryNotice(
            clarificationQuestion,
            feedbackMemoryNotice,
          ),
          memory,
        };
      }
    }
  }

  if (
    !explicitIntent &&
    mode === "plan"
  ) {
    const clarificationQuestion = inferMissingSpecificQuestion(userMessage);

    if (clarificationQuestion) {
      await writeMemory({
        conversationState: "needs_more_context",
        clarificationState: null,
        assistantTurnCount: nextAssistantTurnCount,
      });

      return {
        mode: "coach",
        outputShape: "coach_question",
        response: prependFeedbackMemoryNotice(
          clarificationQuestion,
          feedbackMemoryNotice,
        ),
        memory,
      };
    }
  }

  if (!explicitIntent && mode === "plan") {
    const broadTopic = inferBroadTopicDraftRequest(userMessage);

    if (broadTopic) {
      const clarification = buildClarificationTree({
        branchKey: "topic_known_but_direction_missing",
        seedTopic: broadTopic,
        styleCard,
        topicAnchors: relevantTopicAnchors,
        isVerifiedAccount,
      });

      await writeMemory({
        topicSummary: broadTopic,
        conversationState: "needs_more_context",
        clarificationState: clarification.clarificationState,
        assistantTurnCount: nextAssistantTurnCount,
      });

      return {
        mode: "coach",
        outputShape: "coach_question",
        response: prependFeedbackMemoryNotice(
          clarification.reply,
          feedbackMemoryNotice,
        ),
        data: {
          quickReplies: clarification.quickReplies,
        },
        memory,
      };
    }
  }

  if (
    !explicitIntent &&
    mode === "plan" &&
    isBareDraftRequest(userMessage)
  ) {
    const clarification = buildClarificationTree({
      branchKey: isLazyDraftRequest(userMessage)
        ? "lazy_request"
        : "vague_draft_request",
      seedTopic: null,
      styleCard,
      topicAnchors: relevantTopicAnchors,
      isVerifiedAccount,
    });

    await writeMemory({
      conversationState: "needs_more_context",
      clarificationState: clarification.clarificationState,
      assistantTurnCount: nextAssistantTurnCount,
    });

    return {
      mode: "coach",
      outputShape: "coach_question",
      response: prependFeedbackMemoryNotice(
        clarification.reply,
        feedbackMemoryNotice,
      ),
      data: {
        quickReplies: clarification.quickReplies,
      },
      memory,
    };
  }

  if (
    !explicitIntent &&
    mode === "plan" &&
    !memory.topicSummary &&
    memory.concreteAnswerCount < 2 &&
    classification.confidence < 0.7
  ) {
    const branchKey = isLazyDraftRequest(userMessage)
      ? "lazy_request"
      : "vague_draft_request";
    const clarification = buildClarificationTree({
      branchKey,
      seedTopic: userMessage || memory.topicSummary,
      styleCard,
      topicAnchors: relevantTopicAnchors,
    });

    await writeMemory({
      conversationState: "needs_more_context",
      clarificationState: clarification.clarificationState,
      assistantTurnCount: nextAssistantTurnCount,
    });

    return {
      mode: "coach",
      outputShape: "coach_question",
      response: prependFeedbackMemoryNotice(
        clarification.reply,
        feedbackMemoryNotice,
      ),
      data: {
        quickReplies: clarification.quickReplies,
      },
      memory,
    };
  }

  if (!explicitIntent && mode === "plan") {
    const abstractTopicSeed = inferAbstractTopicSeed(userMessage, memory);

    if (abstractTopicSeed) {
      const clarification = buildClarificationTree({
        branchKey: "abstract_topic_focus_pick",
        seedTopic: abstractTopicSeed,
        styleCard,
        topicAnchors: relevantTopicAnchors,
      });

      await writeMemory({
        topicSummary: abstractTopicSeed,
        conversationState: "needs_more_context",
        clarificationState: clarification.clarificationState,
        assistantTurnCount: nextAssistantTurnCount,
      });

      return {
        mode: "coach",
        outputShape: "coach_question",
        response: prependFeedbackMemoryNotice(
          clarification.reply,
          feedbackMemoryNotice,
        ),
        data: {
          quickReplies: clarification.quickReplies,
        },
        memory,
      };
    }
  }

  if (!explicitIntent && activeDraft) {
    const sourceTransparencyReply = inferSourceTransparencyReply({
      userMessage,
      activeDraft,
      recentHistory,
      contextAnchors: styleCard?.contextAnchors || [],
    });

    if (sourceTransparencyReply) {
      await writeMemory({
        conversationState:
          memory.conversationState === "draft_ready" ? "draft_ready" : "needs_more_context",
        clarificationState: null,
        assistantTurnCount: nextAssistantTurnCount,
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
      });

      mode = "edit";
      draftInstruction = repairDirective.rewriteRequest;
    }
  }

  switch (mode) {
    case "ideate": {
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

      const currentTopicSummary = looksGenericTopicSummary(memory.topicSummary)
        ? null
        : memory.topicSummary;
      const nextIdeationTopicSummary = isBareIdeationRequest(userMessage)
        ? currentTopicSummary
        : userMessage;

      await writeMemory({
        ...(nextIdeationTopicSummary !== memory.topicSummary
          ? { topicSummary: nextIdeationTopicSummary }
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

    case "plan": {
      const plan = await services.generatePlan(
        userMessage,
        memory.topicSummary,
        effectiveActiveConstraints,
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

      await writeMemory({
        topicSummary: guardedPlan.objective,
        conversationState: "plan_pending_approval",
        pendingPlan: guardedPlan,
        clarificationState: null,
        assistantTurnCount: nextAssistantTurnCount,
        formatPreference: guardedPlan.formatPreference || turnFormatPreference,
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

    case "draft":
    case "review":
    case "edit": {
      if (shouldUseRevisionDraftPath({ mode, activeDraft }) && activeDraft) {
        const revision = normalizeDraftRevisionInstruction(
          draftInstruction,
          activeDraft,
        );
        const reviserOutput = await services.generateRevisionDraft({
          activeDraft,
          revision,
          styleCard,
          topicAnchors: relevantTopicAnchors,
          activeConstraints: effectiveActiveConstraints,
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
          effectiveActiveConstraints,
          styleCard,
          {
            maxCharacterLimit,
            draftPreference: turnDraftPreference,
            formatPreference: turnFormatPreference,
            previousDraft: activeDraft,
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
              activeConstraints: effectiveActiveConstraints,
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
          pendingPlan: null,
          clarificationState: null,
          rollingSummary,
          assistantTurnCount: nextAssistantTurnCount,
          formatPreference: turnFormatPreference,
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

      const historicalTexts = await services.getHistoricalPosts(userId);

      const plan = await services.generatePlan(
        draftInstruction,
        memory.topicSummary,
        effectiveActiveConstraints,
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
        ? appendNoFabricationConstraint(effectiveActiveConstraints)
        : effectiveActiveConstraints;

      const writerOutput = await services.generateDrafts(
        guardedPlan,
        styleCard,
        relevantTopicAnchors,
        draftActiveConstraints,
        effectiveContext,
        activeDraft,
        {
          conversationState: memory.conversationState,
          antiPatterns,
          maxCharacterLimit,
          goal,
          draftPreference: guardedPlan.deliveryPreference || turnDraftPreference,
          formatPreference: guardedPlan.formatPreference || turnFormatPreference,
        },
      );

      if (!writerOutput) {
        return {
          mode: "error",
          outputShape: "coach_question",
          response: "Failed to write draft.",
          memory,
        };
      }

      const criticOutput = await services.critiqueDrafts(
        writerOutput,
        draftActiveConstraints,
        styleCard,
        {
          maxCharacterLimit,
          draftPreference: guardedPlan.deliveryPreference || turnDraftPreference,
          formatPreference: guardedPlan.formatPreference || turnFormatPreference,
        },
      );

      if (!criticOutput) {
        return {
          mode: "error",
          outputShape: "coach_question",
          response: "Failed to critique draft.",
          memory,
        };
      }

      const noveltyCheck = services.checkDeterministicNovelty(
        criticOutput.finalDraft,
        historicalTexts,
      );
      if (!noveltyCheck.isNovel) {
        const clarification = buildClarificationTree({
          branchKey: "plan_reject",
          seedTopic: plan.objective,
          styleCard,
          topicAnchors: relevantTopicAnchors,
        });

        await writeMemory({
          conversationState: "needs_more_context",
          pendingPlan: null,
          clarificationState: clarification.clarificationState,
          assistantTurnCount: nextAssistantTurnCount,
        });

        return {
          mode: "coach",
          outputShape: "coach_question",
          response: prependFeedbackMemoryNotice(
            "that version felt too close to something you've already posted. let's shift it.",
            feedbackMemoryNotice,
          ),
          data: {
            quickReplies: clarification.quickReplies,
          },
          memory,
        };
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
          draft: criticOutput.finalDraft,
          supportAsset: writerOutput.supportAsset,
          issuesFixed: criticOutput.issues,
        },
        memory,
      };
    }

    case "coach":
    case "answer_question":
    default: {
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
      });

      return {
        mode: "coach",
        outputShape: "coach_question",
        response: prependFeedbackMemoryNotice(
          coachReply?.response ||
            "what's on your mind? i can help you draft, ideate, or figure out what to post.",
          feedbackMemoryNotice,
        ),
        memory,
      };
    }
  }
}
