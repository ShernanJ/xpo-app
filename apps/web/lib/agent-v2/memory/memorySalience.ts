import { looksLikeProfileContextLeak } from "../core/profileContextLeak.ts";

const MAX_TOPIC_SUMMARY_LENGTH = 160;
const MAX_REFINEMENT_LENGTH = 180;
const MAX_UNRESOLVED_QUESTION_LENGTH = 180;
const MAX_ROLLING_SUMMARY_LINES = 6;
const MAX_ROLLING_SUMMARY_LINE_LENGTH = 180;
const MAX_LAST_IDEATION_ANGLES = 4;
const MAX_PERSISTED_CONSTRAINTS = 8;
const MAX_HARD_CONSTRAINTS = 4;
const MAX_PREFERENCE_CONSTRAINTS = 3;
const MAX_TRANSIENT_CONSTRAINTS = 2;

export interface MemorySalienceEnvelope {
  constraints: string[];
  lastIdeationAngles: string[];
  rollingSummary: string | null;
  latestRefinementInstruction: string | null;
  unresolvedQuestion: string | null;
}

function normalizeSingleLine(value: string | null | undefined, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }

  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function normalizeRollingSummary(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const lines = value
    .split("\n")
    .map((line) => normalizeSingleLine(line, MAX_ROLLING_SUMMARY_LINE_LENGTH))
    .filter((line): line is string => Boolean(line))
    .slice(0, MAX_ROLLING_SUMMARY_LINES);

  return lines.length > 0 ? lines.join("\n") : null;
}

function normalizeTopicSummary(value: string | null | undefined): string | null {
  const normalized = normalizeSingleLine(value, MAX_TOPIC_SUMMARY_LENGTH);
  if (!normalized) {
    return null;
  }

  return looksLikeProfileContextLeak(normalized) ? null : normalized;
}

function dedupeKeepLatest(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const normalized = normalizeSingleLine(values[index], 220);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(normalized);
  }

  return next.reverse();
}

function isHardConstraint(constraint: string): boolean {
  return (
    constraint.startsWith("Correction lock:") ||
    constraint.startsWith("Topic grounding:") ||
    /do not invent|do not add extra first-person scenes|only use the provided facts|anchored to the saved story/i.test(
      constraint,
    )
  );
}

function isPreferenceConstraint(constraint: string): boolean {
  return /capitalization|lowercase|uppercase|list marker|optimiz|voice|emoji|profanity|never use these words|prefer staying under/i.test(
    constraint,
  );
}

function applyConstraintSalience(constraints: string[]): string[] {
  const normalized = dedupeKeepLatest(constraints);
  const hard = normalized.filter((constraint) => isHardConstraint(constraint)).slice(-MAX_HARD_CONSTRAINTS);
  const preferences = normalized
    .filter((constraint) => !isHardConstraint(constraint) && isPreferenceConstraint(constraint))
    .slice(-MAX_PREFERENCE_CONSTRAINTS);
  const transient = normalized
    .filter((constraint) => !isHardConstraint(constraint) && !isPreferenceConstraint(constraint))
    .slice(-MAX_TRANSIENT_CONSTRAINTS);

  return [...hard, ...preferences, ...transient].slice(-MAX_PERSISTED_CONSTRAINTS);
}

export function applyMemorySaliencePolicy(args: {
  topicSummary: string | null;
  concreteAnswerCount: number;
  envelope: MemorySalienceEnvelope;
}) {
  return {
    topicSummary: normalizeTopicSummary(args.topicSummary),
    concreteAnswerCount:
      Number.isFinite(args.concreteAnswerCount) && args.concreteAnswerCount > 0
        ? Math.min(12, Math.max(0, Math.round(args.concreteAnswerCount)))
        : 0,
    envelope: {
      ...args.envelope,
      constraints: applyConstraintSalience(args.envelope.constraints),
      lastIdeationAngles: dedupeKeepLatest(args.envelope.lastIdeationAngles).slice(
        -MAX_LAST_IDEATION_ANGLES,
      ),
      rollingSummary: normalizeRollingSummary(args.envelope.rollingSummary),
      latestRefinementInstruction: normalizeSingleLine(
        args.envelope.latestRefinementInstruction,
        MAX_REFINEMENT_LENGTH,
      ),
      unresolvedQuestion: normalizeSingleLine(
        args.envelope.unresolvedQuestion,
        MAX_UNRESOLVED_QUESTION_LENGTH,
      ),
    },
  };
}
