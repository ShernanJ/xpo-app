import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWebSearchQueryKey,
  executeWebSearch,
  normalizeWebSearchQueries,
} from "./webSearch.ts";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_SET_TIMEOUT = globalThis.setTimeout;
const ORIGINAL_CLEAR_TIMEOUT = globalThis.clearTimeout;
const ORIGINAL_TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const ORIGINAL_EXA_API_KEY = process.env.EXA_API_KEY;

function restoreGlobals() {
  globalThis.fetch = ORIGINAL_FETCH;
  globalThis.setTimeout = ORIGINAL_SET_TIMEOUT;
  globalThis.clearTimeout = ORIGINAL_CLEAR_TIMEOUT;

  if (ORIGINAL_TAVILY_API_KEY === undefined) {
    delete process.env.TAVILY_API_KEY;
  } else {
    process.env.TAVILY_API_KEY = ORIGINAL_TAVILY_API_KEY;
  }

  if (ORIGINAL_EXA_API_KEY === undefined) {
    delete process.env.EXA_API_KEY;
  } else {
    process.env.EXA_API_KEY = ORIGINAL_EXA_API_KEY;
  }
}

test.afterEach(() => {
  restoreGlobals();
});

test("normalizeWebSearchQueries dedupes, trims, and caps at three", () => {
  assert.deepEqual(
    normalizeWebSearchQueries([
      " latest launch update ",
      "Latest launch update",
      "",
      "pricing change",
      "user reaction",
      "fourth query",
    ]),
    ["latest launch update", "pricing change", "user reaction"],
  );
  assert.equal(
    buildWebSearchQueryKey(["pricing change", "Latest launch update", "pricing change"]),
    "Latest launch update||pricing change",
  );
});

test("executeWebSearch formats Tavily results into capped markdown", async () => {
  process.env.TAVILY_API_KEY = "tvly_test";
  delete process.env.EXA_API_KEY;

  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body || "{}")) as Record<string, unknown>,
    });

    return new Response(
      JSON.stringify({
        results: [
          {
            title: "Launch post",
            url: "https://example.com/launch",
            content: "A".repeat(1_800),
          },
          {
            title: "Pricing breakdown",
            url: "https://example.com/pricing",
            content: "B".repeat(1_800),
          },
          {
            title: "Customer reaction",
            url: "https://example.com/reaction",
            content: "C".repeat(1_800),
          },
          {
            title: "Should not appear",
            url: "https://example.com/extra",
            content: "D".repeat(1_800),
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  const result = await executeWebSearch([
    "latest launch update",
    "pricing change",
    "customer reaction",
  ]);

  assert.equal(requests.length, 3);
  assert.equal(requests[0]?.url, "https://api.tavily.com/search");
  assert.equal(requests[0]?.body.max_results, 3);
  assert.equal(requests[0]?.body.search_depth, "basic");
  assert.equal(requests[0]?.body.topic, "news");
  assert.equal(result.includes("## Results for [latest launch update]"), true);
  assert.equal(result.includes("## Results for [pricing change]"), true);
  assert.equal(result.includes("## Results for [customer reaction]"), true);
  assert.equal(result.includes("Should not appear"), false);
  assert.equal(result.endsWith("...[Content Truncated]"), true);
  assert.equal(result.length <= 4_000, true);
});

test("executeWebSearch formats Exa results when Tavily is unavailable", async () => {
  delete process.env.TAVILY_API_KEY;
  process.env.EXA_API_KEY = "exa_test";

  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.exa.ai/search");
    assert.equal((init?.headers as Record<string, string>)?.["x-api-key"], "exa_test");
    assert.deepEqual(JSON.parse(String(init?.body || "{}")), {
      query: "latest company update",
      text: true,
      numResults: 3,
    });

    return new Response(
      JSON.stringify({
        results: [
          {
            title: "Company blog",
            url: "https://example.com/blog",
            text: "Latest update from the company blog.",
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  const result = await executeWebSearch(["latest company update"]);

  assert.equal(
    result,
    "## Results for [latest company update]\n- [Company blog](https://example.com/blog): Latest update from the company blog.",
  );
});

test("executeWebSearch returns an empty string on timeout or abort", async () => {
  process.env.TAVILY_API_KEY = "tvly_test";
  delete process.env.EXA_API_KEY;

  globalThis.setTimeout = ((callback: (...args: unknown[]) => void) => {
    callback();
    return 1 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = (() => undefined) as typeof clearTimeout;
  globalThis.fetch = async (_input, init) => {
    const signal = init?.signal as AbortSignal | undefined;
    if (signal?.aborted) {
      throw new Error("aborted");
    }

    return await new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new Error("aborted")), {
        once: true,
      });
    });
  };

  const result = await executeWebSearch(["breaking update"]);

  assert.equal(result, "");
});
