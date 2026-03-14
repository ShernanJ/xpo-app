import type {
  OnboardingResult,
  PostingCadenceCapacity,
  ReplyBudgetPerDay,
  StrategyState,
  ToneCasing,
  TonePreference,
  ToneRisk,
  TransformationMode,
  TransformationModeSource,
  UserGoal,
} from "../types";

export interface CreatorStrategyOverrides {
  goal?: UserGoal;
  postingCadenceCapacity?: PostingCadenceCapacity;
  replyBudgetPerDay?: ReplyBudgetPerDay;
  transformationMode?: TransformationMode;
}

export interface CreatorToneOverrides {
  casing?: ToneCasing;
  risk?: ToneRisk;
}

const VALID_GOALS = new Set<UserGoal>(["followers", "leads", "authority"]);
const VALID_POSTING_CAPACITY = new Set<PostingCadenceCapacity>([
  "3_per_week",
  "1_per_day",
  "2_per_day",
]);
const VALID_REPLY_BUDGETS = new Set<ReplyBudgetPerDay>(["0_5", "5_15", "15_30"]);
const VALID_TRANSFORMATION_MODES = new Set<TransformationMode>([
  "preserve",
  "optimize",
  "pivot_soft",
  "pivot_hard",
]);
const VALID_TONE_CASING = new Set<ToneCasing>(["lowercase", "normal"]);
const VALID_TONE_RISK = new Set<ToneRisk>(["safe", "bold"]);

function getPostingCapacityMaxPostsPerWeek(
  postingCadenceCapacity: PostingCadenceCapacity,
): number {
  if (postingCadenceCapacity === "3_per_week") {
    return 3;
  }

  if (postingCadenceCapacity === "1_per_day") {
    return 7;
  }

  return 14;
}

function buildOverriddenStrategyState(params: {
  onboarding: OnboardingResult;
  overrides: CreatorStrategyOverrides;
}): StrategyState {
  const base = params.onboarding.strategyState;
  const goal = params.overrides.goal ?? base.goal;
  const postingCadenceCapacity =
    params.overrides.postingCadenceCapacity ?? base.postingCadenceCapacity;
  const replyBudgetPerDay =
    params.overrides.replyBudgetPerDay ?? base.replyBudgetPerDay;
  const transformationMode =
    params.overrides.transformationMode ?? base.transformationMode;
  const transformationModeSource: TransformationModeSource =
    params.overrides.transformationMode ? "user_selected" : base.transformationModeSource;

  const recommendedPostsPerWeek = Math.min(
    base.recommendedPostsPerWeek,
    getPostingCapacityMaxPostsPerWeek(postingCadenceCapacity),
  );
  const transformationRationale =
    transformationMode === "preserve"
      ? "Preserve what already works and improve execution without disrupting audience expectations."
      : transformationMode === "pivot_soft"
        ? "Shift gradually into adjacent positioning while protecting existing audience trust."
        : transformationMode === "pivot_hard"
          ? "Accept short-term volatility while building a clearer new position."
          : null;

  if (params.onboarding.growthStage === "0-1k") {
    const lowReplyCapacity = replyBudgetPerDay === "0_5";
    const highReplyCapacity = replyBudgetPerDay === "15_30";

    return {
      ...base,
      goal,
      postingCadenceCapacity,
      replyBudgetPerDay,
      transformationMode,
      transformationModeSource,
      recommendedPostsPerWeek,
      weights: {
        distribution: lowReplyCapacity ? 0.55 : highReplyCapacity ? 0.7 : 0.65,
        authority: lowReplyCapacity ? 0.4 : highReplyCapacity ? 0.25 : 0.3,
        leverage: 0.05,
      },
      rationale:
        transformationRationale ??
        (lowReplyCapacity
          ? "Prioritize higher-quality standalone distribution because reply capacity is limited."
          : highReplyCapacity
            ? "Prioritize distribution and a structured reply habit to compound early traction loops."
            : "Prioritize distribution and pattern-testing to find repeatable traction loops."),
    };
  }

  if (params.onboarding.growthStage === "1k-10k") {
    return {
      ...base,
      goal,
      postingCadenceCapacity,
      replyBudgetPerDay,
      transformationMode,
      transformationModeSource,
      recommendedPostsPerWeek,
      weights: {
        distribution: 0.35,
        authority: 0.55,
        leverage: 0.1,
      },
      rationale:
        transformationRationale ??
        "Shift weight toward authority-building while maintaining consistent discovery reach.",
    };
  }

  return {
    ...base,
    goal,
    postingCadenceCapacity,
    replyBudgetPerDay,
    transformationMode,
    transformationModeSource,
    recommendedPostsPerWeek,
    weights: {
      distribution: 0.2,
      authority: 0.45,
      leverage: 0.35,
    },
    rationale:
      transformationRationale ??
      "Focus on leverage loops while preserving core authority signals.",
  };
}

export function extractCreatorStrategyOverrides(
  input: Record<string, unknown>,
): CreatorStrategyOverrides {
  const goal = VALID_GOALS.has(input.goal as UserGoal)
    ? (input.goal as UserGoal)
    : undefined;
  const postingCadenceCapacity = VALID_POSTING_CAPACITY.has(
    input.postingCadenceCapacity as PostingCadenceCapacity,
  )
    ? (input.postingCadenceCapacity as PostingCadenceCapacity)
    : undefined;
  const replyBudgetPerDay = VALID_REPLY_BUDGETS.has(
    input.replyBudgetPerDay as ReplyBudgetPerDay,
  )
    ? (input.replyBudgetPerDay as ReplyBudgetPerDay)
    : undefined;
  const transformationMode = VALID_TRANSFORMATION_MODES.has(
    input.transformationMode as TransformationMode,
  )
    ? (input.transformationMode as TransformationMode)
    : undefined;

  return {
    goal,
    postingCadenceCapacity,
    replyBudgetPerDay,
    transformationMode,
  };
}

export function applyCreatorStrategyOverrides(params: {
  onboarding: OnboardingResult;
  overrides: CreatorStrategyOverrides;
}): OnboardingResult {
  const hasOverrides = Boolean(
    params.overrides.goal ||
      params.overrides.postingCadenceCapacity ||
      params.overrides.replyBudgetPerDay ||
      params.overrides.transformationMode,
  );

  if (!hasOverrides) {
    return params.onboarding;
  }

  return {
    ...params.onboarding,
    strategyState: buildOverriddenStrategyState(params),
  };
}

export function extractCreatorToneOverrides(
  input: Record<string, unknown>,
): CreatorToneOverrides {
  const casing = VALID_TONE_CASING.has(input.toneCasing as ToneCasing)
    ? (input.toneCasing as ToneCasing)
    : undefined;
  const risk = VALID_TONE_RISK.has(input.toneRisk as ToneRisk)
    ? (input.toneRisk as ToneRisk)
    : undefined;

  return {
    casing,
    risk,
  };
}

export function applyCreatorToneOverrides(params: {
  baseTone: TonePreference;
  overrides: CreatorToneOverrides;
}): TonePreference {
  return {
    casing: params.overrides.casing ?? params.baseTone.casing,
    risk: params.overrides.risk ?? params.baseTone.risk,
  };
}
