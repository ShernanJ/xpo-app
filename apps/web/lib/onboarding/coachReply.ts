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

export function isBroadDiscoveryPrompt(value: string): boolean {
  const normalized = normalizeCoachInput(value);
  if (!normalized) {
    return false;
  }

  return (
    /\bwhat (can|should) i (talk|post|write) about\b/.test(normalized) ||
    /\bwhat are (some )?(topics|ideas)\b/.test(normalized) ||
    /\bgive me (some )?(topics|ideas)\b/.test(normalized) ||
    /\bwhat (topics|ideas) can i\b/.test(normalized)
  );
}

export function isBroadDraftRequest(value: string): boolean {
  const normalized = normalizeCoachInput(value);
  if (!normalized) {
    return false;
  }

  return (
    /\b(make|write|draft) (me )?a post\b/.test(normalized) ||
    /\bhelp me write a post\b/.test(normalized) ||
    /\bmake this a post\b/.test(normalized) ||
    /\b(can|could) you just draft me a post\b/.test(normalized) ||
    /\bgive me anything\b/.test(normalized) ||
    /\bjust give me something\b/.test(normalized) ||
    /\bgive me a starting point\b/.test(normalized)
  );
}

export function isCorrectionPrompt(value: string): boolean {
  const normalized = normalizeCoachInput(value);
  if (!normalized) {
    return false;
  }

  return (
    /\b(dont|do not|stop|avoid|remove|drop|change|rephrase|rewrite|softer|nicer)\b/.test(
      normalized,
    ) ||
    /\b(not villainizing|not vilifying|too harsh|too negative|too mean)\b/.test(
      normalized,
    ) ||
    /\b(we dont want that|we do not want that|not like that)\b/.test(normalized)
  );
}

export function isMetaClarifyingPrompt(value: string): boolean {
  const normalized = normalizeCoachInput(value);
  if (!normalized) {
    return false;
  }

  return (
    /\bwhy did you mention\b/.test(normalized) ||
    /\bwhy are you mentioning\b/.test(normalized) ||
    /\bwhy did you bring up\b/.test(normalized) ||
    /\bwhy are you bringing up\b/.test(normalized) ||
    /\bthats irrelevant\b/.test(normalized) ||
    /\bthat is irrelevant\b/.test(normalized)
  );
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
