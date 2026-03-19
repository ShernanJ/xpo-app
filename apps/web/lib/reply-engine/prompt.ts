import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";

import { retrieveAnchors } from "../agent-v2/core/retrieval.ts";
import { buildVoiceHydrationBlock } from "../agent-v2/prompts/promptHydrator.ts";
import {
  buildAntiPatternBlock,
  buildConversationToneBlock,
  buildDraftPreferenceBlock,
  buildFormatPreferenceBlock,
} from "../agent-v2/prompts/promptHydrator.ts";
import { resolveVoiceTarget } from "../agent-v2/core/voiceTarget.ts";
import type {
  CreatorProfileHints,
  GroundingPacket,
} from "../agent-v2/grounding/groundingPacket.ts";
import type { ProfileReplyContext } from "../agent-v2/grounding/profileReplyContext.ts";
import type {
  ExtensionReplyIntentMetadata,
  ExtensionReplyTone,
} from "../extension/types.ts";
import type { CreatorAgentContext } from "../onboarding/strategy/agentContext.ts";
import type { GrowthStrategySnapshot } from "../onboarding/strategy/growthStrategy.ts";

import { analyzeReplySourceVisualContext } from "./context.ts";
import type {
  PreparedReplyPromptPacket,
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

function collectReplyAntiPatterns(styleCard: ReplyPromptBuildInput["styleCard"]): string[] {
  if (!styleCard) {
    return [];
  }

  return dedupeAnchors(
    [
      ...(styleCard.antiExamples || []).slice(-3).map((entry) => entry.guidance),
      ...(styleCard.customGuidelines || []).slice(-3),
      ...((styleCard.userPreferences?.blacklist || []).slice(0, 3).map((entry) => `avoid ${entry}`)),
    ],
    5,
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
  const antiPatterns = collectReplyAntiPatterns(args.styleCard || null);

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

function resolveToneDirection(tone: ExtensionReplyTone) {
  switch (tone) {
    case "dry":
      return "Stay crisp, understated, and analytical.";
    case "warm":
      return "Stay human and conversational without sounding soft or generic.";
    case "bold":
      return "Stay sharper and more pointed, but never hostile or performative.";
    case "builder":
    default:
      return "Stay practical and native to how the creator actually replies on X.";
  }
}

export function buildReplyGroundingPacket(args: {
  strategy: GrowthStrategySnapshot;
  sourceContext: ReplySourceContext;
  strategyPillar: string;
  angleLabel: string;
  visualContext?: ReplyVisualContextSummary | null;
}): GroundingPacket {
  return {
    durableFacts: [
      `Known for: ${args.strategy.knownFor}`,
      `Target audience: ${args.strategy.targetAudience}`,
      `Primary content pillar: ${args.strategyPillar}`,
      ...args.strategy.truthBoundary.verifiedFacts,
    ],
    turnGrounding: [
      `Visible post text: ${args.sourceContext.primaryPost.text}`,
      `Reply lane: ${args.sourceContext.quotedPost ? "quote" : "reply"}`,
      `Reply angle: ${args.angleLabel}`,
      ...(args.sourceContext.quotedPost?.text
        ? [`Quoted post text: ${args.sourceContext.quotedPost.text}`]
        : []),
      ...(args.visualContext?.summaryLines || []).map((line) => `Image context: ${line}`),
      ...args.strategy.truthBoundary.inferredThemes.slice(0, 4),
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
  voiceTargetSummaryMessage?: string | null;
  voiceEvidence?: ReplyVoiceEvidence | null;
  visualContext?: ReplyVisualContextSummary | null;
}): string {
  const voiceTarget = resolveVoiceTarget({
    styleCard: args.styleCard || null,
    userMessage:
      args.voiceTargetSummaryMessage ||
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
      antiPatterns: collectReplyAntiPatterns(args.styleCard || null),
      summaryLines: [],
    };

  return [
    "You write exactly one X reply in the creator's real voice.",
    "Return ONLY the final reply text.",
    "No preamble. No labels. No greetings. No analysis.",
    "No hashtags, no emojis, no markdown, no bullet points, no numbered lists, no code fences, no surrounding quotation marks.",
    "Do not sound like an assistant, consultant, ghostwriter, operator coach, or AI system.",
    "Do not invent personal experience, product usage, metrics, proof, backstory, or adjacent context.",
    "Do not pivot into adjacent niches or frameworks that are not already in the conversation.",
    "Stay on the literal subject matter of the post. If the post is about UX, reply about UX. If the post is about the product, reply about the product.",
    "Reuse at least one concrete noun, phrase, or topic from the visible post or quoted post when it fits naturally.",
    "Match the creator's casing and reply register. If their real examples skew lowercase and casual, stay lowercase and casual.",
    "Avoid generic AI phrasing like 'the real issue is', 'here's the framework', 'level up', 'high-ROI', 'operator', or 'it pays dividends'.",
    "This is a reply, not a standalone post. Prefer a native X reply shape: quick agreement, pushback, add-on, observation, question, or concise riff.",
    "If the source is a quote tweet, respond to the visible quote-tweet text first and use the quoted post as supporting context only.",
    "If image context is present, use it only when it sharpens the reply to the actual post.",
    `Keep it under ${(args.maxCharacterLimit || 280).toLocaleString()} characters.`,
    resolveToneDirection(args.tone),
    "",
    buildConversationToneBlock("draft"),
    buildDraftPreferenceBlock("voice_first", "draft"),
    buildFormatPreferenceBlock("shortform", "draft"),
    buildVoiceHydrationBlock(args.styleCard || null, voiceTarget),
    buildAntiPatternBlock(voiceEvidence.antiPatterns),
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
    "CREATOR PROFILE HINTS:",
    formatCreatorHints(args.creatorProfileHints),
    "",
    "PROFILE REPLY CONTEXT:",
    formatProfileReplyContext(args.profileReplyContext),
    "",
    "VOICE / SHAPE LAYER:",
    formatVoiceEvidenceBlock(voiceEvidence),
    "",
    "REQUIREMENTS:",
    "1. Write exactly one reply and nothing else.",
    "2. Sound like the creator actually wrote it, not like a polished assistant or PM.",
    "3. Prefer the creator's real reply cadence over broad growth or product-strategy language.",
    "4. Keep it native to X replies: short, direct, and human. Do not turn it into a mini post.",
    "5. If the creator's historical replies are casual or lowercase, preserve that instead of professionalizing it.",
    "6. Use lane-matched reply evidence first. Original-post evidence is only fallback style support.",
    "7. Do not copy factual claims from voice evidence unless the factual truth layer also supports them.",
    "8. Avoid product-marketing phrasing like 'cheap signal', 'iterate on content', 'real data', 'would love to see', 'next build', or 'vanity likes' unless the creator truly talks that way.",
    "9. Stay close to the literal nouns and tension in the source post instead of pivoting to adjacent themes.",
    "10. If you end with a question, it must feel natural to the creator's actual reply style, not like a forced engagement CTA.",
    "",
    "SELECTED REPLY INTENT:",
    `- Angle label: ${args.selectedIntent?.label || "none selected"}`,
    `- Strategy pillar: ${args.selectedIntent?.strategyPillar || "none selected"}`,
    `- Anchor: ${args.selectedIntent?.anchor || "none selected"}`,
    `- Rationale: ${args.selectedIntent?.rationale || "none selected"}`,
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
  args: ReplyPromptBuildInput,
): Promise<PreparedReplyPromptPacket> {
  const [visualContext, voiceEvidence] = await Promise.all([
    analyzeReplySourceVisualContext(args.sourceContext),
    resolveReplyVoiceEvidence(args),
  ]);
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
        visualContext,
        voiceEvidence,
        voiceTargetSummaryMessage: [
          args.goal,
          args.tone === "bold" ? "bolder" : "voice first",
          args.sourceContext.primaryPost.text,
        ]
          .filter(Boolean)
          .join(" "),
      }),
    },
    {
      role: "user",
      content: buildReplyDraftUserPrompt({
        ...args,
        visualContext,
      }),
    },
  ];

  return {
    messages,
    sourceContext: args.sourceContext,
    groundingPacket: args.groundingPacket,
    voiceTarget,
    visualContext,
    voiceEvidence,
    styleCard: args.styleCard || null,
    maxCharacterLimit,
  };
}
