import {
  classifyContentType,
  computePostEngagement,
  detectHookPattern,
} from "./analysis";
import { buildPerformanceModel } from "./performanceModel";
import type {
  AudienceBreadth,
  ContentType,
  CreatorArchetype,
  CreatorProfile,
  CreatorRepresentativeExamples,
  CreatorRepresentativePost,
  HookPattern,
  LengthBand,
  OnboardingResult,
  PerformanceModel,
  TopicSignal,
  TopicSpecificity,
  ToneCasing,
  TransformationMode,
  UserGoal,
  XPublicPost,
} from "./types";

const STOPWORDS = new Set([
  "a",
  "about",
  "after",
  "all",
  "also",
  "am",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "by",
  "can",
  "did",
  "do",
  "for",
  "from",
  "get",
  "had",
  "has",
  "have",
  "how",
  "i",
  "if",
  "im",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "like",
  "me",
  "more",
  "my",
  "not",
  "of",
  "on",
  "or",
  "our",
  "out",
  "so",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "too",
  "up",
  "ur",
  "was",
  "we",
  "what",
  "when",
  "with",
  "you",
  "your",
]);

const LOW_SIGNAL_TOPIC_WORDS = new Set([
  "almost",
  "back",
  "come",
  "day",
  "days",
  "friend",
  "friends",
  "going",
  "good",
  "great",
  "last",
  "life",
  "love",
  "made",
  "make",
  "next",
  "outside",
  "people",
  "planning",
  "site",
  "stuff",
  "thing",
  "things",
  "throwback",
  "time",
  "today",
  "tomorrow",
  "week",
  "weeks",
  "win",
  "years",
]);

const LOCATION_CONTEXT_PATTERN =
  /\b(toronto|ontario|canada|burlington|montreal|vancouver|new york|nyc|sf|san francisco|la|los angeles|london)\b/i;

interface TopicAccumulator {
  count: number;
  totalEngagement: number;
  weightedScore: number;
  hasLocalContext: boolean;
}

interface ArchetypeInferenceResult {
  primary: CreatorArchetype;
  secondary: CreatorArchetype | null;
  confidence: number;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toPercent(value: number): number {
  return Number((value * 100).toFixed(2));
}

function normalizePostText(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/@\w+/g, " ")
    .replace(/[^\p{L}\p{N}\s_-]+/gu, " ")
    .toLowerCase();
}

function tokenizePost(text: string): string[] {
  return normalizePostText(text)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !STOPWORDS.has(token));
}

function getTimeOrFallback(value: string, fallback: number): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

function inferTopicSpecificity(label: string, stats: TopicAccumulator): TopicSpecificity {
  const isLowSignal = LOW_SIGNAL_TOPIC_WORDS.has(label);

  if (!isLowSignal && stats.hasLocalContext && stats.count >= 2) {
    return "local_scene";
  }

  if (!isLowSignal && stats.count >= 2) {
    return "niche";
  }

  return "broad";
}

function extractTopicSignals(posts: XPublicPost[], limit = 5): TopicSignal[] {
  if (posts.length === 0) {
    return [];
  }

  const baselineEngagement = Math.max(
    1,
    average(posts.map((post) => computePostEngagement(post))),
  );
  const timestamps = posts
    .map((post) => new Date(post.createdAt).getTime())
    .filter(Number.isFinite);
  const newestTimestamp = timestamps.length ? Math.max(...timestamps) : Date.now();
  const oldestTimestamp = timestamps.length ? Math.min(...timestamps) : newestTimestamp;
  const span = Math.max(1, newestTimestamp - oldestTimestamp);

  const counter = new Map<string, TopicAccumulator>();
  for (const post of posts) {
    const postEngagement = computePostEngagement(post);
    const postTimestamp = getTimeOrFallback(post.createdAt, newestTimestamp);
    const normalizedRecency = Math.min(
      1,
      Math.max(0, (postTimestamp - oldestTimestamp) / span),
    );
    const recencyWeight = 0.8 + normalizedRecency * 0.4;
    const engagementWeight =
      0.75 + Math.min(1.25, postEngagement / baselineEngagement);
    const hasLocalContext = LOCATION_CONTEXT_PATTERN.test(post.text);
    const seenInPost = new Set<string>();

    for (const token of tokenizePost(post.text)) {
      if (seenInPost.has(token)) {
        continue;
      }

      seenInPost.add(token);
      const specificityWeight = LOW_SIGNAL_TOPIC_WORDS.has(token)
        ? 0.45
        : token.length >= 4
          ? 1.1
          : 0.9;
      const current = counter.get(token) ?? {
        count: 0,
        totalEngagement: 0,
        weightedScore: 0,
        hasLocalContext: false,
      };

      counter.set(token, {
        count: current.count + 1,
        totalEngagement: current.totalEngagement + postEngagement,
        weightedScore:
          current.weightedScore +
          recencyWeight * engagementWeight * specificityWeight,
        hasLocalContext: current.hasLocalContext || hasLocalContext,
      });
    }
  }

  return Array.from(counter.entries())
    .map(([label, stats]) => {
      const specificity = inferTopicSpecificity(label, stats);
      const specificityMultiplier =
        specificity === "local_scene"
          ? 1.15
          : specificity === "niche"
            ? 1.05
            : 0.9;

      return {
        label,
        count: stats.count,
        percentage: Number(((stats.count / posts.length) * 100).toFixed(2)),
        averageEngagement: Number((stats.totalEngagement / stats.count).toFixed(2)),
        score: Number((stats.weightedScore * specificityMultiplier).toFixed(2)),
        specificity,
      };
    })
    .sort((a, b) => b.score - a.score || b.count - a.count || b.averageEngagement - a.averageEngagement)
    .slice(0, limit);
}

function buildContentPillars(topics: TopicSignal[]): string[] {
  const prioritized = [
    ...topics.filter((topic) => topic.specificity !== "broad"),
    ...topics.filter((topic) => topic.specificity === "broad"),
  ];

  return prioritized.slice(0, 3).map((topic) => topic.label);
}

function buildAudienceSignals(posts: XPublicPost[], topics: TopicSignal[]): string[] {
  const allText = posts.map((post) => post.text.toLowerCase()).join("\n");
  const signals: string[] = [];

  if (/\b(founder|startup|customer|product|users)\b/.test(allText)) {
    signals.push("Founders and operators");
  }

  if (/\b(engineer|dev|code|coding|build|shipping)\b/.test(allText)) {
    signals.push("Builders and technical peers");
  }

  if (/\b(job|interview|resume|intern|career|hiring)\b/.test(allText)) {
    signals.push("Hiring managers and career network");
  }

  if (/\b(lesson|guide|learned|tutorial|how to)\b/.test(allText)) {
    signals.push("People looking for practical advice");
  }

  if (signals.length === 0 && topics.length > 0) {
    const topTopic = topics[0];
    if (topTopic.specificity === "local_scene") {
      signals.push(
        `People already familiar with ${topTopic.label} or its local scene`,
      );
    } else {
      signals.push(`People interested in ${topTopic.label}`);
    }
  }

  return signals.slice(0, 3);
}

function inferAudienceBreadth(topics: TopicSignal[]): AudienceBreadth {
  const topTopic = topics[0];
  if (!topTopic) {
    return "broad";
  }

  if (topTopic.specificity === "local_scene") {
    return topTopic.percentage >= 20 ? "narrow" : "mixed";
  }

  if (topTopic.specificity === "niche") {
    return topTopic.percentage >= 25 ? "mixed" : "broad";
  }

  return "broad";
}

function buildSpecificityTradeoff(
  topics: TopicSignal[],
  audienceBreadth: AudienceBreadth,
): string {
  const topTopic = topics[0];
  if (!topTopic) {
    return "There is not enough repeated topic signal yet to estimate audience breadth tradeoffs.";
  }

  if (topTopic.specificity === "local_scene") {
    return `References to ${topTopic.label} likely strengthen identity and niche resonance, but can narrow discovery outside that scene.`;
  }

  if (topTopic.specificity === "niche") {
    return `Leaning on ${topTopic.label} can improve relevance for a focused audience, but may reduce broad-audience clarity if overused.`;
  }

  if (audienceBreadth === "broad") {
    return "Current topic signals are broadly legible, which helps reach, but may need more specificity to feel distinct.";
  }

  return "The current mix balances broad discovery with some niche-specific resonance.";
}

function inferPrimaryCasing(posts: XPublicPost[]): ToneCasing {
  const alphaPosts = posts.filter((post) => /[A-Za-z]/.test(post.text));
  if (alphaPosts.length === 0) {
    return "normal";
  }

  const lowercaseOnlyCount = alphaPosts.filter((post) => {
    const lettersOnly = post.text.replace(/[^A-Za-z]/g, "");
    return lettersOnly.length > 0 && lettersOnly === lettersOnly.toLowerCase();
  }).length;

  return lowercaseOnlyCount / alphaPosts.length >= 0.6 ? "lowercase" : "normal";
}

function computeLowercaseSharePercent(posts: XPublicPost[]): number {
  const alphaPosts = posts.filter((post) => /[A-Za-z]/.test(post.text));
  if (alphaPosts.length === 0) {
    return 0;
  }

  const lowercaseOnlyCount = alphaPosts.filter((post) => {
    const lettersOnly = post.text.replace(/[^A-Za-z]/g, "");
    return lettersOnly.length > 0 && lettersOnly === lettersOnly.toLowerCase();
  }).length;

  return toPercent(lowercaseOnlyCount / alphaPosts.length);
}

function inferAverageLengthBand(posts: XPublicPost[]): LengthBand | null {
  const lengths = posts.map((post) => post.text.trim().length).filter(Boolean);
  if (lengths.length === 0) {
    return null;
  }

  const averageLength = average(lengths);
  if (averageLength <= 120) {
    return "short";
  }

  if (averageLength <= 220) {
    return "medium";
  }

  return "long";
}

function extractDominantContentType(posts: XPublicPost[]): ContentType | null {
  if (posts.length === 0) {
    return null;
  }

  const counts = new Map<ContentType, number>();
  for (const post of posts) {
    const type = classifyContentType(post.text);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function extractDominantHookPattern(posts: XPublicPost[]): HookPattern | null {
  if (posts.length === 0) {
    return null;
  }

  const counts = new Map<HookPattern, number>();
  for (const post of posts) {
    const pattern = detectHookPattern(post.text);
    counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
  }

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function buildStyleNotes(params: {
  primaryCasing: ToneCasing;
  averageLengthBand: LengthBand | null;
  questionPostRate: number;
  multiLinePostRate: number;
  emojiPostRate: number;
  dominantContentType: ContentType | null;
}): string[] {
  const notes: string[] = [];

  notes.push(
    params.primaryCasing === "lowercase"
      ? "Voice leans casual and lowercase."
      : "Voice reads more standard-case and direct.",
  );

  if (params.averageLengthBand) {
    notes.push(`Typical post length skews ${params.averageLengthBand}.`);
  }

  if (params.questionPostRate >= 20) {
    notes.push("Questions are part of the current engagement pattern.");
  }

  if (params.multiLinePostRate >= 35) {
    notes.push("Multi-line structure is a common delivery format.");
  }

  if (params.emojiPostRate >= 25) {
    notes.push("Emoji and expressive punctuation are part of the voice.");
  }

  if (params.dominantContentType) {
    notes.push(`Most posts currently look like ${params.dominantContentType}.`);
  }

  return notes.slice(0, 4);
}

function inferLengthBandForPost(text: string): LengthBand {
  const length = text.trim().length;
  if (length <= 120) {
    return "short";
  }

  if (length <= 220) {
    return "medium";
  }

  return "long";
}

function isLowercaseOnlyPost(text: string): boolean {
  const lettersOnly = text.replace(/[^A-Za-z]/g, "");
  return lettersOnly.length > 0 && lettersOnly === lettersOnly.toLowerCase();
}

function toDeltaVsBaselinePercent(engagement: number, baseline: number): number {
  if (baseline <= 0) {
    return engagement > 0 ? 100 : 0;
  }

  return Number((((engagement - baseline) / baseline) * 100).toFixed(2));
}

function buildRepresentativePost(
  post: XPublicPost,
  baselineEngagement: number,
  selectionReason: string,
): CreatorRepresentativePost {
  const engagementTotal = computePostEngagement(post);

  return {
    id: post.id,
    text: post.text,
    createdAt: post.createdAt,
    engagementTotal,
    deltaVsBaselinePercent: toDeltaVsBaselinePercent(engagementTotal, baselineEngagement),
    contentType: classifyContentType(post.text),
    hookPattern: detectHookPattern(post.text),
    selectionReason,
  };
}

function buildRepresentativeExamples(params: {
  posts: XPublicPost[];
  baselineEngagement: number;
  dominantContentType: ContentType | null;
  dominantHookPattern: HookPattern | null;
  primaryCasing: ToneCasing;
  averageLengthBand: LengthBand | null;
}): CreatorRepresentativeExamples {
  const { posts, baselineEngagement } = params;

  if (posts.length === 0) {
    return {
      bestPerforming: [],
      voiceAnchors: [],
      cautionExamples: [],
    };
  }

  const excluded = new Set<string>();
  const byEngagementDesc = [...posts].sort((a, b) => {
    const engagementDelta = computePostEngagement(b) - computePostEngagement(a);
    if (engagementDelta !== 0) {
      return engagementDelta;
    }

    return getTimeOrFallback(b.createdAt, 0) - getTimeOrFallback(a.createdAt, 0);
  });

  const bestPerforming = byEngagementDesc.slice(0, 3).map((post) => {
    excluded.add(post.id);
    return buildRepresentativePost(
      post,
      baselineEngagement,
      "Top engagement in the current sample. Use this as proof of what already earns attention.",
    );
  });

  const voiceScoredPosts = posts
    .map((post) => {
      let score = 0;
      const contentType = classifyContentType(post.text);
      const hookPattern = detectHookPattern(post.text);
      const postLengthBand = inferLengthBandForPost(post.text);
      const postIsLowercase = isLowercaseOnlyPost(post.text);
      const engagementLift = Math.max(0, computePostEngagement(post) - baselineEngagement);

      if (params.dominantContentType && contentType === params.dominantContentType) {
        score += 2;
      }
      if (params.dominantHookPattern && hookPattern === params.dominantHookPattern) {
        score += 2;
      }
      if (params.averageLengthBand && postLengthBand === params.averageLengthBand) {
        score += 1;
      }
      if (
        (params.primaryCasing === "lowercase" && postIsLowercase) ||
        (params.primaryCasing === "normal" && !postIsLowercase)
      ) {
        score += 1;
      }

      score += Math.min(1.5, engagementLift / Math.max(1, baselineEngagement));

      return { post, score };
    })
    .sort((a, b) => {
      const scoreDelta = b.score - a.score;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return computePostEngagement(b.post) - computePostEngagement(a.post);
    });

  const voiceAnchors = voiceScoredPosts
    .filter(({ post }) => !excluded.has(post.id))
    .slice(0, 3)
    .map(({ post }) => {
      excluded.add(post.id);
      return buildRepresentativePost(
        post,
        baselineEngagement,
        "Strong match for the account's current voice and structure. Use this as a style anchor.",
      );
    });

  const byEngagementAsc = [...posts].sort((a, b) => {
    const engagementDelta = computePostEngagement(a) - computePostEngagement(b);
    if (engagementDelta !== 0) {
      return engagementDelta;
    }

    return getTimeOrFallback(b.createdAt, 0) - getTimeOrFallback(a.createdAt, 0);
  });

  const cautionPool = byEngagementAsc.filter((post) => !excluded.has(post.id));
  const cautionSource = cautionPool.length > 0 ? cautionPool : byEngagementAsc;
  const cautionExamples = cautionSource.slice(0, Math.min(2, cautionSource.length)).map((post) =>
    buildRepresentativePost(
      post,
      baselineEngagement,
      "Lower-performing relative to the current sample. Use this as a caution example before repeating the pattern.",
    ),
  );

  return {
    bestPerforming,
    voiceAnchors,
    cautionExamples,
  };
}

function inferArchetypeProfile(
  posts: XPublicPost[],
  topics: TopicSignal[],
): ArchetypeInferenceResult {
  const allText = posts.map((post) => post.text.toLowerCase()).join("\n");
  const scores: Record<Exclude<CreatorArchetype, "hybrid">, number> = {
    builder: 0,
    founder_operator: 0,
    job_seeker: 0,
    educator: 0,
    curator: 0,
    social_operator: 0,
  };

  const bump = (
    archetype: Exclude<CreatorArchetype, "hybrid">,
    pattern: RegExp,
    weight = 1,
  ) => {
    if (pattern.test(allText)) {
      scores[archetype] += weight;
    }
  };

  bump("builder", /\b(code|coding|dev|engineer|engineering|build|building|ship|shipping)\b/, 2);
  bump("founder_operator", /\b(founder|startup|customer|product|users|company|revenue|sales)\b/, 2);
  bump("job_seeker", /\b(job|interview|resume|intern|career|hiring|offer)\b/, 2);
  bump("educator", /\b(lesson|guide|tutorial|learned|teach|how to|thread)\b/, 2);
  bump("curator", /\b(link|read this|bookmark|resource|article)\b/);
  bump("social_operator", /\b(community|event|meetup|people|friends|network)\b/);

  const linkPosts = posts.filter((post) => /^https?:\/\//i.test(post.text.trim()) || /https?:\/\//i.test(post.text)).length;
  if (posts.length > 0 && linkPosts / posts.length >= 0.4) {
    scores.curator += 1;
  }

  const topicWords = new Set(topics.map((topic) => topic.label));
  if (topicWords.has("startup") || topicWords.has("founder")) {
    scores.founder_operator += 1;
  }
  if (topicWords.has("code") || topicWords.has("build")) {
    scores.builder += 1;
  }
  if (topics.some((topic) => topic.specificity === "local_scene")) {
    scores.social_operator += 1;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const second = ranked[1];

  if (!top || top[1] <= 0) {
    return {
      primary: "social_operator",
      secondary: null,
      confidence: 20,
    };
  }

  const topScore = top[1];
  const secondScore = second?.[1] ?? 0;
  const totalScore = Math.max(
    1,
    ranked.reduce((sum, entry) => sum + Math.max(0, entry[1]), 0),
  );
  const share = topScore / totalScore;
  const margin = topScore > 0 ? (topScore - secondScore) / topScore : 0;
  const confidence = Number(
    Math.max(20, Math.min(100, 35 + share * 35 + margin * 30)).toFixed(2),
  );
  const secondary =
    second && secondScore > 0 && (topScore - secondScore <= 1 || secondScore / topScore >= 0.75)
      ? (second[0] as Exclude<CreatorArchetype, "hybrid">)
      : null;

  return {
    primary: top[0] as Exclude<CreatorArchetype, "hybrid">,
    secondary,
    confidence,
  };
}

function buildRecommendedAngles(goal: UserGoal, archetype: CreatorArchetype): string[] {
  const angles: string[] = [];

  if (goal === "followers") {
    angles.push("Lean into distribution-friendly hooks and repeatable topic series.");
  }

  if (goal === "leads") {
    angles.push("Bias toward pain-point, proof, and outcome-driven posts.");
  }

  if (goal === "authority") {
    angles.push("Publish stronger point-of-view and proof-backed takes.");
  }

  if (archetype === "builder") {
    angles.push("Use build-in-public updates and proof-of-work screenshots.");
  }

  if (archetype === "founder_operator") {
    angles.push("Turn operator lessons into concise market and customer insights.");
  }

  if (archetype === "job_seeker") {
    angles.push("Increase project breakdowns, lessons learned, and credibility signals.");
  }

  if (archetype === "educator") {
    angles.push("Package lessons into repeatable frameworks and mini-guides.");
  }

  if (archetype === "curator") {
    angles.push("Add stronger original commentary so curation builds authority.");
  }

  if (angles.length === 0) {
    angles.push("Increase consistency around one repeatable content pillar.");
  }

  return angles.slice(0, 4);
}

function buildDefaultTransformationMode(): {
  mode: TransformationMode;
  source: "default";
} {
  return {
    mode: "optimize",
    source: "default",
  };
}

function buildTargetState(params: {
  goal: UserGoal;
  archetype: CreatorArchetype;
  audienceBreadth: AudienceBreadth;
}): {
  targetPrimaryArchetype: CreatorArchetype;
  targetAudienceBreadth: AudienceBreadth | "same";
  planningNote: string;
} {
  const baseNote =
    "The current default path assumes optimizing what already works until the user explicitly chooses preserve or pivot.";

  if (params.goal === "followers" && params.audienceBreadth === "narrow") {
    return {
      targetPrimaryArchetype: params.archetype,
      targetAudienceBreadth: "same",
      planningNote: `${baseNote} If the user wants broader discovery, the next strategy pass should test a softer expansion beyond the current narrow audience lane.`,
    };
  }

  if (params.goal === "authority") {
    return {
      targetPrimaryArchetype: params.archetype,
      targetAudienceBreadth: "same",
      planningNote: `${baseNote} If the user wants a stronger repositioning, we should explicitly choose whether to preserve the current lane or pivot toward a new authority narrative.`,
    };
  }

  return {
    targetPrimaryArchetype: params.archetype,
    targetAudienceBreadth: "same",
    planningNote: baseNote,
  };
}

function buildStrategyRationale(goal: UserGoal, archetype: CreatorArchetype): string {
  if (goal === "followers") {
    return `Optimize for discovery first. ${archetype} accounts grow faster when they package repeatable patterns into clearer hooks.`;
  }

  if (goal === "leads") {
    return `Shift from pure visibility to trust plus specificity. ${archetype} accounts need clear proof and audience pain alignment.`;
  }

  return `Authority compounds when voice, proof, and consistency line up. The current ${archetype} pattern should become more opinionated and structured.`;
}

export function buildCreatorProfile(params: {
  sourceRunId: string;
  onboarding: OnboardingResult;
  performanceModel?: PerformanceModel;
}): CreatorProfile {
  const posts = params.onboarding.recentPosts ?? [];
  const performanceModel =
    params.performanceModel ??
    buildPerformanceModel({
      sourceRunId: params.sourceRunId,
      onboarding: params.onboarding,
    });

  const dominantTopics = extractTopicSignals(posts);
  const archetypeProfile = inferArchetypeProfile(posts, dominantTopics);
  const archetype = archetypeProfile.primary;
  const audienceBreadth = inferAudienceBreadth(dominantTopics);
  const transformation = buildDefaultTransformationMode();
  const targetState = buildTargetState({
    goal: params.onboarding.strategyState.goal,
    archetype,
    audienceBreadth,
  });
  const primaryCasing = inferPrimaryCasing(posts);
  const lowercaseSharePercent = computeLowercaseSharePercent(posts);
  const averageLengthBand = inferAverageLengthBand(posts);
  const questionPostRate = toPercent(
    posts.length > 0
      ? posts.filter((post) => post.text.includes("?")).length / posts.length
      : 0,
  );
  const multiLinePostRate = toPercent(
    posts.length > 0
      ? posts.filter((post) => post.text.includes("\n")).length / posts.length
      : 0,
  );
  const emojiPostRate = toPercent(
    posts.length > 0
      ? posts.filter((post) => /\p{Extended_Pictographic}/u.test(post.text)).length / posts.length
      : 0,
  );
  const dominantContentType =
    extractDominantContentType(posts) ?? performanceModel.bestContentType;
  const dominantHookPattern =
    extractDominantHookPattern(posts) ?? performanceModel.bestHookPattern;
  const representativeExamples = buildRepresentativeExamples({
    posts,
    baselineEngagement: params.onboarding.baseline.averageEngagement,
    dominantContentType,
    dominantHookPattern,
    primaryCasing,
    averageLengthBand,
  });
  const createdAt = new Date(params.onboarding.profile.createdAt);
  const accountAgeDays = Number.isFinite(createdAt.getTime())
    ? Math.max(
        0,
        Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)),
      )
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    sourceRunId: params.sourceRunId,
    identity: {
      username: params.onboarding.profile.username,
      displayName: params.onboarding.profile.name,
      followersCount: params.onboarding.profile.followersCount,
      followingCount: params.onboarding.profile.followingCount,
      followerBand: params.onboarding.growthStage,
      isVerified: params.onboarding.profile.isVerified ?? false,
      accountAgeDays,
    },
    voice: {
      primaryCasing,
      averageLengthBand,
      lowercaseSharePercent,
      questionPostRate,
      multiLinePostRate,
      emojiPostRate,
      dominantContentType,
      dominantHookPattern,
      styleNotes: buildStyleNotes({
        primaryCasing,
        averageLengthBand,
        questionPostRate,
        multiLinePostRate,
        emojiPostRate,
        dominantContentType,
      }),
    },
    topics: {
      dominantTopics,
      contentPillars: buildContentPillars(dominantTopics),
      audienceSignals: buildAudienceSignals(posts, dominantTopics),
      audienceBreadth,
      specificityTradeoff: buildSpecificityTradeoff(
        dominantTopics,
        audienceBreadth,
      ),
    },
    performance: {
      baselineAverageEngagement: params.onboarding.baseline.averageEngagement,
      medianEngagement: params.onboarding.baseline.medianEngagement,
      engagementRate: params.onboarding.baseline.engagementRate,
      postingCadencePerWeek: params.onboarding.baseline.postingCadencePerWeek,
      bestContentType: performanceModel.bestContentType,
      weakestContentType: performanceModel.weakestContentType,
      bestHookPattern: performanceModel.bestHookPattern,
      recommendedLengthBand: performanceModel.lengthOptimization.recommendedBand,
      recommendedPostsPerWeek: params.onboarding.strategyState.recommendedPostsPerWeek,
    },
    archetype,
    secondaryArchetype: archetypeProfile.secondary,
    archetypeConfidence: archetypeProfile.confidence,
    examples: representativeExamples,
    strategy: {
      primaryGoal: params.onboarding.strategyState.goal,
      archetype,
      transformationMode: transformation.mode,
      transformationModeSource: transformation.source,
      currentState: {
        followerBand: params.onboarding.growthStage,
        primaryArchetype: archetype,
        secondaryArchetype: archetypeProfile.secondary,
        audienceBreadth,
      },
      targetState,
      currentStrengths: performanceModel.strengths,
      currentWeaknesses: performanceModel.weaknesses,
      recommendedAngles: buildRecommendedAngles(
        params.onboarding.strategyState.goal,
        archetype,
      ),
      nextMoves: performanceModel.nextActions,
      rationale: buildStrategyRationale(
        params.onboarding.strategyState.goal,
        archetype,
      ),
    },
  };
}
