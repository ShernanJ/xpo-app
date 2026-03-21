import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOpportunityBatchUserPrompt,
  analyzeCandidateRoomContexts,
} from "./opportunityBatchGroq.ts";
import {
  clearReplyContextCacheForTests,
  setReplyContextGroqClientForTests,
} from "../agent-v2/core/replyContextExtractor.ts";

const ORIGINAL_GROQ_API_KEY = process.env.GROQ_API_KEY;

function restoreEnv() {
  if (ORIGINAL_GROQ_API_KEY === undefined) {
    delete process.env.GROQ_API_KEY;
  } else {
    process.env.GROQ_API_KEY = ORIGINAL_GROQ_API_KEY;
  }
}

const candidates = [
  {
    postId: "post_1",
    author: {
      id: "author_1",
      handle: "builder",
      name: "Builder",
      verified: false,
      followerCount: 6200,
    },
    text: "today feels heavier than usual",
    url: "https://x.com/builder/status/1",
    createdAtIso: "2026-03-11T10:00:00.000Z",
    engagement: {
      replyCount: 3,
      repostCount: 1,
      likeCount: 12,
      quoteCount: 0,
      viewCount: 550,
    },
    postType: "original" as const,
    conversation: {
      conversationId: "conv_1",
      inReplyToPostId: null,
      inReplyToHandle: null,
    },
    media: {
      hasMedia: false,
      hasImage: false,
      hasVideo: false,
      hasGif: false,
      hasLink: false,
      hasPoll: false,
    },
    surface: "home" as const,
    captureSource: "graphql" as const,
    capturedAtIso: "2026-03-11T10:10:00.000Z",
  },
  {
    postId: "post_2",
    author: {
      id: "author_2",
      handle: "builder",
      name: "Builder",
      verified: false,
      followerCount: 4100,
    },
    text: "rate limit me",
    url: "https://x.com/builder/status/2",
    createdAtIso: "2026-03-11T11:00:00.000Z",
    engagement: {
      replyCount: 2,
      repostCount: 0,
      likeCount: 8,
      quoteCount: 0,
      viewCount: 300,
    },
    postType: "original" as const,
    conversation: {
      conversationId: "conv_2",
      inReplyToPostId: null,
      inReplyToHandle: null,
    },
    media: {
      hasMedia: false,
      hasImage: false,
      hasVideo: false,
      hasGif: false,
      hasLink: false,
      hasPoll: false,
    },
    surface: "home" as const,
    captureSource: "graphql" as const,
    capturedAtIso: "2026-03-11T11:05:00.000Z",
  },
];

test.afterEach(() => {
  restoreEnv();
  clearReplyContextCacheForTests();
  setReplyContextGroqClientForTests(null);
});

test("analyzeCandidateRoomContexts degrades gracefully when one candidate hits a 429", async () => {
  process.env.GROQ_API_KEY = "test-key";

  setReplyContextGroqClientForTests({
    chat: {
      completions: {
        create: async (args) => {
          const prompt = args.messages[1]?.content || "";
          if (prompt.includes("rate limit me")) {
            const error = new Error("HTTP 429: Too Many Requests");
            (error as Error & { status?: number }).status = 429;
            throw error;
          }

          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    room_sentiment: "vulnerability",
                    social_intent: "looking for care",
                    recommended_stance: "be warm and avoid scoring points",
                    banned_angles: ["sarcasm"],
                  }),
                },
              },
            ],
          };
        },
      },
    },
  });

  const roomContexts = await analyzeCandidateRoomContexts(candidates);

  assert.deepEqual(roomContexts.get("post_1"), {
    room_sentiment: "vulnerability",
    social_intent: "looking for care",
    recommended_stance: "be warm and avoid scoring points",
    banned_angles: ["sarcasm"],
  });
  assert.equal(roomContexts.get("post_2"), null);
});

test("buildOpportunityBatchUserPrompt includes room context when available", () => {
  const roomContexts = new Map([
    [
      "post_1",
      {
        room_sentiment: "vulnerability",
        social_intent: "looking for care",
        recommended_stance: "be warm and avoid scoring points",
        banned_angles: ["sarcasm"],
      },
    ],
  ]);

  const prompt = buildOpportunityBatchUserPrompt({
    request: {
      pageUrl: "https://x.com/home",
      surface: "home",
      candidates,
    },
    roomContexts,
  });

  assert.equal(prompt.includes("roomContext: sentiment=vulnerability"), true);
  assert.equal(prompt.includes("roomContext: unavailable"), true);
});
