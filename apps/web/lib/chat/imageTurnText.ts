export type ImagePostConfirmationDecision = "confirm" | "decline";

const CONFIRM_PATTERNS = [
  /^(?:yes|yeah|yep|sure|ok|okay|do it|go ahead|lets do it|let's do it|write it|write a post|yes please)[.?!]*$/i,
  /^(?:yes|sure|okay|ok)[, ]+(?:write|turn|make).*/i,
];

const DECLINE_PATTERNS = [
  /^(?:no|nope|nah|not now|not yet|skip|pass|don't|dont)[.?!]*$/i,
  /^(?:no thanks|not for now)[.?!]*$/i,
];

export function parseImagePostConfirmationDecision(
  value: string,
): ImagePostConfirmationDecision | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (CONFIRM_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "confirm";
  }

  if (DECLINE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "decline";
  }

  return null;
}
