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
export type GuestAnalysisEvidenceKey =
  | "bio"
  | "banner"
  | "pinned_post"
  | "recent_posts"
  | "source_coverage";
export type GuestAnalysisPriorityKey =
  | "bio"
  | "banner"
  | "pinned_post"
  | "recent_posts"
  | "stage";

export interface GuestAnalysisEvidence {
  key: GuestAnalysisEvidenceKey;
  label: string;
  status: GuestAnalysisStatus;
  summary: string;
}

export interface GuestAnalysisPriority {
  key: GuestAnalysisPriorityKey;
  status: GuestAnalysisStatus;
  title: string;
  why: string;
  howXpoHelps: string;
}

export interface GuestAnalysisCoverage {
  source: OnboardingPreviewSource;
  hasRecentPosts: boolean;
  recentPostCount: number;
  hasPinnedPost: boolean;
  hasHeaderImage: boolean;
  completeness: "full" | "partial";
  summary: string;
}

export interface GuestAnalysisVoicePreview {
  shortform: string;
  longform: string;
}

export interface GuestOnboardingAnalysis {
  profile: XPublicProfile;
  stage: GuestAnalysisStage;
  verdict: string;
  coverage: GuestAnalysisCoverage;
  evidence: GuestAnalysisEvidence[];
  priorities: GuestAnalysisPriority[];
  profileSnapshot: {
    pinnedPost: XPinnedPost | null;
    recentPosts: XPublicPost[];
  };
  voicePreview: GuestAnalysisVoicePreview;
  source: OnboardingPreviewSource;
}

const STAGE_METADATA: Record<
  GuestAnalysisStage,
  {
    focus: string;
    executionPriority: string;
    stageSupportLine: string;
  }
> = {
  "0 → 1k": {
    focus: "Distribution + proof",
    executionPriority: "Build a profile people can classify instantly, then repeat one or two clear lanes.",
    stageSupportLine:
      "Xpo keeps early-stage accounts focused on profile clarity, repeatable lanes, and reply-led distribution.",
  },
  "1k → 10k": {
    focus: "Retention + positioning",
    executionPriority:
      "Sharpen the positioning so profile visits and recent posts reinforce the same promise.",
    stageSupportLine:
      "Xpo helps mid-stage accounts turn scattered traction into stronger positioning, better hooks, and clearer recall.",
  },
  "10k → 50k": {
    focus: "Depth + leverage",
    executionPriority:
      "Turn the strongest ideas into repeatable signature takes, sequels, and higher-leverage profile assets.",
    stageSupportLine:
      "Xpo pushes growth-stage accounts toward stronger authority signals, deeper pillars, and clearer sequel loops.",
  },
  "50k+": {
    focus: "Product + ecosystem",
    executionPriority:
      "Make the profile and pinned assets point clearly toward the offer, product, or ecosystem you want to compound.",
    stageSupportLine:
      "Xpo helps larger accounts connect profile conversion surfaces to launches, offers, and ecosystem growth.",
  },
};

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

function resolvePlaybookStage(followersCount: number): GuestAnalysisStage {
  if (followersCount < 1_000) {
    return "0 → 1k";
  }

  if (followersCount < 10_000) {
    return "1k → 10k";
  }

  if (followersCount < 50_000) {
    return "10k → 50k";
  }

  return "50k+";
}

function clampPreviewCopy(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars - 1).trimEnd()}...`;
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

type VoiceCasing = "lowercase" | "normal";

function getDeterministicSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash);
}

function pickSeededOption(options: readonly string[], seed: number, offset: number): string {
  if (options.length === 0) {
    return "";
  }

  return options[(seed + offset) % options.length] ?? options[0] ?? "";
}

function applyVoiceCasing(value: string, casing: VoiceCasing): string {
  if (casing === "lowercase") {
    return value.toLowerCase();
  }

  return value;
}

function inferVoiceCasing(profile: XPublicProfile, recentPosts: XPublicPost[]): VoiceCasing {
  const samples = recentPosts
    .map((post) => post.text)
    .filter(Boolean)
    .slice(0, 8);

  if (samples.length === 0 && profile.bio) {
    samples.push(profile.bio);
  }

  let alphaCount = 0;
  let lowercaseCount = 0;

  for (const sample of samples) {
    for (const character of sample) {
      if (!/[a-z]/i.test(character)) {
        continue;
      }

      alphaCount += 1;
      if (character === character.toLowerCase()) {
        lowercaseCount += 1;
      }
    }
  }

  if (alphaCount < 40) {
    return "normal";
  }

  return lowercaseCount / alphaCount >= 0.82 ? "lowercase" : "normal";
}

function normalizePostSample(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLeadSample(recentPosts: XPublicPost[]): string | null {
  for (const post of recentPosts.slice(0, 8)) {
    const normalized = normalizePostSample(post.text);
    if (!normalized) {
      continue;
    }

    const candidate = normalized.split("\n")[0]?.split(/[.!?]/)[0]?.trim() ?? "";
    if (candidate.length < 18 || candidate.length > 90) {
      continue;
    }

    return candidate;
  }

  return null;
}

function detectCommentCtaKeyword(recentPosts: XPublicPost[], bio: string): string | null {
  const invalidKeywords = new Set([
    "below",
    "this",
    "that",
    "here",
    "there",
    "link",
    "it",
    "me",
    "yes",
    "done",
  ]);
  const keywordPattern =
    /\b(?:comment|reply)\s+["'“”]?([A-Za-z0-9]{2,20})["'“”]?(?:\s|$)/i;

  for (const post of recentPosts.slice(0, 12)) {
    const text = post.text ?? "";
    const match = text.match(keywordPattern);
    if (!match?.[1]) {
      continue;
    }

    const keyword = match[1].replace(/[^A-Za-z0-9]/g, "");
    if (!keyword) {
      continue;
    }

    if (invalidKeywords.has(keyword.toLowerCase())) {
      return "XPO";
    }

    return keyword.toUpperCase();
  }

  const hasGenericCommentCta =
    recentPosts.some((post) => /\b(?:comment|reply)\b/i.test(post.text ?? "")) ||
    /\bcomment\b/i.test(bio);
  return hasGenericCommentCta ? "XPO" : null;
}

function buildVoicePreviewDraft(args: {
  profile: XPublicProfile;
  stage: GuestAnalysisStage;
  focus: string;
  recentPosts: XPublicPost[];
}): GuestAnalysisVoicePreview {
  const { profile, stage, focus, recentPosts } = args;
  const topicHint = extractTopicHint(profile.bio);
  const casing = inferVoiceCasing(profile, recentPosts);
  const leadSample = extractLeadSample(recentPosts);
  const commentCtaKeyword = detectCommentCtaKeyword(recentPosts, profile.bio);
  const seed = getDeterministicSeed(
    `${profile.username}:${stage}:${focus}:${recentPosts.map((post) => post.id).join(",")}`,
  );

  const topicOptions = topicHint
    ? ([
        `I am doubling down on ${topicHint}.`,
        `I am staying focused on ${topicHint} instead of random swings.`,
        `I am anchoring on ${topicHint} and cutting noise.`,
      ] as const)
    : ([
        "I am done posting random takes with no system.",
        "No more guessing what to post next.",
        "I finally have a repeatable loop instead of vibes.",
      ] as const);

  const shortOpenOptions = leadSample
    ? ([
        `${leadSample} - now I run that same voice through Xpo before posting.`,
        `Still writing how I usually write (${leadSample}), but now with Xpo as my prep layer.`,
        `${leadSample}. Xpo helps me keep that tone and ship faster.`,
      ] as const)
    : ([
        "Xpo is now part of my weekly writing workflow.",
        "I run every content sprint through Xpo first.",
        "Before posting, I map ideas through Xpo.",
      ] as const);

  const shortMapOptions = [
    `Xpo mapped me to ${stage} and showed me the next move to execute.`,
    `Xpo tagged me at ${stage} and gave me a clearer priority.`,
    `Xpo put me in ${stage} and pointed me at the highest-leverage step.`,
  ] as const;
  const shortCloseOptions = [
    "Already feels less random and way more repeatable.",
    "My output feels cleaner and I waste less time.",
    "Less guesswork, better cadence, stronger signal.",
  ] as const;

  const longOpenOptions = [
    "Xpo is now my pre-post check before I publish.",
    "I run Xpo before every posting sprint.",
    "I use Xpo as my planning layer before I write.",
  ] as const;

  const longMapOptions = [
    `It mapped @${profile.username} to ${stage} and flagged ${focus.toLowerCase()} as the lever to push right now.`,
    `Xpo mapped @${profile.username} to ${stage} and highlighted ${focus.toLowerCase()} as the main pressure point.`,
    `Xpo put @${profile.username} in ${stage} and surfaced ${focus.toLowerCase()} as the priority to compound.`,
  ] as const;

  const longBodyOptions = [
    "I am using Xpo to tighten hooks, prioritize what to ship, and keep cadence consistent.",
    "Xpo helps me pick the next post, tighten framing, and stay on cadence.",
    "I use Xpo to pressure-test ideas before posting so momentum compounds.",
  ] as const;

  const longSignalOptions = [
    "Early signal is cleaner positioning and less guesswork every week.",
    "I am seeing clearer direction and fewer wasted posts already.",
    "It feels more intentional, and the momentum is easier to sustain.",
  ] as const;

  const longCloseOptions = [
    "I will keep sharing results as this compounds.",
    "Sticking with this workflow for the next month.",
    "Going to keep shipping through Xpo and track how it compounds.",
  ] as const;

  const commentCtaLine = commentCtaKeyword
    ? `Comment "${commentCtaKeyword}" for the app link.`
    : null;

  const shortLines = [
    pickSeededOption(shortOpenOptions, seed, 0),
    pickSeededOption(shortMapOptions, seed, 1),
    pickSeededOption(topicOptions, seed, 2),
    pickSeededOption(shortCloseOptions, seed, 3),
    stage !== "0 → 1k" ? commentCtaLine : null,
  ].filter((line): line is string => Boolean(line));

  const longLines = [
    pickSeededOption(longOpenOptions, seed, 0),
    pickSeededOption(longMapOptions, seed, 1),
    pickSeededOption(topicOptions, seed, 2),
    pickSeededOption(longBodyOptions, seed, 3),
    pickSeededOption(longSignalOptions, seed, 4),
    pickSeededOption(longCloseOptions, seed, 5),
    commentCtaLine,
  ].filter((line): line is string => Boolean(line));

  return {
    shortform: clampPreviewCopy(
      shortLines.map((line) => applyVoiceCasing(line, casing)).join("\n\n"),
      250,
    ),
    longform: clampPreviewCopy(
      longLines.map((line) => applyVoiceCasing(line, casing)).join("\n"),
      700,
    ),
  };
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

function buildRecentPostEvidence(args: {
  recentPosts: XPublicPost[];
  knownFor: string;
  targetAudience: string;
  contentPillars: string[];
}): GuestAnalysisEvidence {
  const { recentPosts } = args;
  if (recentPosts.length === 0) {
    return {
      key: "recent_posts",
      label: "Recent posts",
      status: "unknown",
      summary: "Recent-post coherence could not be checked yet because no scrape capture is available.",
    };
  }

  const strategyTerms = buildStrategyTerms(args.knownFor, args.targetAudience, args.contentPillars);
  const matchingPosts = recentPosts.filter((post) =>
    strategyTerms.some((term) => term && post.text.toLowerCase().includes(term.toLowerCase())),
  );
  const coherenceRate = matchingPosts.length / recentPosts.length;

  if (coherenceRate >= 0.5) {
    return {
      key: "recent_posts",
      label: "Recent posts",
      status: "pass",
      summary: `${matchingPosts.length} of the last ${recentPosts.length} posts reinforce the same positioning model.`,
    };
  }

  if (coherenceRate >= 0.25) {
    return {
      key: "recent_posts",
      label: "Recent posts",
      status: "warn",
      summary: `Recent posts show partial coherence, but only ${matchingPosts.length} of the last ${recentPosts.length} clearly reinforce the profile promise.`,
    };
  }

  return {
    key: "recent_posts",
    label: "Recent posts",
    status: "fail",
    summary: `Only ${matchingPosts.length} of the last ${recentPosts.length} posts clearly ladder back to the positioning this profile is trying to convert.`,
  };
}

function buildCoverage(args: {
  source: OnboardingPreviewSource;
  profile: XPublicProfile;
  pinnedPost: XPinnedPost | null;
  recentPosts: XPublicPost[];
}): GuestAnalysisCoverage {
  const { source, profile, pinnedPost, recentPosts } = args;
  const hasRecentPosts = recentPosts.length > 0;
  const hasPinnedPost = Boolean(pinnedPost);
  const hasHeaderImage = Boolean(profile.headerImageUrl);
  const completeness = hasRecentPosts ? "full" : "partial";
  let summary = `Using ${source === "cache" ? "live profile fields plus scrape cache" : "live profile fields"} `;

  if (hasRecentPosts && hasPinnedPost) {
    summary += `with ${recentPosts.length} recent posts and a pinned post in view.`;
  } else if (hasRecentPosts) {
    summary += `with ${recentPosts.length} recent posts, but pinned-post coverage is limited.`;
  } else {
    summary += "without recent-post or pinned-post coverage yet.";
  }

  return {
    source,
    hasRecentPosts,
    recentPostCount: recentPosts.length,
    hasPinnedPost,
    hasHeaderImage,
    completeness,
    summary,
  };
}

function buildSourceCoverageEvidence(coverage: GuestAnalysisCoverage): GuestAnalysisEvidence {
  return {
    key: "source_coverage",
    label: "Coverage",
    status: coverage.completeness === "full" ? "pass" : "warn",
    summary: coverage.summary,
  };
}

function buildPriorityCandidates(args: {
  stage: GuestAnalysisStage;
  recentPostEvidence: GuestAnalysisEvidence;
  audit: ReturnType<typeof buildProfileConversionAudit>;
}): GuestAnalysisPriority[] {
  const { stage, recentPostEvidence, audit } = args;
  const candidates: GuestAnalysisPriority[] = [];

  const stepToPriority = {
    bio_formula: {
      key: "bio" as const,
      title: "Sharpen the bio promise",
      howXpoHelps:
        "Xpo rewrites the bio into a tighter who/what/proof formula so the account is legible in one glance.",
    },
    visual_real_estate: {
      key: "banner" as const,
      title: "Upgrade the banner real estate",
      howXpoHelps:
        "Xpo turns the banner into a clearer value-prop surface instead of dead visual space.",
    },
    pinned_tweet: {
      key: "pinned_post" as const,
      title: "Fix the pinned-post handoff",
      howXpoHelps:
        "Xpo suggests the right pinned asset for this stage, usually a stronger origin story, thesis, or authority post.",
    },
  };

  for (const step of audit.steps) {
    if (step.status === "pass") {
      continue;
    }

    const mapping = stepToPriority[step.key];
    candidates.push({
      key: mapping.key,
      status: step.status,
      title: mapping.title,
      why: step.findings[0] ?? step.summary,
      howXpoHelps: mapping.howXpoHelps,
    });
  }

  if (recentPostEvidence.status === "fail" || recentPostEvidence.status === "warn") {
    candidates.push({
      key: "recent_posts",
      status: recentPostEvidence.status,
      title: "Make the timeline match the profile",
      why: recentPostEvidence.summary,
      howXpoHelps:
        "Xpo turns the strongest recurring ideas into repeatable pillars so profile visits and recent posts tell the same story.",
    });
  }

  const stageMeta = STAGE_METADATA[stage];
  candidates.push({
    key: "stage",
    status: "pass",
    title: `Pressure the ${stageMeta.focus.toLowerCase()} lever`,
    why: stageMeta.executionPriority,
    howXpoHelps: stageMeta.stageSupportLine,
  });

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
    stage: 4,
  };

  return candidates
    .sort(
      (left, right) =>
        statusRank[left.status] - statusRank[right.status] || order[left.key] - order[right.key],
    )
    .slice(0, 3);
}

function buildVerdict(args: {
  stage: GuestAnalysisStage;
  audit: ReturnType<typeof buildProfileConversionAudit>;
  recentPostEvidence: GuestAnalysisEvidence;
}): string {
  const { stage, audit, recentPostEvidence } = args;
  const stageMeta = STAGE_METADATA[stage];

  if (audit.score >= 76 && recentPostEvidence.status === "pass") {
    return `${audit.headline} The profile already has a usable ${stageMeta.focus.toLowerCase()} foundation; the next upside is compounding it more intentionally.`;
  }

  if (audit.score >= 58) {
    return `${audit.headline} For this ${stage} account, the biggest gain is tightening the profile surfaces before pushing harder on distribution.`;
  }

  return `${audit.headline} Right now Xpo would fix the conversion leaks before asking this ${stage} account to scale output harder.`;
}

export function buildGuestOnboardingAnalysis(args: {
  profile: XPublicProfile;
  source: OnboardingPreviewSource;
  pinnedPost?: XPinnedPost | null;
  recentPosts?: XPublicPost[];
}): GuestOnboardingAnalysis {
  const recentPosts = (args.recentPosts ?? []).slice(0, 5);
  const pinnedPost = args.pinnedPost ?? null;
  const stage = resolvePlaybookStage(args.profile.followersCount);
  const stageMeta = STAGE_METADATA[stage];
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
  const recentPostEvidence = buildRecentPostEvidence({
    recentPosts,
    knownFor,
    targetAudience,
    contentPillars,
  });
  const coverage = buildCoverage({
    source: args.source,
    profile: args.profile,
    pinnedPost,
    recentPosts,
  });
  const evidence: GuestAnalysisEvidence[] = [
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
    recentPostEvidence,
    buildSourceCoverageEvidence(coverage),
  ];

  return {
    profile: args.profile,
    stage,
    verdict: buildVerdict({
      stage,
      audit,
      recentPostEvidence,
    }),
    coverage,
    evidence,
    priorities: buildPriorityCandidates({
      stage,
      recentPostEvidence,
      audit,
    }),
    profileSnapshot: {
      pinnedPost,
      recentPosts,
    },
    voicePreview: buildVoicePreviewDraft({
      profile: args.profile,
      stage,
      focus: stageMeta.focus,
      recentPosts,
    }),
    source: args.source,
  };
}
