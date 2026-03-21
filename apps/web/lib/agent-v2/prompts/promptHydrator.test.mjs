import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPromptHydrationEnvelope,
  wrapXmlCdata,
} from "./promptHydrator.ts";

test("wrapXmlCdata splits closing markers safely", () => {
  const wrapped = wrapXmlCdata('{"example":"]]>"}');

  assert.equal(wrapped.includes("]]]]><![CDATA[>"), true);
  assert.equal(wrapped.startsWith("<![CDATA["), true);
  assert.equal(wrapped.endsWith("]]>"), true);
});

test("prompt hydration envelope emits XML session constraints and priority instruction", () => {
  const prompt = buildPromptHydrationEnvelope({
    mode: "draft",
    goal: "audience growth",
    conversationState: "editing",
    styleCard: null,
    antiPatterns: ["no listicles"],
    activeTaskSummary: "tighten the active draft",
    sessionConstraints: [
      { source: "explicit", text: "no emojis" },
      { source: "inferred", text: "make it angrier" },
    ],
    creatorProfileHints: {
      preferredOutputShape: "shortform",
      threadBias: "low",
      preferredHookPatterns: [],
      toneGuidelines: [],
      ctaPolicy: null,
      topExampleSnippets: ["hook line"],
      knownFor: null,
      targetAudience: null,
      contentPillars: [],
      replyGoals: [],
      profileConversionCues: [],
      offBrandThemes: [],
      ambiguities: [],
      learningSignals: [],
    },
  });

  assert.equal(prompt.includes("<active_task>tighten the active draft</active_task>"), true);
  assert.equal(prompt.includes("<mechanical_style_rules><![CDATA["), true);
  assert.equal(prompt.includes('<constraint source="explicit">no emojis</constraint>'), true);
  assert.equal(prompt.includes('<constraint source="inferred">make it angrier</constraint>'), true);
  assert.equal(
    prompt.includes(
      "If <session_constraints> conflicts with <mechanical_style_rules>, obey <session_constraints> for the current turn.",
    ),
    true,
  );
  assert.equal(
    prompt.includes(
      "CRITICAL INSTRUCTION: You must internalize the <mechanical_style_rules> and format your output to match the structural cadence of the <golden_examples>.",
    ),
    true,
  );
});
