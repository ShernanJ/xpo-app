interface FeedbackNoticeStyleCard {
  formattingRules?: string[];
  customGuidelines?: string[];
  userPreferences?: {
    casing?: "auto" | "normal" | "lowercase" | "uppercase" | null;
  } | null;
}

export function normalizeMemoryEntry(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function countNewMemoryEntries(existing: string[], additions: string[]): number {
  const existingSet = new Set(existing.map((value) => normalizeMemoryEntry(value)));
  let count = 0;

  for (const rawEntry of additions) {
    const normalized = normalizeMemoryEntry(rawEntry);
    if (!normalized || existingSet.has(normalized)) {
      continue;
    }

    existingSet.add(normalized);
    count += 1;
  }

  return count;
}

function prefersLowercaseAcknowledgement(styleCard: FeedbackNoticeStyleCard | null): boolean {
  const explicitCasing = styleCard?.userPreferences?.casing;
  if (explicitCasing === "lowercase") {
    return true;
  }

  if (explicitCasing === "normal" || explicitCasing === "uppercase") {
    return false;
  }

  const styleSignals = [
    ...(styleCard?.formattingRules || []),
    ...(styleCard?.customGuidelines || []),
  ]
    .join(" ")
    .toLowerCase();

  return (
    styleSignals.includes("all lowercase") ||
    styleSignals.includes("always lowercase") ||
    styleSignals.includes("write in lowercase")
  );
}

export function buildFeedbackMemoryNotice(args: {
  styleCard: FeedbackNoticeStyleCard | null;
  rememberedStyleRuleCount: number;
  rememberedFactCount: number;
  rememberedAntiPattern: boolean;
}): string | null {
  const { rememberedStyleRuleCount, rememberedFactCount, rememberedAntiPattern } = args;
  if (rememberedStyleRuleCount === 0 && rememberedFactCount === 0 && !rememberedAntiPattern) {
    return null;
  }

  const lowercase = prefersLowercaseAcknowledgement(args.styleCard);
  if (rememberedFactCount > 0 && rememberedStyleRuleCount === 0 && !rememberedAntiPattern) {
    return lowercase
      ? "noted - i'll remember that context for next drafts."
      : "Noted - I'll remember that context for next drafts.";
  }

  return lowercase
    ? "noted - i'll remember that feedback for next drafts."
    : "Noted - I'll remember that feedback for next drafts.";
}

export function prependFeedbackMemoryNotice(response: string, notice: string | null): string {
  if (!notice) {
    return response;
  }

  const trimmed = response.trim();
  if (!trimmed) {
    return notice;
  }

  const normalized = trimmed.toLowerCase();
  if (normalized.includes("i'll remember that") || normalized.includes("i will remember that")) {
    return response;
  }

  return `${notice}\n\n${trimmed}`;
}
