import { normalizeWhitespace } from "../extension/replyQuality.ts";

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

export function finalizeReplyDraftText(value: string) {
  return normalizeWhitespace(stripPerLineFormatting(stripFormatting(value)))
    .replace(/^["']+/, "")
    .replace(/["']+$/, "")
    .replace(/^\s*(?:reply|draft|tweet|response)\s*:\s*/i, "")
    .trim();
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
