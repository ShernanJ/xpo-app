import type { VoiceStyleCard } from "../core/styleProfile";
import type {
  CreatorChatQuickReply,
  DraftFormatPreference,
} from "../contracts/chat";
import { resolveDynamicDraftChoices } from "./draftChoiceResolution.ts";

export function buildDynamicDraftChoices(args: {
  styleCard: VoiceStyleCard | null;
  topicAnchors: string[];
  seedTopic: string | null;
  isVerifiedAccount: boolean;
  requestedFormatPreference?: DraftFormatPreference | null;
  mode: "topic_known" | "loose";
}): CreatorChatQuickReply[] {
  return resolveDynamicDraftChoices(args);
}
