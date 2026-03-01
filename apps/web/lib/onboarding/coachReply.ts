export interface CoachReplyValidationResult {
  questionCount: number;
  hasExactlyOneQuestionMark: boolean;
  endsWithQuestion: boolean;
  isValid: boolean;
}

const COACH_TAXONOMY_LABELS = new Set([
  "project showcase",
  "technical insight",
  "build in public",
  "operator lessons",
  "social observation",
]);

function normalizeCoachInput(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isThinCoachInput(value: string): boolean {
  const normalized = normalizeCoachInput(value);
  if (!normalized) {
    return true;
  }

  if (COACH_TAXONOMY_LABELS.has(normalized)) {
    return true;
  }

  const words = normalized.split(" ").filter(Boolean);
  return words.length <= 3 || normalized.length < 24;
}

export function validateCoachReplyText(
  value: string,
): CoachReplyValidationResult {
  const questionCount = (value.match(/\?/g) ?? []).length;
  const endsWithQuestion = value.trimEnd().endsWith("?");

  return {
    questionCount,
    hasExactlyOneQuestionMark: questionCount === 1,
    endsWithQuestion,
    isValid: questionCount === 1 && endsWithQuestion,
  };
}
