function looksLikeSemanticCorrection(message: string): boolean {
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
    "where did you get the idea",
    "why did you write",
    "you didn't ask",
    "you didnt ask",
  ].some((candidate) => normalized.includes(candidate));
}

function hasConcreteCorrectionDetail(message: string): boolean {
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
    return `fair call. what should the post say instead of that assumption?`;
  }

  return `got you. what's the exact point about ${topic} i should lock onto before i rewrite it?`;
}
