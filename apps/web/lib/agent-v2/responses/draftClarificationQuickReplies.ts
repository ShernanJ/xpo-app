import type { VoiceStyleCard } from "../core/styleProfile.ts";
import type {
  CreatorChatQuickReply,
  DraftFormatPreference,
} from "../contracts/chat.ts";
import {
  hasStrongDraftCommand,
  isBareDraftRequest,
  isBareIdeationRequest,
} from "../core/conversationHeuristics.ts";
import { buildDynamicDraftChoices } from "./clarificationDraftChips.ts";
import {
  applyQuickReplyVoiceCase,
  normalizeQuickReplyLabel,
  resolveQuickReplyVoiceProfile,
} from "./quickReplyVoice.ts";

function normalizeLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.?!,:;]+$/g, "").trim();
}

function stripLeadingConjunction(value: string): string {
  return value.replace(/^(?:and|or)\s+/i, "").trim();
}

function stripLeadingArticle(value: string): string {
  return value.replace(/^(?:a|an|the)\s+/i, "").trim();
}

function looksLikeDraftClarification(args: {
  question: string;
  userMessage: string;
}): boolean {
  const normalizedQuestion = normalizeLine(args.question).toLowerCase();
  const normalizedUserMessage = normalizeLine(args.userMessage).toLowerCase();

  return (
    isBareDraftRequest(args.userMessage) ||
    isBareIdeationRequest(args.userMessage) ||
    hasStrongDraftCommand(args.userMessage) ||
    /\b(?:post|thread|tweet|story|insight|angle|direction|lesson|proof point|metric)\b/.test(
      normalizedQuestion,
    ) ||
    /\bwhat specific\b/.test(normalizedQuestion) ||
    /\bwhich\b.+\b(?:post|thread|angle|direction)\b/.test(normalizedQuestion) ||
    /\b(?:write|draft|make|create|generate)\b/.test(normalizedUserMessage)
  );
}

function extractChoiceFragment(question: string): string {
  const lastLine = question
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter(Boolean)
    .pop() || "";

  const separatorMatches = [...lastLine.matchAll(/\s[-:]\s/g)];
  if (separatorMatches.length > 0) {
    const lastMatch = separatorMatches[separatorMatches.length - 1];
    const fragment = lastLine.slice((lastMatch.index || 0) + lastMatch[0].length).trim();
    if (fragment.includes(",") || /\sor\s/i.test(fragment)) {
      return fragment;
    }
  }

  return lastLine;
}

function extractQuestionChoices(question: string): string[] {
  const fragment = stripTrailingPunctuation(extractChoiceFragment(question));
  if (!fragment) {
    return [];
  }

  const normalizedFragment = fragment
    .replace(/\s*,?\s+or\s+/gi, "|")
    .replace(/\s*,\s*/g, "|");
  const rawParts = normalizedFragment
    .split("|")
    .map((part) => stripTrailingPunctuation(stripLeadingConjunction(part)))
    .filter(Boolean);

  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const part of rawParts) {
    const normalized = part.toLowerCase();
    if (
      seen.has(normalized) ||
      normalized.length < 3 ||
      normalized.length > 60 ||
      /\b(?:what|which|who|where|when|why|how)\b/.test(normalized)
    ) {
      continue;
    }

    seen.add(normalized);
    deduped.push(part);
  }

  return deduped.length >= 2 && deduped.length <= 4 ? deduped : [];
}

export function buildDraftClarificationQuickReplies(args: {
  question: string;
  userMessage: string;
  styleCard: VoiceStyleCard | null;
  topicAnchors: string[];
  seedTopic?: string | null;
  isVerifiedAccount: boolean;
  requestedFormatPreference?: DraftFormatPreference | null;
}): CreatorChatQuickReply[] {
  if (
    !looksLikeDraftClarification({
      question: args.question,
      userMessage: args.userMessage,
    })
  ) {
    return [];
  }

  const voice = resolveQuickReplyVoiceProfile(args.styleCard);
  const parsedChoices = extractQuestionChoices(args.question);

  if (parsedChoices.length > 0) {
    return parsedChoices.slice(0, 3).map((choice) => ({
      kind: "clarification_choice",
      value: applyQuickReplyVoiceCase(normalizeLine(choice), voice),
      label: normalizeQuickReplyLabel(stripLeadingArticle(choice), voice),
      explicitIntent: "plan",
      ...(args.requestedFormatPreference
        ? { formatPreference: args.requestedFormatPreference }
        : {}),
    }));
  }

  return buildDynamicDraftChoices({
    styleCard: args.styleCard,
    topicAnchors: args.topicAnchors,
    seedTopic: args.seedTopic || null,
    isVerifiedAccount: args.isVerifiedAccount,
    requestedFormatPreference: args.requestedFormatPreference,
    mode: args.seedTopic ? "topic_known" : "loose",
  });
}
