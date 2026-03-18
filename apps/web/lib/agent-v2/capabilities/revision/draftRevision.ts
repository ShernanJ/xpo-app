import {
  buildThreadConversionPrompt,
  splitSerializedThreadPosts,
} from "../../../onboarding/shared/draftArtifacts.ts";

export type DraftRevisionChangeKind =
  | "local_phrase_edit"
  | "line_level_edit"
  | "emoji_cleanup"
  | "hook_only_edit"
  | "length_trim"
  | "length_expand"
  | "specificity_tune"
  | "tone_shift"
  | "full_rewrite"
  | "generic";

export type DraftRevisionScope = "whole_draft" | "thread_span";
export type DraftRevisionTargetFormat = "shortform" | "longform" | "thread" | null;

export type DraftRevisionThreadIntent =
  | "opening"
  | "ending"
  | "explicit_post"
  | "focused_post"
  | "whole_thread"
  | null;

export interface DraftRevisionTargetSpan {
  startIndex: number;
  endIndex: number;
}

export interface DraftRevisionDirective {
  instruction: string;
  changeKind: DraftRevisionChangeKind;
  targetText: string | null;
  targetFormat?: DraftRevisionTargetFormat;
  scope: DraftRevisionScope;
  targetSpan: DraftRevisionTargetSpan | null;
  threadIntent: DraftRevisionThreadIntent;
  preserveThreadStructure: boolean;
}

function extractQuotedText(message: string): string | null {
  const match = message.match(/["“'`](.+?)["”'`]/);
  return match?.[1]?.trim() || null;
}

function hasQuotedTarget(activeDraft: string, targetText: string): boolean {
  return activeDraft.toLowerCase().includes(targetText.toLowerCase());
}

function hasAnyCue(normalized: string, cues: string[]): boolean {
  return cues.some((cue) => normalized.includes(cue));
}

function hasOpeningCue(normalized: string): boolean {
  return [
    /\bopener\b/,
    /\bopening\b/,
    /\bhook\b/,
    /\bintro(?:duction)?\b/,
    /\blead(?:-in|\s+in)?\b/,
    /\bopening (?:line|sentence|beat)\b/,
    /\bfirst (?:post|tweet|line)\b/,
  ].some((pattern) => pattern.test(normalized));
}

function clampThreadPostIndex(index: number, postCount: number): number {
  return Math.max(0, Math.min(index, Math.max(0, postCount - 1)));
}

function buildThreadSpan(startIndex: number, endIndex: number): DraftRevisionTargetSpan {
  return {
    startIndex,
    endIndex,
  };
}

function buildDirective(args: {
  instruction: string;
  changeKind: DraftRevisionChangeKind;
  targetText: string | null;
  targetFormat?: DraftRevisionTargetFormat;
  scope?: DraftRevisionScope;
  targetSpan?: DraftRevisionTargetSpan | null;
  threadIntent?: DraftRevisionThreadIntent;
  preserveThreadStructure?: boolean;
}): DraftRevisionDirective {
  return {
    instruction: args.instruction,
    changeKind: args.changeKind,
    targetText: args.targetText,
    targetFormat: args.targetFormat ?? null,
    scope: args.scope ?? "whole_draft",
    targetSpan: args.targetSpan ?? null,
    threadIntent: args.threadIntent ?? null,
    preserveThreadStructure: args.preserveThreadStructure ?? false,
  };
}

function looksLikeThreadConversionRequest(normalized: string): boolean {
  return [
    /\bturn\s+(?:(?:this|that|it)\s+)?into\s+(?:an?\s+)?(?:(?:x|tweet)\s+)?thread\b/,
    /\bconvert\s+(?:(?:this|that|it)\s+)?(?:into\s+|to\s+)(?:an?\s+)?(?:(?:x|tweet)\s+)?thread\b/,
    /\brewrite\s+(?:(?:this|that|it)\s+)?as\s+(?:an?\s+)?(?:(?:x|tweet)\s+)?thread\b/,
    /\bmake\s+it\s+a\s+(?:(?:x|tweet)\s+)?thread\b/,
    /^make\s+thread$/,
  ].some((pattern) => pattern.test(normalized));
}

function looksLikeShortformConversionRequest(normalized: string): boolean {
  return [
    "turn this into a shortform post",
    "turn this into a post",
    "make it a post",
    "convert this into a post",
    "rewrite this as a post",
    "turn into a post",
    "turn it into a shortform post",
    "turn it into a post",
    "make it shortform",
    "turn this into shortform",
    "turn it into shortform",
    "under 280 characters",
  ].some((cue) => normalized.includes(cue));
}

function decorateThreadSpanInstruction(
  instruction: string,
  targetSpan: DraftRevisionTargetSpan,
): string {
  const targetLabel =
    targetSpan.startIndex === targetSpan.endIndex
      ? `post ${targetSpan.startIndex + 1}`
      : `posts ${targetSpan.startIndex + 1}-${targetSpan.endIndex + 1}`;

  return `${instruction} apply the change only to ${targetLabel} of the current thread, preserve every other post verbatim, and keep the same post order.`;
}

function decorateWholeThreadInstruction(
  instruction: string,
  preserveThreadStructure: boolean,
): string {
  if (preserveThreadStructure) {
    return `${instruction} revise the full thread, but keep the same post count and order unless the user explicitly asked to restructure it.`;
  }

  return `${instruction} revise the full thread, and you may rebuild the thread structure if the request clearly calls for it.`;
}

function buildThreadSpanDirective(args: {
  base: DraftRevisionDirective;
  targetSpan: DraftRevisionTargetSpan;
  threadIntent: Exclude<DraftRevisionThreadIntent, "whole_thread" | null>;
}): DraftRevisionDirective {
  return {
    ...args.base,
    instruction: decorateThreadSpanInstruction(args.base.instruction, args.targetSpan),
    scope: "thread_span",
    targetSpan: args.targetSpan,
    threadIntent: args.threadIntent,
    preserveThreadStructure: true,
  };
}

function buildWholeThreadDirective(args: {
  base: DraftRevisionDirective;
  preserveThreadStructure: boolean;
}): DraftRevisionDirective {
  return {
    ...args.base,
    instruction: decorateWholeThreadInstruction(
      args.base.instruction,
      args.preserveThreadStructure,
    ),
    scope: "whole_draft",
    targetSpan: null,
    threadIntent: "whole_thread",
    preserveThreadStructure: args.preserveThreadStructure,
  };
}

function buildAmbiguousThreadDirective(base: DraftRevisionDirective): DraftRevisionDirective {
  return {
    ...base,
    instruction: `${base.instruction} this sounds like a local thread edit, but the target post is still unclear.`,
    scope: "thread_span",
    targetSpan: null,
    threadIntent: null,
    preserveThreadStructure: true,
  };
}

function detectExplicitThreadPostIndex(
  normalized: string,
  postCount: number,
): number | null {
  const postMatch = normalized.match(/\b(?:post|tweet)\s+(\d{1,2})\b/);
  if (postMatch) {
    const numericIndex = Number.parseInt(postMatch[1] || "", 10);
    if (Number.isInteger(numericIndex) && numericIndex >= 1 && numericIndex <= postCount) {
      return numericIndex - 1;
    }
  }

  const ratioMatch = normalized.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b/);
  if (ratioMatch) {
    const numericIndex = Number.parseInt(ratioMatch[1] || "", 10);
    const totalPosts = Number.parseInt(ratioMatch[2] || "", 10);
    if (
      Number.isInteger(numericIndex) &&
      Number.isInteger(totalPosts) &&
      numericIndex >= 1 &&
      numericIndex <= postCount &&
      totalPosts >= numericIndex
    ) {
      return numericIndex - 1;
    }
  }

  return null;
}

function normalizeBaseDraftRevisionInstruction(
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
    return buildDirective({
      instruction: `remove or replace the phrase "${quotedText}" and keep the rest of the post aligned with the current wording`,
      changeKind: "local_phrase_edit",
      targetText: quotedText,
    });
  }

  if (
    ["remove the last line", "cut the last line", "drop the last line", "remove the cta"].some(
      (cue) => normalized.includes(cue),
    )
  ) {
    return buildDirective({
      instruction:
        "remove the final line or CTA only, and keep the rest of the post intact unless a tiny flow fix is needed",
      changeKind: "line_level_edit",
      targetText: null,
    });
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
    return buildDirective({
      instruction:
        "remove all emojis from the current draft and keep the rest of the wording as intact as possible",
      changeKind: "emoji_cleanup",
      targetText: null,
    });
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
    return buildDirective({
      instruction:
        "shorten the current draft while preserving the main idea, tone, and core structure.",
      changeKind: "length_trim",
      targetText: null,
    });
  }

  if (
    [
      "make it longer",
      "longer",
      "make it more detailed",
      "more detailed",
      "add more detail",
      "add details",
      "expand it",
      "expand this",
      "flesh it out",
      "open it up",
      "go deeper",
      "develop this more",
    ].some((cue) => normalized.includes(cue))
  ) {
    return buildDirective({
      instruction:
        "expand the current draft with more specificity and detail while preserving the same core angle, staying close to the existing wording, and only elaborating with details that are already grounded in the draft, chat, or session context.",
      changeKind: "length_expand",
      targetText: null,
    });
  }

  if (
    [
      "more specific",
      "make it more specific",
      "be more specific",
      "less generic",
      "make it less generic",
      "less vague",
      "make it less vague",
      "sharper",
      "make this sharper",
      "add specificity",
      "tighten the point",
    ].some((cue) => normalized.includes(cue))
  ) {
    return buildDirective({
      instruction:
        "make the current draft more specific and less generic while preserving the same angle, staying close to the existing structure, and sharpening only with details already present in the draft, user note, chat, or grounding.",
      changeKind: "specificity_tune",
      targetText: null,
    });
  }

  if (
    ["change the hook", "fix the hook", "rewrite the hook", "better hook", "stronger hook"].some(
      (cue) => normalized.includes(cue),
    )
  ) {
    return buildDirective({
      instruction:
        "rewrite only the opening line or hook, and preserve the rest unless a small flow fix is needed.",
      changeKind: "hook_only_edit",
      targetText: null,
    });
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
    return buildDirective({
      instruction: `adjust the tone of the current draft to satisfy this note: ${trimmed}`,
      changeKind: "tone_shift",
      targetText: null,
    });
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
    return buildDirective({
      instruction: `fully rewrite the current draft around this request: ${trimmed}`,
      changeKind: "full_rewrite",
      targetText: null,
    });
  }

  if (looksLikeThreadConversionRequest(normalized)) {
    return buildDirective({
      instruction:
        buildThreadConversionPrompt(),
      changeKind: "full_rewrite",
      targetText: null,
      targetFormat: "thread",
    });
  }

  if (looksLikeShortformConversionRequest(normalized)) {
    return buildDirective({
      instruction:
        "rewrite the current draft as exactly one standalone x post under 280 weighted characters. preserve the core idea and strongest proof, but compress it aggressively into a clean shortform version. do not use thread separators, post labels, or multi-post structure.",
      changeKind: "full_rewrite",
      targetText: null,
      targetFormat: "shortform",
    });
  }

  return buildDirective({
    instruction: `apply this revision request to the current draft: ${trimmed}`,
    changeKind: "generic",
    targetText: quotedText && hasQuotedTarget(activeDraft, quotedText) ? quotedText : null,
  });
}

function applyThreadRevisionScope(args: {
  base: DraftRevisionDirective;
  normalized: string;
  postCount: number;
  focusedThreadPostIndex?: number;
}): DraftRevisionDirective {
  const {
    base,
    normalized,
    postCount,
    focusedThreadPostIndex,
  } = args;

  const explicitPostIndex = detectExplicitThreadPostIndex(normalized, postCount);
  const structuralWholeThreadCues = [
    "reorder",
    "rework the flow",
    "rework flow",
    "restructure",
    "collapse",
    "combine posts",
    "merge posts",
    "fewer posts",
    "more posts",
    "add a post",
    "cut a post",
  ];
  const wholeThreadCues = [
    "whole thread",
    "entire thread",
    "full thread",
    "whole post",
    "entire post",
    "full post",
    "whole thing",
    "entire thing",
    "all of it",
    "throughout",
    "across the thread",
    "each post",
    "every post",
    "all posts",
    "thread overall",
    "thread-wide",
    "shorten the thread",
  ];
  const openingCues = [
    "opener",
    "opening",
    "hook",
    "first post",
    "first tweet",
  ];
  const endingCues = [
    "ending",
    "end it",
    "close",
    "closer",
    "closing",
    "final post",
    "last post",
    "last tweet",
    "cta",
    "call to action",
  ];
  const openingCueDetected = hasOpeningCue(normalized);

  if (explicitPostIndex === 0 && openingCueDetected) {
    return buildThreadSpanDirective({
      base,
      targetSpan: buildThreadSpan(0, 0),
      threadIntent: "opening",
    });
  }

  if (explicitPostIndex !== null) {
    return buildThreadSpanDirective({
      base,
      targetSpan: buildThreadSpan(explicitPostIndex, explicitPostIndex),
      threadIntent: "explicit_post",
    });
  }

  const wantsWholeThreadStructureChange = hasAnyCue(normalized, structuralWholeThreadCues);
  const wantsWholeThreadEdit =
    wantsWholeThreadStructureChange ||
    hasAnyCue(normalized, wholeThreadCues) ||
    (base.changeKind === "full_rewrite" &&
      !hasAnyCue(normalized, openingCues) &&
      !hasAnyCue(normalized, endingCues));

  if (wantsWholeThreadEdit) {
    return buildWholeThreadDirective({
      base,
      preserveThreadStructure:
        !wantsWholeThreadStructureChange && base.changeKind !== "full_rewrite",
    });
  }

  if (openingCueDetected || hasAnyCue(normalized, openingCues)) {
    return buildThreadSpanDirective({
      base,
      targetSpan: buildThreadSpan(0, 0),
      threadIntent: "opening",
    });
  }

  if (hasAnyCue(normalized, endingCues)) {
    const spanStart = Math.max(0, postCount - 2);
    return buildThreadSpanDirective({
      base,
      targetSpan: buildThreadSpan(spanStart, postCount - 1),
      threadIntent: "ending",
    });
  }

  if (focusedThreadPostIndex !== undefined) {
    const clampedIndex = clampThreadPostIndex(focusedThreadPostIndex, postCount);
    return buildThreadSpanDirective({
      base,
      targetSpan: buildThreadSpan(clampedIndex, clampedIndex),
      threadIntent: "focused_post",
    });
  }

  return buildAmbiguousThreadDirective(base);
}

export function normalizeDraftRevisionInstruction(
  userMessage: string,
  activeDraft: string,
  focusedThreadPostIndex?: number,
): DraftRevisionDirective {
  const baseDirective = normalizeBaseDraftRevisionInstruction(userMessage, activeDraft);
  const threadPosts = splitSerializedThreadPosts(activeDraft);

  if (threadPosts.length <= 1) {
    return baseDirective;
  }

  return applyThreadRevisionScope({
    base: baseDirective,
    normalized: userMessage.trim().toLowerCase(),
    postCount: threadPosts.length,
    focusedThreadPostIndex,
  });
}
