import { Prisma, type DraftCandidate } from "../../generated/prisma/client.ts";
import type { GrowthStrategySnapshot } from "../strategy/growthStrategy.ts";

type DraftCandidateStatusKey =
  | "pending"
  | "approved"
  | "rejected"
  | "edited"
  | "posted"
  | "observed";

export interface ContentInsightsBucket {
  label: string;
  totalCount: number;
  postedCount: number;
  observedCount: number;
  postRate: number | null;
  observedRate: number | null;
}

export interface ContentInsights {
  generatedAt: string;
  totalCandidates: number;
  statusCounts: Record<DraftCandidateStatusKey, number>;
  postRate: number | null;
  observedRate: number | null;
  topPlaybooks: ContentInsightsBucket[];
  topOutputShapes: ContentInsightsBucket[];
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

export interface ContentAdjustments {
  generatedAt: string;
  reinforce: string[];
  deprioritize: string[];
  experiments: string[];
  notes: string[];
  unknowns: string[];
}

type DraftCandidateRecord = DraftCandidate;

function normalizeHandle(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^@+/, "").toLowerCase() || "";
  return normalized || null;
}

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
  items: DraftCandidateRecord[],
  selector: (item: DraftCandidateRecord) => string | null,
): ContentInsightsBucket[] {
  const buckets = new Map<string, Omit<ContentInsightsBucket, "postRate" | "observedRate">>();

  for (const item of items) {
    const label = selector(item)?.trim();
    if (!label) {
      continue;
    }

    const current = buckets.get(label) || {
      label,
      totalCount: 0,
      postedCount: 0,
      observedCount: 0,
    };

    current.totalCount += 1;
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
      postRate:
        bucket.totalCount > 0
          ? Number((bucket.postedCount / bucket.totalCount).toFixed(2))
          : null,
      observedRate:
        bucket.postedCount > 0
          ? Number((bucket.observedCount / bucket.postedCount).toFixed(2))
          : null,
    }))
    .sort((left, right) => {
      const postedDelta = right.postedCount - left.postedCount;
      if (postedDelta !== 0) {
        return postedDelta;
      }

      const observedDelta = right.observedCount - left.observedCount;
      if (observedDelta !== 0) {
        return observedDelta;
      }

      return right.totalCount - left.totalCount;
    })
    .slice(0, 5);
}

export async function getContentInsightsForUser(args: {
  userId: string;
  xHandle?: string | null;
}) {
  const { prisma } = await import("../db.ts");
  const xHandle = normalizeHandle(args.xHandle);
  const items = await prisma.draftCandidate.findMany({
    where: {
      userId: args.userId,
      ...(xHandle ? { xHandle } : {}),
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return buildContentInsights(items);
}

export function buildContentInsights(items: DraftCandidateRecord[]): ContentInsights {
  const statusCounts: Record<DraftCandidateStatusKey, number> = {
    pending: items.filter((item) => item.status === "pending").length,
    approved: items.filter((item) => item.status === "approved").length,
    rejected: items.filter((item) => item.status === "rejected").length,
    edited: items.filter((item) => item.status === "edited").length,
    posted: items.filter((item) => item.status === "posted").length,
    observed: items.filter((item) => item.status === "observed").length,
  };
  const postedCount = items.filter((item) => Boolean(item.postedAt)).length;
  const observedCount = items.filter((item) => Boolean(item.observedAt)).length;
  const postRate =
    items.length > 0 ? Number((postedCount / items.length).toFixed(2)) : null;
  const observedRate =
    postedCount > 0 ? Number((observedCount / postedCount).toFixed(2)) : null;
  const topPlaybooks = createBucketMap(items, (item) => item.sourcePlaybook);
  const topOutputShapes = createBucketMap(items, (item) => item.outputShape);
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

  if (topPlaybooks[0]?.postRate && topPlaybooks[0].postRate >= 0.4) {
    bestSignals.push(
      `${topPlaybooks[0].label.replace(/_/g, " ")} is the playbook most likely to get posted.`,
    );
  }

  if (topOutputShapes[0]?.postRate && topOutputShapes[0].postRate >= 0.4) {
    bestSignals.push(
      `${topOutputShapes[0].label.replace(/_/g, " ")} is the output shape users are carrying through to posting.`,
    );
  }

  if ((postRate || 0) < 0.25 && items.length > 0) {
    cautionSignals.push(
      "Most drafted posts are not getting to posted state yet, which suggests draft fit or specificity is still weak.",
    );
  }

  if (postedCount > 0 && observedCount === 0) {
    cautionSignals.push(
      "Posts are getting marked posted, but observed outcome data is still missing.",
    );
  }

  if (items.length === 0) {
    unknowns.push("No draft-candidate learning has been logged yet.");
  }

  if (observedMetrics.length === 0) {
    unknowns.push("No observed post outcomes yet, so content learning is still thin.");
  }

  if (totalProfileClicks === 0) {
    unknowns.push("Profile click data is not populated yet for draft outcomes.");
  }

  if (totalFollowerDelta === 0) {
    unknowns.push("Follower delta data is still sparse or unavailable for draft outcomes.");
  }

  return {
    generatedAt: new Date().toISOString(),
    totalCandidates: items.length,
    statusCounts,
    postRate,
    observedRate,
    topPlaybooks,
    topOutputShapes,
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

export function buildContentAdjustments(args: {
  strategySnapshot: GrowthStrategySnapshot;
  contentInsights: ContentInsights;
}): ContentAdjustments {
  const reinforce: string[] = [];
  const deprioritize: string[] = [];
  const experiments: string[] = [];
  const notes: string[] = [];

  if (args.contentInsights.topPlaybooks[0]) {
    reinforce.push(
      `Reuse ${args.contentInsights.topPlaybooks[0].label.replace(/_/g, " ")} because it has the strongest path from draft to posting.`,
    );
  }

  if (args.contentInsights.topOutputShapes[0]) {
    experiments.push(
      `Test the next ${args.contentInsights.topOutputShapes[0].label.replace(/_/g, " ")} draft against ${args.strategySnapshot.contentPillars[0] || "the top pillar"}.`,
    );
  }

  if ((args.contentInsights.postRate || 0) < 0.25) {
    deprioritize.push("generic topical drafts with no concrete proof or strong pillar anchor");
  }

  if (args.strategySnapshot.offBrandThemes.length > 0) {
    deprioritize.push(...args.strategySnapshot.offBrandThemes.slice(0, 2));
  }

  if (args.contentInsights.outcomeSnapshot.totalProfileClicks > 0) {
    notes.push(
      `Logged post outcomes have produced ${args.contentInsights.outcomeSnapshot.totalProfileClicks} profile-click proxy events so far.`,
    );
  }

  if (args.contentInsights.outcomeSnapshot.totalFollowerDelta > 0) {
    notes.push(
      `Observed follower delta from logged posts is ${args.contentInsights.outcomeSnapshot.totalFollowerDelta}.`,
    );
  }

  if (args.contentInsights.totalCandidates === 0) {
    notes.push("No post-loop learning yet, so use the base positioning model plus performance actions.");
  }

  return {
    generatedAt: new Date().toISOString(),
    reinforce: [...new Set(reinforce)].slice(0, 3),
    deprioritize: [...new Set(deprioritize)].slice(0, 4),
    experiments: [...new Set(experiments)].slice(0, 3),
    notes: [...new Set(notes)].slice(0, 4),
    unknowns: args.contentInsights.unknowns.slice(0, 5),
  };
}
