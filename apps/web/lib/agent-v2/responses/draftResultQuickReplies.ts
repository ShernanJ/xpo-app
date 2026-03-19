import { SHORT_FORM_X_LIMIT } from "../../onboarding/shared/draftArtifacts.ts";
import type { VoiceStyleCard } from "../core/styleProfile.ts";
import type {
  CreatorChatQuickReply,
  DraftFormatPreference,
} from "../contracts/chat.ts";
import { compactTopicLabel } from "./draftTopicSelector.ts";
import {
  applyQuickReplyVoiceCase,
  normalizeQuickReplyLabel,
  resolveQuickReplyVoiceProfile,
} from "./quickReplyVoice.ts";

interface BuildDraftResultQuickRepliesArgs {
  outputShape: "short_form_post" | "long_form_post" | "thread_seed";
  styleCard: VoiceStyleCard | null;
  seedTopic?: string | null;
  singlePostMaxCharacterLimit?: number | null;
}

function resolveTopicLabel(seedTopic: string | null | undefined): string | null {
  const compact = seedTopic ? compactTopicLabel(seedTopic) : null;
  if (!compact || compact === "your usual lane") {
    return null;
  }

  return compact;
}

function buildQuickReply(args: {
  kind?: CreatorChatQuickReply["kind"];
  label: string;
  value: string;
  styleCard: VoiceStyleCard | null;
  formatPreference?: DraftFormatPreference;
}): CreatorChatQuickReply {
  const voice = resolveQuickReplyVoiceProfile(args.styleCard);

  return {
    kind: args.kind || "planner_action",
    value: applyQuickReplyVoiceCase(args.value, voice),
    label: normalizeQuickReplyLabel(args.label, voice),
    ...(args.formatPreference ? { formatPreference: args.formatPreference } : {}),
  };
}

export function buildDraftResultQuickReplies(
  args: BuildDraftResultQuickRepliesArgs,
): CreatorChatQuickReply[] {
  const topicLabel = resolveTopicLabel(args.seedTopic);
  const topicPhrase = topicLabel ? ` on ${topicLabel}` : "";
  const collapsePrompt =
    (args.singlePostMaxCharacterLimit ?? SHORT_FORM_X_LIMIT) > SHORT_FORM_X_LIMIT
      ? `Collapse this thread${topicPhrase} into exactly one standalone X post with the same core takeaway. Keep it to one post under the account's single-post character limit, not a thread.`
      : `Collapse this thread${topicPhrase} into exactly one standalone X post under 280 characters with the same core takeaway. Do not keep it as a thread.`;

  switch (args.outputShape) {
    case "long_form_post":
      return [
        buildQuickReply({
          label: "Tighten the opening",
          value: `Keep this long-form post${topicPhrase}, but tighten the opening and make the first two lines hit faster.`,
          styleCard: args.styleCard,
        }),
        buildQuickReply({
          label: "Cut to short post",
          value: `Turn this long-form post${topicPhrase} into one sharp X post under the character limit without losing the core point.`,
          styleCard: args.styleCard,
          formatPreference: "shortform",
        }),
        buildQuickReply({
          label: "Turn into thread",
          value: `Turn this long-form post${topicPhrase} into a short X thread with a stronger step-by-step progression.`,
          styleCard: args.styleCard,
          formatPreference: "thread",
        }),
      ];
    case "thread_seed":
      return [
        buildQuickReply({
          label: "Make it punchier",
          value: `Keep this thread${topicPhrase}, but make each post punchier and trim any lines that do not move the argument forward.`,
          styleCard: args.styleCard,
        }),
        buildQuickReply({
          label: "Collapse to one post",
          value: collapsePrompt,
          styleCard: args.styleCard,
        }),
        buildQuickReply({
          label: "Stronger ending CTA",
          value: `Keep this thread${topicPhrase}, but give it a stronger ending with clearer proof and a tighter CTA.`,
          styleCard: args.styleCard,
        }),
      ];
    case "short_form_post":
    default:
      return [
        buildQuickReply({
          label: "Sharpen this post",
          value: `Keep this post${topicPhrase}, but sharpen the opening, tighten the wording, and cut any filler.`,
          styleCard: args.styleCard,
        }),
        buildQuickReply({
          label: "Turn into thread",
          value: `Turn this post${topicPhrase} into a short X thread with 4 to 6 posts and a cleaner progression.`,
          styleCard: args.styleCard,
          formatPreference: "thread",
        }),
        buildQuickReply({
          label: "Add proof and CTA",
          value: `Keep this post${topicPhrase}, but strengthen the proof and ending CTA so it converts better.`,
          styleCard: args.styleCard,
        }),
      ];
  }
}
