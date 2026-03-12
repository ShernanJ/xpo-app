import type { CreatorAgentContext } from "./agentContext.ts";
import type { OnboardingResult } from "./types.ts";

export interface ProfileConversionAudit {
  generatedAt: string;
  score: number;
  headline: string;
  strengths: string[];
  gaps: string[];
  recommendedBioEdits: string[];
  recentPostCoherenceNotes: string[];
  unknowns: string[];
}

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "for",
  "from",
  "how",
  "i",
  "in",
  "into",
  "is",
  "it",
  "my",
  "of",
  "on",
  "or",
  "that",
  "the",
  "through",
  "to",
  "with",
  "you",
]);

function normalizeText(value: string | null | undefined): string {
  return (value || "").trim().replace(/\s+/g, " ");
}

function keywordize(value: string): string[] {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((entry) => entry.length >= 4 && !STOPWORDS.has(entry));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function findMatches(text: string, candidates: string[]): string[] {
  const normalized = normalizeText(text).toLowerCase();
  return unique(
    candidates.filter((candidate) => {
      const term = candidate.toLowerCase();
      return term && normalized.includes(term);
    }),
  );
}

function buildStrategyTerms(context: CreatorAgentContext): string[] {
  return unique(
    [
      context.growthStrategySnapshot.knownFor,
      context.growthStrategySnapshot.targetAudience,
      ...context.growthStrategySnapshot.contentPillars,
    ].flatMap((value) => [normalizeText(value), ...keywordize(value)]),
  );
}

function buildCoherenceNotes(args: {
  recentPosts: OnboardingResult["recentPosts"];
  strategyTerms: string[];
  contentPillars: string[];
}): {
  strengths: string[];
  gaps: string[];
  notes: string[];
  scoreDelta: number;
} {
  const recentPosts = args.recentPosts.slice(0, 12);
  const matchingPosts = recentPosts.filter((post) =>
    args.strategyTerms.some((term) => term && post.text.toLowerCase().includes(term.toLowerCase())),
  );
  const strengths: string[] = [];
  const gaps: string[] = [];
  const notes: string[] = [];
  let scoreDelta = 0;

  if (recentPosts.length === 0) {
    gaps.push("Recent-post coherence is unknown because there are no recent posts in the current sample.");
    return { strengths, gaps, notes, scoreDelta };
  }

  const coherenceRate = matchingPosts.length / recentPosts.length;
  if (coherenceRate >= 0.5) {
    strengths.push(
      `Recent posts repeatedly ladder back to ${args.contentPillars[0] || "the core niche"}, which makes the account easier to classify.`,
    );
    notes.push(
      `${matchingPosts.length} of the last ${recentPosts.length} posts visibly reinforce the current positioning.`,
    );
    scoreDelta += 18;
  } else if (coherenceRate >= 0.25) {
    notes.push(
      `Recent posts show partial coherence, but only ${matchingPosts.length} of the last ${recentPosts.length} posts clearly reinforce the current positioning.`,
    );
    scoreDelta += 6;
  } else {
    gaps.push("Recent posts drift away from the positioning model too often to convert profile visits cleanly.");
    notes.push(
      `Only ${matchingPosts.length} of the last ${recentPosts.length} posts clearly map back to the current pillars.`,
    );
    scoreDelta -= 16;
  }

  return { strengths, gaps, notes, scoreDelta };
}

export function buildProfileConversionAudit(args: {
  onboarding: OnboardingResult;
  context: CreatorAgentContext;
}): ProfileConversionAudit {
  const profileBio = normalizeText(args.onboarding.profile.bio);
  const strategyTerms = buildStrategyTerms(args.context);
  const bioMatches = findMatches(profileBio, strategyTerms);
  const strengths: string[] = [];
  const gaps: string[] = [];
  const recommendedBioEdits: string[] = [];
  const unknowns = [
    "Pinned-post fit is unknown because pinned-post data is not yet ingested.",
  ];
  let score = 52;

  if (!profileBio) {
    gaps.push("The bio is empty, so the profile does not explain what the account should be known for.");
    recommendedBioEdits.push(
      `Add a one-line bio that makes "${args.context.growthStrategySnapshot.knownFor}" obvious.`,
    );
    score -= 20;
  } else {
    strengths.push("The bio is populated, which gives the account at least one conversion surface.");
    score += 6;
  }

  if (bioMatches.length > 0) {
    strengths.push(
      `The bio already references ${bioMatches.slice(0, 2).join(" / ")}, which helps align the profile with the niche.`,
    );
    score += 16;
  } else if (profileBio) {
    gaps.push("The bio does not make the current positioning obvious on first glance.");
    recommendedBioEdits.push(
      `Rewrite the bio so it clearly anchors ${args.context.growthStrategySnapshot.knownFor} for ${args.context.growthStrategySnapshot.targetAudience}.`,
    );
    score -= 14;
  }

  const broadBioSignals = /\b(builder|founder|writing|sharing|thoughts|learning|building in public)\b/i;
  if (profileBio && broadBioSignals.test(profileBio) && bioMatches.length === 0) {
    gaps.push("The bio reads broad/generic right now, which weakens follow conversion.");
    recommendedBioEdits.push(
      `Replace broad labels with one concrete niche promise tied to ${args.context.growthStrategySnapshot.contentPillars[0] || "the main pillar"}.`,
    );
    score -= 8;
  }

  const coherence = buildCoherenceNotes({
    recentPosts: args.onboarding.recentPosts,
    strategyTerms,
    contentPillars: args.context.growthStrategySnapshot.contentPillars,
  });
  strengths.push(...coherence.strengths);
  gaps.push(...coherence.gaps);
  score += coherence.scoreDelta;

  if (recommendedBioEdits.length === 0) {
    recommendedBioEdits.push(
      `Keep the bio tight and make "${args.context.growthStrategySnapshot.knownFor}" legible in one glance.`,
    );
  }

  score = Math.max(0, Math.min(100, score));
  const headline =
    score >= 75
      ? `Profile conversion is mostly aligned with ${args.context.growthStrategySnapshot.knownFor}.`
      : score >= 55
        ? `Profile conversion is usable, but the account is still not legible enough around ${args.context.growthStrategySnapshot.knownFor}.`
        : `Profile conversion is weak: the profile does not yet make ${args.context.growthStrategySnapshot.knownFor} obvious fast enough.`;

  return {
    generatedAt: new Date().toISOString(),
    score,
    headline,
    strengths: unique(strengths).slice(0, 4),
    gaps: unique(gaps).slice(0, 4),
    recommendedBioEdits: unique(recommendedBioEdits).slice(0, 3),
    recentPostCoherenceNotes: unique(coherence.notes).slice(0, 4),
    unknowns,
  };
}
