import type {
  DraftFormatPreference,
  DraftPreference,
  StrategyPlan,
} from "../contracts/chat";
import type {
  DraftGroundingMode,
  ThreadFramingStyle,
} from "../../onboarding/shared/draftArtifacts.ts";
import {
  inferExplicitDraftFormatPreference,
} from "../core/conversationHeuristics";
import {
  inferThreadFramingStyleFromPosts,
  inferThreadFramingStyleFromPrompt,
  resolveThreadFramingStyle,
} from "../../onboarding/draftArtifacts";
import type { GroundingPacketSourceMaterial } from "../grounding/groundingPacket.ts";

export function buildDraftGroundingSummary(args: {
  groundingSources: GroundingPacketSourceMaterial[];
  hasCurrentChatGrounding: boolean;
  usesSafeFramework: boolean;
}): {
  groundingMode: DraftGroundingMode | null;
  groundingExplanation: string | null;
} {
  if (args.groundingSources.length > 0 && args.hasCurrentChatGrounding) {
    return {
      groundingMode: "mixed",
      groundingExplanation:
        "Built from your saved stories and proof, plus the facts you shared in this chat.",
    };
  }

  if (args.groundingSources.length > 0) {
    return {
      groundingMode: "saved_sources",
      groundingExplanation:
        "Built from saved stories and proof you've already taught Xpo to reuse.",
    };
  }

  if (args.usesSafeFramework) {
    return {
      groundingMode: "safe_framework",
      groundingExplanation:
        "Kept in safe framework mode because there wasn't enough grounded personal proof to make a first-person claim yet.",
    };
  }

  if (args.hasCurrentChatGrounding) {
    return {
      groundingMode: "current_chat",
      groundingExplanation: "Built from details you shared in this chat.",
    };
  }

  return {
    groundingMode: null,
    groundingExplanation: null,
  };
}

export function inferDraftPreference(
  message: string,
  fallback: DraftPreference = "balanced",
): DraftPreference {
  const normalized = message.trim().toLowerCase();

  const voiceFirst = [
    "in my voice",
    "my voice",
    "sound like me",
    "sounds like me",
    "keep it natural",
    "natural, not growth-hacky",
    "not growth-hacky",
    "not growth hacky",
    "not too growthy",
    "less growthy",
    "less optimized",
    "more natural",
    "more casual",
    "more like me",
  ].some((cue) => normalized.includes(cue));

  if (voiceFirst) {
    return "voice_first";
  }

  const growthFirst = [
    "optimized for growth",
    "optimize it for growth",
    "optimize for growth",
    "for growth and reach",
    "for growth",
    "for reach",
    "for engagement",
    "for impressions",
    "more viral",
    "make it punchier",
    "stronger hook",
    "growth-focused",
  ].some((cue) => normalized.includes(cue));

  if (growthFirst) {
    return "growth_first";
  }

  return fallback;
}

export function inferDraftFormatPreference(
  message: string,
  fallback: DraftFormatPreference = "shortform",
  explicitFormatPreference?: DraftFormatPreference | null,
): DraftFormatPreference {
  if (explicitFormatPreference) {
    return explicitFormatPreference;
  }

  return inferExplicitDraftFormatPreference(message) || fallback;
}

export function resolveRequestedThreadFramingStyle(args: {
  userMessage: string;
  activeDraft?: string;
  formatPreference: DraftFormatPreference;
  explicitThreadFramingStyle?: ThreadFramingStyle | null;
}): ThreadFramingStyle | null {
  if (args.formatPreference !== "thread") {
    return null;
  }

  const explicitStyle = resolveThreadFramingStyle(args.explicitThreadFramingStyle);
  if (explicitStyle) {
    return explicitStyle;
  }

  const requestedStyle = inferThreadFramingStyleFromPrompt(args.userMessage);
  if (requestedStyle) {
    return requestedStyle;
  }

  if (args.activeDraft) {
    return inferThreadFramingStyleFromPosts(
      args.activeDraft
        .split(/\n\s*---\s*\n/g)
        .map((post) => post.trim())
        .filter(Boolean),
    );
  }

  return "soft_signal";
}

export function withPlanPreferences(
  plan: StrategyPlan,
  draftPreference: DraftPreference,
  formatPreference: DraftFormatPreference,
): StrategyPlan {
  const nextPlan = { ...plan, formatPreference };

  if (draftPreference === "balanced") {
    delete nextPlan.deliveryPreference;
  } else {
    nextPlan.deliveryPreference = draftPreference;
  }

  return nextPlan;
}
