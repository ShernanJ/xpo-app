import { isHumanSafeTopicLabel } from "../../../../../../../lib/agent-v2/responses/draftTopicSelector.ts";

function normalizeProgressCopy(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function sanitizeProgressTopic(value?: string | null): string | null {
  const normalized = normalizeProgressCopy(value);
  if (!normalized) {
    return null;
  }

  if (/https?:\/\/|t\.co\/|www\./i.test(normalized)) {
    return null;
  }

  if (normalized.split(/\s+/).length > 5) {
    return null;
  }

  if (!isHumanSafeTopicLabel(normalized)) {
    return null;
  }

  return normalized;
}

export function resolveProgressTopic(args: {
  profileReplyContext?: {
    topicInsights?: Array<{ label?: string | null }>;
    topicBullets?: string[];
  } | null;
  creatorProfileHints?: {
    contentPillars?: string[];
    knownFor?: string | null;
  } | null;
}): string | null {
  const topicInsight = sanitizeProgressTopic(args.profileReplyContext?.topicInsights?.[0]?.label);
  if (topicInsight) {
    return topicInsight;
  }

  const topicBullet = sanitizeProgressTopic(args.profileReplyContext?.topicBullets?.[0]);
  if (topicBullet) {
    return topicBullet;
  }

  const pillar = sanitizeProgressTopic(args.creatorProfileHints?.contentPillars?.[0]);
  if (pillar) {
    return pillar;
  }

  return sanitizeProgressTopic(args.creatorProfileHints?.knownFor);
}
