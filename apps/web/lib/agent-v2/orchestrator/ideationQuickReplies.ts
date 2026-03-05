import type { VoiceStyleCard } from "../core/styleProfile";
import type { CreatorChatQuickReply } from "../contracts/chat";

interface BuildIdeationQuickRepliesArgs {
  styleCard: VoiceStyleCard | null;
  seedTopic?: string | null;
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

function applyVoiceCase(value: string, lowercase: boolean): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!lowercase) {
    return normalized;
  }

  return normalized.toLowerCase();
}

function titleCaseLabel(value: string): string {
  return value.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function normalizeLabel(value: string, lowercase: boolean): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const base = lowercase ? trimmed.toLowerCase() : titleCaseLabel(trimmed);
  return base.length > 30 ? `${base.slice(0, 27).trimEnd()}...` : base;
}

function compactTopicLabel(value: string | null | undefined): string | null {
  const cleaned = (value || "")
    .trim()
    .replace(/^[@#]+/, "")
    .replace(/[.?!,]+$/, "")
    .replace(/\s+/g, " ");

  if (!cleaned) {
    return null;
  }

  const reduced =
    cleaned.split(/\b(?:while|because|but|so|and|with)\b/i)[0].trim() || cleaned;
  const words = reduced.split(/\s+/);
  const compact = words.length > 5 ? words.slice(0, 5).join(" ") : reduced;
  return compact.length > 34 ? `${compact.slice(0, 31).trimEnd()}...` : compact;
}

export function buildIdeationQuickReplies(
  args: BuildIdeationQuickRepliesArgs,
): CreatorChatQuickReply[] {
  const lowercase = inferLowercasePreference(args.styleCard);
  const concise = inferConcisePreference(args.styleCard);
  const topicLabel = compactTopicLabel(args.seedTopic);

  const sameLaneValue = topicLabel
    ? `give me more ideas in this same lane (${topicLabel}). keep them fresh and avoid repeating the exact same angles.`
    : "give me more ideas in this same lane. keep them fresh and avoid repeating the exact same angles.";
  const changeDirectionValue = topicLabel
    ? `change it up. keep the broad topic (${topicLabel}), but shift to a different direction and new tension.`
    : "change it up and take it in a different direction.";

  return [
    {
      kind: "clarification_choice",
      value: applyVoiceCase(sameLaneValue, lowercase),
      label: normalizeLabel(
        concise ? "more like this" : "more ideas like this",
        lowercase,
      ),
      explicitIntent: "ideate",
    },
    {
      kind: "clarification_choice",
      value: applyVoiceCase(changeDirectionValue, lowercase),
      label: normalizeLabel(
        concise ? "change it up" : "switch direction",
        lowercase,
      ),
      explicitIntent: "ideate",
    },
  ];
}
