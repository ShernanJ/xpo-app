import type { VoiceStyleCard } from "../core/styleProfile";
import type {
  CreatorChatQuickReply,
  DraftFormatPreference,
} from "../contracts/chat";
import {
  collectDraftTopicCandidates,
  isHumanSafeTopicLabel,
  scoreTopicCandidate,
} from "./draftTopicSelector.ts";
import {
  buildLooseFallbackChoices,
  buildThreadDirectionChoices,
  buildTopicKnownChoices,
} from "./draftDirectionChoices.ts";
import {
  resolveQuickReplyVoiceProfile,
} from "./quickReplyVoice.ts";

export function resolveDynamicDraftChoices(args: {
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

  if (args.mode === "topic_known") {
    return buildTopicKnownChoices({
      primaryTopic,
      topicalChoices,
      styleCard: args.styleCard,
      isVerifiedAccount: args.isVerifiedAccount,
      voice,
    });
  }

  return buildLooseFallbackChoices({
    primaryTopic,
    styleCard: args.styleCard,
    isVerifiedAccount: args.isVerifiedAccount,
    requestedFormatPreference: args.requestedFormatPreference,
    voice,
  });
}
