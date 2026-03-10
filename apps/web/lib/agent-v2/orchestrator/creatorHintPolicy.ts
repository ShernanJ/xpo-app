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

  return nextPlan;
}
