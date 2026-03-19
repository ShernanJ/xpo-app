import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";

import { buildVoiceHydrationBlock } from "../agent-v2/prompts/promptHydrator.ts";
import { resolveVoiceTarget } from "../agent-v2/core/voiceTarget.ts";
import type {
  CreatorProfileHints,
  GroundingPacket,
} from "../agent-v2/grounding/groundingPacket.ts";
import type { ProfileReplyContext } from "../agent-v2/grounding/profileReplyContext.ts";
import type { ReplyInsights } from "../extension/replyOpportunities.ts";
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

function formatTopAngleLabels(replyInsights?: ReplyInsights | null) {
  const entries = (replyInsights?.topAngleLabels || []).slice(0, 3);
  if (entries.length === 0) {
    return "- No historical angle labels yet.";
  }

  return entries
    .map((entry) => {
      const selectionRate =
        typeof entry.selectionRate === "number"
          ? `${Math.round(entry.selectionRate * 100)}% selected`
          : "selection rate unknown";
      return `- ${entry.label}: ${selectionRate}; ${entry.postedCount} posted`;
    })
    .join("\n");
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

function collectLaneVoiceExamples(args: {
  creatorAgentContext?: CreatorAgentContext | null;
  creatorProfileHints?: CreatorProfileHints | null;
  sourceContext: ReplySourceContext;
}) {
  const examples = args.creatorAgentContext?.creatorProfile.examples;
  const laneAnchors = args.sourceContext.quotedPost
    ? examples?.quoteVoiceAnchors || []
    : examples?.replyVoiceAnchors || [];

  const snippets = [
    ...laneAnchors.map((post) => truncateLine(post.text, 180)),
    ...(args.creatorProfileHints?.topExampleSnippets || []).map((snippet) =>
      truncateLine(snippet, 180),
    ),
  ]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .slice(0, 4);

  if (snippets.length === 0) {
    return "- No lane-specific voice examples captured yet.";
  }

  return snippets.map((snippet) => `- ${snippet}`).join("\n");
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
    lane: args.sourceContext.quotedPost ? "quote" : "reply",
  });

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
    buildVoiceHydrationBlock(args.styleCard || null, voiceTarget),
    "",
    "CREATOR PROFILE HINTS:",
    formatCreatorHints(args.creatorProfileHints),
    "",
    "PROFILE REPLY CONTEXT:",
    formatProfileReplyContext(args.profileReplyContext),
    "",
    "LANE-SPECIFIC VOICE EVIDENCE:",
    collectLaneVoiceExamples({
      creatorAgentContext: args.creatorAgentContext,
      creatorProfileHints: args.creatorProfileHints,
      sourceContext: args.sourceContext,
    }),
    "",
    "GROUNDING PACKET:",
    "Durable facts:",
    formatPromptList(args.groundingPacket.durableFacts, "No durable facts recorded.", 8),
    "Turn grounding:",
    formatPromptList(args.groundingPacket.turnGrounding, "No turn grounding recorded.", 8),
    "Unknowns:",
    formatPromptList(args.groundingPacket.unknowns, "No explicit unknowns recorded.", 4),
    "",
    "REPLY ANALYTICS:",
    "Top angle labels:",
    formatTopAngleLabels(args.replyInsights),
    "Best signals:",
    formatPromptList(args.replyInsights?.bestSignals || [], "No positive reply signals recorded yet.", 4),
    "Caution signals:",
    formatPromptList(args.replyInsights?.cautionSignals || [], "No caution signals recorded yet.", 4),
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
  const visualContext = await analyzeReplySourceVisualContext(args.sourceContext);
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
    lane: args.sourceContext.quotedPost ? "quote" : "reply",
  });
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: buildReplyDraftSystemPrompt({
        ...args,
        visualContext,
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
  };
}
