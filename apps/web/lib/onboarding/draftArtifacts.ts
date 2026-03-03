import type { CreatorGenerationOutputShape } from "./generationContract";

export interface DraftArtifactDetails {
  id: string;
  title: string;
  kind: CreatorGenerationOutputShape;
  content: string;
  characterCount: number;
  weightedCharacterCount: number;
  maxCharacterLimit: number;
  isWithinXLimit: boolean;
  supportAsset: string | null;
  betterClosers: string[];
  replyPlan: string[];
}

export interface DraftArtifactInput {
  id: string;
  title: string;
  kind: CreatorGenerationOutputShape;
  content: string;
  supportAsset: string | null;
}

export const SHORT_FORM_X_LIMIT = 280;
export const LONG_FORM_X_LIMIT = 25_000;

export function getXCharacterLimitForShape(
  outputShape: CreatorGenerationOutputShape,
): number {
  return outputShape === "long_form_post" ? LONG_FORM_X_LIMIT : SHORT_FORM_X_LIMIT;
}

export function getXCharacterLimitForAccount(isVerified: boolean): number {
  return isVerified ? LONG_FORM_X_LIMIT : SHORT_FORM_X_LIMIT;
}

export function buildDraftArtifacts(params: {
  drafts: string[];
  outputShape: CreatorGenerationOutputShape | "ideation_angles";
  supportAsset: string | null;
}): DraftArtifactDetails[] {
  if (params.outputShape === "ideation_angles") {
    return [];
  }

  const artifactKind = params.outputShape;

  return params.drafts.map((draft, index) =>
    buildDraftArtifact({
      id: `${artifactKind}-${index + 1}`,
      title: buildDraftArtifactTitle(artifactKind, index),
      kind: artifactKind,
      content: draft,
      supportAsset: params.supportAsset,
    }),
  );
}

export function buildDraftArtifact(params: DraftArtifactInput): DraftArtifactDetails {
  const weightedCharacterCount = computeXWeightedCharacterCount(params.content);
  const maxCharacterLimit = getXCharacterLimitForShape(params.kind);

  return {
    id: params.id,
    title: params.title,
    kind: params.kind,
    content: params.content,
    characterCount: params.content.length,
    weightedCharacterCount,
    maxCharacterLimit,
    isWithinXLimit: weightedCharacterCount <= maxCharacterLimit,
    supportAsset: params.supportAsset,
    betterClosers: buildBetterClosers(params.content, params.kind),
    replyPlan: buildReplyPlan(params.content, params.kind),
  };
}

export function buildDraftArtifactTitle(
  outputShape: CreatorGenerationOutputShape,
  index: number,
): string {
  switch (outputShape) {
    case "thread_seed":
      return `Thread Seed ${index + 1}`;
    case "long_form_post":
      return `Long Form ${index + 1}`;
    case "reply_candidate":
      return `Reply ${index + 1}`;
    case "quote_candidate":
      return `Quote ${index + 1}`;
    case "short_form_post":
    default:
      return `Draft ${index + 1}`;
  }
}

export function computeXWeightedCharacterCount(text: string): number {
  const urlRegex = /https?:\/\/\S+/gi;
  let weighted = 0;
  let lastIndex = 0;

  for (const match of text.matchAll(urlRegex)) {
    const start = match.index ?? 0;
    weighted += countWeightedSegment(text.slice(lastIndex, start));
    weighted += 23;
    lastIndex = start + match[0].length;
  }

  weighted += countWeightedSegment(text.slice(lastIndex));
  return weighted;
}

export function trimToXCharacterLimit(text: string, maxCharacterLimit: number): string {
  if (computeXWeightedCharacterCount(text) <= maxCharacterLimit) {
    return text;
  }

  const urlRegex = /https?:\/\/\S+/gi;
  let remaining = maxCharacterLimit;
  let result = "";
  let lastIndex = 0;

  for (const match of text.matchAll(urlRegex)) {
    const start = match.index ?? 0;
    const segment = text.slice(lastIndex, start);
    const trimmedSegment = trimSegmentToWeightedLimit(segment, remaining);

    result += trimmedSegment.value;
    remaining -= trimmedSegment.weightUsed;

    if (trimmedSegment.wasTrimmed || remaining <= 0) {
      return result.trimEnd();
    }

    if (remaining < 23) {
      return result.trimEnd();
    }

    result += match[0];
    remaining -= 23;
    lastIndex = start + match[0].length;
  }

  const finalSegment = trimSegmentToWeightedLimit(text.slice(lastIndex), remaining);
  result += finalSegment.value;

  return result.trimEnd();
}

function countWeightedSegment(value: string): number {
  let total = 0;

  for (const char of Array.from(value)) {
    total += isWideCharacter(char) ? 2 : 1;
  }

  return total;
}

function trimSegmentToWeightedLimit(value: string, limit: number): {
  value: string;
  weightUsed: number;
  wasTrimmed: boolean;
} {
  if (limit <= 0 || !value) {
    return {
      value: "",
      weightUsed: 0,
      wasTrimmed: value.length > 0,
    };
  }

  let total = 0;
  let endIndex = 0;

  for (const char of Array.from(value)) {
    const charWeight = isWideCharacter(char) ? 2 : 1;
    if (total + charWeight > limit) {
      break;
    }
    total += charWeight;
    endIndex += char.length;
  }

  const sliced = value.slice(0, endIndex);

  return {
    value: sliced,
    weightUsed: total,
    wasTrimmed: endIndex < value.length,
  };
}

function isWideCharacter(char: string): boolean {
  return /[\u1100-\u115F\u2329\u232A\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(
    char,
  );
}

export function buildBetterClosers(
  draft: string,
  kind: CreatorGenerationOutputShape,
): string[] {
  const lower = draft.toLowerCase();
  const suggestions = new Set<string>();

  if (lower.includes("build") || lower.includes("project") || lower.includes("app")) {
    suggestions.add("thoughts?");
    suggestions.add("would you use this?");
    suggestions.add("what would you add?");
  } else if (kind === "reply_candidate" || kind === "quote_candidate") {
    suggestions.add("fair take or am i off?");
    suggestions.add("curious if you see it the same way");
  } else {
    suggestions.add("agree or am i off?");
    suggestions.add("curious if anyone else has felt this");
    suggestions.add("thoughts?");
  }

  return Array.from(suggestions).slice(0, 3);
}

export function buildReplyPlan(
  draft: string,
  kind: CreatorGenerationOutputShape,
): string[] {
  const plan: string[] = [];

  if (kind === "reply_candidate") {
    plan.push(
      "If they engage, ask one tighter follow-up instead of dropping a second argument.",
    );
    plan.push(
      "If they push back, reply with one concrete example instead of broadening the claim.",
    );
    return plan;
  }

  if (draft.trim().endsWith("?")) {
    plan.push("Reply to the first useful answer quickly and ask one deeper follow-up.");
  } else {
    plan.push(
      "When someone asks for details, reply with the concrete step, metric, or build constraint you left out.",
    );
  }

  plan.push(
    "If someone disagrees, answer with one specific example before defending the whole thesis.",
  );
  plan.push("If the thread gets traction, pin one short follow-up that adds the missing proof.");
  return plan.slice(0, 3);
}
