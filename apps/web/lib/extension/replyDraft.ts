import type { GroundingPacket } from "../agent-v2/orchestrator/groundingPacket.ts";
import type { GrowthStrategySnapshot } from "../onboarding/growthStrategy.ts";
import {
  buildReplyIntentPlanForDraft,
  buildReplyLearningNotes,
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

function buildSafeReply(args: {
  request: ExtensionReplyDraftRequest;
  strategy: GrowthStrategySnapshot;
  pillar: string;
  angleLabel: string;
  focusPhrase: string | null;
}) {
  const lens = buildPillarLens(args.pillar);
  const lead =
    args.request.tone === "dry"
      ? "the useful extension is"
      : args.request.tone === "warm"
        ? "the part worth underscoring might be"
        : args.request.tone === "builder"
          ? "the missing layer is"
          : "the real hinge is";
  const closer =
    args.request.tweetText.includes("?")
      ? "what example makes that clearest in practice?"
      : "that's usually what makes the point stick instead of just sounding right.";

  if (args.focusPhrase) {
    return `${lead} ${lens}. that's where ${args.focusPhrase} turns into something people can actually reuse. ${closer}`;
  }

  return `${lead} ${lens}. ${closer}`;
}

function buildBoldReply(args: {
  request: ExtensionReplyDraftRequest;
  pillar: string;
  focusPhrase: string | null;
}) {
  const lens = buildPillarLens(args.pillar);
  const focus = args.focusPhrase || "the headline";
  const lead =
    args.request.tone === "warm" ? "slightly hotter take:" : "hotter take:";

  return `${lead} ${focus} is not the hard part. ${lens} is. otherwise this stays interesting but not usable.`;
}

export function buildReplyGroundingPacket(args: {
  request: ExtensionReplyDraftRequest;
  strategy: GrowthStrategySnapshot;
  strategyPillar: string;
  angleLabel: string;
}): GroundingPacket {
  return {
    durableFacts: [
      `Known for: ${args.strategy.knownFor}`,
      `Target audience: ${args.strategy.targetAudience}`,
      `Primary content pillar: ${args.strategyPillar}`,
      ...args.strategy.truthBoundary.verifiedFacts,
    ],
    turnGrounding: [
      args.request.tweetText,
      `Reply angle: ${args.angleLabel}`,
      ...args.strategy.truthBoundary.inferredThemes.slice(0, 4),
    ],
    allowedFirstPersonClaims: [],
    allowedNumbers: [],
    forbiddenClaims: [],
    unknowns: args.strategy.truthBoundary.unknowns,
    sourceMaterials: [],
  };
}

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
  const intentPlan = args.selectedIntent
    ? {
        angleLabel: args.selectedIntent.label,
        label: args.selectedIntent.label,
        focusPhrase: pickFocusPhrase(args.request.tweetText),
        strategyPillar: args.selectedIntent.strategyPillar,
        rationale: args.selectedIntent.rationale,
        anchor: args.selectedIntent.anchor,
      }
    : buildReplyIntentPlanForDraft({
        sourceText: args.request.tweetText,
        goal: args.request.goal,
        strategy: args.strategy,
        replyInsights: args.replyInsights,
      });
  const strategyPillar = intentPlan.strategyPillar;
  const angleLabel = intentPlan.angleLabel;
  const focusPhrase = intentPlan.focusPhrase ?? pickFocusPhrase(args.request.tweetText);
  const groundingPacket = buildReplyGroundingPacket({
    request: args.request,
    strategy: args.strategy,
    strategyPillar,
    angleLabel,
  });
  const safeFallback = `the missing layer is ${buildPillarLens(strategyPillar)}. that's usually what makes the point usable instead of just agreeable.`;
  const boldFallback = `hotter take: without ${buildPillarLens(strategyPillar)}, this stays interesting but not actionable.`;
  const options = [
    sanitizeReplyOption({
      option: {
        id: "safe-1",
        label: "safe",
        text: buildSafeReply({
          request: args.request,
          strategy: args.strategy,
          pillar: strategyPillar,
          angleLabel,
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
        text: buildBoldReply({
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
  const notes = [
    `Anchored to: ${strategyPillar}`,
    `Angle: ${angleLabel.replace(/_/g, " ")}`,
    `Intent: ${intentPlan.rationale}`,
    ...buildReplyLearningNotes(args.replyInsights),
    ...args.strategy.ambiguities.slice(0, 1).map((entry) => `Tentative positioning: ${entry}`),
  ];

  return {
    response: {
      options,
      notes,
    },
    strategyPillar,
    angleLabel,
    groundingPacket,
  };
}
