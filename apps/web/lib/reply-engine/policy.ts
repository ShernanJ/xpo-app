import type { GrowthStrategySnapshot } from "../onboarding/strategy/growthStrategy.ts";
import type {
  ReplyDraftImageRole,
  ReplyDraftPreflightResult,
  ReplyDisallowedMove,
  SourceInterpretation,
} from "../extension/types.ts";

import type { ReplySourceContext, ReplyVisualContextSummary } from "./types.ts";
import {
  inferHeuristicReplySourceShape,
  resolveSourceInterpretation,
} from "./interpretation.ts";

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
  sourceShape: ReplyDraftPreflightResult["source_shape"];
  interpretation: SourceInterpretation;
  imageRole: ReplyDraftImageRole;
  imageReplyAnchor: string | null;
  shouldReferenceImageText: boolean;
  allowImageAnchoring: boolean;
  allowStrategyLens: boolean;
  allowBusinessInference: boolean;
  allowAdvice: boolean;
  allowPropose: boolean;
  allowAdjacentIdeation: boolean;
  allowLiteralProductBrainstorm: boolean;
  allowSelfNomination: boolean;
  disallowedReplyMoves: ReplyDisallowedMove[];
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
  const interpretation = resolveSourceInterpretation({
    sourceContext: args.sourceContext || null,
    sourceText: args.sourceText || null,
    quotedText: args.quotedText || null,
    preflightResult: args.preflightResult || null,
    visualContext: args.visualContext || null,
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
  const allowPropose = interpretation.allowed_reply_moves.includes("propose");
  const allowAdjacentIdeation = !interpretation.disallowed_reply_moves.includes("adjacent_ideation");
  const allowLiteralProductBrainstorm = !interpretation.disallowed_reply_moves.includes(
    "literal_product_brainstorm",
  );
  const allowSelfNomination = !interpretation.disallowed_reply_moves.includes("self_nomination");
  const disallowedReplyMoves = interpretation.disallowed_reply_moves;

  switch (sourceShape) {
    case "emotional_update":
      return {
        sourceShape,
        interpretation,
        imageRole,
        imageReplyAnchor,
        shouldReferenceImageText,
        allowImageAnchoring,
        allowStrategyLens: false,
        allowBusinessInference: sourceHasBusinessSignal && !lowOverlap,
        allowAdvice: sourceWantsAdvice,
        allowPropose,
        allowAdjacentIdeation,
        allowLiteralProductBrainstorm,
        allowSelfNomination,
        disallowedReplyMoves,
        preferShortRiff: false,
        treatAsLowSignalCasual: !sourceHasBusinessSignal,
        lexicalOverlapScore,
      };
    case "casual_observation":
      return {
        sourceShape,
        interpretation,
        imageRole,
        imageReplyAnchor,
        shouldReferenceImageText,
        allowImageAnchoring,
        allowStrategyLens: false,
        allowBusinessInference: false,
        allowAdvice: sourceWantsAdvice,
        allowPropose,
        allowAdjacentIdeation,
        allowLiteralProductBrainstorm,
        allowSelfNomination,
        disallowedReplyMoves,
        preferShortRiff: true,
        treatAsLowSignalCasual: lowOverlap || !sourceHasBusinessSignal,
        lexicalOverlapScore,
      };
    case "joke_setup":
      return {
        sourceShape,
        interpretation,
        imageRole,
        imageReplyAnchor,
        shouldReferenceImageText,
        allowImageAnchoring,
        allowStrategyLens: false,
        allowBusinessInference: false,
        allowAdvice: sourceWantsAdvice && sourceHasBusinessSignal && !lowOverlap,
        allowPropose,
        allowAdjacentIdeation,
        allowLiteralProductBrainstorm,
        allowSelfNomination,
        disallowedReplyMoves,
        preferShortRiff: true,
        treatAsLowSignalCasual: lowOverlap || !sourceHasBusinessSignal,
        lexicalOverlapScore,
      };
    case "strategic_take":
    default:
      return {
        sourceShape: "strategic_take",
        interpretation,
        imageRole,
        imageReplyAnchor,
        shouldReferenceImageText,
        allowImageAnchoring,
        allowStrategyLens: sourceHasBusinessSignal || lexicalOverlap >= 0.12,
        allowBusinessInference: sourceHasBusinessSignal || lexicalOverlap >= 0.12,
        allowAdvice: sourceWantsAdvice || (sourceHasBusinessSignal && lexicalOverlap >= 0.08),
        allowPropose,
        allowAdjacentIdeation,
        allowLiteralProductBrainstorm,
        allowSelfNomination,
        disallowedReplyMoves,
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

  if (!args.policy.allowAdjacentIdeation) {
    const adjacentIdeationPatterns = [
      /\bit(?:'d| would)\s+be\s+(?:better|more valuable)\s+if\b/i,
      /\bthey\s+should\s+also\b/i,
      /\bnot\s+just\b[^.?!]{0,80}\bbut\b/i,
      /\balso\s+(?:see|show|add|include)\b/i,
      /\bwould\s+be\s+useful\s+if\b/i,
    ];
    if (adjacentIdeationPatterns.some((pattern) => pattern.test(args.draft))) {
      return true;
    }
  }

  if (!args.policy.allowLiteralProductBrainstorm) {
    const literalBrainstormPatterns = [
      /\bfeature request\b/i,
      /\broadmap\b/i,
      /\bthey should add\b/i,
      /\bwould love if\b/i,
      /\bproduct idea\b/i,
      /\bthis should ship\b/i,
    ];
    if (literalBrainstormPatterns.some((pattern) => pattern.test(args.draft))) {
      return true;
    }
  }

  if (!args.policy.allowSelfNomination) {
    const selfNominationPatterns = [
      /\bdm me\b/i,
      /\bhit me up\b/i,
      /\bcount me in\b/i,
      /\bi'?m down\b/i,
      /\bif you need someone\b/i,
      /\bi(?:'d| would)\s+love to\b/i,
      /\blove\b[^.?!]{0,80}\b(meeting people|finding undiscovered talent|hunting hidden talent|digging up hidden talent|working insanely hard)\b/i,
    ];
    if (selfNominationPatterns.some((pattern) => pattern.test(args.draft))) {
      return true;
    }
  }

  return false;
}
