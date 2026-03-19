import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";

import { retrieveAnchors } from "../agent-v2/core/retrieval.ts";
import { resolveVoiceTarget } from "../agent-v2/core/voiceTarget.ts";
import type {
  CreatorProfileHints,
  GroundingPacket,
} from "../agent-v2/grounding/groundingPacket.ts";
import type { ProfileReplyContext } from "../agent-v2/grounding/profileReplyContext.ts";
import type { ExtensionReplyIntentMetadata } from "../extension/types.ts";
import type { CreatorAgentContext } from "../onboarding/strategy/agentContext.ts";
import type { GrowthStrategySnapshot } from "../onboarding/strategy/growthStrategy.ts";

import { analyzeReplySourceVisualContext } from "./context.ts";
import { retrieveReplyGoldenExamples } from "./goldenExamples.ts";
import { buildReplyDraftPreflightFallback, classifyReplyDraftMode } from "./preflight.ts";
import { inferReplySourceMode, resolveReplyToneDirection } from "./tone.ts";
import type {
  PreparedReplyPromptPacket,
  ReplyGoldenExample,
  ReplyPromptBuildInput,
  ReplySourceContext,
  ReplyVoiceEvidence,
  ReplyVisualContextSummary,
} from "./types.ts";

function compact(values: Array<string | null | undefined>, limit = 4): string[] {
  return values
    .map((value) => value?.trim() || "")
    .filter(Boolean)
    .slice(0, limit);
}

function formatPromptList(values: Array<string | null | undefined>, fallback: string, limit = 4) {
  const entries = compact(values, limit);
  if (entries.length === 0) {
    return `- ${fallback}`;
  }

  return entries.map((entry) => `- ${entry}`).join("\n");
}

function truncateLine(value: string, max = 220): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= max) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function collectKeywords(value: string): string[] {
  return normalizeComparable(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);
}

function formatCreatorHints(creatorProfileHints: CreatorProfileHints | null | undefined) {
  if (!creatorProfileHints) {
    return "No creator profile hints available.";
  }

  return [
    `- Known for: ${creatorProfileHints.knownFor || "unknown"}`,
    `- Target audience: ${creatorProfileHints.targetAudience || "unknown"}`,
    `- Content pillars: ${creatorProfileHints.contentPillars?.join(" | ") || "none recorded"}`,
    `- Reply goals: ${creatorProfileHints.replyGoals?.join(" | ") || "none recorded"}`,
    `- Tone guidelines: ${creatorProfileHints.toneGuidelines.join(" | ") || "none recorded"}`,
    `- Off-brand themes: ${creatorProfileHints.offBrandThemes?.join(" | ") || "none recorded"}`,
    `- Learning signals: ${creatorProfileHints.learningSignals?.join(" | ") || "none recorded"}`,
  ].join("\n");
}

function formatProfileReplyContext(profileReplyContext: ProfileReplyContext | null | undefined) {
  if (!profileReplyContext) {
    return "No profile reply context available.";
  }

  return [
    `- Account: ${profileReplyContext.accountLabel || "unknown"}`,
    `- Known for: ${profileReplyContext.knownFor || "unknown"}`,
    `- Target audience: ${profileReplyContext.targetAudience || "unknown"}`,
    `- Topic bullets: ${profileReplyContext.topicBullets.join(" | ") || "none recorded"}`,
    `- Recent post snippets: ${profileReplyContext.recentPostSnippets.join(" | ") || "none recorded"}`,
    profileReplyContext.strongestPost
      ? `- Strongest post pattern: ${truncateLine(profileReplyContext.strongestPost.text, 160)}`
      : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function buildCreatorReplyStyleBlock(creatorAgentContext: CreatorAgentContext | null | undefined) {
  const profile = creatorAgentContext?.creatorProfile;
  if (!profile?.voice || !profile?.styleCard) {
    return "No creator reply style profile available.";
  }

  const voice = profile.voice;
  const styleCard = profile.styleCard;
  const handle = profile.identity.username?.trim().replace(/^@+/, "").toLowerCase() || "";
  const signalText = [
    ...(voice.styleNotes || []),
    ...(styleCard.preferredOpeners || []),
    ...(styleCard.signaturePhrases || []),
  ]
    .join(" ")
    .toLowerCase();
  const multiLineRatePercent =
    voice.multiLinePostRate <= 1 ? Math.round(voice.multiLinePostRate * 100) : voice.multiLinePostRate;
  const isExplicitlyCasual =
    handle === "shernanjavier" ||
    /\b(casual|raw|relaxed|loose|playful|unfiltered)\b/.test(signalText) ||
    (voice.primaryCasing === "lowercase" &&
      voice.lowercaseSharePercent >= 70 &&
      (voice.averageLengthBand === "short" || voice.averageLengthBand === "medium"));
  const shortReplyBias =
    voice.averageLengthBand === "short" ||
    (voice.averageLengthBand === "medium" && voice.multiLinePostRate < 30);

  return [
    `- Observed casing: ${voice.primaryCasing} (${voice.lowercaseSharePercent}% lowercase share)`,
    `- Typical length: ${voice.averageLengthBand || "unknown"}`,
    `- Multi-line rate: ${multiLineRatePercent}%`,
    isExplicitlyCasual
      ? "- Casualness: this creator skews casual and internet-native. Do not rewrite them into polished product or consultant language."
      : "- Casualness: keep the reply natural, but do not force slang the creator does not use.",
    shortReplyBias
      ? "- Shape: prefer one short sentence or two short clauses max. Do not turn it into an explainer."
      : "- Shape: keep it concise and native to replies rather than building a full mini-post.",
    styleCard.preferredOpeners.length > 0
      ? `- Familiar openers: ${styleCard.preferredOpeners.slice(0, 3).join(" | ")}`
      : null,
    styleCard.signaturePhrases.length > 0
      ? `- Signature phrases: ${styleCard.signaturePhrases.slice(0, 4).join(" | ")}`
      : null,
    styleCard.forbiddenPhrases.length > 0
      ? `- Forbidden phrases: ${styleCard.forbiddenPhrases.slice(0, 5).join(" | ")}`
      : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function shouldUseIntentOverlay(args: {
  sourceContext: ReplySourceContext;
  selectedIntent?: ExtensionReplyIntentMetadata | null;
  strategyPillar?: string | null;
  angleLabel?: string | null;
}) {
  const sourceTokens = new Set(
    [
      ...collectKeywords(args.sourceContext.primaryPost.text),
      ...collectKeywords(args.sourceContext.quotedPost?.text || ""),
    ].slice(0, 24),
  );

  if (sourceTokens.size === 0) {
    return false;
  }

  const overlayTokens = [
    ...collectKeywords(args.selectedIntent?.anchor || ""),
    ...collectKeywords(args.selectedIntent?.strategyPillar || ""),
    ...collectKeywords(args.strategyPillar || ""),
    ...collectKeywords(args.angleLabel || ""),
  ];

  return overlayTokens.some((token) => sourceTokens.has(token));
}

function buildFallbackVoiceAnchors(args: {
  creatorAgentContext?: CreatorAgentContext | null;
  creatorProfileHints?: CreatorProfileHints | null;
  sourceContext: ReplySourceContext;
}) {
  const examples = args.creatorAgentContext?.creatorProfile.examples;
  const laneAnchors = args.sourceContext.quotedPost
    ? examples?.quoteVoiceAnchors || []
    : examples?.replyVoiceAnchors || [];

  return {
    laneMatchedAnchors: laneAnchors.map((post) => truncateLine(post.text, 180)),
    fallbackAnchors: [
      ...(args.creatorProfileHints?.topExampleSnippets || []).map((snippet) =>
        truncateLine(snippet, 180),
      ),
      ...((examples?.voiceAnchors || []).map((post) => truncateLine(post.text, 180))),
      ...((examples?.bestPerforming || []).map((post) => truncateLine(post.text, 180))),
    ],
  };
}

function dedupeAnchors(values: Array<string | null | undefined>, limit: number): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const normalized = value?.trim().replace(/\s+/g, " ") || "";
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(normalized);

    if (next.length >= limit) {
      break;
    }
  }

  return next;
}

function collectReplyAntiPatterns(args: {
  styleCard: ReplyPromptBuildInput["styleCard"];
  creatorAgentContext?: CreatorAgentContext | null;
}): string[] {
  return dedupeAnchors(
    [
      ...(args.styleCard?.antiExamples || []).slice(-3).map((entry) => entry.guidance),
      ...(args.styleCard?.customGuidelines || []).slice(-3),
      ...((args.styleCard?.userPreferences?.blacklist || []).slice(0, 3).map((entry) => `avoid ${entry}`)),
      ...((args.creatorAgentContext?.creatorProfile.styleCard.forbiddenPhrases || []).slice(0, 4).map(
        (entry) => `avoid ${entry}`,
      )),
    ],
    6,
  );
}

function buildVoiceEvidenceSummary(args: {
  targetLane: ReplyVoiceEvidence["targetLane"];
  laneMatchedAnchors: string[];
  fallbackAnchors: string[];
  antiPatterns: string[];
}): string[] {
  return [
    `Target lane: ${args.targetLane}`,
    args.laneMatchedAnchors.length > 0
      ? `Primary voice evidence: ${args.laneMatchedAnchors.length} lane-matched anchor${args.laneMatchedAnchors.length === 1 ? "" : "s"}`
      : "Primary voice evidence: no lane-matched anchors available.",
    args.fallbackAnchors.length > 0
      ? `Fallback style support: ${args.fallbackAnchors.length} original-post anchor${args.fallbackAnchors.length === 1 ? "" : "s"}`
      : "Fallback style support: none.",
    args.antiPatterns.length > 0
      ? `Anti-pattern guidance: ${args.antiPatterns.join(" | ")}`
      : "Anti-pattern guidance: none captured.",
  ];
}

async function resolveReplyVoiceEvidence(
  args: ReplyPromptBuildInput,
): Promise<ReplyVoiceEvidence> {
  const targetLane: ReplyVoiceEvidence["targetLane"] = args.sourceContext.quotedPost
    ? "quote"
    : "reply";
  const fallbackAnchors = buildFallbackVoiceAnchors({
    creatorAgentContext: args.creatorAgentContext,
    creatorProfileHints: args.creatorProfileHints,
    sourceContext: args.sourceContext,
  });

  let retrievedLaneAnchors: string[] = [];
  let retrievedTopicAnchors: string[] = [];
  if (args.retrievalContext?.userId && args.retrievalContext.xHandle) {
    const retrieval = await retrieveAnchors(
      args.retrievalContext.userId,
      args.retrievalContext.xHandle,
      [
        args.sourceContext.primaryPost.text,
        args.sourceContext.quotedPost?.text || "",
        args.selectedIntent?.anchor || "",
        args.selectedIntent?.label || "",
      ]
        .filter(Boolean)
        .join("\n"),
      {
        targetLane,
        preferredFormat: "shortform",
        limit: 6,
      },
    );
    retrievedLaneAnchors = retrieval.laneAnchors.map((entry) => truncateLine(entry, 180));
    retrievedTopicAnchors = retrieval.topicAnchors.map((entry) => truncateLine(entry, 180));
  }

  const laneMatchedAnchors = dedupeAnchors(
    [...retrievedLaneAnchors, ...fallbackAnchors.laneMatchedAnchors],
    4,
  );
  const fallbackStyleAnchors = dedupeAnchors(
    [...fallbackAnchors.fallbackAnchors, ...retrievedTopicAnchors].filter(
      (entry) => !laneMatchedAnchors.includes(entry || ""),
    ),
    laneMatchedAnchors.length >= 3 ? 2 : 3,
  );
  const antiPatterns = collectReplyAntiPatterns({
    styleCard: args.styleCard || null,
    creatorAgentContext: args.creatorAgentContext || null,
  });

  return {
    targetLane,
    draftPreference: "voice_first",
    formatPreference: "shortform",
    laneMatchedAnchors,
    fallbackAnchors: fallbackStyleAnchors,
    antiPatterns,
    summaryLines: buildVoiceEvidenceSummary({
      targetLane,
      laneMatchedAnchors,
      fallbackAnchors: fallbackStyleAnchors,
      antiPatterns,
    }),
  };
}

function formatVoiceEvidenceBlock(voiceEvidence: ReplyVoiceEvidence) {
  return [
    `- Target lane: ${voiceEvidence.targetLane}`,
    `- Delivery preference: ${voiceEvidence.draftPreference}`,
    `- Format preference: ${voiceEvidence.formatPreference}`,
    "Lane-matched reply evidence:",
    formatPromptList(
      voiceEvidence.laneMatchedAnchors,
      "No lane-matched reply anchors available.",
      4,
    ),
    "Fallback style support:",
    formatPromptList(
      voiceEvidence.fallbackAnchors,
      "No fallback original-post anchors available.",
      3,
    ),
    "Use voice evidence for casing, cadence, sentence shape, and endings.",
    "Do not reuse facts, metrics, or anecdotes from voice evidence unless they also appear in the factual truth layer.",
  ].join("\n");
}

function formatGoldenExamplesBlock(goldenExamples: ReplyGoldenExample[]) {
  if (goldenExamples.length === 0) {
    return "- No retrieved examples available.";
  }

  return goldenExamples
    .map((example, index) => {
      const label =
        example.source === "golden_example"
          ? `Golden example ${index + 1}`
          : `Fallback example ${index + 1}`;
      return `- ${label}: ${truncateLine(example.text, 220)}`;
    })
    .join("\n");
}

function formatPreflightBlock(args: {
  opTone: string;
  postIntent: string;
  recommendedReplyMode: string;
}) {
  return [
    `- Observed OP tone: ${args.opTone}`,
    `- Inferred post intent: ${args.postIntent}`,
    `- Recommended reply mode: ${args.recommendedReplyMode}`,
  ].join("\n");
}

function resolveGhostwritingHandle(args: {
  userHandle?: string | null;
  creatorAgentContext?: CreatorAgentContext | null;
  retrievalHandle?: string | null;
}) {
  return (
    args.userHandle?.trim().replace(/^@+/, "") ||
    args.creatorAgentContext?.creatorProfile.identity.username?.trim().replace(/^@+/, "") ||
    args.retrievalHandle?.trim().replace(/^@+/, "") ||
    "creator"
  );
}

export function buildReplyGroundingPacket(args: {
  strategy: GrowthStrategySnapshot;
  sourceContext: ReplySourceContext;
  strategyPillar: string;
  angleLabel: string;
  visualContext?: ReplyVisualContextSummary | null;
  preflightResult?: PreparedReplyPromptPacket["preflightResult"] | null;
}): GroundingPacket {
  const sourceMode = inferReplySourceMode({
    sourceContext: args.sourceContext,
    preflightResult: args.preflightResult,
  });
  const useIntentOverlay = shouldUseIntentOverlay({
    sourceContext: args.sourceContext,
    strategyPillar: args.strategyPillar,
    angleLabel: args.angleLabel,
  });

  return {
    durableFacts: [
      `Known for: ${args.strategy.knownFor}`,
      `Target audience: ${args.strategy.targetAudience}`,
      ...args.strategy.truthBoundary.verifiedFacts,
    ],
    turnGrounding: [
      `Visible post text: ${args.sourceContext.primaryPost.text}`,
      `Reply lane: ${args.sourceContext.quotedPost ? "quote" : "reply"}`,
      ...(useIntentOverlay ? [`Optional aligned lens: ${args.strategyPillar}`] : []),
      ...(args.sourceContext.quotedPost?.text
        ? [`Quoted post text: ${args.sourceContext.quotedPost.text}`]
        : []),
      ...(args.visualContext?.summaryLines || []).map((line) => `Image context: ${line}`),
      ...(useIntentOverlay && !sourceMode.isPlayful
        ? args.strategy.truthBoundary.inferredThemes.slice(0, 2)
        : []),
    ],
    allowedFirstPersonClaims: [],
    allowedNumbers: [],
    forbiddenClaims: [],
    unknowns: args.strategy.truthBoundary.unknowns,
    sourceMaterials: [],
    voiceContextHints: [
      `Use ${args.sourceContext.quotedPost ? "quote-tweet" : "reply"} cadence, not standalone post cadence.`,
    ],
  };
}

export function buildReplyDraftSystemPrompt(args: ReplyPromptBuildInput & {
  voiceEvidence?: ReplyVoiceEvidence | null;
  visualContext?: ReplyVisualContextSummary | null;
  goldenExamples?: ReplyGoldenExample[] | null;
  preflightResult?: PreparedReplyPromptPacket["preflightResult"] | null;
}): string {
  const sourceMode = inferReplySourceMode({
    sourceContext: args.sourceContext,
    preflightResult: args.preflightResult,
  });
  const classifierRead = args.preflightResult || buildReplyDraftPreflightFallback();
  const useIntentOverlay = shouldUseIntentOverlay({
    sourceContext: args.sourceContext,
    selectedIntent: args.selectedIntent,
    strategyPillar: args.selectedIntent?.strategyPillar || null,
    angleLabel: args.selectedIntent?.label || null,
  });
  const voiceEvidence =
    args.voiceEvidence ||
    {
      targetLane: args.sourceContext.quotedPost ? "quote" : "reply",
      draftPreference: "voice_first" as const,
      formatPreference: "shortform" as const,
      laneMatchedAnchors: dedupeAnchors(
        buildFallbackVoiceAnchors({
          creatorAgentContext: args.creatorAgentContext,
          creatorProfileHints: args.creatorProfileHints,
          sourceContext: args.sourceContext,
        }).laneMatchedAnchors,
        4,
      ),
      fallbackAnchors: dedupeAnchors(
        buildFallbackVoiceAnchors({
          creatorAgentContext: args.creatorAgentContext,
          creatorProfileHints: args.creatorProfileHints,
          sourceContext: args.sourceContext,
        }).fallbackAnchors,
        3,
      ),
      antiPatterns: collectReplyAntiPatterns({
        styleCard: args.styleCard || null,
        creatorAgentContext: args.creatorAgentContext || null,
      }),
      summaryLines: [],
    };
  const goldenExamples = args.goldenExamples || [];
  const ghostwritingHandle = resolveGhostwritingHandle({
    userHandle: args.userHandle,
    creatorAgentContext: args.creatorAgentContext || null,
    retrievalHandle: args.retrievalContext?.xHandle || null,
  });

  return [
    "You write exactly one X reply in the creator's real voice.",
    `You are ghostwriting for @${ghostwritingHandle}. Do not invent a persona. Mirror these exact examples. Match his sentence length, punctuation habits, and analytical depth exactly.`,
    "Return ONLY the final reply text.",
    "No preamble. No labels. No greetings. No analysis.",
    "No hashtags, no emojis, no markdown, no bullet points, no numbered lists, no code fences, no surrounding quotation marks.",
    "Do not sound like an assistant, consultant, ghostwriter, operator coach, or AI system.",
    "Do not invent personal experience, product usage, metrics, proof, backstory, or adjacent context.",
    "Do not pivot into adjacent niches or frameworks that are not already in the conversation.",
    "Stay on the literal subject matter of the post. If the post is about UX, reply about UX. If the post is about the product, reply about the product.",
    "Reuse at least one concrete noun, phrase, or topic from the visible post or quoted post when it fits naturally.",
    "Match the creator's casing and reply register. If their real examples skew lowercase and casual, stay lowercase and casual.",
    "If the source post reads like a joke, observation, or quick riff, answer like a person joining the riff. Do not unpack it into product advice, system design, or strategy analysis.",
    "Do not explain the post back in more corporate language than the original post used.",
    sourceMode.shouldContinueMetaphor
      ? "This source uses a playful analogy. Continue the analogy or joke instead of translating it into a literal product explanation."
      : null,
    "This is a reply, not a standalone post. Prefer a native X reply shape: quick agreement, pushback, add-on, observation, question, or concise riff.",
    "If the source is a quote tweet, respond to the visible quote-tweet text first and use the quoted post as supporting context only.",
    "If image context is present, use it only when it sharpens the reply to the actual post.",
    `Keep it under ${(args.maxCharacterLimit || 280).toLocaleString()} characters.`,
    "",
    "FACTUAL TRUTH LAYER:",
    "Durable facts:",
    formatPromptList(args.groundingPacket.durableFacts, "No durable facts recorded.", 8),
    "Turn grounding:",
    formatPromptList(args.groundingPacket.turnGrounding, "No turn grounding recorded.", 8),
    "Unknowns:",
    formatPromptList(args.groundingPacket.unknowns, "No explicit unknowns recorded.", 4),
    "",
    "REPLY CONTEXT LAYER:",
    `- Visible post author: @${args.sourceContext.primaryPost.authorHandle || "unknown"}`,
    `- Visible post type: ${args.sourceContext.primaryPost.postType}`,
    `- Selected reply angle: ${args.selectedIntent?.label || "none selected"}`,
    `- Selected reply anchor: ${args.selectedIntent?.anchor || "none selected"}`,
    args.sourceContext.quotedPost
      ? "- Quote rule: respond to the visible quote-tweet text first; use the quoted post only as supporting context."
      : "- Reply rule: stay inside the visible post's literal topic and wording.",
    args.visualContext?.summaryLines?.length
      ? `- Image context available: ${args.visualContext.summaryLines.join(" | ")}`
      : "- Image context available: none.",
    "",
    "CLASSIFIER READ:",
    formatPreflightBlock({
      opTone: classifierRead.op_tone,
      postIntent: classifierRead.post_intent,
      recommendedReplyMode: classifierRead.recommended_reply_mode,
    }),
    "",
    "RETRIEVED GOLDEN EXAMPLES:",
    formatGoldenExamplesBlock(goldenExamples),
    goldenExamples.some((example) => example.source === "fallback_anchor")
      ? "- Fallback examples are backup support only. Prefer exact learned Golden Examples when present."
      : "- All examples above are learned Golden Examples from edited posted replies.",
    "",
    "CREATOR PROFILE HINTS:",
    formatCreatorHints(args.creatorProfileHints),
    "Use creator profile hints as background voice calibration only. Do not use them to change the subject of the reply.",
    "",
    "PROFILE REPLY CONTEXT:",
    formatProfileReplyContext(args.profileReplyContext),
    "Use profile reply context for voice memory only. Do not let it pull the reply away from the literal post.",
    "",
    "SOURCE MODE:",
    sourceMode.isPlayful
      ? "- This post is playful / joke-shaped. Prioritize a short riff, pile-on, or extension of the bit."
      : "- This post is straightforward. Prioritize a direct, native reply.",
    sourceMode.shouldContinueMetaphor
      ? "- Continue the metaphor instead of stepping outside it to explain product strategy."
      : "- Do not over-interpret the post beyond what it actually says.",
    "",
    "CREATOR REPLY STYLE:",
    buildCreatorReplyStyleBlock(args.creatorAgentContext),
    "",
    "BACKUP VOICE EVIDENCE:",
    formatVoiceEvidenceBlock(voiceEvidence),
    "",
    "REQUIREMENTS:",
    "1. Write exactly one reply and nothing else.",
    "2. Sound like the creator actually wrote it, not like a polished assistant or PM.",
    `3. TONE ENFORCEMENT: ${resolveReplyToneDirection(args.tone)}`,
    "4. Golden Examples are the primary style source. Backup voice evidence is secondary.",
    "5. Keep it native to X replies: short, direct, and human. Do not turn it into a mini post.",
    "6. If the creator's historical replies are casual or lowercase, preserve that instead of professionalizing it.",
    "7. Do not copy factual claims from examples or voice evidence unless the factual truth layer also supports them.",
    "8. Stay close to the literal nouns and tension in the source post instead of pivoting to adjacent themes.",
    "9. If you end with a question, it must feel natural to the creator's actual reply style, not like a forced engagement CTA.",
    "10. If the source is already casual, funny, or punchy, match that energy instead of sounding more analytical than the post itself.",
    sourceMode.shouldContinueMetaphor
      ? "11. For this reply, do not explain the joke. Add to the joke."
      : "11. Do not over-explain the source post.",
    "",
    "OPTIONAL REPLY LENS:",
    useIntentOverlay
      ? `- Anchor: ${args.selectedIntent?.anchor || "none selected"}`
      : "- No aligned strategic lens. Stay with the literal post and creator voice instead.",
    useIntentOverlay
      ? `- Rationale: ${args.selectedIntent?.rationale || "none selected"}`
      : "- Do not force a strategy pillar that changes the topic of the reply.",
  ].join("\n");
}

export function buildReplyDraftUserPrompt(args: Pick<
  ReplyPromptBuildInput,
  | "sourceContext"
  | "tone"
  | "goal"
  | "stage"
  | "heuristicScore"
  | "heuristicTier"
  | "selectedIntent"
  | "groundingPacket"
> & {
  visualContext?: ReplyVisualContextSummary | null;
  preflightResult?: PreparedReplyPromptPacket["preflightResult"] | null;
}): string {
  return [
    "Reply target:",
    `Visible post author: @${args.sourceContext.primaryPost.authorHandle || "unknown"}`,
    `Visible post type: ${args.sourceContext.primaryPost.postType}`,
    "Visible post text:",
    `"""${args.sourceContext.primaryPost.text.trim()}"""`,
    "",
    ...(args.sourceContext.quotedPost?.text
      ? [
          "Quoted post text:",
          `"""${args.sourceContext.quotedPost.text.trim()}"""`,
          "",
        ]
      : []),
    ...(args.visualContext?.summaryLines?.length
      ? ["Image context:", ...args.visualContext.summaryLines.map((line) => `- ${line}`), ""]
      : []),
    ...(args.preflightResult
      ? [
          `Classifier reply mode: ${args.preflightResult.recommended_reply_mode}`,
          `Classifier post intent: ${args.preflightResult.post_intent}`,
          "",
        ]
      : []),
    `Goal: ${args.goal}`,
    `Requested tone: ${args.tone}`,
    `Growth stage: ${args.stage || "unknown"}`,
    `Heuristic score: ${args.heuristicScore ?? "unknown"}`,
    `Heuristic tier: ${args.heuristicTier ?? "unknown"}`,
    "",
    "Write one reply now.",
    "It should sound like the creator actually wrote it and stay inside the source conversation.",
    "Return only the reply text.",
  ].join("\n");
}

export async function prepareReplyPromptPacket(
  args: ReplyPromptBuildInput & {
    visualContext?: ReplyVisualContextSummary | null;
    preflightResult?: PreparedReplyPromptPacket["preflightResult"] | null;
    goldenExamples?: ReplyGoldenExample[] | null;
  },
): Promise<PreparedReplyPromptPacket> {
  const [resolvedVisualContext, voiceEvidence] = await Promise.all([
    args.visualContext === undefined
      ? analyzeReplySourceVisualContext(args.sourceContext)
      : Promise.resolve(args.visualContext),
    resolveReplyVoiceEvidence(args),
  ]);
  const preflightResult =
    args.preflightResult ||
    (await classifyReplyDraftMode({
      sourceText: args.sourceContext.primaryPost.text,
      quotedText: args.sourceContext.quotedPost?.text || null,
      imageSummaryLines: resolvedVisualContext?.summaryLines || [],
    }));
  const goldenExamples =
    args.goldenExamples ||
    (args.retrievalContext?.userId && args.retrievalContext.xHandle
      ? await retrieveReplyGoldenExamples({
          userId: args.retrievalContext.userId,
          xHandle: args.retrievalContext.xHandle,
          replyMode: preflightResult.recommended_reply_mode,
          sourceText: args.sourceContext.primaryPost.text,
          quotedText: args.sourceContext.quotedPost?.text || null,
          imageSummaryLines: resolvedVisualContext?.summaryLines || [],
          postIntent: preflightResult.post_intent,
          lane: args.sourceContext.quotedPost ? "quote" : "reply",
          preferredFormat: "shortform",
        })
      : []);
  const voiceTarget = resolveVoiceTarget({
    styleCard: args.styleCard || null,
    userMessage:
      [
        args.goal,
        args.tone === "bold" ? "bolder" : "voice first",
        args.sourceContext.primaryPost.text,
      ]
        .filter(Boolean)
        .join(" "),
    draftPreference: "voice_first",
    formatPreference: "shortform",
    lane: args.sourceContext.quotedPost ? "quote" : "reply",
  });
  const maxCharacterLimit = args.maxCharacterLimit || 280;
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: buildReplyDraftSystemPrompt({
        ...args,
        visualContext: resolvedVisualContext,
        voiceEvidence,
        goldenExamples,
        preflightResult,
      }),
    },
    {
      role: "user",
      content: buildReplyDraftUserPrompt({
        ...args,
        visualContext: resolvedVisualContext,
        preflightResult,
      }),
    },
  ];

  return {
    messages,
    sourceContext: args.sourceContext,
    groundingPacket: args.groundingPacket,
    voiceTarget,
    visualContext: resolvedVisualContext,
    voiceEvidence,
    styleCard: args.styleCard || null,
    maxCharacterLimit,
    preflightResult,
    goldenExamples,
  };
}
