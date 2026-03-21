import type { FormatIntent } from "../contracts/chat.ts";
import { inferFormatIntent } from "../core/conversationHeuristics.ts";

export type CoachAlignmentMode = "skip" | "high_threshold" | "standard";

export interface DraftRequestPolicy {
  formatIntent: FormatIntent;
  allowHumorFabrication: boolean;
  preserveStoryPlaceholders: boolean;
  coachAlignmentMode: CoachAlignmentMode;
  explicitStrategyAdviceRequested: boolean;
}

export function requestsStrategicPerformanceAdvice(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return [
    "will this perform",
    "will this do well",
    "will this hurt engagement",
    "should i post this",
    "what do you think will perform",
    "is this on niche",
    "is this off niche",
    "is this off-niche",
    "strategic advice",
    "performance advice",
    "audience alignment",
    "engagement advice",
  ].some((cue) => normalized.includes(cue));
}

export function buildDraftRequestPolicy(args: {
  userMessage: string;
  formatIntent?: FormatIntent | null;
}): DraftRequestPolicy {
  const formatIntent = args.formatIntent || inferFormatIntent(args.userMessage);
  const explicitStrategyAdviceRequested = requestsStrategicPerformanceAdvice(
    args.userMessage,
  );

  let coachAlignmentMode: CoachAlignmentMode = "standard";
  if (formatIntent === "joke" && !explicitStrategyAdviceRequested) {
    coachAlignmentMode = "skip";
  } else if (formatIntent === "observation") {
    coachAlignmentMode = "high_threshold";
  }

  return {
    formatIntent,
    allowHumorFabrication: formatIntent === "joke",
    preserveStoryPlaceholders: formatIntent === "story",
    coachAlignmentMode,
    explicitStrategyAdviceRequested,
  };
}
