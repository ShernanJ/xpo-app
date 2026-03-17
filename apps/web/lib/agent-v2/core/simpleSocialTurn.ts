export type SimpleSocialTurnKind = "greeting" | "follow_up";

const SIMPLE_GREETING_MESSAGES = new Set([
  "hi",
  "hello",
  "hey",
  "yo",
  "hiya",
  "hi how are you",
  "hello how are you",
  "hey how are you",
  "how are you",
  "how's it going",
  "hows it going",
]);

const SIMPLE_SOCIAL_FOLLOW_UP_MESSAGES = new Set([
  "good",
  "all good",
  "doing good",
  "doing well",
  "vibing",
  "what's up",
  "whats up",
]);

function normalizeSimpleSocialMessage(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/[.?!,:;]+$/g, "")
    .replace(/\s+/g, " ");
}

export function resolveSimpleSocialTurnKind(
  message: string,
): SimpleSocialTurnKind | null {
  const normalized = normalizeSimpleSocialMessage(message);
  if (!normalized) {
    return null;
  }

  if (SIMPLE_GREETING_MESSAGES.has(normalized)) {
    return "greeting";
  }

  if (SIMPLE_SOCIAL_FOLLOW_UP_MESSAGES.has(normalized)) {
    return "follow_up";
  }

  return null;
}

export function looksLikeSimpleSocialTurn(message: string): boolean {
  return resolveSimpleSocialTurnKind(message) !== null;
}
