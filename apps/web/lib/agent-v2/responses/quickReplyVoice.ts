import type { VoiceStyleCard } from "../core/styleProfile";

export interface QuickReplyVoiceProfile {
  lowercase: boolean;
  concise: boolean;
}

function inferLowercasePreference(styleCard: VoiceStyleCard | null): boolean {
  if (!styleCard) {
    return false;
  }

  const explicitCasing = styleCard.userPreferences?.casing;
  if (explicitCasing === "lowercase") {
    return true;
  }
  if (explicitCasing === "normal" || explicitCasing === "uppercase") {
    return false;
  }

  const signals = [
    ...(styleCard.formattingRules || []),
    ...(styleCard.customGuidelines || []),
  ]
    .join(" ")
    .toLowerCase();

  return (
    signals.includes("all lowercase") ||
    signals.includes("always lowercase") ||
    signals.includes("never uses capitalization") ||
    signals.includes("no uppercase")
  );
}

function inferConcisePreference(styleCard: VoiceStyleCard | null): boolean {
  const pacing = styleCard?.pacing?.toLowerCase() || "";
  const guidance = (styleCard?.customGuidelines || []).join(" ").toLowerCase();
  const writingGoal = styleCard?.userPreferences?.writingGoal;

  return (
    writingGoal === "growth_first" ||
    pacing.includes("short") ||
    pacing.includes("punchy") ||
    pacing.includes("bullet") ||
    pacing.includes("scan") ||
    guidance.includes("blunt") ||
    guidance.includes("direct") ||
    guidance.includes("tight")
  );
}

export function resolveQuickReplyVoiceProfile(
  styleCard: VoiceStyleCard | null,
): QuickReplyVoiceProfile {
  return {
    lowercase: inferLowercasePreference(styleCard),
    concise: inferConcisePreference(styleCard),
  };
}

export function applyQuickReplyVoiceCase(value: string, voice: QuickReplyVoiceProfile): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!voice.lowercase) {
    return normalized;
  }

  return normalized.toLowerCase();
}

function titleCaseLabel(value: string): string {
  return value.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

export function normalizeQuickReplyLabel(
  value: string,
  voice: QuickReplyVoiceProfile,
): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const base = voice.lowercase ? trimmed.toLowerCase() : titleCaseLabel(trimmed);
  return base.length > 30 ? `${base.slice(0, 27).trimEnd()}...` : base;
}
