import {
  analyzePostFeatures,
  classifyContentType,
  computePostEngagement,
  detectHookPattern,
  isLowSignalEntityCandidate,
} from "./analysis";
import { buildPerformanceModel } from "./performanceModel";
import type {
  AudienceBreadth,
  ContentType,
  CreatorArchetype,
  CreatorContentLane,
  CreatorDistributionLoopProfile,
  CreatorPlaybookProfile,
  CreatorExecutionProfile,
  CreatorProfile,
  CreatorQuoteProfile,
  CreatorReplyProfile,
  CreatorRepresentativeExamples,
  CreatorRepresentativePost,
  CreatorStrategyProfile,
  DeliveryStyle,
  DependenceLevel,
  DistributionLoopType,
  HookPattern,
  LengthBand,
  OnboardingResult,
  PerformanceModel,
  ReplyStyle,
  ReplyStyleMixItem,
  ReplyTone,
  TopicSignal,
  TopicSpecificity,
  TopicStability,
  ToneCasing,
  UserGoal,
  XPublicPost,
} from "./types";

const LOCATION_CONTEXT_PATTERN =
  /\b(toronto|ontario|canada|burlington|montreal|vancouver|new york|nyc|sf|san francisco|la|los angeles|london)\b/i;

interface TopicAccumulator {
  count: number;
  recentCount: number;
  olderCount: number;
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

function getTimeOrFallback(value: string, fallback: number): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

function inferTopicSpecificity(label: string, stats: TopicAccumulator): TopicSpecificity {
  const isLowSignal = isLowSignalEntityCandidate(label);
  const looksLikePhrase = label.includes(" ");

  if (!isLowSignal && stats.hasLocalContext && (stats.count >= 2 || looksLikePhrase)) {
    return "local_scene";
  }

  if (!isLowSignal && (stats.count >= 2 || looksLikePhrase)) {
    return "niche";
  }

  return "broad";
}

function inferTopicStability(stats: TopicAccumulator): TopicStability {
  if (stats.count < 3) {
    return "steady";
  }

  const recentShare = stats.recentCount / Math.max(1, stats.count);
  if (recentShare >= 0.7 && stats.recentCount >= 2) {
    return "emerging";
  }

  if (recentShare <= 0.3 && stats.olderCount >= 2) {
    return "fading";
  }

  return "steady";
}

function getPrimaryTopicSignal(topics: TopicSignal[]): TopicSignal | null {
  const current = topics.find((topic) => topic.stability !== "fading");
  return current ?? topics[0] ?? null;
}

function extractTopicSignals(posts: XPublicPost[], limit = 5): TopicSignal[] {
  if (posts.length === 0) {
    return [];
  }

  const orderedPosts = [...posts].sort(
    (a, b) =>
      getTimeOrFallback(b.createdAt, 0) - getTimeOrFallback(a.createdAt, 0),
  );

  const baselineEngagement = Math.max(
    1,
    average(orderedPosts.map((post) => computePostEngagement(post))),
  );
  const timestamps = orderedPosts
    .map((post) => new Date(post.createdAt).getTime())
    .filter(Number.isFinite);
  const newestTimestamp = timestamps.length ? Math.max(...timestamps) : Date.now();
  const oldestTimestamp = timestamps.length ? Math.min(...timestamps) : newestTimestamp;
  const span = Math.max(1, newestTimestamp - oldestTimestamp);
  const recentWindowSize = Math.max(1, Math.ceil(orderedPosts.length / 2));

  const counter = new Map<string, TopicAccumulator>();
  for (const [index, post] of orderedPosts.entries()) {
    const postEngagement = computePostEngagement(post);
    const features = analyzePostFeatures(post);
    const postTimestamp = getTimeOrFallback(post.createdAt, newestTimestamp);
    const normalizedRecency = Math.min(
      1,
      Math.max(0, (postTimestamp - oldestTimestamp) / span),
    );
    const recencyWeight = 0.8 + normalizedRecency * 0.4;
    const engagementWeight =
      0.75 + Math.min(1.25, postEngagement / baselineEngagement);
    const hasLocalContext = LOCATION_CONTEXT_PATTERN.test(post.text);

    for (const candidate of features.entityCandidates) {
      const specificityWeight = isLowSignalEntityCandidate(candidate)
        ? 0.45
        : candidate.includes(" ")
          ? 1.35
          : candidate.length >= 4
          ? 1.1
          : 0.9;
      const current = counter.get(candidate) ?? {
        count: 0,
        recentCount: 0,
        olderCount: 0,
        totalEngagement: 0,
        weightedScore: 0,
        hasLocalContext: false,
      };

      counter.set(candidate, {
        count: current.count + 1,
        recentCount: current.recentCount + (index < recentWindowSize ? 1 : 0),
        olderCount: current.olderCount + (index >= recentWindowSize ? 1 : 0),
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
      const stability = inferTopicStability(stats);
      const specificityMultiplier =
        specificity === "local_scene"
          ? 1.15
          : specificity === "niche"
            ? 1.05
            : 0.9;
      const stabilityMultiplier =
        stability === "emerging" ? 1.08 : stability === "fading" ? 0.92 : 1;

      return {
        label,
        count: stats.count,
        percentage: Number(((stats.count / orderedPosts.length) * 100).toFixed(2)),
        recentSharePercent: toPercent(stats.recentCount / Math.max(1, stats.count)),
        averageEngagement: Number((stats.totalEngagement / stats.count).toFixed(2)),
        score: Number(
          (stats.weightedScore * specificityMultiplier * stabilityMultiplier).toFixed(
            2,
          ),
        ),
        specificity,
        stability,
      };
    })
    .sort((a, b) => b.score - a.score || b.count - a.count || b.averageEngagement - a.averageEngagement)
    .slice(0, limit);
}

function buildContentPillars(topics: TopicSignal[]): string[] {
  const prioritized = [
    ...topics.filter(
      (topic) =>
        topic.specificity !== "broad" && topic.stability !== "fading",
    ),
    ...topics.filter(
      (topic) =>
        topic.specificity !== "broad" && topic.stability === "fading",
    ),
    ...topics.filter(
      (topic) =>
        topic.specificity === "broad" && topic.stability !== "fading",
    ),
    ...topics.filter(
      (topic) =>
        topic.specificity === "broad" && topic.stability === "fading",
    ),
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
    const topTopic = getPrimaryTopicSignal(topics);
    if (!topTopic) {
      return signals;
    }

    if (topTopic.specificity === "local_scene") {
      signals.push(
        `People already familiar with ${topTopic.label} or its local scene`,
      );
    } else if (topTopic.stability === "emerging") {
      signals.push(`People increasingly responding to ${topTopic.label}`);
    } else {
      signals.push(`People interested in ${topTopic.label}`);
    }
  }

  return signals.slice(0, 3);
}

function inferAudienceBreadth(topics: TopicSignal[]): AudienceBreadth {
  const topTopic = getPrimaryTopicSignal(topics);
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
  const topTopic = getPrimaryTopicSignal(topics);
  if (!topTopic) {
    return "There is not enough repeated topic signal yet to estimate audience breadth tradeoffs.";
  }

  const stabilityPrefix =
    topTopic.stability === "emerging"
      ? `${topTopic.label} is becoming more prominent in recent posts. `
      : topTopic.stability === "fading"
        ? `${topTopic.label} appears more historical than current right now. `
        : "";

  if (topTopic.specificity === "local_scene") {
    return `${stabilityPrefix}References to ${topTopic.label} likely strengthen identity and niche resonance, but can narrow discovery outside that scene.`;
  }

  if (topTopic.specificity === "niche") {
    return `${stabilityPrefix}Leaning on ${topTopic.label} can improve relevance for a focused audience, but may reduce broad-audience clarity if overused.`;
  }

  if (audienceBreadth === "broad") {
    return `${stabilityPrefix}Current topic signals are broadly legible, which helps reach, but may need more specificity to feel distinct.`;
  }

  return `${stabilityPrefix}The current mix balances broad discovery with some niche-specific resonance.`;
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

function computeGoalFitScore(params: {
  goal: UserGoal;
  lane: CreatorContentLane;
  baselineEngagement: number;
  features: ReturnType<typeof analyzePostFeatures>;
}): number {
  const baseline = Math.max(1, params.baselineEngagement || 1);
  const engagementRatio = params.features.engagementTotal / baseline;
  let score = 20 + Math.min(18, Math.max(0, (engagementRatio - 0.5) * 14));

  if (params.goal === "followers") {
    if (params.lane === "original") {
      score += 22;
    } else if (params.lane === "reply" || params.lane === "quote") {
      score += 8;
    }
    if (!params.features.hasLinks) {
      score += 14;
    }
    if (!params.features.hasMentions) {
      score += 10;
    }
    if (
      params.features.hookPattern === "statement_open" ||
      params.features.hookPattern === "question_open"
    ) {
      score += 8;
    }
    if (params.features.entityCandidates.length <= 1) {
      score += 6;
    }
  }

  if (params.goal === "leads") {
    if (params.lane === "original") {
      score += 18;
    }
    if (params.features.hasCta) {
      score += 18;
    }
    if (params.features.hasNumbers) {
      score += 12;
    }
    if (params.features.hasLinks) {
      score += 8;
    }
    if (params.features.wordCount >= 20) {
      score += 8;
    }
    if (params.features.lineCount > 1) {
      score += 4;
    }
  }

  if (params.goal === "authority") {
    if (params.lane === "original") {
      score += 18;
    }
    if (params.lane === "quote") {
      score += 8;
    }
    if (params.features.wordCount >= 18) {
      score += 14;
    }
    if (params.features.lineCount > 1) {
      score += 8;
    }
    if (params.features.hasNumbers) {
      score += 6;
    }
    if (!params.features.hasLinks) {
      score += 6;
    }
  }

  return Number(Math.max(0, Math.min(100, score)).toFixed(2));
}

function buildRepresentativePost(
  post: XPublicPost,
  lane: CreatorContentLane,
  baselineEngagement: number,
  selectionReason: string,
  goal: UserGoal,
): CreatorRepresentativePost {
  const features = analyzePostFeatures(post);
  const engagementTotal = features.engagementTotal;

  return {
    id: post.id,
    lane,
    text: post.text,
    createdAt: post.createdAt,
    engagementTotal,
    deltaVsBaselinePercent: toDeltaVsBaselinePercent(engagementTotal, baselineEngagement),
    goalFitScore: computeGoalFitScore({
      goal,
      lane,
      baselineEngagement,
      features,
    }),
    contentType: features.contentType,
    hookPattern: features.hookPattern,
    features,
    selectionReason,
  };
}

function buildRepresentativeExamples(params: {
  posts: XPublicPost[];
  replyPosts: XPublicPost[];
  quotePosts: XPublicPost[];
  baselineEngagement: number;
  goal: UserGoal;
  dominantContentType: ContentType | null;
  dominantHookPattern: HookPattern | null;
  primaryCasing: ToneCasing;
  averageLengthBand: LengthBand | null;
  strategyDelta: CreatorStrategyProfile["delta"];
}): CreatorRepresentativeExamples {
  const { posts, baselineEngagement } = params;

  if (posts.length === 0) {
    return {
      bestPerforming: [],
      voiceAnchors: [],
      strategyAnchors: [],
      goalAnchors: [],
      goalConflictExamples: [],
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
      "original",
      baselineEngagement,
      "Top engagement in the current sample. Use this as proof of what already earns attention.",
      params.goal,
    );
  });

  const voiceScoredPosts = posts
    .map((post) => {
      const features = analyzePostFeatures(post);
      let score = 0;
      const postLengthBand = inferLengthBandForPost(post.text);
      const postIsLowercase = isLowercaseOnlyPost(post.text);
      const engagementLift = Math.max(0, features.engagementTotal - baselineEngagement);

      if (params.dominantContentType && features.contentType === params.dominantContentType) {
        score += 2;
      }
      if (params.dominantHookPattern && features.hookPattern === params.dominantHookPattern) {
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
      if (features.hasQuestion) {
        score += 0.35;
      }
      if (features.hasCta) {
        score += 0.35;
      }
      if (features.lineCount > 1) {
        score += 0.2;
      }

      score += Math.min(1.5, engagementLift / Math.max(1, baselineEngagement));

      return { post, score, engagementTotal: features.engagementTotal };
    })
    .sort((a, b) => {
      const scoreDelta = b.score - a.score;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return b.engagementTotal - a.engagementTotal;
    });

  const voiceAnchors = voiceScoredPosts
    .filter(({ post }) => !excluded.has(post.id))
    .slice(0, 3)
    .map(({ post }) => {
      excluded.add(post.id);
      return buildRepresentativePost(
        post,
        "original",
        baselineEngagement,
        "Strong match for the account's current voice and structure. Use this as a style anchor.",
        params.goal,
      );
    });

  const strategyAnchors = buildStrategyAnchors({
    originalPosts: posts,
    replyPosts: params.replyPosts,
    quotePosts: params.quotePosts,
    baselineEngagement,
    strategyDelta: params.strategyDelta,
    goal: params.goal,
  });
  const goalAnchors = buildGoalAnchors({
    originalPosts: posts,
    replyPosts: params.replyPosts,
    quotePosts: params.quotePosts,
    baselineEngagement,
    goal: params.goal,
  });
  const goalConflictExamples = buildGoalConflictExamples({
    originalPosts: posts,
    replyPosts: params.replyPosts,
    quotePosts: params.quotePosts,
    baselineEngagement,
    goal: params.goal,
    strategyDelta: params.strategyDelta,
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
      "original",
      baselineEngagement,
      "Lower-performing relative to the current sample. Use this as a caution example before repeating the pattern.",
      params.goal,
    ),
  );

  return {
    bestPerforming,
    voiceAnchors,
    strategyAnchors,
    goalAnchors,
    goalConflictExamples,
    cautionExamples,
  };
}

function buildStrategyAnchors(params: {
  originalPosts: XPublicPost[];
  replyPosts: XPublicPost[];
  quotePosts: XPublicPost[];
  baselineEngagement: number;
  strategyDelta: CreatorStrategyProfile["delta"];
  goal: UserGoal;
}): CreatorRepresentativePost[] {
  const priorities: Record<CreatorStrategyProfile["delta"]["adjustments"][number]["priority"], number> = {
    high: 3,
    medium: 2,
    low: 1,
  };

  const primaryAdjustment = params.strategyDelta.adjustments[0] ?? null;
  const candidates: Array<{ post: XPublicPost; lane: CreatorContentLane }> = [
    ...params.originalPosts.map((post) => ({ post, lane: "original" as const })),
    ...params.replyPosts.map((post) => ({ post, lane: "reply" as const })),
    ...params.quotePosts.map((post) => ({ post, lane: "quote" as const })),
  ];

  const scored = candidates
    .map(({ post, lane }) => {
      const features = analyzePostFeatures(post);
      const goalFitScore = computeGoalFitScore({
        goal: params.goal,
        lane,
        baselineEngagement: params.baselineEngagement,
        features,
      });
      let score = Math.min(
        2,
        features.engagementTotal / Math.max(1, params.baselineEngagement || 1),
      );
      score += goalFitScore / 28;

      for (const adjustment of params.strategyDelta.adjustments) {
        const weight = priorities[adjustment.priority];

        if (adjustment.area === "standalone_posts" && lane === "original") {
          score += 1.5 * weight;
        }

        if (adjustment.area === "reply_activity" && lane === "reply") {
          score += 1.5 * weight;
        }

        if (adjustment.area === "quote_activity" && lane === "quote") {
          score += 1.5 * weight;
        }

        if (adjustment.area === "link_dependence" && !features.hasLinks) {
          score += 0.8 * weight;
        }

        if (adjustment.area === "mention_dependence" && !features.hasMentions) {
          score += 0.8 * weight;
        }

        if (
          (adjustment.area === "audience_breadth" ||
            adjustment.area === "topic_specificity") &&
          lane === "original"
        ) {
          if (features.entityCandidates.length <= 1) {
            score += 0.75 * weight;
          }
          if (!features.hasLinks) {
            score += 0.4 * weight;
          }
          if (!features.hasMentions) {
            score += 0.4 * weight;
          }
        }
      }

      return {
        post,
        lane,
        score,
        engagementTotal: features.engagementTotal,
      };
    })
    .sort((a, b) => {
      const scoreDelta = b.score - a.score;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return b.engagementTotal - a.engagementTotal;
    });

  return scored.slice(0, 3).map(({ post, lane }) =>
    buildRepresentativePost(
      post,
      lane,
      params.baselineEngagement,
      primaryAdjustment
        ? `Best example for the current strategy gap (${primaryAdjustment.area}). Use this as a retrieval anchor when planning the next move.`
        : "Representative example for the current strategy gap. Use this as a planning anchor.",
      params.goal,
    ),
  );
}

function buildGoalAnchors(params: {
  originalPosts: XPublicPost[];
  replyPosts: XPublicPost[];
  quotePosts: XPublicPost[];
  baselineEngagement: number;
  goal: UserGoal;
}): CreatorRepresentativePost[] {
  const candidates: Array<{ post: XPublicPost; lane: CreatorContentLane }> = [
    ...params.originalPosts.map((post) => ({ post, lane: "original" as const })),
    ...params.replyPosts.map((post) => ({ post, lane: "reply" as const })),
    ...params.quotePosts.map((post) => ({ post, lane: "quote" as const })),
  ];

  const scored = candidates
    .map(({ post, lane }) => {
      const features = analyzePostFeatures(post);
      const goalFitScore = computeGoalFitScore({
        goal: params.goal,
        lane,
        baselineEngagement: params.baselineEngagement,
        features,
      });
      const score =
        goalFitScore +
        Math.min(
          12,
          (features.engagementTotal / Math.max(1, params.baselineEngagement || 1)) *
            4,
        );

      return {
        post,
        lane,
        score,
        engagementTotal: features.engagementTotal,
      };
    })
    .sort((a, b) => {
      const scoreDelta = b.score - a.score;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return b.engagementTotal - a.engagementTotal;
    });

  return scored.slice(0, 3).map(({ post, lane }) =>
    buildRepresentativePost(
      post,
      lane,
      params.baselineEngagement,
      `Best example for the current goal (${params.goal}). Use this as a goal-specific drafting anchor.`,
      params.goal,
    ),
  );
}

function buildGoalConflictExamples(params: {
  originalPosts: XPublicPost[];
  replyPosts: XPublicPost[];
  quotePosts: XPublicPost[];
  baselineEngagement: number;
  goal: UserGoal;
  strategyDelta: CreatorStrategyProfile["delta"];
}): CreatorRepresentativePost[] {
  const priorities: Record<CreatorStrategyProfile["delta"]["adjustments"][number]["priority"], number> = {
    high: 3,
    medium: 2,
    low: 1,
  };

  const candidates: Array<{ post: XPublicPost; lane: CreatorContentLane }> = [
    ...params.originalPosts.map((post) => ({ post, lane: "original" as const })),
    ...params.replyPosts.map((post) => ({ post, lane: "reply" as const })),
    ...params.quotePosts.map((post) => ({ post, lane: "quote" as const })),
  ];

  const scored = candidates
    .map(({ post, lane }) => {
      const features = analyzePostFeatures(post);
      const goalFitScore = computeGoalFitScore({
        goal: params.goal,
        lane,
        baselineEngagement: params.baselineEngagement,
        features,
      });
      let score = Math.max(
        0,
        (params.baselineEngagement - features.engagementTotal) /
          Math.max(1, params.baselineEngagement || 1),
      );
      score += (100 - goalFitScore) / 25;

      if (params.goal === "followers") {
        if (features.hasLinks) {
          score += 1.1;
        }
        if (features.hasMentions) {
          score += 0.8;
        }
        if (lane !== "original") {
          score += 0.55;
        }
        if (features.entityCandidates.length >= 3) {
          score += 0.75;
        }
      }

      if (params.goal === "leads") {
        if (!features.hasCta) {
          score += 1.2;
        }
        if (!features.hasNumbers) {
          score += 0.9;
        }
        if (features.wordCount < 12) {
          score += 0.7;
        }
        if (lane !== "original") {
          score += 0.45;
        }
      }

      if (params.goal === "authority") {
        if (features.wordCount < 16) {
          score += 1.1;
        }
        if (features.lineCount <= 1) {
          score += 0.7;
        }
        if (lane === "reply") {
          score += 0.7;
        }
        if (features.hasLinks) {
          score += 0.45;
        }
      }

      for (const adjustment of params.strategyDelta.adjustments) {
        const weight = priorities[adjustment.priority];

        if (adjustment.area === "link_dependence" && features.hasLinks) {
          score += 0.8 * weight;
        }

        if (adjustment.area === "mention_dependence" && features.hasMentions) {
          score += 0.8 * weight;
        }

        if (adjustment.area === "standalone_posts" && lane !== "original") {
          score += 0.8 * weight;
        }

        if (
          (adjustment.area === "audience_breadth" ||
            adjustment.area === "topic_specificity") &&
          features.entityCandidates.length >= 2
        ) {
          score += 0.55 * weight;
        }
      }

      return {
        post,
        lane,
        score,
        engagementTotal: features.engagementTotal,
      };
    })
    .sort((a, b) => {
      const scoreDelta = b.score - a.score;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return a.engagementTotal - b.engagementTotal;
    });

  return scored.slice(0, 3).map(({ post, lane }) =>
    buildRepresentativePost(
      post,
      lane,
      params.baselineEngagement,
      `High-conflict example for the current goal (${params.goal}). Avoid repeating this pattern while pursuing the current target state.`,
      params.goal,
    ),
  );
}

function getDependenceLevel(rate: number): DependenceLevel {
  if (rate >= 45) {
    return "high";
  }

  if (rate >= 20) {
    return "moderate";
  }

  return "low";
}

function inferDeliveryStyle(replyStyleRate: number): DeliveryStyle {
  if (replyStyleRate >= 45) {
    return "reply_led";
  }

  if (replyStyleRate <= 15) {
    return "standalone";
  }

  return "mixed";
}

function buildExecutionProfile(posts: XPublicPost[]): CreatorExecutionProfile {
  if (posts.length === 0) {
    return {
      linkUsageRate: 0,
      mentionUsageRate: 0,
      ctaUsageRate: 0,
      replyStyleRate: 0,
      standaloneStyleRate: 100,
      linkDependence: "low",
      mentionDependence: "low",
      ctaIntensity: "low",
      deliveryStyle: "standalone",
      distributionNotes: [
        "There is not enough post data yet to estimate link, mention, or reply dependence.",
      ],
    };
  }

  const features = posts.map((post) => analyzePostFeatures(post));
  const rate = (count: number) => toPercent(count / posts.length);
  const linkUsageRate = rate(features.filter((item) => item.hasLinks).length);
  const mentionUsageRate = rate(features.filter((item) => item.hasMentions).length);
  const ctaUsageRate = rate(features.filter((item) => item.hasCta).length);
  const replyStyleRate = rate(features.filter((item) => item.isReply).length);
  const standaloneStyleRate = rate(features.filter((item) => !item.isReply).length);
  const linkDependence = getDependenceLevel(linkUsageRate);
  const mentionDependence = getDependenceLevel(mentionUsageRate);
  const ctaIntensity = getDependenceLevel(ctaUsageRate);
  const deliveryStyle = inferDeliveryStyle(replyStyleRate);
  const distributionNotes: string[] = [];

  if (linkDependence === "high") {
    distributionNotes.push(
      "Current distribution leans heavily on links, which can help curation but reduce native in-feed hold if overused.",
    );
  } else if (linkDependence === "low") {
    distributionNotes.push(
      "The current mix is not especially link-dependent, which is healthier for native attention.",
    );
  }

  if (mentionDependence === "high") {
    distributionNotes.push(
      "A high share of mention-led posts suggests reach may depend on existing network adjacency.",
    );
  }

  if (deliveryStyle === "reply_led") {
    distributionNotes.push(
      "The current posting mix is reply-led. That supports relationships, but standalone posts matter more for broad discovery.",
    );
  } else if (deliveryStyle === "standalone") {
    distributionNotes.push(
      "Most posts already stand alone, which is a stronger base for scalable discovery.",
    );
  }

  if (ctaIntensity === "high") {
    distributionNotes.push(
      "Calls-to-action are frequent, so the system should watch for over-asking versus genuine conversation.",
    );
  }

  if (distributionNotes.length === 0) {
    distributionNotes.push(
      "The current execution mix is balanced enough that no single distribution dependency dominates yet.",
    );
  }

  return {
    linkUsageRate,
    mentionUsageRate,
    ctaUsageRate,
    replyStyleRate,
    standaloneStyleRate,
    linkDependence,
    mentionDependence,
    ctaIntensity,
    deliveryStyle,
    distributionNotes: distributionNotes.slice(0, 4),
  };
}

function buildDistributionLoopProfile(params: {
  growthStage: OnboardingResult["growthStage"];
  audienceBreadth: AudienceBreadth;
  voice: {
    averageLengthBand: LengthBand | null;
    dominantHookPattern: HookPattern | null;
  };
  execution: CreatorExecutionProfile;
  replyProfile: CreatorReplyProfile;
  quoteProfile: CreatorQuoteProfile;
}): CreatorDistributionLoopProfile {
  const scores: Record<DistributionLoopType, number> = {
    reply_driven: 0,
    standalone_discovery: 0,
    quote_commentary: 0,
    profile_conversion: 0,
    authority_building: 0,
  };

  scores.reply_driven += params.execution.deliveryStyle === "reply_led" ? 28 : 0;
  scores.reply_driven += params.growthStage === "0-1k" ? 14 : 4;
  scores.reply_driven += params.replyProfile.replyCount > 0 ? 10 : 0;
  scores.reply_driven += params.replyProfile.isReliable ? 18 : 0;
  scores.reply_driven +=
    params.replyProfile.replyEngagementDeltaVsOriginalPercent !== null &&
    params.replyProfile.replyEngagementDeltaVsOriginalPercent >= 0
      ? 16
      : 0;

  scores.standalone_discovery +=
    params.execution.deliveryStyle === "standalone"
      ? 26
      : params.execution.deliveryStyle === "mixed"
        ? 14
        : 0;
  scores.standalone_discovery += params.execution.standaloneStyleRate / 6;
  scores.standalone_discovery += params.execution.linkDependence === "low" ? 14 : 0;
  scores.standalone_discovery += params.execution.mentionDependence === "low" ? 10 : 0;
  scores.standalone_discovery += params.audienceBreadth !== "narrow" ? 10 : 0;

  scores.quote_commentary += params.quoteProfile.quoteCount > 0 ? 10 : 0;
  scores.quote_commentary += params.quoteProfile.isReliable ? 20 : 0;
  scores.quote_commentary +=
    params.quoteProfile.quoteEngagementDeltaVsOriginalPercent !== null &&
    params.quoteProfile.quoteEngagementDeltaVsOriginalPercent >= 0
      ? 18
      : 0;
  scores.quote_commentary += params.quoteProfile.quoteShareOfCapturedActivity / 3;
  scores.quote_commentary +=
    params.quoteProfile.dominantQuotePattern === "statement_open" ? 6 : 0;

  scores.profile_conversion += params.execution.ctaIntensity === "high" ? 22 : 0;
  scores.profile_conversion +=
    params.execution.ctaIntensity === "moderate" ? 12 : 0;
  scores.profile_conversion +=
    params.execution.mentionDependence === "high"
      ? 14
      : params.execution.mentionDependence === "moderate"
        ? 8
        : 0;
  scores.profile_conversion +=
    params.execution.linkDependence === "high"
      ? 12
      : params.execution.linkDependence === "moderate"
        ? 6
        : 0;

  scores.authority_building +=
    params.voice.averageLengthBand === "long"
      ? 20
      : params.voice.averageLengthBand === "medium"
        ? 12
        : 0;
  scores.authority_building +=
    params.voice.dominantHookPattern === "how_to_open" ||
    params.voice.dominantHookPattern === "numeric_open" ||
    params.voice.dominantHookPattern === "statement_open"
      ? 12
      : 0;
  scores.authority_building += params.execution.linkDependence === "low" ? 8 : 0;
  scores.authority_building +=
    params.quoteProfile.isReliable &&
    (params.quoteProfile.quoteEngagementDeltaVsOriginalPercent ?? -100) >= 0
      ? 8
      : 0;
  scores.authority_building += params.audienceBreadth === "narrow" ? 6 : 0;

  const ranked = Object.entries(scores)
    .map(([loop, score]) => ({
      loop: loop as DistributionLoopType,
      score: Number(score.toFixed(2)),
    }))
    .sort((left, right) => right.score - left.score);

  const primaryLoop = ranked[0]?.loop ?? "standalone_discovery";
  const secondaryLoop =
    ranked[1] && ranked[1].score >= ranked[0].score * 0.72 ? ranked[1].loop : null;
  const totalScore = ranked.reduce((sum, item) => sum + item.score, 0);
  const confidence = Number(
    Math.max(
      35,
      Math.min(
        100,
        (((ranked[0]?.score ?? 0) / Math.max(1, totalScore)) * 70 +
          (((ranked[0]?.score ?? 0) - (ranked[1]?.score ?? 0)) /
            Math.max(1, ranked[0]?.score ?? 1)) *
            30),
      ),
    ).toFixed(2),
  );

  const signals: string[] = [];

  if (primaryLoop === "reply_driven") {
    signals.push("Reply behavior is strong enough to act as a primary distribution wedge.");
    if (params.replyProfile.isReliable) {
      signals.push(
        `Reply lane is reliable at ${params.replyProfile.signalConfidence}% confidence.`,
      );
    }
  }

  if (primaryLoop === "standalone_discovery") {
    signals.push("The account already has a workable standalone discovery base.");
    if (params.execution.linkDependence === "low") {
      signals.push("Low link dependence keeps more posts natively legible in-feed.");
    }
  }

  if (primaryLoop === "quote_commentary") {
    signals.push("Quote posts are a meaningful commentary/distribution lane.");
    if (params.quoteProfile.isReliable) {
      signals.push(
        `Quote lane is reliable at ${params.quoteProfile.signalConfidence}% confidence.`,
      );
    }
  }

  if (primaryLoop === "profile_conversion") {
    signals.push("The current posting mix is conversion-oriented rather than purely discovery-oriented.");
    if (params.execution.ctaIntensity !== "low") {
      signals.push("CTA usage is high enough to treat profile conversion as a real loop.");
    }
  }

  if (primaryLoop === "authority_building") {
    signals.push("The current style supports authority-building through stronger standalone takes.");
    if (params.voice.averageLengthBand) {
      signals.push(`Average post length skews ${params.voice.averageLengthBand}.`);
    }
  }

  const rationaleMap: Record<DistributionLoopType, string> = {
    reply_driven:
      "The fastest current growth lever is structured conversation: prompt replies, then actively engage the best responses.",
    standalone_discovery:
      "The strongest growth path is broad in-feed discovery through native standalone posts that travel without extra context.",
    quote_commentary:
      "The account is well-positioned to grow by attaching sharper commentary to existing conversations, then converting the best takes into originals.",
    profile_conversion:
      "The current mix looks more conversion-oriented, so growth should come from stronger profile and offer clarity after attention is captured.",
    authority_building:
      "The best current loop is earned authority: structured, clear point-of-view posts that invite discussion from peers.",
  };

  if (secondaryLoop) {
    signals.push(`Secondary loop: ${secondaryLoop.replace(/_/g, " ")}.`);
  }

  return {
    primaryLoop,
    secondaryLoop,
    confidence,
    signals: signals.slice(0, 4),
    rationale: rationaleMap[primaryLoop],
  };
}

function buildInteractionSignalConfidence(params: {
  laneCount: number;
  activityShare: number;
  hasOriginalBaseline: boolean;
}): { confidence: number; isReliable: boolean } {
  if (params.laneCount <= 0 || !params.hasOriginalBaseline) {
    return {
      confidence: 0,
      isReliable: false,
    };
  }

  const countScore = Math.min(1, params.laneCount / 8);
  const shareScore = Math.min(1, params.activityShare / 25);
  const confidence = Number(
    Math.max(20, Math.min(100, 15 + countScore * 55 + shareScore * 30)).toFixed(2),
  );

  return {
    confidence,
    isReliable: params.laneCount >= 5 && params.activityShare >= 8,
  };
}

function classifyReplyStyle(post: XPublicPost): ReplyStyle {
  const features = analyzePostFeatures(post);
  const lower = post.text.toLowerCase();

  if (features.hasQuestion) {
    return "question";
  }

  if (
    /\b(agree|exactly|true|same|facts|100%|well said|love this|congrats|this)\b/.test(
      lower,
    ) &&
    features.wordCount <= 24
  ) {
    return "agreement";
  }

  if (features.wordCount <= 10 && features.lineCount <= 1) {
    return "one_liner";
  }

  return "insight_add_on";
}

function detectReplyTone(post: XPublicPost): ReplyTone {
  const features = analyzePostFeatures(post);
  const lower = post.text.toLowerCase();

  if (features.hasQuestion) {
    return "inquisitive";
  }

  if (
    /\b(lol|lmao|haha|😭|😂|🤣|💀|lmfao)\b/.test(lower) ||
    /[!?]{2,}/.test(post.text)
  ) {
    return "playful";
  }

  if (
    /\b(agree|exactly|true|same|facts|congrats|love this|well said|proud|happy for you)\b/.test(
      lower,
    )
  ) {
    return "supportive";
  }

  if (
    features.wordCount >= 16 ||
    /\bbecause|but|however|the point is|the reason|this works\b/.test(lower)
  ) {
    return "insightful";
  }

  return "direct";
}

function buildReplyProfile(params: {
  originalPosts: XPublicPost[];
  replyPosts: XPublicPost[];
  quotePosts: XPublicPost[];
}): CreatorReplyProfile {
  const { originalPosts, replyPosts, quotePosts } = params;
  const totalCapturedActivity =
    originalPosts.length + replyPosts.length + quotePosts.length;
  const originalBaselineEngagement = average(
    originalPosts.map((post) => computePostEngagement(post)),
  );

  if (replyPosts.length === 0) {
    return {
      replyCount: 0,
      replyShareOfCapturedActivity: 0,
      signalConfidence: 0,
      isReliable: false,
      averageReplyEngagement: 0,
      replyEngagementDeltaVsOriginalPercent: null,
      averageReplyLengthBand: null,
      dominantReplyTone: null,
      dominantReplyStyle: null,
      replyStyleMix: [],
      replyUsageNote:
        originalPosts.length === 0
          ? "There is not enough captured activity yet to estimate reply behavior."
          : "No direct replies were captured in the current sample, so reply strategy is still unknown.",
    };
  }

  const toneCounts = new Map<ReplyTone, number>();
  const styleCounts = new Map<ReplyStyle, number>();

  for (const post of replyPosts) {
    const tone = detectReplyTone(post);
    const style = classifyReplyStyle(post);
    toneCounts.set(tone, (toneCounts.get(tone) ?? 0) + 1);
    styleCounts.set(style, (styleCounts.get(style) ?? 0) + 1);
  }

  const dominantReplyTone =
    Array.from(toneCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const dominantReplyStyle =
    Array.from(styleCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const replyStyleMix: ReplyStyleMixItem[] = Array.from(styleCounts.entries())
    .map(([style, count]) => ({
      style,
      count,
      percentage: toPercent(count / replyPosts.length),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  const replyShareOfCapturedActivity =
    totalCapturedActivity > 0 ? toPercent(replyPosts.length / totalCapturedActivity) : 0;
  const replySignal = buildInteractionSignalConfidence({
    laneCount: replyPosts.length,
    activityShare: replyShareOfCapturedActivity,
    hasOriginalBaseline: originalPosts.length > 0,
  });
  const averageReplyLengthBand = inferAverageLengthBand(replyPosts);
  const averageReplyEngagement = Number(
    average(replyPosts.map((post) => computePostEngagement(post))).toFixed(2),
  );
  const replyEngagementDeltaVsOriginalPercent =
    originalPosts.length > 0
      ? toDeltaVsBaselinePercent(averageReplyEngagement, originalBaselineEngagement)
      : null;

  let replyUsageNote = "Replies are present, but not yet a dominant part of the current captured activity.";
  if (replyShareOfCapturedActivity >= 50) {
    replyUsageNote =
      "Replies are a primary distribution habit in the current sample. That is useful for relationship-building, but the main posting lane still needs its own strategy.";
  } else if (replyShareOfCapturedActivity >= 20) {
    replyUsageNote =
      "Replies are a meaningful secondary lane in the current sample. This can become a deliberate growth lever without replacing standalone posting.";
  }

  if (dominantReplyTone === "playful") {
    replyUsageNote += " The dominant reply tone leans playful, which can help social reach when the context is a fit.";
  } else if (dominantReplyTone === "insightful") {
    replyUsageNote += " The dominant reply tone adds analysis, which is a stronger base for authority-building replies.";
  }

  if (replySignal.isReliable && replyEngagementDeltaVsOriginalPercent !== null) {
    if (replyEngagementDeltaVsOriginalPercent >= 20) {
      replyUsageNote += " In the current sample, replies outperform your original-post baseline.";
    } else if (replyEngagementDeltaVsOriginalPercent <= -20) {
      replyUsageNote += " In the current sample, replies underperform your original-post baseline.";
    }
  } else if (!replySignal.isReliable) {
    replyUsageNote += " The current reply sample is still thin, so reply-specific performance conclusions should stay cautious.";
  }

  return {
    replyCount: replyPosts.length,
    replyShareOfCapturedActivity,
    signalConfidence: replySignal.confidence,
    isReliable: replySignal.isReliable,
    averageReplyEngagement,
    replyEngagementDeltaVsOriginalPercent,
    averageReplyLengthBand,
    dominantReplyTone,
    dominantReplyStyle,
    replyStyleMix,
    replyUsageNote,
  };
}

function buildQuoteProfile(params: {
  originalPosts: XPublicPost[];
  replyPosts: XPublicPost[];
  quotePosts: XPublicPost[];
}): CreatorQuoteProfile {
  const { originalPosts, replyPosts, quotePosts } = params;
  const totalCapturedActivity =
    originalPosts.length + replyPosts.length + quotePosts.length;
  const originalBaselineEngagement = average(
    originalPosts.map((post) => computePostEngagement(post)),
  );

  if (quotePosts.length === 0) {
    return {
      quoteCount: 0,
      quoteShareOfCapturedActivity: 0,
      signalConfidence: 0,
      isReliable: false,
      averageQuoteEngagement: 0,
      quoteEngagementDeltaVsOriginalPercent: null,
      averageQuoteLengthBand: null,
      dominantQuotePattern: null,
      quoteUsageNote:
        totalCapturedActivity === 0
          ? "There is not enough captured activity yet to estimate quote behavior."
          : "No quote posts were captured in the current sample, so quote-driven distribution is currently not a visible habit.",
    };
  }

  const quoteShareOfCapturedActivity =
    totalCapturedActivity > 0 ? toPercent(quotePosts.length / totalCapturedActivity) : 0;
  const quoteSignal = buildInteractionSignalConfidence({
    laneCount: quotePosts.length,
    activityShare: quoteShareOfCapturedActivity,
    hasOriginalBaseline: originalPosts.length > 0,
  });
  const averageQuoteLengthBand = inferAverageLengthBand(quotePosts);
  const dominantQuotePattern = extractDominantHookPattern(quotePosts);
  const averageQuoteEngagement = Number(
    average(quotePosts.map((post) => computePostEngagement(post))).toFixed(2),
  );
  const quoteEngagementDeltaVsOriginalPercent =
    originalPosts.length > 0
      ? toDeltaVsBaselinePercent(averageQuoteEngagement, originalBaselineEngagement)
      : null;

  let quoteUsageNote =
    "Quote posts are present as a secondary lane. They can add commentary leverage without replacing original posting.";
  if (quoteShareOfCapturedActivity >= 30) {
    quoteUsageNote =
      "Quote posts are a meaningful part of the current activity mix. The system should treat them as a distribution and positioning lane, not as the main standalone-post lane.";
  } else if (quoteShareOfCapturedActivity >= 10) {
    quoteUsageNote =
      "Quote posts appear often enough to matter. Reuse the strongest quote angles as standalone takes when the underlying idea can travel on its own.";
  }

  if (quoteSignal.isReliable && quoteEngagementDeltaVsOriginalPercent !== null) {
    if (quoteEngagementDeltaVsOriginalPercent >= 20) {
      quoteUsageNote += " In the current sample, quote posts outperform your original-post baseline.";
    } else if (quoteEngagementDeltaVsOriginalPercent <= -20) {
      quoteUsageNote += " In the current sample, quote posts underperform your original-post baseline.";
    }
  } else if (!quoteSignal.isReliable) {
    quoteUsageNote += " The current quote sample is still thin, so quote-specific performance conclusions should stay cautious.";
  }

  return {
    quoteCount: quotePosts.length,
    quoteShareOfCapturedActivity,
    signalConfidence: quoteSignal.confidence,
    isReliable: quoteSignal.isReliable,
    averageQuoteEngagement,
    quoteEngagementDeltaVsOriginalPercent,
    averageQuoteLengthBand,
    dominantQuotePattern,
    quoteUsageNote,
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

function buildRecommendedAngles(
  goal: UserGoal,
  archetype: CreatorArchetype,
  execution: CreatorExecutionProfile,
  distribution: CreatorDistributionLoopProfile,
  replyProfile: CreatorReplyProfile,
  quoteProfile: CreatorQuoteProfile,
  growthStage: OnboardingResult["growthStage"],
  transformationMode: OnboardingResult["strategyState"]["transformationMode"],
): string[] {
  const angles: string[] = [];

  if (transformationMode === "preserve") {
    angles.push("Preserve the current lane and focus on cleaner execution, not a content identity reset.");
  }

  if (transformationMode === "pivot_soft") {
    angles.push("Introduce adjacent themes gradually so the audience can follow the repositioning.");
  }

  if (transformationMode === "pivot_hard") {
    angles.push("Bias toward clearer new positioning even if short-term engagement becomes less stable.");
  }

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

  if (distribution.primaryLoop === "reply_driven") {
    angles.push(
      "Treat replies as a deliberate distribution loop: add real perspective, then compound the best angles into standalone posts.",
    );
  }

  if (distribution.primaryLoop === "standalone_discovery") {
    angles.push(
      "Use standalone native posts as the main growth surface, then let replies support distribution instead of replacing it.",
    );
  }

  if (distribution.primaryLoop === "quote_commentary") {
    angles.push(
      "Use quote posts to enter live conversations, but rewrite the strongest commentary into standalone posts that travel further.",
    );
  }

  if (distribution.primaryLoop === "profile_conversion") {
    angles.push(
      "Tighten the profile-to-offer path so attention converts after discovery instead of relying on heavier in-post asks.",
    );
  }

  if (distribution.primaryLoop === "authority_building") {
    angles.push(
      "Bias toward stronger standalone takes that earn replies from peers, not just passive agreement.",
    );
  }

  if (execution.linkDependence === "high") {
    angles.push("Reduce pure link dependence by pairing links with stronger native commentary and standalone takes.");
  }

  if (execution.mentionDependence === "high") {
    angles.push("Publish more ideas that stand alone so reach is less dependent on tagged accounts.");
  }

  if (goal !== "authority" && execution.deliveryStyle === "reply_led") {
    angles.push("Shift part of the weekly mix from reply-style posting into standalone discovery posts.");
  }

  if ((goal === "followers" || goal === "leads") && execution.ctaIntensity === "low") {
    angles.push("Use clearer asks when you want replies, clicks, or conversion behavior.");
  }

  if (goal === "followers" && growthStage === "0-1k") {
    if (replyProfile.replyCount === 0 || replyProfile.replyShareOfCapturedActivity < 10) {
      angles.push(
        "Use strategic replies as a second growth lane on niche-relevant posts with existing momentum.",
      );
    } else if (
      replyProfile.isReliable &&
      replyProfile.replyEngagementDeltaVsOriginalPercent !== null &&
      replyProfile.replyEngagementDeltaVsOriginalPercent >= 20
    ) {
      angles.push(
        "Double down on thoughtful replies where you can add a distinct angle, then turn the strongest ones into standalone posts.",
      );
    } else if (replyProfile.replyShareOfCapturedActivity >= 35) {
      angles.push(
        "Keep the reply habit, but turn your strongest reply ideas into standalone posts so distribution compounds beyond one thread.",
      );
    }
  }

  if (
    quoteProfile.isReliable &&
    quoteProfile.quoteEngagementDeltaVsOriginalPercent !== null &&
    quoteProfile.quoteEngagementDeltaVsOriginalPercent >= 20
  ) {
    angles.push(
      "Use quote posts as a commentary wedge when they already outperform, then extract the strongest take into a standalone post.",
    );
  } else if (quoteProfile.quoteShareOfCapturedActivity >= 25) {
    angles.push(
      "Turn the strongest quote-tweet commentary into standalone posts so the idea can travel without the original post.",
    );
  } else if (goal === "followers" && growthStage === "0-1k" && quoteProfile.quoteCount === 0) {
    angles.push(
      "Test a few quote posts on relevant high-context tweets, but keep the commentary strong enough to stand on its own later.",
    );
  }

  if (angles.length === 0) {
    angles.push("Increase consistency around one repeatable content pillar.");
  }

  return angles.slice(0, 4);
}

function buildExecutionStrengths(execution: CreatorExecutionProfile): string[] {
  const strengths: string[] = [];

  if (execution.linkDependence === "low") {
    strengths.push("Current post mix is not overly dependent on links, which helps native feed retention.");
  }

  if (execution.deliveryStyle === "standalone") {
    strengths.push("Most posts already stand alone, which gives the account a better discovery base.");
  }

  return strengths;
}

function buildDistributionStrengths(
  distribution: CreatorDistributionLoopProfile,
): string[] {
  const strengths: string[] = [];

  if (distribution.confidence >= 70) {
    strengths.push(
      `A clear ${distribution.primaryLoop.replace(/_/g, " ")} loop is already visible, which makes the next growth step more operational.`,
    );
  }

  return strengths;
}

function buildPlaybookProfile(params: {
  goal: UserGoal;
  archetype: CreatorArchetype;
  distribution: CreatorDistributionLoopProfile;
  transformationMode: OnboardingResult["strategyState"]["transformationMode"];
  growthStage: OnboardingResult["growthStage"];
  execution: CreatorExecutionProfile;
  replyProfile: CreatorReplyProfile;
  quoteProfile: CreatorQuoteProfile;
}): CreatorPlaybookProfile {
  const archetypeContracts: Record<
    CreatorArchetype,
    {
      contentContract: string;
      toneGuidelines: string[];
      preferredContentTypes: ContentType[];
      preferredHookPatterns: HookPattern[];
      cadence: CreatorPlaybookProfile["cadence"];
    }
  > = {
    builder: {
      contentContract:
        "Ship proof-of-work, decisions, and lessons learned in public so progress becomes the recurring story.",
      toneGuidelines: [
        "Stay candid and readable, even when the topic is technical.",
        "Use concise build updates and concrete tradeoffs instead of vague hype.",
      ],
      preferredContentTypes: ["multi_line", "single_line", "question_post"],
      preferredHookPatterns: ["statement_open", "story_open", "question_open"],
      cadence: {
        posting: "Aim for 1-2 proof-first posts per day or 5-8 per week.",
        replies: "Reserve 10-20 thoughtful replies per day, especially around build or product threads.",
        threadBias: "medium",
      },
    },
    founder_operator: {
      contentContract:
        "Turn operating decisions, customer patterns, and market lessons into repeatable, opinionated takes.",
      toneGuidelines: [
        "Sound decisive and pragmatic, not abstract.",
        "Invite disagreement without sounding hostile.",
      ],
      preferredContentTypes: ["single_line", "multi_line", "list_post"],
      preferredHookPatterns: ["statement_open", "numeric_open", "hot_take_open"],
      cadence: {
        posting: "Aim for 1-3 sharp operator posts per day or 6-10 per week.",
        replies: "Run 2 short reply windows after posting to engage early substantive responses.",
        threadBias: "medium",
      },
    },
    job_seeker: {
      contentContract:
        "Publish useful proof-of-work, career lessons, and hiring-adjacent help that makes competence easy to infer.",
      toneGuidelines: [
        "Stay supportive, specific, and non-snarky.",
        "Use concrete examples and clear outcomes instead of generic motivation.",
      ],
      preferredContentTypes: ["list_post", "multi_line", "question_post"],
      preferredHookPatterns: ["numeric_open", "how_to_open", "question_open"],
      cadence: {
        posting: "Aim for 3-5 useful career posts per week with one stronger proof-first post.",
        replies: "Use reply clinics on hiring, recruiting, or role-specific threads a few times per week.",
        threadBias: "medium",
      },
    },
    educator: {
      contentContract:
        "Package repeatable frameworks, lessons, and mini-guides that make the audience feel smarter immediately.",
      toneGuidelines: [
        "Use a generous teacher voice with clear structure.",
        "Favor clarity and frameworks over performative cleverness.",
      ],
      preferredContentTypes: ["list_post", "multi_line", "question_post"],
      preferredHookPatterns: ["how_to_open", "numeric_open", "statement_open"],
      cadence: {
        posting: "Aim for 3-5 framework-heavy posts per week plus 1-2 shorter supporting posts.",
        replies: "Reply quickly to questions in the first hour to deepen conversation.",
        threadBias: "high",
      },
    },
    curator: {
      contentContract:
        "Compress attention by curating what matters, then add enough original synthesis that the audience learns your lens.",
      toneGuidelines: [
        "Lead with clarity and context, then add a measured take.",
        "Avoid dumping links without framing why they matter.",
      ],
      preferredContentTypes: ["link_post", "multi_line", "list_post"],
      preferredHookPatterns: ["statement_open", "numeric_open", "question_open"],
      cadence: {
        posting: "Aim for 1 digest-style post per day or 4-7 per week.",
        replies: "Use replies to extend context and collect what you missed.",
        threadBias: "medium",
      },
    },
    social_operator: {
      contentContract:
        "Host conversations with prompts, challenges, and high-reply posts that make participation feel easy.",
      toneGuidelines: [
        "Stay warm, playful, and high-energy without becoming noisy.",
        "Write to invite participation, not just passive reactions.",
      ],
      preferredContentTypes: ["question_post", "single_line", "multi_line"],
      preferredHookPatterns: ["question_open", "hot_take_open", "statement_open"],
      cadence: {
        posting: "Aim for 2-4 prompt-led posts per week plus steady short-form conversation starters.",
        replies: "Keep a daily reply habit so conversations keep compounding.",
        threadBias: "low",
      },
    },
    hybrid: {
      contentContract:
        "Use the clearest current strengths as a base, then simplify into one repeatable lane at a time.",
      toneGuidelines: [
        "Stay consistent across posts so the audience can quickly learn what to expect.",
        "Prefer simpler, clearer formats until the strongest lane is obvious.",
      ],
      preferredContentTypes: ["multi_line", "single_line", "question_post"],
      preferredHookPatterns: ["statement_open", "question_open", "story_open"],
      cadence: {
        posting: "Aim for 4-6 posts per week in one repeatable structure before broadening.",
        replies: "Use a steady reply habit, but keep the main focus on clarifying the top-level lane.",
        threadBias: "medium",
      },
    },
  };

  const base = archetypeContracts[params.archetype];
  const toneGuidelines = [...base.toneGuidelines];
  const experimentFocus = [
    `Test 2-3 variations of the strongest ${params.distribution.primaryLoop.replace(/_/g, " ")} loop.`,
  ];

  if (params.transformationMode === "preserve") {
    toneGuidelines.push("Keep the existing audience expectation stable; optimize execution, not identity.");
  } else if (params.transformationMode === "pivot_soft") {
    toneGuidelines.push("Introduce adjacent positioning gradually so the audience can follow the shift.");
  } else if (params.transformationMode === "pivot_hard") {
    toneGuidelines.push("Favor clarity over comfort so the new positioning is unmistakable.");
  }

  if (params.distribution.primaryLoop === "reply_driven") {
    toneGuidelines.push("Use posts and replies that invite follow-up, not just passive agreement.");
    experimentFocus.push(
      "Track which reply patterns turn into the strongest standalone follow-up posts.",
    );
  }

  if (params.distribution.primaryLoop === "standalone_discovery") {
    toneGuidelines.push("Favor native standalone posts that make sense without prior context.");
    experimentFocus.push("A/B test first lines while keeping the body constant.");
  }

  if (params.distribution.primaryLoop === "quote_commentary") {
    toneGuidelines.push("Use quoted context as a wedge, but make the commentary clear enough to stand on its own.");
    experimentFocus.push("Rewrite the best quote take as a standalone post within 24 hours.");
  }

  if (params.distribution.primaryLoop === "profile_conversion") {
    toneGuidelines.push("Use cleaner calls-to-action so attention flows into a clear next step.");
    experimentFocus.push("Test one soft conversion CTA versus one reply-first CTA this week.");
  }

  if (params.distribution.primaryLoop === "authority_building") {
    toneGuidelines.push("Publish stronger point-of-view and proof-backed posts that invite thoughtful replies.");
    experimentFocus.push("Test one more opinionated take versus one neutral explainer on the same theme.");
  }

  if (
    params.goal === "followers" &&
    params.growthStage === "0-1k" &&
    (params.replyProfile.replyCount === 0 || params.replyProfile.replyShareOfCapturedActivity < 10)
  ) {
    experimentFocus.push("Add a deliberate reply block each day to create a second discovery lane.");
  }

  if (
    params.quoteProfile.isReliable &&
    (params.quoteProfile.quoteEngagementDeltaVsOriginalPercent ?? -100) >= 0
  ) {
    experimentFocus.push("Promote one high-performing quote angle into a top-level post every week.");
  }

  const ctaPolicy =
    params.goal === "followers"
      ? "Use one clear reply-first CTA at a time. Prefer questions, prompts, or lightweight participation asks over hard asks."
      : params.goal === "leads"
        ? "Use one clear proof-linked CTA. Tie the ask to a specific outcome, and avoid stacking multiple asks in one post."
        : "Use CTAs to invite substantive responses, examples, or counterarguments. Avoid generic 'thoughts?' asks.";

  const conversationTactic =
    params.distribution.primaryLoop === "reply_driven"
      ? "Prioritize posts that earn replies, then actively answer the strongest replies so the conversation compounds."
      : params.distribution.primaryLoop === "standalone_discovery"
        ? "Lead with one clear top-level idea, then use replies to extend the idea instead of introducing it."
        : params.distribution.primaryLoop === "quote_commentary"
          ? "Use live conversations as entry points, then restate the best thesis in your own standalone framing."
          : params.distribution.primaryLoop === "profile_conversion"
            ? "Use the post to earn attention, then make the profile and next step do the conversion work."
            : "Use stronger point-of-view posts to attract thoughtful peers, then deepen the thread with follow-up replies.";

  return {
    contentContract: base.contentContract,
    toneGuidelines: toneGuidelines.slice(0, 4),
    preferredContentTypes: base.preferredContentTypes,
    preferredHookPatterns: base.preferredHookPatterns,
    ctaPolicy,
    cadence: base.cadence,
    conversationTactic,
    experimentFocus: experimentFocus.slice(0, 4),
  };
}

function buildInteractionStrengths(params: {
  replyProfile: CreatorReplyProfile;
  quoteProfile: CreatorQuoteProfile;
}): string[] {
  const strengths: string[] = [];

  if (
    params.replyProfile.isReliable &&
    params.replyProfile.replyEngagementDeltaVsOriginalPercent !== null &&
    params.replyProfile.replyEngagementDeltaVsOriginalPercent >= 20
  ) {
    strengths.push(
      "Replies are outperforming the original-post baseline, so conversation is already a real distribution lever here.",
    );
  }

  if (
    params.quoteProfile.isReliable &&
    params.quoteProfile.quoteEngagementDeltaVsOriginalPercent !== null &&
    params.quoteProfile.quoteEngagementDeltaVsOriginalPercent >= 20
  ) {
    strengths.push(
      "Quote posts are outperforming the original-post baseline, so commentary on existing momentum is working.",
    );
  }

  return strengths;
}

function buildExecutionWeaknesses(
  execution: CreatorExecutionProfile,
  goal: UserGoal,
): string[] {
  const weaknesses: string[] = [];

  if (execution.linkDependence === "high") {
    weaknesses.push("A high link-dependent mix can suppress native hold if the commentary layer is too thin.");
  }

  if (execution.mentionDependence === "high") {
    weaknesses.push("Mention-heavy posting can make reach too dependent on existing network adjacency.");
  }

  if (goal === "followers" && execution.deliveryStyle === "reply_led") {
    weaknesses.push("Reply-led posting supports relationships, but broad follower growth needs more standalone posts.");
  }

  return weaknesses;
}

function buildInteractionWeaknesses(params: {
  replyProfile: CreatorReplyProfile;
  quoteProfile: CreatorQuoteProfile;
  goal: UserGoal;
  growthStage: OnboardingResult["growthStage"];
}): string[] {
  const weaknesses: string[] = [];

  if (
    params.goal === "followers" &&
    params.growthStage === "0-1k" &&
    params.replyProfile.isReliable &&
    params.replyProfile.replyCount > 0 &&
    params.replyProfile.replyEngagementDeltaVsOriginalPercent !== null &&
    params.replyProfile.replyEngagementDeltaVsOriginalPercent <= -20
  ) {
    weaknesses.push(
      "Replies are underperforming the original-post baseline, so the conversation lane may need better targets or stronger substance.",
    );
  }

  if (
    params.quoteProfile.isReliable &&
    params.quoteProfile.quoteCount > 0 &&
    params.quoteProfile.quoteEngagementDeltaVsOriginalPercent !== null &&
    params.quoteProfile.quoteEngagementDeltaVsOriginalPercent <= -20
  ) {
    weaknesses.push(
      "Quote posts are underperforming the original-post baseline, so the commentary may be leaning too hard on the source post's context.",
    );
  }

  return weaknesses;
}

function buildExecutionNextMoves(
  execution: CreatorExecutionProfile,
  distribution: CreatorDistributionLoopProfile,
  replyProfile: CreatorReplyProfile,
  quoteProfile: CreatorQuoteProfile,
  goal: UserGoal,
  growthStage: OnboardingResult["growthStage"],
  transformationMode: OnboardingResult["strategyState"]["transformationMode"],
): string[] {
  const actions: string[] = [];

  if (transformationMode === "preserve") {
    actions.push("Keep the existing topic lane stable and test only execution-level improvements this week.");
  }

  if (transformationMode === "pivot_soft") {
    actions.push("Add one adjacent-topic post this week while keeping the rest of the batch familiar.");
  }

  if (transformationMode === "pivot_hard") {
    actions.push("Publish one post this week that clearly signals the new intended positioning.");
  }

  if (execution.linkDependence === "high") {
    actions.push("Replace at least one link-led post this week with a native-text post that carries the same idea.");
  }

  if (execution.mentionDependence === "high") {
    actions.push("Test one post this week that does not rely on tagging anyone for context or distribution.");
  }

  if (goal === "followers" && execution.deliveryStyle === "reply_led") {
    actions.push("Shift one reply-style post into a standalone top-level post built for discovery.");
  }

  if ((goal === "followers" || goal === "leads") && execution.ctaIntensity === "low") {
    actions.push("Add one explicit call-to-action in the next batch to test higher response behavior.");
  }

  if (goal === "followers" && growthStage === "0-1k") {
    if (replyProfile.replyCount === 0 || replyProfile.replyShareOfCapturedActivity < 10) {
      actions.push(
        "Test 3-5 thoughtful replies this week on niche-adjacent posts that already have attention.",
      );
    } else if (
      replyProfile.isReliable &&
      replyProfile.replyEngagementDeltaVsOriginalPercent !== null &&
      replyProfile.replyEngagementDeltaVsOriginalPercent >= 20
    ) {
      actions.push(
        "Convert one high-performing reply this week into a standalone post while keeping the core angle intact.",
      );
    } else if (replyProfile.replyShareOfCapturedActivity >= 35) {
      actions.push(
        "Reuse one strong reply from this week as the seed for a standalone post built for discovery.",
      );
    }
  }

  if (
    quoteProfile.isReliable &&
    quoteProfile.quoteEngagementDeltaVsOriginalPercent !== null &&
    quoteProfile.quoteEngagementDeltaVsOriginalPercent >= 20
  ) {
    actions.push(
      "Take one high-performing quote post and publish the same thesis as a standalone post this week.",
    );
  } else if (quoteProfile.quoteShareOfCapturedActivity >= 25) {
    actions.push(
      "Pick one recent quote post and rewrite its core take as a standalone post this week.",
    );
  } else if (goal === "followers" && growthStage === "0-1k" && quoteProfile.quoteCount === 0) {
    actions.push(
      "Test 1-2 quote posts this week on niche-relevant tweets where your commentary adds a clear angle.",
    );
  }

  if (distribution.primaryLoop === "reply_driven") {
    actions.push(
      "Block one focused reply session this week, then convert the strongest reply angle into a top-level post within 24 hours.",
    );
  }

  if (distribution.primaryLoop === "standalone_discovery") {
    actions.push(
      "Publish one extra standalone native post this week that can travel without prior context or links.",
    );
  }

  if (distribution.primaryLoop === "quote_commentary") {
    actions.push(
      "Take one recent quote-tweet idea and rewrite it as a standalone opinion post this week.",
    );
  }

  if (distribution.primaryLoop === "profile_conversion") {
    actions.push(
      "Audit your next post-to-profile path this week so the profile explains the offer clearly after the click.",
    );
  }

  if (distribution.primaryLoop === "authority_building") {
    actions.push(
      "Publish one clear point-of-view post this week that asks for a considered response, not just agreement.",
    );
  }

  return actions;
}

function buildTargetState(params: {
  goal: UserGoal;
  archetype: CreatorArchetype;
  audienceBreadth: AudienceBreadth;
  transformationMode: OnboardingResult["strategyState"]["transformationMode"];
}): {
  targetPrimaryArchetype: CreatorArchetype;
  targetAudienceBreadth: AudienceBreadth | "same";
  planningNote: string;
} {
  const baseNote =
    params.transformationMode === "preserve"
      ? "The user chose preserve mode, so the system should protect the current lane and avoid disruptive shifts."
      : params.transformationMode === "pivot_soft"
        ? "The user chose a soft pivot, so the system should move into adjacent territory without breaking existing audience trust."
        : params.transformationMode === "pivot_hard"
          ? "The user chose a hard pivot, so the system can accept short-term reach volatility in exchange for a clearer new direction."
          : "The user chose optimize mode, so the system should refine what already works before pushing bigger repositioning moves.";

  if (
    params.transformationMode !== "preserve" &&
    params.goal === "followers" &&
    params.audienceBreadth === "narrow"
  ) {
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

function buildStrategyRationale(
  goal: UserGoal,
  archetype: CreatorArchetype,
  distribution: CreatorDistributionLoopProfile,
  transformationMode: OnboardingResult["strategyState"]["transformationMode"],
): string {
  if (transformationMode === "preserve") {
    return `Protect the current ${archetype} lane and improve execution without disrupting audience expectations. Keep the ${distribution.primaryLoop.replace(/_/g, " ")} loop intact while tightening it.`;
  }

  if (transformationMode === "pivot_soft") {
    return `Use the current ${archetype} base as cover for a gradual repositioning into adjacent territory while repointing the ${distribution.primaryLoop.replace(/_/g, " ")} loop.`;
  }

  if (transformationMode === "pivot_hard") {
    return `Treat the current ${archetype} pattern as a starting point, but accept near-term volatility while rebuilding the ${distribution.primaryLoop.replace(/_/g, " ")} loop around a clearer new position.`;
  }

  if (goal === "followers") {
    return `Optimize for discovery first. ${archetype} accounts grow faster when they package repeatable patterns into clearer hooks and reinforce the ${distribution.primaryLoop.replace(/_/g, " ")} loop.`;
  }

  if (goal === "leads") {
    return `Shift from pure visibility to trust plus specificity. ${archetype} accounts need clear proof, audience pain alignment, and a tighter ${distribution.primaryLoop.replace(/_/g, " ")} path to conversion.`;
  }

  return `Authority compounds when voice, proof, and consistency line up. The current ${archetype} pattern should become more opinionated and structured while strengthening the ${distribution.primaryLoop.replace(/_/g, " ")} loop.`;
}

function buildStrategyDelta(params: {
  goal: UserGoal;
  growthStage: OnboardingResult["growthStage"];
  transformationMode: OnboardingResult["strategyState"]["transformationMode"];
  archetype: CreatorArchetype;
  audienceBreadth: AudienceBreadth;
  dominantTopics: TopicSignal[];
  execution: CreatorExecutionProfile;
  replyProfile: CreatorReplyProfile;
  quoteProfile: CreatorQuoteProfile;
}): CreatorStrategyProfile["delta"] {
  const preserveTraits: string[] = [`Keep the core ${params.archetype} identity recognizable.`];
  const shiftTraits: string[] = [];
  const adjustments: CreatorStrategyProfile["delta"]["adjustments"] = [];
  const topTopic = params.dominantTopics[0] ?? null;

  if (params.transformationMode === "preserve") {
    preserveTraits.push("Protect the current audience lane and bias toward execution improvements.");
  } else if (params.transformationMode === "pivot_soft") {
    shiftTraits.push("Introduce adjacent topics without breaking the audience's mental model.");
  } else if (params.transformationMode === "pivot_hard") {
    shiftTraits.push("Use clearer position shifts even if short-term reach becomes less stable.");
  } else {
    preserveTraits.push("Refine what already works before making bigger positioning changes.");
  }

  if (params.execution.linkDependence === "high") {
    adjustments.push({
      area: "link_dependence",
      direction: "decrease",
      priority: "high",
      note: "The current mix is too link-dependent. The fastest gain is turning the same ideas into stronger native-text posts.",
    });
  }

  if (params.execution.mentionDependence === "high") {
    adjustments.push({
      area: "mention_dependence",
      direction: "decrease",
      priority: "medium",
      note: "Distribution is leaning too heavily on tagged accounts. Increase standalone context so posts travel on their own.",
    });
  }

  if (params.goal === "followers" && params.execution.deliveryStyle === "reply_led") {
    adjustments.push({
      area: "standalone_posts",
      direction: "increase",
      priority: "high",
      note: "The account is too reply-led for broad follower growth. More top-level standalone posts are needed for discovery.",
    });
  }

  if (
    params.goal === "followers" &&
    params.growthStage === "0-1k" &&
    (params.replyProfile.replyCount === 0 || params.replyProfile.replyShareOfCapturedActivity < 10)
  ) {
    adjustments.push({
      area: "reply_activity",
      direction: "increase",
      priority: "medium",
      note: "Early-stage growth can use replies as a second distribution lane. The current reply share is too low to exploit that lever.",
    });
  }

  if (
    params.quoteProfile.isReliable &&
    params.quoteProfile.quoteEngagementDeltaVsOriginalPercent !== null &&
    params.quoteProfile.quoteEngagementDeltaVsOriginalPercent >= 20
  ) {
    adjustments.push({
      area: "quote_activity",
      direction: "increase",
      priority: "medium",
      note: "Quote posts are outperforming the original-post baseline, so commentary is a real leverage lane worth expanding.",
    });
  }

  if (
    params.goal === "followers" &&
    params.transformationMode !== "preserve" &&
    params.audienceBreadth === "narrow"
  ) {
    adjustments.push({
      area: "audience_breadth",
      direction: "shift",
      priority: "high",
      note: "The current audience lane is narrow. Broader discovery will require adjacent topics that remain legible outside the current niche.",
    });
  }

  if (
    topTopic &&
    topTopic.specificity === "local_scene" &&
    params.transformationMode !== "preserve"
  ) {
    adjustments.push({
      area: "topic_specificity",
      direction: "shift",
      priority: "medium",
      note: `The current top signal (${topTopic.label}) is highly local. Keep the identity value, but translate more of it into ideas that travel beyond one scene.`,
    });
  }

  if (adjustments.length === 0) {
    adjustments.push({
      area: "standalone_posts",
      direction: "protect",
      priority: "low",
      note: "There is no urgent structural gap. The next win is consistency around the strongest current lane.",
    });
  }

  const primaryGap =
    params.transformationMode === "preserve"
      ? "Protect current positioning while tightening execution."
      : params.transformationMode === "pivot_soft"
        ? "Bridge the current audience into an adjacent lane without losing trust."
        : params.transformationMode === "pivot_hard"
          ? "Replace the current positioning with a clearer new lane while accepting near-term volatility."
          : adjustments.some((item) => item.area === "standalone_posts" && item.priority === "high")
            ? "Increase standalone discovery so the account is less dependent on reactive distribution."
            : adjustments.some((item) => item.area === "audience_breadth" && item.priority === "high")
              ? "Expand beyond the current narrow lane without losing the strongest identity signals."
              : "Turn current strengths into a more repeatable growth system.";

  return {
    primaryGap,
    preserveTraits: preserveTraits.slice(0, 3),
    shiftTraits: shiftTraits.slice(0, 3),
    adjustments: adjustments.slice(0, 5),
  };
}

export function buildCreatorProfile(params: {
  sourceRunId: string;
  onboarding: OnboardingResult;
  performanceModel?: PerformanceModel;
}): CreatorProfile {
  const posts = params.onboarding.recentPosts ?? [];
  const replyPosts = params.onboarding.recentReplyPosts ?? [];
  const quotePosts = params.onboarding.recentQuotePosts ?? [];
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
  const executionProfile = buildExecutionProfile(posts);
  const replyProfile = buildReplyProfile({
    originalPosts: posts,
    replyPosts,
    quotePosts,
  });
  const quoteProfile = buildQuoteProfile({
    originalPosts: posts,
    replyPosts,
    quotePosts,
  });
  const transformationMode =
    params.onboarding.strategyState.transformationMode ?? "optimize";
  const transformationModeSource =
    params.onboarding.strategyState.transformationModeSource ?? "default";
  const targetState = buildTargetState({
    goal: params.onboarding.strategyState.goal,
    archetype,
    audienceBreadth,
    transformationMode,
  });
  const strategyDelta = buildStrategyDelta({
    goal: params.onboarding.strategyState.goal,
    growthStage: params.onboarding.growthStage,
    transformationMode,
    archetype,
    audienceBreadth,
    dominantTopics,
    execution: executionProfile,
    replyProfile,
    quoteProfile,
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
  const distributionProfile = buildDistributionLoopProfile({
    growthStage: params.onboarding.growthStage,
    audienceBreadth,
    voice: {
      averageLengthBand,
      dominantHookPattern,
    },
    execution: executionProfile,
    replyProfile,
    quoteProfile,
  });
  const playbookProfile = buildPlaybookProfile({
    goal: params.onboarding.strategyState.goal,
    archetype,
    distribution: distributionProfile,
    transformationMode,
    growthStage: params.onboarding.growthStage,
    execution: executionProfile,
    replyProfile,
    quoteProfile,
  });
  const representativeExamples = buildRepresentativeExamples({
    posts,
    replyPosts,
    quotePosts,
    baselineEngagement: params.onboarding.baseline.averageEngagement,
    goal: params.onboarding.strategyState.goal,
    dominantContentType,
    dominantHookPattern,
    primaryCasing,
    averageLengthBand,
    strategyDelta,
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
    execution: executionProfile,
    distribution: distributionProfile,
    playbook: playbookProfile,
    reply: replyProfile,
    quote: quoteProfile,
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
      transformationMode,
      transformationModeSource,
      currentState: {
        followerBand: params.onboarding.growthStage,
        primaryArchetype: archetype,
        secondaryArchetype: archetypeProfile.secondary,
        audienceBreadth,
      },
      targetState,
      delta: strategyDelta,
      currentStrengths: [
        ...performanceModel.strengths,
        ...buildExecutionStrengths(executionProfile),
        ...buildDistributionStrengths(distributionProfile),
        ...buildInteractionStrengths({
          replyProfile,
          quoteProfile,
        }),
      ].slice(0, 4),
      currentWeaknesses: [
        ...performanceModel.weaknesses,
        ...buildExecutionWeaknesses(
          executionProfile,
          params.onboarding.strategyState.goal,
        ),
        ...buildInteractionWeaknesses({
          replyProfile,
          quoteProfile,
          goal: params.onboarding.strategyState.goal,
          growthStage: params.onboarding.growthStage,
        }),
      ].slice(0, 4),
      recommendedAngles: buildRecommendedAngles(
        params.onboarding.strategyState.goal,
        archetype,
        executionProfile,
        distributionProfile,
        replyProfile,
        quoteProfile,
        params.onboarding.growthStage,
        transformationMode,
      ),
      nextMoves: [
        ...performanceModel.nextActions,
        ...buildExecutionNextMoves(
          executionProfile,
          distributionProfile,
          replyProfile,
          quoteProfile,
          params.onboarding.strategyState.goal,
          params.onboarding.growthStage,
          transformationMode,
        ),
      ].slice(0, 5),
      rationale: buildStrategyRationale(
        params.onboarding.strategyState.goal,
        archetype,
        distributionProfile,
        transformationMode,
      ),
    },
  };
}
