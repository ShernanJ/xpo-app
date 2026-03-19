import { normalizeWhitespace } from "../extension/replyQuality.ts";
import type { VoiceStyleCard } from "../agent-v2/core/styleProfile.ts";
import { enforceVoiceStyleOnDraft } from "../agent-v2/core/voiceSignals.ts";

import type { ReplySourceContext } from "./types.ts";

const LIST_MARKER_PATTERN = /^\s*(?:[-*•]+|\d+[.)])\s+/;
const BANNED_GENERIC_PATTERNS = [
  /\bthe real (?:issue|hinge|leak) is\b/i,
  /\bhere'?s the framework\b/i,
  /\blevel up\b/i,
  /\bpays dividends\b/i,
  /\bexperienced operator\b/i,
  /\bhigh[-\s]roi\b/i,
  /\boperator\b/i,
  /\bcheap signal\b/i,
  /\biterate on content\b/i,
  /\breal data\b/i,
  /\bwould love to see\b/i,
  /\bnext build\b/i,
  /\bvanity likes?\b/i,
];

function stripFormatting(value: string): string {
  return value
    .replace(/```/g, "")
    .replace(/`/g, "")
    .replace(/\*/g, "")
    .replace(/[#]+(?=[\p{L}\p{N}_-])/gu, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\r/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-");
}

function stripPerLineFormatting(value: string): string {
  return value
    .split("\n")
    .map((line) => line.replace(LIST_MARKER_PATTERN, "").trim())
    .filter(Boolean)
    .join(" ");
}

export function cleanReplyDraftStreamChunk(value: string, hasEmittedContent = false) {
  const hadTrailingWhitespace = /\s$/.test(value);
  let next = stripFormatting(value).replace(/^\s*(?:reply|draft|tweet|response)\s*:\s*/i, "");

  if (!hasEmittedContent) {
    next = next.replace(/^\s+/, "");
  }
  if (!hadTrailingWhitespace) {
    next = next.replace(/\s+$/, "");
  }

  return next;
}

function countWeightedSegment(segment: string): number {
  let weighted = 0;

  for (const character of segment) {
    const codePoint = character.codePointAt(0) ?? 0;
    const isWide =
      codePoint > 0xffff ||
      /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u.test(
        character,
      );

    weighted += isWide ? 2 : 1;
  }

  return weighted;
}

function computeXWeightedCharacterCount(text: string): number {
  const urlRegex = /https?:\/\/\S+/gi;
  let weighted = 0;
  let lastIndex = 0;

  for (const match of text.matchAll(urlRegex)) {
    const start = match.index ?? 0;
    weighted += countWeightedSegment(text.slice(lastIndex, start));
    weighted += 23;
    lastIndex = start + match[0].length;
  }

  weighted += countWeightedSegment(text.slice(lastIndex));
  return weighted;
}

function trimToLimit(text: string, maxCharacterLimit: number): string {
  if (computeXWeightedCharacterCount(text) <= maxCharacterLimit) {
    return text.trim();
  }

  let result = text.trim();
  while (result.length > 0 && computeXWeightedCharacterCount(result) > maxCharacterLimit) {
    const cutoff = result.lastIndexOf(" ");
    result = cutoff > 0 ? result.slice(0, cutoff).trimEnd() : result.slice(0, -1).trimEnd();
  }

  return result.trim();
}

export function finalizeReplyDraftText(
  value: string,
  options?: {
    styleCard?: VoiceStyleCard | null;
    maxCharacterLimit?: number | null;
  },
) {
  let next = normalizeWhitespace(stripPerLineFormatting(stripFormatting(value)))
    .replace(/^["']+/, "")
    .replace(/["']+$/, "")
    .replace(/^\s*(?:reply|draft|tweet|response)\s*:\s*/i, "")
    .trim();

  next = enforceVoiceStyleOnDraft(next, options?.styleCard || null);

  if (typeof options?.maxCharacterLimit === "number" && Number.isFinite(options.maxCharacterLimit)) {
    next = trimToLimit(next, options.maxCharacterLimit);
  }

  return next;
}

function collectAnchorTokens(sourceContext: ReplySourceContext): Set<string> {
  const source = [
    sourceContext.primaryPost.text,
    sourceContext.quotedPost?.text || "",
    sourceContext.primaryPost.authorHandle || "",
    sourceContext.quotedPost?.authorHandle || "",
  ]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .slice(0, 24);

  return new Set(source);
}

export function looksAcceptableReplyDraft(args: {
  draft: string;
  sourceContext: ReplySourceContext;
}): boolean {
  const normalized = finalizeReplyDraftText(args.draft);
  if (!normalized) {
    return false;
  }

  if (normalized.length > 280) {
    return false;
  }

  if (/```|[*#]/.test(normalized)) {
    return false;
  }

  if (BANNED_GENERIC_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  const lower = normalized.toLowerCase();
  const anchors = collectAnchorTokens(args.sourceContext);
  if (anchors.size === 0) {
    return true;
  }

  for (const token of anchors) {
    if (lower.includes(token)) {
      return true;
    }
  }

  return Boolean(
    args.sourceContext.quotedPost &&
      /\b(same|yeah|agreed|exactly|fair|true|also|though|but)\b/i.test(lower),
  );
}
