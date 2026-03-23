import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

let extensionlessTsResolutionEnabled = false;
const require = createRequire(import.meta.url);
const { registerHooks } = require("node:module");

function enableExtensionlessTsResolution() {
  if (extensionlessTsResolutionEnabled) {
    return;
  }

  registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context);
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          error.code !== "ERR_MODULE_NOT_FOUND" ||
          !(
            specifier.startsWith("./") ||
            specifier.startsWith("../") ||
            specifier.startsWith("/")
          ) ||
          /\.[a-z0-9]+$/i.test(specifier)
        ) {
          throw error;
        }

        try {
          return nextResolve(`${specifier}.ts`, context);
        } catch (tsError) {
          if (
            !(tsError instanceof Error) ||
            !("code" in tsError) ||
            tsError.code !== "ERR_MODULE_NOT_FOUND"
          ) {
            throw tsError;
          }

          return nextResolve(`${specifier}/index.ts`, context);
        }
      }
    },
  });

  extensionlessTsResolutionEnabled = true;
}

async function loadWriterModule() {
  enableExtensionlessTsResolution();
  return import("./writer.ts");
}

async function loadJsonPromptContractsModule() {
  enableExtensionlessTsResolution();
  return import("./jsonPromptContracts.ts");
}

function createPlan(overrides = {}) {
  return {
    objective: "creator systems",
    angle: "show why systems beat motivation",
    targetLane: "original",
    mustInclude: ["one concrete example"],
    mustAvoid: ["hashtags"],
    hookType: "contrarian",
    pitchResponse: "lead with the tension",
    extractedConstraints: [],
    formatPreference: "thread",
    formatIntent: "lesson",
    ...overrides,
  };
}

function createFlatWriterOutput(overrides = {}) {
  return {
    angle: "fallback angle",
    draft: "fallback opener\n\n---\n\nfallback proof\n\n---\n\nfallback close",
    supportAsset: "dashboard screenshot",
    whyThisWorks: "why",
    watchOutFor: "watch",
    ...overrides,
  };
}

function createGenerateDraftsArgs() {
  return [
    createPlan(),
    null,
    [],
    [],
    "assistant: prior context",
    undefined,
    {
      formatPreference: "thread",
      formatIntent: "lesson",
      sourceUserMessage: "write me a thread about creator systems",
      voiceProfileId: "vp_1",
      goldenExampleCount: 1,
    },
  ];
}

test("structured thread schema accepts valid thread objects", async () => {
  const { StructuredThreadSchema } = await loadJsonPromptContractsModule();
  const parsed = StructuredThreadSchema.parse({
    tweets: [
      { role: "hook", content: "hook" },
      { role: "context", content: "context" },
      { role: "cta", content: "cta" },
    ],
  });

  assert.equal(parsed.tweets.length, 3);
});

test("structured thread schema rejects invalid roles", async () => {
  const { StructuredThreadSchema } = await loadJsonPromptContractsModule();
  assert.throws(() =>
    StructuredThreadSchema.parse({
      tweets: [{ role: "setup", content: "not allowed" }],
    }),
  );
});

test("structured thread schema does not fail long tweet content", async () => {
  const { StructuredThreadSchema } = await loadJsonPromptContractsModule();
  const parsed = StructuredThreadSchema.parse({
    tweets: [{ role: "value", content: "x".repeat(320) }],
  });

  assert.equal(parsed.tweets[0]?.content.length, 320);
});

test("thread mode uses the structured thread instruction block and normalizes tweets", async () => {
  const { generateDrafts } = await loadWriterModule();
  let capturedInstruction = "";

  const result = await generateDrafts(...createGenerateDraftsArgs(), {
    retrieveGoldenExamples: async () => [{ id: "anchor_1", content: "example anchor" }],
    runStructuredThreadGeneration: async ({ instruction }) => {
      capturedInstruction = instruction;
      return JSON.stringify({
        tweets: [
          { role: "hook", content: "motivation fades. systems keep shipping." },
          { role: "context", content: "most creators blame discipline when the real issue is missing process." },
          { role: "value", content: "a simple weekly capture-review-publish loop removes the guesswork." },
          { role: "cta", content: "want the template? reply and i'll send it." },
        ],
      });
    },
    runFlatWriterGeneration: async () => {
      throw new Error("flat writer path should not run for valid structured thread JSON");
    },
  });

  assert.equal(
    capturedInstruction.includes("You must output your response in JSON format."),
    true,
  );
  assert.equal(capturedInstruction.includes('"tweets": ['), true);
  assert.equal(
    result?.draft,
    [
      "motivation fades. systems keep shipping.",
      "most creators blame discipline when the real issue is missing process.",
      "a simple weekly capture-review-publish loop removes the guesswork.",
      "want the template? reply and i'll send it.",
    ].join("\n\n---\n\n"),
  );
  assert.deepEqual(result?.retrievedAnchorIds, ["anchor_1"]);
});

test("thread mode falls back to flat writer output on malformed JSON and keeps anchor ids", async () => {
  const { generateDrafts } = await loadWriterModule();
  const result = await generateDrafts(...createGenerateDraftsArgs(), {
    retrieveGoldenExamples: async () => [{ id: "anchor_1", content: "example anchor" }],
    runStructuredThreadGeneration: async () =>
      '{"tweets":[{"role":"hook","content":"bad "quote""}]}',
    runFlatWriterGeneration: async () =>
      createFlatWriterOutput({
        draft: "flat fallback draft",
      }),
  });

  assert.equal(result?.draft, "flat fallback draft");
  assert.deepEqual(result?.retrievedAnchorIds, ["anchor_1"]);
  assert.equal(result?.routingTracePatch?.writerFallback?.reason, "structured_thread_parse_failed");
  assert.equal(result?.routingTracePatch?.writerFallback?.fallbackUsed, "flat_writer_json");
});

test("thread mode falls back to flat writer output on schema validation failure", async () => {
  const { generateDrafts } = await loadWriterModule();
  const result = await generateDrafts(...createGenerateDraftsArgs(), {
    retrieveGoldenExamples: async () => [{ id: "anchor_1", content: "example anchor" }],
    runStructuredThreadGeneration: async () =>
      JSON.stringify({
        tweets: [
          { role: "setup", content: "wrong role" },
        ],
      }),
    runFlatWriterGeneration: async () =>
      createFlatWriterOutput({
        draft: "schema fallback draft",
      }),
  });

  assert.equal(result?.draft, "schema fallback draft");
  assert.equal(result?.routingTracePatch?.writerFallback?.reason, "structured_thread_parse_failed");
});

test("non-thread requests keep using the flat writer path", async () => {
  const { generateDrafts } = await loadWriterModule();
  let rawCalls = 0;
  let flatCalls = 0;

  const result = await generateDrafts(
    createPlan({
      formatPreference: "shortform",
    }),
    null,
    [],
    [],
    "assistant: prior context",
    undefined,
    {
      formatPreference: "shortform",
      formatIntent: "lesson",
      sourceUserMessage: "write me a post about creator systems",
    },
    {
      runStructuredThreadGeneration: async () => {
        rawCalls += 1;
        return null;
      },
      runFlatWriterGeneration: async () => {
        flatCalls += 1;
        return createFlatWriterOutput({
          draft: "single post draft",
        });
      },
    },
  );

  assert.equal(rawCalls, 0);
  assert.equal(flatCalls, 1);
  assert.equal(result?.draft, "single post draft");
});
