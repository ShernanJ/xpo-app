import {
  looksLikeNegativeFeedback,
} from "../../agents/antiPatternExtractor";
import type { V2ConversationMemory } from "../../contracts/chat";
import {
  buildComparisonRelationshipQuestion,
  buildProblemStakeQuestion,
  buildProductCapabilityQuestion,
} from "../../responses/assistantReplyStyle";
import {
  isBareDraftRequest,
  isBareIdeationRequest,
  hasStrongDraftCommand,
} from "../../orchestrator/conversationManagerLogic";
import {
  inferBroadTopicDraftRequest,
} from "./draftFastStart.ts";
import {
  evaluateDraftContextSlots,
  hasFunctionalDetail,
  hasProblemDetail,
  hasRelationshipDetail,
  inferComparisonReference,
} from "./draftContextSlots";
import { extractTopicGrounding } from "../../responses/correctionRepair";
import {
  getTurnRelationContext,
  isContextDependentFollowUp,
} from "../../runtime/turnRelation.ts";

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
      .filter((token) => token.length >= 4 && !IDEA_TOPIC_STOPWORDS.has(token));
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
