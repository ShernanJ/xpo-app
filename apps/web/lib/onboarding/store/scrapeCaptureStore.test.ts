import assert from "node:assert/strict";
import test from "node:test";

import { mergeScrapeCapturePosts } from "./scrapeCaptureMerge.ts";

test("mergeScrapeCapturePosts keeps unique ids, prefers newer incoming items, and caps the result", () => {
  const merged = mergeScrapeCapturePosts(
    [
      {
        id: "older-1",
        text: "existing older post",
        createdAt: "2026-03-10T10:00:00.000Z",
        metrics: {
          likeCount: 1,
          replyCount: 0,
          repostCount: 0,
          quoteCount: 0,
        },
      },
      {
        id: "shared",
        text: "existing shared post",
        createdAt: "2026-03-10T09:00:00.000Z",
        metrics: {
          likeCount: 1,
          replyCount: 0,
          repostCount: 0,
          quoteCount: 0,
        },
      },
    ],
    [
      {
        id: "newest",
        text: "new incoming post",
        createdAt: "2026-03-12T12:00:00.000Z",
        metrics: {
          likeCount: 5,
          replyCount: 1,
          repostCount: 1,
          quoteCount: 0,
        },
      },
      {
        id: "shared",
        text: "incoming shared post wins",
        createdAt: "2026-03-11T11:00:00.000Z",
        metrics: {
          likeCount: 10,
          replyCount: 2,
          repostCount: 3,
          quoteCount: 1,
        },
      },
    ],
    2,
  );

  assert.deepEqual(
    merged.map((post) => ({
      id: post.id,
      text: post.text,
    })),
    [
      { id: "newest", text: "new incoming post" },
      { id: "shared", text: "incoming shared post wins" },
    ],
  );
});
