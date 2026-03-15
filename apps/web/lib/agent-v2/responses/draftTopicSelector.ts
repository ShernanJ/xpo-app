import type { VoiceStyleCard } from "../core/styleProfile";

const JUNK_TOPIC_VALUES = new Set([
  "this",
  "that",
  "it",
  "something",
  "anything",
  "my thing",
  "stuff",
]);

function cleanTopicValue(value: string): string {
  return value
    .trim()
    .replace(/^[@#]+/, "")
    .replace(/[.?!,]+$/, "")
    .replace(/\s+/g, " ");
}

function isMetaSummaryTopic(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    /^(?:the\s+)?user\s+is\b/.test(normalized) ||
    /^(?:the\s+)?creator\s+is\b/.test(normalized) ||
    /^(?:they|he|she)\s+is\b/.test(normalized) ||
    /^(?:they)\s+are\b/.test(normalized)
  );
}

function isComplaintOrMetaTopic(value: string): boolean {
  const normalized = cleanTopicValue(value).toLowerCase();
  if (!normalized) {
    return false;
  }

  return [
    /\btoo formal\b/,
    /\btoo polished\b/,
    /\btoo generic\b/,
    /\btoo long\b/,
    /\btoo robotic\b/,
    /\btoo corporate\b/,
    /\btoo salesy\b/,
    /\btoo stiff\b/,
    /\bsounds cringe\b/,
    /\bsounds like linkedin\b/,
    /\bdon't like this\b/,
    /\bthis is bad\b/,
    /^(?:what(?:'s| is)|which)\s+.*\b(?:best|top)\s+post\b/,
    /\b(?:best|top)\s+post\b/,
  ].some((pattern) => pattern.test(normalized));
}

export function compactTopicLabel(value: string): string {
  const cleaned = cleanTopicValue(value);

  if (!cleaned) {
    return "your usual lane";
  }

  const normalized = cleaned.toLowerCase();
  const conversionMatch =
    cleaned.match(
      /\b(?:turning|convert(?:ing)?|rewriting|transform(?:ing)?)\s+([a-z0-9]+)(?:\s+posts?|\s+content)?\s+(?:into|to)\s+([a-z0-9]+)\b/i,
    ) ||
    cleaned.match(
      /\b([a-z0-9]+)(?:\s+posts?|\s+content)?\s+(?:into|to)\s+([a-z0-9]+)\b/i,
    );
  const bridgeMatch = cleaned.match(
    /\b([a-z0-9]+)\s+(?:vs|versus)\s+([a-z0-9]+)\b/i,
  );
  const pairedTopicMatch = cleaned.match(
    /\b([a-z0-9][a-z0-9\s'-]{1,24})\s+and\s+([a-z0-9][a-z0-9\s'-]{1,24})\b/i,
  );
  const reduced =
    conversionMatch?.[1] && conversionMatch?.[2]
      ? `${conversionMatch[1]} to ${conversionMatch[2]}`
      : bridgeMatch?.[1] && bridgeMatch?.[2]
        ? `${bridgeMatch[1]} vs ${bridgeMatch[2]}`
        : pairedTopicMatch?.[1] && pairedTopicMatch?.[2]
          ? cleanTopicValue(
              normalized.includes("internship") && normalized.includes("interview")
                ? pairedTopicMatch[1]
                : pairedTopicMatch[1],
            )
          : cleaned.split(/\b(?:while|because|but|so|and|with)\b/i)[0].trim() || cleaned;
  const words = reduced.split(/\s+/);
  const compact = words.length > 5 ? words.slice(0, 5).join(" ") : reduced;
  return compact.length > 34 ? `${compact.slice(0, 31).trimEnd()}...` : compact;
}

function isUsableTopicCandidate(value: string | null): value is string {
  const cleaned = cleanTopicValue(value || "");
  const normalized = cleaned.toLowerCase();

  if (!cleaned || JUNK_TOPIC_VALUES.has(normalized)) {
    return false;
  }

  if (
    /\b(?:draft|write|make|give|help)\s+(?:me\s+)?(?:a\s+)?post\b/i.test(cleaned) ||
    /\b(?:pick|choose)\s+(?:an?\s+)?angle\b/i.test(cleaned)
  ) {
    return false;
  }

  if (isMetaSummaryTopic(cleaned) || isComplaintOrMetaTopic(cleaned)) {
    return false;
  }

  if (cleaned.length > 84 || cleaned.includes("\n")) {
    return false;
  }

  if (cleaned.split(/\s+/).length > 8) {
    return false;
  }

  if (/^[^a-z0-9]*$/i.test(cleaned)) {
    return false;
  }

  return true;
}

export function scoreTopicCandidate(
  value: string,
  args: {
    seedTopic: string | null;
    styleCard: VoiceStyleCard | null;
    topicAnchors: string[];
  },
): number {
  const cleaned = cleanTopicValue(value);
  const normalized = cleaned.toLowerCase();
  const compactLabel = compactTopicLabel(cleaned).toLowerCase();
  let score = 0;

  if (args.seedTopic && normalized === cleanTopicValue(args.seedTopic).toLowerCase()) {
    score += 8;
  }

  if ((args.styleCard?.contextAnchors || []).some((anchor) => cleanTopicValue(anchor).toLowerCase() === normalized)) {
    score += 4;
  }

  if (args.topicAnchors.some((anchor) => cleanTopicValue(anchor).toLowerCase() === normalized)) {
    score += 3;
  }

  const wordCount = compactLabel.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 3) {
    score += 3;
  } else if (wordCount <= 5) {
    score += 2;
  } else {
    score -= 2;
  }

  if (compactLabel.length <= 22) {
    score += 2;
  } else if (compactLabel.length <= 34) {
    score += 1;
  } else {
    score -= 1;
  }

  if (/\d/.test(normalized)) {
    score -= 2;
  }

  if (/\b(?:while|because|but|so|with)\b/i.test(cleaned)) {
    score -= 1;
  }

  return score;
}

export function isHumanSafeTopicLabel(value: string): boolean {
  const label = compactTopicLabel(value).toLowerCase();

  if (!label || label === "your usual lane" || JUNK_TOPIC_VALUES.has(label)) {
    return false;
  }

  if (isComplaintOrMetaTopic(label)) {
    return false;
  }

  if (label.includes("...")) {
    return false;
  }

  if (label.split(/\s+/).length > 5) {
    return false;
  }

  if (/\d/.test(label)) {
    return false;
  }

  return true;
}

export function collectDraftTopicCandidates(
  styleCard: VoiceStyleCard | null,
  topicAnchors: string[],
  seedTopic: string | null,
): string[] {
  const candidates = [
    seedTopic,
    ...(styleCard?.contextAnchors || []),
    ...topicAnchors,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  const seen = new Set<string>();
  const ranked: Array<{ value: string; score: number; order: number }> = [];
  const seenLabels = new Set<string>();

  for (const [index, candidate] of candidates.entries()) {
    if (!isUsableTopicCandidate(candidate)) {
      continue;
    }

    const cleaned = cleanTopicValue(candidate);
    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    const compactLabel = compactTopicLabel(cleaned).toLowerCase();
    if (seenLabels.has(compactLabel)) {
      continue;
    }

    seen.add(key);
    seenLabels.add(compactLabel);
    ranked.push({
      value: cleaned,
      score: scoreTopicCandidate(cleaned, { seedTopic, styleCard, topicAnchors }),
      order: index,
    });
  }

  return ranked
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.order - right.order;
    })
    .slice(0, 3)
    .map((item) => item.value);
}
