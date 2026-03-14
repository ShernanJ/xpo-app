import type { GrowthStrategySnapshot } from "../onboarding/strategy/growthStrategy.ts";
import type { ReplyInsights } from "./replyOpportunities.ts";
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

function uniqueAngleLabels(labels: ExtensionSuggestedAngle[]): ExtensionSuggestedAngle[] {
  const seen = new Set<string>();
  const next: ExtensionSuggestedAngle[] = [];

  for (const label of labels) {
    if (seen.has(label)) {
      continue;
    }
    seen.add(label);
    next.push(label);
  }

  return next;
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

function overlapScore(left: string, right: string): number {
  const leftTokens = new Set(collectKeywords(left));
  if (leftTokens.size === 0) {
    return 0;
  }

  return collectKeywords(right).reduce(
    (sum, token) => sum + (leftTokens.has(token) ? 1 : 0),
    0,
  );
}

function scoreReplyIntentPlan(args: {
  plan: ExtensionReplyIntentPlan;
  replyInsights?: ReplyInsights | null;
}): number {
  const topLabel = args.replyInsights?.topIntentLabels?.[0];
  const topAnchor = args.replyInsights?.topIntentAnchors?.[0];
  const topPillar = args.replyInsights?.topPillars?.[0];
  const attributedCount =
    args.replyInsights?.intentAttribution?.fullyAttributedOutcomeCount || 0;
  const topLabelBiasScore =
    topLabel?.recencyWeightedOutcomeScore ??
    ((topLabel?.totalFollowerDelta || 0) * 2 + (topLabel?.totalProfileClicks || 0));
  const topAnchorBiasScore =
    topAnchor?.recencyWeightedOutcomeScore ??
    ((topAnchor?.totalFollowerDelta || 0) * 2 + (topAnchor?.totalProfileClicks || 0));

  if (!topLabel && !topAnchor && !topPillar && attributedCount === 0) {
    return 0;
  }

  let score = 0;
  if (topLabel?.label === args.plan.label) {
    score += 10;
    score += Math.min(8, topLabelBiasScore || 0);
    score += Math.min(4, topLabel.recentObservedCount || 0);
  }

  if (topPillar?.label === args.plan.strategyPillar) {
    score += 4;
  }

  if (topAnchor?.label) {
    if (topAnchor.label === args.plan.anchor) {
      score += 10;
    } else {
      score += Math.min(6, overlapScore(topAnchor.label, args.plan.anchor) * 2);
    }

    if ((topAnchorBiasScore || 0) > 0) {
      score += Math.min(6, topAnchorBiasScore || 0);
    }
  }

  if (attributedCount > 0) {
    score += Math.min(4, attributedCount);
  }

  return score;
}

function rankReplyIntentPlans(args: {
  plans: ExtensionReplyIntentPlan[];
  replyInsights?: ReplyInsights | null;
}): ExtensionReplyIntentPlan[] {
  return args.plans
    .map((plan, index) => ({
      plan,
      index,
      score: scoreReplyIntentPlan({
        plan,
        replyInsights: args.replyInsights,
      }),
    }))
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.plan);
}

export function buildReplyLearningNotes(replyInsights?: ReplyInsights | null): string[] {
  if (!replyInsights) {
    return [];
  }

  const next: string[] = [];
  const topAnchor = replyInsights.topIntentAnchors?.[0];
  const topIntent = replyInsights.topIntentLabels?.[0];
  const attributedCount = replyInsights.intentAttribution?.fullyAttributedOutcomeCount || 0;
  const topAnchorBiasScore =
    topAnchor?.recencyWeightedOutcomeScore ??
    ((topAnchor?.totalFollowerDelta || 0) * 2 + (topAnchor?.totalProfileClicks || 0));
  const topIntentBiasScore =
    topIntent?.recencyWeightedOutcomeScore ??
    ((topIntent?.totalFollowerDelta || 0) * 2 + (topIntent?.totalProfileClicks || 0));

  if (topAnchor?.label && (topAnchorBiasScore || 0) > 0) {
    next.push(
      `Learning bias: prefer anchors like "${topAnchor.label}" because they are converting recently.`,
    );
  }

  if (topIntent?.label && (topIntentBiasScore || 0) > 0) {
    next.push(
      `Learning bias: ${topIntent.label} is the strongest recent converting reply intent.`,
    );
  }

  if (attributedCount > 0) {
    next.push(`Learning coverage: ${attributedCount} reply outcomes are fully attributed.`);
  }

  return next.slice(0, 2);
}

export function buildReplyIntentPlansFromOpportunity(args: {
  post: ExtensionOpportunityCandidate;
  opportunity: ExtensionOpportunity;
  strategy: GrowthStrategySnapshot;
  strategyPillar: string;
  replyInsights?: ReplyInsights | null;
}): ExtensionReplyIntentPlan[] {
  const focusPhrase = pickReplyFocusPhrase(args.post.text);
  const labels = uniqueAngleLabels([
    args.opportunity.suggestedAngle,
    ...adjacentAngles(args.opportunity.suggestedAngle),
    ...(args.replyInsights?.topIntentLabels?.[0]?.label
      ? [args.replyInsights.topIntentLabels[0].label as ExtensionSuggestedAngle]
      : []),
  ]);

  return rankReplyIntentPlans({
    plans: labels.map((angleLabel) => ({
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
    })),
    replyInsights: args.replyInsights,
  });
}

export function buildReplyIntentPlanForDraft(args: {
  sourceText: string;
  goal: string;
  strategy: GrowthStrategySnapshot;
  replyInsights?: ReplyInsights | null;
}): ExtensionReplyIntentPlan {
  const strategyPillar = pickReplyStrategyPillar({
    sourceText: args.sourceText,
    strategy: args.strategy,
  });
  const focusPhrase = pickReplyFocusPhrase(args.sourceText);
  const baseAngleLabel = buildReplyAngleLabel({
    sourceText: args.sourceText,
    goal: args.goal,
  });
  const candidateLabels = uniqueAngleLabels([
    baseAngleLabel,
    ...adjacentAngles(baseAngleLabel),
    ...(args.replyInsights?.topIntentLabels?.[0]?.label
      ? [args.replyInsights.topIntentLabels[0].label as ExtensionSuggestedAngle]
      : []),
  ]);

  return rankReplyIntentPlans({
    plans: candidateLabels.map((angleLabel) => ({
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
    })),
    replyInsights: args.replyInsights,
  })[0];
}
