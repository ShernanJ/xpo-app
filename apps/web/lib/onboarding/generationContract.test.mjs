import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("generation contract encodes positioning and fail-closed growth guardrails", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./generationContract.ts", import.meta.url)),
    "utf8",
  );

  assert.equal(source.includes("export interface CreatorPositioningContract"), true);
  assert.equal(source.includes("export interface CreatorLearningPrioritiesContract"), true);
  assert.equal(source.includes("export interface CreatorGuardrailsContract"), true);
  assert.equal(
    source.includes("Anchor every draft to one current pillar or active experiment."),
    true,
  );
  assert.equal(
    source.includes("Keep the positioning narrow and explicitly tentative where needed."),
    true,
  );
  assert.equal(
    source.includes("generic praise-only replies"),
    true,
  );
  assert.equal(
    source.includes("Maps clearly to one current pillar or active experiment."),
    true,
  );
  assert.equal(source.includes("failClosed: true"), true);
});
