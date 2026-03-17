import { expect, test } from "vitest";

import {
  AUTO_PUBLISH_SIMILARITY_THRESHOLD,
  computeTrigramSimilarity,
  findAutoPublishMatches,
  normalizeAutoPublishText,
  resolveComparableDraftText,
} from "./autoPublishMatcher";

test("normalizeAutoPublishText removes urls and thread numbering noise", () => {
  expect(
    normalizeAutoPublishText("1/5 https://x.com/demo shipping the content hub today"),
  ).toBe("shipping the content hub today");
  expect(
    normalizeAutoPublishText("Post 2: tighten the publish flow"),
  ).toBe("tighten the publish flow");
});

test("computeTrigramSimilarity stays above the publish threshold for light edits", () => {
  const similarity = computeTrigramSimilarity(
    "Shipping a global content hub today with draft folders and publish tracking.",
    "Shipping the global content hub today with draft folders and publish tracking.",
  );

  expect(similarity).toBeGreaterThan(AUTO_PUBLISH_SIMILARITY_THRESHOLD);
});

test("computeTrigramSimilarity stays below the publish threshold for different posts", () => {
  const similarity = computeTrigramSimilarity(
    "Shipping a global content hub today with draft folders and publish tracking.",
    "Reply heuristics should prioritize niche overlap and conversation quality first.",
  );

  expect(similarity).toBeLessThan(AUTO_PUBLISH_SIMILARITY_THRESHOLD);
});

test("resolveComparableDraftText uses the first thread post for matching", () => {
  const comparable = resolveComparableDraftText({
    id: "thread-1",
    title: "Thread",
    kind: "thread_seed",
    content: "1/3 first\n\n---\n\n2/3 second",
    posts: [
      {
        id: "post-1",
        content: "1/3 first post carries the publish match",
        weightedCharacterCount: 39,
        maxCharacterLimit: 280,
        isWithinXLimit: true,
      },
      {
        id: "post-2",
        content: "2/3 later thread post",
        weightedCharacterCount: 22,
        maxCharacterLimit: 280,
        isWithinXLimit: true,
      },
    ],
    characterCount: 0,
    weightedCharacterCount: 0,
    maxCharacterLimit: 1680,
    isWithinXLimit: true,
    supportAsset: null,
    groundingSources: [],
    groundingMode: null,
    groundingExplanation: null,
    betterClosers: [],
    replyPlan: [],
    voiceTarget: null,
    noveltyNotes: [],
    threadFramingStyle: "numbered",
  });

  expect(comparable).toBe("1/3 first post carries the publish match");
});

test("findAutoPublishMatches only matches against the opening thread post", () => {
  const matches = findAutoPublishMatches({
    drafts: [
      {
        id: "draft-thread",
        reviewStatus: "pending",
        artifact: {
          id: "thread-1",
          title: "Thread",
          kind: "thread_seed",
          content: "1/2 first\n\n---\n\n2/2 second",
          posts: [
            {
              id: "post-1",
              content: "1/2 this is the opening post",
              weightedCharacterCount: 29,
              maxCharacterLimit: 280,
              isWithinXLimit: true,
            },
            {
              id: "post-2",
              content: "2/2 this later post should not trigger the match alone",
              weightedCharacterCount: 52,
              maxCharacterLimit: 280,
              isWithinXLimit: true,
            },
          ],
          characterCount: 0,
          weightedCharacterCount: 0,
          maxCharacterLimit: 1680,
          isWithinXLimit: true,
          supportAsset: null,
          groundingSources: [],
          groundingMode: null,
          groundingExplanation: null,
          betterClosers: [],
          replyPlan: [],
          voiceTarget: null,
          noveltyNotes: [],
          threadFramingStyle: "numbered",
        },
      },
    ],
    posts: [
      {
        id: "tweet-2",
        text: "2/2 this later post should not trigger the match alone",
        createdAt: "2026-03-17T12:00:00.000Z",
        metrics: {
          likeCount: 0,
          replyCount: 0,
          repostCount: 0,
          quoteCount: 0,
        },
      },
    ],
  });

  expect(matches).toEqual([]);
});
