import test from "node:test";
import assert from "node:assert/strict";

import { resolveLiveContextForPlan } from "./liveContext.ts";

test("live-context resolver fetches once, reuses cached results, and refreshes for changed queries", async () => {
  let memory = { liveContextCache: null };
  let searchCalls = 0;
  const writeMemory = async (patch) => {
    memory = {
      ...memory,
      liveContextCache:
        patch.liveContextCache !== undefined
          ? patch.liveContextCache
          : memory.liveContextCache,
    };
  };
  const executeWebSearch = async (queries) => {
    searchCalls += 1;
    return `## Results for [${queries[0]}]\n- [Source](https://example.com): fresh facts ${searchCalls}`;
  };

  const firstContext = await resolveLiveContextForPlan({
    plan: {
      objective: "launch update",
      angle: "focus on the latest product changes",
      targetLane: "original",
      mustInclude: [],
      mustAvoid: [],
      hookType: "direct",
      pitchResponse: "lead with what actually changed",
      formatPreference: "shortform",
      formatIntent: "lesson",
      requiresLiveContext: true,
      searchQueries: ["latest product launch"],
    },
    memory,
    executeWebSearch,
    writeMemory,
  });

  assert.equal(searchCalls, 1);
  assert.equal(firstContext.includes("fresh facts 1"), true);
  assert.equal(memory.liveContextCache?.content.includes("fresh facts 1"), true);

  const revisionContext = await resolveLiveContextForPlan({
    plan: {
      objective: "launch update",
      angle: "focus on the latest product changes",
      targetLane: "original",
      mustInclude: [],
      mustAvoid: [],
      hookType: "direct",
      pitchResponse: "lead with what actually changed",
      formatPreference: "shortform",
      formatIntent: "lesson",
      requiresLiveContext: true,
      searchQueries: ["latest product launch"],
    },
    memory,
    executeWebSearch,
    writeMemory,
  });

  assert.equal(searchCalls, 1);
  assert.equal(revisionContext.includes("fresh facts 1"), true);

  const refreshedContext = await resolveLiveContextForPlan({
    plan: {
      objective: "pricing reaction",
      angle: "focus on the pricing shift",
      targetLane: "original",
      mustInclude: [],
      mustAvoid: [],
      hookType: "direct",
      pitchResponse: "lead with the pricing change",
      formatPreference: "shortform",
      formatIntent: "lesson",
      requiresLiveContext: true,
      searchQueries: ["pricing change reaction"],
    },
    memory,
    executeWebSearch,
    writeMemory,
  });

  assert.equal(searchCalls, 2);
  assert.equal(refreshedContext.includes("fresh facts 2"), true);
  assert.equal(memory.liveContextCache?.queryKey, "pricing change reaction");
});

test("live-context resolver clears stale cache when the new plan does not require live context", async () => {
  let memory = {
    liveContextCache: {
      queryKey: "latest product launch",
      queries: ["latest product launch"],
      content: "cached context",
    },
  };

  await resolveLiveContextForPlan({
    plan: {
      objective: "evergreen draft",
      angle: "focus on durable lessons",
      targetLane: "original",
      mustInclude: [],
      mustAvoid: [],
      hookType: "direct",
      pitchResponse: "keep it timeless",
      requiresLiveContext: false,
      searchQueries: [],
    },
    memory,
    executeWebSearch: async () => {
      throw new Error("search should not run");
    },
    writeMemory: async (patch) => {
      memory = {
        ...memory,
        liveContextCache:
          patch.liveContextCache !== undefined
            ? patch.liveContextCache
            : memory.liveContextCache,
      };
    },
  });

  assert.equal(memory.liveContextCache, null);
});
