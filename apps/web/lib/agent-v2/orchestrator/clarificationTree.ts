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

function buildFallbackChoices(seedTopic: string | null): CreatorChatQuickReply[] {
  const baseChoices = [
    seedTopic ? `the real story behind ${seedTopic}` : "something you shipped recently",
    "a mistake you learned from this week",
    "an opinion you have that most people in your niche get wrong",
  ];

  return baseChoices.slice(0, 3).map((value) => ({
    kind: "clarification_choice",
    value,
    label: value,
    explicitIntent: "draft",
  }));
}

function buildSeededChoices(
  styleCard: VoiceStyleCard | null,
  topicAnchors: string[],
  seedTopic: string | null,
): CreatorChatQuickReply[] {
  const fromProfile = (styleCard?.contextAnchors || []).slice(0, 3);
  if (fromProfile.length > 0) {
    return fromProfile.map((value) => ({
      kind: "clarification_choice",
      value,
      label: value,
      explicitIntent: "draft",
    }));
  }

  const fromAnchors = topicAnchors
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (fromAnchors.length > 0) {
    return fromAnchors.map((value) => ({
      kind: "clarification_choice",
      value,
      label: value.length > 48 ? `${value.slice(0, 45)}...` : value,
      explicitIntent: "draft",
    }));
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
