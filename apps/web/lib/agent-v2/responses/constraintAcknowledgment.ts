import { getTurnRelationContext } from "../runtime/turnRelation.ts";

/** Determines whether a message is a constraint declaration (e.g. "no emojis"). */
export function isConstraintDeclaration(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (normalized.length > 80) {
    return false;
  }

  const constraintPatterns = [
    /^no\s+\w+/,
    /^don'?t\s+(use|say|mention|include|add)\b/,
    /^never\s+(use|say|mention|include|add)\b/,
    /^avoid\s+\w+/,
    /^stop\s+(using|saying|mentioning|adding)\b/,
    /^keep\s+it\s+(under|short|tight|casual|natural)/,
    /^(less|more)\s+\w+$/,
  ];

  return constraintPatterns.some((pattern) => pattern.test(normalized));
}

function hasDraftInPlay(recentHistory: string): boolean {
  const { lastAssistantTurn } = getTurnRelationContext(recentHistory);
  if (!lastAssistantTurn) {
    return false;
  }

  const normalized = lastAssistantTurn.toLowerCase();
  return [
    "here's the draft",
    "here's a draft",
    "drafted",
    "updated it",
    "made the edit",
    "take a look",
    "version for you",
    "want any tweaks",
    "before posting",
  ].some((cue) => normalized.includes(cue));
}

/** Build a short acknowledgment for a constraint declaration. */
export function buildConstraintAcknowledgment(args: {
  message: string;
  recentHistory?: string;
}): string {
  const normalized = args.message.trim().toLowerCase();
  const shouldOfferRevision = hasDraftInPlay(args.recentHistory || "");

  if (normalized.includes("emoji")) {
    return shouldOfferRevision
      ? "got it. no emojis. i can clean up the current draft too if you want."
      : "got it. no emojis going forward.";
  }

  if (normalized.includes("hashtag")) {
    return shouldOfferRevision
      ? "noted. no hashtags. i can clean up the current draft too if you want."
      : "noted. no hashtags going forward.";
  }

  if (normalized.includes("cta") || normalized.includes("call to action")) {
    return shouldOfferRevision
      ? "got it. i'll keep it cta-free. i can revise the current draft too if you want."
      : "got it. i'll keep it cta-free.";
  }

  if (normalized.includes("shorter") || normalized.includes("under")) {
    return shouldOfferRevision
      ? "got it. i'll keep it tighter. i can trim the current draft too if you want."
      : "got it. i'll keep it tighter.";
  }

  if (/\bless\s+\w+/.test(normalized) || /\bmore\s+\w+/.test(normalized)) {
    return shouldOfferRevision
      ? "noted. i'll apply that going forward. i can revise the current draft with that in mind too."
      : "noted. i'll apply that going forward.";
  }

  return shouldOfferRevision
    ? "got it. i'll keep that in mind, and i can revise the current draft too if you want."
    : "got it. i'll keep that in mind for this thread.";
}
