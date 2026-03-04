import type { VoiceStyleCard } from "../core/styleProfile";
import type {
  ClarificationBranchKey,
  ClarificationState,
  CreatorChatQuickReply,
} from "../contracts/chat";
import {
  buildDirectionChoiceReply,
  buildEntityContextReply,
  buildLooseDirectionReply,
  buildPlanRejectReply,
  buildTopicFocusReply,
} from "./assistantReplyStyle";

interface ClarificationTreeArgs {
  branchKey: ClarificationBranchKey;
  seedTopic: string | null;
  styleCard: VoiceStyleCard | null;
  topicAnchors: string[];
  isVerifiedAccount?: boolean;
}

interface ClarificationTreeResult {
  reply: string;
  quickReplies: CreatorChatQuickReply[];
  clarificationState: ClarificationState;
}

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

function compactTopicLabel(value: string): string {
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

function scoreTopicCandidate(
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

function collectDraftTopicCandidates(
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

function buildPacingHint(styleCard: VoiceStyleCard | null): string {
  const pacing = styleCard?.pacing.toLowerCase() || "";

  if (pacing.includes("bullet") || pacing.includes("scan")) {
    return "use the same scan-friendly structure i usually use.";
  }

  if (pacing.includes("long") || pacing.includes("flowing")) {
    return "let it breathe a bit, but keep it readable and sharp.";
  }

  if (pacing.includes("short") || pacing.includes("punchy")) {
    return "keep it punchy and close to my normal pacing.";
  }

  return "match my usual pacing.";
}

function buildTopicDraftChip(
  topic: string,
  styleCard: VoiceStyleCard | null,
): CreatorChatQuickReply {
  return {
    kind: "clarification_choice",
    value: `draft a post about ${topic}. keep it in my voice and stay close to what i usually post about. ${buildPacingHint(styleCard)}`,
    label: compactTopicLabel(topic),
    explicitIntent: "plan",
  };
}

function buildFormatAwareDraftChip(args: {
  topic: string | null;
  styleCard: VoiceStyleCard | null;
  formatPreference: "shortform" | "longform";
}): CreatorChatQuickReply {
  const topicLabel = args.topic ? compactTopicLabel(args.topic) : "my usual lane";
  const label =
    args.formatPreference === "shortform"
      ? args.topic
        ? `Shortform on ${topicLabel}`
        : "Shortform in my usual lane"
      : args.topic
        ? `Longform on ${topicLabel}`
        : "Longform in my usual lane";
  const value =
    args.formatPreference === "shortform"
      ? args.topic
        ? `draft a shortform x post about ${args.topic}. keep it tight, in my voice, and close to what i usually post about. ${buildPacingHint(args.styleCard)}`
        : `draft a shortform x post in my usual lane. keep it tight, in my voice, and close to my usual topics. ${buildPacingHint(args.styleCard)}`
      : args.topic
        ? `draft a longform x post about ${args.topic}. use the extra room, keep it in my voice, and stay close to what i usually post about. ${buildPacingHint(args.styleCard)}`
        : `draft a longform x post in my usual lane. use the extra room, keep it in my voice, and stay close to my usual topics. ${buildPacingHint(args.styleCard)}`;

  return {
    kind: "clarification_choice",
    value,
    label,
    explicitIntent: "plan",
    formatPreference: args.formatPreference,
  };
}

function buildAngleChip(primaryTopic: string | null): CreatorChatQuickReply {
  return {
    kind: "clarification_choice",
    value: primaryTopic
      ? `help me pick a sharper angle for ${primaryTopic}`
      : "help me pick a sharper angle in my usual lane",
    label: "Pick an angle first",
    explicitIntent: "ideate",
  };
}

function buildLooseFallbackChoices(args: {
  primaryTopic: string | null;
  styleCard: VoiceStyleCard | null;
  isVerifiedAccount: boolean;
}): CreatorChatQuickReply[] {
  if (args.isVerifiedAccount) {
    return [
      buildFormatAwareDraftChip({
        topic: args.primaryTopic,
        styleCard: args.styleCard,
        formatPreference: "shortform",
      }),
      buildFormatAwareDraftChip({
        topic: args.primaryTopic,
        styleCard: args.styleCard,
        formatPreference: "longform",
      }),
      buildAngleChip(args.primaryTopic),
    ];
  }

  const topicChoices = args.primaryTopic
    ? [buildTopicDraftChip(args.primaryTopic, args.styleCard)]
    : [];

  return [
    ...topicChoices,
    {
      kind: "clarification_choice" as const,
      value: `draft something in my usual lane. keep it natural and close to my normal topics. ${buildPacingHint(args.styleCard)}`,
      label: "my usual lane",
      explicitIntent: "plan" as const,
    },
    {
      kind: "clarification_choice" as const,
      value: `draft something recent i could realistically post. keep it in my voice, make it feel current, and stay close to my usual topics. ${buildPacingHint(args.styleCard)}`,
      label: "something recent",
      explicitIntent: "plan" as const,
    },
    buildAngleChip(args.primaryTopic),
  ].slice(0, 3);
}

function buildDynamicDraftChoices(args: {
  styleCard: VoiceStyleCard | null,
  topicAnchors: string[],
  seedTopic: string | null,
  isVerifiedAccount: boolean,
  mode: "topic_known" | "loose",
}): CreatorChatQuickReply[] {
  const topicalChoices = collectDraftTopicCandidates(
    args.styleCard,
    args.topicAnchors,
    args.seedTopic,
  );
  const primaryTopic = topicalChoices[0] || null;

  if (args.mode === "topic_known" && args.isVerifiedAccount) {
    return [
      buildFormatAwareDraftChip({
        topic: primaryTopic,
        styleCard: args.styleCard,
        formatPreference: "shortform",
      }),
      buildFormatAwareDraftChip({
        topic: primaryTopic,
        styleCard: args.styleCard,
        formatPreference: "longform",
      }),
      buildAngleChip(primaryTopic),
    ];
  }

  if (topicalChoices.length >= 2) {
    return [
      buildTopicDraftChip(topicalChoices[0], args.styleCard),
      buildTopicDraftChip(topicalChoices[1], args.styleCard),
      buildAngleChip(primaryTopic),
    ];
  }

  return buildLooseFallbackChoices({
    primaryTopic,
    styleCard: args.styleCard,
    isVerifiedAccount: args.isVerifiedAccount,
  });
}

export function buildClarificationTree(args: ClarificationTreeArgs): ClarificationTreeResult {
  const hasWeakSeed = (value: string | null): boolean => {
    const normalized = value?.trim().toLowerCase() || "";
    return (
      !normalized ||
      ["what", "this", "that", "it", "me", "my thing", "something"].includes(normalized)
    );
  };

  if (args.branchKey === "plan_reject") {
    const quickReplies: CreatorChatQuickReply[] = [
      {
        kind: "planner_action",
        value: "make it tighter and more blunt",
        label: "Tighter and more blunt",
        explicitIntent: "planner_feedback",
      },
      {
        kind: "planner_action",
        value: "make it more personal and story-driven",
        label: "More personal/story-driven",
        explicitIntent: "planner_feedback",
      },
      {
        kind: "planner_action",
        value: "different angle",
        label: "Different angle",
        explicitIntent: "planner_feedback",
      },
    ];

    return {
      reply: buildPlanRejectReply(),
      quickReplies,
      clarificationState: {
        branchKey: args.branchKey,
        stepKey: "pick_reframe",
        seedTopic: args.seedTopic,
        options: quickReplies,
      },
    };
  }

  if (args.branchKey === "topic_known_but_direction_missing") {
    const quickReplies = buildDynamicDraftChoices({
      styleCard: args.styleCard,
      topicAnchors: args.topicAnchors,
      seedTopic: args.seedTopic,
      isVerifiedAccount: Boolean(args.isVerifiedAccount),
      mode: "topic_known",
    });

    return {
      reply: buildDirectionChoiceReply({ verified: Boolean(args.isVerifiedAccount) }),
      quickReplies,
      clarificationState: {
        branchKey: args.branchKey,
        stepKey: args.isVerifiedAccount ? "pick_length" : "pick_direction",
        seedTopic: args.seedTopic,
        options: quickReplies,
      },
    };
  }

  if (args.branchKey === "abstract_topic_focus_pick") {
    const topicLabel = args.seedTopic?.trim() || "this";
    const quickReplies: CreatorChatQuickReply[] = [
      {
        kind: "clarification_choice",
        value: `draft a ${topicLabel} post with my actual take on it. keep it natural and opinionated.`,
        label: "My take",
        explicitIntent: "plan",
      },
      {
        kind: "clarification_choice",
        value: `draft a ${topicLabel} post around a mistake people make.`,
        label: "A mistake",
        explicitIntent: "plan",
      },
      {
        kind: "clarification_choice",
        value: `draft a ${topicLabel} post around something i learned the hard way.`,
        label: "Something learned",
        explicitIntent: "plan",
      },
    ];

    return {
      reply: buildTopicFocusReply(topicLabel),
      quickReplies,
      clarificationState: {
        branchKey: args.branchKey,
        stepKey: "pick_focus",
        seedTopic: args.seedTopic,
        options: quickReplies,
      },
    };
  }

  if (args.branchKey === "entity_context_missing") {
    const entityLabel = hasWeakSeed(args.seedTopic)
      ? "that tool"
      : args.seedTopic?.trim() || "that tool";
    return {
      reply: buildEntityContextReply(entityLabel),
      quickReplies: [],
      clarificationState: {
        branchKey: args.branchKey,
        stepKey: "define_entity_context",
        seedTopic: args.seedTopic,
        options: [],
      },
    };
  }

  const quickReplies = buildDynamicDraftChoices({
    styleCard: args.styleCard,
    topicAnchors: args.topicAnchors,
    seedTopic: args.seedTopic,
    isVerifiedAccount: Boolean(args.isVerifiedAccount),
    mode: "loose",
  });

  const reply =
    args.branchKey === "lazy_request"
      ? buildLooseDirectionReply({ almostReady: false })
      : buildLooseDirectionReply({ almostReady: true });

  return {
    reply,
    quickReplies,
    clarificationState: {
      branchKey: args.branchKey,
      stepKey: "pick_direction",
      seedTopic: args.seedTopic,
      options: quickReplies,
    },
  };
}
