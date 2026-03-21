import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  buildBaselineGhostwriterStyleCard,
  createGhostwriterExtractor,
  selectEligibleTextHeavyTweets,
  selectGoldenExampleTweets,
  type Tweet,
} from "./ghostwriterExtractor";
import {
  createEmptyStyleCard,
  StyleCardSchema,
} from "@/lib/agent-v2/core/styleProfile";

function buildTweet(args: {
  id: string;
  text?: string;
  createdAt?: string;
  likeCount?: number;
  replyCount?: number;
  repostCount?: number;
  expandedUrls?: string[] | null;
  imageUrls?: string[] | null;
  linkSignal?: Tweet["linkSignal"];
}): Tweet {
  return {
    id: args.id,
    text:
      args.text ??
      `This is tweet ${args.id} with enough descriptive words to qualify as text heavy content today`,
    createdAt: args.createdAt ?? "2026-03-20T12:00:00.000Z",
    metrics: {
      likeCount: args.likeCount ?? 0,
      replyCount: args.replyCount ?? 0,
      repostCount: args.repostCount ?? 0,
      quoteCount: 0,
    },
    expandedUrls: args.expandedUrls ?? null,
    imageUrls: args.imageUrls ?? null,
    linkSignal: args.linkSignal ?? null,
  };
}

function buildSemanticStyleCard() {
  return StyleCardSchema.parse({
    ...createEmptyStyleCard(),
    ghostwriterStyleCard: buildBaselineGhostwriterStyleCard(),
  });
}

function createHarness(args?: {
  goldenExampleCount?: number;
  profileStyleCard?: unknown;
  primaryPersona?: "EDUCATOR" | "CURATOR" | "ENTERTAINER" | "DOCUMENTARIAN" | "PROVOCATEUR" | "CASUAL" | null;
}) {
  const executeRawCalls: Array<{ strings: string[]; values: unknown[] }> = [];
  let uuidCounter = 0;

  const prismaMock = {
    goldenExample: {
      count: vi.fn().mockResolvedValue(args?.goldenExampleCount ?? 0),
    },
    voiceProfile: {
      findUnique: vi.fn().mockResolvedValue({
        id: "vp_1",
        styleCard: args?.profileStyleCard ?? {},
        primaryPersona: args?.primaryPersona ?? null,
      }),
      findFirst: vi.fn().mockResolvedValue({
        id: "vp_1",
        userId: "user_1",
        xHandle: "stan",
        styleCard: args?.profileStyleCard ?? {},
        primaryPersona: args?.primaryPersona ?? null,
      }),
      create: vi.fn().mockResolvedValue({
        id: "vp_1",
        userId: "user_1",
        xHandle: "stan",
        styleCard: {},
        primaryPersona: null,
      }),
      update: vi.fn().mockResolvedValue(undefined),
    },
    post: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $executeRaw: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      executeRawCalls.push({
        strings: Array.from(strings),
        values,
      });
      return Promise.resolve(1);
    }),
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  };

  const deps = {
    prisma: prismaMock as never,
    readLatestScrapeCaptureByAccount: vi.fn().mockResolvedValue(null),
    embedTexts: vi.fn(),
    generateStyleCardAndPersona: vi.fn(),
    uuid: vi.fn(() => `ge_${++uuidCounter}`),
  };

  return {
    deps,
    executeRawCalls,
    extractor: createGhostwriterExtractor(deps),
    prismaMock,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("selectEligibleTextHeavyTweets", () => {
  test("filters short, duplicate, and link/media-only tweets", () => {
    const tweets = [
      buildTweet({
        id: "short",
        text: "too short to qualify for this filter today",
      }),
      buildTweet({
        id: "link-only",
        text: "https://example.com https://example.com/2",
        expandedUrls: ["https://example.com"],
        linkSignal: "external",
      }),
      buildTweet({
        id: "media-only",
        text: "launch graphic attached below",
        imageUrls: ["https://img.example.com/post.png"],
        linkSignal: "media_only",
      }),
      buildTweet({
        id: "eligible",
        text:
          "This thread opener has enough words and actual commentary to count as a strong text heavy post",
        expandedUrls: ["https://example.com"],
        linkSignal: "mixed",
      }),
      buildTweet({
        id: "duplicate",
        text:
          "This thread opener has enough words and actual commentary to count as a strong text heavy post",
      }),
    ];

    expect(selectEligibleTextHeavyTweets(tweets).map((tweet) => tweet.id)).toEqual(["eligible"]);
  });
});

describe("selectGoldenExampleTweets", () => {
  test("takes the top 30 tweets for smaller pools", () => {
    const tweets = Array.from({ length: 50 }, (_, index) =>
      buildTweet({
        id: `tweet_${index + 1}`,
        likeCount: index + 1,
      }),
    );

    const selected = selectGoldenExampleTweets(tweets);
    expect(selected).toHaveLength(30);
    expect(selected[0]?.id).toBe("tweet_50");
    expect(selected.at(-1)?.id).toBe("tweet_21");
  });

  test("takes the top 15 percent for larger pools", () => {
    const tweets = Array.from({ length: 240 }, (_, index) =>
      buildTweet({
        id: `tweet_${index + 1}`,
        likeCount: index + 1,
      }),
    );

    const selected = selectGoldenExampleTweets(tweets);
    expect(selected).toHaveLength(36);
    expect(selected[0]?.id).toBe("tweet_240");
    expect(selected.at(-1)?.id).toBe("tweet_205");
  });
});

describe("ghostwriter extractor service", () => {
  test("skips Golden Example extraction for cold starts", async () => {
    const { extractor, deps, executeRawCalls } = createHarness();
    const tweets = Array.from({ length: 9 }, (_, index) =>
      buildTweet({ id: `tweet_${index + 1}` }),
    );

    await extractor.extractGoldenExamples("vp_1", tweets);

    expect(deps.embedTexts).not.toHaveBeenCalled();
    expect(executeRawCalls).toHaveLength(0);
  });

  test("writes a baseline ghostwriter style card and CASUAL persona for cold starts", async () => {
    const { extractor, prismaMock } = createHarness();
    const tweets = Array.from({ length: 9 }, (_, index) =>
      buildTweet({ id: `tweet_${index + 1}` }),
    );

    await extractor.extractStyleCardAndPersona("vp_1", tweets);

    expect(prismaMock.voiceProfile.update).toHaveBeenCalledTimes(1);
    const updateArgs = prismaMock.voiceProfile.update.mock.calls[0]?.[0];
    const parsed = StyleCardSchema.parse(updateArgs?.data?.styleCard);

    expect(updateArgs?.data?.primaryPersona).toBe("CASUAL");
    expect(parsed.ghostwriterStyleCard).toEqual(buildBaselineGhostwriterStyleCard());
  });

  test("skips style extraction when a semantic ghostwriter profile already exists", async () => {
    const { extractor, deps, prismaMock } = createHarness({
      profileStyleCard: buildSemanticStyleCard(),
      primaryPersona: "CURATOR",
    });
    const tweets = Array.from({ length: 12 }, (_, index) =>
      buildTweet({ id: `tweet_${index + 1}` }),
    );

    await extractor.extractStyleCardAndPersona("vp_1", tweets);

    expect(deps.generateStyleCardAndPersona).not.toHaveBeenCalled();
    expect(prismaMock.voiceProfile.update).not.toHaveBeenCalled();
  });

  test("skips Golden Example extraction when rows already exist", async () => {
    const { extractor, deps } = createHarness({
      goldenExampleCount: 3,
    });
    const tweets = Array.from({ length: 12 }, (_, index) =>
      buildTweet({ id: `tweet_${index + 1}` }),
    );

    await extractor.extractGoldenExamples("vp_1", tweets);

    expect(deps.embedTexts).not.toHaveBeenCalled();
  });

  test("inserts embeddings with parameterized raw SQL and explicit ids", async () => {
    const { extractor, deps, executeRawCalls, prismaMock } = createHarness();
    const tweets = Array.from({ length: 12 }, (_, index) =>
      buildTweet({
        id: `tweet_${index + 1}`,
        likeCount: index + 1,
        createdAt: `2026-03-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
      }),
    );
    deps.embedTexts.mockResolvedValue(
      Array.from({ length: 12 }, () => Array.from({ length: 1536 }, () => 0.01)),
    );

    await extractor.extractGoldenExamples("vp_1", tweets);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(executeRawCalls).toHaveLength(12);
    expect(executeRawCalls[0]?.strings.join("")).toContain(
      'INSERT INTO "GoldenExample" ("id", "profileId", "content", "embedding")',
    );
    expect(executeRawCalls[0]?.strings.join("")).toContain("::vector");
    expect(executeRawCalls[0]?.values[0]).toBe("ge_1");
    expect(executeRawCalls[0]?.values[1]).toBe("vp_1");
    expect(typeof executeRawCalls[0]?.values[2]).toBe("string");
    expect(typeof executeRawCalls[0]?.values[3]).toBe("string");
  });

  test("merges new ghostwriter output into an existing style card without dropping preferences", async () => {
    const { extractor, deps, prismaMock } = createHarness({
      profileStyleCard: StyleCardSchema.parse({
        ...createEmptyStyleCard(),
        userPreferences: {
          casing: "lowercase",
          bulletStyle: "dash",
          emojiUsage: "off",
          profanity: "off",
          blacklist: ["synergy"],
          writingGoal: "balanced",
          verifiedMaxChars: 280,
        },
      }),
    });
    const tweets = Array.from({ length: 12 }, (_, index) =>
      buildTweet({ id: `tweet_${index + 1}` }),
    );
    deps.generateStyleCardAndPersona.mockResolvedValue({
      ghostwriterStyleCard: {
        lexicon: {
          topAdjectives: ["direct"],
          transitionPhrases: ["but"],
          greetings: ["hey"],
        },
        formatting: {
          casingPreference: "lowercase",
          avgParagraphLengthWords: 22,
          lineBreakFrequency: "medium",
        },
        punctuationAndSyntax: {
          usesEmDashes: false,
          usesEllipses: true,
          rhetoricalQuestionFrequency: "low",
          topEmojis: [],
        },
      },
      primaryPersona: "EDUCATOR",
    });

    await extractor.extractStyleCardAndPersona("vp_1", tweets);

    expect(deps.generateStyleCardAndPersona).toHaveBeenCalledTimes(1);
    const updateArgs = prismaMock.voiceProfile.update.mock.calls[0]?.[0];
    const parsed = StyleCardSchema.parse(updateArgs?.data?.styleCard);

    expect(updateArgs?.data?.primaryPersona).toBe("EDUCATOR");
    expect(parsed.userPreferences?.casing).toBe("lowercase");
    expect(parsed.ghostwriterStyleCard?.lexicon.topAdjectives).toEqual(["direct"]);
  });
});
