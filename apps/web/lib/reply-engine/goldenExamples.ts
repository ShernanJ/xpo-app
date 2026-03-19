import type { Prisma } from "../generated/prisma/client.ts";
import { prisma } from "../db.ts";
import { retrieveAnchors } from "../agent-v2/core/retrieval.ts";
import type { ExtensionReplyMode } from "../extension/types.ts";

export interface RetrievedReplyGoldenExample {
  text: string;
  source: "golden_example" | "fallback_anchor";
  replyMode: ExtensionReplyMode;
}

const DEFAULT_GOLDEN_EXAMPLE_LIMIT = 5;
const MIN_GOLDEN_EXAMPLE_COUNT = 3;

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeHandle(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^@+/, "").toLowerCase() || "";
  return normalized || null;
}

function normalizeComparable(value: string): string {
  return normalizeWhitespace(value).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ");
}

function tokenize(value: string): string[] {
  return normalizeComparable(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function keywordOverlapScore(text: string, focus: string): number {
  const focusTokens = new Set(tokenize(focus));
  if (focusTokens.size === 0) {
    return 0;
  }

  const textTokens = tokenize(text);
  let matches = 0;
  for (const token of textTokens) {
    if (focusTokens.has(token)) {
      matches += 1;
    }
  }

  return matches;
}

function dedupeExamples(
  examples: RetrievedReplyGoldenExample[],
  limit: number,
): RetrievedReplyGoldenExample[] {
  const seen = new Set<string>();
  const next: RetrievedReplyGoldenExample[] = [];

  for (const example of examples) {
    const key = normalizeWhitespace(example.text).toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(example);
    if (next.length >= limit) {
      break;
    }
  }

  return next;
}

function asReplyMode(value: ExtensionReplyMode): ExtensionReplyMode {
  return value;
}

export function normalizeReplyGoldenExampleText(value: string): string {
  return normalizeWhitespace(value);
}

export function buildReplyGoldenExampleFocus(args: {
  sourceText: string;
  quotedText?: string | null;
  imageSummaryLines?: string[] | null;
  postIntent?: string | null;
}): string {
  return [
    args.sourceText,
    args.quotedText || "",
    ...(args.imageSummaryLines || []),
    args.postIntent || "",
  ]
    .map((value) => normalizeWhitespace(value || ""))
    .filter(Boolean)
    .join("\n");
}

function buildReplyModeWhere(args: {
  userId: string;
  xHandle: string | null;
  replyMode: ExtensionReplyMode;
}): Prisma.ReplyGoldenExampleWhereInput {
  return {
    userId: args.userId,
    replyMode: args.replyMode,
    ...(args.xHandle ? { xHandle: args.xHandle } : { xHandle: null }),
  };
}

export async function saveReplyGoldenExample(args: {
  userId: string;
  xHandle: string | null;
  replyMode: ExtensionReplyMode;
  text: string;
  source?: string;
}): Promise<boolean> {
  const normalizedText = normalizeReplyGoldenExampleText(args.text);
  if (!normalizedText) {
    return false;
  }

  const normalizedHandle = normalizeHandle(args.xHandle);
  const existing = await prisma.replyGoldenExample.findFirst({
    where: {
      userId: args.userId,
      replyMode: args.replyMode,
      normalizedText,
      ...(normalizedHandle ? { xHandle: normalizedHandle } : { xHandle: null }),
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.replyGoldenExample.update({
      where: { id: existing.id },
      data: {
        text: normalizedText,
        source: args.source?.trim() || "human_edit",
      },
    });
    return false;
  }

  await prisma.replyGoldenExample.create({
    data: {
      userId: args.userId,
      xHandle: normalizedHandle,
      replyMode: args.replyMode,
      text: normalizedText,
      normalizedText,
      source: args.source?.trim() || "human_edit",
    },
  });

  return true;
}

export async function retrieveReplyGoldenExamples(args: {
  userId: string;
  xHandle: string | null;
  replyMode: ExtensionReplyMode;
  sourceText: string;
  quotedText?: string | null;
  imageSummaryLines?: string[] | null;
  postIntent?: string | null;
  lane?: "reply" | "quote";
  preferredFormat?: "shortform" | "longform" | "thread";
  limit?: number;
  deps?: {
    findMany(args: Prisma.ReplyGoldenExampleFindManyArgs): Promise<
      Array<{
        text: string;
        replyMode: ExtensionReplyMode;
        createdAt: Date;
        updatedAt?: Date;
      }>
    >;
    retrieveAnchors?: typeof retrieveAnchors;
  };
}): Promise<RetrievedReplyGoldenExample[]> {
  const normalizedHandle = normalizeHandle(args.xHandle);
  const limit = Math.max(MIN_GOLDEN_EXAMPLE_COUNT, Math.min(args.limit ?? DEFAULT_GOLDEN_EXAMPLE_LIMIT, 5));
  const focus = buildReplyGoldenExampleFocus({
    sourceText: args.sourceText,
    quotedText: args.quotedText,
    imageSummaryLines: args.imageSummaryLines,
    postIntent: args.postIntent,
  });

  const stored = await (args.deps?.findMany || prisma.replyGoldenExample.findMany.bind(prisma.replyGoldenExample))({
    where: buildReplyModeWhere({
      userId: args.userId,
      xHandle: normalizedHandle,
      replyMode: args.replyMode,
    }),
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      text: true,
      replyMode: true,
      createdAt: true,
    },
  });

  const rankedStored = stored
    .map((entry, index) => ({
      score: keywordOverlapScore(entry.text, focus) * 10 + Math.max(0, 20 - index),
      example: {
        text: entry.text,
        source: "golden_example" as const,
        replyMode: asReplyMode(entry.replyMode),
      },
    }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.example);

  const dedupedStored = dedupeExamples(rankedStored, limit);
  if (dedupedStored.length >= MIN_GOLDEN_EXAMPLE_COUNT || !normalizedHandle) {
    return dedupedStored.slice(0, limit);
  }

  const retrieval = await (args.deps?.retrieveAnchors || retrieveAnchors)(args.userId, normalizedHandle, focus, {
    targetLane: args.lane || "reply",
    preferredFormat: args.preferredFormat || "shortform",
    limit,
  });

  const fallback = retrieval.laneAnchors
    .concat(retrieval.topicAnchors)
    .map((text) => ({
      text: normalizeReplyGoldenExampleText(text),
      source: "fallback_anchor" as const,
      replyMode: args.replyMode,
    }));

  return dedupeExamples([...dedupedStored, ...fallback], limit);
}
