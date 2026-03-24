import test from "node:test";
import assert from "node:assert/strict";

import { analyzeDraftDeltaWithDeps } from "./deltaAnalyzer.ts";

function buildClient(content: string) {
  return {
    chat: {
      completions: {
        async create() {
          return {
            choices: [
              {
                message: {
                  content,
                },
              },
            ],
          };
        },
      },
    },
  };
}

test("analyzeDraftDeltaWithDeps returns a rule for high-confidence stylistic edits", async () => {
  const result = await analyzeDraftDeltaWithDeps(
    "Here is the draft 😊",
    "Here is the draft",
    {
      getGroqClient: () =>
        buildClient(
          JSON.stringify({
            has_stylistic_change: true,
            extracted_rule: "ALWAYS strip trailing emojis.",
            confidence_score: 92,
          }),
        ),
    },
  );

  assert.equal(result, "ALWAYS strip trailing emojis.");
});

test("analyzeDraftDeltaWithDeps returns null for typo-only edits", async () => {
  const result = await analyzeDraftDeltaWithDeps(
    "Their launch is live",
    "There launch is live",
    {
      getGroqClient: () =>
        buildClient(
          JSON.stringify({
            has_stylistic_change: false,
            extracted_rule: "NEVER use 'their'.",
            confidence_score: 95,
          }),
        ),
    },
  );

  assert.equal(result, null);
});

test("analyzeDraftDeltaWithDeps returns null when confidence is 80 or lower", async () => {
  const result = await analyzeDraftDeltaWithDeps(
    "Longer original draft",
    "Shorter final post",
    {
      getGroqClient: () =>
        buildClient(
          JSON.stringify({
            has_stylistic_change: true,
            extracted_rule: "ALWAYS shorten sentences.",
            confidence_score: 80,
          }),
        ),
    },
  );

  assert.equal(result, null);
});

test("analyzeDraftDeltaWithDeps returns null for invalid JSON responses", async () => {
  const result = await analyzeDraftDeltaWithDeps(
    "Original draft",
    "Published post",
    {
      getGroqClient: () => buildClient("{invalid json"),
    },
  );

  assert.equal(result, null);
});
