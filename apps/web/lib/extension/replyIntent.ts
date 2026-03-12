import type { GrowthStrategySnapshot } from "../onboarding/growthStrategy.ts";
import type {
  ExtensionOpportunity,
  ExtensionOpportunityCandidate,
  ExtensionReplyIntentMetadata,
  ExtensionSuggestedAngle,
} from "./types.ts";
import { collectKeywords, normalizeComparable } from "./replyQuality.ts";

export interface ExtensionReplyIntentPlan extends ExtensionReplyIntentMetadata {
  angleLabel: ExtensionSuggestedAngle;
  focusPhrase: string | null;
}

function buildPillarLens(pillar: string): string {
  const normalized = pillar.toLowerCase();
  if (/\b(position|niche|brand|coherence)\b/.test(normalized)) {
    return "the positioning clarity";
  }
  if (/\b(reply|conversation|question)\b/.test(normalized)) {
    return "the follow-through in the reply";
  }
  if (/\b(system|workflow|process|loop|operating)\b/.test(normalized)) {
    return "the system behind it";
  }
  if (/\b(proof|example|result|case|lesson)\b/.test(normalized)) {
    return "the proof layer";
  }
  return pillar;
}

export function pickReplyStrategyPillar(args: {
  sourceText: string;
  strategy: GrowthStrategySnapshot;
}): string {
  const sourceTokens = new Set(collectKeywords(args.sourceText));
  let best = args.strategy.contentPillars[0] || args.strategy.knownFor;
  let bestScore = -1;

  for (const pillar of args.strategy.contentPillars) {
    const tokens = collectKeywords(pillar);
    const score = tokens.reduce((sum, token) => sum + (sourceTokens.has(token) ? 2 : 0), 0);
    if (score > bestScore) {
      best = pillar;
      bestScore = score;
    }
  }

  return best || args.strategy.knownFor;
}

export function pickReplyFocusPhrase(sourceText: string): string | null {
  const keywords = collectKeywords(sourceText);
  if (keywords.length === 0) {
    return null;
  }

  return keywords.slice(0, 2).join(" ");
}

export function buildReplyAngleLabel(args: {
  sourceText: string;
  goal: string;
}): ExtensionSuggestedAngle {
  const normalized = normalizeComparable(`${args.sourceText} ${args.goal}`);
  if (args.sourceText.includes("?")) {
    return "translate";
  }
  if (/\b(mistake|wrong|myth|overrated|underrated|tradeoff|only works|unless)\b/.test(normalized)) {
    return "disagree";
  }
  if (/\b(system|workflow|process|ship|build|execute|operator|loop)\b/.test(normalized)) {
    return "example";
  }
  if (/\b(follow|profile|growth|convert)\b/.test(normalized)) {
    return "known_for";
  }
  return "nuance";
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

function buildReplyIntentRationale(args: {
  angleLabel: ExtensionSuggestedAngle;
  strategyPillar: string;
  focusPhrase: string | null;
  strategy: GrowthStrategySnapshot;
}): string {
  const focus = args.focusPhrase || "the main point";
  const lens = buildPillarLens(args.strategyPillar);

  switch (args.angleLabel) {
    case "nuance":
      return `push past agreement by grounding ${focus} in ${lens}`;
    case "sharpen":
      return `tighten the claim by making ${lens} the real hinge`;
    case "disagree":
      return `add constructive pushback so the reply is useful, not agreeable`;
    case "example":
      return `make the point concrete with a usable example tied to ${lens}`;
    case "translate":
      return `translate the take into practical language for ${args.strategy.targetAudience}`;
    case "known_for":
      return `ladder the reply back to ${args.strategy.knownFor}`;
    default:
      return `anchor the reply in ${lens}`;
  }
}

function buildReplyIntentAnchor(args: {
  angleLabel: ExtensionSuggestedAngle;
  strategyPillar: string;
  focusPhrase: string | null;
}): string {
  const focus = args.focusPhrase || "the point";
  const lens = buildPillarLens(args.strategyPillar);

  switch (args.angleLabel) {
    case "known_for":
      return args.strategyPillar;
    case "translate":
      return `${focus} -> ${lens}`;
    default:
      return `${focus} | ${lens}`;
  }
}

export function buildReplyIntentPlansFromOpportunity(args: {
  post: ExtensionOpportunityCandidate;
  opportunity: ExtensionOpportunity;
  strategy: GrowthStrategySnapshot;
  strategyPillar: string;
}): ExtensionReplyIntentPlan[] {
  const focusPhrase = pickReplyFocusPhrase(args.post.text);
  const labels: ExtensionSuggestedAngle[] = [
    args.opportunity.suggestedAngle,
    ...adjacentAngles(args.opportunity.suggestedAngle),
  ];
  const seen = new Set<string>();

  return labels.filter((label) => {
    if (seen.has(label)) {
      return false;
    }
    seen.add(label);
    return true;
  }).map((angleLabel) => ({
    angleLabel,
    label: angleLabel,
    focusPhrase,
    strategyPillar: args.strategyPillar,
    rationale: buildReplyIntentRationale({
      angleLabel,
      strategyPillar: args.strategyPillar,
      focusPhrase,
      strategy: args.strategy,
    }),
    anchor: buildReplyIntentAnchor({
      angleLabel,
      strategyPillar: args.strategyPillar,
      focusPhrase,
    }),
  }));
}

export function buildReplyIntentPlanForDraft(args: {
  sourceText: string;
  goal: string;
  strategy: GrowthStrategySnapshot;
}): ExtensionReplyIntentPlan {
  const strategyPillar = pickReplyStrategyPillar({
    sourceText: args.sourceText,
    strategy: args.strategy,
  });
  const focusPhrase = pickReplyFocusPhrase(args.sourceText);
  const angleLabel = buildReplyAngleLabel({
    sourceText: args.sourceText,
    goal: args.goal,
  });

  return {
    angleLabel,
    label: angleLabel,
    focusPhrase,
    strategyPillar,
    rationale: buildReplyIntentRationale({
      angleLabel,
      strategyPillar,
      focusPhrase,
      strategy: args.strategy,
    }),
    anchor: buildReplyIntentAnchor({
      angleLabel,
      strategyPillar,
      focusPhrase,
    }),
  };
}
