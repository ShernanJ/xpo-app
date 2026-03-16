function normalizeProfileContextValue(value: string): string {
  return value.trim().replace(/^[-*]\s*/, "").replace(/\s+/g, " ");
}

const PROFILE_CONTEXT_HEADER_PATTERN =
  /^(?:account|handle|bio|profile facts|known facts|voice\/territory hints|known for|target audience|content pillars|pinned post|recent posts|primary goal|stage)\s*:/i;
const PROFILE_SUMMARY_HEADER_PATTERN = /^(?:user|creator)\s+profile\s+summary\b/i;
const USERNAME_HANDLE_SENTENCE_PATTERNS = [
  /^(?:the\s+)?user(?:'s)?\s+(?:x|twitter|x\s*\(twitter\)|twitter\s*\(x\))\s+(?:username|handle)\s+is\b/i,
  /^(?:the\s+)?(?:creator|user)\s+(?:username|handle)\s+is\b/i,
  /^(?:the\s+)?(?:x|twitter|x\s*\(twitter\)|twitter\s*\(x\))\s+(?:username|handle)\s+is\b/i,
];

export function looksLikeProfileContextLeak(value: string): boolean {
  const normalized = normalizeProfileContextValue(value);
  if (!normalized) {
    return false;
  }

  if (
    PROFILE_SUMMARY_HEADER_PATTERN.test(normalized) ||
    PROFILE_CONTEXT_HEADER_PATTERN.test(normalized)
  ) {
    return true;
  }

  return USERNAME_HANDLE_SENTENCE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function filterProfileContextLeaks(values: string[]): string[] {
  return values.filter((value) => !looksLikeProfileContextLeak(value));
}
