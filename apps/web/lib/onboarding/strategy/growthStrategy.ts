import type { CreatorEvaluationCheck } from "../analysis/evaluation";
import type { CreatorProfile, PerformanceModel } from "../types";

export interface GrowthStrategyConfidenceSummary {
  overall: number;
  positioning: number;
  replySignal: number;
  readiness: "ready" | "caution" | "not_ready";
}

export interface GrowthStrategyTruthBoundary {
  verifiedFacts: string[];
  inferredThemes: string[];
  unknowns: string[];
}

export interface GrowthStrategySnapshot {
  knownFor: string;
  targetAudience: string;
  contentPillars: string[];
  replyGoals: string[];
  profileConversionCues: string[];
  offBrandThemes: string[];
  ambiguities: string[];
  confidence: GrowthStrategyConfidenceSummary;
  truthBoundary: GrowthStrategyTruthBoundary;
}

function humanize(value: string | null | undefined): string {
  return (value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactList(values: Array<string | null | undefined>, limit: number): string[] {
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

function lookupScore(
  checks: CreatorEvaluationCheck[],
  key: CreatorEvaluationCheck["key"],
  fallback: number,
): number {
  return checks.find((check) => check.key === key)?.score ?? fallback;
}

function buildKnownFor(profile: CreatorProfile): string {
  const effectiveNiche =
    profile.niche.primaryNiche === "generalist" && profile.niche.targetNiche
      ? profile.niche.targetNiche
      : profile.niche.primaryNiche;
  const nicheLabel = humanize(effectiveNiche) || "a clearer niche";
  const pillar = profile.topics.contentPillars[0]?.trim();

  if (pillar) {
    return `${nicheLabel} through ${pillar}`;
  }

  return nicheLabel;
}

function buildTargetAudience(profile: CreatorProfile): string {
  return (
    compactList(
      [
        profile.niche.audienceIntent,
        ...profile.topics.audienceSignals,
        profile.strategy.targetState.planningNote,
      ],
      1,
    )[0] || "people most likely to follow for this niche"
  );
}

function buildReplyGoals(profile: CreatorProfile): string[] {
  const followerBand = profile.identity.followerBand;
  const goals: string[] = [];

  if (followerBand === "0-1k") {
    goals.push("Turn relevant replies into profile clicks from the right niche.");
    goals.push("Add one concrete layer instead of broad agreement.");
    goals.push("Convert the strongest reply angle into a standalone post within 24 hours.");
  } else if (followerBand === "1k-10k") {
    goals.push("Use replies to reinforce authority with adjacent creators and peers.");
    goals.push("Add usable nuance that makes the account easier to remember.");
  } else {
    goals.push("Use replies to sharpen authority and protect account coherence.");
    goals.push("Prefer high-signal conversations over generic visibility.");
  }

  if (profile.distribution.primaryLoop === "reply_driven") {
    goals.unshift("Prioritize replies that fit the account's discovery loop.");
  }

  return compactList(goals, 4);
}

function buildProfileConversionCues(profile: CreatorProfile, knownFor: string): string[] {
  return compactList(
    [
      `Bio, pinned post, and recent posts should make "${knownFor}" obvious within one glance.`,
      `Recent posts should repeatedly ladder back to ${profile.topics.contentPillars[0] || "the top niche pillar"}.`,
      `Replies should reinforce ${profile.niche.targetNiche ? humanize(profile.niche.targetNiche) : humanize(profile.niche.primaryNiche)} instead of adding random side quests.`,
      profile.playbook.contentContract,
      profile.playbook.conversationTactic,
    ],
    5,
  );
}

function buildOffBrandThemes(profile: CreatorProfile): string[] {
  const entries: string[] = [];

  if (profile.niche.primaryNiche === "generalist") {
    entries.push("broad generalist commentary with no niche tie");
  }

  for (const adjustment of profile.strategy.delta.adjustments) {
    if (adjustment.direction === "decrease" || adjustment.direction === "shift") {
      entries.push(adjustment.note);
    }
  }

  if (profile.execution.linkDependence === "high") {
    entries.push("link-first posts or replies that hide the point");
  }

  if (profile.execution.mentionDependence === "high") {
    entries.push("name-dropping or audience-borrowing without a point of view");
  }

  return compactList(entries, 5);
}

function buildAmbiguities(args: {
  profile: CreatorProfile;
  checks: CreatorEvaluationCheck[];
  sampleSize: number;
}): string[] {
  const ambiguities: string[] = [];
  const positioningScore = lookupScore(args.checks, "niche_overlay_quality", 50);
  const targetNicheScore = lookupScore(args.checks, "target_niche_quality", 50);
  const strategyScore = lookupScore(args.checks, "strategy_specificity", 50);

  if (args.profile.niche.primaryNiche === "generalist" && args.profile.niche.targetNiche) {
    ambiguities.push(
      `The account still reads broad, so default to ${humanize(args.profile.niche.targetNiche)} until stronger proof arrives.`,
    );
  }

  if (positioningScore < 65 || targetNicheScore < 65) {
    ambiguities.push("Positioning confidence is still moderate, so avoid acting like the niche is fully locked.");
  }

  if (strategyScore < 60) {
    ambiguities.push("Strategy guidance is still somewhat generic, so keep recommendations narrow and concrete.");
  }

  if (args.sampleSize < 30) {
    ambiguities.push(`Sample depth is only ${args.sampleSize} posts, so inferred themes may still move.`);
  }

  if (args.profile.reply.signalConfidence < 55) {
    ambiguities.push("Reply-style learning is still thin, so reply advice should stay conservative.");
  }

  return compactList(ambiguities, 5);
}

export function buildGrowthStrategySnapshot(args: {
  creatorProfile: CreatorProfile;
  performanceModel: PerformanceModel;
  evaluationChecks: CreatorEvaluationCheck[];
  evaluationOverallScore: number;
  readiness: "ready" | "caution" | "not_ready";
  sampleSize: number;
}): GrowthStrategySnapshot {
  const knownFor = buildKnownFor(args.creatorProfile);
  const targetAudience = buildTargetAudience(args.creatorProfile);
  const contentPillars = compactList(
    [
      ...args.creatorProfile.topics.contentPillars,
      ...args.creatorProfile.strategy.recommendedAngles,
      args.performanceModel.nextActions[0],
    ],
    5,
  );
  const ambiguities = buildAmbiguities({
    profile: args.creatorProfile,
    checks: args.evaluationChecks,
    sampleSize: args.sampleSize,
  });
  const verifiedFacts = compactList(
    [
      `Primary goal: ${humanize(args.creatorProfile.strategy.primaryGoal)}`,
      `Follower band: ${humanize(args.creatorProfile.identity.followerBand)}`,
      `Primary niche: ${humanize(args.creatorProfile.niche.primaryNiche)}`,
      args.creatorProfile.niche.targetNiche
        ? `Target niche: ${humanize(args.creatorProfile.niche.targetNiche)}`
        : null,
      args.creatorProfile.performance.bestHookPattern
        ? `Best hook pattern: ${humanize(args.creatorProfile.performance.bestHookPattern)}`
        : null,
      `Primary distribution loop: ${humanize(args.creatorProfile.distribution.primaryLoop)}`,
    ],
    6,
  );
  const inferredThemes = compactList(
    [
      knownFor,
      ...contentPillars,
      ...args.creatorProfile.strategy.currentStrengths,
      ...args.creatorProfile.strategy.nextMoves,
    ],
    8,
  );
  const positioningScore = Number(
    (
      lookupScore(args.evaluationChecks, "niche_overlay_quality", 50) * 0.45 +
      lookupScore(args.evaluationChecks, "target_niche_quality", 50) * 0.35 +
      lookupScore(args.evaluationChecks, "strategy_specificity", 50) * 0.2
    ).toFixed(2),
  );

  return {
    knownFor,
    targetAudience,
    contentPillars,
    replyGoals: buildReplyGoals(args.creatorProfile),
    profileConversionCues: buildProfileConversionCues(args.creatorProfile, knownFor),
    offBrandThemes: buildOffBrandThemes(args.creatorProfile),
    ambiguities,
    confidence: {
      overall: args.evaluationOverallScore,
      positioning: positioningScore,
      replySignal: Number(args.creatorProfile.reply.signalConfidence.toFixed(2)),
      readiness: args.readiness,
    },
    truthBoundary: {
      verifiedFacts,
      inferredThemes,
      unknowns: compactList(ambiguities, 6),
    },
  };
}
