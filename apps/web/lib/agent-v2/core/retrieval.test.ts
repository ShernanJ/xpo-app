import test from "node:test";
import assert from "node:assert/strict";

import {
  retrieveGoldenExamples,
  retrieveGoldenExamplesWithDeps,
} from "./retrieval.ts";

function createQueryRawMock<T>(
  result: T,
  onCall?: (strings: TemplateStringsArray, values: unknown[]) => void,
) {
  return async <R = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<R> => {
    onCall?.(strings, values);
    return result as unknown as R;
  };
}

test("retrieveGoldenExamples short-circuits when profile id is blank", async () => {
  let embedCalls = 0;
  let queryCalls = 0;

  const result = await retrieveGoldenExamplesWithDeps({
    profileId: "   ",
    promptIntent: "write about hiring",
    deps: {
      embedPromptIntent: async () => {
        embedCalls += 1;
        return [0.1, 0.2];
      },
      prismaClient: {
        $queryRaw: createQueryRawMock([], () => {
          queryCalls += 1;
        }),
      },
    },
  });

  assert.deepEqual(result, []);
  assert.equal(embedCalls, 0);
  assert.equal(queryCalls, 0);
});

test("retrieveGoldenExamples returns content rows from vector search", async () => {
  const queryCalls: Array<{ strings: string[]; values: unknown[] }> = [];

  const result = await retrieveGoldenExamplesWithDeps({
    profileId: "8a0d4e56-52b7-44d6-9409-51233012f9f2",
    promptIntent: "write about react hiring systems",
    limit: 2,
    deps: {
      embedPromptIntent: async () => [0.1, 0.2, 0.3],
      prismaClient: {
        $queryRaw: createQueryRawMock(
          [
            { content: "example one" },
            { content: "example two" },
          ],
          (strings, values) => {
          queryCalls.push({
            strings: Array.from(strings),
            values,
          });
          },
        ),
      },
    },
  });

  assert.deepEqual(result, ["example one", "example two"]);
  assert.equal(queryCalls.length, 1);
  assert.match(queryCalls[0]?.strings.join(""), /AND "embedding" IS NOT NULL/);
  assert.match(queryCalls[0]?.strings.join(""), /< 0\.45/);
  assert.doesNotMatch(queryCalls[0]?.strings.join(""), /::uuid/);
});

test("retrieveGoldenExamples preserves empty results when similarity threshold finds no matches", async () => {
  const result = await retrieveGoldenExamplesWithDeps({
    profileId: "8a0d4e56-52b7-44d6-9409-51233012f9f2",
    promptIntent: "write about react hiring systems",
    deps: {
      embedPromptIntent: async () => [0.1, 0.2, 0.3],
      prismaClient: {
        $queryRaw: createQueryRawMock([]),
      },
    },
  });

  assert.deepEqual(result, []);
});

test("retrieveGoldenExamples degrades gracefully when embeddings fail", async () => {
  const result = await retrieveGoldenExamplesWithDeps({
    profileId: "8a0d4e56-52b7-44d6-9409-51233012f9f2",
    promptIntent: "write about react hiring systems",
    deps: {
      embedPromptIntent: async () => {
        throw new Error("embedding unavailable");
      },
      prismaClient: {
        $queryRaw: createQueryRawMock([{ content: "should not be reached" }]),
      },
    },
  });

  assert.deepEqual(result, []);
});

test("retrieveGoldenExamples public helper keeps the exported contract callable", async () => {
  assert.equal(typeof retrieveGoldenExamples, "function");
});
