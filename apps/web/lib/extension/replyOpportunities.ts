import {
  Prisma,
  ReplyOpportunityState,
  type ReplyOpportunity,
} from "../generated/prisma/client.ts";
import type { ReplyOpportunityLifecycleEvent } from "./types";
import type { GrowthStrategySnapshot } from "../onboarding/growthStrategy.ts";

export interface ReplyOpportunityLifecycleInput {
  userId: string;
  xHandle?: string | null;
  tweetId: string;
  tweetText: string;
  authorHandle: string;
  tweetUrl: string;
  stage: string;
  tone: string;
  goal: string;
  eventType: ReplyOpportunityLifecycleEvent;
  heuristicScore?: number | null;
  heuristicTier?: string | null;
  strategyPillar?: string | null;
  generatedAngleLabel?: string | null;
  generatedOptions?: unknown[] | null;
  notes?: string[] | null;
  selectedOptionId?: string | null;
  selectedOptionText?: string | null;
  selectedAngleLabel?: string | null;
  observedMetrics?: Record<string, unknown> | null;
  now?: Date;
}

export interface ReplyInsightsBucket {
  label: string;
  generatedCount: number;
  selectedCount: number;
  postedCount: number;
  observedCount: number;
  selectionRate: number | null;
  postedRate: number | null;
}

export interface ReplyInsights {
  generatedAt: string;
  totalOpportunities: number;
  lifecycleCounts: Record<ReplyOpportunityLifecycleEvent, number>;
  selectionRate: number | null;
  postRate: number | null;
  observedRate: number | null;
  topPillars: ReplyInsightsBucket[];
  topAngleLabels: ReplyInsightsBucket[];
  topGoals: string[];
  outcomeSnapshot: {
    averageLikes: number | null;
    averageReplies: number | null;
    totalProfileClicks: number;
    totalFollowerDelta: number;
  };
  bestSignals: string[];
  cautionSignals: string[];
  unknowns: string[];
}

export interface StrategyAdjustments {
  generatedAt: string;
  reinforce: string[];
  deprioritize: string[];
  experiments: string[];
  notes: string[];
  unknowns: string[];
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value as Prisma.InputJsonValue;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => toJsonValue(entry))
      .filter((entry): entry is Prisma.InputJsonValue => entry !== undefined);
  }

  if (typeof value === "object") {
    const next: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      const normalized = toJsonValue(entry);
      if (normalized !== undefined) {
        next[key] = normalized;
      }
    }
    return next;
  }

  return undefined;
}

function setLifecycleTimestamp(
  update: Prisma.ReplyOpportunityUncheckedCreateInput | Prisma.ReplyOpportunityUncheckedUpdateInput,
  key: ReplyOpportunityLifecycleEvent,
  now: Date,
) {
  const field =
    key === "ranked"
      ? null
      : key === "opened"
      ? "openedAt"
      : key === "generated"
        ? "generatedAt"
        : key === "selected"
          ? "selectedAt"
          : key === "copied"
            ? "copiedAt"
            : key === "posted"
              ? "postedAt"
              : key === "dismissed"
                ? "dismissedAt"
                : "observedAt";

  if (field) {
    update[field] = now;
  }
}

function normalizeHandle(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^@+/, "").toLowerCase() || "";
  return normalized || null;
}

export async function upsertReplyOpportunityLifecycle(
  input: ReplyOpportunityLifecycleInput,
) {
  const { prisma } = await import("../db.ts");
  const now = input.now ?? new Date();
  const xHandle = normalizeHandle(input.xHandle);
  const authorHandle = normalizeHandle(input.authorHandle);

  if (!authorHandle) {
    throw new Error("authorHandle is required for reply opportunity logging.");
  }

  const baseCreate: Prisma.ReplyOpportunityUncheckedCreateInput = {
    userId: input.userId,
    xHandle,
    tweetId: input.tweetId,
    authorHandle,
    tweetText: input.tweetText.trim(),
    tweetUrl: input.tweetUrl.trim(),
    tweetSnapshot:
      (toJsonValue({
        tweetId: input.tweetId,
        tweetText: input.tweetText.trim(),
        tweetUrl: input.tweetUrl.trim(),
        authorHandle,
      }) as Prisma.InputJsonValue | undefined) || {},
    heuristicScore:
      typeof input.heuristicScore === "number" && Number.isFinite(input.heuristicScore)
        ? Math.round(input.heuristicScore)
        : null,
    heuristicTier: input.heuristicTier?.trim() || null,
    stage: input.stage.trim(),
    tone: input.tone.trim(),
    goal: input.goal.trim(),
    strategyPillar: input.strategyPillar?.trim() || null,
    generatedAngleLabel: input.generatedAngleLabel?.trim() || null,
    state: input.eventType as ReplyOpportunityState,
    generatedOptions:
      (toJsonValue(input.generatedOptions || undefined) as Prisma.InputJsonValue | undefined) ??
      Prisma.JsonNull,
    notes:
      (toJsonValue(input.notes || undefined) as Prisma.InputJsonValue | undefined) ??
      Prisma.JsonNull,
    selectedOptionId: input.selectedOptionId?.trim() || null,
    selectedOptionText: input.selectedOptionText?.trim() || null,
    selectedAngleLabel: input.selectedAngleLabel?.trim() || null,
    observedMetrics:
      (toJsonValue(input.observedMetrics || undefined) as Prisma.InputJsonValue | undefined) ??
      Prisma.JsonNull,
  };
  setLifecycleTimestamp(baseCreate, "opened", now);
  if (input.eventType !== "opened") {
    setLifecycleTimestamp(baseCreate, input.eventType, now);
  }

  const update: Prisma.ReplyOpportunityUncheckedUpdateInput = {
    xHandle,
    tweetText: input.tweetText.trim(),
    tweetUrl: input.tweetUrl.trim(),
    authorHandle,
    tweetSnapshot:
      (toJsonValue({
        tweetId: input.tweetId,
        tweetText: input.tweetText.trim(),
        tweetUrl: input.tweetUrl.trim(),
        authorHandle,
      }) as Prisma.InputJsonValue | undefined) || {},
    heuristicScore:
      typeof input.heuristicScore === "number" && Number.isFinite(input.heuristicScore)
        ? Math.round(input.heuristicScore)
        : undefined,
    heuristicTier: input.heuristicTier?.trim() || undefined,
    stage: input.stage.trim(),
    tone: input.tone.trim(),
    goal: input.goal.trim(),
    strategyPillar: input.strategyPillar?.trim() || undefined,
    generatedAngleLabel: input.generatedAngleLabel?.trim() || undefined,
    state: input.eventType as ReplyOpportunityState,
    updatedAt: now,
  };

  if (input.generatedOptions) {
    update.generatedOptions =
      (toJsonValue(input.generatedOptions) as Prisma.InputJsonValue | undefined) || Prisma.JsonNull;
  }

  if (input.notes) {
    update.notes =
      (toJsonValue(input.notes) as Prisma.InputJsonValue | undefined) || Prisma.JsonNull;
  }

  if (input.selectedOptionId !== undefined) {
    update.selectedOptionId = input.selectedOptionId?.trim() || null;
  }

  if (input.selectedOptionText !== undefined) {
    update.selectedOptionText = input.selectedOptionText?.trim() || null;
  }

  if (input.selectedAngleLabel !== undefined) {
    update.selectedAngleLabel = input.selectedAngleLabel?.trim() || null;
  }

  if (input.observedMetrics) {
    update.observedMetrics =
      (toJsonValue(input.observedMetrics) as Prisma.InputJsonValue | undefined) || Prisma.JsonNull;
  }

  setLifecycleTimestamp(update, input.eventType, now);

  return prisma.replyOpportunity.upsert({
    where: {
      userId_tweetId: {
        userId: input.userId,
        tweetId: input.tweetId,
      },
    },
    create: baseCreate,
    update,
  });
}

type ReplyOpportunityRecord = ReplyOpportunity;

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isJsonObject(
  value: Prisma.JsonValue | null | undefined,
): value is Prisma.JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createBucketMap(
  items: ReplyOpportunityRecord[],
  selector: (item: ReplyOpportunityRecord) => string | null,
): ReplyInsightsBucket[] {
  const buckets = new Map<
    string,
    Omit<ReplyInsightsBucket, "selectionRate" | "postedRate">
  >();

  for (const item of items) {
    const label = selector(item)?.trim();
    if (!label) {
      continue;
    }

    const current = buckets.get(label) || {
      label,
      generatedCount: 0,
      selectedCount: 0,
      postedCount: 0,
      observedCount: 0,
    };

    if (item.generatedAt) {
      current.generatedCount += 1;
    }
    if (item.selectedAt) {
      current.selectedCount += 1;
    }
    if (item.postedAt) {
      current.postedCount += 1;
    }
    if (item.observedAt) {
      current.observedCount += 1;
    }

    buckets.set(label, current);
  }

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      selectionRate:
        bucket.generatedCount > 0
          ? Number((bucket.selectedCount / bucket.generatedCount).toFixed(2))
          : null,
      postedRate:
        bucket.generatedCount > 0
          ? Number((bucket.postedCount / bucket.generatedCount).toFixed(2))
          : null,
    }))
    .sort((left, right) => {
      const postedDelta = right.postedCount - left.postedCount;
      if (postedDelta !== 0) {
        return postedDelta;
      }

      const selectedDelta = right.selectedCount - left.selectedCount;
      if (selectedDelta !== 0) {
        return selectedDelta;
      }

      return right.generatedCount - left.generatedCount;
    })
    .slice(0, 5);
}

export async function getReplyInsightsForUser(args: {
  userId: string;
  xHandle?: string | null;
}) {
  const { prisma } = await import("../db.ts");
  const xHandle = normalizeHandle(args.xHandle);
  const items = await prisma.replyOpportunity.findMany({
    where: {
      userId: args.userId,
      ...(xHandle ? { xHandle } : {}),
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return buildReplyInsights(items);
}

export function buildReplyInsights(items: ReplyOpportunityRecord[]): ReplyInsights {
  const lifecycleCounts: Record<ReplyOpportunityLifecycleEvent, number> = {
    ranked: items.filter((item) => item.state === "ranked").length,
    opened: items.filter((item) => Boolean(item.openedAt)).length,
    generated: items.filter((item) => Boolean(item.generatedAt)).length,
    selected: items.filter((item) => Boolean(item.selectedAt)).length,
    copied: items.filter((item) => Boolean(item.copiedAt)).length,
    posted: items.filter((item) => Boolean(item.postedAt)).length,
    dismissed: items.filter((item) => Boolean(item.dismissedAt)).length,
    observed: items.filter((item) => Boolean(item.observedAt)).length,
  };
  const generatedCount = lifecycleCounts.generated;
  const selectedCount = lifecycleCounts.selected;
  const postedCount = lifecycleCounts.posted;
  const observedCount = lifecycleCounts.observed;
  const topPillars = createBucketMap(items, (item) => item.strategyPillar);
  const topAngleLabels = createBucketMap(
    items,
    (item) => item.selectedAngleLabel || item.generatedAngleLabel,
  );
  const topGoals = [...new Set(items.map((item) => item.goal.trim()).filter(Boolean))].slice(0, 4);
  const observedMetrics = items
    .map((item) => (isJsonObject(item.observedMetrics) ? item.observedMetrics : null))
    .filter((item): item is Prisma.JsonObject => Boolean(item));

  const likeValues = observedMetrics
    .map((item) => asNumber(item.likeCount ?? item.likes))
    .filter((value): value is number => value !== null);
  const replyValues = observedMetrics
    .map((item) => asNumber(item.replyCount ?? item.replies))
    .filter((value): value is number => value !== null);
  const totalProfileClicks = observedMetrics.reduce(
    (sum, item) => sum + (asNumber(item.profileClicks ?? item.profile_clicks) || 0),
    0,
  );
  const totalFollowerDelta = observedMetrics.reduce(
    (sum, item) => sum + (asNumber(item.followerDelta ?? item.follower_delta) || 0),
    0,
  );

  const bestSignals: string[] = [];
  const cautionSignals: string[] = [];
  const unknowns: string[] = [];

  const selectionRate =
    generatedCount > 0 ? Number((selectedCount / generatedCount).toFixed(2)) : null;
  const postRate =
    generatedCount > 0 ? Number((postedCount / generatedCount).toFixed(2)) : null;
  const observedRate =
    postedCount > 0 ? Number((observedCount / postedCount).toFixed(2)) : null;

  if (topPillars[0]?.selectionRate && topPillars[0].selectionRate >= 0.4) {
    bestSignals.push(
      `Replies anchored to ${topPillars[0].label} have the strongest selection rate so far.`,
    );
  }

  if (topAngleLabels[0]?.postedCount && topAngleLabels[0].postedCount > 0) {
    bestSignals.push(
      `${topAngleLabels[0].label} is the angle label most likely to make it to posting.`,
    );
  }

  if (selectionRate !== null && selectionRate < 0.25) {
    cautionSignals.push(
      "Most generated replies are still not being selected, which suggests angle fit is too generic.",
    );
  }

  if (postedCount > 0 && observedCount === 0) {
    cautionSignals.push(
      "Replies are getting posted, but observed outcome data is still missing.",
    );
  }

  if (items.length === 0) {
    unknowns.push("No reply opportunities have been logged yet.");
  }

  if (observedMetrics.length === 0) {
    unknowns.push("No observed reply outcomes yet, so conversion learning is still thin.");
  }

  if (totalProfileClicks === 0) {
    unknowns.push("Profile click data is not populated yet.");
  }

  if (totalFollowerDelta === 0) {
    unknowns.push("Follower delta data is still sparse or unavailable.");
  }

  return {
    generatedAt: new Date().toISOString(),
    totalOpportunities: items.length,
    lifecycleCounts,
    selectionRate,
    postRate,
    observedRate,
    topPillars,
    topAngleLabels,
    topGoals,
    outcomeSnapshot: {
      averageLikes:
        likeValues.length > 0
          ? Number(
              (likeValues.reduce((sum, value) => sum + value, 0) / likeValues.length).toFixed(2),
            )
          : null,
      averageReplies:
        replyValues.length > 0
          ? Number(
              (
                replyValues.reduce((sum, value) => sum + value, 0) / replyValues.length
              ).toFixed(2),
            )
          : null,
      totalProfileClicks,
      totalFollowerDelta,
    },
    bestSignals,
    cautionSignals,
    unknowns,
  };
}

export function buildStrategyAdjustments(args: {
  strategySnapshot: GrowthStrategySnapshot;
  replyInsights: ReplyInsights;
}): StrategyAdjustments {
  const reinforce: string[] = [];
  const deprioritize: string[] = [];
  const experiments: string[] = [];
  const notes: string[] = [];

  if (args.replyInsights.topPillars[0]) {
    reinforce.push(
      `Lean harder into ${args.replyInsights.topPillars[0].label} in replies because it is earning the strongest downstream action.`,
    );
  }

  if (
    args.replyInsights.topGoals[0] &&
    (args.replyInsights.selectionRate || 0) > 0
  ) {
    experiments.push(
      `Keep testing ${args.replyInsights.topGoals[0]} replies against ${args.replyInsights.topPillars[0]?.label || args.strategySnapshot.contentPillars[0] || "the top pillar"}.`,
    );
  }

  if ((args.replyInsights.selectionRate || 0) < 0.25) {
    deprioritize.push("Generic agreement replies with no extra layer.");
  }

  if (args.strategySnapshot.offBrandThemes.length > 0) {
    deprioritize.push(...args.strategySnapshot.offBrandThemes.slice(0, 2));
  }

  if (args.replyInsights.outcomeSnapshot.totalProfileClicks > 0) {
    notes.push(
      `Logged replies have produced ${args.replyInsights.outcomeSnapshot.totalProfileClicks} profile-click proxy events so far.`,
    );
  }

  if (args.replyInsights.outcomeSnapshot.totalFollowerDelta > 0) {
    notes.push(
      `Observed follower delta from logged replies is ${args.replyInsights.outcomeSnapshot.totalFollowerDelta}.`,
    );
  }

  if (args.replyInsights.totalOpportunities === 0) {
    notes.push("No reply-loop learning yet, so keep using the base positioning model.");
  }

  return {
    generatedAt: new Date().toISOString(),
    reinforce: [...new Set(reinforce)].slice(0, 3),
    deprioritize: [...new Set(deprioritize)].slice(0, 4),
    experiments: [...new Set(experiments)].slice(0, 3),
    notes: [...new Set(notes)].slice(0, 4),
    unknowns: args.replyInsights.unknowns.slice(0, 5),
  };
}
