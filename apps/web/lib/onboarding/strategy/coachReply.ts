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

export function isDraftPushPrompt(value: string): boolean {
  const normalized = normalizeCoachInput(value);
  if (!normalized) {
    return false;
  }

  return (
    normalized === "please" ||
    normalized === "pls" ||
    normalized === "pls draft it" ||
    normalized === "please draft it" ||
    normalized === "just do it" ||
    normalized === "go ahead" ||
    normalized === "draft it" ||
    normalized === "just write it" ||
    normalized === "do it"
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

/**
 * If there are multiple questions, keep only the last one (the closing question).
 * Strips bullet/numbered lists that look like wizard-style option menus.
 */
export function enforceOneQuestion(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return trimmed;
  }

  // Count question marks
  const questionMarks = (trimmed.match(/\?/g) ?? []).length;
  if (questionMarks <= 1) {
    return trimmed;
  }

  // Split into sentences, keep everything up to and including the LAST question
  const sentences = trimmed.split(/(?<=\?)\s+/);
  const lastQuestionIndex = sentences.findLastIndex((s) => s.includes("?"));

  if (lastQuestionIndex <= 0) {
    return trimmed;
  }

  // Keep non-question context sentences before the last question + the last question itself
  const nonQuestionPrefix = sentences
    .slice(0, lastQuestionIndex)
    .filter((s) => !s.includes("?"))
    .join(" ");
  const closingQuestion = sentences[lastQuestionIndex];

  const result = nonQuestionPrefix
    ? `${nonQuestionPrefix} ${closingQuestion}`
    : closingQuestion;

  return result.trim();
}

/**
 * Remove wizard-style language from assistant text:
 * - "Pick one:", "Which of these:", "Choose from:"
 * - Numbered/bulleted option lists
 * - "A few directions:" list patterns
 */
export function stripWizardLanguage(text: string): string {
  let result = text;

  // Remove "pick one:" / "choose from:" / "which of these:" phrases
  result = result.replace(
    /\b(pick one|choose (one|from)|which of these|select one|here are your options)\s*[:.]?\s*/gi,
    "",
  );

  // Remove "A few easy directions:" / "A few options:" followed by a list
  result = result.replace(
    /\b(a few (easy |possible )?(directions|options|choices))\s*[:.]?\s*/gi,
    "",
  );

  // Remove bullet-point option lists (lines starting with - or •)
  // Only if there are 2+ of them (looks like a wizard option list)
  const lines = result.split("\n");
  const bulletLines = lines.filter((l) => /^\s*[-•]\s/.test(l));
  if (bulletLines.length >= 2 && bulletLines.length === lines.filter((l) => l.trim()).length) {
    // Entire response is a bullet list — this is wizard-like
    // Keep only the first bullet as a suggestion embedded in prose
    const firstOption = bulletLines[0].replace(/^\s*[-•]\s*/, "").trim();
    result = `For example, you could focus on ${firstOption.toLowerCase()}.`;
  }

  return result.trim();
}
