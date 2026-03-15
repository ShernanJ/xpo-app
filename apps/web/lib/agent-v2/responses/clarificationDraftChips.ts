import type { VoiceStyleCard } from "../core/styleProfile";
import type {
  CreatorChatQuickReply,
  DraftFormatPreference,
} from "../contracts/chat";
import {
  collectDraftTopicCandidates,
  compactTopicLabel,
  isHumanSafeTopicLabel,
  scoreTopicCandidate,
} from "./draftTopicSelector.ts";
import {
  applyQuickReplyVoiceCase,
  normalizeQuickReplyLabel,
  resolveQuickReplyVoiceProfile,
  type QuickReplyVoiceProfile,
} from "./quickReplyVoice.ts";

function buildPacingHint(
  styleCard: VoiceStyleCard | null,
  options?: {
    formatPreference?: DraftFormatPreference | null;
    threadStyle?: "story" | "breakdown";
  },
): string {
  const pacing = styleCard?.pacing.toLowerCase() || "";
  const isThread = options?.formatPreference === "thread";

  if (isThread && options?.threadStyle === "story") {
    if (pacing.includes("bullet") || pacing.includes("scan")) {
      return "keep it in my voice, but let each post breathe with short paragraphs instead of a dense bullet block.";
    }

    if (pacing.includes("long") || pacing.includes("flowing")) {
      return "let each post breathe with short paragraphs and keep the thread native to x.";
    }

    if (pacing.includes("short") || pacing.includes("punchy")) {
      return "keep it crisp, but let each post carry a real beat instead of a mini-tweet.";
    }

    return "keep it close to my usual voice and let the thread breathe with natural paragraph breaks.";
  }

  if (isThread && options?.threadStyle === "breakdown") {
    if (pacing.includes("bullet") || pacing.includes("scan")) {
      return "keep it clean and scannable, but avoid cramming the opener into a bullet block.";
    }

    if (pacing.includes("long") || pacing.includes("flowing")) {
      return "use the extra room for clean development, but keep the thread easy to scan.";
    }

    return "keep it native to x and let each post hold one clear beat.";
  }

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
  voice: QuickReplyVoiceProfile,
): CreatorChatQuickReply {
  const baseLabel = compactTopicLabel(topic);
  return {
    kind: "clarification_choice",
    value: applyQuickReplyVoiceCase(
      `draft a post about ${topic}. keep it in my voice and stay close to what i usually post about. ${buildPacingHint(styleCard)}`,
      voice,
    ),
    label: normalizeQuickReplyLabel(baseLabel, voice),
    explicitIntent: "plan",
  };
}

function buildFormatAwareDraftChip(args: {
  topic: string | null;
  styleCard: VoiceStyleCard | null;
  formatPreference: "shortform" | "longform";
  voice: QuickReplyVoiceProfile;
}): CreatorChatQuickReply {
  const topicLabel = args.topic ? compactTopicLabel(args.topic) : "my usual lane";
  const label =
    args.formatPreference === "shortform"
      ? args.topic
        ? args.voice.concise
          ? `shortform ${topicLabel}`
          : `shortform on ${topicLabel}`
        : args.voice.concise
          ? "shortform"
          : "shortform in my usual lane"
      : args.topic
        ? args.voice.concise
          ? `longform ${topicLabel}`
          : `longform on ${topicLabel}`
        : args.voice.concise
          ? "longform"
          : "longform in my usual lane";
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
    value: applyQuickReplyVoiceCase(value, args.voice),
    label: normalizeQuickReplyLabel(label, args.voice),
    explicitIntent: "plan",
    formatPreference: args.formatPreference,
  };
}

function buildAngleChip(
  primaryTopic: string | null,
  voice: QuickReplyVoiceProfile,
): CreatorChatQuickReply {
  const topicLabel = primaryTopic ? compactTopicLabel(primaryTopic) : null;
  const label = topicLabel
    ? voice.concise
      ? `new angle ${topicLabel}`
      : `angle on ${topicLabel}`
    : voice.concise
      ? "pick angle"
      : "pick an angle first";
  const value = primaryTopic
    ? `give me 3 grounded angle options for ${primaryTopic}. stay inside that topic, keep them close to what i usually post about, and do not reset broader than it.`
    : "give me 3 grounded angle options in my usual lane. keep them close to my normal topics and do not reset into something generic.";

  return {
    kind: "clarification_choice",
    value: applyQuickReplyVoiceCase(value, voice),
    label: normalizeQuickReplyLabel(label, voice),
    explicitIntent: "ideate",
  };
}

function buildThreadDraftChip(args: {
  topic: string | null;
  styleCard: VoiceStyleCard | null;
  threadStyle: "story" | "breakdown";
  voice: QuickReplyVoiceProfile;
}): CreatorChatQuickReply {
  const topicLabel = args.topic ? compactTopicLabel(args.topic) : "my usual lane";
  const label =
    args.threadStyle === "story"
      ? args.topic
        ? `${topicLabel} story`
        : "story thread"
      : args.topic
        ? `${topicLabel} breakdown`
        : "breakdown thread";
  const topicFragment = args.topic
    ? `about ${args.topic}`
    : "in my usual lane";
  const value =
    args.threadStyle === "story"
      ? `draft a story-driven x thread ${topicFragment}. make the opener clearly signal the thread, keep each post native to x, and stay close to my usual voice. ${buildPacingHint(args.styleCard, { formatPreference: "thread", threadStyle: "story" })}`
      : `draft a breakdown x thread ${topicFragment}. make it scan-friendly, concrete, native to x, and close to what i usually post about. ${buildPacingHint(args.styleCard, { formatPreference: "thread", threadStyle: "breakdown" })}`;

  return {
    kind: "clarification_choice",
    value: applyQuickReplyVoiceCase(value, args.voice),
    label: normalizeQuickReplyLabel(label, args.voice),
    explicitIntent: "plan",
    formatPreference: "thread",
  };
}

function buildThreadAngleChip(
  primaryTopic: string | null,
  voice: QuickReplyVoiceProfile,
): CreatorChatQuickReply {
  const topicLabel = primaryTopic ? compactTopicLabel(primaryTopic) : null;
  const label = topicLabel
    ? voice.concise
      ? `thread angles ${topicLabel}`
      : `thread angles on ${topicLabel}`
    : voice.concise
      ? "thread angles"
      : "give me thread angles";
  const value = primaryTopic
    ? `give me 3 grounded thread angles for ${primaryTopic}. each should fit a 4 to 6 post x thread, feel native to x, and stay close to what i usually post about.`
    : "give me 3 grounded thread angles in my usual lane. each should fit a 4 to 6 post x thread, feel native to x, and stay close to what i usually post about.";

  return {
    kind: "clarification_choice",
    value: applyQuickReplyVoiceCase(value, voice),
    label: normalizeQuickReplyLabel(label, voice),
    explicitIntent: "ideate",
    formatPreference: "thread",
  };
}

function buildThreadDirectionChoices(args: {
  primaryTopic: string | null;
  styleCard: VoiceStyleCard | null;
  voice: QuickReplyVoiceProfile;
}): CreatorChatQuickReply[] {
  return [
    buildThreadDraftChip({
      topic: args.primaryTopic,
      styleCard: args.styleCard,
      threadStyle: "story",
      voice: args.voice,
    }),
    buildThreadDraftChip({
      topic: args.primaryTopic,
      styleCard: args.styleCard,
      threadStyle: "breakdown",
      voice: args.voice,
    }),
    buildThreadAngleChip(args.primaryTopic, args.voice),
  ];
}

function buildLooseFallbackChoices(args: {
  primaryTopic: string | null;
  styleCard: VoiceStyleCard | null;
  isVerifiedAccount: boolean;
  requestedFormatPreference?: DraftFormatPreference | null;
  voice: QuickReplyVoiceProfile;
}): CreatorChatQuickReply[] {
  if (args.requestedFormatPreference === "thread") {
    return buildThreadDirectionChoices({
      primaryTopic: args.primaryTopic,
      styleCard: args.styleCard,
      voice: args.voice,
    });
  }

  if (args.isVerifiedAccount) {
    return [
      buildFormatAwareDraftChip({
        topic: args.primaryTopic,
        styleCard: args.styleCard,
        formatPreference: "shortform",
        voice: args.voice,
      }),
      buildFormatAwareDraftChip({
        topic: args.primaryTopic,
        styleCard: args.styleCard,
        formatPreference: "longform",
        voice: args.voice,
      }),
      buildAngleChip(args.primaryTopic, args.voice),
    ];
  }

  const topicChoices = args.primaryTopic
    ? [buildTopicDraftChip(args.primaryTopic, args.styleCard, args.voice)]
    : [];

  const usualLaneChoice: CreatorChatQuickReply = {
    kind: "clarification_choice",
    value: applyQuickReplyVoiceCase(
      `draft something in my usual lane. keep it natural and close to my normal topics. ${buildPacingHint(args.styleCard)}`,
      args.voice,
    ),
    label: normalizeQuickReplyLabel(
      args.voice.concise ? "usual lane" : "my usual lane",
      args.voice,
    ),
    explicitIntent: "plan",
  };
  const recentChoice: CreatorChatQuickReply = {
    kind: "clarification_choice",
    value: applyQuickReplyVoiceCase(
      `draft something recent i could realistically post. keep it in my voice, make it feel current, and stay close to my usual topics. ${buildPacingHint(args.styleCard)}`,
      args.voice,
    ),
    label: normalizeQuickReplyLabel(
      args.voice.concise ? "recent post" : "something recent",
      args.voice,
    ),
    explicitIntent: "plan",
  };
  const angleChoice = buildAngleChip(args.primaryTopic, args.voice);

  if (args.primaryTopic) {
    return [topicChoices[0], usualLaneChoice, angleChoice];
  }

  return [usualLaneChoice, recentChoice, angleChoice];
}

export function buildDynamicDraftChoices(args: {
  styleCard: VoiceStyleCard | null;
  topicAnchors: string[];
  seedTopic: string | null;
  isVerifiedAccount: boolean;
  requestedFormatPreference?: DraftFormatPreference | null;
  mode: "topic_known" | "loose";
}): CreatorChatQuickReply[] {
  const voice = resolveQuickReplyVoiceProfile(args.styleCard);
  const collectedChoices = collectDraftTopicCandidates(
    args.styleCard,
    args.topicAnchors,
    args.seedTopic,
  );
  const topicalChoices = collectedChoices.filter((topic) => {
    const score = scoreTopicCandidate(topic, {
      seedTopic: args.seedTopic,
      styleCard: args.styleCard,
      topicAnchors: args.topicAnchors,
    });

    if (!isHumanSafeTopicLabel(topic)) {
      return false;
    }

    return args.mode === "topic_known" ? score >= 4 : score >= 5;
  });
  const primaryTopic = topicalChoices[0] || null;

  if (args.requestedFormatPreference === "thread") {
    return buildThreadDirectionChoices({
      primaryTopic,
      styleCard: args.styleCard,
      voice,
    });
  }

  if (args.mode === "topic_known" && args.isVerifiedAccount) {
    return [
      buildFormatAwareDraftChip({
        topic: primaryTopic,
        styleCard: args.styleCard,
        formatPreference: "shortform",
        voice,
      }),
      buildFormatAwareDraftChip({
        topic: primaryTopic,
        styleCard: args.styleCard,
        formatPreference: "longform",
        voice,
      }),
      buildAngleChip(primaryTopic, voice),
    ];
  }

  if (topicalChoices.length >= 2) {
    return [
      buildTopicDraftChip(topicalChoices[0], args.styleCard, voice),
      buildTopicDraftChip(topicalChoices[1], args.styleCard, voice),
      buildAngleChip(primaryTopic, voice),
    ];
  }

  return buildLooseFallbackChoices({
    primaryTopic,
    styleCard: args.styleCard,
    isVerifiedAccount: args.isVerifiedAccount,
    requestedFormatPreference: args.requestedFormatPreference,
    voice,
  });
}
