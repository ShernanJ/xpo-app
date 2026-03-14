import type { StrategyAdjustments, ReplyInsights } from "../extension/replyOpportunities.ts";
import type { ContentAdjustments, ContentInsights } from "./contentInsights.ts";
import type { ProfileConversionAudit } from "./profile/profileConversionAudit.ts";
import type { CreatorAgentContext } from "./agentContext.ts";

export type OperatingQueueLane = "profile" | "reply" | "post" | "review";
export type OperatingQueuePriority = "high" | "medium" | "low";
export type OperatingQueueActionTarget =
  | "open_analysis"
  | "open_growth_guide"
  | "open_draft_queue"
  | "open_extension";

export interface OperatingQueueItem {
  id: string;
  lane: OperatingQueueLane;
  priority: OperatingQueuePriority;
  title: string;
  rationale: string;
  actionLabel: string;
  actionTarget: OperatingQueueActionTarget;
  supportingSignals: string[];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function buildReplyConversionSignals(replyInsights?: ReplyInsights | null): string[] {
  if (!replyInsights) {
    return [];
  }

  const next: string[] = [];
  const topAnchor = replyInsights.topIntentAnchors?.[0];
  const topIntent = replyInsights.topIntentLabels?.[0];
  const fullyAttributed = replyInsights.intentAttribution?.fullyAttributedOutcomeCount || 0;

  if (topAnchor?.label && (topAnchor.totalProfileClicks || 0) > 0) {
    next.push(
      `Winning reply anchor: "${topAnchor.label}" (${topAnchor.totalProfileClicks} profile-click events).`,
    );
  }

  if (topIntent?.label && (topIntent.totalFollowerDelta || 0) > 0) {
    next.push(
      `Best converting reply intent: ${topIntent.label} (${topIntent.totalFollowerDelta} follower delta).`,
    );
  }

  if (fullyAttributed > 0) {
    next.push(`${fullyAttributed} reply outcomes are fully attributed end to end.`);
  }

  return next;
}

function buildProfileItem(args: {
  context: CreatorAgentContext;
  profileConversionAudit: ProfileConversionAudit;
}): OperatingQueueItem | null {
  const score = args.profileConversionAudit.score;
  const isWeak = score < 60 || args.profileConversionAudit.gaps.length > 0;
  const title = isWeak
    ? `Tighten the profile around ${args.context.growthStrategySnapshot.knownFor}`
    : `Protect profile clarity for ${args.context.growthStrategySnapshot.knownFor}`;

  return {
    id: "profile-fix",
    lane: "profile",
    priority: score < 55 ? "high" : score < 70 ? "medium" : "low",
    title,
    rationale:
      args.profileConversionAudit.gaps[0] ||
      args.profileConversionAudit.headline,
    actionLabel: "Open Profile Analysis",
    actionTarget: "open_analysis",
    supportingSignals: unique([
      args.profileConversionAudit.headline,
      ...args.profileConversionAudit.recommendedBioEdits,
      ...args.profileConversionAudit.recentPostCoherenceNotes,
    ]).slice(0, 3),
  };
}

function buildReplyItem(args: {
  context: CreatorAgentContext;
  replyInsights?: ReplyInsights | null;
  strategyAdjustments?: StrategyAdjustments | null;
}): OperatingQueueItem | null {
  if (!args.replyInsights || args.replyInsights.totalOpportunities === 0) {
    return {
      id: "reply-start",
      lane: "reply",
      priority: "high",
      title: "Start a reply loop inside the right niche",
      rationale:
        args.context.growthStrategySnapshot.replyGoals[0] ||
        "The account still needs reply activity that reinforces positioning.",
      actionLabel: "Open Companion",
      actionTarget: "open_extension",
      supportingSignals: unique(args.context.growthStrategySnapshot.replyGoals).slice(0, 3),
    };
  }

  const topPillar = args.replyInsights.topPillars[0]?.label;
  const needsCorrection = (args.replyInsights.selectionRate || 0) < 0.25;
  const conversionSignals = buildReplyConversionSignals(args.replyInsights);
  return {
    id: "reply-focus",
    lane: "reply",
    priority: needsCorrection ? "high" : "medium",
    title: needsCorrection
      ? "Refocus reply angles before scaling volume"
      : `Double down on ${topPillar || args.context.growthStrategySnapshot.contentPillars[0] || "the top pillar"} replies`,
    rationale:
      args.replyInsights.cautionSignals[0] ||
      args.replyInsights.bestSignals[0] ||
      args.context.growthStrategySnapshot.replyGoals[0],
    actionLabel: "Open Companion",
    actionTarget: "open_extension",
    supportingSignals: unique([
      ...conversionSignals,
      ...(args.strategyAdjustments?.reinforce || []),
      ...(args.strategyAdjustments?.experiments || []),
      ...(args.replyInsights.bestSignals || []),
    ]).slice(0, 3),
  };
}

function buildPostItem(args: {
  context: CreatorAgentContext;
  contentInsights?: ContentInsights | null;
  contentAdjustments?: ContentAdjustments | null;
}): OperatingQueueItem | null {
  const nextAction = args.context.performanceModel.nextActions[0];
  if (!args.contentInsights || args.contentInsights.totalCandidates === 0) {
    return {
      id: "post-generate",
      lane: "post",
      priority: "medium",
      title: "Generate one pillar-led post this week",
      rationale:
        nextAction ||
        `Turn ${args.context.growthStrategySnapshot.contentPillars[0] || "the top pillar"} into a repeatable post series.`,
      actionLabel: "Open Growth Guide",
      actionTarget: "open_growth_guide",
      supportingSignals: unique([
        nextAction || "",
        ...args.context.growthStrategySnapshot.contentPillars.slice(0, 2),
      ]).slice(0, 3),
    };
  }

  const needsMoreDrafting =
    (args.contentInsights.postRate || 0) < 0.4 ||
    args.contentInsights.statusCounts.pending > 0;

  return {
    id: "post-loop",
    lane: "post",
    priority: needsMoreDrafting ? "medium" : "low",
    title: needsMoreDrafting
      ? "Turn the best angle into a posted draft"
      : "Repeat the post format already getting shipped",
    rationale:
      args.contentInsights.cautionSignals[0] ||
      args.contentInsights.bestSignals[0] ||
      nextAction ||
      "Keep the post loop inside the current positioning pillars.",
    actionLabel: needsMoreDrafting ? "Open Draft Review" : "Open Growth Guide",
    actionTarget: needsMoreDrafting ? "open_draft_queue" : "open_growth_guide",
    supportingSignals: unique([
      ...(args.contentAdjustments?.reinforce || []),
      ...(args.contentAdjustments?.experiments || []),
      ...(args.contentInsights.bestSignals || []),
      nextAction || "",
    ]).slice(0, 3),
  };
}

function buildReviewItem(args: {
  context: CreatorAgentContext;
  replyInsights?: ReplyInsights | null;
  contentInsights?: ContentInsights | null;
  strategyAdjustments?: StrategyAdjustments | null;
  contentAdjustments?: ContentAdjustments | null;
}): OperatingQueueItem | null {
  const needsPostObservation =
    Boolean(args.contentInsights) &&
    (args.contentInsights?.statusCounts.posted || 0) > 0 &&
    (args.contentInsights?.observedRate || 0) < 1;
  const needsReplyObservation =
    Boolean(args.replyInsights) &&
    (args.replyInsights?.postRate || 0) > 0 &&
    (args.replyInsights?.observedRate || 0) < 1;

  if (needsPostObservation) {
    return {
      id: "review-posts",
      lane: "review",
      priority: "high",
      title: "Record outcomes from posted drafts",
      rationale:
        args.contentInsights?.cautionSignals[0] ||
        "Posts have been marked posted, but the learning loop is still missing observed metrics.",
      actionLabel: "Open Draft Review",
      actionTarget: "open_draft_queue",
      supportingSignals: unique([
        ...(args.contentInsights?.unknowns || []),
        ...(args.contentAdjustments?.notes || []),
      ]).slice(0, 3),
    };
  }

  if (needsReplyObservation) {
    return {
      id: "review-replies",
      lane: "review",
      priority: "high",
      title: "Log reply outcomes before scaling reply volume",
      rationale:
        args.replyInsights?.cautionSignals[0] ||
        "Replys are getting posted, but outcome data is still missing.",
      actionLabel: "Open Companion",
      actionTarget: "open_extension",
      supportingSignals: unique([
        ...(args.replyInsights?.unknowns || []),
        ...(args.strategyAdjustments?.notes || []),
      ]).slice(0, 3),
    };
  }

  const conversionSignals = buildReplyConversionSignals(args.replyInsights);
  return {
    id: "review-learning",
    lane: "review",
    priority: "low",
    title: "Review what changed from recent learning",
    rationale:
      conversionSignals[0] ||
      args.strategyAdjustments?.notes[0] ||
      args.contentAdjustments?.notes[0] ||
      "Use the current learning signals to keep the account coherent.",
    actionLabel: "Open Profile Breakdown",
    actionTarget: "open_analysis",
    supportingSignals: unique([
      ...conversionSignals,
      ...(args.strategyAdjustments?.reinforce || []),
      ...(args.contentAdjustments?.reinforce || []),
      ...(args.replyInsights?.bestSignals || []),
      ...(args.contentInsights?.bestSignals || []),
    ]).slice(0, 3),
  };
}

export function buildOperatingQueue(args: {
  context: CreatorAgentContext;
  profileConversionAudit: ProfileConversionAudit;
  replyInsights?: ReplyInsights | null;
  strategyAdjustments?: StrategyAdjustments | null;
  contentInsights?: ContentInsights | null;
  contentAdjustments?: ContentAdjustments | null;
}): OperatingQueueItem[] {
  return [
    buildProfileItem(args),
    buildReplyItem(args),
    buildPostItem(args),
    buildReviewItem(args),
  ].filter((item): item is OperatingQueueItem => Boolean(item));
}
