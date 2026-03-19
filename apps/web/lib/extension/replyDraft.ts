import type { GroundingPacket } from "../agent-v2/grounding/groundingPacket.ts";
import type { CreatorProfileHints } from "../agent-v2/grounding/groundingPacket.ts";
import type { ProfileReplyContext } from "../agent-v2/grounding/profileReplyContext.ts";
import type { VoiceStyleCard } from "../agent-v2/core/styleProfile.ts";
import type { CreatorAgentContext } from "../onboarding/strategy/agentContext.ts";
import type { GrowthStrategySnapshot } from "../onboarding/strategy/growthStrategy.ts";
import {
  buildReplyDraftSystemPrompt as buildSharedReplyDraftSystemPrompt,
  buildReplyDraftUserPrompt as buildSharedReplyDraftUserPrompt,
  buildReplyGroundingPacket as buildSharedReplyGroundingPacket,
  buildReplySourceContextFromExtensionRequest,
  cleanReplyDraftStreamChunk as cleanSharedReplyDraftStreamChunk,
  finalizeReplyDraftText as finalizeSharedReplyDraftText,
  prepareReplyPromptPacket,
  type PreparedReplyPromptPacket,
  type ReplyGoldenExample,
  type ReplyDraftPreflightResult,
  type ReplySourceContext,
  type ReplyVisualContextSummary,
} from "../reply-engine/index.ts";
import {
  buildReplyIntentPlanForDraft,
  buildReplyLearningNotes,
  pickReplyStrategyPillar,
  type ExtensionReplyIntentPlan,
} from "./replyIntent.ts";
import { buildCasualReplyText } from "./casualReply.ts";
import { collectKeywords, normalizeWhitespace, sanitizeReplyText } from "./replyQuality.ts";
import type { ReplyInsights } from "./replyOpportunities.ts";
import type {
  ExtensionReplyDraftRequest,
  ExtensionReplyIntentMetadata,
  ExtensionReplyDraftResponse,
  ExtensionReplyOption,
} from "./types";
import type { ReplyConstraintPolicy } from "../reply-engine/index.ts";
import { resolveReplyConstraintPolicy } from "../reply-engine/index.ts";

export interface ExtensionReplyDraftBuildResult {
  response: ExtensionReplyDraftResponse;
  strategyPillar: string;
  angleLabel: string;
  groundingPacket: GroundingPacket;
}

export interface ReplyDraftGenerationContext {
  strategyPillar: string;
  angleLabel: string;
  groundingPacket: GroundingPacket;
  intent: ExtensionReplyIntentMetadata | null;
  policy: ReplyConstraintPolicy;
  notes: string[];
}

function pickFocusPhrase(tweetText: string): string | null {
  const keywords = collectKeywords(tweetText);
  if (keywords.length === 0) {
    return null;
  }

  return keywords.slice(0, 2).join(" ");
}

function buildPillarLens(pillar: string): string {
  const normalized = pillar.toLowerCase();
  if (/\b(position|niche|brand|coherence)\b/.test(normalized)) {
    return "the positioning clarity";
  }
  if (/\b(reply|conversation|question)\b/.test(normalized)) {
    return "the follow-through in the reply itself";
  }
  if (/\b(system|workflow|process|loop|operating)\b/.test(normalized)) {
    return "the system behind it";
  }
  if (/\b(proof|example|result|case|lesson)\b/.test(normalized)) {
    return "the proof layer";
  }
  return pillar;
}

function compactList(values: Array<string | null | undefined>, limit = 3) {
  const next = values
    .map((value) => normalizeWhitespace(value || ""))
    .filter(Boolean);

  return next.slice(0, limit);
}

function formatPromptList(values: Array<string | null | undefined>, fallback: string, limit = 3) {
  const entries = compactList(values, limit);
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

function formatVoiceRules(styleCard: VoiceStyleCard | null | undefined) {
  if (!styleCard) {
    return "- No parsed voice card; use creator strategy and requested tone only.";
  }

  return [
    `- Pacing: ${styleCard.pacing || "not specified"}`,
    `- Sentence openings: ${compactList(styleCard.sentenceOpenings || [], 4).join(" | ") || "none recorded"}`,
    `- Sentence closers: ${compactList(styleCard.sentenceClosers || [], 4).join(" | ") || "none recorded"}`,
    `- Vocabulary: ${compactList(styleCard.slangAndVocabulary || [], 6).join(" | ") || "none recorded"}`,
    `- Formatting: ${compactList(styleCard.formattingRules || [], 5).join(" | ") || "none recorded"}`,
    `- Custom guidelines: ${compactList(styleCard.customGuidelines || [], 5).join(" | ") || "none recorded"}`,
    `- Blacklist: ${compactList(styleCard.userPreferences?.blacklist || [], 6).join(" | ") || "none recorded"}`,
  ].join("\n");
}

function buildPrimaryFallbackReply(args: {
  request: ExtensionReplyDraftRequest;
  strategy: GrowthStrategySnapshot;
  pillar: string;
  focusPhrase: string | null;
  policy: ReplyConstraintPolicy;
}) {
  if (args.policy.sourceShape === "casual_observation") {
    return buildCasualReplyText({
      sourceText: args.request.tweetText,
      variant: "relatable",
    });
  }

  const lens = buildPillarLens(args.pillar);
  const lead =
    args.request.tone === "dry"
      ? "yeah. the part people usually miss is"
      : args.request.tone === "warm"
        ? "yeah. the part worth underscoring is"
        : args.request.tone === "playful"
          ? "lmao the whole bit is"
        : args.request.tone === "builder"
          ? "yeah. the thing that makes this usable is"
          : "hotter take: the whole thing is";

  if (args.request.tone === "playful") {
    if (args.focusPhrase) {
      return `${lead} ${args.focusPhrase} framing ${lens}. kind of perfect honestly.`;
    }

    return `${lead} how casually it sneaks in ${lens}. kind of perfect honestly.`;
  }

  if (args.focusPhrase) {
    return `${lead} ${lens}. that's what turns ${args.focusPhrase} from a take into something someone can actually use.`;
  }

  return `${lead} ${lens}. that's what makes the point useful instead of just relatable.`;
}

function buildSecondaryFallbackReply(args: {
  request: ExtensionReplyDraftRequest;
  pillar: string;
  focusPhrase: string | null;
  policy: ReplyConstraintPolicy;
}) {
  if (args.policy.sourceShape === "casual_observation") {
    return buildCasualReplyText({
      sourceText: args.request.tweetText,
      variant: args.request.tone === "playful" ? "pile_on" : "deadpan",
      concise: args.request.tone === "dry",
    });
  }

  const lens = buildPillarLens(args.pillar);
  const focus = args.focusPhrase || "the headline";
  const lead = args.request.tone === "warm" ? "yeah but" : "hotter take:";

  if (args.request.tone === "playful") {
    return `${lead} ${focus} being the headline is exactly why this lands. anything more serious would ruin it.`;
  }

  return `${lead} ${focus} isn't the hard part. ${lens} is. otherwise the reply reads true without really going anywhere.`;
}

export function buildReplyGroundingPacket(args: {
  request: ExtensionReplyDraftRequest;
  strategy: GrowthStrategySnapshot;
  strategyPillar: string;
  angleLabel: string;
  sourceContext?: ReplySourceContext | null;
  visualContext?: ReplyVisualContextSummary | null;
  preflightResult?: ReplyDraftPreflightResult | null;
}): GroundingPacket {
  return buildSharedReplyGroundingPacket({
    strategy: args.strategy,
    sourceContext: args.sourceContext || buildReplySourceContextFromExtensionRequest(args.request),
    strategyPillar: args.strategyPillar,
    angleLabel: args.angleLabel,
    visualContext: args.visualContext || null,
    preflightResult: args.preflightResult || null,
  });
}

function resolveReplyIntentPlan(args: {
  request: ExtensionReplyDraftRequest;
  strategy: GrowthStrategySnapshot;
  replyInsights?: ReplyInsights | null;
  selectedIntent?: ExtensionReplyIntentMetadata;
  policy: ReplyConstraintPolicy;
}): ExtensionReplyIntentPlan | null {
  if (args.selectedIntent) {
    return {
      angleLabel: args.selectedIntent.label,
      label: args.selectedIntent.label,
      focusPhrase: pickFocusPhrase(args.request.tweetText),
      strategyPillar: args.selectedIntent.strategyPillar,
      rationale: args.selectedIntent.rationale,
      anchor: args.selectedIntent.anchor,
    };
  }

  if (!args.policy.allowStrategyLens) {
    return null;
  }

  return buildReplyIntentPlanForDraft({
    sourceText: args.request.tweetText,
    goal: args.request.goal,
    strategy: args.strategy,
    replyInsights: args.replyInsights,
  });
}

export function buildReplyDraftGenerationContext(args: {
  request: ExtensionReplyDraftRequest;
  strategy: GrowthStrategySnapshot;
  replyInsights?: ReplyInsights | null;
  selectedIntent?: ExtensionReplyIntentMetadata;
  preflightResult?: ReplyDraftPreflightResult | null;
  sourceContext?: ReplySourceContext | null;
  visualContext?: ReplyVisualContextSummary | null;
}): ReplyDraftGenerationContext {
  const sourceContext = args.sourceContext || buildReplySourceContextFromExtensionRequest(args.request);
  const policy = resolveReplyConstraintPolicy({
    sourceContext,
    strategy: args.strategy,
    preflightResult: args.preflightResult || null,
    visualContext: args.visualContext || null,
  });
  const defaultStrategyPillar =
    args.selectedIntent?.strategyPillar ||
    pickReplyStrategyPillar({
      sourceText: args.request.tweetText,
      strategy: args.strategy,
    });
  const intentPlan = resolveReplyIntentPlan({
    ...args,
    policy,
  });
  const strategyPillar = intentPlan?.strategyPillar || defaultStrategyPillar;
  const angleLabel = intentPlan?.angleLabel || "nuance";
  const groundingPacket = buildReplyGroundingPacket({
    request: args.request,
    strategy: args.strategy,
    strategyPillar,
    angleLabel,
    sourceContext,
    visualContext: args.visualContext || null,
    preflightResult: args.preflightResult || null,
  });
  const notes = [
    ...(intentPlan
      ? [
          `Anchored to: ${intentPlan.strategyPillar}`,
          `Angle: ${intentPlan.angleLabel.replace(/_/g, " ")}`,
          `Intent: ${intentPlan.rationale}`,
        ]
      : [
          `Source shape: ${policy.sourceShape.replace(/_/g, " ")}`,
          "No strategic lens selected: stay literal to the post and keep the reply conversational.",
        ]),
    ...buildReplyLearningNotes(args.replyInsights),
    ...args.strategy.ambiguities.slice(0, 1).map((entry) => `Tentative positioning: ${entry}`),
  ];

  return {
    strategyPillar,
    angleLabel,
    groundingPacket,
    intent: intentPlan
      ? {
          label: intentPlan.label,
          strategyPillar: intentPlan.strategyPillar,
          anchor: intentPlan.anchor,
          rationale: intentPlan.rationale,
        }
      : null,
    policy,
    notes,
  };
}

export function buildReplyDraftSystemPrompt(args: {
  request: ExtensionReplyDraftRequest;
  strategy: GrowthStrategySnapshot;
  replyInsights?: ReplyInsights | null;
  styleCard?: VoiceStyleCard | null;
  generation: ReplyDraftGenerationContext;
  creatorProfileHints?: CreatorProfileHints | null;
  creatorAgentContext?: CreatorAgentContext | null;
  profileReplyContext?: ProfileReplyContext | null;
  sourceContext?: ReplySourceContext | null;
  visualContext?: ReplyVisualContextSummary | null;
  preflightResult?: ReplyDraftPreflightResult | null;
  goldenExamples?: ReplyGoldenExample[] | null;
  userHandle?: string | null;
}): string {
  return buildSharedReplyDraftSystemPrompt({
    sourceContext: args.sourceContext || buildReplySourceContextFromExtensionRequest(args.request),
    strategy: args.strategy,
    tone: args.request.tone,
    goal: args.request.goal,
    stage: args.request.stage,
    heuristicScore: args.request.heuristicScore,
    heuristicTier: args.request.heuristicTier,
    selectedIntent: args.generation.intent,
    replyInsights: args.replyInsights,
    styleCard: args.styleCard || null,
    creatorProfileHints: args.creatorProfileHints || null,
    creatorAgentContext: args.creatorAgentContext || null,
    profileReplyContext: args.profileReplyContext || null,
    groundingPacket: args.generation.groundingPacket,
    maxCharacterLimit: 280,
    visualContext: args.visualContext || null,
    preflightResult: args.preflightResult || null,
    goldenExamples: args.goldenExamples || [],
    userHandle: args.userHandle || null,
  });
}

export function buildReplyDraftUserPrompt(args: {
  request: ExtensionReplyDraftRequest;
  generation: ReplyDraftGenerationContext;
  sourceContext?: ReplySourceContext | null;
  visualContext?: ReplyVisualContextSummary | null;
  preflightResult?: ReplyDraftPreflightResult | null;
}): string {
  return buildSharedReplyDraftUserPrompt({
    sourceContext: args.sourceContext || buildReplySourceContextFromExtensionRequest(args.request),
    tone: args.request.tone,
    goal: args.request.goal,
    stage: args.request.stage,
    heuristicScore: args.request.heuristicScore,
    heuristicTier: args.request.heuristicTier,
    selectedIntent: args.generation.intent,
    groundingPacket: args.generation.groundingPacket,
    visualContext: args.visualContext || null,
    preflightResult: args.preflightResult || null,
  });
}

export async function prepareExtensionReplyDraftPromptPacket(args: {
  request: ExtensionReplyDraftRequest;
  strategy: GrowthStrategySnapshot;
  replyInsights?: ReplyInsights | null;
  styleCard?: VoiceStyleCard | null;
  generation: ReplyDraftGenerationContext;
  creatorProfileHints?: CreatorProfileHints | null;
  creatorAgentContext?: CreatorAgentContext | null;
  profileReplyContext?: ProfileReplyContext | null;
  userId?: string | null;
  xHandle?: string | null;
  sourceContext?: ReplySourceContext | null;
  visualContext?: ReplyVisualContextSummary | null;
  preflightResult?: ReplyDraftPreflightResult | null;
}): Promise<PreparedReplyPromptPacket> {
  const sourceContext = args.sourceContext || buildReplySourceContextFromExtensionRequest(args.request);

  return prepareReplyPromptPacket({
    sourceContext,
    strategy: args.strategy,
    tone: args.request.tone,
    goal: args.request.goal,
    stage: args.request.stage,
    heuristicScore: args.request.heuristicScore,
    heuristicTier: args.request.heuristicTier,
    selectedIntent: args.generation.intent,
    replyInsights: args.replyInsights,
    styleCard: args.styleCard || null,
    creatorProfileHints: args.creatorProfileHints || null,
    creatorAgentContext: args.creatorAgentContext || null,
    profileReplyContext: args.profileReplyContext || null,
    groundingPacket: args.generation.groundingPacket,
    maxCharacterLimit: 280,
    userHandle: args.xHandle || null,
    visualContext: args.visualContext,
    preflightResult: args.preflightResult || null,
    retrievalContext:
      args.userId && args.xHandle
        ? {
            userId: args.userId,
            xHandle: args.xHandle,
          }
        : null,
  });
}

export const cleanReplyDraftStreamChunk = cleanSharedReplyDraftStreamChunk;
export const finalizeReplyDraftText = finalizeSharedReplyDraftText;

function sanitizeReplyOption(args: {
  option: ExtensionReplyOption;
  fallbackText: string;
  strategy: GrowthStrategySnapshot;
  groundingPacket: GroundingPacket;
  sourceText: string;
  strategyPillar: string;
  policy?: ReplyConstraintPolicy | null;
}) {
  return {
    ...args.option,
    text: sanitizeReplyText({
      candidate: args.option.text,
      fallbackText: args.fallbackText,
      sourceText: args.sourceText,
      strategyPillar: args.strategyPillar,
      strategy: args.strategy,
      groundingPacket: args.groundingPacket,
      policy: args.policy || null,
      visualContext: null,
    }),
  };
}

export function buildExtensionReplyDraft(args: {
  request: ExtensionReplyDraftRequest;
  strategy: GrowthStrategySnapshot;
  replyInsights?: ReplyInsights | null;
  selectedIntent?: ExtensionReplyIntentMetadata;
}): ExtensionReplyDraftBuildResult {
  const generation = buildReplyDraftGenerationContext(args);
  const strategyPillar = generation.strategyPillar;
  const angleLabel = generation.angleLabel;
  const focusPhrase = pickFocusPhrase(args.request.tweetText);
  const groundingPacket = generation.groundingPacket;
  const safeFallback =
    generation.policy.sourceShape === "casual_observation"
      ? buildCasualReplyText({
          sourceText: args.request.tweetText,
          variant: "relatable",
        })
      : args.request.tone === "playful"
      ? `${focusPhrase || "this"} being the whole bit is kind of perfect honestly.`
      : `the missing layer is ${buildPillarLens(strategyPillar)}. that's usually what makes the point usable instead of just agreeable.`;
  const boldFallback =
    generation.policy.sourceShape === "casual_observation"
      ? buildCasualReplyText({
          sourceText: args.request.tweetText,
          variant: "deadpan",
        })
      : args.request.tone === "playful"
      ? `hotter take: ${focusPhrase || "the joke"} working this well is exactly why a serious reply would ruin it.`
      : `hotter take: without ${buildPillarLens(strategyPillar)}, this stays interesting but not actionable.`;
  const options = [
    sanitizeReplyOption({
      option: {
        id: "safe-1",
        label: "safe",
        text: buildPrimaryFallbackReply({
          request: args.request,
          strategy: args.strategy,
          pillar: strategyPillar,
          focusPhrase,
          policy: generation.policy,
        }),
        ...(generation.intent ? { intent: generation.intent } : {}),
      },
      fallbackText: safeFallback,
      strategy: args.strategy,
      groundingPacket,
      sourceText: args.request.tweetText,
      strategyPillar,
      policy: generation.policy,
    }),
    sanitizeReplyOption({
      option: {
        id: "bold-1",
        label: "bold",
        text: buildSecondaryFallbackReply({
          request: args.request,
          pillar: strategyPillar,
          focusPhrase,
          policy: generation.policy,
        }),
        ...(generation.intent ? { intent: generation.intent } : {}),
      },
      fallbackText: boldFallback,
      strategy: args.strategy,
      groundingPacket,
      sourceText: args.request.tweetText,
      strategyPillar,
      policy: generation.policy,
    }),
  ];

  return {
    response: {
      options,
      notes: generation.notes,
    },
    strategyPillar,
    angleLabel,
    groundingPacket,
  };
}
