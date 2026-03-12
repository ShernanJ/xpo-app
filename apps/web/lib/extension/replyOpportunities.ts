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

export interface ReplyOutcomeBucket extends ReplyInsightsBucket {
  totalProfileClicks: number;
  totalFollowerDelta: number;
  averageProfileClicks: number | null;
  averageFollowerDelta: number | null;
  recentObservedCount?: number;
  recencyWeightedProfileClicks?: number | null;
  recencyWeightedFollowerDelta?: number | null;
  recencyWeightedOutcomeScore?: number | null;
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
  topIntentLabels: ReplyOutcomeBucket[];
  topIntentAnchors: ReplyOutcomeBucket[];
  topIntentRationales: ReplyOutcomeBucket[];
  intentAttribution: {
    generatedIntentCount: number;
    copiedIntentCount: number;
    observedOutcomeCount: number;
    fullyAttributedOutcomeCount: number;
  };
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

function isJsonArray(
  value: Prisma.JsonValue | null | undefined,
): value is Prisma.JsonArray {
  return Array.isArray(value);
}

function getReplyAnalytics(record: ReplyOpportunityRecord): Prisma.JsonObject | null {
  if (!isJsonObject(record.notes)) {
    return null;
  }

  const analytics = record.notes.analytics;
  return isJsonObject(analytics) ? analytics : null;
}

function getFollowConversionOutcome(record: ReplyOpportunityRecord): {
  intentLabel: string | null;
  intentAnchor: string | null;
  intentRationale: string | null;
  profileClicks: number;
  followerDelta: number;
  observedAt: Date | null;
} | null {
  const analytics = getReplyAnalytics(record);
  if (!analytics) {
    return null;
  }

  const outcome = analytics.followConversionOutcome;
  if (!isJsonObject(outcome)) {
    return null;
  }

  const metrics = isJsonObject(outcome.metrics) ? outcome.metrics : null;
  if (!metrics) {
    return null;
  }

  return {
    intentLabel: typeof outcome.intentLabel === "string" ? outcome.intentLabel.trim() || null : null,
    intentAnchor:
      typeof outcome.intentAnchor === "string" ? outcome.intentAnchor.trim() || null : null,
    intentRationale:
      typeof outcome.intentRationale === "string" ? outcome.intentRationale.trim() || null : null,
    profileClicks: asNumber(metrics.profileClicks ?? metrics.profile_clicks) || 0,
    followerDelta: asNumber(metrics.followerDelta ?? metrics.follower_delta) || 0,
    observedAt:
      typeof outcome.observedAtIso === "string" && Number.isFinite(Date.parse(outcome.observedAtIso))
        ? new Date(outcome.observedAtIso)
        : null,
  };
}

function getIntentEntries(record: ReplyOpportunityRecord): Array<{
  label: string;
  strategyPillar: string;
  anchor: string;
  rationale: string;
}> {
  const analytics = getReplyAnalytics(record);
  if (!analytics) {
    return [];
  }

  const next: Array<{
    label: string;
    strategyPillar: string;
    anchor: string;
    rationale: string;
  }> = [];

  const generatedReplyIntents = analytics.generatedReplyIntents;
  if (isJsonArray(generatedReplyIntents)) {
    for (const entry of generatedReplyIntents) {
      if (!isJsonObject(entry)) {
        continue;
      }
      const label = typeof entry.label === "string" ? entry.label.trim() : "";
      const strategyPillar =
        typeof entry.strategyPillar === "string" ? entry.strategyPillar.trim() : "";
      const anchor = typeof entry.anchor === "string" ? entry.anchor.trim() : "";
      const rationale = typeof entry.rationale === "string" ? entry.rationale.trim() : "";
      if (!label || !strategyPillar || !anchor || !rationale) {
        continue;
      }
      next.push({ label, strategyPillar, anchor, rationale });
    }
  }

  const copiedReplyIntent = analytics.copiedReplyIntent;
  if (isJsonObject(copiedReplyIntent)) {
    const label = typeof copiedReplyIntent.label === "string" ? copiedReplyIntent.label.trim() : "";
    const strategyPillar =
      typeof copiedReplyIntent.strategyPillar === "string"
        ? copiedReplyIntent.strategyPillar.trim()
        : "";
    const anchor = typeof copiedReplyIntent.anchor === "string" ? copiedReplyIntent.anchor.trim() : "";
    const rationale =
      typeof copiedReplyIntent.rationale === "string" ? copiedReplyIntent.rationale.trim() : "";
    if (label && strategyPillar && anchor && rationale) {
      return [{ label, strategyPillar, anchor, rationale }];
    }
  }

  return next;
}

function getObservedOutcome(item: ReplyOpportunityRecord): {
  profileClicks: number;
  followerDelta: number;
  observedAt: Date | null;
} {
  const attributedOutcome = getFollowConversionOutcome(item);
  if (attributedOutcome) {
    return {
      profileClicks: attributedOutcome.profileClicks,
      followerDelta: attributedOutcome.followerDelta,
      observedAt: attributedOutcome.observedAt,
    };
  }

  const metrics = isJsonObject(item.observedMetrics) ? item.observedMetrics : null;
  if (!metrics) {
    return {
      profileClicks: 0,
      followerDelta: 0,
      observedAt: item.observedAt || null,
    };
  }

  return {
    profileClicks: asNumber(metrics.profileClicks ?? metrics.profile_clicks) || 0,
    followerDelta: asNumber(metrics.followerDelta ?? metrics.follower_delta) || 0,
    observedAt: item.observedAt || null,
  };
}

function computeRecencyWeight(observedAt: Date | null, now: Date): number {
  if (!observedAt) {
    return 0;
  }

  const ageDays = (now.getTime() - observedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (!Number.isFinite(ageDays) || ageDays < 0) {
    return 1;
  }
  if (ageDays <= 7) {
    return 1;
  }
  if (ageDays <= 21) {
    return 0.8;
  }
  if (ageDays <= 45) {
    return 0.55;
  }
  if (ageDays <= 90) {
    return 0.3;
  }
  return 0.15;
}

function getObservedIntentEntries(record: ReplyOpportunityRecord): Array<{
  label: string;
  anchor: string;
  rationale: string;
}> {
  const attributedOutcome = getFollowConversionOutcome(record);
  if (
    attributedOutcome?.intentLabel &&
    attributedOutcome.intentAnchor &&
    attributedOutcome.intentRationale
  ) {
    return [
      {
        label: attributedOutcome.intentLabel,
        anchor: attributedOutcome.intentAnchor,
        rationale: attributedOutcome.intentRationale,
      },
    ];
  }

  return getIntentEntries(record).map((entry) => ({
    label: entry.label,
    anchor: entry.anchor,
    rationale: entry.rationale,
  }));
}

function createBucketMap(
  items: ReplyOpportunityRecord[],
  selector: (item: ReplyOpportunityRecord) => string | string[] | null,
): ReplyInsightsBucket[] {
  const buckets = new Map<
    string,
    Omit<ReplyInsightsBucket, "selectionRate" | "postedRate">
  >();

  for (const item of items) {
    const selected = selector(item);
    const labels = Array.isArray(selected)
      ? selected.map((entry) => entry.trim()).filter(Boolean)
      : typeof selected === "string"
        ? [selected.trim()].filter(Boolean)
        : [];
    if (labels.length === 0) {
      continue;
    }

    for (const label of [...new Set(labels)]) {
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

function createOutcomeBucketMap(
  items: ReplyOpportunityRecord[],
  selector: (item: ReplyOpportunityRecord) => string | string[] | null,
): ReplyOutcomeBucket[] {
  const now = new Date();
  type OutcomeBucketAccumulator = {
    label: string;
    generatedCount: number;
    selectedCount: number;
    postedCount: number;
    observedCount: number;
    recentObservedCount: number;
    totalProfileClicks: number;
    totalFollowerDelta: number;
    recencyWeightedProfileClicks: number;
    recencyWeightedFollowerDelta: number;
    recencyWeightedOutcomeScore: number;
  };
  const buckets = new Map<
    string,
    OutcomeBucketAccumulator
  >();

  for (const item of items) {
    const selected = selector(item);
    const labels = Array.isArray(selected)
      ? selected.map((entry) => entry.trim()).filter(Boolean)
      : typeof selected === "string"
        ? [selected.trim()].filter(Boolean)
        : [];
    if (labels.length === 0) {
      continue;
    }

    const observedOutcome = getObservedOutcome(item);
    for (const label of [...new Set(labels)]) {
      const current = buckets.get(label) || {
        label,
        generatedCount: 0,
        selectedCount: 0,
        postedCount: 0,
        observedCount: 0,
        recentObservedCount: 0,
        totalProfileClicks: 0,
        totalFollowerDelta: 0,
        recencyWeightedProfileClicks: 0,
        recencyWeightedFollowerDelta: 0,
        recencyWeightedOutcomeScore: 0,
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
        current.totalProfileClicks += observedOutcome.profileClicks;
        current.totalFollowerDelta += observedOutcome.followerDelta;
        const recencyWeight = computeRecencyWeight(observedOutcome.observedAt, now);
        current.recencyWeightedProfileClicks += observedOutcome.profileClicks * recencyWeight;
        current.recencyWeightedFollowerDelta += observedOutcome.followerDelta * recencyWeight;
        current.recencyWeightedOutcomeScore +=
          observedOutcome.profileClicks * recencyWeight +
          observedOutcome.followerDelta * 3 * recencyWeight;
        if (recencyWeight >= 0.8) {
          current.recentObservedCount += 1;
        }
      }

      buckets.set(label, current);
    }
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
      averageProfileClicks:
        bucket.observedCount > 0
          ? Number((bucket.totalProfileClicks / bucket.observedCount).toFixed(2))
          : null,
      averageFollowerDelta:
        bucket.observedCount > 0
          ? Number((bucket.totalFollowerDelta / bucket.observedCount).toFixed(2))
          : null,
      recentObservedCount: bucket.recentObservedCount,
      recencyWeightedProfileClicks:
        bucket.observedCount > 0
          ? Number(bucket.recencyWeightedProfileClicks.toFixed(2))
          : null,
      recencyWeightedFollowerDelta:
        bucket.observedCount > 0
          ? Number(bucket.recencyWeightedFollowerDelta.toFixed(2))
          : null,
      recencyWeightedOutcomeScore:
        bucket.observedCount > 0
          ? Number(bucket.recencyWeightedOutcomeScore.toFixed(2))
          : null,
    }))
    .sort((left, right) => {
      const weightedOutcome =
        (right.recencyWeightedOutcomeScore || 0) - (left.recencyWeightedOutcomeScore || 0);
      if (weightedOutcome !== 0) {
        return weightedOutcome;
      }

      const followerDelta = right.totalFollowerDelta - left.totalFollowerDelta;
      if (followerDelta !== 0) {
        return followerDelta;
      }

      const profileClicks = right.totalProfileClicks - left.totalProfileClicks;
      if (profileClicks !== 0) {
        return profileClicks;
      }

      const postedDelta = right.postedCount - left.postedCount;
      if (postedDelta !== 0) {
        return postedDelta;
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
  const topIntentLabels = createOutcomeBucketMap(items, (item) =>
    getObservedIntentEntries(item).map((entry) => entry.label),
  );
  const topIntentAnchors = createOutcomeBucketMap(items, (item) =>
    getObservedIntentEntries(item).map((entry) => entry.anchor),
  );
  const topIntentRationales = createOutcomeBucketMap(items, (item) =>
    getObservedIntentEntries(item).map((entry) => entry.rationale),
  );
  const intentAttribution = {
    generatedIntentCount: items.filter((item) => getIntentEntries(item).length > 0).length,
    copiedIntentCount: items.filter((item) => {
      const analytics = getReplyAnalytics(item);
      return Boolean(analytics && isJsonObject(analytics.copiedReplyIntent));
    }).length,
    observedOutcomeCount: items.filter((item) => getFollowConversionOutcome(item) !== null).length,
    fullyAttributedOutcomeCount: items.filter((item) => {
      const outcome = getFollowConversionOutcome(item);
      return Boolean(outcome?.intentLabel && outcome.intentAnchor && outcome.intentRationale);
    }).length,
  };
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

  if (topIntentAnchors[0]?.selectionRate && topIntentAnchors[0].selectionRate >= 0.4) {
    bestSignals.push(
      `Replies using the intent anchor "${topIntentAnchors[0].label}" are earning the strongest selection rate so far.`,
    );
  }

  if (topIntentLabels[0]?.postedCount && topIntentLabels[0].postedCount > 0) {
    bestSignals.push(
      `${topIntentLabels[0].label} is the intent label most likely to make it to posting.`,
    );
  }

  if (topIntentAnchors[0]?.totalProfileClicks && topIntentAnchors[0].totalProfileClicks > 0) {
    bestSignals.push(
      `The intent anchor "${topIntentAnchors[0].label}" has driven ${topIntentAnchors[0].totalProfileClicks} profile-click events so far.`,
    );
  }

  if (topIntentLabels[0]?.totalFollowerDelta && topIntentLabels[0].totalFollowerDelta > 0) {
    bestSignals.push(
      `${topIntentLabels[0].label} has the strongest observed follower delta so far (${topIntentLabels[0].totalFollowerDelta}).`,
    );
  }

  if (intentAttribution.fullyAttributedOutcomeCount > 0) {
    bestSignals.push(
      `${intentAttribution.fullyAttributedOutcomeCount} observed reply outcomes are now fully attributed from generated intent through conversion result.`,
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

  if (observedCount > 0 && intentAttribution.fullyAttributedOutcomeCount === 0) {
    unknowns.push("Observed reply outcomes exist, but they are not yet tied to a full intent attribution chain.");
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
    topIntentLabels,
    topIntentAnchors,
    topIntentRationales,
    intentAttribution,
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

  if (args.replyInsights.topIntentAnchors[0]) {
    reinforce.push(
      `Keep using the reply anchor "${args.replyInsights.topIntentAnchors[0].label}" because it is earning the best downstream action so far.`,
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

  if (args.replyInsights.topIntentLabels[0]) {
    experiments.push(
      `Test more ${args.replyInsights.topIntentLabels[0].label} reply intents against ${args.replyInsights.topPillars[0]?.label || args.strategySnapshot.contentPillars[0] || "the top pillar"}.`,
    );
  }

  if ((args.replyInsights.topIntentAnchors[0]?.totalProfileClicks || 0) > 0) {
    notes.push(
      `The leading reply intent anchor has produced ${args.replyInsights.topIntentAnchors[0]?.totalProfileClicks} profile-click events so far.`,
    );
  }

  if ((args.replyInsights.topIntentLabels[0]?.totalFollowerDelta || 0) > 0) {
    notes.push(
      `The leading reply intent label has produced ${args.replyInsights.topIntentLabels[0]?.totalFollowerDelta} follower delta so far.`,
    );
  }

  if (args.replyInsights.intentAttribution.fullyAttributedOutcomeCount > 0) {
    notes.push(
      `${args.replyInsights.intentAttribution.fullyAttributedOutcomeCount} reply outcomes are fully attributed across generated intent, copied reply, and observed conversion.`,
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
