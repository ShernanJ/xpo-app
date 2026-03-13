const ABRUPT_ENDING_CLAUSE =
  /(?:,\s*)?(?:and|or|but|because|so|that|which|while|when|to)\s+[a-z0-9][a-z0-9'/-]{0,20}$/i;
const ABRUPT_ENDING_PUNCTUATION = /[,:;—-]\s*[a-z0-9][a-z0-9'/-]{0,20}$/i;
const ABRUPT_ENDING_SHORT_FRAGMENT = /[,:;—-]\s*[^.!?,:;—-]{0,32}\b[a-z]{1,2}$/i;
const TRAILING_CONNECTOR = /\b(?:and|or|but|because|so|that|which|while|when|to)$/i;
const TERMINAL_ENDING = /[.!?…"'”’)\]]$/;
const THREADISH_LEAD_LABEL = /^(?:thread|post\s*\d+|tweet\s*\d+)\s*:\s*/i;

export function repairAbruptEnding(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || TERMINAL_ENDING.test(trimmed)) {
    return trimmed;
  }

  let repaired = trimmed
    .replace(ABRUPT_ENDING_CLAUSE, "")
    .replace(ABRUPT_ENDING_PUNCTUATION, "")
    .replace(ABRUPT_ENDING_SHORT_FRAGMENT, "")
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
