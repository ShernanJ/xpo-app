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

  const conversionMatch = cleaned.match(
    /\b([a-z0-9]+)(?:\s+posts?|\s+content)?\s+(?:into|to)\s+([a-z0-9]+)\b/i,
  );
  const reduced =
    conversionMatch?.[1] && conversionMatch?.[2]
      ? `${conversionMatch[1]} to ${conversionMatch[2]}`
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
  const unique: string[] = [];

  for (const candidate of candidates) {
    if (!isUsableTopicCandidate(candidate)) {
      continue;
    }

    const cleaned = cleanTopicValue(candidate);
    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(cleaned);
    if (unique.length >= 3) {
      break;
    }
  }

  return unique;
}

function buildTopicDraftChip(topic: string): CreatorChatQuickReply {
  return {
    kind: "clarification_choice",
    value: `draft a post about ${topic}. keep it in my voice and stay close to what i usually post about.`,
    label: compactTopicLabel(topic),
    explicitIntent: "plan",
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

function buildLooseFallbackChoices(primaryTopic: string | null): CreatorChatQuickReply[] {
  const topicChoices = primaryTopic ? [buildTopicDraftChip(primaryTopic)] : [];

  return [
    ...topicChoices,
    {
      kind: "clarification_choice" as const,
      value: "draft something in my usual lane. keep it natural and close to my normal topics.",
      label: "my usual lane",
      explicitIntent: "plan" as const,
    },
    {
      kind: "clarification_choice" as const,
      value: "draft something recent i could realistically post. keep it in my voice and make it feel current.",
      label: "something recent",
      explicitIntent: "plan" as const,
    },
    buildAngleChip(primaryTopic),
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
    const topicValue = primaryTopic || "my usual lane";
    const topicLabel = compactTopicLabel(topicValue);
    return [
      {
        kind: "clarification_choice",
        value: primaryTopic
          ? `draft a shortform x post about ${primaryTopic}. keep it tight and in my voice.`
          : "draft a shortform x post in my usual lane. keep it tight and in my voice.",
        label: `Shortform on ${topicLabel}`,
        explicitIntent: "plan",
        formatPreference: "shortform",
      },
      {
        kind: "clarification_choice",
        value: primaryTopic
          ? `draft a longform x post about ${primaryTopic}. use the extra room and keep it in my voice.`
          : "draft a longform x post in my usual lane. use the extra room and keep it in my voice.",
        label: `Longform on ${topicLabel}`,
        explicitIntent: "plan",
        formatPreference: "longform",
      },
      buildAngleChip(primaryTopic),
    ];
  }

  if (topicalChoices.length >= 2) {
    return [
      buildTopicDraftChip(topicalChoices[0]),
      buildTopicDraftChip(topicalChoices[1]),
      buildAngleChip(primaryTopic),
    ];
  }

  return buildLooseFallbackChoices(primaryTopic);
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
