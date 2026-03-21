import type { OnboardingResult, XPostMetrics, XPublicPost } from "../../onboarding/types.ts";
import type { CreatorProfileHints } from "./groundingPacket.ts";
import type { ConversationalDiagnosticContext } from "../runtime/diagnostics.ts";
import type { CreatorAgentContext } from "../../onboarding/strategy/agentContext.ts";
import { getPostEngagementTotal, splitCuratedOnboardingPosts } from "../../onboarding/shared/postSampling";
import type {
  ContentType,
  CreatorRepresentativePost,
  HookPattern,
  PostLinkSignal,
} from "../../onboarding/contracts/types.ts";
import { isHumanSafeTopicLabel } from "../responses/draftTopicSelector.ts";

export interface ProfileReplyTopicInsight {
  label: string;
  confidence: "high" | "medium" | "low";
  kind: "theme" | "proof" | "positioning";
  evidenceSnippets: string[];
  source: "recent_posts" | "profile_surface" | "mixed";
}

export interface ProfileReplyPostComparison {
  basis: "previous_best_7d" | "baseline_average_engagement" | null;
  referenceEngagementTotal: number | null;
  ratio: number | null;
}

export interface ProfileReplyStrongestPost {
  timeframe: "recent" | "this_month";
  text: string;
  createdAt: string;
  engagementTotal: number;
  metrics: XPostMetrics;
  imageUrls: string[];
  linkSignal: PostLinkSignal | null;
  comparison: ProfileReplyPostComparison;
  reasons: string[];
  hookPattern: HookPattern | null;
  contentType: ContentType | null;
}

export interface ProfileReplyContext {
  accountLabel: string | null;
  bio: string | null;
  knownFor: string | null;
  targetAudience: string | null;
  contentPillars: string[];
  stage: string | null;
  goal: string | null;
  topicInsights?: ProfileReplyTopicInsight[];
  topicBullets: string[];
  recentPostSnippets: string[];
  pinnedPost: string | null;
  recentPostCount: number;
  strongestPost: ProfileReplyStrongestPost | null;
}

interface BuildProfileReplyContextArgs {
  onboardingResult?: Partial<OnboardingResult> | null;
  creatorProfileHints?: CreatorProfileHints | null;
  creatorAgentContext?: CreatorAgentContext | null;
  diagnosticContext?: ConversationalDiagnosticContext | null;
}

const THEME_ALIASES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bcto\b/i, label: "Lessons from the CTO seat" },
  { pattern: /\bcofounder\b/i, label: "Becoming a better cofounder" },
  { pattern: /\bhir(?:e|ing|es)\b|\btalent\b/i, label: "Hiring and building a stronger team" },
  { pattern: /\bfounder\b|\bstartup\b/i, label: "Founder lessons from building a startup" },
  { pattern: /\bdistribution\b|\bgrowth\b/i, label: "Growth and distribution lessons" },
  { pattern: /\bteam\b/i, label: "Team-building and leadership" },
  { pattern: /\bcompany\b/i, label: "Company-building lessons" },
  { pattern: /\bproduct\b/i, label: "Product lessons from the build process" },
  { pattern: /\bai\b|\bartificial intelligence\b/i, label: "Practical AI lessons" },
];

const TOPIC_INSIGHT_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "for",
  "from",
  "into",
  "its",
  "just",
  "not",
  "the",
  "this",
  "that",
  "their",
  "them",
  "they",
  "with",
  "year",
  "years",
  "till",
  "will",
]);

const LOW_LEVERAGE_RECENT_SIGNAL_PATTERNS = [
  /\b(sf|nyc|toronto|la|london|vancouver)\b.{0,24}\b(one week|weekend|week)\b/i,
  /^holy fucking cinema\b/i,
  /\bplease\b.*\bneed this\b/i,
  /🥹|😭|😂|🤣|lol|lmao/i,
];

function normalizeLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function dedupeLines(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const normalized = normalizeLine(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(normalized);
  }

  return next;
}

function truncateSnippet(value: string, maxLength: number): string {
  const normalized = normalizeLine(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function getEngagementTotal(metrics: XPostMetrics | null | undefined): number {
  return getPostEngagementTotal(metrics);
}

function isDirectiveLikeTheme(value: string): boolean {
  return /^(?:lean|focus|post|write|avoid|keep|make|share|show|double down|talk)\b/i.test(value);
}

function stripRawUrls(value: string): string {
  return normalizeLine(value).replace(/https?:\/\/\S+/gi, "").trim();
}

function sanitizeThemeCandidate(value: string): string | null {
  const normalized = normalizeLine(value)
    .replace(/^[-*]\s*/, "")
    .replace(/^"+|"+$/g, "")
    .replace(/[.?!:;]+$/g, "")
    .trim();

  if (!normalized) {
    return null;
  }

  const alias = THEME_ALIASES.find((entry) => entry.pattern.test(normalized));
  if (alias) {
    return alias.label;
  }

  if (isDirectiveLikeTheme(normalized)) {
    return null;
  }

  if (normalized.split(/\s+/).length <= 8) {
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  return null;
}

function summarizeRecentPostToBullet(text: string): string | null {
  const normalized = stripRawUrls(text)
    .replace(/^"+|"+$/g, "")
    .trim();

  if (!normalized) {
    return null;
  }

  for (const alias of THEME_ALIASES) {
    if (alias.pattern.test(normalized)) {
      return alias.label;
    }
  }

  const firstClause = normalized.split(/(?<=[.?!])\s+|[:;]/)[0]?.trim() || normalized;
  return truncateSnippet(firstClause, 84);
}

function isLowLeverageRecentSignal(value: string): boolean {
  const normalized = stripRawUrls(value).toLowerCase();
  if (!normalized) {
    return true;
  }

  if (LOW_LEVERAGE_RECENT_SIGNAL_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (/^(please|anyone|someone)\b/i.test(normalized)) {
    return true;
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (
    wordCount <= 6 &&
    !/\b(gpu|infra|inference|engineer|builders?|growth|distribution|proof|revenue|mrr|arr|founder|startup|ai|product)\b/i.test(
      normalized,
    )
  ) {
    return true;
  }

  return false;
}

function shouldIgnoreRecentPostForTopicExtraction(post: XPublicPost): boolean {
  return post.linkSignal === "media_only" || isLowLeverageRecentSignal(post.text);
}

function collectRecentPosts(
  onboardingResult?: Partial<OnboardingResult> | null,
): XPublicPost[] {
  const { recentPosts } = splitCuratedOnboardingPosts(
    Array.isArray(onboardingResult?.recentPosts) ? onboardingResult.recentPosts : [],
  );

  return recentPosts.filter(
        (post): post is XPublicPost =>
          Boolean(post) &&
          typeof post === "object" &&
          !Array.isArray(post) &&
          typeof post.text === "string" &&
          typeof post.createdAt === "string" &&
          typeof post.metrics === "object" &&
          post.metrics !== null,
      );
}

function collectRecentPostSnippets(onboardingResult?: Partial<OnboardingResult> | null): string[] {
  const posts = collectRecentPosts(onboardingResult);

  return dedupeLines(
    posts
      .map((post) =>
        post && typeof post === "object" && !Array.isArray(post) && typeof post.text === "string"
          ? truncateSnippet(post.text, 120)
          : "",
      )
      .filter(Boolean),
  ).slice(0, 3);
}

function collectTopicBullets(args: {
  creatorAgentContext?: CreatorAgentContext | null;
  creatorProfileHints?: CreatorProfileHints | null;
  onboardingResult?: Partial<OnboardingResult> | null;
}): string[] {
  const pillarCandidates = [
    ...(args.creatorAgentContext?.creatorProfile.topics.contentPillars || []),
    ...(args.creatorProfileHints?.contentPillars || []),
  ]
    .map((value) => sanitizeThemeCandidate(value))
    .filter(
      (value): value is string =>
        typeof value === "string" &&
        value.length > 0 &&
        (value.includes(" ") || !TOPIC_INSIGHT_STOPWORDS.has(value.toLowerCase())),
    );

  const recentPostCandidates = collectRecentPosts(args.onboardingResult)
    .filter((post) => !shouldIgnoreRecentPostForTopicExtraction(post))
    .map((post) =>
      post && typeof post === "object" && !Array.isArray(post) && typeof post.text === "string"
        ? summarizeRecentPostToBullet(post.text)
        : null,
    )
    .filter(
      (value): value is string =>
        typeof value === "string" &&
        value.length > 0 &&
        !/\b(i|my|me|we|our)\b/i.test(value) &&
        !isLowLeverageRecentSignal(value) &&
        isHumanSafeTopicLabel(value),
    );

  return dedupeLines([...pillarCandidates, ...recentPostCandidates]).slice(0, 4);
}

function normalizeTopicInsightLabel(value: string): string | null {
  const sanitized = sanitizeThemeCandidate(value);
  if (sanitized) {
    if (!sanitized.includes(" ")) {
      return null;
    }
    return sanitized;
  }

  const normalized = normalizeLine(value)
    .replace(/^"+|"+$/g, "")
    .replace(/[.?!:;]+$/g, "")
    .trim();
  if (!normalized) {
    return null;
  }

  if (/\b(i|my|me|we|our)\b/i.test(normalized)) {
    return null;
  }

  const tokens = normalized
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !TOPIC_INSIGHT_STOPWORDS.has(token));
  if (tokens.length < 2) {
    return null;
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function tokenizeTopicInsightLabel(value: string): string[] {
  return normalizeLine(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !TOPIC_INSIGHT_STOPWORDS.has(token));
}

function buildTopicEvidenceSnippets(args: {
  label: string;
  recentPosts: XPublicPost[];
  seedSnippets?: string[];
}): string[] {
  const normalizedLabel = normalizeLine(args.label).toLowerCase();
  const labelTokens = tokenizeTopicInsightLabel(args.label);
  const evidenceFromPosts = dedupeLines(
    args.recentPosts
      .filter((post) => {
        const normalizedPost = normalizeLine(post.text).toLowerCase();
        if (!normalizedPost) {
          return false;
        }

        if (normalizedPost.includes(normalizedLabel)) {
          return true;
        }

        const matches = labelTokens.filter((token) => normalizedPost.includes(token)).length;
        const requiredMatches = labelTokens.length >= 4 ? 2 : 1;
        return matches >= requiredMatches;
      })
      .map((post) => truncateSnippet(post.text, 120)),
  );

  return dedupeLines([...(args.seedSnippets || []), ...evidenceFromPosts]).slice(0, 2);
}

function resolveTopicInsightConfidence(args: {
  label: string;
  evidenceCount: number;
  source: "recent_posts" | "mixed";
}): ProfileReplyTopicInsight["confidence"] {
  const tokenCount = tokenizeTopicInsightLabel(args.label).length;
  if (args.evidenceCount >= 2 && tokenCount >= 2 && args.source === "recent_posts") {
    return "high";
  }

  if (args.evidenceCount >= 2 || tokenCount >= 2) {
    return "medium";
  }

  return "low";
}

function buildTopicInsights(args: {
  creatorAgentContext?: CreatorAgentContext | null;
  creatorProfileHints?: CreatorProfileHints | null;
  onboardingResult?: Partial<OnboardingResult> | null;
}): ProfileReplyTopicInsight[] {
  const recentPosts = collectRecentPosts(args.onboardingResult);
  const candidates = new Map<
    string,
    {
      sources: Set<"recent_posts" | "profile_surface" | "mixed">;
      kinds: Set<ProfileReplyTopicInsight["kind"]>;
      seedSnippets: string[];
    }
  >();
  const registerCandidate = (
    rawLabel: string | null,
    source: "recent_posts" | "profile_surface" | "mixed",
    kind: ProfileReplyTopicInsight["kind"],
    seedSnippet?: string | null,
  ) => {
    const label = rawLabel ? normalizeTopicInsightLabel(rawLabel) : null;
    if (!label) {
      return;
    }

    const current = candidates.get(label) ?? {
      sources: new Set<"recent_posts" | "profile_surface" | "mixed">(),
      kinds: new Set<ProfileReplyTopicInsight["kind"]>(),
      seedSnippets: [],
    };
    current.sources.add(source);
    current.kinds.add(kind);
    if (seedSnippet) {
      current.seedSnippets.push(seedSnippet);
    }
    candidates.set(label, current);
  };

  const knownFor = args.creatorProfileHints?.knownFor?.trim() ||
    args.creatorAgentContext?.growthStrategySnapshot.knownFor?.trim() ||
    null;
  const bio =
    typeof args.onboardingResult?.profile === "object" &&
      args.onboardingResult?.profile &&
      !Array.isArray(args.onboardingResult.profile) &&
      typeof args.onboardingResult.profile.bio === "string"
      ? args.onboardingResult.profile.bio.trim()
      : "";

  registerCandidate(knownFor, "profile_surface", "positioning", knownFor);
  if (bio && !isLowLeverageRecentSignal(bio)) {
    registerCandidate(knownFor || bio, "profile_surface", "positioning", bio);
  }

  for (const pillar of [
    ...(args.creatorAgentContext?.creatorProfile.topics.contentPillars || []),
    ...(args.creatorProfileHints?.contentPillars || []),
  ]) {
    registerCandidate(pillar, "mixed", "theme", pillar);
  }

  for (const post of recentPosts) {
    if (shouldIgnoreRecentPostForTopicExtraction(post)) {
      continue;
    }

    const snippet = truncateSnippet(post.text, 120);
    const recentPostTopic = summarizeRecentPostToBullet(post.text);
    if (!recentPostTopic || !isHumanSafeTopicLabel(recentPostTopic)) {
      continue;
    }

    registerCandidate(recentPostTopic, "recent_posts", "theme", snippet);
  }

  const insights = Array.from(candidates.entries())
    .map(([label, candidate]) => {
      const source: "recent_posts" | "profile_surface" | "mixed" =
        candidate.sources.size === 1 && candidate.sources.has("recent_posts")
          ? "recent_posts"
          : candidate.sources.size === 1 && candidate.sources.has("profile_surface")
            ? "profile_surface"
          : "mixed";
      const evidenceSnippets = buildTopicEvidenceSnippets({
        label,
        recentPosts,
        seedSnippets: candidate.seedSnippets,
      });
      if (evidenceSnippets.length === 0) {
        return null;
      }

      const confidence = resolveTopicInsightConfidence({
        label,
        evidenceCount: evidenceSnippets.length,
        source: source === "profile_surface" ? "mixed" : source,
      });
      const kind: ProfileReplyTopicInsight["kind"] = candidate.kinds.has("proof")
        ? "proof"
        : candidate.kinds.has("positioning")
          ? "positioning"
          : "theme";
      const confidenceWeight =
        confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
      const sourceWeight = source === "recent_posts" ? 2 : 1;
      const specificityWeight = label.includes(" ") ? 2 : 1;
      const kindWeight = kind === "proof" ? 4 : kind === "positioning" ? 3 : 2;

      return {
        label,
        confidence,
        kind,
        evidenceSnippets,
        source,
        score:
          kindWeight * 10 +
          confidenceWeight * 10 +
          sourceWeight * 4 +
          specificityWeight * 2 +
          evidenceSnippets.length,
      };
    })
    .filter((insight): insight is ProfileReplyTopicInsight & { score: number } => Boolean(insight))
    .sort((left, right) => right.score - left.score || left.label.length - right.label.length)
    .slice(0, 3)
    .map(({ score: _score, ...insight }) => insight);

  if (insights.length > 0) {
    return insights;
  }

  const fallbackSnippet = collectRecentPostSnippets(args.onboardingResult)[0];
  const fallbackLabel = fallbackSnippet
    ? normalizeTopicInsightLabel(summarizeRecentPostToBullet(fallbackSnippet) || fallbackSnippet)
    : null;
  if (!fallbackSnippet || !fallbackLabel) {
    return [];
  }

  return [
    {
      label: fallbackLabel,
      confidence: "low",
      kind: "theme",
      evidenceSnippets: [fallbackSnippet],
      source: "recent_posts",
    },
  ];
}

function findRepresentativePost(args: {
  creatorAgentContext?: CreatorAgentContext | null;
  postId: string;
}): CreatorRepresentativePost | null {
  const examples = args.creatorAgentContext?.creatorProfile.examples;
  if (!examples) {
    return null;
  }

  const groups = [
    examples.bestPerforming,
    examples.voiceAnchors,
    examples.strategyAnchors,
    examples.goalAnchors,
    examples.cautionExamples,
    examples.goalConflictExamples,
    examples.replyVoiceAnchors,
    examples.quoteVoiceAnchors,
  ];

  for (const group of groups) {
    const match = group.find((post) => post.id === args.postId);
    if (match) {
      return match;
    }
  }

  return null;
}

function inferReasonFromHookPattern(hookPattern: HookPattern | null): string | null {
  switch (hookPattern) {
    case "numeric_open":
      return "The hook leads with a concrete number, which usually helps it stop the scroll.";
    case "question_open":
      return "The opener invites people into the post quickly, which helps it earn replies instead of passive likes.";
    case "story_open":
      return "It opens like a story instead of a generic tip, which makes the post easier to follow.";
    case "hot_take_open":
      return "The hook makes a clear point of view early, which tends to pull people into the replies.";
    case "how_to_open":
      return "It promises a practical takeaway right away, which makes the value easy to spot.";
    case "statement_open":
      return "The opener gets to the point fast, which makes the post easy to process.";
    default:
      return null;
  }
}

function labelContentType(contentType: ContentType | null): string | null {
  switch (contentType) {
    case "list_post":
      return "list-style";
    case "multi_line":
      return "multi-line";
    case "question_post":
      return "question-led";
    case "single_line":
      return "single-line";
    case "link_post":
      return "link-led";
    default:
      return null;
  }
}

function buildStrongestPostReasons(args: {
  representativePost: CreatorRepresentativePost | null;
  strongestPost: XPublicPost;
  creatorAgentContext?: CreatorAgentContext | null;
}): string[] {
  const reasons: string[] = [];
  const representative = args.representativePost;

  const hookReason = inferReasonFromHookPattern(representative?.hookPattern ?? null);
  if (hookReason) {
    reasons.push(hookReason);
  }

  if (
    args.strongestPost.linkSignal === "media_only" &&
    (args.strongestPost.imageUrls?.length ?? 0) > 0
  ) {
    reasons.push(
      "This reads more like a media-backed proof post than a link-led post, so the attached image is likely carrying part of the attention.",
    );
  }

  const bestContentType = args.creatorAgentContext?.performanceModel.bestContentType ?? null;
  if (bestContentType && representative?.contentType === bestContentType) {
    const label = labelContentType(bestContentType);
    if (label) {
      reasons.push(`It matches one of your stronger ${label} formats in the current sample.`);
    }
  }

  if (
    args.strongestPost.metrics.replyCount > 0 &&
    args.strongestPost.metrics.replyCount >= Math.max(8, Math.round(args.strongestPost.metrics.likeCount * 0.03))
  ) {
    reasons.push("It pulled a healthy number of replies too, which usually means the topic landed as a conversation starter.");
  }

  return dedupeLines(reasons).slice(0, 2);
}

function coversCurrentMonth(posts: XPublicPost[]): boolean {
  if (posts.length === 0) {
    return false;
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const timestamps = posts
    .map((post) => Date.parse(post.createdAt))
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) {
    return false;
  }

  const oldest = Math.min(...timestamps);
  const newest = Math.max(...timestamps);

  return oldest <= monthStart.getTime() && newest >= monthStart.getTime();
}

function buildStrongestPostInsight(args: {
  onboardingResult?: Partial<OnboardingResult> | null;
  creatorAgentContext?: CreatorAgentContext | null;
}): ProfileReplyStrongestPost | null {
  const posts = collectRecentPosts(args.onboardingResult);

  if (posts.length === 0) {
    return null;
  }

  const ranked = [...posts].sort((left, right) => {
    const engagementDelta = getEngagementTotal(right.metrics) - getEngagementTotal(left.metrics);
    if (engagementDelta !== 0) {
      return engagementDelta;
    }

    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });

  const strongestPost = ranked[0];
  if (!strongestPost) {
    return null;
  }

  const strongestEngagement = getEngagementTotal(strongestPost.metrics);
  if (strongestEngagement <= 0) {
    return null;
  }
  const strongestCreatedAt = Date.parse(strongestPost.createdAt);
  const previousBest = ranked
    .filter((post) => {
      const createdAt = Date.parse(post.createdAt);
      if (!Number.isFinite(createdAt) || !Number.isFinite(strongestCreatedAt)) {
        return false;
      }

      const deltaMs = strongestCreatedAt - createdAt;
      return post.id !== strongestPost.id && deltaMs > 0 && deltaMs <= 7 * 24 * 60 * 60 * 1000;
    })
    .sort((left, right) => getEngagementTotal(right.metrics) - getEngagementTotal(left.metrics))[0];

  const baselineEngagement =
    typeof args.onboardingResult?.baseline === "object" &&
    args.onboardingResult?.baseline &&
    !Array.isArray(args.onboardingResult.baseline) &&
    typeof args.onboardingResult.baseline.averageEngagement === "number"
      ? args.onboardingResult.baseline.averageEngagement
      : null;

  let comparison: ProfileReplyPostComparison = {
    basis: null,
    referenceEngagementTotal: null,
    ratio: null,
  };

  if (previousBest) {
    const reference = getEngagementTotal(previousBest.metrics);
    comparison = {
      basis: reference > 0 ? "previous_best_7d" : null,
      referenceEngagementTotal: reference > 0 ? reference : null,
      ratio: reference > 0 ? strongestEngagement / reference : null,
    };
  } else if (baselineEngagement && baselineEngagement > 0) {
    comparison = {
      basis: "baseline_average_engagement",
      referenceEngagementTotal: baselineEngagement,
      ratio: strongestEngagement / baselineEngagement,
    };
  }

  const representativePost = findRepresentativePost({
    creatorAgentContext: args.creatorAgentContext,
    postId: strongestPost.id,
  });

  return {
    timeframe: coversCurrentMonth(posts) ? "this_month" : "recent",
    text: strongestPost.text,
    createdAt: strongestPost.createdAt,
    engagementTotal: strongestEngagement,
    metrics: strongestPost.metrics,
    imageUrls: strongestPost.imageUrls ?? [],
    linkSignal: strongestPost.linkSignal ?? null,
    comparison,
    reasons: buildStrongestPostReasons({
      representativePost,
      strongestPost,
      creatorAgentContext: args.creatorAgentContext,
    }),
    hookPattern: representativePost?.hookPattern ?? null,
    contentType: representativePost?.contentType ?? null,
  };
}

export function buildProfileReplyContext(args: BuildProfileReplyContextArgs): ProfileReplyContext | null {
  const onboarding = args.onboardingResult ?? null;
  const profile =
    onboarding?.profile && typeof onboarding.profile === "object" && !Array.isArray(onboarding.profile)
      ? onboarding.profile
      : null;

  const displayName =
    typeof profile?.name === "string" && profile.name.trim() ? profile.name.trim() : null;
  const handle =
    typeof profile?.username === "string" && profile.username.trim()
      ? `@${profile.username.trim().replace(/^@+/, "")}`
      : null;
  const accountLabel = [displayName, handle].filter(Boolean).join(" ") || null;
  const bio = typeof profile?.bio === "string" && profile.bio.trim() ? profile.bio.trim() : null;
  const knownFor =
    args.creatorProfileHints?.knownFor?.trim() ||
    args.creatorAgentContext?.growthStrategySnapshot.knownFor?.trim() ||
    args.diagnosticContext?.knownFor?.trim() ||
    null;
  const targetAudience =
    args.creatorProfileHints?.targetAudience?.trim() ||
    null;
  const contentPillars = dedupeLines([
    ...(args.creatorAgentContext?.creatorProfile.topics.contentPillars || []),
    ...(args.creatorProfileHints?.contentPillars || []),
  ]).slice(0, 4);
  const stage =
    args.diagnosticContext?.stage?.trim() ||
    (typeof onboarding?.growthStage === "string" && onboarding.growthStage.trim()) ||
    null;
  const goal =
    (typeof onboarding?.strategyState === "object" &&
    onboarding.strategyState &&
    !Array.isArray(onboarding.strategyState) &&
    typeof onboarding.strategyState.goal === "string" &&
    onboarding.strategyState.goal.trim()) ||
    null;
  const pinnedPost =
    onboarding?.pinnedPost &&
    typeof onboarding.pinnedPost === "object" &&
    !Array.isArray(onboarding.pinnedPost) &&
    typeof onboarding.pinnedPost.text === "string" &&
    onboarding.pinnedPost.text.trim()
      ? truncateSnippet(onboarding.pinnedPost.text, 180)
      : null;

  const topicInsights = buildTopicInsights({
    creatorAgentContext: args.creatorAgentContext,
    creatorProfileHints: args.creatorProfileHints,
    onboardingResult: onboarding,
  });
  const topicBullets = collectTopicBullets({
    creatorAgentContext: args.creatorAgentContext,
    creatorProfileHints: args.creatorProfileHints,
    onboardingResult: onboarding,
  });
  const recentPostSnippets = collectRecentPostSnippets(onboarding);
  const strongestPost = buildStrongestPostInsight({
    onboardingResult: onboarding,
    creatorAgentContext: args.creatorAgentContext,
  });
  const recentPostCount = collectRecentPosts(onboarding).length;

  const hasMeaningfulContext = Boolean(
    accountLabel ||
      bio ||
      knownFor ||
      targetAudience ||
      contentPillars.length > 0 ||
      topicInsights.length > 0 ||
      topicBullets.length > 0 ||
      recentPostSnippets.length > 0 ||
      strongestPost ||
      stage ||
      goal ||
      pinnedPost,
  );

  if (!hasMeaningfulContext) {
    return null;
  }

  return {
    accountLabel,
    bio,
    knownFor,
    targetAudience,
    contentPillars,
    stage: stage && !/^unknown$/i.test(stage) ? stage : null,
    goal: goal && !/^audience growth$/i.test(goal) ? goal : null,
    topicInsights,
    topicBullets: dedupeLines([
      ...topicInsights.map((insight) => insight.label),
      ...topicBullets,
    ]).slice(0, 4),
    recentPostSnippets,
    pinnedPost,
    recentPostCount,
    strongestPost,
  };
}
