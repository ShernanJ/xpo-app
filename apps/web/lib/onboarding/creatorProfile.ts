import {
  classifyContentType,
  detectHookPattern,
} from "./analysis";
import { buildPerformanceModel } from "./performanceModel";
import type {
  ContentType,
  CreatorArchetype,
  CreatorProfile,
  HookPattern,
  LengthBand,
  OnboardingResult,
  PerformanceModel,
  TopicSignal,
  ToneCasing,
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

function extractTopicSignals(posts: XPublicPost[], limit = 5): TopicSignal[] {
  if (posts.length === 0) {
    return [];
  }

  const counter = new Map<string, number>();
  for (const post of posts) {
    const seenInPost = new Set<string>();
    for (const token of tokenizePost(post.text)) {
      if (seenInPost.has(token)) {
        continue;
      }

      seenInPost.add(token);
      counter.set(token, (counter.get(token) ?? 0) + 1);
    }
  }

  return Array.from(counter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({
      label,
      count,
      percentage: Number(((count / posts.length) * 100).toFixed(2)),
    }));
}

function buildContentPillars(topics: TopicSignal[]): string[] {
  return topics.slice(0, 3).map((topic) => topic.label);
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
    signals.push(`People interested in ${topics[0].label}`);
  }

  return signals.slice(0, 3);
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

function inferArchetype(posts: XPublicPost[], topics: TopicSignal[]): CreatorArchetype {
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

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const second = ranked[1];

  if (!top || top[1] <= 0) {
    return "social_operator";
  }

  if (second && second[1] > 0 && top[1] - second[1] <= 1) {
    return "hybrid";
  }

  return top[0] as Exclude<CreatorArchetype, "hybrid">;
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
  const archetype = inferArchetype(posts, dominantTopics);
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
    strategy: {
      primaryGoal: params.onboarding.strategyState.goal,
      archetype,
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
