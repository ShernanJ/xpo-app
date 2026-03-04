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
import {
  buildSemanticRepairDirective,
  buildSemanticRepairState,
  inferCorrectionRepairQuestion,
} from "./correctionRepair";
import { normalizeDraftRevisionInstruction } from "./draftRevision";
import { buildDraftReply } from "./draftReply";
import { interpretPlannerFeedback } from "./plannerFeedback";
import {
  buildComparisonRelationshipQuestion,
  buildProblemStakeQuestion,
  buildProductCapabilityQuestion,
} from "./assistantReplyStyle";
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

function isBareDraftRequest(message: string): boolean {
  const normalized = message.trim().toLowerCase().replace(/[.?!,]+$/, "");
  return [
    "write me a post",
    "write a post for me",
    "write me a post for me",
    "draft a post",
    "draft a post for me",
    "draft me a post",
    "make a post",
    "make me a post",
    "give me a post",
    "give me a post to use",
    "give me a random post",
  ].includes(normalized);
}

function inferComparisonReference(message: string): string | null {
  const rebuildMatch = message.match(
    /\brebuild(?:ing)?\s+([a-z0-9][a-z0-9\s'-]{1,30}?)(?:\s+but\s+for|\s+for)\b/i,
  );
  if (rebuildMatch?.[1]) {
    return rebuildMatch[1].trim().replace(/[.,!?]+$/, "");
  }

  const likeMatch = message.match(
    /\blike\s+([a-z0-9][a-z0-9\s'-]{1,30}?)(?:\s+but\s+for|\s+for)\b/i,
  );
  if (likeMatch?.[1]) {
    return likeMatch[1].trim().replace(/[.,!?]+$/, "");
  }

  return null;
}

function hasFunctionalDetail(normalized: string): boolean {
  return [
    "it helps",
    "it does",
    "it lets",
    "it converts",
    "it turns",
    "it rewrites",
    "it automates",
    "it syncs",
    "it takes",
    "it pulls",
    "that helps",
    "that converts",
    "that turns",
    "to help",
    "to convert",
    "to turn",
    "to rewrite",
    "works for",
    "works with",
    "because",
  ].some((cue) => normalized.includes(cue));
}

function hasProblemDetail(normalized: string): boolean {
  return [
    "because",
    "so that",
    "so you can",
    "which means",
    "the problem",
    "the issue",
    "pain",
    "friction",
    "slow",
    "clunky",
    "manual",
    "doesn't",
    "doesnt",
    "hard",
    "different writing styles",
    "different styles",
    "different culture",
    "doesn't work",
    "doesnt work",
    "falls flat",
    "too long",
    "too polished",
  ].some((cue) => normalized.includes(cue));
}

function hasRelationshipDetail(normalized: string): boolean {
  return [
    "extension",
    "plugin",
    "works for",
    "works with",
    "alongside",
    "on top of",
    "inside",
    "after stanley",
    "after it writes",
    "after it generates",
    "generated by",
    "created by",
    "takes the",
    "uses the",
    "from stanley",
    "for stanley",
  ].some((cue) => normalized.includes(cue));
}

function looksLikeBuildMessage(normalized: string): boolean {
  return (
    ["building", "making", "creating", "shipping", "rebuilding"].some((cue) =>
      normalized.includes(cue),
    ) &&
    ["tool", "app", "product", "extension", "plugin"].some((cue) =>
      normalized.includes(cue),
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

function inferNamedEntity(message: string): string | null {
  const cleanCandidate = (value: string | undefined): string | null => {
    const candidate = value?.trim().replace(/[.?!,]+$/, "") || "";
    if (!candidate) {
      return null;
    }

    const normalized = candidate.toLowerCase();
    const weakSeeds = new Set([
      "me",
      "myself",
      "my",
      "i",
      "it",
      "this",
      "that",
      "what",
      "something",
      "someone",
      "anything",
      "everything",
      "my thing",
    ]);

    if (
      weakSeeds.has(normalized) ||
      normalized.startsWith("my ") ||
      normalized.startsWith("me ") ||
      normalized.includes(" for ") ||
      normalized.includes(" with ") ||
      normalized.includes(" using ")
    ) {
      return null;
    }

    return candidate;
  };

  const productLinkedMatch = message.match(
    /\b(?:extension|plugin|tool|app|product)\s+(?:for|with|using)\s+([a-z0-9][a-z0-9\s'-]{1,30})/i,
  );
  const comparisonMatch = message.match(
    /\b(?:like|alongside)\s+([a-z0-9][a-z0-9\s'-]{1,30})/i,
  );
  const genericMatch = message.match(
    /\b(?:for|with|using)\s+([a-z0-9][a-z0-9\s'-]{1,30})/i,
  );

  return (
    cleanCandidate(productLinkedMatch?.[1]) ||
    cleanCandidate(comparisonMatch?.[1]) ||
    cleanCandidate(genericMatch?.[1])
  );
}

function evaluateDraftContextSlots(args: {
  userMessage: string;
  topicSummary: string | null;
  contextAnchors: string[];
}): {
  subjectKnown: boolean;
  behaviorKnown: boolean;
  stakesKnown: boolean;
  externalContextKnown: boolean;
  namedEntity: string | null;
  isProductLike: boolean;
} {
  const trimmed = args.userMessage.trim();
  const normalized = trimmed.toLowerCase();
  const namedEntity = inferNamedEntity(trimmed);
  const hasProductCue = ["tool", "app", "product", "extension", "plugin"].some((cue) =>
    normalized.includes(cue),
  );
  const looksLikeComparison = Boolean(inferComparisonReference(trimmed));
  const isProductLike =
    looksLikeBuildMessage(normalized) ||
    hasProductCue ||
    (Boolean(namedEntity) && looksLikeComparison) ||
    (Boolean(namedEntity) && hasRelationshipDetail(normalized));
  const subjectKnown = Boolean((args.topicSummary || trimmed).trim());
  const behaviorKnown = hasFunctionalDetail(normalized);
  const stakesKnown = hasProblemDetail(normalized);
  const externalContextKnown =
    !namedEntity ||
    normalized.includes(`${namedEntity.toLowerCase()} is`) ||
    args.contextAnchors.some((anchor) =>
      anchor.toLowerCase().includes(namedEntity.toLowerCase()),
    );

  return {
    subjectKnown,
    behaviorKnown,
    stakesKnown,
    externalContextKnown,
    namedEntity,
    isProductLike,
  };
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

  const angleLine = toSentence(plan.angle);
  const objectiveLine = toSentence(plan.objective);

  if (angleLine && objectiveLine && angleLine !== objectiveLine) {
    return `i'd frame it like this:\n\n${angleLine}\n\n${objectiveLine}`;
  }

  if (angleLine) {
    return `i'd frame it like this:\n\n${angleLine}`;
  }

  if (objectiveLine) {
    return `i'd frame it like this:\n\n${objectiveLine}`;
  }

  return "i'd frame it like this.";
}

function resolveDraftOutputShape(
  formatPreference: DraftFormatPreference,
): V2ChatOutputShape {
  return formatPreference === "longform" ? "long_form_post" : "short_form_post";
}

function buildPlanQuickReplies(): CreatorChatQuickReply[] {
  return [
    {
      kind: "planner_action",
      value: "looks good, write it",
      label: "Looks good",
      explicitIntent: "planner_feedback",
    },
    {
      kind: "planner_action",
      value: "make it tighter and more blunt",
      label: "Tighten it",
      explicitIntent: "planner_feedback",
    },
    {
      kind: "planner_action",
      value: "different angle",
      label: "Different angle",
      explicitIntent: "planner_feedback",
    },
  ];
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
}): Promise<string[]> {
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
    return currentGuidance;
  }

  const extracted = await extractAntiPattern(
    args.userMessage,
    args.activeDraft,
    args.recentHistory,
  );

  if (!extracted?.shouldCapture || extracted.patternTags.length === 0) {
    return currentGuidance;
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
  saveStyleProfile(args.userId, args.xHandle, args.styleCard).catch((error) =>
    console.error("Failed to save anti-pattern guidance:", error),
  );

  return nextAntiExamples
    .slice(-2)
    .map((example) => example.guidance.trim())
    .filter(Boolean);
}

/**
 * The V2 state machine.
 */
export async function manageConversationTurn(
  input: OrchestratorInput,
): Promise<OrchestratorResponse> {
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

  let memoryRecord = await getConversationMemory({ runId, threadId });
  if (!memoryRecord) {
    memoryRecord = await createConversationMemory({
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
    classification = await classifyIntent(userMessage, recentHistory);
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
    const updated = await updateConversationMemory({
      runId,
      threadId,
      activeConstraints: nextConstraints,
    });
    memory = createConversationMemorySnapshot(updated as unknown as Record<string, unknown>);
  }

  let mode = classification.intent;

  if (
    !explicitIntent &&
    ["hello", "hi", "help me grow", "i want to grow"].includes(
      userMessage.toLowerCase().trim(),
    )
  ) {
    mode = "coach";
  }

  if (!explicitIntent && mode === "draft" && !activeDraft) {
    mode = "plan";
  }

  const [styleCard, anchors, extractedRules, extractedFacts] = await Promise.all([
    generateStyleProfile(userId, effectiveXHandle, 20),
    retrieveAnchors(userId, effectiveXHandle, userMessage || memory.topicSummary || "growth"),
    userId !== "anonymous" ? extractStyleRules(userMessage, recentHistory) : Promise.resolve(null),
    userId !== "anonymous" ? extractCoreFacts(userMessage, recentHistory) : Promise.resolve(null),
  ]);

  if (styleCard && extractedRules && extractedRules.length > 0) {
    styleCard.customGuidelines = Array.from(
      new Set([...(styleCard.customGuidelines || []), ...extractedRules]),
    );
    saveStyleProfile(userId, effectiveXHandle, styleCard).catch((error) =>
      console.error("Failed to save style profile:", error),
    );
  }

  if (styleCard && extractedFacts && extractedFacts.length > 0) {
    styleCard.contextAnchors = Array.from(
      new Set([...(styleCard.contextAnchors || []), ...extractedFacts]),
    );
    saveStyleProfile(userId, effectiveXHandle, styleCard).catch((error) =>
      console.error("Failed to save style profile:", error),
    );
  }

  const antiPatterns = await maybeCaptureAntiPattern({
    userId,
    userMessage,
    activeDraft,
    recentHistory,
    styleCard,
    xHandle: effectiveXHandle,
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

  const storedRun = await prisma.onboardingRun.findUnique({ where: { id: runId } });
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

    const updated = await updateConversationMemory({
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

  if (
    mode === "planner_feedback" &&
    memory.conversationState === "plan_pending_approval" &&
    memory.pendingPlan
  ) {
    const decision = await interpretPlannerFeedback(userMessage, memory.pendingPlan);

    if (decision === "approve") {
      const approvedPlan = memory.pendingPlan;
      const pastPosts = await prisma.post.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { text: true },
      });
      const historicalTexts = pastPosts.map((post) => post.text);

      const writerOutput = await generateDrafts(
        approvedPlan,
        styleCard,
        relevantTopicAnchors,
        effectiveActiveConstraints,
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

      const criticOutput = await critiqueDrafts(
        writerOutput,
        effectiveActiveConstraints,
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

      const noveltyCheck = checkDeterministicNovelty(
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
          response:
            "this version felt too close to something you've already posted. let's shift it.",
          data: { quickReplies: clarification.quickReplies },
          memory,
        };
      }

      const rollingSummary = buildRollingSummary({
        currentSummary: memory.rollingSummary,
        topicSummary: approvedPlan.objective,
        approvedPlan,
        activeConstraints: effectiveActiveConstraints,
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
        response: buildDraftReply({
          userMessage,
          draftPreference: approvedPlan.deliveryPreference || turnDraftPreference,
          isEdit: Boolean(activeDraft),
          issuesFixed: criticOutput.issues,
        }),
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

      const revisedPlan = await generatePlan(
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

      await writeMemory({
        topicSummary: revisedPlanWithPreference.objective,
        conversationState: "plan_pending_approval",
        pendingPlan: revisedPlanWithPreference,
        clarificationState: null,
        assistantTurnCount: nextAssistantTurnCount,
        formatPreference:
          revisedPlanWithPreference.formatPreference || turnFormatPreference,
      });

      return {
        mode: "plan",
        outputShape: "planning_outline",
        response: buildPlanPitch(revisedPlanWithPreference),
        data: {
          plan: revisedPlanWithPreference,
          quickReplies: buildPlanQuickReplies(),
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
        response: clarification.reply,
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
      response: "say the word and i'll draft it, or tell me what to tweak.",
      data: {
        plan: memory.pendingPlan,
        quickReplies: buildPlanQuickReplies(),
      },
      memory,
    };
  }

  if (
    !explicitIntent &&
    mode === "plan"
  ) {
    const contextSlots = evaluateDraftContextSlots({
      userMessage,
      topicSummary: memory.topicSummary,
      contextAnchors: styleCard?.contextAnchors || [],
    });

    if (
      contextSlots.isProductLike &&
      contextSlots.namedEntity &&
      !contextSlots.externalContextKnown
    ) {
      const clarification = buildClarificationTree({
        branchKey: "entity_context_missing",
        seedTopic: contextSlots.namedEntity,
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
        response: clarification.reply,
        memory,
      };
    }

    if (
      contextSlots.isProductLike &&
      (!contextSlots.behaviorKnown || !contextSlots.stakesKnown)
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
          response: clarificationQuestion,
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
        response: clarificationQuestion,
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
        response: clarification.reply,
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
      response: clarification.reply,
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
      response: clarification.reply,
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
        response: clarification.reply,
        data: {
          quickReplies: clarification.quickReplies,
        },
        memory,
      };
    }
  }

  if (!explicitIntent && activeDraft) {
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
        response: correctionRepairQuestion,
        memory,
      };
    }
  }

  switch (mode) {
    case "ideate": {
      const ideas = await generateIdeasMenu(
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

      await writeMemory({
        topicSummary: userMessage,
        conversationState: "ready_to_ideate",
        clarificationState: null,
        assistantTurnCount: nextAssistantTurnCount,
        rollingSummary: shouldRefreshRollingSummary(nextAssistantTurnCount, false)
          ? buildRollingSummary({
              currentSummary: memory.rollingSummary,
              topicSummary: userMessage,
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
        response: ideas?.close || "here are a few angles — which one feels right?",
        data: ideas ? { angles: ideas.angles } : undefined,
        memory,
      };
    }

    case "plan": {
      const plan = await generatePlan(
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

      await writeMemory({
        topicSummary: planWithPreference.objective,
        conversationState: "plan_pending_approval",
        pendingPlan: planWithPreference,
        clarificationState: null,
        assistantTurnCount: nextAssistantTurnCount,
        formatPreference: planWithPreference.formatPreference || turnFormatPreference,
      });

      return {
        mode: "plan",
        outputShape: "planning_outline",
        response: buildPlanPitch(planWithPreference),
        data: {
          plan: planWithPreference,
          quickReplies: buildPlanQuickReplies(),
        },
        memory,
      };
    }

    case "draft":
    case "review":
    case "edit": {
      if (activeDraft && (mode === "review" || mode === "edit")) {
        const revision = normalizeDraftRevisionInstruction(
          draftInstruction,
          activeDraft,
        );
        const reviserOutput = await generateRevisionDraft({
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

        const criticOutput = await critiqueDrafts(
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
          response: buildDraftReply({
            userMessage,
            draftPreference: turnDraftPreference,
            isEdit: true,
            issuesFixed,
          }),
          data: {
            draft: finalizedRevisionDraft,
            supportAsset: reviserOutput.supportAsset,
            issuesFixed,
          },
          memory,
        };
      }

      const pastPosts = await prisma.post.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { text: true },
      });
      const historicalTexts = pastPosts.map((post) => post.text);

      const plan = await generatePlan(
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

      const writerOutput = await generateDrafts(
        planWithPreference,
        styleCard,
        relevantTopicAnchors,
        effectiveActiveConstraints,
        effectiveContext,
        activeDraft,
        {
          conversationState: memory.conversationState,
          antiPatterns,
          maxCharacterLimit,
          goal,
          draftPreference: planWithPreference.deliveryPreference || turnDraftPreference,
          formatPreference: planWithPreference.formatPreference || turnFormatPreference,
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

      const criticOutput = await critiqueDrafts(
        writerOutput,
        effectiveActiveConstraints,
        styleCard,
        {
          maxCharacterLimit,
          draftPreference: planWithPreference.deliveryPreference || turnDraftPreference,
          formatPreference: planWithPreference.formatPreference || turnFormatPreference,
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

      const noveltyCheck = checkDeterministicNovelty(
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
          response: "that version felt too close to something you've already posted. let's shift it.",
          data: {
            quickReplies: clarification.quickReplies,
          },
          memory,
        };
      }

      const rollingSummary = shouldRefreshRollingSummary(nextAssistantTurnCount, false)
        ? buildRollingSummary({
            currentSummary: memory.rollingSummary,
            topicSummary: planWithPreference.objective,
            approvedPlan: planWithPreference,
            activeConstraints: effectiveActiveConstraints,
            latestDraftStatus: "Draft delivered",
            formatPreference:
              planWithPreference.formatPreference || turnFormatPreference,
          })
        : memory.rollingSummary;

      await writeMemory({
        topicSummary: planWithPreference.objective,
        conversationState: "draft_ready",
        pendingPlan: null,
        clarificationState: null,
        rollingSummary,
        assistantTurnCount: nextAssistantTurnCount,
        formatPreference: planWithPreference.formatPreference || turnFormatPreference,
      });

      return {
        mode: "draft",
        outputShape: resolveDraftOutputShape(
          planWithPreference.formatPreference || turnFormatPreference,
        ),
        response: buildDraftReply({
          userMessage,
          draftPreference:
            planWithPreference.deliveryPreference || turnDraftPreference,
          isEdit: Boolean(activeDraft),
          issuesFixed: criticOutput.issues,
        }),
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
      const coachReply = await generateCoachReply(
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
        response:
          coachReply?.response ||
          "what's on your mind? i can help you draft, ideate, or figure out what to post.",
        memory,
      };
    }
  }
}
