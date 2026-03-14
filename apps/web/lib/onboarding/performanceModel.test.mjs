import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("performance model includes link-post safety guidance for follower growth", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./analysis/performanceModel.ts", import.meta.url)),
    "utf8",
  );

  assert.equal(
    source.includes('if (params.bestContentType === "link_post" && params.growthGoal === "followers")'),
    true,
  );
  assert.equal(
    source.includes("Favor native ${saferActionContentType} posts over link_post for follower growth."),
    true,
  );
  assert.equal(
    source.includes("put it in the first reply after the post earns distribution"),
    true,
  );
  assert.equal(
    source.includes("Do not default to link_post for follower growth."),
    true,
  );
});
