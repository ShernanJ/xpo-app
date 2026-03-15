import type { ClarificationState } from "../contracts/chat";

export function looksLikeSemanticCorrection(message: string): boolean {
  const normalized = message.trim().toLowerCase();

  return [
    "not what i meant",
    "that's not what i meant",
    "thats not what i meant",
    "you assumed",
    "you just assumed",
    "you misunderstood",
    "you misread",
    "you flipped it",
    "you flipped it around",
    "you got it backwards",
    "that's backwards",
    "thats backwards",
    "that's not right",
    "thats not right",
    "that doesn't make sense",
    "that doesnt make sense",
    "this doesn't make sense",
    "this doesnt make sense",
    "where did you get that",
    "where did that come from",
    "where did you get that information",
    "where did you get this information",
    "where did you get the idea",
    "why did you write",
    "that was a question",
    "no that was a question",
    "dont falsify",
    "don't falsify",
    "do not falsify",
    "i dont wanna falsify",
    "i don't wanna falsify",
    "that's fake",
    "thats fake",
    "made up",
    "you made this up",
    "invented",
    "hallucinated",
    "you didn't ask",
    "you didnt ask",
    "i was correcting you",
    "i was just correcting you",
    "that was a correction",
    "that's not a pain point",
    "thats not a pain point",
  ].some((candidate) => normalized.includes(candidate));
}

export function hasConcreteCorrectionDetail(message: string): boolean {
  const normalized = message.trim().toLowerCase();

  if (normalized.length < 24) {
    return false;
  }

  return [
    "actually",
    "it's ",
    "its ",
    "it is ",
    "i mean",
    "the point is",
    "the real point",
    "the issue is",
    "what i mean is",
    "what i meant is",
    "my extension",
    "my app",
    "my tool",
    "it helps",
    "it does",
    "it lets",
    "it works",
    "it converts",
    "it rewrites",
    "works for",
    "because",
    "doesn't",
    "doesnt",
  ].some((candidate) => normalized.includes(candidate));
}

export function inferCorrectionRepairQuestion(
  userMessage: string,
  topicSummary: string | null,
): string | null {
  if (!looksLikeSemanticCorrection(userMessage)) {
    return null;
  }

  if (hasConcreteCorrectionDetail(userMessage)) {
    return null;
  }

  const normalized = userMessage.trim().toLowerCase();
  const topic = topicSummary?.trim().replace(/[.?!,]+$/, "") || "this";

  if (
    normalized.includes("you flipped it") ||
    normalized.includes("backwards") ||
    normalized.includes("misread")
  ) {
    return `got you. what's the exact relationship i should keep straight about ${topic}?`;
  }

  if (normalized.includes("you assumed") || normalized.includes("you didn't ask")) {
    return `fair. what's the key detail about ${topic} that i should've asked before drafting?`;
  }

  if (normalized.includes("where did you get the idea") || normalized.includes("why did you write")) {
    return "fair call. what should the post say instead of that assumption?";
  }

  if (
    normalized.includes("where did you get that") ||
    normalized.includes("where did that come from") ||
    normalized.includes("falsify") ||
    normalized.includes("fake") ||
    normalized.includes("made up") ||
    normalized.includes("invented") ||
    normalized.includes("hallucinated")
  ) {
    return "fair call. what should i keep factual, and what should i strip out before i rewrite it?";
  }

  if (normalized.includes("that was a question")) {
    return "got it. do you want me to answer that question directly, or turn it into a draft?";
  }

  return `got you. what's the exact point about ${topic} i should lock onto before i rewrite it?`;
}

export function normalizeRepairDetail(message: string): string {
  return message
    .trim()
    .replace(/^(?:but|and|ok|okay|nah|no)\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.?!,]+$/, "");
}

export function extractLatestCorrectionLock(activeConstraints: string[]): string | null {
  const latest = activeConstraints
    .slice()
    .reverse()
    .find((constraint) => /^Correction lock:/i.test(constraint));

  return latest ? latest.replace(/^Correction lock:\s*/i, "").trim() || null : null;
}

function normalizeTopicToken(value: string): string {
  return value.trim().toLowerCase().replace(/[.?!,]+$/, "");
}

function extractGroundingPayload(constraint: string): string | null {
  if (/^Correction lock:/i.test(constraint)) {
    return constraint.replace(/^Correction lock:\s*/i, "").trim() || null;
  }

  if (/^Topic grounding:/i.test(constraint)) {
    return constraint.replace(/^Topic grounding:\s*/i, "").trim() || null;
  }

  return null;
}

export function extractTopicGrounding(
  activeConstraints: string[],
  topic: string,
): string | null {
  const normalizedTopic = normalizeTopicToken(topic);
  if (!normalizedTopic) {
    return null;
  }

  const details = activeConstraints
    .map((constraint) => extractGroundingPayload(constraint))
    .filter((detail): detail is string => Boolean(detail))
    .filter((detail) => normalizeTopicToken(detail).includes(normalizedTopic));

  const uniqueDetails = Array.from(new Set(details.map((detail) => detail.trim()).filter(Boolean)));
  return uniqueDetails.length > 0 ? uniqueDetails.join(". ") : null;
}

export function buildSemanticCorrectionAcknowledgment(args: {
  userMessage: string;
  activeConstraints: string[];
  hadPendingPlan: boolean;
}): string | null {
  const detail = hasConcreteCorrectionDetail(args.userMessage)
    ? normalizeRepairDetail(args.userMessage)
    : extractLatestCorrectionLock(args.activeConstraints);

  if (!detail) {
    return null;
  }

  const normalized = args.userMessage.trim().toLowerCase();
  const correctionLead =
    normalized.includes("correcting you") ||
    normalized.includes("that was a correction") ||
    normalized.includes("not a pain point")
      ? "right. you were correcting me."
      : "right.";
  const correctionClose = args.hadPendingPlan
    ? " want me to rework the post around that?"
    : " i'll keep that straight from here.";

  return `${correctionLead} i'll keep this factual: ${detail}.${correctionClose}`;
}

export function buildSemanticRepairState(topicSummary: string | null): ClarificationState {
  return {
    branchKey: "semantic_repair",
    stepKey: "await_exact_fix",
    seedTopic: topicSummary,
    options: [],
  };
}

export function buildSemanticRepairDirective(
  userMessage: string,
  topicSummary: string | null,
): { constraint: string; rewriteRequest: string } {
  const detail = normalizeRepairDetail(userMessage);
  const topic = topicSummary?.trim().replace(/[.?!,]+$/, "") || "the topic";
  const constraint = `Correction lock: ${detail}`;

  return {
    constraint,
    rewriteRequest:
      `edit the current draft to reflect this exact correction about ${topic}: ${detail}. ` +
      "remove the old assumption and keep this relationship accurate.",
  };
}
