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
  mode?: "follow_up" | "primary_angle_picks";
  angles?: Array<{ title?: string | null } | string> | null;
  formatHint?: "post" | "thread";
}

function extractAngleLabel(angle: { title?: string | null } | string): string {
  if (typeof angle === "string") {
    return angle.trim();
  }

  return typeof angle.title === "string" ? angle.title.trim() : "";
}

function formatPrimaryAngleLabel(
  title: string,
  voice: ReturnType<typeof resolveQuickReplyVoiceProfile>,
): string {
  const normalized = title.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return normalized;
  }

  if (voice.lowercase) {
    return normalized.toLowerCase();
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function buildIdeationQuickReplies(
  args: BuildIdeationQuickRepliesArgs,
): CreatorChatQuickReply[] {
  const voice = resolveQuickReplyVoiceProfile(args.styleCard);

  if (args.mode === "primary_angle_picks") {
    const quickReplies = (args.angles || [])
      .map((angle) => extractAngleLabel(angle))
      .filter(Boolean)
      .slice(0, 3)
      .map((title) => {
        const label = formatPrimaryAngleLabel(title, voice);
        const angleValue = applyQuickReplyVoiceCase(title, voice);

        return {
          kind: "ideation_angle" as const,
          value: angleValue,
          label,
          angle: angleValue,
          formatHint: args.formatHint || "post",
          explicitIntent: "draft" as const,
        };
      });

    if (quickReplies.length > 0) {
      return quickReplies;
    }
  }

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
