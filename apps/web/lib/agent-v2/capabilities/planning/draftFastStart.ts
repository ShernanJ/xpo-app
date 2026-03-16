import type { V2ChatIntent } from "../../contracts/chat.ts";
import { isBareDraftRequest, isMultiDraftRequest } from "../../core/conversationHeuristics.ts";

export function isOpenEndedWildcardDraftRequest(message: string): boolean {
  const normalized = message.trim().toLowerCase().replace(/\s+/g, " ");

  if (!normalized) {
    return false;
  }

  return [
    "write a post about anything",
    "write me a post about anything",
    "draft a post about anything",
    "draft me a post about anything",
    "make a post about anything",
    "make me a post about anything",
    "write a thread about anything",
    "write me a thread about anything",
    "write about anything",
    "draft about anything",
    "write anything",
    "just write anything",
    "anything is fine",
    "whatever works",
    "write a post about something",
    "write me a post about something",
    "write about something",
  ].includes(normalized)
    || /\b(?:about|on)\s+(?:anything|something|whatever)\b/.test(normalized)
    || /\b(?:anything|whatever)\s+is\s+fine\b/.test(normalized);
}

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
    normalizedTopic === "something" ||
    normalizedTopic === "anything" ||
    normalizedTopic === "whatever"
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
  hasAutobiographicalGrounding: boolean;
  groundingSourceCount: number;
  turnGroundingCount: number;
  creatorHintsAvailable: boolean;
}): boolean {
  if (args.explicitIntent || args.hasActiveDraft || args.mode !== "plan") {
    return false;
  }

  if (isOpenEndedWildcardDraftRequest(args.userMessage)) {
    return false;
  }

  const broadTopic = inferBroadTopicDraftRequest(args.userMessage);
  const bareDraftRequest = isBareDraftRequest(args.userMessage);
  const multiDraftRequest = isMultiDraftRequest(args.userMessage);

  if (bareDraftRequest && !multiDraftRequest && !broadTopic) {
    return false;
  }

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

export function shouldForceLooseDraftIdeation(args: {
  userMessage: string;
  explicitIntent?: V2ChatIntent | null;
  hasActiveDraft: boolean;
}): boolean {
  if (
    args.explicitIntent &&
    args.explicitIntent !== "draft" &&
    args.explicitIntent !== "planner_feedback"
  ) {
    return false;
  }

  return (
    isOpenEndedWildcardDraftRequest(args.userMessage) ||
    isBareDraftRequest(args.userMessage)
  );
}
