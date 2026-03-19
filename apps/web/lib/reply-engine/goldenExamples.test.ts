import test from "node:test";
import assert from "node:assert/strict";

import { retrieveReplyGoldenExamples } from "./goldenExamples.ts";

test("retrieveReplyGoldenExamples ranks stored examples by source overlap", async () => {
  const results = await retrieveReplyGoldenExamples({
    userId: "user_1",
    xHandle: "standev",
    replyMode: "insightful_add_on",
    sourceText: "screenshots work when they make the proof obvious",
    postIntent: "add a useful proof layer",
    deps: {
      findMany: async () => [
        {
          text: "proof tweets land when the screenshot makes the claim obvious",
          replyMode: "insightful_add_on",
          createdAt: new Date("2026-03-18T12:00:00.000Z"),
        },
        {
          text: "positioning usually breaks when the promise stays broad",
          replyMode: "insightful_add_on",
          createdAt: new Date("2026-03-18T11:00:00.000Z"),
        },
        {
          text: "screenshots work when they make the proof obvious",
          replyMode: "insightful_add_on",
          createdAt: new Date("2026-03-18T10:00:00.000Z"),
        },
      ],
      retrieveAnchors: async () => ({
        topicAnchors: [],
        laneAnchors: [],
        formatAnchors: [],
        rankedAnchors: [],
      }),
    },
  });

  assert.equal(results[0]?.text, "screenshots work when they make the proof obvious");
  assert.equal(results[0]?.source, "golden_example");
});

test("retrieveReplyGoldenExamples backfills with anchors when fewer than three stored examples exist", async () => {
  const results = await retrieveReplyGoldenExamples({
    userId: "user_1",
    xHandle: "standev",
    replyMode: "agree_and_amplify",
    sourceText: "yes, the product clicks faster when the copy is plain",
    deps: {
      findMany: async () => [
        {
          text: "yeah plain language is usually what makes the product feel faster",
          replyMode: "agree_and_amplify",
          createdAt: new Date("2026-03-18T12:00:00.000Z"),
        },
      ],
      retrieveAnchors: async () => ({
        topicAnchors: ["same. plain copy does more work than people think"],
        laneAnchors: ["yeah the faster read is usually the better product"],
        formatAnchors: [],
        rankedAnchors: [],
      }),
    },
  });

  assert.equal(results.length >= 3, true);
  assert.equal(results[0]?.source, "golden_example");
  assert.equal(results.some((entry) => entry.source === "fallback_anchor"), true);
});
