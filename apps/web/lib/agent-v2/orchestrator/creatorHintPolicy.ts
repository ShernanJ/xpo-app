import type { DraftFormatPreference, StrategyPlan } from "../contracts/chat.ts";
import type { CreatorProfileHints } from "./groundingPacket.ts";

export function mapPreferredOutputShapeToFormatPreference(
  preferredOutputShape: CreatorProfileHints["preferredOutputShape"] | null | undefined,
): DraftFormatPreference | null {
  switch (preferredOutputShape) {
    case "thread_seed":
      return "thread";
    case "long_form_post":
      return "longform";
    case "short_form_post":
    case "reply_candidate":
    case "quote_candidate":
      return "shortform";
    default:
      return null;
  }
}

export function applyCreatorProfileHintsToPlan(
  plan: StrategyPlan,
  creatorProfileHints: CreatorProfileHints | null | undefined,
): StrategyPlan {
  if (!creatorProfileHints) {
    return plan;
  }

  const nextPlan = { ...plan };
  const preferredHookPattern = creatorProfileHints.preferredHookPatterns[0];
  if (
    preferredHookPattern &&
    (!nextPlan.hookType || /^(direct|general|default)$/i.test(nextPlan.hookType))
  ) {
    nextPlan.hookType = preferredHookPattern.replace(/_/g, " ");
  }

  if (creatorProfileHints.knownFor) {
    nextPlan.mustInclude = [
      ...nextPlan.mustInclude,
      `Keep the account legible around: ${creatorProfileHints.knownFor}`,
    ];
  }

  if (creatorProfileHints.contentPillars?.length) {
    nextPlan.mustInclude = [
      ...nextPlan.mustInclude,
      `Stay inside these recurring pillars when possible: ${creatorProfileHints.contentPillars.slice(0, 3).join(" | ")}`,
    ];
  }

  if (creatorProfileHints.offBrandThemes?.length) {
    nextPlan.mustAvoid = [
      ...nextPlan.mustAvoid,
      ...creatorProfileHints.offBrandThemes
        .slice(0, 2)
        .map((entry) => `Off-brand theme to avoid: ${entry}`),
    ];
  }

  if (creatorProfileHints.learningSignals?.length) {
    nextPlan.mustInclude = [
      ...nextPlan.mustInclude,
      `Use the strongest live learning signals when relevant: ${creatorProfileHints.learningSignals.slice(0, 2).join(" | ")}`,
    ];
  }

  if (creatorProfileHints.ambiguities?.length) {
    nextPlan.mustAvoid = [
      ...nextPlan.mustAvoid,
      "Do not act like the niche is fully settled when positioning is still tentative.",
    ];
  }

  return nextPlan;
}
