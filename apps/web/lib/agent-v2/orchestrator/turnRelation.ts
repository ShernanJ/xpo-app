export type AssistantTurnKind =
  | "question"
  | "draft_offer"
  | "diagnostic"
  | "content_direction"
  | "generic";

export type ContextualFollowUpKind = "example" | "explain" | "execute";

interface ParsedTurn {
  role: "user" | "assistant";
  content: string;
}

const USER_ROLES = new Set(["user", "human", "creator"]);
const ASSISTANT_ROLES = new Set(["assistant", "agent"]);

const DRAFT_OFFER_PATTERNS = [
  /\bwant me to (?:draft|write|turn that into)\b/,
  /\bwant to draft\b/,
  /\bsay the word and i(?:')ll draft it\b/,
  /\bwrite this version now\b/,
  /\bdraft this version\b/,
];

const DIAGNOSTIC_PATTERNS = [
  /\blikely reasons:\b/,
  /\bnext actions:\b/,
  /\bfull breakdown is there if you want it\b/,
  /\bsuppressing reach\b/,
  /\bhere(?:')s what i(?:')d change first\b/,
  /\bhere(?:')s where i(?:')d focus first\b/,
];

const CONTENT_DIRECTION_ACTION_SIGNALS = [
  "use that",
  "show how",
  "turn the",
  "frame it",
  "lead with",
  "open with",
  "anchor it in",
  "make it a",
  "center it on",
  "pitch it as",
];

const CONTENT_DIRECTION_SUBJECT_SIGNALS = [
  "post",
  "thread",
  "story",
  "angle",
  "hook",
  "case study",
  "loss",
  "lesson",
  "app",
  "match",
];

const EXAMPLE_FOLLOW_UP_PATTERNS = [
  /^(?:can you\s+)?(?:give|show|make|generate|draft|write|create)\s+(?:me\s+)?(?:(?:some|a few|few|another|multiple|an?|one)\s+)?examples?\b/,
  /^(?:can you\s+)?show\s+me\s+what\s+(?:that|this|it)\s+looks\s+like\b/,
  /^(?:what\s+(?:would|does)\s+(?:that|this|it)\s+look\s+like)\b/,
  /^(?:can you\s+)?give\s+me\s+(?:(?:one|a|some|a few|few|another|\d+)\s+)?versions?\b/,
  /^(?:can you\s+)?show\s+me\s+(?:one|a)\s+version\b/,
];

const EXPLAIN_FOLLOW_UP_PATTERNS = [
  /^(?:can you\s+)?relate\s+(?:it|that|this)\s+to\s+me\b/,
  /^(?:can you\s+)?tell\s+me\s+more\b/,
  /^(?:can you\s+)?explain\b/,
  /^(?:can you\s+)?break\s+(?:it|that|this)\s+down\b/,
  /^(?:can you\s+)?expand\s+on\s+(?:it|that|this)\b/,
  /^(?:what\s+do\s+you\s+mean(?:\s+by\s+that)?)\b/,
  /^(?:why\s+(?:that|this|it))\b/,
  /^(?:more\s+on\s+(?:that|this|it))\b/,
];

const EXECUTE_FOLLOW_UP_PATTERNS = [
  /^(?:can you\s+)?(?:write|draft|make|create)\s+(?:one|it|that|this)\b/,
  /^(?:can you\s+)?turn\s+(?:that|this|it)\s+into\s+(?:a\s+)?(?:post|thread)\b/,
  /^(?:can you\s+)?(?:post|thread)\s+version\b/,
  /^(?:ship|send)\s+it\b/,
];

export interface TurnRelationContext {
  lastAssistantTurn: string | null;
  lastUserTurn: string | null;
  lastAssistantKind: AssistantTurnKind;
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseRecentTurns(recentHistory: string): ParsedTurn[] {
  if (!recentHistory || recentHistory.trim().toLowerCase() === "none") {
    return [];
  }

  const turns: ParsedTurn[] = [];
  let currentRole: ParsedTurn["role"] | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentRole) {
      currentLines = [];
      return;
    }

    const content = currentLines.join("\n").trim();
    if (content) {
      turns.push({ role: currentRole, content });
    }

    currentRole = null;
    currentLines = [];
  };

  for (const rawLine of recentHistory.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentLines.length > 0) {
        currentLines.push("");
      }
      continue;
    }

    const match = trimmed.match(/^([a-z_]+)\s*:\s*(.*)$/i);
    if (match) {
      const role = match[1].toLowerCase();
      const content = match[2]?.trim() || "";

      if (role === "assistant_angles" && currentRole === "assistant") {
        if (content) {
          currentLines.push(`angles: ${content}`);
        }
        continue;
      }

      const normalizedRole = USER_ROLES.has(role)
        ? "user"
        : ASSISTANT_ROLES.has(role)
          ? "assistant"
          : null;

      if (normalizedRole) {
        flush();
        currentRole = normalizedRole;
        if (content) {
          currentLines.push(content);
        }
        continue;
      }
    }

    if (currentRole) {
      currentLines.push(trimmed);
    }
  }

  flush();
  return turns;
}

function classifyAssistantTurn(content: string | null): AssistantTurnKind {
  if (!content) {
    return "generic";
  }

  const normalized = normalizeText(content);
  if (!normalized) {
    return "generic";
  }

  if (DRAFT_OFFER_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "draft_offer";
  }

  if (DIAGNOSTIC_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "diagnostic";
  }

  if (/[?]\s*$/.test(content.trim())) {
    return "question";
  }

  if (
    CONTENT_DIRECTION_ACTION_SIGNALS.some((signal) => normalized.includes(signal)) &&
    CONTENT_DIRECTION_SUBJECT_SIGNALS.some((signal) => normalized.includes(signal))
  ) {
    return "content_direction";
  }

  return "generic";
}

export function getTurnRelationContext(recentHistory: string): TurnRelationContext {
  const turns = parseRecentTurns(recentHistory);
  let lastAssistantTurn: string | null = null;
  let lastUserTurn: string | null = null;

  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!lastAssistantTurn && turn.role === "assistant") {
      lastAssistantTurn = turn.content;
    }
    if (!lastUserTurn && turn.role === "user") {
      lastUserTurn = turn.content;
    }
    if (lastAssistantTurn && lastUserTurn) {
      break;
    }
  }

  return {
    lastAssistantTurn,
    lastUserTurn,
    lastAssistantKind: classifyAssistantTurn(lastAssistantTurn),
  };
}

export function classifyContextualFollowUp(message: string): ContextualFollowUpKind | null {
  const normalized = normalizeText(message);
  if (!normalized || normalized.length > 120) {
    return null;
  }

  if (EXPLAIN_FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "explain";
  }

  if (EXECUTE_FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "execute";
  }

  if (EXAMPLE_FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "example";
  }

  return null;
}

export function isContextDependentFollowUp(message: string): boolean {
  if (classifyContextualFollowUp(message)) {
    return true;
  }

  const normalized = normalizeText(message);
  if (!normalized || normalized.length > 80) {
    return false;
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount > 6) {
    return false;
  }

  return /\b(?:it|that|this|those|them|same|more|another|version|versions|example|examples)\b/.test(
    normalized,
  );
}
