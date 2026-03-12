import type { VoiceStyleCard } from "../agent-v2/core/styleProfile.ts";
import type { GrowthStrategySnapshot } from "../onboarding/growthStrategy.ts";
import { buildReplyGroundingPacket } from "./replyDraft.ts";
import {
  collectKeywords,
  normalizeComparable,
  normalizeWhitespace,
  sanitizeReplyText,
} from "./replyQuality.ts";
import type {
  ExtensionOpportunity,
  ExtensionOpportunityCandidate,
  ExtensionReplyOptionsResponse,
  ExtensionSuggestedAngle,
} from "./types.ts";

function inferLowercasePreference(styleCard: VoiceStyleCard | null): boolean {
  if (!styleCard) {
    return false;
  }

  const explicitCasing = styleCard.userPreferences?.casing;
  if (explicitCasing === "lowercase") {
    return true;
  }
  if (explicitCasing === "normal" || explicitCasing === "uppercase") {
    return false;
  }

  const signals = [
    ...(styleCard.formattingRules || []),
    ...(styleCard.customGuidelines || []),
  ]
    .join(" ")
    .toLowerCase();

  return (
    signals.includes("all lowercase") ||
    signals.includes("always lowercase") ||
    signals.includes("never uses capitalization") ||
    signals.includes("no uppercase")
  );
}

function inferConcisePreference(styleCard: VoiceStyleCard | null) {
  const pacing = styleCard?.pacing?.toLowerCase() || "";
  const guidance = (styleCard?.customGuidelines || []).join(" ").toLowerCase();
  const writingGoal = styleCard?.userPreferences?.writingGoal;

  return (
    writingGoal === "growth_first" ||
    pacing.includes("short") ||
    pacing.includes("punchy") ||
    pacing.includes("scan") ||
    guidance.includes("tight") ||
    guidance.includes("direct")
  );
}

function applyVoiceCase(value: string, lowercase: boolean) {
  const normalized = normalizeWhitespace(value);
  return lowercase ? normalized.toLowerCase() : normalized;
}

function buildPillarLens(pillar: string) {
  const normalized = pillar.toLowerCase();
  if (/\b(position|niche|brand|coherence)\b/.test(normalized)) {
    return "the positioning clarity";
  }
  if (/\b(reply|conversation|question)\b/.test(normalized)) {
    return "the follow-through in the reply";
  }
  if (/\b(system|workflow|process|loop|operating|framework)\b/.test(normalized)) {
    return "the operating system behind it";
  }
  if (/\b(proof|example|result|case|lesson)\b/.test(normalized)) {
    return "the proof layer";
  }
  return pillar;
}

function pickFocusPhrase(text: string) {
  const keywords = collectKeywords(text);
  if (keywords.length === 0) {
    return "the headline";
  }

  return keywords.slice(0, 2).join(" ");
}

function compactAudience(targetAudience: string) {
  const cleaned = normalizeWhitespace(targetAudience);
  if (!cleaned) {
    return "your audience";
  }

  const words = cleaned.split(" ");
  return words.length > 6 ? words.slice(0, 6).join(" ") : cleaned;
}

function buildTemplate(args: {
  label: ExtensionSuggestedAngle;
  candidate: ExtensionOpportunityCandidate;
  strategy: GrowthStrategySnapshot;
  strategyPillar: string;
  concise: boolean;
}) {
  const focus = pickFocusPhrase(args.candidate.text);
  const lens = buildPillarLens(args.strategyPillar);
  const audience = compactAudience(args.strategy.targetAudience);

  switch (args.label) {
    case "nuance":
      return args.concise
        ? `the useful nuance is ${lens}. that's what turns ${focus} into something people can actually use.`
        : `the useful nuance is ${lens}. that's usually what turns ${focus} from an agreeable point into something someone can actually use.`;
    case "sharpen":
      return args.concise
        ? `sharper take: ${focus} is not the real hinge. ${lens} is. that's the part that changes what someone does next.`
        : `sharper version: ${focus} is not the real hinge here. ${lens} is. that's the part that actually changes what someone does next.`;
    case "disagree":
      return args.concise
        ? `one pushback: ${focus} is not the hard part. ${lens} is. otherwise this sounds right without becoming usable.`
        : `one pushback: ${focus} is not the hard part. ${lens} is. otherwise the take sounds right without giving someone a usable next move.`;
    case "example":
      return args.concise
        ? `the concrete example is ${lens}. that's where ${focus} stops sounding smart and starts feeling usable.`
        : `a better example lands on ${lens}. that's where ${focus} stops sounding smart and starts feeling usable in practice.`;
    case "translate":
      return args.concise
        ? `translated for ${audience}: this is really about ${lens}, not just ${focus}. that's the part worth carrying into a workflow.`
        : `translated for ${audience}: this is really about ${lens}, not just ${focus}. that's the part people should carry into their actual workflow.`;
    case "known_for":
      return args.concise
        ? `the layer worth reinforcing is ${args.strategy.knownFor}. replies like this work best when they ladder back to ${args.strategyPillar}.`
        : `the layer worth reinforcing is ${args.strategy.knownFor}. replies like this work best when they ladder back to ${args.strategyPillar} instead of stopping at agreement.`;
    default:
      return `the useful nuance is ${lens}. that's what turns ${focus} into something people can actually use.`;
  }
}

function adjacentAngles(label: ExtensionSuggestedAngle): ExtensionSuggestedAngle[] {
  if (label === "nuance") {
    return ["sharpen", "example"];
  }
  if (label === "sharpen") {
    return ["nuance", "known_for"];
  }
  if (label === "disagree") {
    return ["nuance", "example"];
  }
  if (label === "example") {
    return ["nuance", "translate"];
  }
  if (label === "translate") {
    return ["nuance", "known_for"];
  }
  return ["sharpen", "nuance"];
}

export function buildExtensionReplyOptions(args: {
  post: ExtensionOpportunityCandidate;
  opportunity: ExtensionOpportunity;
  strategy: GrowthStrategySnapshot;
  strategyPillar: string;
  styleCard: VoiceStyleCard | null;
  stage: string;
  tone: string;
  goal: string;
}): ExtensionReplyOptionsResponse {
  const lowercase = inferLowercasePreference(args.styleCard);
  const concise = inferConcisePreference(args.styleCard);
  const labels: ExtensionSuggestedAngle[] = [
    args.opportunity.suggestedAngle,
    ...adjacentAngles(args.opportunity.suggestedAngle),
  ];
  const warnings = [
    ...(args.styleCard ? [] : ["No parsed voice profile was found, so replies are using onboarding context only."]),
    ...args.strategy.ambiguities.slice(0, 1),
  ];
  const groundingNotes = [
    `Anchored to ${args.strategyPillar}.`,
    `Known for ${args.strategy.knownFor}.`,
    ...args.strategy.truthBoundary.verifiedFacts.slice(0, 1),
  ].map((entry) => applyVoiceCase(entry, lowercase));
  const groundingPacket = buildReplyGroundingPacket({
    request: {
      tweetId: args.post.postId,
      tweetText: args.post.text,
      authorHandle: args.post.author.handle,
      tweetUrl: args.post.url,
      stage: "0_to_1k",
      tone: args.tone === "dry" || args.tone === "bold" || args.tone === "warm" ? args.tone : "builder",
      goal: args.goal,
    },
    strategy: args.strategy,
    strategyPillar: args.strategyPillar,
    angleLabel: args.opportunity.suggestedAngle,
  });

  const seen = new Set<string>();
  const fallback = `the useful nuance is ${buildPillarLens(args.strategyPillar)}. that's the part that makes the point usable instead of just agreeable.`;
  const options = labels
    .map((label) => {
      const template = buildTemplate({
        label,
        candidate: args.post,
        strategy: args.strategy,
        strategyPillar: args.strategyPillar,
        concise,
      });
      const sanitized = sanitizeReplyText({
        candidate: template,
        fallbackText: fallback,
        sourceText: args.post.text,
        strategyPillar: args.strategyPillar,
        strategy: args.strategy,
        groundingPacket,
        styleCard: args.styleCard,
      });
      const nextText = applyVoiceCase(sanitized, lowercase);
      const dedupeKey = normalizeComparable(nextText);
      if (!dedupeKey || seen.has(dedupeKey)) {
        return null;
      }

      seen.add(dedupeKey);
      return {
        id: `${label}-${seen.size}`,
        label,
        text: nextText,
      };
    })
    .filter((option): option is NonNullable<typeof option> => Boolean(option))
    .slice(0, 3);
  const fallbackOption = applyVoiceCase(
    sanitizeReplyText({
      candidate: fallback,
      fallbackText: fallback,
      sourceText: args.post.text,
      strategyPillar: args.strategyPillar,
      strategy: args.strategy,
      groundingPacket,
      styleCard: args.styleCard,
    }),
    lowercase,
  );

  return {
    options: options.length > 0 ? options : [{ id: "nuance-1", label: "nuance", text: fallbackOption }],
    warnings,
    groundingNotes,
  };
}
