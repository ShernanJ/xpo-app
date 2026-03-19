import type { GrowthStrategySnapshot } from "../onboarding/strategy/growthStrategy.ts";
import type {
  ReplyDraftImageRole,
  ReplyDraftPreflightResult,
  ReplyDraftSourceShape,
} from "../extension/types.ts";

import type { ReplySourceContext, ReplyVisualContextSummary } from "./types.ts";

const STOPWORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "just",
  "my",
  "of",
  "on",
  "or",
  "so",
  "that",
  "the",
  "this",
  "to",
  "was",
  "what",
  "when",
  "with",
]);

const EMOTIONAL_UPDATE_PATTERNS = [
  /\b(sorry|grief|grieving|hard|hurt|hurting|heartbroken|processing|sending love|brutal)\b/i,
  /\b(i'?m|im|i am)\s+(sad|upset|exhausted|wrecked|broken)\b/i,
];
const CASUAL_OBSERVATION_PATTERNS = [
  /\b(?:i\s+)?just\s+(?:had|ate|drank|ordered|bought|finished|saw|watched|spent|woke up|slept|realized|forgot)\b/i,
  /\b(?:i\s+)?(?:had|ate|drank|ordered|bought|finished|forgot|missed|skipped)\b/i,
  /\b(?:today|tonight|this morning|this afternoon)\b/i,
  /#(?:fuckit|idc|whatever|yolo|lmao|lol)\b/i,
];
const JOKE_SIGNAL_PATTERNS = [
  /\b(lwk|lol|lmao|lmfao|haha|shitpost(?:ing)?|sarcasm|sarcastic|meme|joke|funny|bit|vibes)\b/i,
  /\bshould market\b/i,
  /\bdesigned to be\b/i,
];
const ANALOGY_PATTERNS = /\b(like|as if|feels like|basically)\b/i;
const PLAYFUL_SELF_OWN_PATTERNS = [
  /\bmy (?:startup|launch|go[-\s]?to[-\s]?market|gtm|growth) strategy is just\b/i,
  /\b(?:drinking|running on|powered by|surviving on)\b[^.\n]{0,40}\b(red ?bull|coffee|caffeine)\b[^.\n]{0,40}\b(hoping|vibes|a dream)\b/i,
  /\bjust [^.\n]{0,48}\b(hoping|vibes|a dream)\b/i,
];
const BUSINESS_DOMAIN_PATTERNS = [
  /\b(startup|founder|founders|product|products|software|saas|ux|ui|design|designers|growth|marketing|audience|operator|operators|workflow|workflows|system|systems|process|processes|positioning|reply|replies|content|launch|gtm|roadmap|feature|features|build|builder|builders|ship|shipping|strategy|strategies|funnel|funnels)\b/i,
];
const EXPLICIT_ADVICE_REQUEST_PATTERNS = [
  /\?/,
  /\b(how do i|how should i|should i|what should i|any tips|need advice|what would you do)\b/i,
];

export const DISALLOWED_BUSINESS_DRIFT_TERMS = [
  "sprint",
  "next build",
  "core loop",
  "edge case",
  "edge cases",
  "surface the edge cases",
  "workflow",
  "operator",
  "operators",
  "product",
  "products",
  "startup",
  "startups",
  "positioning",
  "audience",
  "profile clicks",
  "gtm",
  "growth strategy",
  "iterate",
  "cheap traffic hack",
  "real win",
  "roadmap",
  "repeatable onboarding",
  "feedback loop",
  "feedback loops",
  "onboarding",
  "pipeline",
  "framework",
];

export const DISALLOWED_ADVICE_DRIFT_PATTERNS = [
  /\bremember to\b/i,
  /\byou should\b/i,
  /\byou need to\b/i,
  /\bneed to\b/i,
  /\bswap for\b/i,
  /\btry (?:a|an|the|to|swapping|taking|getting)\b/i,
  /\bthe move is\b/i,
  /\bthe better move is\b/i,
  /\bmake sure\b/i,
  /\bdon'?t forget\b/i,
];

export interface ReplyConstraintPolicy {
  sourceShape: ReplyDraftSourceShape;
  imageRole: ReplyDraftImageRole;
  imageReplyAnchor: string | null;
  shouldReferenceImageText: boolean;
  allowImageAnchoring: boolean;
  allowStrategyLens: boolean;
  allowBusinessInference: boolean;
  allowAdvice: boolean;
  preferShortRiff: boolean;
  treatAsLowSignalCasual: boolean;
  lexicalOverlapScore: number;
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s#]/g, " ").replace(/\s+/g, " ").trim();
}

function collectKeywords(value: string): string[] {
  return normalizeComparable(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function collectCombinedSourceText(args: {
  sourceContext?: ReplySourceContext | null;
  sourceText?: string | null;
  quotedText?: string | null;
  visualContext?: ReplyVisualContextSummary | null;
}) {
  return [
    args.sourceContext?.primaryPost.text || "",
    args.sourceContext?.quotedPost?.text || "",
    args.sourceText || "",
    args.quotedText || "",
    args.visualContext?.imageReplyAnchor || "",
    args.visualContext?.readableText || "",
    ...(args.visualContext?.keyDetails || []),
  ]
    .join("\n")
    .trim();
}

function hasBusinessDomainSignal(text: string) {
  return BUSINESS_DOMAIN_PATTERNS.some((pattern) => pattern.test(text));
}

function computeLexicalOverlapScore(args: {
  sourceText: string;
  strategy?: GrowthStrategySnapshot | null;
}) {
  if (!args.strategy) {
    return 0;
  }

  const sourceTokens = new Set(collectKeywords(args.sourceText));
  if (sourceTokens.size === 0) {
    return 0;
  }

  const strategyTokens = new Set(
    [
      args.strategy.knownFor,
      args.strategy.targetAudience,
      ...args.strategy.contentPillars,
      ...args.strategy.replyGoals,
      ...args.strategy.profileConversionCues,
      ...args.strategy.truthBoundary.verifiedFacts,
    ].flatMap((entry) => collectKeywords(entry)),
  );
  if (strategyTokens.size === 0) {
    return 0;
  }

  let matches = 0;
  for (const token of sourceTokens) {
    if (strategyTokens.has(token)) {
      matches += 1;
    }
  }

  return matches / Math.max(1, Math.min(sourceTokens.size, strategyTokens.size));
}

function isEmotionalUpdate(text: string) {
  return EMOTIONAL_UPDATE_PATTERNS.some((pattern) => pattern.test(text));
}

function isCasualObservation(text: string) {
  return CASUAL_OBSERVATION_PATTERNS.some((pattern) => pattern.test(text));
}

function isJokeSetup(text: string) {
  return (
    JOKE_SIGNAL_PATTERNS.some((pattern) => pattern.test(text)) ||
    PLAYFUL_SELF_OWN_PATTERNS.some((pattern) => pattern.test(text)) ||
    ANALOGY_PATTERNS.test(text)
  );
}

export function inferHeuristicReplySourceShape(args: {
  sourceContext?: ReplySourceContext | null;
  sourceText?: string | null;
  quotedText?: string | null;
  imageSummaryLines?: string[] | null;
  visualContext?: ReplyVisualContextSummary | null;
}): ReplyDraftSourceShape {
  const visibleText =
    args.sourceContext?.primaryPost.text ||
    args.sourceText ||
    "";
  const combined = [
    collectCombinedSourceText({
      sourceContext: args.sourceContext,
      sourceText: args.sourceText,
      quotedText: args.quotedText,
      visualContext: args.visualContext || null,
    }),
    ...(args.imageSummaryLines || []),
  ]
    .join("\n")
    .trim();

  if (isEmotionalUpdate(combined)) {
    return "emotional_update";
  }

  const hasBusinessSignal = hasBusinessDomainSignal(combined);
  const hasImageMaterial = Boolean(
    args.visualContext ||
      (args.imageSummaryLines?.length || 0) > 0 ||
      (args.sourceContext?.media?.images.length || 0) > 0,
  );
  const shortCaption = collectKeywords(visibleText).length <= 4;
  const playfulShortCaption =
    /\b(perfect|insane|wild|crazy|absurd|pull|lmao|lol|lmfao)\b/i.test(visibleText);

  if (args.visualContext?.imageRole === "punchline") {
    return "joke_setup";
  }
  if (args.visualContext?.imageRole === "proof") {
    return hasBusinessSignal ? "strategic_take" : "casual_observation";
  }
  if (hasImageMaterial && shortCaption && !hasBusinessSignal && playfulShortCaption) {
    return "joke_setup";
  }
  if (hasImageMaterial && shortCaption && !hasBusinessSignal) {
    return "casual_observation";
  }
  if (isCasualObservation(combined) && !hasBusinessSignal) {
    return "casual_observation";
  }

  if (isJokeSetup(combined)) {
    return "joke_setup";
  }

  if (isCasualObservation(combined)) {
    return "casual_observation";
  }

  return "strategic_take";
}

export function resolveReplyConstraintPolicy(args: {
  sourceContext?: ReplySourceContext | null;
  sourceText?: string | null;
  quotedText?: string | null;
  strategy?: GrowthStrategySnapshot | null;
  preflightResult?: ReplyDraftPreflightResult | null;
  visualContext?: ReplyVisualContextSummary | null;
}): ReplyConstraintPolicy {
  const sourceText = collectCombinedSourceText({
    sourceContext: args.sourceContext,
    sourceText: args.sourceText,
    quotedText: args.quotedText,
    visualContext: args.visualContext || null,
  });
  const lexicalOverlap = computeLexicalOverlapScore({
    sourceText,
    strategy: args.strategy || null,
  });
  const sourceShape =
    args.preflightResult?.source_shape ||
    inferHeuristicReplySourceShape({
      sourceContext: args.sourceContext || null,
      sourceText: args.sourceText || null,
      quotedText: args.quotedText || null,
      visualContext: args.visualContext || null,
    });
  const sourceHasBusinessSignal = hasBusinessDomainSignal(sourceText);
  const sourceWantsAdvice = EXPLICIT_ADVICE_REQUEST_PATTERNS.some((pattern) =>
    pattern.test(sourceText),
  );
  const lowOverlap = lexicalOverlap < 0.12;
  const lexicalOverlapScore = Math.round(lexicalOverlap * 100);
  const imageRole = args.preflightResult?.image_role || args.visualContext?.imageRole || "none";
  const imageReplyAnchor =
    args.preflightResult?.image_reply_anchor?.trim() ||
    args.visualContext?.imageReplyAnchor?.trim() ||
    null;
  const shouldReferenceImageText = Boolean(
    args.preflightResult?.should_reference_image_text || args.visualContext?.shouldReferenceImageText,
  );
  const allowImageAnchoring =
    shouldReferenceImageText ||
    imageRole === "punchline" ||
    imageRole === "proof" ||
    imageRole === "context";

  switch (sourceShape) {
    case "emotional_update":
      return {
        sourceShape,
        imageRole,
        imageReplyAnchor,
        shouldReferenceImageText,
        allowImageAnchoring,
        allowStrategyLens: false,
        allowBusinessInference: sourceHasBusinessSignal && !lowOverlap,
        allowAdvice: sourceWantsAdvice,
        preferShortRiff: false,
        treatAsLowSignalCasual: !sourceHasBusinessSignal,
        lexicalOverlapScore,
      };
    case "casual_observation":
      return {
        sourceShape,
        imageRole,
        imageReplyAnchor,
        shouldReferenceImageText,
        allowImageAnchoring,
        allowStrategyLens: false,
        allowBusinessInference: false,
        allowAdvice: sourceWantsAdvice,
        preferShortRiff: true,
        treatAsLowSignalCasual: lowOverlap || !sourceHasBusinessSignal,
        lexicalOverlapScore,
      };
    case "joke_setup":
      return {
        sourceShape,
        imageRole,
        imageReplyAnchor,
        shouldReferenceImageText,
        allowImageAnchoring,
        allowStrategyLens: false,
        allowBusinessInference: false,
        allowAdvice: sourceWantsAdvice && sourceHasBusinessSignal && !lowOverlap,
        preferShortRiff: true,
        treatAsLowSignalCasual: lowOverlap || !sourceHasBusinessSignal,
        lexicalOverlapScore,
      };
    case "strategic_take":
    default:
      return {
        sourceShape: "strategic_take",
        imageRole,
        imageReplyAnchor,
        shouldReferenceImageText,
        allowImageAnchoring,
        allowStrategyLens: sourceHasBusinessSignal || lexicalOverlap >= 0.12,
        allowBusinessInference: sourceHasBusinessSignal || lexicalOverlap >= 0.12,
        allowAdvice: sourceWantsAdvice || (sourceHasBusinessSignal && lexicalOverlap >= 0.08),
        preferShortRiff: args.preflightResult?.recommended_reply_mode === "joke_riff",
        treatAsLowSignalCasual: false,
        lexicalOverlapScore,
      };
  }
}

export function violatesReplyConstraintPolicy(args: {
  draft: string;
  policy: ReplyConstraintPolicy;
  sourceContext?: ReplySourceContext | null;
  sourceText?: string | null;
  quotedText?: string | null;
  visualContext?: ReplyVisualContextSummary | null;
}): boolean {
  const sourceText = collectCombinedSourceText({
    sourceContext: args.sourceContext,
    sourceText: args.sourceText,
    quotedText: args.quotedText,
    visualContext: args.visualContext || null,
  }).toLowerCase();
  const draftText = args.draft.toLowerCase();

  if (!args.policy.allowBusinessInference) {
    for (const term of DISALLOWED_BUSINESS_DRIFT_TERMS) {
      if (draftText.includes(term) && !sourceText.includes(term)) {
        return true;
      }
    }
  }

  if (!args.policy.allowAdvice) {
    for (const pattern of DISALLOWED_ADVICE_DRIFT_PATTERNS) {
      if (pattern.test(draftText) && !pattern.test(sourceText)) {
        return true;
      }
    }
  }

  return false;
}
