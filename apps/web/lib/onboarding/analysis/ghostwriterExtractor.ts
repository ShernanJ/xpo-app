import { randomUUID } from "crypto";

import { generateObject } from "ai";
import { openai as createOpenAiModel } from "@ai-sdk/openai";
import { Prisma } from "@/lib/generated/prisma/client";
import type { Persona } from "@/lib/generated/prisma/client";
import OpenAI from "openai";
import { z } from "zod";

import {
  createEmptyStyleCard,
  StyleCardSchema,
  type VoiceStyleCard,
} from "@/lib/agent-v2/core/styleProfile";
import type { GhostwriterStyleCard } from "@/lib/agent-v2/contracts/types";
import { prisma } from "@/lib/db";
import type {
  XPostMetrics,
  XPublicPost,
} from "@/lib/onboarding/contracts/types";
import { readLatestScrapeCaptureByAccount } from "@/lib/onboarding/store/scrapeCaptureStore";

export type Tweet = XPublicPost;

const PERSONA_VALUES = [
  "EDUCATOR",
  "CURATOR",
  "ENTERTAINER",
  "DOCUMENTARIAN",
  "PROVOCATEUR",
  "CASUAL",
] as const;

const MIN_TEXT_HEAVY_WORDS = 10;
const SMALL_POOL_THRESHOLD = 200;
const SMALL_POOL_SELECTION_LIMIT = 30;
const STYLE_SAMPLE_LIMIT = 40;
const EMBEDDING_BATCH_SIZE = 20;

const GhostwriterStyleCardSchema: z.ZodType<GhostwriterStyleCard> = z.object({
  lexicon: z.object({
    topAdjectives: z.array(z.string()),
    transitionPhrases: z.array(z.string()),
    greetings: z.array(z.string()),
  }),
  formatting: z.object({
    casingPreference: z.enum(["lowercase", "sentence", "title", "mixed"]),
    avgParagraphLengthWords: z.number().int(),
    lineBreakFrequency: z.enum(["high", "medium", "low"]),
  }),
  punctuationAndSyntax: z.object({
    usesEmDashes: z.boolean(),
    usesEllipses: z.boolean(),
    rhetoricalQuestionFrequency: z.enum(["high", "medium", "low"]),
    topEmojis: z.array(z.string()),
  }),
});

const StyleCardAndPersonaSchema = z.object({
  ghostwriterStyleCard: GhostwriterStyleCardSchema,
  primaryPersona: z.enum(PERSONA_VALUES),
});

type VoiceProfileRecord = {
  id: string;
  userId: string;
  xHandle: string | null;
  styleCard: unknown;
  primaryPersona: Persona | null;
};

type StoredPostRecord = {
  id: string;
  text: string;
  createdAt: Date;
  metrics: unknown;
};

type ExtractorDeps = {
  prisma: typeof prisma;
  readLatestScrapeCaptureByAccount: typeof readLatestScrapeCaptureByAccount;
  embedTexts(texts: string[]): Promise<number[][]>;
  generateStyleCardAndPersona(tweets: Tweet[]): Promise<{
    ghostwriterStyleCard: GhostwriterStyleCard;
    primaryPersona: Persona;
  }>;
  uuid(): string;
};

type ExtractSemanticProfileArgs = {
  userId: string;
  xHandle: string;
};

type SemanticProfileResolution = {
  profile: VoiceProfileRecord;
  tweets: Tweet[];
};

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function stripUrls(value: string): string {
  return value.replace(/https?:\/\/\S+/gi, " ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  return 0;
}

function parsePostMetrics(value: unknown): XPostMetrics {
  const record = asRecord(value);

  return {
    likeCount: asCount(record?.likeCount),
    replyCount: asCount(record?.replyCount),
    repostCount: asCount(record?.repostCount),
    quoteCount: asCount(record?.quoteCount),
  };
}

function toFallbackTweet(post: StoredPostRecord): Tweet {
  return {
    id: post.id,
    text: post.text,
    createdAt: post.createdAt.toISOString(),
    metrics: parsePostMetrics(post.metrics),
    expandedUrls: null,
    imageUrls: null,
    linkSignal: null,
  };
}

function tokenizeWords(value: string): string[] {
  return stripUrls(normalizeWhitespace(value))
    .match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
}

function countNonUrlWords(value: string): number {
  return tokenizeWords(value).length;
}

function hasOnlyLowSignalBody(value: string): boolean {
  const stripped = stripUrls(normalizeWhitespace(value))
    .replace(/[@#][\p{L}\p{N}_]+/gu, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim();

  return stripped.length === 0;
}

function looksLikeLinkOrMediaOnly(tweet: Tweet): boolean {
  const nonUrlWordCount = countNonUrlWords(tweet.text);
  const hasExpandedUrls = (tweet.expandedUrls?.length ?? 0) > 0;
  const hasImages = (tweet.imageUrls?.length ?? 0) > 0;
  const hasInlineUrl = /https?:\/\/\S+/i.test(tweet.text);
  const linkSignal = tweet.linkSignal ?? null;

  if (hasOnlyLowSignalBody(tweet.text)) {
    return true;
  }

  if (linkSignal === "media_only" && nonUrlWordCount < 14) {
    return true;
  }

  if ((linkSignal === "external" || linkSignal === "mixed") && nonUrlWordCount < 12) {
    return true;
  }

  if ((hasExpandedUrls || hasInlineUrl || hasImages) && nonUrlWordCount < MIN_TEXT_HEAVY_WORDS) {
    return true;
  }

  return false;
}

function dedupeTweetsByText(tweets: Tweet[]): Tweet[] {
  const seen = new Set<string>();
  const next: Tweet[] = [];

  for (const tweet of tweets) {
    const normalized = normalizeWhitespace(tweet.text).toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    next.push(tweet);
  }

  return next;
}

function toTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function selectEligibleTextHeavyTweets(tweets: Tweet[]): Tweet[] {
  return dedupeTweetsByText(
    tweets.filter((tweet) => {
      const normalizedText = normalizeWhitespace(tweet.text);
      if (!normalizedText) {
        return false;
      }

      if (countNonUrlWords(normalizedText) < MIN_TEXT_HEAVY_WORDS) {
        return false;
      }

      return !looksLikeLinkOrMediaOnly(tweet);
    }),
  );
}

function computeEngagement(tweet: Tweet): number {
  return tweet.metrics.likeCount + tweet.metrics.repostCount + tweet.metrics.replyCount;
}

export function selectGoldenExampleTweets(tweets: Tweet[]): Tweet[] {
  if (tweets.length === 0) {
    return [];
  }

  const limit =
    tweets.length <= SMALL_POOL_THRESHOLD
      ? Math.min(SMALL_POOL_SELECTION_LIMIT, tweets.length)
      : Math.max(1, Math.ceil(tweets.length * 0.15));

  return [...tweets]
    .sort((left, right) => {
      const scoreDelta = computeEngagement(right) - computeEngagement(left);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return toTimestamp(right.createdAt) - toTimestamp(left.createdAt);
    })
    .slice(0, limit);
}

export function buildBaselineGhostwriterStyleCard(): GhostwriterStyleCard {
  return {
    lexicon: {
      topAdjectives: [],
      transitionPhrases: [],
      greetings: [],
    },
    formatting: {
      casingPreference: "sentence",
      avgParagraphLengthWords: 28,
      lineBreakFrequency: "medium",
    },
    punctuationAndSyntax: {
      usesEmDashes: false,
      usesEllipses: false,
      rhetoricalQuestionFrequency: "low",
      topEmojis: [],
    },
  };
}

function mergeGhostwriterStyleCard(
  existingStyleCard: VoiceStyleCard | null,
  ghostwriterStyleCard: GhostwriterStyleCard,
): VoiceStyleCard {
  const baseStyleCard = existingStyleCard ?? createEmptyStyleCard();

  return StyleCardSchema.parse({
    ...baseStyleCard,
    ghostwriterStyleCard,
  });
}

function parseSemanticStyleCard(styleCard: unknown): VoiceStyleCard | null {
  const parsed = StyleCardSchema.safeParse(styleCard);
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

function hasCompleteSemanticProfile(profile: Pick<VoiceProfileRecord, "styleCard" | "primaryPersona">): boolean {
  const parsedStyleCard = parseSemanticStyleCard(profile.styleCard);
  return Boolean(parsedStyleCard?.ghostwriterStyleCard && profile.primaryPersona);
}

function getOpenAiApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  return apiKey;
}

function resolveGhostwriterModel(): string {
  return (
    process.env.OPENAI_GHOSTWRITER_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini"
  );
}

async function embedTextsWithOpenAi(texts: string[]): Promise<number[][]> {
  const client = new OpenAI({
    apiKey: getOpenAiApiKey(),
  });
  const embeddings: number[][] = [];

  for (let index = 0; index < texts.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(index, index + EMBEDDING_BATCH_SIZE);
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: batch,
    });

    embeddings.push(...response.data.map((entry) => entry.embedding));
  }

  return embeddings;
}

function formatTweetsForPrompt(tweets: Tweet[]): string {
  return JSON.stringify(
    tweets.map((tweet) => ({
      id: tweet.id,
      createdAt: tweet.createdAt,
      text: normalizeWhitespace(tweet.text),
    })),
    null,
    2,
  );
}

async function generateStyleCardAndPersonaWithAi(tweets: Tweet[]): Promise<{
  ghostwriterStyleCard: GhostwriterStyleCard;
  primaryPersona: Persona;
}> {
  getOpenAiApiKey();

  const result = await generateObject({
    model: createOpenAiModel(resolveGhostwriterModel()),
    schema: StyleCardAndPersonaSchema,
    system: [
      "You are a forensic linguist analyzing an X/Twitter author's writing mechanics.",
      "Focus only on how the author writes, not what they are writing about.",
      "Analyze casing, punctuation, line breaks, emoji habits, paragraph rhythm, and lexical patterns.",
      "Ignore topics, industries, opinions, claims, and factual subject matter.",
      "Return a strict object that captures only durable stylistic mechanics plus the single best-fit persona.",
    ].join(" "),
    prompt: [
      "Analyze the following historical tweets.",
      "Treat them as writing samples only.",
      "Do not summarize topics.",
      "Do not infer biography or expertise.",
      "Tweets:",
      formatTweetsForPrompt(tweets),
    ].join("\n\n"),
  });

  return {
    ghostwriterStyleCard: result.object.ghostwriterStyleCard,
    primaryPersona: result.object.primaryPersona,
  };
}

function createDefaultDeps(): ExtractorDeps {
  return {
    prisma,
    readLatestScrapeCaptureByAccount,
    embedTexts: embedTextsWithOpenAi,
    generateStyleCardAndPersona: generateStyleCardAndPersonaWithAi,
    uuid: randomUUID,
  };
}

export function createGhostwriterExtractor(overrides: Partial<ExtractorDeps> = {}) {
  const deps = {
    ...createDefaultDeps(),
    ...overrides,
  } satisfies ExtractorDeps;

  async function resolveSemanticProfile(args: ExtractSemanticProfileArgs): Promise<SemanticProfileResolution> {
    const normalizedHandle = normalizeHandle(args.xHandle);
    const existingProfile = await deps.prisma.voiceProfile.findFirst({
      where: {
        userId: args.userId,
        xHandle: normalizedHandle,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        userId: true,
        xHandle: true,
        styleCard: true,
        primaryPersona: true,
      },
    });

    const profile =
      existingProfile ??
      (await deps.prisma.voiceProfile.create({
        data: {
          userId: args.userId,
          xHandle: normalizedHandle,
          styleCard: {},
        },
        select: {
          id: true,
          userId: true,
          xHandle: true,
          styleCard: true,
          primaryPersona: true,
        },
      }));

    const latestCapture = await deps.readLatestScrapeCaptureByAccount(normalizedHandle);
    if (latestCapture?.posts?.length) {
      return {
        profile,
        tweets: latestCapture.posts,
      };
    }

    const storedPosts = await deps.prisma.post.findMany({
      where: {
        userId: args.userId,
        xHandle: normalizedHandle,
        lane: "original",
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        text: true,
        createdAt: true,
        metrics: true,
      },
    });

    return {
      profile,
      tweets: storedPosts.map(toFallbackTweet),
    };
  }

  async function extractGoldenExamples(profileId: string, tweets: Tweet[]): Promise<void> {
    const existingCount = await deps.prisma.goldenExample.count({
      where: {
        profileId,
      },
    });
    if (existingCount > 0) {
      // TODO: add a separate periodic upsert flow for Golden Examples without touching style cards.
      return;
    }

    const eligibleTweets = selectGoldenExampleTweets(selectEligibleTextHeavyTweets(tweets));
    if (eligibleTweets.length < MIN_TEXT_HEAVY_WORDS) {
      return;
    }

    const contents = eligibleTweets.map((tweet) => normalizeWhitespace(tweet.text));
    const embeddings = await deps.embedTexts(contents);
    if (embeddings.length !== contents.length) {
      throw new Error("Embedding count did not match the selected Golden Example count.");
    }

    const inserts = contents.map((content, index) => {
      const embedding = embeddings[index];
      if (!Array.isArray(embedding) || embedding.length !== 1536) {
        throw new Error(`Expected a 1536-dimensional embedding for Golden Example ${index + 1}.`);
      }

      const id = deps.uuid();
      return deps.prisma.$executeRaw`
        INSERT INTO "GoldenExample" ("id", "profileId", "content", "embedding")
        VALUES (${id}, ${profileId}, ${content}, ${JSON.stringify(embedding)}::vector)
      `;
    });

    await deps.prisma.$transaction(inserts);
  }

  async function extractStyleCardAndPersona(profileId: string, tweets: Tweet[]): Promise<void> {
    const profile = await deps.prisma.voiceProfile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        styleCard: true,
        primaryPersona: true,
      },
    });
    if (!profile) {
      throw new Error(`VoiceProfile ${profileId} not found for semantic extraction.`);
    }

    if (hasCompleteSemanticProfile(profile)) {
      return;
    }

    const existingStyleCard = parseSemanticStyleCard(profile.styleCard);
    const eligibleTweets = selectEligibleTextHeavyTweets(
      [...tweets].sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt)),
    );

    if (eligibleTweets.length < MIN_TEXT_HEAVY_WORDS) {
      await deps.prisma.voiceProfile.update({
        where: {
          id: profileId,
        },
        data: {
          styleCard: mergeGhostwriterStyleCard(
            existingStyleCard,
            buildBaselineGhostwriterStyleCard(),
          ) as unknown as Prisma.InputJsonObject,
          primaryPersona: "CASUAL",
        },
      });
      return;
    }

    const sampleTweets = eligibleTweets.slice(0, STYLE_SAMPLE_LIMIT);
    const extracted = await deps.generateStyleCardAndPersona(sampleTweets);

    await deps.prisma.voiceProfile.update({
      where: {
        id: profileId,
      },
      data: {
        styleCard: mergeGhostwriterStyleCard(
          existingStyleCard,
          extracted.ghostwriterStyleCard,
        ) as unknown as Prisma.InputJsonObject,
        primaryPersona: extracted.primaryPersona,
      },
    });
  }

  async function extractSemanticProfileIfNeeded(args: ExtractSemanticProfileArgs): Promise<void> {
    const { profile, tweets } = await resolveSemanticProfile(args);
    const hasGoldenExamples = (await deps.prisma.goldenExample.count({
      where: {
        profileId: profile.id,
      },
    })) > 0;
    const hasCompleteStyleCard = hasCompleteSemanticProfile(profile);

    if (hasGoldenExamples && hasCompleteStyleCard) {
      return;
    }

    const tasks: Array<Promise<void>> = [];
    if (!hasGoldenExamples) {
      tasks.push(extractGoldenExamples(profile.id, tweets));
    }
    if (!hasCompleteStyleCard) {
      tasks.push(extractStyleCardAndPersona(profile.id, tweets));
    }

    await Promise.all(tasks);
  }

  return {
    extractGoldenExamples,
    extractSemanticProfileIfNeeded,
    extractStyleCardAndPersona,
  };
}

const defaultGhostwriterExtractor = createGhostwriterExtractor();

export const extractGoldenExamples = defaultGhostwriterExtractor.extractGoldenExamples;
export const extractStyleCardAndPersona =
  defaultGhostwriterExtractor.extractStyleCardAndPersona;
export const extractSemanticProfileIfNeeded =
  defaultGhostwriterExtractor.extractSemanticProfileIfNeeded;
