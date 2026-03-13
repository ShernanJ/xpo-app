import type { StrategyPlan } from "../contracts/chat";
import { sanitizePlanPitchResponse } from "./planPitch.ts";

const MAX_PLAN_LIST_ITEMS = 4;
const MAX_THREAD_PLAN_POSTS = 6;
const MAX_THREAD_PROOF_POINTS = 2;

export interface NormalizedThreadPostPlan {
  role: "hook" | "setup" | "proof" | "turn" | "payoff" | "close";
  objective: string;
  proofPoints: string[];
  transitionHint: string | null;
}

export interface NormalizedThreadPlan extends StrategyPlan {
  posts: NormalizedThreadPostPlan[];
}

export type NormalizedPlannerOutput = StrategyPlan | NormalizedThreadPlan;

function normalizePlanText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizePlanList(values: string[], maxItems = MAX_PLAN_LIST_ITEMS): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const next = normalizePlanText(value);
    if (!next) {
      continue;
    }

    const key = next.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(next);

    if (normalized.length >= maxItems) {
      break;
    }
  }

  return normalized;
}

function normalizeThreadPosts(posts: NormalizedThreadPostPlan[]): NormalizedThreadPostPlan[] {
  const limitedPosts = posts.slice(0, MAX_THREAD_PLAN_POSTS);

  return limitedPosts.map((post, index) => {
    const isLastPost = index === limitedPosts.length - 1;

    return {
      ...post,
      objective: normalizePlanText(post.objective),
      proofPoints: normalizePlanList(post.proofPoints, MAX_THREAD_PROOF_POINTS),
      transitionHint: isLastPost
        ? null
        : post.transitionHint
          ? normalizePlanText(post.transitionHint)
          : null,
    };
  });
}

export function normalizePlannerOutput<T extends NormalizedPlannerOutput>(plan: T): T {
  const mustInclude = normalizePlanList(plan.mustInclude);
  const mustIncludeKeys = new Set(mustInclude.map((entry) => entry.toLowerCase()));
  const mustAvoid = normalizePlanList(plan.mustAvoid).filter(
    (entry) => !mustIncludeKeys.has(entry.toLowerCase()),
  );

  const normalizedPlan: NormalizedPlannerOutput = {
    ...plan,
    objective: normalizePlanText(plan.objective),
    angle: normalizePlanText(plan.angle),
    mustInclude,
    mustAvoid,
    hookType: normalizePlanText(plan.hookType),
    pitchResponse: sanitizePlanPitchResponse(plan.pitchResponse || ""),
  };

  if ("posts" in plan && Array.isArray(plan.posts)) {
    return {
      ...(normalizedPlan as NormalizedThreadPlan),
      posts: normalizeThreadPosts(plan.posts),
    } as T;
  }

  return normalizedPlan as T;
}
