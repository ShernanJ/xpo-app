import type { UserPreferences } from "../core/styleProfile";

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  casing: "auto",
  bulletStyle: "auto",
  emojiUsage: "auto",
  profanity: "auto",
  blacklist: [],
  writingGoal: "balanced",
  verifiedMaxChars: null,
};

export function normalizeUserPreferences(
  value: Partial<UserPreferences> | null | undefined,
): UserPreferences {
  const nextBlacklist = Array.isArray(value?.blacklist)
    ? value.blacklist
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 24)
    : [];

  return {
    casing:
      value?.casing === "auto" ||
      value?.casing === "normal" ||
      value?.casing === "lowercase" ||
      value?.casing === "uppercase"
        ? value.casing
        : DEFAULT_USER_PREFERENCES.casing,
    bulletStyle:
      value?.bulletStyle === "auto" ||
      value?.bulletStyle === "dash" ||
      value?.bulletStyle === "angle"
        ? value.bulletStyle
        : DEFAULT_USER_PREFERENCES.bulletStyle,
    emojiUsage:
      value?.emojiUsage === "auto" ||
      value?.emojiUsage === "on" ||
      value?.emojiUsage === "off"
        ? value.emojiUsage
        : DEFAULT_USER_PREFERENCES.emojiUsage,
    profanity:
      value?.profanity === "auto" ||
      value?.profanity === "on" ||
      value?.profanity === "off"
        ? value.profanity
        : DEFAULT_USER_PREFERENCES.profanity,
    blacklist: nextBlacklist,
    writingGoal:
      value?.writingGoal === "voice_first" ||
      value?.writingGoal === "balanced" ||
      value?.writingGoal === "growth_first"
        ? value.writingGoal
        : DEFAULT_USER_PREFERENCES.writingGoal,
    verifiedMaxChars:
      typeof value?.verifiedMaxChars === "number" &&
      Number.isFinite(value.verifiedMaxChars) &&
      value.verifiedMaxChars >= 250 &&
      value.verifiedMaxChars <= 25000
        ? Math.round(value.verifiedMaxChars)
        : DEFAULT_USER_PREFERENCES.verifiedMaxChars,
  };
}

export function mergeUserPreferences(
  base: Partial<UserPreferences> | null | undefined,
  overrides: Partial<UserPreferences> | null | undefined,
): UserPreferences {
  const normalizedBase = normalizeUserPreferences(base);
  if (!overrides || typeof overrides !== "object") {
    return normalizedBase;
  }

  const nextBlacklist = Object.prototype.hasOwnProperty.call(overrides, "blacklist")
    ? Array.isArray(overrides.blacklist)
      ? overrides.blacklist
      : []
    : normalizedBase.blacklist;

  const hasVerifiedMaxChars = Object.prototype.hasOwnProperty.call(overrides, "verifiedMaxChars");

  return normalizeUserPreferences({
    casing:
      overrides.casing === "auto" ||
      overrides.casing === "normal" ||
      overrides.casing === "lowercase" ||
      overrides.casing === "uppercase"
        ? overrides.casing
        : normalizedBase.casing,
    bulletStyle:
      overrides.bulletStyle === "auto" ||
      overrides.bulletStyle === "dash" ||
      overrides.bulletStyle === "angle"
        ? overrides.bulletStyle
        : normalizedBase.bulletStyle,
    emojiUsage:
      overrides.emojiUsage === "auto" ||
      overrides.emojiUsage === "on" ||
      overrides.emojiUsage === "off"
        ? overrides.emojiUsage
        : normalizedBase.emojiUsage,
    profanity:
      overrides.profanity === "auto" ||
      overrides.profanity === "on" ||
      overrides.profanity === "off"
        ? overrides.profanity
        : normalizedBase.profanity,
    blacklist: nextBlacklist,
    writingGoal:
      overrides.writingGoal === "voice_first" ||
      overrides.writingGoal === "balanced" ||
      overrides.writingGoal === "growth_first"
        ? overrides.writingGoal
        : normalizedBase.writingGoal,
    verifiedMaxChars: hasVerifiedMaxChars
      ? overrides.verifiedMaxChars ?? null
      : normalizedBase.verifiedMaxChars,
  });
}

export function buildPreferenceConstraintsFromPreferences(
  preferences: UserPreferences,
  options?: {
    isVerifiedAccount?: boolean;
  },
): string[] {
  const nextConstraints: string[] = [];
  const isVerifiedAccount = Boolean(options?.isVerifiedAccount);

  switch (preferences.casing) {
    case "normal":
      nextConstraints.push("Use normal capitalization.");
      break;
    case "lowercase":
      nextConstraints.push("Write in all lowercase.");
      break;
    case "uppercase":
      nextConstraints.push("Write in uppercase.");
      break;
    default:
      break;
  }

  switch (preferences.bulletStyle) {
    case "dash":
      nextConstraints.push('When using lists, use "-" as the list marker.');
      break;
    case "angle":
      nextConstraints.push('When using lists, use ">" as the list marker.');
      break;
    default:
      break;
  }

  switch (preferences.writingGoal) {
    case "voice_first":
      nextConstraints.push(
        "Prioritize sounding closest to how I would organically post over growth optimization.",
      );
      break;
    case "growth_first":
      nextConstraints.push(
        "Optimize for growth while staying recognizably in my voice.",
      );
      break;
    default:
      nextConstraints.push(
        "Keep a balance between sounding like me and optimizing for growth.",
      );
      break;
  }

  if (preferences.emojiUsage === "on") {
    nextConstraints.push("Emojis are allowed, but keep them light and intentional.");
  } else if (preferences.emojiUsage === "off") {
    nextConstraints.push("Do not use emojis.");
  }

  if (preferences.profanity === "on") {
    nextConstraints.push("Profanity is allowed if it fits the voice.");
  } else if (preferences.profanity === "off") {
    nextConstraints.push("Avoid profanity.");
  }

  if (preferences.blacklist.length > 0) {
    nextConstraints.push(
      `Never use these words or emojis: ${preferences.blacklist.join(", ")}.`,
    );
  }

  if (isVerifiedAccount && preferences.verifiedMaxChars) {
    nextConstraints.push(
      `Prefer staying under ${preferences.verifiedMaxChars.toLocaleString()} characters unless the user explicitly asks for longer.`,
    );
  }

  return nextConstraints;
}
