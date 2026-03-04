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

function compactTopicLabel(value: string): string {
  const cleaned = value
    .trim()
    .replace(/^[@#]+/, "")
    .replace(/[.?!,]+$/, "")
    .replace(/\s+/g, " ");

  if (!cleaned) {
    return "your usual lane";
  }

  const words = cleaned.split(/\s+/);
  const compact = words.length > 5 ? words.slice(0, 5).join(" ") : cleaned;
  return compact.length > 34 ? `${compact.slice(0, 31).trimEnd()}...` : compact;
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
    const key = candidate.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(candidate);
    if (unique.length >= 3) {
      break;
    }
  }

  return unique;
}

function buildFallbackChoices(seedTopic: string | null): CreatorChatQuickReply[] {
  const baseChoices = [
    seedTopic || "something you shipped recently",
    "a mistake you learned from this week",
  ];

  const topicChoices = baseChoices.map((value) => ({
    kind: "clarification_choice" as const,
    value: `draft a post about ${value}. keep it in my voice and make it feel like my usual lane.`,
    label: compactTopicLabel(value),
    explicitIntent: "plan" as const,
  }));

  return [
    ...topicChoices,
    {
      kind: "clarification_choice",
      value: "draft something in my usual lane. keep it natural and close to how i normally post.",
      label: "my usual lane",
      explicitIntent: "plan",
    },
  ].slice(0, 3);
}

function buildSeededChoices(
  styleCard: VoiceStyleCard | null,
  topicAnchors: string[],
  seedTopic: string | null,
): CreatorChatQuickReply[] {
  const topicalChoices = collectDraftTopicCandidates(styleCard, topicAnchors, seedTopic);
  if (topicalChoices.length > 0) {
    const topicReplies = topicalChoices.slice(0, 2).map((value) => ({
      kind: "clarification_choice" as const,
      value: `draft a post about ${value}. keep it in my voice and stay close to what i usually post about.`,
      label: compactTopicLabel(value),
      explicitIntent: "plan" as const,
    }));

    return [
      ...topicReplies,
      {
        kind: "clarification_choice",
        value: "draft something in my usual lane. keep it natural and close to my normal topics.",
        label: "my usual lane",
        explicitIntent: "plan",
      },
    ].slice(0, 3);
  }

  return buildFallbackChoices(seedTopic);
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
    const topicLabel = args.seedTopic?.trim() || "this";
    if (args.isVerifiedAccount) {
      const quickReplies: CreatorChatQuickReply[] = [
        {
          kind: "clarification_choice",
          value: `draft a shortform x post about ${topicLabel}. keep it tight and in my voice.`,
          label: "Shortform",
          explicitIntent: "plan",
          formatPreference: "shortform",
        },
        {
          kind: "clarification_choice",
          value: `draft a longform x post about ${topicLabel}. use the extra room and keep it in my voice.`,
          label: "Longform",
          explicitIntent: "plan",
          formatPreference: "longform",
        },
        {
          kind: "clarification_choice",
          value: `help me pick a sharper angle for ${topicLabel}`,
          label: "Pick an angle first",
          explicitIntent: "ideate",
        },
      ];

      return {
        reply: buildDirectionChoiceReply({ verified: true }),
        quickReplies,
        clarificationState: {
          branchKey: args.branchKey,
          stepKey: "pick_length",
          seedTopic: args.seedTopic,
          options: quickReplies,
        },
      };
    }

    const quickReplies: CreatorChatQuickReply[] = [
      {
        kind: "clarification_choice",
        value: `draft a solid ${topicLabel} post in my voice. keep it natural, not growth-hacky.`,
        label: "Random in my voice",
        explicitIntent: "plan",
      },
      {
        kind: "clarification_choice",
        value: `draft a ${topicLabel} post optimized for growth and reach.`,
        label: "Optimize for growth",
        explicitIntent: "plan",
      },
      {
        kind: "clarification_choice",
        value: `help me pick a sharper angle for ${topicLabel}`,
        label: "Pick an angle first",
        explicitIntent: "ideate",
      },
    ];

    return {
      reply: buildDirectionChoiceReply({ verified: false }),
      quickReplies,
      clarificationState: {
        branchKey: args.branchKey,
        stepKey: "pick_direction",
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

  const quickReplies = buildSeededChoices(args.styleCard, args.topicAnchors, args.seedTopic);

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
