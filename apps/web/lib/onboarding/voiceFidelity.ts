/**
 * Voice Fidelity Budget
 *
 * Resolves the core tension: optimize for growth vs match user voice.
 * - "high": prioritize sounding like the user (sacrifice some growth structure)
 * - "balanced": default — growth expressed through structure, voice through rendering
 * - "growth_first": user explicitly wants virality — lean into structural growth patterns
 */

export type VoiceFidelity = "high" | "balanced" | "growth_first";

const GROWTH_FIRST_PATTERNS = [
  /\b(go viral|make.*(viral|blow up))\b/i,
  /\b(maximize|optimize).*(replies|engagement|growth|reach)\b/i,
  /\b(make it|more) (punchy|punchier|shareable|engaging)\b/i,
  /\b(get more|boost|increase).*(replies|engagement)\b/i,
  /\bgrowth.?first\b/i,
];

const HIGH_FIDELITY_PATTERNS = [
  /\b(sound|sounds?) (more )?like me\b/i,
  /\b(keep|match) my (vibe|voice|style|tone)\b/i,
  /\b(stop|don.?t) (making|make) me sound (corporate|generic|robotic|fake)\b/i,
  /\bmore authentic\b/i,
  /\bmy.*(voice|style|way of writing)\b/i,
  /\bsound.*(natural|human|real)\b/i,
];

/**
 * Detect voice fidelity preference from the user's message.
 * Returns the fidelity level, or null if no explicit signal detected
 * (meaning the existing stored value should persist).
 */
export function detectVoiceFidelityFromMessage(
  userMessage: string,
): VoiceFidelity | null {
  const trimmed = userMessage.trim();
  if (!trimmed) return null;

  if (GROWTH_FIRST_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "growth_first";
  }

  if (HIGH_FIDELITY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "high";
  }

  return null;
}

/**
 * Resolve the effective voice fidelity for this turn.
 * Priority: explicit user signal > stored memory > default "balanced"
 */
export function resolveVoiceFidelity(params: {
  userMessage: string;
  storedFidelity?: VoiceFidelity;
}): VoiceFidelity {
  const detected = detectVoiceFidelityFromMessage(params.userMessage);
  return detected ?? params.storedFidelity ?? "balanced";
}
