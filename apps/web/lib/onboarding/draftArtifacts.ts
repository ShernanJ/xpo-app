import type { CreatorGenerationOutputShape } from "./generationContract";
import type { VoiceTarget } from "../agent-v2/core/voiceTarget";

export interface DraftArtifactPost {
  id: string;
  content: string;
  weightedCharacterCount: number;
  maxCharacterLimit: number;
  isWithinXLimit: boolean;
}

export interface DraftArtifactDetails {
  id: string;
  title: string;
  kind: CreatorGenerationOutputShape;
  content: string;
  posts: DraftArtifactPost[];
  characterCount: number;
  weightedCharacterCount: number;
  maxCharacterLimit: number;
  isWithinXLimit: boolean;
  supportAsset: string | null;
  betterClosers: string[];
  replyPlan: string[];
  voiceTarget: VoiceTarget | null;
  noveltyNotes: string[];
}

export interface DraftArtifactInput {
  id: string;
  title: string;
  kind: CreatorGenerationOutputShape;
  content: string;
  supportAsset: string | null;
  posts?: string[];
  replyPlan?: string[];
  voiceTarget?: VoiceTarget | null;
  noveltyNotes?: string[];
}

export const SHORT_FORM_X_LIMIT = 280;
export const LONG_FORM_X_LIMIT = 25_000;
export const THREAD_POST_X_LIMIT = 280;
export const THREAD_DEFAULT_POST_COUNT = 6;
export const THREAD_TOTAL_X_LIMIT = THREAD_POST_X_LIMIT * THREAD_DEFAULT_POST_COUNT;
export type DraftLengthMode = "shortform" | "longform" | "thread";

function getThreadPostLimit(): number {
  return THREAD_POST_X_LIMIT;
}

export function getXCharacterLimitForShape(
  outputShape: CreatorGenerationOutputShape,
): number {
  if (outputShape === "long_form_post") {
    return LONG_FORM_X_LIMIT;
  }

  if (outputShape === "thread_seed") {
    return THREAD_TOTAL_X_LIMIT;
  }

  return SHORT_FORM_X_LIMIT;
}

export function getXCharacterLimitForAccount(isVerified: boolean): number {
  return isVerified ? LONG_FORM_X_LIMIT : SHORT_FORM_X_LIMIT;
}

export function getXCharacterLimitForFormat(
  isVerified: boolean,
  formatPreference: DraftLengthMode,
): number {
  if (formatPreference === "thread") {
    return THREAD_TOTAL_X_LIMIT;
  }

  if (formatPreference === "longform" && isVerified) {
    return LONG_FORM_X_LIMIT;
  }

  return SHORT_FORM_X_LIMIT;
}

export function buildDraftArtifacts(params: {
  drafts: string[];
  outputShape: CreatorGenerationOutputShape | "ideation_angles";
  supportAsset: string | null;
  voiceTarget?: VoiceTarget | null;
  noveltyNotes?: string[];
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
      voiceTarget: params.voiceTarget ?? null,
      noveltyNotes: params.noveltyNotes || [],
    }),
  );
}

export function buildDraftArtifact(params: DraftArtifactInput): DraftArtifactDetails {
  const rawPosts =
    params.posts && params.posts.length > 0
      ? params.posts
      : params.kind === "thread_seed"
        ? splitDraftIntoThreadPosts(params.content)
        : [params.content.trim()];
  const posts = rawPosts
    .map((post) => post.trim())
    .filter(Boolean)
    .map((post, index) => buildArtifactPost(post, params.kind, index));
  const content =
    params.kind === "thread_seed"
      ? posts.map((post) => post.content).join("\n\n---\n\n")
      : posts[0]?.content || params.content.trim();
  const weightedCharacterCount = posts.reduce(
    (total, post) => total + post.weightedCharacterCount,
    0,
  );
  const maxCharacterLimit =
    params.kind === "thread_seed"
      ? THREAD_TOTAL_X_LIMIT
      : getXCharacterLimitForShape(params.kind);
  const isWithinXLimit =
    posts.every((post) => post.isWithinXLimit) &&
    weightedCharacterCount <= maxCharacterLimit;

  return {
    id: params.id,
    title: params.title,
    kind: params.kind,
    content,
    posts,
    characterCount: content.length,
    weightedCharacterCount,
    maxCharacterLimit,
    isWithinXLimit,
    supportAsset: params.supportAsset,
    betterClosers: buildBetterClosers(content, params.kind),
    replyPlan:
      params.replyPlan && params.replyPlan.length > 0
        ? params.replyPlan.slice(0, 3)
        : buildReplyPlan(posts, params.kind),
    voiceTarget: params.voiceTarget ?? null,
    noveltyNotes: (params.noveltyNotes || []).slice(0, 3),
  };
}

function buildArtifactPost(
  content: string,
  kind: CreatorGenerationOutputShape,
  index: number,
): DraftArtifactPost {
  const maxCharacterLimit =
    kind === "thread_seed" ? getThreadPostLimit() : getXCharacterLimitForShape(kind);
  const weightedCharacterCount = computeXWeightedCharacterCount(content);

  return {
    id: `post-${index + 1}`,
    content,
    weightedCharacterCount,
    maxCharacterLimit,
    isWithinXLimit: weightedCharacterCount <= maxCharacterLimit,
  };
}

export function buildDraftArtifactTitle(
  outputShape: CreatorGenerationOutputShape,
  index: number,
): string {
  switch (outputShape) {
    case "thread_seed":
      return `Thread ${index + 1}`;
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

function splitDraftIntoThreadPosts(value: string): string[] {
  const normalized = value.trim();
  if (!normalized) {
    return [];
  }

  const explicitSplit = normalized
    .split(/\n\s*---\s*\n/g)
    .map((part) => part.trim())
    .filter(Boolean);
  if (explicitSplit.length > 1) {
    return explicitSplit.map((part) => trimToXCharacterLimit(part, THREAD_POST_X_LIMIT));
  }

  const chunks = normalized
    .split(/\n{2,}/)
    .flatMap((paragraph) => splitChunkToThreadUnits(paragraph.trim()))
    .filter(Boolean);

  const posts: string[] = [];
  let current = "";

  for (const chunk of chunks) {
    const candidate = current ? `${current}\n\n${chunk}` : chunk;
    if (computeXWeightedCharacterCount(candidate) <= THREAD_POST_X_LIMIT) {
      current = candidate;
      continue;
    }

    if (current) {
      posts.push(current);
    }
    current = chunk;
  }

  if (current) {
    posts.push(current);
  }

  return posts.slice(0, THREAD_DEFAULT_POST_COUNT).map((post) =>
    trimToXCharacterLimit(post, THREAD_POST_X_LIMIT),
  );
}

function splitChunkToThreadUnits(chunk: string): string[] {
  if (!chunk) {
    return [];
  }

  if (computeXWeightedCharacterCount(chunk) <= THREAD_POST_X_LIMIT) {
    return [chunk];
  }

  const sentenceParts = chunk
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentenceParts.length > 1) {
    return sentenceParts.flatMap((part) => splitChunkToThreadUnits(part));
  }

  return splitLongChunkByWords(chunk);
}

function splitLongChunkByWords(chunk: string): string[] {
  const words = chunk.split(/\s+/).filter(Boolean);
  const units: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (computeXWeightedCharacterCount(candidate) <= THREAD_POST_X_LIMIT) {
      current = candidate;
      continue;
    }

    if (current) {
      units.push(current);
    }
    current = trimToXCharacterLimit(word, THREAD_POST_X_LIMIT);
  }

  if (current) {
    units.push(current);
  }

  return units;
}

export function buildBetterClosers(
  draft: string,
  kind: CreatorGenerationOutputShape,
): string[] {
  const lower = draft.toLowerCase();
  const suggestions = new Set<string>();

  if (kind === "thread_seed") {
    suggestions.add("if you want the breakdown, i'll post the next part.");
    suggestions.add("curious where you'd push back on this.");
    suggestions.add("if you've run into this too, tell me what broke first.");
  } else if (lower.includes("build") || lower.includes("project") || lower.includes("app")) {
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

function buildReplyPlan(
  posts: DraftArtifactPost[],
  kind: CreatorGenerationOutputShape,
): string[] {
  const seeds = posts
    .flatMap((post) =>
      post.content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .filter((line) => line.length >= 12)
    .slice(0, 4);
  const primary = seeds[0] || posts[0]?.content || "";
  const secondary = seeds[1] || primary;
  const tertiary = seeds[2] || secondary;

  if (kind === "reply_candidate") {
    return [
      `fair push. the concrete part i mean is ${cleanReplySeed(primary)}.`,
      `the example i had in mind: ${cleanReplySeed(secondary)}.`,
      `if i had to compress it even more: ${cleanReplySeed(tertiary)}.`,
    ].slice(0, 3);
  }

  if (kind === "thread_seed") {
    return [
      `quick add:\n\n${secondary}`,
      `the part i cut to keep this readable:\n\n${tertiary}`,
      "if people want the next part, i can break down the exact workflow.",
    ].slice(0, 3);
  }

  return [
    `quick add:\n\n${secondary}`,
    `the part i left out:\n\n${tertiary}`,
    "if people want it, i can unpack the exact steps in a follow-up.",
  ].slice(0, 3);
}

function cleanReplySeed(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[.?!:;,]+$/g, "")
    .trim()
    .slice(0, 180);
}
