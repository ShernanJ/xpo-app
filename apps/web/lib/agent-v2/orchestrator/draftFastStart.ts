import type { V2ChatIntent } from "../contracts/chat.ts";
import { isBareDraftRequest, isMultiDraftRequest } from "./conversationManagerLogic.ts";

export function inferBroadTopicDraftRequest(message: string): string | null {
  const normalized = message.trim().toLowerCase();
  const isDraftRequest = [
    "write me a post",
    "write a post",
    "write me a thread",
    "write a thread",
    "draft a post",
    "draft me a post",
    "draft a thread",
    "draft me a thread",
    "make a post",
    "make me a post",
    "make a thread",
    "make me a thread",
    "give me a post",
    "give me a thread",
  ].some((cue) => normalized.includes(cue));

  if (!isDraftRequest) {
    return null;
  }

  const hasDirectionCue = [
    "in my voice",
    "my voice",
    "random",
    "whatever",
    "optimized for growth",
    "optimize it for growth",
    "optimize for growth",
    "for reach",
    "for engagement",
    "to grow",
    "viral",
    "hook",
    "hot take",
    "story",
    "lesson",
    "mistake",
    "opinion",
    "personal",
    "thread",
    "announcement",
    "launch",
    "tips",
    "how to",
    "why ",
    "vs ",
    "versus",
    "counter-",
    "contrarian",
  ].some((cue) => normalized.includes(cue));

  if (hasDirectionCue) {
    return null;
  }

  const topicMatch = message.match(/\b(?:about|on)\s+([a-z0-9][a-z0-9\s/&'’-]{1,80})$/i);
  const topic = topicMatch?.[1]?.trim().replace(/[.?!,]+$/, "").replace(/\s+/g, " ") || "";

  if (!topic) {
    return null;
  }

  const normalizedTopic = topic.toLowerCase();
  if (
    normalizedTopic.length < 3 ||
    normalizedTopic === "it" ||
    normalizedTopic === "this" ||
    normalizedTopic === "something"
  ) {
    return null;
  }

  return topic;
}

export function shouldFastStartGroundedDraft(args: {
  userMessage: string;
  mode: V2ChatIntent;
  explicitIntent?: V2ChatIntent | null;
  hasActiveDraft: boolean;
  memoryTopicSummary?: string | null;
  hasTopicGrounding: boolean;
  groundingSourceCount: number;
  turnGroundingCount: number;
  creatorHintsAvailable: boolean;
}): boolean {
  if (args.explicitIntent || args.hasActiveDraft || args.mode !== "plan") {
    return false;
  }

  const broadTopic = inferBroadTopicDraftRequest(args.userMessage);
  const bareDraftRequest = isBareDraftRequest(args.userMessage);
  const multiDraftRequest = isMultiDraftRequest(args.userMessage);
  const wantsDraft =
    bareDraftRequest ||
    multiDraftRequest ||
    Boolean(broadTopic) ||
    args.hasTopicGrounding;
  if (!wantsDraft) {
    return false;
  }

  const hasGroundingContext =
    args.groundingSourceCount > 0 ||
    args.turnGroundingCount > 0 ||
    args.hasTopicGrounding;
  if (!hasGroundingContext) {
    return false;
  }

  const hasTopicOrProfileContext =
    Boolean(args.memoryTopicSummary?.trim()) ||
    Boolean(broadTopic) ||
    args.hasTopicGrounding ||
    (multiDraftRequest && args.turnGroundingCount > 0) ||
    (multiDraftRequest && args.groundingSourceCount > 0) ||
    (args.creatorHintsAvailable &&
      args.groundingSourceCount > 0 &&
      (bareDraftRequest || multiDraftRequest));

  return hasTopicOrProfileContext;
}
