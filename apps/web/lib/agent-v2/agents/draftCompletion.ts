import { stripSelectedAnglePromptPrefix } from "../orchestrator/selectedAnglePrompt.ts";

const ABRUPT_ENDING_CLAUSE =
  /(?:,\s*)?(?:and|or|but|because|so|that|which|while|when|to)\s+[a-z0-9][a-z0-9'/-]{0,20}$/i;
const ABRUPT_ENDING_MULTIWORD_SHORT_TAIL =
  /(?:,\s*)?(?:and|or|but|because|so|that|which|while|when|to)\b(?:\s+[a-z0-9][a-z0-9'/-]{0,20}){0,3}\s+[a-z]{1,2}$/i;
const ABRUPT_ENDING_PUNCTUATION = /[,:;—-]\s*[a-z0-9][a-z0-9'/-]{0,20}$/i;
const ABRUPT_ENDING_SHORT_FRAGMENT = /[,:;—-]\s*[^.!?,:;—-]{0,32}\b[a-z]{1,2}$/i;
const ABRUPT_ENDING_QUESTION_STUB =
  /(?:(?<=[.!?])\s+|\r?\n+)(?:what|why|how|when|where|who)\b[^.!?]{0,80}\b(?:give|gives|gave|help|helps|make|makes|made|show|shows|mean|means|tell|tells|turn|turns|get|gets)\s+(?:me|you|us|them|him|her)\s*$/i;
const TRAILING_CONNECTOR = /\b(?:and|or|but|because|so|that|which|while|when|to)$/i;
const TERMINAL_ENDING = /[.!?…"'”’)\]]$/;
const THREADISH_LEAD_LABEL = /^(?:thread|post\s*\d+|tweet\s*\d+)\s*:\s*/i;
const QUESTION_START = /^(?:what|what's|why|how|when|where|who|which|is|are|can|could|should|do|does|did)\b/i;

function normalizeOverlapTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

export function repairAbruptEnding(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || TERMINAL_ENDING.test(trimmed)) {
    return trimmed;
  }

  let repaired = trimmed
    .replace(ABRUPT_ENDING_CLAUSE, "")
    .replace(ABRUPT_ENDING_MULTIWORD_SHORT_TAIL, "")
    .replace(ABRUPT_ENDING_PUNCTUATION, "")
    .replace(ABRUPT_ENDING_SHORT_FRAGMENT, "")
    .replace(ABRUPT_ENDING_QUESTION_STUB, "")
    .replace(/[,:;—-]\s*$/, "")
    .trimEnd();

  if (TRAILING_CONNECTOR.test(repaired)) {
    repaired = repaired.replace(TRAILING_CONNECTOR, "").trimEnd();
  }

  if (!repaired) {
    return trimmed;
  }

  if (repaired.length < Math.max(12, Math.floor(trimmed.length * 0.6))) {
    return trimmed;
  }

  return repaired;
}

export function stripThreadishLeadLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  return trimmed.replace(THREADISH_LEAD_LABEL, "").trimStart();
}

export function stripTrailingPromptEcho(
  value: string,
  sourcePrompt?: string | null,
): string {
  const trimmed = value.trim();
  const normalizedSourcePrompt = sourcePrompt
    ? stripSelectedAnglePromptPrefix(sourcePrompt)
    : null;

  if (!trimmed || !normalizedSourcePrompt) {
    return trimmed;
  }

  const rawLines = trimmed.split(/\r?\n/).map((line) => line.trimEnd());
  let lastNonEmptyIndex = -1;
  for (let index = rawLines.length - 1; index >= 0; index -= 1) {
    if (rawLines[index].trim()) {
      lastNonEmptyIndex = index;
      break;
    }
  }

  if (lastNonEmptyIndex <= 0) {
    return trimmed;
  }

  const lastLine = rawLines[lastNonEmptyIndex].trim();
  if (!lastLine || TERMINAL_ENDING.test(lastLine) || !QUESTION_START.test(lastLine)) {
    return trimmed;
  }

  const lastLineTokens = normalizeOverlapTokens(lastLine);
  const sourceTokens = normalizeOverlapTokens(normalizedSourcePrompt);
  if (lastLineTokens.length < 2 || lastLineTokens.length > 8 || sourceTokens.length < 3) {
    return trimmed;
  }

  const sharedTokens = lastLineTokens.filter((token) => sourceTokens.includes(token));
  const overlapRatio = sharedTokens.length / lastLineTokens.length;
  if (sharedTokens.length < 2 || overlapRatio < 0.6) {
    return trimmed;
  }

  const repaired = rawLines.slice(0, lastNonEmptyIndex).join("\n").trimEnd();
  if (!repaired) {
    return trimmed;
  }

  return repaired;
}
