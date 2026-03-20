import type {
  ProfileAuditHeaderClarity,
  ProfileAuditState,
} from "../../agent-v2/core/styleProfile.ts";
import type { CreatorAgentContext } from "../strategy/agentContext.ts";
import type { ProfileAnalysisPinnedPostImageAnalysis } from "./pinnedPostImageAnalysis.ts";
import type { OnboardingResult, XPinnedPost } from "../types.ts";

export type ProfileAuditStepStatus = "pass" | "warn" | "fail" | "unknown";
export type ProfileAuditPinnedCategory =
  | "origin_story"
  | "core_thesis"
  | "milestone"
  | "lead_magnet"
  | "authority"
  | "weak"
  | "unknown";
export type ProfileAuditPinnedProofStrength = "none" | "low" | "medium" | "high";

export interface ProfileAuditBioAlternative {
  id: string;
  text: string;
  proofMode: "proof" | "cta";
}

export interface ProfileAuditStep {
  key: "bio_formula" | "visual_real_estate" | "pinned_tweet";
  title: string;
  status: ProfileAuditStepStatus;
  score: number;
  summary: string;
  findings: string[];
  actionLabel: string;
}

export interface BioFormulaCheck {
  status: ProfileAuditStepStatus;
  score: number;
  summary: string;
  findings: string[];
  bio: string;
  charCount: number;
  matchesFormula: {
    what: boolean;
    who: boolean;
    proofOrCta: boolean;
  };
  alternatives: ProfileAuditBioAlternative[];
}

export interface VisualRealEstateCheck {
  status: ProfileAuditStepStatus;
  score: number;
  summary: string;
  findings: string[];
  hasHeaderImage: boolean;
  headerImageUrl: string | null;
  headerClarity: ProfileAuditHeaderClarity | null;
  headerClarityResolved: boolean;
}

export interface PinnedTweetCheck {
  status: ProfileAuditStepStatus;
  score: number;
  summary: string;
  findings: string[];
  pinnedPost: XPinnedPost | null;
  category: ProfileAuditPinnedCategory;
  ageDays: number | null;
  isStale: boolean;
  visualEvidenceSummary?: string | null;
  proofStrength?: ProfileAuditPinnedProofStrength;
  imageAdjusted?: boolean;
  promptSuggestions: {
    originStory: string;
    coreThesis: string;
  };
}

export interface ProfileConversionAudit {
  generatedAt: string;
  score: number;
  headline: string;
  fingerprint: string;
  shouldAutoOpen: boolean;
  steps: ProfileAuditStep[];
  strengths: string[];
  gaps: string[];
  recommendedBioEdits: string[];
  recentPostCoherenceNotes: string[];
  unknowns: string[];
  bioFormulaCheck: BioFormulaCheck;
  visualRealEstateCheck: VisualRealEstateCheck;
  pinnedTweetCheck: PinnedTweetCheck;
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

const GENERIC_BIO_PATTERN =
  /\b(builder|founder|writing|sharing|thoughts|learning|building in public|coffee lover|internet person)\b/i;
const CTA_PATTERN =
  /\b(follow|dm|join|download|get|book|subscribe|reply|comment|grab|read|watch|newsletter)\b/i;
const PROOF_PATTERN =
  /\b(verified|founder|ceo|operator|author|speaker|mentor|coach|case studies?|frameworks?|systems?|threads?|years?|clients?|operators?|revenue|mrr|arr|followers?|subscribers?)\b/i;
const MILESTONE_PATTERN =
  /\b(hit|crossed|grew|reached|shipped|launched|went from|0 to|\$\d|mrr|arr|users?|customers?|revenue)\b/i;
const ORIGIN_STORY_PATTERN =
  /\b(i started|my story|i learned|years ago|when i started|i used to|i spent|i went from)\b/i;
const THESIS_PATTERN =
  /\b(the truth is|my thesis|what i believe|most people think|the real reason|here's the thing|the biggest mistake)\b/i;
const LEAD_MAGNET_PATTERN =
  /\b(template|guide|playbook|checklist|resource|download|free|comment|dm|reply|link in bio|newsletter)\b/i;
const PINNED_IMAGE_PROOF_PATTERN =
  /\b(award|winner|won|prize|trophy|cheque|check|grant|certificate|medal|revenue|mrr|arr|dashboard|graph|traction|proof|customers?|users?)\b/i;

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

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function titleCase(value: string): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  return normalized
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function truncate(value: string, maxLength: number): string {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
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

function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${Number((value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1))}M`;
  }

  if (value >= 1_000) {
    return `${Number((value / 1_000).toFixed(value >= 10_000 ? 0 : 1))}k`;
  }

  return String(value);
}

function compressPhrase(value: string, maxWords: number, maxChars: number): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  const words = normalized.split(" ");
  return truncate(words.slice(0, maxWords).join(" "), maxChars);
}

function buildProofOrCta(args: {
  onboarding: OnboardingResult;
  context: CreatorAgentContext;
}): { text: string; mode: "proof" | "cta" } {
  if (args.onboarding.profile.isVerified) {
    return { text: "Verified on X", mode: "proof" };
  }

  if (args.onboarding.profile.followersCount >= 1000) {
    return {
      text: `${formatCount(args.onboarding.profile.followersCount)}+ followers on X`,
      mode: "proof",
    };
  }

  const topPillar = args.context.growthStrategySnapshot.contentPillars[0];
  if (topPillar) {
    return {
      text: `Follow for ${compressPhrase(topPillar, 4, 36)}`,
      mode: "cta",
    };
  }

  return {
    text: `Follow for sharper ${compressPhrase(args.context.growthStrategySnapshot.knownFor, 4, 28)}`,
    mode: "cta",
  };
}

function buildBioAlternatives(args: {
  onboarding: OnboardingResult;
  context: CreatorAgentContext;
}): ProfileAuditBioAlternative[] {
  const who = compressPhrase(args.context.growthStrategySnapshot.targetAudience, 6, 48) || "founders";
  const pillar = compressPhrase(
    args.context.growthStrategySnapshot.contentPillars[0] ||
      args.context.growthStrategySnapshot.knownFor,
    6,
    44,
  );
  const promise = (() => {
    switch (args.context.creatorProfile.strategy.primaryGoal) {
      case "leads":
        return "turn attention into leads";
      case "authority":
        return "build authority on X";
      default:
        return "grow faster on X";
    }
  })();
  const proofOrCta = buildProofOrCta(args);
  const candidates = [
    `I help ${who} ${promise} with ${pillar}. ${proofOrCta.text}.`,
    `${titleCase(pillar)} for ${who}. ${proofOrCta.text}.`,
    `Helping ${who} ${promise} using ${pillar}. ${proofOrCta.text}.`,
  ];

  return candidates.map((candidate, index) => ({
    id: `bio-${index + 1}`,
    text: truncate(candidate.replace(/\s+\./g, "."), 160),
    proofMode: proofOrCta.mode,
  }));
}

function buildProfileFingerprint(onboarding: OnboardingResult): string {
  const bio = normalizeText(onboarding.profile.bio).toLowerCase();
  const banner = normalizeText(onboarding.profile.headerImageUrl).toLowerCase();
  const pinnedId = normalizeText(onboarding.pinnedPost?.id).toLowerCase();
  const pinnedCreatedAt = normalizeText(onboarding.pinnedPost?.createdAt).toLowerCase();
  return [bio, banner, pinnedId, pinnedCreatedAt].join("|");
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
    scoreDelta += 16;
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
    scoreDelta -= 12;
  }

  return { strengths, gaps, notes, scoreDelta };
}

function buildBioFormulaCheck(args: {
  onboarding: OnboardingResult;
  context: CreatorAgentContext;
}): BioFormulaCheck {
  const bio = normalizeText(args.onboarding.profile.bio);
  const charCount = bio.length;
  const strategyTerms = buildStrategyTerms(args.context);
  const bioMatches = findMatches(bio, strategyTerms);
  const lower = bio.toLowerCase();
  const whoSignals = keywordize(args.context.growthStrategySnapshot.targetAudience);
  const whoMatch = whoSignals.some((term) => lower.includes(term));
  const whatMatch = bioMatches.length > 0 || /\b(help|grow|scale|build|turn|teach|show|write|design|ship)\b/i.test(bio);
  const proofOrCtaMatch = PROOF_PATTERN.test(bio) || CTA_PATTERN.test(bio) || /\d/.test(bio);
  const findings: string[] = [];
  let status: ProfileAuditStepStatus = "pass";
  let score = 82;

  if (!bio) {
    status = "fail";
    score = 20;
    findings.push("The bio is empty, so the account is wasting the most important text surface on the profile.");
  } else {
    if (charCount > 160) {
      status = "fail";
      score -= 24;
      findings.push(`The bio is ${charCount} characters, which overshoots the 160-character target.`);
    }

    if (!whatMatch || !whoMatch || !proofOrCtaMatch) {
      status = status === "fail" ? "fail" : "warn";
      score -= 18;
      const missingParts = [
        !whatMatch ? "what you do" : null,
        !whoMatch ? "who you help" : null,
        !proofOrCtaMatch ? "proof or CTA" : null,
      ].filter((value): value is string => Boolean(value));
      findings.push(`The bio is missing ${missingParts.join(" + ")} from the conversion formula.`);
    }

    if (GENERIC_BIO_PATTERN.test(bio) && bioMatches.length === 0) {
      status = "fail";
      score -= 18;
      findings.push("The bio reads broad/generic right now, so X has less context for who to recommend this account to.");
    } else if (bioMatches.length > 0) {
      findings.push(
        `The bio already references ${bioMatches.slice(0, 2).join(" / ")}, which helps reinforce the positioning model.`,
      );
    }
  }

  const summary =
    status === "pass"
      ? "The bio makes the value prop legible in one glance."
      : status === "warn"
        ? "The bio has part of the structure, but it still needs a clearer formula."
        : "The bio fails the 160-character hook formula and should be rewritten.";

  return {
    status,
    score: clampScore(score),
    summary,
    findings,
    bio,
    charCount,
    matchesFormula: {
      what: whatMatch,
      who: whoMatch,
      proofOrCta: proofOrCtaMatch,
    },
    alternatives: buildBioAlternatives(args),
  };
}

function resolveHeaderClarityForBanner(args: {
  profileAuditState: ProfileAuditState | null;
  headerImageUrl: string | null;
}): ProfileAuditHeaderClarity | null {
  if (!args.profileAuditState?.headerClarity || !args.headerImageUrl) {
    return null;
  }

  if (args.profileAuditState.headerClarityBannerUrl !== args.headerImageUrl) {
    return null;
  }

  return args.profileAuditState.headerClarity;
}

function buildVisualRealEstateCheck(args: {
  onboarding: OnboardingResult;
  context: CreatorAgentContext;
  profileAuditState: ProfileAuditState | null;
}): VisualRealEstateCheck {
  const headerImageUrl = normalizeText(args.onboarding.profile.headerImageUrl) || null;
  const hasHeaderImage = Boolean(headerImageUrl);
  const findings: string[] = [];
  const headerClarity = resolveHeaderClarityForBanner({
    profileAuditState: args.profileAuditState,
    headerImageUrl,
  });
  const headerClarityResolved = headerClarity !== null;
  let status: ProfileAuditStepStatus = "pass";
  let score = 80;

  if (!hasHeaderImage) {
    if (args.onboarding.source !== "scrape") {
      status = "unknown";
      score = 50;
      findings.push("Header-image availability could not be verified from the current profile source.");
    } else {
      status = "fail";
      score = 24;
      findings.push("No header image is set, so the profile is losing its biggest visual conversion surface.");
    }
  } else if (!headerClarityResolved) {
    status = "warn";
    score = 62;
    findings.push("A header image exists, but Xpo still needs a quick self-check on whether it communicates a clear value proposition or proof.");
  } else if (headerClarity === "clear") {
    findings.push("The current banner has been confirmed as clear and conversion-oriented.");
  } else if (headerClarity === "unclear") {
    status = "fail";
    score = 40;
    findings.push("The current banner was marked unclear, so it is likely diluting profile conversion.");
  } else {
    status = "warn";
    score = 56;
    findings.push("The current banner is still uncertain, so replacing it with a cleaner value prop is the safer move.");
  }

  const summary =
    status === "pass"
      ? "The header is present and already supporting the positioning."
      : status === "warn"
        ? "The banner needs confirmation or cleanup before it can be trusted as conversion real estate."
        : status === "unknown"
          ? "Header-image status is currently unknown from the available profile data."
          : "The banner is missing or unclear, so the visual real estate is underperforming.";

  return {
    status,
    score: clampScore(score),
    summary,
    findings,
    hasHeaderImage,
    headerImageUrl,
    headerClarity,
    headerClarityResolved,
  };
}

function computePinnedAgeDays(pinnedPost: XPinnedPost | null): number | null {
  if (!pinnedPost?.createdAt) {
    return null;
  }

  const createdAtMs = new Date(pinnedPost.createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) {
    return null;
  }

  return Math.max(0, Math.floor((Date.now() - createdAtMs) / (1000 * 60 * 60 * 24)));
}

function classifyPinnedPost(text: string): ProfileAuditPinnedCategory {
  const normalized = text.toLowerCase();

  if (LEAD_MAGNET_PATTERN.test(normalized) && CTA_PATTERN.test(normalized)) {
    return "lead_magnet";
  }

  if (MILESTONE_PATTERN.test(normalized)) {
    return "milestone";
  }

  if (ORIGIN_STORY_PATTERN.test(normalized)) {
    return "origin_story";
  }

  if (THESIS_PATTERN.test(normalized)) {
    return "core_thesis";
  }

  if (normalized.length >= 220 || normalized.includes("\n") || /\b1\.\s|\b2\.\s/.test(normalized)) {
    return "authority";
  }

  return "weak";
}

function buildPinnedPromptSuggestions(args: {
  context: CreatorAgentContext;
  onboarding: OnboardingResult;
}): { originStory: string; coreThesis: string } {
  const niche = args.context.growthStrategySnapshot.knownFor;
  const audience = args.context.growthStrategySnapshot.targetAudience;

  return {
    originStory: `write a pinned origin story thread for my x profile. keep it grounded to what you know about me, make the niche ${niche}, make the audience ${audience}, and design it to convert profile visits.`,
    coreThesis: `write a pinned core thesis thread for my x profile. keep it grounded to what you know about me, center it on ${niche}, speak to ${audience}, and make it strong enough to anchor my profile.`,
  };
}

function buildPinnedImageSignalText(
  analysis: ProfileAnalysisPinnedPostImageAnalysis | null | undefined,
): string {
  if (!analysis) {
    return "";
  }

  return normalizeText(
    [
      analysis.readableText,
      analysis.primarySubject,
      analysis.sceneSummary,
      analysis.strategicSignal,
      ...(analysis.keyDetails || []),
    ].join(" "),
  ).toLowerCase();
}

function resolvePinnedProofStrength(
  analysis: ProfileAnalysisPinnedPostImageAnalysis | null | undefined,
): ProfileAuditPinnedProofStrength {
  if (!analysis) {
    return "none";
  }

  const signalText = buildPinnedImageSignalText(analysis);
  let score = 0;

  if (analysis.imageRole === "proof") {
    score += 4;
  } else if (analysis.imageRole === "product") {
    score += 2;
  } else if (analysis.imageRole === "personal_brand" || analysis.imageRole === "context") {
    score += 1;
  }

  if (PINNED_IMAGE_PROOF_PATTERN.test(signalText)) {
    score += 2;
  }

  if (/\$\d|\b\d+(?:k|m|b|bn|mm|x|%)\b/i.test(signalText)) {
    score += 1;
  }

  if ((analysis.keyDetails || []).length >= 2) {
    score += 1;
  }

  if (score >= 6) {
    return "high";
  }

  if (score >= 4) {
    return "medium";
  }

  return score > 0 ? "low" : "none";
}

function buildPinnedVisualEvidenceSummary(
  analysis: ProfileAnalysisPinnedPostImageAnalysis | null | undefined,
): string | null {
  if (!analysis) {
    return null;
  }

  const parts = [
    normalizeText(analysis.sceneSummary),
    analysis.readableText.trim()
      ? `Visible text: "${truncate(analysis.readableText, 120)}".`
      : null,
    normalizeText(analysis.strategicSignal),
  ].filter((value): value is string => Boolean(value));

  if (parts.length === 0) {
    return null;
  }

  return unique(parts).join(" ");
}

function resolvePinnedCategoryFromImage(args: {
  baseCategory: ProfileAuditPinnedCategory;
  pinnedText: string;
  pinnedPostImageAnalysis?: ProfileAnalysisPinnedPostImageAnalysis | null;
  proofStrength: ProfileAuditPinnedProofStrength;
}): ProfileAuditPinnedCategory {
  if (!args.pinnedPostImageAnalysis || args.proofStrength === "none") {
    return args.baseCategory;
  }

  const combinedSignal = normalizeText(
    `${args.pinnedText} ${buildPinnedImageSignalText(args.pinnedPostImageAnalysis)}`,
  ).toLowerCase();
  const looksLikeMilestone = MILESTONE_PATTERN.test(combinedSignal) ||
    /\b(award|winner|won|prize|trophy|cheque|check|grant|certificate|medal)\b/i.test(
      combinedSignal,
    );

  if (args.baseCategory === "weak" || args.baseCategory === "unknown") {
    if (args.proofStrength === "high") {
      return looksLikeMilestone ? "milestone" : "authority";
    }

    if (args.proofStrength === "medium") {
      return "authority";
    }
  }

  return args.baseCategory;
}

function buildPinnedTweetCheck(args: {
  onboarding: OnboardingResult;
  context: CreatorAgentContext;
  pinnedPostImageAnalysis?: ProfileAnalysisPinnedPostImageAnalysis | null;
}): PinnedTweetCheck {
  const pinnedPost = args.onboarding.pinnedPost ?? null;
  const findings: string[] = [];
  const promptSuggestions = buildPinnedPromptSuggestions(args);

  if (!pinnedPost) {
    if (args.onboarding.source !== "scrape") {
      return {
        status: "unknown",
        score: 50,
        summary: "Pinned-post status is unknown from the current source.",
        findings: ["Pinned-post data was not available from the current onboarding source."],
        pinnedPost: null,
        category: "unknown",
        ageDays: null,
        isStale: false,
        visualEvidenceSummary: null,
        proofStrength: "none",
        imageAdjusted: false,
        promptSuggestions,
      };
    }

    return {
      status: "fail",
      score: 18,
      summary: "No pinned post is set, so the profile has no featured authority story.",
      findings: ["No pinned post was found on the current profile capture."],
      pinnedPost: null,
      category: "weak",
      ageDays: null,
      isStale: false,
      visualEvidenceSummary: null,
      proofStrength: "none",
      imageAdjusted: false,
      promptSuggestions,
    };
  }

  const text = normalizeText(pinnedPost.text);
  const proofStrength = resolvePinnedProofStrength(args.pinnedPostImageAnalysis);
  const visualEvidenceSummary = buildPinnedVisualEvidenceSummary(args.pinnedPostImageAnalysis);
  const baseCategory = classifyPinnedPost(text);
  const category = resolvePinnedCategoryFromImage({
    baseCategory,
    pinnedText: text,
    pinnedPostImageAnalysis: args.pinnedPostImageAnalysis,
    proofStrength,
  });
  const imageAdjusted = category !== baseCategory;
  const ageDays = computePinnedAgeDays(pinnedPost);
  const isStale = ageDays !== null && ageDays > 180;
  const strategyTerms = buildStrategyTerms(args.context);
  const fitMatches = findMatches(text, strategyTerms);
  let score = 48;
  let status: ProfileAuditStepStatus = "warn";

  if (visualEvidenceSummary) {
    findings.push(
      `The pinned image adds ${proofStrength} proof value: ${visualEvidenceSummary}`,
    );
  }

  if (fitMatches.length > 0) {
    score += 18;
    findings.push(
      `The pinned post reinforces ${fitMatches.slice(0, 2).join(" / ")}, so it supports the positioning model.`,
    );
  } else if (proofStrength === "high") {
    score -= 4;
    findings.push(
      "The pinned post does not restate the current positioning clearly, but the image still carries strong authority proof.",
    );
  } else if (proofStrength === "medium") {
    score -= 8;
    findings.push(
      "The pinned post does not restate the positioning clearly, so the proof image is carrying more of the conversion load than the copy.",
    );
  } else {
    score -= 14;
    findings.push("The pinned post does not clearly reinforce the current positioning on first read.");
  }

  if (category === "origin_story" || category === "core_thesis" || category === "lead_magnet") {
    score += 18;
  } else if (category === "milestone" || category === "authority") {
    score += 10;
  } else {
    score -= 16;
    findings.push("The pinned post reads weak for a featured authority asset.");
  }

  if (text.length >= 180) {
    score += 8;
  } else if (text.length < 80) {
    if (proofStrength === "high") {
      findings.push(
        "The pinned copy is short, but the visual proof keeps it from reading like a throwaway asset.",
      );
    } else if (proofStrength === "medium") {
      score -= 4;
      findings.push(
        "The pinned copy is short, so the image proof needs clearer packaging around it.",
      );
    } else {
      score -= 10;
      findings.push("The pinned post is too thin to act like a strong featured story.");
    }
  }

  if (ageDays !== null && ageDays > 365) {
    if (proofStrength === "high") {
      score -= 8;
      findings.push(
        `The pinned post is ${ageDays} days old, so the proof is strong but the packaging may be stale.`,
      );
    } else if (proofStrength === "medium") {
      score -= 14;
      findings.push(
        `The pinned post is ${ageDays} days old, so it should be refreshed around the proof it already has.`,
      );
    } else {
      score -= 24;
      findings.push(
        `The pinned post is ${ageDays} days old, which makes it feel stale as a profile anchor.`,
      );
    }
  } else if (ageDays !== null && ageDays > 180) {
    if (proofStrength === "high") {
      score -= 4;
      findings.push(
        `The pinned post is ${ageDays} days old, so the proof still helps but the framing should be pressure-tested against the current positioning.`,
      );
    } else {
      score -= 10;
      findings.push(
        `The pinned post is ${ageDays} days old, so it should be pressure-tested against the current positioning.`,
      );
    }
  }

  score = clampScore(score);
  if (score >= 72 && !(ageDays !== null && ageDays > 365)) {
    status = "pass";
  } else if (score < 45) {
    status = "fail";
  }

  const summary =
    status === "pass"
      ? "The pinned post looks strong enough to function as a featured authority asset."
      : status === "warn"
        ? proofStrength === "high" || proofStrength === "medium"
          ? "The pinned post carries real proof, but the copy or freshness should be tightened."
          : "The pinned post is usable, but it should be tightened or refreshed."
        : "The pinned post is weak or stale enough to hurt profile conversion.";

  return {
    status,
    score,
    summary,
    findings,
    pinnedPost,
    category,
    ageDays,
    isStale,
    visualEvidenceSummary,
    proofStrength,
    imageAdjusted,
    promptSuggestions,
  };
}

function buildStepList(args: {
  bioFormulaCheck: BioFormulaCheck;
  visualRealEstateCheck: VisualRealEstateCheck;
  pinnedTweetCheck: PinnedTweetCheck;
}): ProfileAuditStep[] {
  return [
    {
      key: "bio_formula",
      title: "Bio Formula Check",
      status: args.bioFormulaCheck.status,
      score: args.bioFormulaCheck.score,
      summary: args.bioFormulaCheck.summary,
      findings: args.bioFormulaCheck.findings,
      actionLabel: "Fix bio",
    },
    {
      key: "visual_real_estate",
      title: "Visual Real Estate",
      status: args.visualRealEstateCheck.status,
      score: args.visualRealEstateCheck.score,
      summary: args.visualRealEstateCheck.summary,
      findings: args.visualRealEstateCheck.findings,
      actionLabel: "Fix banner",
    },
    {
      key: "pinned_tweet",
      title: "Pinned Tweet Validator",
      status: args.pinnedTweetCheck.status,
      score: args.pinnedTweetCheck.score,
      summary: args.pinnedTweetCheck.summary,
      findings: args.pinnedTweetCheck.findings,
      actionLabel: "Fix pinned tweet",
    },
  ];
}

export function buildProfileConversionAudit(args: {
  onboarding: OnboardingResult;
  context: CreatorAgentContext;
  profileAuditState?: ProfileAuditState | null;
  pinnedPostImageAnalysis?: ProfileAnalysisPinnedPostImageAnalysis | null;
}): ProfileConversionAudit {
  const strategyTerms = buildStrategyTerms(args.context);
  const coherence = buildCoherenceNotes({
    recentPosts: args.onboarding.recentPosts,
    strategyTerms,
    contentPillars: args.context.growthStrategySnapshot.contentPillars,
  });
  const bioFormulaCheck = buildBioFormulaCheck(args);
  const visualRealEstateCheck = buildVisualRealEstateCheck({
    ...args,
    profileAuditState: args.profileAuditState ?? null,
  });
  const pinnedTweetCheck = buildPinnedTweetCheck(args);
  const steps = buildStepList({
    bioFormulaCheck,
    visualRealEstateCheck,
    pinnedTweetCheck,
  });
  const fingerprint = buildProfileFingerprint(args.onboarding);
  const actionable = steps.some((step) => step.status === "warn" || step.status === "fail");
  const strengths = unique([
    ...(bioFormulaCheck.status === "pass" ? [bioFormulaCheck.summary] : []),
    ...(visualRealEstateCheck.status === "pass" ? [visualRealEstateCheck.summary] : []),
    ...(pinnedTweetCheck.status === "pass" ? [pinnedTweetCheck.summary] : []),
    ...coherence.strengths,
  ]).slice(0, 5);
  const gaps = unique([
    ...(bioFormulaCheck.status !== "pass" ? [bioFormulaCheck.summary] : []),
    ...(visualRealEstateCheck.status === "fail" ? [visualRealEstateCheck.summary] : []),
    ...(pinnedTweetCheck.status !== "pass" ? [pinnedTweetCheck.summary] : []),
    ...coherence.gaps,
  ]).slice(0, 5);
  const unknowns = unique([
    ...(visualRealEstateCheck.status === "unknown" ? visualRealEstateCheck.findings : []),
    ...(pinnedTweetCheck.status === "unknown" ? pinnedTweetCheck.findings : []),
  ]);
  const stepScores = steps.map((step) => (step.status === "unknown" ? 50 : step.score));
  let score =
    stepScores.reduce((sum, value) => sum + value, 0) / Math.max(1, stepScores.length);
  score += coherence.scoreDelta;
  score = clampScore(score);

  const headline =
    score >= 76
      ? `Profile conversion is mostly aligned with ${args.context.growthStrategySnapshot.knownFor}.`
      : score >= 58
        ? `Profile conversion is usable, but the account still has at least one leak before it converts cleanly.`
        : `Profile conversion is weak: the profile is not yet engineered to convert profile visits.`;

  return {
    generatedAt: new Date().toISOString(),
    score,
    headline,
    fingerprint,
    shouldAutoOpen:
      actionable &&
      fingerprint.length > 0 &&
      args.profileAuditState?.lastDismissedFingerprint !== fingerprint,
    steps,
    strengths,
    gaps,
    recommendedBioEdits: bioFormulaCheck.alternatives.map((item) => item.text).slice(0, 3),
    recentPostCoherenceNotes: unique(coherence.notes).slice(0, 4),
    unknowns,
    bioFormulaCheck,
    visualRealEstateCheck,
    pinnedTweetCheck,
  };
}
