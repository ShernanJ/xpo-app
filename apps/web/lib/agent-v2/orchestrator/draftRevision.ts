export type DraftRevisionChangeKind =
  | "local_phrase_edit"
  | "line_level_edit"
  | "emoji_cleanup"
  | "hook_only_edit"
  | "length_trim"
  | "tone_shift"
  | "full_rewrite"
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
      changeKind: "local_phrase_edit",
      targetText: quotedText,
    };
  }

  if (
    ["remove the last line", "cut the last line", "drop the last line", "remove the cta"].some(
      (cue) => normalized.includes(cue),
    )
  ) {
    return {
      instruction:
        "remove the final line or CTA only, and keep the rest of the post intact unless a tiny flow fix is needed",
      changeKind: "line_level_edit",
      targetText: null,
    };
  }

  if (
    [
      "no emojis",
      "remove emojis",
      "remove the emojis",
      "drop the emojis",
      "without emojis",
    ].some((cue) => normalized.includes(cue))
  ) {
    return {
      instruction:
        "remove all emojis from the current draft and keep the rest of the wording as intact as possible",
      changeKind: "emoji_cleanup",
      targetText: null,
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
      changeKind: "length_trim",
      targetText: null,
    };
  }

  if (
    ["change the hook", "fix the hook", "rewrite the hook", "better hook", "stronger hook"].some((cue) =>
      normalized.includes(cue),
    )
  ) {
    return {
      instruction:
        "rewrite only the opening line or hook, and preserve the rest unless a small flow fix is needed",
      changeKind: "hook_only_edit",
      targetText: null,
    };
  }

  if (
    [
      "more casual",
      "less hype",
      "less salesy",
      "more direct",
      "less polished",
      "less cringe",
      "too much",
      "too forced",
      "sounds forced",
      "feels forced",
      "feels too forced",
      "this one feels too forced",
      "too safe",
      "less stiff",
      "less try-hard",
      "less try hard",
      "less linkedin",
      "sounds like linkedin",
      "feels like linkedin",
      "builder-coded",
      "builder coded",
      "more builder-coded",
      "more builder coded",
      "keep the same idea but cleaner",
      "keep the same idea",
      "cleaner",
      "clean this up",
      "clean it up",
      "more like me",
      "sound like me",
      "sounds like me",
      "make it sound human",
      "make this sound human",
      "sound more human",
      "sound less robotic",
      "not my voice",
    ].some((cue) => normalized.includes(cue))
  ) {
    return {
      instruction: `adjust the tone of the current draft to satisfy this note: ${trimmed}`,
      changeKind: "tone_shift",
      targetText: null,
    };
  }

  if (
    [
      "start over",
      "rewrite the whole thing",
      "rewrite this from scratch",
      "new angle",
      "make this completely different",
    ].some((cue) => normalized.includes(cue))
  ) {
    return {
      instruction: `fully rewrite the current draft around this request: ${trimmed}`,
      changeKind: "full_rewrite",
      targetText: null,
    };
  }

  if (
    [
      "turn this into a thread",
      "make it a thread",
      "convert this into a thread",
      "rewrite this as a thread",
      "turn into a thread",
    ].some((cue) => normalized.includes(cue))
  ) {
    return {
      instruction:
        "rewrite the current draft as a native x thread. preserve the core idea, but rebuild the flow across 4 to 6 connected posts with distinct beats, natural transitions, and a strong opener. do not just chop the original draft into short tweet-sized fragments.",
      changeKind: "full_rewrite",
      targetText: null,
    };
  }

  return {
    instruction: `apply this revision request to the current draft: ${trimmed}`,
    changeKind: "generic",
    targetText: quotedText && hasQuotedTarget(activeDraft, quotedText) ? quotedText : null,
  };
}
