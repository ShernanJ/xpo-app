import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

enableExtensionlessTsResolution();

const { resolveWriterGoldenExamples } = await import("./writer.ts");
const { resolveIdeationGoldenExamples } = await import("./ideator.ts");

test("writer golden example retrieval is skipped when the profile has no examples", async () => {
  let retrievalCalls = 0;

  const result = await resolveWriterGoldenExamples({
    plan: {
      objective: "write about hiring systems",
      angle: "the filter that kept the team lean",
    },
    voiceProfileId: "vp_1",
    goldenExampleCount: 0,
    deps: {
      retrieveGoldenExamples: async () => {
        retrievalCalls += 1;
        return ["should not be used"];
      },
    },
  });

  assert.equal(result, undefined);
  assert.equal(retrievalCalls, 0);
});

test("writer golden example retrieval uses the source user message when available", async () => {
  let seenProfileId = null;
  let seenPromptIntent = null;

  const result = await resolveWriterGoldenExamples({
    plan: {
      objective: "write about hiring systems",
      angle: "the filter that kept the team lean",
    },
    sourceUserMessage: "write a thread about our new startup",
    voiceProfileId: "vp_1",
    goldenExampleCount: 4,
    deps: {
      retrieveGoldenExamples: async (profileId, promptIntent) => {
        seenProfileId = profileId;
        seenPromptIntent = promptIntent;
        return ["writer example"];
      },
    },
  });

  assert.deepEqual(result, ["writer example"]);
  assert.equal(seenProfileId, "vp_1");
  assert.equal(seenPromptIntent, "write a thread about our new startup");
});

test("ideation golden example retrieval is skipped when no examples exist", async () => {
  let retrievalCalls = 0;

  const result = await resolveIdeationGoldenExamples({
    userMessage: "give me post ideas about react",
    voiceProfileId: "vp_1",
    goldenExampleCount: 0,
    deps: {
      retrieveGoldenExamples: async () => {
        retrievalCalls += 1;
        return ["should not be used"];
      },
    },
  });

  assert.equal(result, undefined);
  assert.equal(retrievalCalls, 0);
});

test("ideation golden example retrieval uses the ideation-driving request", async () => {
  let seenPromptIntent = null;

  const result = await resolveIdeationGoldenExamples({
    userMessage: "give me post ideas about react hiring",
    voiceProfileId: "vp_1",
    goldenExampleCount: 2,
    deps: {
      retrieveGoldenExamples: async (_profileId, promptIntent) => {
        seenPromptIntent = promptIntent;
        return ["ideation example"];
      },
    },
  });

  assert.deepEqual(result, ["ideation example"]);
  assert.equal(seenPromptIntent, "give me post ideas about react hiring");
});

test("semantic golden example retrieval stays scoped to writer and ideator flows", () => {
  const writerSource = readFileSync(new URL("./writer.ts", import.meta.url), "utf8");
  const ideatorSource = readFileSync(new URL("./ideator.ts", import.meta.url), "utf8");
  const coachSource = readFileSync(new URL("./coach.ts", import.meta.url), "utf8");

  assert.equal(writerSource.includes("retrieveGoldenExamples"), true);
  assert.equal(ideatorSource.includes("retrieveGoldenExamples"), true);
  assert.equal(coachSource.includes("retrieveGoldenExamples"), false);
});
