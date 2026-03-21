import type { StrategyPlan } from "../contracts/chat";
import { sanitizePlanPitchResponse } from "./planPitch.ts";

const MAX_PLAN_LIST_ITEMS = 4;
const MAX_THREAD_PLAN_POSTS = 6;
const MAX_THREAD_PROOF_POINTS = 2;
const LOW_SIGNAL_TRANSITION_HINT_PATTERNS = [
  /^(?:next|then|after that|move on|continue)\b/i,
  /^(?:move|shift|bridge|turn)\s+(?:to|into)\s+(?:the\s+)?(?:next|setup|proof|turn|payoff|close)\b/i,
  /^(?:setup|proof|turn|payoff|close)$/i,
];
const LOW_SIGNAL_PROOF_POINT_PATTERNS = [
  /\bbe specific\b/i,
  /\bmake it specific\b/i,
  /\bkeep it concise\b/i,
  /\bmake it concise\b/i,
  /\bmake it clear\b/i,
  /\bkeep it clear\b/i,
  /\bstrong hook\b/i,
  /\bclear hook\b/i,
  /\bstrong close\b/i,
  /\bclear close\b/i,
  /\bclear cta\b/i,
  /\bstrong cta\b/i,
  /\btransition to next\b/i,
  /\bbridge to next\b/i,
  /\badvance the thread\b/i,
  /\bkeep it grounded\b/i,
  /\bstay grounded\b/i,
  /\bavoid fluff\b/i,
  /\bmake it engaging\b/i,
  /\bkeep it engaging\b/i,
  /\bkeep it punchy\b/i,
  /\bexplain the point\b/i,
];

export interface NormalizedThreadPostPlan {
  role: "hook" | "setup" | "proof" | "turn" | "payoff" | "close";
  objective: string;
  proofPoints: string[];
  transitionHint: string | null;
}

export interface NormalizedThreadPlan extends StrategyPlan {
  posts: NormalizedThreadPostPlan[];
}

interface PlannerOutputLike extends Omit<StrategyPlan, "extractedConstraints"> {
  extractedConstraints?: string[];
  extracted_constraints?: string[];
}

interface RawThreadPostPlan {
  role: "hook" | "setup" | "proof" | "turn" | "payoff" | "close";
  objective: string;
  proofPoints: string[];
  transitionHint: string | null;
}

interface RawThreadPlan extends PlannerOutputLike {
  posts: RawThreadPostPlan[];
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

function isNearDuplicatePlanText(left: string, right: string): boolean {
  const normalizedLeft = normalizePlanText(left).toLowerCase();
  const normalizedRight = normalizePlanText(right).toLowerCase();

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  if (normalizedLeft.length >= 24 && normalizedRight.includes(normalizedLeft)) {
    return true;
  }

  if (normalizedRight.length >= 24 && normalizedLeft.includes(normalizedRight)) {
    return true;
  }

  return false;
}

function isLowSignalProofPoint(value: string, objective: string): boolean {
  const normalizedValue = normalizePlanText(value);
  if (!normalizedValue) {
    return true;
  }

  if (LOW_SIGNAL_PROOF_POINT_PATTERNS.some((pattern) => pattern.test(normalizedValue))) {
    return true;
  }

  return isNearDuplicatePlanText(normalizedValue, objective);
}

function hasConsecutiveDuplicateRoles(posts: NormalizedThreadPostPlan[]): boolean {
  for (let index = 1; index < posts.length; index += 1) {
    if (posts[index]?.role === posts[index - 1]?.role) {
      return true;
    }
  }

  return false;
}

function resolveTargetThreadRoles(length: number): NormalizedThreadPostPlan["role"][] {
  const canonicalRoles: NormalizedThreadPostPlan["role"][] = [
    "hook",
    "setup",
    "proof",
    "turn",
    "payoff",
    "close",
  ];

  switch (length) {
    case 3:
      return ["hook", "proof", "close"];
    case 4:
      return ["hook", "setup", "payoff", "close"];
    case 5:
      return ["hook", "setup", "proof", "payoff", "close"];
    default:
      return canonicalRoles.slice(0, length);
  }
}

function shouldRepairThreadRoles(posts: NormalizedThreadPostPlan[]): boolean {
  if (posts.length < 3) {
    return false;
  }

  const targetRoles = resolveTargetThreadRoles(posts.length);
  const firstRole = posts[0]?.role;
  const lastRole = posts[posts.length - 1]?.role;
  const hasPayoff = posts.some((post) => post.role === "payoff");
  const hasClose = posts.some((post) => post.role === "close");

  return (
    firstRole !== targetRoles[0] ||
    lastRole !== targetRoles[targetRoles.length - 1] ||
    hasConsecutiveDuplicateRoles(posts) ||
    !hasClose ||
    (posts.length >= 4 && !hasPayoff)
  );
}

function buildFallbackObjective(
  role: NormalizedThreadPostPlan["role"],
  proofPoints: string[],
  objective: string,
): string {
  const seed = normalizePlanText(proofPoints[0] || objective);
  if (!seed) {
    return objective;
  }

  switch (role) {
    case "hook":
      return `open on ${seed}`;
    case "setup":
      return `set up ${seed}`;
    case "proof":
      return `show ${seed}`;
    case "turn":
      return `shift into ${seed}`;
    case "payoff":
      return `land ${seed}`;
    case "close":
      return `close on ${seed}`;
    default:
      return seed;
  }
}

function stripLeadingBeatVerb(value: string): string {
  return normalizePlanText(value)
    .replace(/^open(?:\s+on)?\s+/i, "")
    .replace(/^set(?:\s+up)?\s+/i, "")
    .replace(/^show\s+/i, "")
    .replace(/^shift(?:\s+into)?\s+/i, "")
    .replace(/^turn(?:\s+into)?\s+/i, "")
    .replace(/^land\s+/i, "")
    .replace(/^close(?:\s+on)?\s+/i, "")
    .trim();
}

function shortenTransitionSeed(value: string): string {
  return stripLeadingBeatVerb(value)
    .split(/\s+/)
    .slice(0, 8)
    .join(" ");
}

function buildFallbackTransitionHint(nextPost: NormalizedThreadPostPlan): string {
  const seed = shortenTransitionSeed(nextPost.objective || nextPost.proofPoints[0] || "");

  switch (nextPost.role) {
    case "setup":
      return seed ? `set up ${seed}` : "set up the context";
    case "proof":
      return seed ? `show ${seed}` : "show the proof";
    case "turn":
      return seed ? `turn into ${seed}` : "turn the thread";
    case "payoff":
      return seed ? `land ${seed}` : "land the payoff";
    case "close":
      return seed ? `close on ${seed}` : "close the thread cleanly";
    default:
      return seed ? `move into ${seed}` : "move the thread forward";
  }
}

function isLowSignalTransitionHint(value: string | null, nextPost: NormalizedThreadPostPlan | null): boolean {
  const normalizedValue = normalizePlanText(value || "");
  if (!normalizedValue) {
    return true;
  }

  if (LOW_SIGNAL_TRANSITION_HINT_PATTERNS.some((pattern) => pattern.test(normalizedValue))) {
    return true;
  }

  if (nextPost && isNearDuplicatePlanText(normalizedValue, nextPost.role)) {
    return true;
  }

  return false;
}

function normalizeThreadPosts(posts: NormalizedThreadPostPlan[]): NormalizedThreadPostPlan[] {
  const limitedPosts = posts.slice(0, MAX_THREAD_PLAN_POSTS);
  const targetRoles = shouldRepairThreadRoles(limitedPosts)
    ? resolveTargetThreadRoles(limitedPosts.length)
    : limitedPosts.map((post) => post.role);
  const seenProofPoints = new Set<string>();
  const nextPosts = limitedPosts.map((post, index) => {
    const isLastPost = index === limitedPosts.length - 1;
    const role = targetRoles[index] || post.role;
    const normalizedObjective = normalizePlanText(post.objective);
    const proofPoints = normalizePlanList(post.proofPoints, MAX_THREAD_PROOF_POINTS + 2)
      .filter((point) => !isLowSignalProofPoint(point, normalizedObjective))
      .filter((point) => {
        const key = normalizePlanText(point).toLowerCase();
        if (!key || seenProofPoints.has(key)) {
          return false;
        }
        seenProofPoints.add(key);
        return true;
      });
    const previousObjective = index > 0 ? normalizePlanText(limitedPosts[index - 1]?.objective || "") : "";
    const objective =
      !normalizedObjective || isNearDuplicatePlanText(normalizedObjective, previousObjective)
        ? buildFallbackObjective(role, proofPoints, normalizedObjective)
        : normalizedObjective;

    return {
      ...post,
      role,
      objective,
      proofPoints: proofPoints.slice(0, MAX_THREAD_PROOF_POINTS),
      transitionHint: isLastPost ? null : normalizePlanText(post.transitionHint || ""),
    };
  });

  return nextPosts.map((post, index) => {
    if (index === nextPosts.length - 1) {
      return {
        ...post,
        transitionHint: null,
      };
    }

    const nextPost = nextPosts[index + 1] || null;
    return {
      ...post,
      transitionHint: isLowSignalTransitionHint(post.transitionHint, nextPost)
        ? buildFallbackTransitionHint(nextPost!)
        : post.transitionHint,
    };
  });
}

function buildFallbackThreadSeedPool(plan: StrategyPlan): string[] {
  return normalizePlanList([
    plan.angle,
    plan.objective,
    ...plan.mustInclude,
  ], MAX_THREAD_PLAN_POSTS + 2);
}

function buildFallbackThreadPosts(plan: StrategyPlan): NormalizedThreadPostPlan[] {
  const seeds = buildFallbackThreadSeedPool(plan);
  const primarySeed = stripLeadingBeatVerb(seeds[0] || plan.angle || plan.objective || "the real tension");
  const secondarySeed = stripLeadingBeatVerb(seeds[1] || plan.objective || plan.angle || primarySeed);
  const proofSeed = stripLeadingBeatVerb(seeds[2] || plan.mustInclude[0] || secondarySeed || primarySeed);
  const payoffSeed = stripLeadingBeatVerb(seeds[3] || plan.mustInclude[1] || plan.objective || plan.angle || proofSeed);
  const closeSeed = stripLeadingBeatVerb(plan.objective || plan.angle || payoffSeed || proofSeed || primarySeed);
  const shouldUseFiveBeatArc =
    plan.mustInclude.length >= 2 ||
    seeds.length >= 3;

  const posts: NormalizedThreadPostPlan[] = shouldUseFiveBeatArc
    ? [
        {
          role: "hook",
          objective: `open on ${primarySeed || "the real tension"}`,
          proofPoints: [],
          transitionHint: "set up the context",
        },
        {
          role: "setup",
          objective: `set up ${secondarySeed || primarySeed || "the context"}`,
          proofPoints: secondarySeed && secondarySeed !== primarySeed ? [secondarySeed] : [],
          transitionHint: "show the proof",
        },
        {
          role: "proof",
          objective: `show ${proofSeed || secondarySeed || primarySeed || "the proof"}`,
          proofPoints: normalizePlanList(
            [proofSeed, seeds[1], seeds[2]].filter(Boolean) as string[],
            MAX_THREAD_PROOF_POINTS,
          ),
          transitionHint: "land the payoff",
        },
        {
          role: "payoff",
          objective: `land ${payoffSeed || proofSeed || secondarySeed || primarySeed || "the takeaway"}`,
          proofPoints: normalizePlanList(
            [payoffSeed, seeds[3], seeds[4]].filter(Boolean) as string[],
            MAX_THREAD_PROOF_POINTS,
          ),
          transitionHint: "close the thread cleanly",
        },
        {
          role: "close",
          objective: `close on ${closeSeed || payoffSeed || proofSeed || "the takeaway"}`,
          proofPoints: [],
          transitionHint: null,
        },
      ]
    : [
        {
          role: "hook",
          objective: `open on ${primarySeed || "the real tension"}`,
          proofPoints: [],
          transitionHint: "set up the context",
        },
        {
          role: "setup",
          objective: `set up ${secondarySeed || primarySeed || "the context"}`,
          proofPoints: secondarySeed && secondarySeed !== primarySeed ? [secondarySeed] : [],
          transitionHint: "land the payoff",
        },
        {
          role: "payoff",
          objective: `land ${payoffSeed || proofSeed || secondarySeed || primarySeed || "the takeaway"}`,
          proofPoints: normalizePlanList(
            [proofSeed, payoffSeed].filter(Boolean) as string[],
            MAX_THREAD_PROOF_POINTS,
          ),
          transitionHint: "close the thread cleanly",
        },
        {
          role: "close",
          objective: `close on ${closeSeed || payoffSeed || proofSeed || "the takeaway"}`,
          proofPoints: [],
          transitionHint: null,
        },
      ];

  return normalizeThreadPosts(posts);
}

export function normalizePlannerOutput<T extends PlannerOutputLike | RawThreadPlan>(
  plan: T,
): NormalizedPlannerOutput {
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
    extractedConstraints: normalizePlanList(
      plan.extractedConstraints || plan.extracted_constraints || [],
    ),
  };

  if ("posts" in plan && Array.isArray(plan.posts)) {
    return {
      ...(normalizedPlan as NormalizedThreadPlan),
      posts: normalizeThreadPosts(plan.posts),
    };
  }

  return normalizedPlan;
}

export function ensureThreadPlanPosts<T extends StrategyPlan>(
  plan: T,
): T | (T & { posts: NormalizedThreadPostPlan[] }) {
  if (plan.formatPreference !== "thread") {
    return plan;
  }

  if ("posts" in plan && Array.isArray(plan.posts) && plan.posts.length >= 3) {
    return {
      ...plan,
      posts: normalizeThreadPosts(plan.posts as NormalizedThreadPostPlan[]),
    } as T & { posts: NormalizedThreadPostPlan[] };
  }

  return {
    ...plan,
    posts: buildFallbackThreadPosts(plan),
  } as T & { posts: NormalizedThreadPostPlan[] };
}
