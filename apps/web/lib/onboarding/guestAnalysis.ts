import {
  PLAYBOOK_LIBRARY,
  PLAYBOOK_STAGE_META,
  buildRecommendedPlaybooksFromSignals,
  type PlaybookDefinition,
  type PlaybookStageKey,
} from "@/lib/creator/playbooks";

import { buildProfileConversionAudit } from "./profile/profileConversionAudit";
import type { XPublicPost, XPublicProfile, XPinnedPost } from "./types";

export type OnboardingPreviewSource =
  | "cache"
  | "user_by_screen_name"
  | "syndication"
  | "users_show"
  | "html"
  | "none";

export type GuestAnalysisStage = "0 → 1k" | "1k → 10k" | "10k → 50k" | "50k+";
export type GuestAnalysisStatus = "pass" | "warn" | "fail" | "unknown";
export type GuestAnalysisSurfaceCheckKey = "bio" | "banner" | "pinned_post" | "recent_posts";
export type GuestAnalysisPriorityKey = "bio" | "banner" | "pinned_post" | "recent_posts";

export interface GuestAnalysisSurfaceCheck {
  key: GuestAnalysisSurfaceCheckKey;
  label: string;
  status: GuestAnalysisStatus;
  summary: string;
}

export interface GuestAnalysisPriority {
  key: GuestAnalysisPriorityKey;
  status: GuestAnalysisStatus;
  title: string;
  why: string;
}

export interface GuestOnboardingProfileAudit {
  score: number;
  headline: string;
  surfaceChecks: GuestAnalysisSurfaceCheck[];
  strengths: string[];
  gaps: string[];
  unknowns: string[];
}

export interface GuestOnboardingPlaybookGuide {
  stageMeta: {
    label: string;
    highlight: string;
    winCondition: string;
    priorities: string[];
    contentMix: {
      replies: number;
      posts: number;
      threads: number;
    };
  };
  recommendedPlaybook: {
    id: string;
    name: string;
    outcome: string;
    whyFit: string;
    loop: PlaybookDefinition["loop"];
    quickStart: string[];
    checklist: {
      daily: string[];
      weekly: string[];
    };
  };
}

export interface GuestOnboardingAnalysis {
  profile: XPublicProfile;
  stage: GuestAnalysisStage;
  playbookStage: PlaybookStageKey;
  verdict: string;
  profileAudit: GuestOnboardingProfileAudit;
  priorities: GuestAnalysisPriority[];
  profileSnapshot: {
    pinnedPost: XPinnedPost | null;
    recentPosts: XPublicPost[];
  };
  playbookGuide: GuestOnboardingPlaybookGuide;
  dataNotice: string | null;
}

const STOPWORDS = new Set([
  "about",
  "after",
  "also",
  "been",
  "from",
  "have",
  "into",
  "just",
  "like",
  "more",
  "only",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "what",
  "when",
  "with",
  "your",
]);

const AUDIENCE_PATTERNS = [
  { pattern: /\b(founders?|operators?)\b/i, label: "founders and operators" },
  { pattern: /\b(creators?|writers?)\b/i, label: "creators and writers" },
  { pattern: /\b(developers?|engineers?|builders?)\b/i, label: "developers and builders" },
  { pattern: /\b(marketers?|growth teams?)\b/i, label: "marketers and growth teams" },
  { pattern: /\b(recruiters?|job seekers?|candidates?)\b/i, label: "job seekers and hiring teams" },
  { pattern: /\b(designers?|product teams?)\b/i, label: "design and product teams" },
] as const;

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function truncate(value: string, maxLength: number): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function tokenize(value: string): string[] {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

function resolvePlaybookStage(followersCount: number): PlaybookStageKey {
  if (followersCount < 1_000) {
    return "0-1k";
  }

  if (followersCount < 10_000) {
    return "1k-10k";
  }

  if (followersCount < 50_000) {
    return "10k-50k";
  }

  return "50k+";
}

function formatGuestStage(stage: PlaybookStageKey): GuestAnalysisStage {
  switch (stage) {
    case "0-1k":
      return "0 → 1k";
    case "1k-10k":
      return "1k → 10k";
    case "10k-50k":
      return "10k → 50k";
    default:
      return "50k+";
  }
}

function extractTopicHint(bio: string): string | null {
  if (!bio) {
    return null;
  }

  const cleaned = bio
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[@#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return null;
  }

  const candidate = cleaned
    .split(/[|,.;•\n]/)
    .map((segment) => segment.trim())
    .find((segment) => segment.length >= 8 && segment.length <= 80);

  return candidate ? truncate(candidate, 64) : null;
}

function extractDominantKeywords(recentPosts: XPublicPost[]): string[] {
  const counts = new Map<string, number>();

  for (const post of recentPosts.slice(0, 8)) {
    for (const token of tokenize(post.text ?? "")) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([token]) => token);
}

function deriveTargetAudience(profile: XPublicProfile, recentPosts: XPublicPost[]): string {
  const source = `${profile.bio}\n${recentPosts.map((post) => post.text).join("\n")}`;

  for (const entry of AUDIENCE_PATTERNS) {
    if (entry.pattern.test(source)) {
      return entry.label;
    }
  }

  return profile.followersCount >= 10_000 ? "a broad X audience" : "people likely to follow for this niche";
}

function deriveKnownFor(profile: XPublicProfile, recentPosts: XPublicPost[]): string {
  const topicHint = extractTopicHint(profile.bio);
  if (topicHint) {
    return truncate(topicHint, 56);
  }

  const keywords = extractDominantKeywords(recentPosts);
  if (keywords.length >= 2) {
    return truncate(`${keywords[0]} and ${keywords[1]}`, 56);
  }

  if (keywords[0]) {
    return truncate(`${keywords[0]} on X`, 56);
  }

  return "clear positioning on X";
}

function deriveContentPillars(knownFor: string, recentPosts: XPublicPost[]): string[] {
  return unique([knownFor, ...extractDominantKeywords(recentPosts)]).slice(0, 3);
}

function buildStrategyTerms(knownFor: string, targetAudience: string, contentPillars: string[]): string[] {
  return unique(
    [knownFor, targetAudience, ...contentPillars].flatMap((value) => [value, ...tokenize(value)]),
  );
}

function buildRecentPostSurfaceCheck(args: {
  recentPosts: XPublicPost[];
  knownFor: string;
  targetAudience: string;
  contentPillars: string[];
}): GuestAnalysisSurfaceCheck {
  const { recentPosts } = args;
  if (recentPosts.length === 0) {
    return {
      key: "recent_posts",
      label: "Recent posts",
      status: "unknown",
      summary: "Recent-post coherence could not be checked because no recent-post snapshot is available yet.",
    };
  }

  const strategyTerms = buildStrategyTerms(args.knownFor, args.targetAudience, args.contentPillars);
  const matchingPosts = recentPosts.filter((post) =>
    strategyTerms.some((term) => term && (post.text ?? "").toLowerCase().includes(term.toLowerCase())),
  );
  const coherenceRate = matchingPosts.length / recentPosts.length;

  if (coherenceRate >= 0.5) {
    return {
      key: "recent_posts",
      label: "Recent posts",
      status: "pass",
      summary: `${matchingPosts.length} of the last ${recentPosts.length} posts reinforce the same positioning.`,
    };
  }

  if (coherenceRate >= 0.25) {
    return {
      key: "recent_posts",
      label: "Recent posts",
      status: "warn",
      summary: `The timeline is partially aligned, but only ${matchingPosts.length} of the last ${recentPosts.length} posts reinforce the profile promise.`,
    };
  }

  return {
    key: "recent_posts",
    label: "Recent posts",
    status: "fail",
    summary: `Only ${matchingPosts.length} of the last ${recentPosts.length} posts clearly ladder back to the profile positioning.`,
  };
}

function buildDataNotice(args: {
  recentPosts: XPublicPost[];
  pinnedPost: XPinnedPost | null;
}): string | null {
  const { recentPosts, pinnedPost } = args;
  const hasRecentPosts = recentPosts.length > 0;
  const hasPinnedPost = Boolean(pinnedPost);

  if (hasRecentPosts && hasPinnedPost) {
    return null;
  }

  if (hasRecentPosts) {
    return "This guide is based on live profile fields and recent posts. A pinned post was not available in the latest snapshot.";
  }

  if (hasPinnedPost) {
    return "This guide is based on live profile fields and a pinned post. Recent-post coverage was not available in the latest snapshot.";
  }

  return "This guide is based on live profile fields only. Recent posts and a pinned post were not available in the latest snapshot.";
}

function buildPriorityCandidates(args: {
  recentPostSurfaceCheck: GuestAnalysisSurfaceCheck;
  audit: ReturnType<typeof buildProfileConversionAudit>;
}): GuestAnalysisPriority[] {
  const { recentPostSurfaceCheck, audit } = args;
  const candidates: GuestAnalysisPriority[] = [];

  const stepToPriority = {
    bio_formula: {
      key: "bio" as const,
      title: "Sharpen the bio promise",
    },
    visual_real_estate: {
      key: "banner" as const,
      title: "Upgrade the banner real estate",
    },
    pinned_tweet: {
      key: "pinned_post" as const,
      title: "Fix the pinned-post handoff",
    },
  };

  for (const step of audit.steps) {
    if (step.status === "pass" || step.status === "unknown") {
      continue;
    }

    const mapping = stepToPriority[step.key];
    candidates.push({
      key: mapping.key,
      status: step.status,
      title: mapping.title,
      why: step.findings[0] ?? step.summary,
    });
  }

  if (recentPostSurfaceCheck.status === "fail" || recentPostSurfaceCheck.status === "warn") {
    candidates.push({
      key: "recent_posts",
      status: recentPostSurfaceCheck.status,
      title: "Make the timeline match the profile",
      why: recentPostSurfaceCheck.summary,
    });
  }

  const statusRank: Record<GuestAnalysisStatus, number> = {
    fail: 0,
    warn: 1,
    unknown: 2,
    pass: 3,
  };
  const order: Record<GuestAnalysisPriorityKey, number> = {
    bio: 0,
    banner: 1,
    pinned_post: 2,
    recent_posts: 3,
  };

  return candidates
    .sort(
      (left, right) =>
        statusRank[left.status] - statusRank[right.status] || order[left.key] - order[right.key],
    )
    .slice(0, 3);
}

function buildVerdict(args: {
  audit: ReturnType<typeof buildProfileConversionAudit>;
  recentPostSurfaceCheck: GuestAnalysisSurfaceCheck;
}): string {
  const { audit, recentPostSurfaceCheck } = args;

  if (audit.score >= 76 && recentPostSurfaceCheck.status === "pass") {
    return `${audit.headline} The profile is already coherent; the next upside is compounding the strongest lane more intentionally.`;
  }

  if (audit.score >= 58) {
    return `${audit.headline} The clearest gain is tightening the profile surfaces before pushing harder on distribution.`;
  }

  return `${audit.headline} Fix the conversion leaks before trying to scale output harder.`;
}

function buildProfileAudit(args: {
  audit: ReturnType<typeof buildProfileConversionAudit>;
  recentPostSurfaceCheck: GuestAnalysisSurfaceCheck;
}): GuestOnboardingProfileAudit {
  const { audit, recentPostSurfaceCheck } = args;
  const strengths = audit.strengths.slice(0, 2);
  const gaps =
    audit.gaps.length > 0
      ? audit.gaps.slice(0, 3)
      : audit.steps.filter((step) => step.status !== "pass").map((step) => step.summary).slice(0, 3);

  return {
    score: audit.score,
    headline: audit.headline,
    surfaceChecks: [
      {
        key: "bio",
        label: "Bio",
        status: audit.bioFormulaCheck.status,
        summary: audit.bioFormulaCheck.summary,
      },
      {
        key: "banner",
        label: "Banner",
        status: audit.visualRealEstateCheck.status,
        summary: audit.visualRealEstateCheck.summary,
      },
      {
        key: "pinned_post",
        label: "Pinned post",
        status: audit.pinnedTweetCheck.status,
        summary: audit.pinnedTweetCheck.summary,
      },
      recentPostSurfaceCheck,
    ],
    strengths:
      strengths.length > 0
        ? strengths
        : ["The account already has enough visible identity to make the next profile iteration clearer."],
    gaps,
    unknowns: audit.unknowns.slice(0, 2),
  };
}

function buildPlaybookGuide(args: {
  playbookStage: PlaybookStageKey;
  audit: GuestOnboardingProfileAudit;
  priorities: GuestAnalysisPriority[];
}): GuestOnboardingPlaybookGuide {
  const { playbookStage, audit, priorities } = args;
  const topRecommendation =
    buildRecommendedPlaybooksFromSignals({
      currentStage: playbookStage,
      gapText: [audit.headline, ...audit.gaps, ...priorities.map((item) => item.why)].join(" "),
      priorityKeys: priorities.map((item) => item.key),
      limit: 1,
      includeAdjacentStages: false,
      primaryGapLabel: audit.gaps[0] ?? audit.headline,
    })[0] ?? null;
  const fallbackPlaybook = PLAYBOOK_LIBRARY[playbookStage][0];
  const playbook = topRecommendation?.playbook ?? fallbackPlaybook;
  const whyFit =
    topRecommendation?.whyFit ??
    `this aligns with the current ${PLAYBOOK_STAGE_META[playbookStage].label} bottleneck.`;

  return {
    stageMeta: {
      label: PLAYBOOK_STAGE_META[playbookStage].label,
      highlight: PLAYBOOK_STAGE_META[playbookStage].highlight,
      winCondition: PLAYBOOK_STAGE_META[playbookStage].winCondition,
      priorities: PLAYBOOK_STAGE_META[playbookStage].priorities,
      contentMix: PLAYBOOK_STAGE_META[playbookStage].contentMix,
    },
    recommendedPlaybook: {
      id: playbook.id,
      name: playbook.name,
      outcome: playbook.outcome,
      whyFit,
      loop: playbook.loop,
      quickStart: playbook.quickStart.slice(0, 3),
      checklist: {
        daily: playbook.checklist.daily.slice(0, 3),
        weekly: playbook.checklist.weekly.slice(0, 2),
      },
    },
  };
}

export function buildGuestOnboardingAnalysis(args: {
  profile: XPublicProfile;
  source: OnboardingPreviewSource;
  pinnedPost?: XPinnedPost | null;
  recentPosts?: XPublicPost[];
}): GuestOnboardingAnalysis {
  const recentPosts = (args.recentPosts ?? []).slice(0, 5);
  const pinnedPost = args.pinnedPost ?? null;
  const playbookStage = resolvePlaybookStage(args.profile.followersCount);
  const stage = formatGuestStage(playbookStage);
  const knownFor = deriveKnownFor(args.profile, recentPosts);
  const targetAudience = deriveTargetAudience(args.profile, recentPosts);
  const contentPillars = deriveContentPillars(knownFor, recentPosts);
  const audit = buildProfileConversionAudit({
    onboarding: {
      source: recentPosts.length > 0 || pinnedPost ? "scrape" : "x_api",
      profile: args.profile,
      pinnedPost,
      recentPosts,
    } as never,
    context: {
      growthStrategySnapshot: {
        knownFor,
        targetAudience,
        contentPillars,
      },
      creatorProfile: {
        strategy: {
          primaryGoal: "authority",
        },
      },
    } as never,
    profileAuditState: null,
  });
  const recentPostSurfaceCheck = buildRecentPostSurfaceCheck({
    recentPosts,
    knownFor,
    targetAudience,
    contentPillars,
  });
  const profileAudit = buildProfileAudit({
    audit,
    recentPostSurfaceCheck,
  });
  const priorities = buildPriorityCandidates({
    recentPostSurfaceCheck,
    audit,
  });

  return {
    profile: args.profile,
    stage,
    playbookStage,
    verdict: buildVerdict({
      audit,
      recentPostSurfaceCheck,
    }),
    profileAudit,
    priorities,
    profileSnapshot: {
      pinnedPost,
      recentPosts,
    },
    playbookGuide: buildPlaybookGuide({
      playbookStage,
      audit: profileAudit,
      priorities,
    }),
    dataNotice: buildDataNotice({
      recentPosts,
      pinnedPost,
    }),
  };
}
