import type {
  ReplyDraftPreflightResult,
  ReplyDraftSourceShape,
  ReplyDisallowedMove,
  ReplyHumorMode,
  ReplyImageArtifactType,
  ReplyPostFrame,
  ReplySourceLiterality,
  SourceInterpretation,
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
const SATIRE_OR_PARODY_PATTERNS = [
  /\bpro max plus\b/i,
  /\bpremium(?:\s+\w+){0,3}\s+(?:plus|ultra|max)\b/i,
  /\bunlock\b/i,
  /\b(?:\$|usd)\s*\d{3,}\s*\/\s*(?:month|mo)\b/i,
  /\bwho(?:'s| is)\s+view(?:ed|ing)\b/i,
  /\bbookmarked\b/i,
  /\bcursed\b/i,
  /\bcriminal\b/i,
  /\bparody\b/i,
  /\bfake\b/i,
];
const SARCASM_PATTERNS = [
  /\byeah right\b/i,
  /\bsure\b/i,
  /\bperfect\b/i,
  /\bas if\b/i,
  /\blove that for us\b/i,
];
const QUESTION_PATTERNS = [/\?/, /\b(how|why|what|when|who)\b/i];
const ANNOUNCEMENT_PATTERNS = [/\b(announcing|launched|shipping|released|just dropped)\b/i];
const VENT_PATTERNS = [/\b(brutal|tired|wrecked|annoying|exhausted|hate when)\b/i];
const MOCKUP_PATTERNS = [/\b(idea|mockup|concept|fake ui|parody ui)\b/i];
const CRITIQUE_PATTERNS = [/\b(bad idea|terrible|dystopian|cursed|insane|illegal|criminal|wrong)\b/i];

function normalizeWhitespace(value: string | null | undefined): string {
  return (value || "").trim().replace(/\s+/g, " ");
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
  return normalizeWhitespace(
    [
      args.sourceContext?.primaryPost.text || "",
      args.sourceContext?.quotedPost?.text || "",
      args.sourceText || "",
      args.quotedText || "",
      args.visualContext?.imageReplyAnchor || "",
      args.visualContext?.readableText || "",
      args.visualContext?.artifactTargetHint || "",
      ...(args.visualContext?.brandSignals || []),
      ...(args.visualContext?.absurdityMarkers || []),
      ...(args.visualContext?.keyDetails || []),
    ].join("\n"),
  );
}

function hasBusinessDomainSignal(text: string) {
  return BUSINESS_DOMAIN_PATTERNS.some((pattern) => pattern.test(text));
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
  const visibleText = args.sourceContext?.primaryPost.text || args.sourceText || "";
  const combined = normalizeWhitespace(
    [
      collectCombinedSourceText({
        sourceContext: args.sourceContext,
        sourceText: args.sourceText,
        quotedText: args.quotedText,
        visualContext: args.visualContext || null,
      }),
      ...(args.imageSummaryLines || []),
    ].join("\n"),
  );

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

function deriveImageArtifactType(args: {
  sourceText: string;
  visualContext?: ReplyVisualContextSummary | null;
}): ReplyImageArtifactType {
  const explicit = args.visualContext?.imageArtifactType;
  if (explicit && explicit !== "unknown") {
    return explicit;
  }

  const combined = normalizeWhitespace(
    [
      args.sourceText,
      args.visualContext?.readableText || "",
      args.visualContext?.imageReplyAnchor || "",
      args.visualContext?.artifactTargetHint || "",
      ...(args.visualContext?.absurdityMarkers || []),
      ...(args.visualContext?.keyDetails || []),
    ].join(" "),
  ).toLowerCase();
  const sceneType = args.visualContext?.sceneType || "unknown";
  const looksAbsurd = SATIRE_OR_PARODY_PATTERNS.some((pattern) => pattern.test(combined));
  const looksMockup = MOCKUP_PATTERNS.some((pattern) => pattern.test(args.sourceText));

  if (sceneType === "meme") {
    return "meme";
  }
  if (sceneType === "photo") {
    return "photo";
  }
  if (sceneType === "mixed") {
    return "mixed";
  }
  if (sceneType === "screenshot" || sceneType === "product_ui") {
    if (looksAbsurd) {
      return "parody_ui";
    }
    if (looksMockup) {
      return "mockup";
    }
    return "real_screenshot";
  }

  return "unknown";
}

function deriveHumorMode(args: {
  sourceText: string;
  combinedText: string;
  sourceShape: ReplyDraftSourceShape;
  imageArtifactType: ReplyImageArtifactType;
  imageRole: string;
}): ReplyHumorMode {
  if (args.imageArtifactType === "parody_ui") {
    return "parody";
  }
  if (SATIRE_OR_PARODY_PATTERNS.some((pattern) => pattern.test(args.combinedText))) {
    return /\b(parody|fake|mockup)\b/i.test(args.combinedText) ? "parody" : "satire";
  }
  if (SARCASM_PATTERNS.some((pattern) => pattern.test(args.combinedText))) {
    return "sarcasm";
  }
  if (args.sourceShape === "joke_setup" && /\b(absurd|insane|wild|criminal|illegal)\b/i.test(args.combinedText)) {
    return "absurdist";
  }
  if (args.sourceShape === "joke_setup" || args.imageRole === "punchline") {
    return "playful";
  }
  if (/\b(lol|lmao|haha|funny|bit)\b/i.test(args.combinedText)) {
    return "playful";
  }

  return "none";
}

function derivePostFrame(args: {
  sourceText: string;
  combinedText: string;
  sourceShape: ReplyDraftSourceShape;
  humorMode: ReplyHumorMode;
  imageArtifactType: ReplyImageArtifactType;
}): ReplyPostFrame {
  if (
    args.imageArtifactType === "parody_ui" ||
    args.imageArtifactType === "mockup" ||
    (MOCKUP_PATTERNS.some((pattern) => pattern.test(args.sourceText)) && args.humorMode !== "none")
  ) {
    return "mockup";
  }
  if (QUESTION_PATTERNS.some((pattern) => pattern.test(args.sourceText))) {
    return "question";
  }
  if (isEmotionalUpdate(args.combinedText) || VENT_PATTERNS.some((pattern) => pattern.test(args.combinedText))) {
    return "vent";
  }
  if (ANNOUNCEMENT_PATTERNS.some((pattern) => pattern.test(args.combinedText))) {
    return "announcement";
  }
  if (CRITIQUE_PATTERNS.some((pattern) => pattern.test(args.combinedText))) {
    return "critique";
  }
  if (args.sourceShape === "casual_observation") {
    return "observation";
  }
  if (args.sourceShape === "joke_setup" || args.humorMode !== "none") {
    return "reaction";
  }
  if (/\bidea[:\s]/i.test(args.sourceText) || /\bshould\b/i.test(args.sourceText)) {
    return "proposal";
  }

  return "observation";
}

function deriveTarget(args: {
  sourceText: string;
  combinedText: string;
  visualContext?: ReplyVisualContextSummary | null;
  humorMode: ReplyHumorMode;
  postFrame: ReplyPostFrame;
  imageArtifactType: ReplyImageArtifactType;
}): string {
  const readableText = normalizeWhitespace(args.visualContext?.readableText);
  const anchor = normalizeWhitespace(args.visualContext?.imageReplyAnchor);

  if (args.visualContext?.artifactTargetHint) {
    return args.visualContext.artifactTargetHint;
  }
  if (
    args.imageArtifactType === "parody_ui" &&
    /\b(viewed your profile|bookmarked your tweets|premium)\b/i.test(args.combinedText)
  ) {
    return "premium social-surveillance UX";
  }
  if (
    (args.humorMode === "playful" || args.postFrame === "reaction") &&
    /\b(posts? aren'?t loading right now|try again|something went wrong|failed to load)\b/i.test(
      `${readableText} ${anchor}`,
    )
  ) {
    return "app failure / loading banner";
  }
  if (args.postFrame === "proposal") {
    return "the visible product idea";
  }
  if (args.postFrame === "critique") {
    return "the take being critiqued";
  }
  if (args.postFrame === "vent") {
    return "the situation being vented about";
  }

  return collectKeywords(args.sourceText).slice(0, 4).join(" ") || "the visible post";
}

function deriveLiterality(args: {
  humorMode: ReplyHumorMode;
  postFrame: ReplyPostFrame;
  imageArtifactType: ReplyImageArtifactType;
}): ReplySourceLiterality {
  if (
    args.humorMode === "satire" ||
    args.humorMode === "parody" ||
    args.humorMode === "absurdist" ||
    args.imageArtifactType === "parody_ui"
  ) {
    return "non_literal";
  }
  if (args.humorMode === "sarcasm") {
    return "mixed";
  }
  if (args.humorMode === "playful" && args.postFrame === "reaction") {
    return "non_literal";
  }
  if (args.postFrame === "mockup" && args.imageArtifactType === "mockup") {
    return "mixed";
  }

  return "literal";
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function deriveConfidence(args: {
  combinedText: string;
  humorMode: ReplyHumorMode;
  imageArtifactType: ReplyImageArtifactType;
  sourceShape: ReplyDraftSourceShape;
}) {
  let satireConfidence = 0;
  if (args.humorMode === "satire" || args.humorMode === "parody") {
    satireConfidence += 72;
  }
  if (args.humorMode === "absurdist") {
    satireConfidence += 56;
  }
  if (args.imageArtifactType === "parody_ui") {
    satireConfidence += 24;
  }
  satireConfidence += Math.min(
    18,
    SATIRE_OR_PARODY_PATTERNS.reduce(
      (sum, pattern) => sum + (pattern.test(args.combinedText) ? 6 : 0),
      0,
    ),
  );

  let literalityConfidence = 68;
  if (args.humorMode === "none" && args.sourceShape === "strategic_take") {
    literalityConfidence = 84;
  } else if (args.humorMode === "playful" || args.sourceShape === "joke_setup") {
    literalityConfidence = 78;
  } else if (args.humorMode === "sarcasm") {
    literalityConfidence = 58;
  }
  if (args.imageArtifactType === "parody_ui") {
    literalityConfidence = Math.max(literalityConfidence, 90);
  }

  return {
    literalityConfidence: clampConfidence(literalityConfidence),
    satireConfidence: clampConfidence(satireConfidence),
  };
}

export function buildHeuristicSourceInterpretation(args: {
  sourceContext?: ReplySourceContext | null;
  sourceText?: string | null;
  quotedText?: string | null;
  preflightResult?: ReplyDraftPreflightResult | null;
  visualContext?: ReplyVisualContextSummary | null;
}): SourceInterpretation {
  const sourceText = args.sourceContext?.primaryPost.text || args.sourceText || "";
  const combinedText = collectCombinedSourceText({
    sourceContext: args.sourceContext,
    sourceText: args.sourceText,
    quotedText: args.quotedText,
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
  const imageArtifactType = deriveImageArtifactType({
    sourceText,
    visualContext: args.visualContext || null,
  });
  const humorMode = deriveHumorMode({
    sourceText,
    combinedText,
    sourceShape,
    imageArtifactType,
    imageRole: args.preflightResult?.image_role || args.visualContext?.imageRole || "none",
  });
  const postFrame = derivePostFrame({
    sourceText,
    combinedText,
    sourceShape,
    humorMode,
    imageArtifactType,
  });
  const literality = deriveLiterality({
    humorMode,
    postFrame,
    imageArtifactType,
  });
  const target = deriveTarget({
    sourceText,
    combinedText,
    visualContext: args.visualContext || null,
    humorMode,
    postFrame,
    imageArtifactType,
  });
  const { literalityConfidence, satireConfidence } = deriveConfidence({
    combinedText,
    humorMode,
    imageArtifactType,
    sourceShape,
  });

  const allowedReplyMoves: SourceInterpretation["allowed_reply_moves"] = ["react", "amplify", "critique", "clarify"];
  if (
    humorMode === "playful" ||
    humorMode === "satire" ||
    humorMode === "parody" ||
    humorMode === "absurdist"
  ) {
    allowedReplyMoves.push("pile_on");
  }
  if (
    literality === "literal" &&
    (postFrame === "proposal" || postFrame === "question" || sourceShape === "strategic_take") &&
    literalityConfidence >= 70
  ) {
    allowedReplyMoves.push("propose");
  }

  const disallowedReplyMoves = new Set<ReplyDisallowedMove>(["unsupported_external_claim"]);
  if (literality !== "literal" || postFrame === "mockup" || humorMode === "satire" || humorMode === "parody") {
    disallowedReplyMoves.add("adjacent_ideation");
    disallowedReplyMoves.add("literal_product_brainstorm");
  } else if (!allowedReplyMoves.includes("propose")) {
    disallowedReplyMoves.add("adjacent_ideation");
  }

  return {
    literality,
    humor_mode: humorMode,
    post_frame: postFrame,
    target,
    image_artifact_type: imageArtifactType,
    allowed_reply_moves: Array.from(new Set(allowedReplyMoves)),
    disallowed_reply_moves: Array.from(disallowedReplyMoves),
    literality_confidence: literalityConfidence,
    satire_confidence: satireConfidence,
  };
}

export function resolveSourceInterpretation(args: {
  sourceContext?: ReplySourceContext | null;
  sourceText?: string | null;
  quotedText?: string | null;
  preflightResult?: ReplyDraftPreflightResult | null;
  visualContext?: ReplyVisualContextSummary | null;
}): SourceInterpretation {
  const heuristic = buildHeuristicSourceInterpretation(args);
  const existing = args.preflightResult?.interpretation;
  if (!existing) {
    return heuristic;
  }

  return {
    ...heuristic,
    ...existing,
    target: normalizeWhitespace(existing.target) || heuristic.target,
    image_artifact_type:
      existing.image_artifact_type && existing.image_artifact_type !== "unknown"
        ? existing.image_artifact_type
        : heuristic.image_artifact_type,
    allowed_reply_moves:
      existing.allowed_reply_moves?.length > 0
        ? Array.from(new Set(existing.allowed_reply_moves))
        : heuristic.allowed_reply_moves,
    disallowed_reply_moves:
      existing.disallowed_reply_moves?.length > 0
        ? Array.from(new Set(existing.disallowed_reply_moves))
        : heuristic.disallowed_reply_moves,
    literality_confidence:
      typeof existing.literality_confidence === "number"
        ? clampConfidence(existing.literality_confidence)
        : heuristic.literality_confidence,
    satire_confidence:
      typeof existing.satire_confidence === "number"
        ? clampConfidence(existing.satire_confidence)
        : heuristic.satire_confidence,
  };
}
