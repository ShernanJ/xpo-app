import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeSourceTweet,
  buildReplyContextSystemPrompt,
  clearReplyContextCacheForTests,
  setReplyContextGroqClientForTests,
} from "./replyContextExtractor.ts";

const ORIGINAL_GROQ_API_KEY = process.env.GROQ_API_KEY;

function restoreEnv() {
  if (ORIGINAL_GROQ_API_KEY === undefined) {
    delete process.env.GROQ_API_KEY;
  } else {
    process.env.GROQ_API_KEY = ORIGINAL_GROQ_API_KEY;
  }
}

test.afterEach(() => {
  restoreEnv();
  clearReplyContextCacheForTests();
  setReplyContextGroqClientForTests(null);
});

test("buildReplyContextSystemPrompt includes the required JSON instruction", () => {
  assert.equal(
    buildReplyContextSystemPrompt().includes(
      "You must output your analysis in JSON format.",
    ),
    true,
  );
});

test("analyzeSourceTweet returns a parsed reply context card", async () => {
  process.env.GROQ_API_KEY = "test-key";

  const requests: unknown[] = [];
  setReplyContextGroqClientForTests({
    chat: {
      completions: {
        create: async (args) => {
          requests.push(args);
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    room_sentiment: "frustration",
                    social_intent: "looking for validation and practical empathy",
                    recommended_stance: "acknowledge the pain first, then add one grounded point",
                    banned_angles: ["sarcasm", "pile-on mockery"],
                  }),
                },
              },
            ],
          };
        },
      },
    },
  });

  const result = await analyzeSourceTweet("This rollout has been brutal.");

  assert.deepEqual(result, {
    room_sentiment: "frustration",
    social_intent: "looking for validation and practical empathy",
    recommended_stance: "acknowledge the pain first, then add one grounded point",
    banned_angles: ["sarcasm", "pile-on mockery"],
  });
  assert.equal(requests.length, 1);
});

test("analyzeSourceTweet returns null for malformed JSON", async () => {
  process.env.GROQ_API_KEY = "test-key";

  setReplyContextGroqClientForTests({
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: '{"room_sentiment":"grief"' } }],
        }),
      },
    },
  });

  const result = await analyzeSourceTweet("I miss him every day.");

  assert.equal(result, null);
});

test("analyzeSourceTweet returns null for schema mismatches", async () => {
  process.env.GROQ_API_KEY = "test-key";

  setReplyContextGroqClientForTests({
    chat: {
      completions: {
        create: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  room_sentiment: "grief",
                  social_intent: "seeking comfort",
                  recommended_stance: "be gentle",
                  banned_angles: "sarcasm",
                }),
              },
            },
          ],
        }),
      },
    },
  });

  const result = await analyzeSourceTweet("today is harder than expected");

  assert.equal(result, null);
});

test("analyzeSourceTweet returns null on explicit 429 rate limits", async () => {
  process.env.GROQ_API_KEY = "test-key";

  setReplyContextGroqClientForTests({
    chat: {
      completions: {
        create: async () => {
          const error = new Error("Too Many Requests");
          (error as Error & { status?: number }).status = 429;
          throw error;
        },
      },
    },
  });

  const result = await analyzeSourceTweet("why is everything broken");

  assert.equal(result, null);
});

test("analyzeSourceTweet caches successful results for normalized duplicate text", async () => {
  process.env.GROQ_API_KEY = "test-key";

  let callCount = 0;
  setReplyContextGroqClientForTests({
    chat: {
      completions: {
        create: async () => {
          callCount += 1;
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    room_sentiment: "debate",
                    social_intent: "testing arguments in public",
                    recommended_stance: "engage the strongest point without escalating",
                    banned_angles: ["ad hominem"],
                  }),
                },
              },
            ],
          };
        },
      },
    },
  });

  const first = await analyzeSourceTweet("same tweet text");
  const second = await analyzeSourceTweet("  same   tweet text  ");

  assert.deepEqual(second, first);
  assert.equal(callCount, 1);
});

test("analyzeSourceTweet does not cache null results", async () => {
  process.env.GROQ_API_KEY = "test-key";

  let callCount = 0;
  setReplyContextGroqClientForTests({
    chat: {
      completions: {
        create: async () => {
          callCount += 1;
          if (callCount === 1) {
            return {
              choices: [{ message: { content: '{"room_sentiment":"vulnerability"' } }],
            };
          }

          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    room_sentiment: "vulnerability",
                    social_intent: "looking for care",
                    recommended_stance: "be warm and avoid scoring points",
                    banned_angles: ["dunking"],
                  }),
                },
              },
            ],
          };
        },
      },
    },
  });

  const first = await analyzeSourceTweet("please be kind");
  const second = await analyzeSourceTweet("please be kind");

  assert.equal(first, null);
  assert.deepEqual(second, {
    room_sentiment: "vulnerability",
    social_intent: "looking for care",
    recommended_stance: "be warm and avoid scoring points",
    banned_angles: ["dunking"],
  });
  assert.equal(callCount, 2);
});
