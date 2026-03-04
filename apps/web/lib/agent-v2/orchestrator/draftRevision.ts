export type DraftRevisionChangeKind =
  | "remove_phrase"
  | "shorten"
  | "change_hook"
  | "tighten"
  | "tone_shift"
  | "generic";

export interface DraftRevisionDirective {
  instruction: string;
  changeKind: DraftRevisionChangeKind;
  targetText: string | null;
}

function extractQuotedText(message: string): string | null {
  const match = message.match(/["“'`](.+?)["”'`]/);
  return match?.[1]?.trim() || null;
}

function hasQuotedTarget(activeDraft: string, targetText: string): boolean {
  return activeDraft.toLowerCase().includes(targetText.toLowerCase());
}

export function normalizeDraftRevisionInstruction(
  userMessage: string,
  activeDraft: string,
): DraftRevisionDirective {
  const trimmed = userMessage.trim();
  const normalized = trimmed.toLowerCase();
  const quotedText = extractQuotedText(trimmed);

  if (
    quotedText &&
    hasQuotedTarget(activeDraft, quotedText) &&
    [
      "why does it say",
      "why does it mention",
      "don't say",
      "dont say",
      "remove",
      "delete",
      "cut",
    ].some((cue) => normalized.includes(cue))
  ) {
    return {
      instruction: `remove or replace the phrase "${quotedText}" and keep the rest of the post aligned with the current wording`,
      changeKind: "remove_phrase",
      targetText: quotedText,
    };
  }

  if (
    [
      "make it shorter",
      "shorten it",
      "trim it",
      "tighten it",
      "make this shorter",
      "make it punchier",
    ].some((cue) => normalized.includes(cue))
  ) {
    return {
      instruction:
        "shorten the current draft while preserving the main idea, tone, and core structure",
      changeKind: normalized.includes("tight") ? "tighten" : "shorten",
      targetText: null,
    };
  }

  if (
    ["change the hook", "fix the hook", "rewrite the hook", "better hook"].some((cue) =>
      normalized.includes(cue),
    )
  ) {
    return {
      instruction:
        "rewrite only the opening line or hook, and preserve the rest unless a small flow fix is needed",
      changeKind: "change_hook",
      targetText: null,
    };
  }

  if (
    ["more casual", "less hype", "less salesy", "more direct", "less polished"].some((cue) =>
      normalized.includes(cue),
    )
  ) {
    return {
      instruction: `adjust the tone of the current draft to satisfy this note: ${trimmed}`,
      changeKind: "tone_shift",
      targetText: null,
    };
  }

  return {
    instruction: `apply this revision request to the current draft: ${trimmed}`,
    changeKind: "generic",
    targetText: quotedText && hasQuotedTarget(activeDraft, quotedText) ? quotedText : null,
  };
}
