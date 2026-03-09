import type { VoiceStyleCard } from "../core/styleProfile";
import type {
  ClarificationBranchKey,
  ClarificationState,
  CreatorChatQuickReply,
  DraftFormatPreference,
} from "../contracts/chat";
import {
  buildCareerDirectionReply,
  buildDirectionChoiceReply,
  buildEntityContextReply,
  buildLooseDirectionReply,
  buildPlanRejectReply,
  buildTopicFocusReply,
} from "./assistantReplyStyle";
import { buildDynamicDraftChoices } from "./clarificationDraftChips";
import { buildPlannerQuickReplies } from "./plannerQuickReplies";

interface ClarificationTreeArgs {
  branchKey: ClarificationBranchKey;
  seedTopic: string | null;
  styleCard: VoiceStyleCard | null;
  topicAnchors: string[];
  isVerifiedAccount?: boolean;
  requestedFormatPreference?: DraftFormatPreference | null;
}

interface ClarificationTreeResult {
  reply: string;
  quickReplies: CreatorChatQuickReply[];
  clarificationState: ClarificationState;
}

interface QuickReplyVoiceProfile {
  lowercase: boolean;
  concise: boolean;
}

function inferLowercasePreference(styleCard: VoiceStyleCard | null): boolean {
  if (!styleCard) {
    return false;
  }

  const explicitCasing = styleCard.userPreferences?.casing;
  if (explicitCasing === "lowercase") {
    return true;
  }
  if (explicitCasing === "normal" || explicitCasing === "uppercase") {
    return false;
  }

  const signals = [
    ...(styleCard.formattingRules || []),
    ...(styleCard.customGuidelines || []),
  ]
    .join(" ")
    .toLowerCase();

  return (
    signals.includes("all lowercase") ||
    signals.includes("always lowercase") ||
    signals.includes("never uses capitalization") ||
    signals.includes("no uppercase")
  );
}

function inferConcisePreference(styleCard: VoiceStyleCard | null): boolean {
  const pacing = styleCard?.pacing?.toLowerCase() || "";
  const guidance = (styleCard?.customGuidelines || []).join(" ").toLowerCase();
  const writingGoal = styleCard?.userPreferences?.writingGoal;

  return (
    writingGoal === "growth_first" ||
    pacing.includes("short") ||
    pacing.includes("punchy") ||
    pacing.includes("bullet") ||
    pacing.includes("scan") ||
    guidance.includes("blunt") ||
    guidance.includes("direct") ||
    guidance.includes("tight")
  );
}

function resolveQuickReplyVoiceProfile(
  styleCard: VoiceStyleCard | null,
): QuickReplyVoiceProfile {
  return {
    lowercase: inferLowercasePreference(styleCard),
    concise: inferConcisePreference(styleCard),
  };
}

function applyQuickReplyVoiceCase(value: string, voice: QuickReplyVoiceProfile): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!voice.lowercase) {
    return normalized;
  }

  return normalized.toLowerCase();
}

function titleCaseLabel(value: string): string {
  return value.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function normalizeQuickReplyLabel(value: string, voice: QuickReplyVoiceProfile): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const base = voice.lowercase ? trimmed.toLowerCase() : titleCaseLabel(trimmed);
  return base.length > 30 ? `${base.slice(0, 27).trimEnd()}...` : base;
}

export function buildClarificationTree(args: ClarificationTreeArgs): ClarificationTreeResult {
  const voice = resolveQuickReplyVoiceProfile(args.styleCard);

  const hasWeakSeed = (value: string | null): boolean => {
    const normalized = value?.trim().toLowerCase() || "";
    return (
      !normalized ||
      ["what", "this", "that", "it", "me", "my thing", "something"].includes(normalized)
    );
  };

  if (args.branchKey === "plan_reject") {
    const quickReplies = buildPlannerQuickReplies({
      plan: null,
      styleCard: args.styleCard,
      seedTopic: args.seedTopic,
      context: "reject",
    });

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
      requestedFormatPreference: args.requestedFormatPreference,
      mode: "topic_known",
    });

    return {
      reply: buildDirectionChoiceReply({
        verified: Boolean(args.isVerifiedAccount),
        requestedFormatPreference: args.requestedFormatPreference,
      }),
      quickReplies,
      clarificationState: {
        branchKey: args.branchKey,
        stepKey:
          args.requestedFormatPreference === "thread"
            ? "pick_thread_direction"
            : args.isVerifiedAccount
              ? "pick_length"
              : "pick_direction",
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
        value: applyQuickReplyVoiceCase(
          `draft a ${topicLabel} post with my actual take on it. keep it natural and opinionated.`,
          voice,
        ),
        label: normalizeQuickReplyLabel(
          voice.concise ? "my take" : "my actual take",
          voice,
        ),
        explicitIntent: "plan",
      },
      {
        kind: "clarification_choice",
        value: applyQuickReplyVoiceCase(
          `draft a ${topicLabel} post around a mistake people make.`,
          voice,
        ),
        label: normalizeQuickReplyLabel(
          voice.concise ? "common mistake" : "a common mistake",
          voice,
        ),
        explicitIntent: "plan",
      },
      {
        kind: "clarification_choice",
        value: applyQuickReplyVoiceCase(
          `draft a ${topicLabel} post around something i learned the hard way.`,
          voice,
        ),
        label: normalizeQuickReplyLabel(
          voice.concise ? "hard lesson" : "something i learned",
          voice,
        ),
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

  if (args.branchKey === "career_context_missing") {
    const topicLabel = hasWeakSeed(args.seedTopic)
      ? "this"
      : args.seedTopic?.trim() || "this";
    const quickReplies: CreatorChatQuickReply[] = [
      {
        kind: "clarification_choice",
        value: applyQuickReplyVoiceCase(
          `draft a ${topicLabel} post that sounds grateful and grounded.`,
          voice,
        ),
        label: normalizeQuickReplyLabel("grateful", voice),
        explicitIntent: "plan",
      },
      {
        kind: "clarification_choice",
        value: applyQuickReplyVoiceCase(
          `draft a ${topicLabel} post that sounds ambitious and determined.`,
          voice,
        ),
        label: normalizeQuickReplyLabel("ambitious", voice),
        explicitIntent: "plan",
      },
      {
        kind: "clarification_choice",
        value: applyQuickReplyVoiceCase(
          `draft a ${topicLabel} post that sounds reflective and honest.`,
          voice,
        ),
        label: normalizeQuickReplyLabel("reflective", voice),
        explicitIntent: "plan",
      },
    ];

    return {
      reply: buildCareerDirectionReply(),
      quickReplies,
      clarificationState: {
        branchKey: args.branchKey,
        stepKey: "pick_career_tone",
        seedTopic: args.seedTopic,
        options: quickReplies,
      },
    };
  }

  const quickReplies = buildDynamicDraftChoices({
    styleCard: args.styleCard,
    topicAnchors: args.topicAnchors,
    seedTopic: args.seedTopic,
    isVerifiedAccount: Boolean(args.isVerifiedAccount),
    requestedFormatPreference: args.requestedFormatPreference,
    mode: "loose",
  });

  const reply =
    args.branchKey === "lazy_request"
      ? buildLooseDirectionReply({
        almostReady: false,
        requestedFormatPreference: args.requestedFormatPreference,
      })
      : buildLooseDirectionReply({
        almostReady: true,
        requestedFormatPreference: args.requestedFormatPreference,
      });

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
