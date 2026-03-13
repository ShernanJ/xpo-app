import type { StrategyPlan } from "../contracts/chat";

const LOW_SIGNAL_PITCH_PATTERNS = [
  /^(?:draft(?:ing)?|write|writing)(?:\s+(?:it|that|this))?[.?!]*$/i,
  /^(?:run|go)\s+with\s+(?:this|that)(?:\s+(?:angle|version|direction))?[.?!]*$/i,
  /^(?:looks|sounds)\s+good[.?!]*$/i,
  /^(?:this|that)\s+works[.?!]*$/i,
  /^i(?:'|’)ll\s+(?:draft|write|turn)\b/i,
];

const LEADING_META_PATTERNS: Array<[RegExp, string]> = [
  [/^(?:got it|noted|sounds good|love that|love this|makes sense|fair enough|fair)[,!.:\-]*\s*/i, ""],
  [/^(?:here(?:'|’)s the plan:?|plan:)\s*/i, ""],
  [/^(?:i(?:'|’)m|i am)\s+thinking\s+(?:we\s+)?/i, ""],
  [/^(?:i\s+think\s+we\s+should\s+|we\s+should\s+|let(?:'|’)s\s+)/i, ""],
  [/^(?:the move is(?:\s+to)?\s+|the play is(?:\s+to)?\s+)/i, ""],
];

const TRAILING_META_PATTERNS = [
  /\s+(?:sound good|does that work|work for you|feel right)\?\s*$/i,
  /\s+(?:want me to|should i)\s+(?:draft|write|turn)[^?]*\?\s*$/i,
  /\s*if that works[,]?\s*i(?:'|’)ll\s+(?:draft|write|turn)[^.?!]*[.?!]?\s*$/i,
  /\s*if you want that[,]?\s*i(?:'|’)ll\s+(?:draft|write|turn)[^.?!]*[.?!]?\s*$/i,
];

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function deterministicIndex(seed: string, modulo: number): number {
  if (modulo <= 0) {
    return 0;
  }

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return hash % modulo;
}

function pickDeterministic<T>(options: T[], seed: string): T {
  return options[deterministicIndex(seed, options.length)];
}

function normalizeLine(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.?!,;:]+$/, "");
}

function toLead(value: string): string {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }

  const base = `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
  return /[.?!]$/.test(base) ? base : `${base}.`;
}

export function sanitizePlanPitchResponse(value: string): string {
  let next = normalizeWhitespace(value);
  if (!next) {
    return "";
  }

  let changed = true;
  while (changed && next) {
    changed = false;
    for (const [pattern, replacement] of LEADING_META_PATTERNS) {
      const replaced = next.replace(pattern, replacement).trim();
      if (replaced !== next) {
        next = replaced;
        changed = true;
      }
    }
  }

  for (const pattern of TRAILING_META_PATTERNS) {
    next = next.replace(pattern, "").trim();
  }

  if (!next) {
    return "";
  }

  if (LOW_SIGNAL_PITCH_PATTERNS.some((pattern) => pattern.test(next))) {
    return "";
  }

  return next;
}

export function buildPlanPitch(plan: StrategyPlan): string {
  const seed = [plan.objective, plan.angle, plan.hookType, plan.targetLane]
    .join("|")
    .toLowerCase();
  const lead =
    toLead(sanitizePlanPitchResponse(plan.pitchResponse || "")) ||
    toLead(plan.angle || "") ||
    toLead(plan.objective || "") ||
    pickDeterministic(
      [
        "this direction works best",
        "this is the cleanest angle",
        "i'd run with this angle",
        "this framing is the strongest",
        "this gives you the clearest payoff",
      ].map((entry) => toLead(entry)),
      seed,
    );

  const details = [
    plan.angle ? `- angle: ${normalizeLine(plan.angle)}` : null,
    plan.objective ? `- focus: ${normalizeLine(plan.objective)}` : null,
    plan.hookType ? `- hook: ${normalizeLine(plan.hookType)}` : null,
    plan.mustInclude[0]
      ? `- must include: ${plan.mustInclude.map((value) => normalizeLine(value)).join(" | ")}`
      : null,
    plan.mustAvoid[0]
      ? `- avoid: ${plan.mustAvoid.map((value) => normalizeLine(value)).join(" | ")}`
      : null,
  ].filter((value): value is string => Boolean(value));
  const close = pickDeterministic(
    [
      "if that works, i'll draft it.",
      "if you want that version, i'll write it.",
      "if you're into that angle, i'll turn it into a post.",
    ],
    `${seed}|close`,
  );

  if (details.length === 0) {
    return `${lead}\n\n${close}`;
  }

  return `${lead}\n\n${details.join("\n")}\n\n${close}`;
}
