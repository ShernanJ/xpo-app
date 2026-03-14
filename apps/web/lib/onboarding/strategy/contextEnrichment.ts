import {
  buildStrategyAdjustments,
  getReplyInsightsForUser,
  type ReplyInsights,
  type StrategyAdjustments,
} from "../../extension/replyOpportunities.ts";
import {
  buildContentAdjustments,
  getContentInsightsForUser,
  type ContentAdjustments,
  type ContentInsights,
} from "../analysis/contentInsights.ts";
import {
  buildOperatingQueue,
  type OperatingQueueItem,
} from "../operatingQueue.ts";
import {
  buildProfileConversionAudit,
  type ProfileConversionAudit,
} from "../profile/profileConversionAudit.ts";
import type { CreatorAgentContext } from "./agentContext.ts";
import type { OnboardingResult } from "../types.ts";

export interface GrowthOperatingSystemPayload {
  replyInsights: ReplyInsights;
  strategyAdjustments: StrategyAdjustments;
  profileConversionAudit: ProfileConversionAudit;
  contentInsights: ContentInsights;
  contentAdjustments: ContentAdjustments;
  operatingQueue: OperatingQueueItem[];
  unknowns: string[];
}

export async function buildGrowthOperatingSystemPayload(args: {
  userId: string;
  xHandle?: string | null;
  onboarding: OnboardingResult;
  context: CreatorAgentContext;
}): Promise<GrowthOperatingSystemPayload> {
  const replyInsights = await getReplyInsightsForUser({
    userId: args.userId,
    xHandle: args.xHandle,
  });
  const strategyAdjustments = buildStrategyAdjustments({
    strategySnapshot: args.context.growthStrategySnapshot,
    replyInsights,
  });
  const contentInsights = await getContentInsightsForUser({
    userId: args.userId,
    xHandle: args.xHandle,
  });
  const contentAdjustments = buildContentAdjustments({
    strategySnapshot: args.context.growthStrategySnapshot,
    contentInsights,
  });
  const profileConversionAudit = buildProfileConversionAudit({
    onboarding: args.onboarding,
    context: args.context,
  });
  const operatingQueue = buildOperatingQueue({
    context: args.context,
    profileConversionAudit,
    replyInsights,
    strategyAdjustments,
    contentInsights,
    contentAdjustments,
  });

  return {
    replyInsights,
    strategyAdjustments,
    profileConversionAudit,
    contentInsights,
    contentAdjustments,
    operatingQueue,
    unknowns: Array.from(
      new Set([
        ...args.context.unknowns,
        ...replyInsights.unknowns,
        ...strategyAdjustments.unknowns,
        ...profileConversionAudit.unknowns,
        ...contentInsights.unknowns,
        ...contentAdjustments.unknowns,
      ]),
    ).slice(0, 12),
  };
}
