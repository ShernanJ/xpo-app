import type { VoiceStyleCard } from "../core/styleProfile";
import type { CreatorChatQuickReply } from "../contracts/chat";
import { compactTopicLabel } from "./draftTopicSelector.ts";
import {
  applyQuickReplyVoiceCase,
  normalizeQuickReplyLabel,
  resolveQuickReplyVoiceProfile,
} from "./quickReplyVoice.ts";

interface BuildIdeationQuickRepliesArgs {
  styleCard: VoiceStyleCard | null;
  seedTopic?: string | null;
}

export function buildIdeationQuickReplies(
  args: BuildIdeationQuickRepliesArgs,
): CreatorChatQuickReply[] {
  const voice = resolveQuickReplyVoiceProfile(args.styleCard);
  const compact = args.seedTopic ? compactTopicLabel(args.seedTopic) : null;
  const topicLabel = compact && compact !== "your usual lane" ? compact : null;

  const sameLaneValue = topicLabel
    ? `give me more ideas in this same lane (${topicLabel}). keep them fresh and avoid repeating the exact same angles.`
    : "give me more ideas in this same lane. keep them fresh and avoid repeating the exact same angles.";
  const changeDirectionValue = topicLabel
    ? `change it up. keep the broad topic (${topicLabel}), but shift to a different direction and new tension.`
    : "change it up and take it in a different direction.";

  return [
    {
      kind: "clarification_choice",
      value: applyQuickReplyVoiceCase(sameLaneValue, voice),
      label: normalizeQuickReplyLabel(
        voice.concise ? "more like this" : "more ideas like this",
        voice,
      ),
      explicitIntent: "ideate",
    },
    {
      kind: "clarification_choice",
      value: applyQuickReplyVoiceCase(changeDirectionValue, voice),
      label: normalizeQuickReplyLabel(
        voice.concise ? "change it up" : "switch direction",
        voice,
      ),
      explicitIntent: "ideate",
    },
  ];
}
