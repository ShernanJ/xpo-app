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
  type ReplySourceContext,
  type ReplyVisualContextSummary,
} from "../reply-engine/index.ts";
import {
  buildReplyIntentPlanForDraft,
  buildReplyLearningNotes,
  type ExtensionReplyIntentPlan,
} from "./replyIntent.ts";
import { collectKeywords, normalizeWhitespace, sanitizeReplyText } from "./replyQuality.ts";
import type { ReplyInsights } from "./replyOpportunities.ts";
import type {
  ExtensionReplyDraftRequest,
  ExtensionReplyIntentMetadata,
  ExtensionReplyDraftResponse,
  ExtensionReplyOption,
  ExtensionReplyTone,
} from "./types";

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
  intent: ExtensionReplyIntentMetadata;
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

function resolveToneDirection(tone: ExtensionReplyTone) {
  switch (tone) {
    case "dry":
      return "Be crisp, understated, and analytical.";
    case "warm":
      return "Be human and encouraging without sounding soft or generic.";
    case "bold":
      return "Be sharp and high-conviction without turning hostile.";
    case "builder":
    default:
      return "Sound like an experienced operator giving a practical next layer.";
  }
}

function buildPrimaryFallbackReply(args: {
  request: ExtensionReplyDraftRequest;
  strategy: GrowthStrategySnapshot;
  pillar: string;
  focusPhrase: string | null;
}) {
  const lens = buildPillarLens(args.pillar);
  const lead =
    args.request.tone === "dry"
      ? "yeah. the part people usually miss is"
      : args.request.tone === "warm"
        ? "yeah. the part worth underscoring is"
        : args.request.tone === "builder"
          ? "yeah. the thing that makes this usable is"
          : "hotter take: the whole thing is";

  if (args.focusPhrase) {
    return `${lead} ${lens}. that's what turns ${args.focusPhrase} from a take into something someone can actually use.`;
  }

  return `${lead} ${lens}. that's what makes the point useful instead of just relatable.`;
}

function buildSecondaryFallbackReply(args: {
  request: ExtensionReplyDraftRequest;
  pillar: string;
  focusPhrase: string | null;
}) {
  const lens = buildPillarLens(args.pillar);
  const focus = args.focusPhrase || "the headline";
  const lead = args.request.tone === "warm" ? "yeah but" : "hotter take:";

  return `${lead} ${focus} isn't the hard part. ${lens} is. otherwise the reply reads true without really going anywhere.`;
}

export function buildReplyGroundingPacket(args: {
  request: ExtensionReplyDraftRequest;
  strategy: GrowthStrategySnapshot;
  strategyPillar: string;
  angleLabel: string;
}): GroundingPacket {
  return buildSharedReplyGroundingPacket({
    strategy: args.strategy,
    sourceContext: buildReplySourceContextFromExtensionRequest(args.request),
    strategyPillar: args.strategyPillar,
    angleLabel: args.angleLabel,
  });
}

function resolveReplyIntentPlan(args: {
  request: ExtensionReplyDraftRequest;
  strategy: GrowthStrategySnapshot;
  replyInsights?: ReplyInsights | null;
  selectedIntent?: ExtensionReplyIntentMetadata;
}): ExtensionReplyIntentPlan {
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
}): ReplyDraftGenerationContext {
  const intentPlan = resolveReplyIntentPlan(args);
  const groundingPacket = buildReplyGroundingPacket({
    request: args.request,
    strategy: args.strategy,
    strategyPillar: intentPlan.strategyPillar,
    angleLabel: intentPlan.angleLabel,
  });
  const notes = [
    `Anchored to: ${intentPlan.strategyPillar}`,
    `Angle: ${intentPlan.angleLabel.replace(/_/g, " ")}`,
    `Intent: ${intentPlan.rationale}`,
    ...buildReplyLearningNotes(args.replyInsights),
    ...args.strategy.ambiguities.slice(0, 1).map((entry) => `Tentative positioning: ${entry}`),
  ];

  return {
    strategyPillar: intentPlan.strategyPillar,
    angleLabel: intentPlan.angleLabel,
    groundingPacket,
    intent: {
      label: intentPlan.label,
      strategyPillar: intentPlan.strategyPillar,
      anchor: intentPlan.anchor,
      rationale: intentPlan.rationale,
    },
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
  });
}

export function buildReplyDraftUserPrompt(args: {
  request: ExtensionReplyDraftRequest;
  generation: ReplyDraftGenerationContext;
  sourceContext?: ReplySourceContext | null;
  visualContext?: ReplyVisualContextSummary | null;
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
}): Promise<PreparedReplyPromptPacket> {
  return prepareReplyPromptPacket({
    sourceContext: buildReplySourceContextFromExtensionRequest(args.request),
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
    }),
  };
}

export function buildExtensionReplyDraft(args: {
  request: ExtensionReplyDraftRequest;
  strategy: GrowthStrategySnapshot;
  replyInsights?: ReplyInsights | null;
  selectedIntent?: ExtensionReplyIntentMetadata;
}): ExtensionReplyDraftBuildResult {
  const intentPlan = resolveReplyIntentPlan(args);
  const strategyPillar = intentPlan.strategyPillar;
  const angleLabel = intentPlan.angleLabel;
  const focusPhrase = intentPlan.focusPhrase ?? pickFocusPhrase(args.request.tweetText);
  const generation = buildReplyDraftGenerationContext(args);
  const groundingPacket = generation.groundingPacket;
  const safeFallback = `the missing layer is ${buildPillarLens(strategyPillar)}. that's usually what makes the point usable instead of just agreeable.`;
  const boldFallback = `hotter take: without ${buildPillarLens(strategyPillar)}, this stays interesting but not actionable.`;
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
        }),
        intent: {
          label: intentPlan.label,
          strategyPillar,
          anchor: intentPlan.anchor,
          rationale: intentPlan.rationale,
        },
      },
      fallbackText: safeFallback,
      strategy: args.strategy,
      groundingPacket,
      sourceText: args.request.tweetText,
      strategyPillar,
    }),
    sanitizeReplyOption({
      option: {
        id: "bold-1",
        label: "bold",
        text: buildSecondaryFallbackReply({
          request: args.request,
          pillar: strategyPillar,
          focusPhrase,
        }),
        intent: {
          label: intentPlan.label,
          strategyPillar,
          anchor: intentPlan.anchor,
          rationale: intentPlan.rationale,
        },
      },
      fallbackText: boldFallback,
      strategy: args.strategy,
      groundingPacket,
      sourceText: args.request.tweetText,
      strategyPillar,
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
