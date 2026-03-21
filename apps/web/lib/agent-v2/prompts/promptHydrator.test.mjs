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
    primaryPersona: "EDUCATOR",
    antiPatterns: ["no listicles"],
    activeTaskSummary: "tighten the active draft",
    sessionConstraints: [
      { source: "explicit", text: "no emojis" },
      { source: "inferred", text: "make it angrier" },
    ],
    replyContext: {
      room_sentiment: "frustration",
      social_intent: "looking for validation",
      recommended_stance: "acknowledge the pain before adding critique",
      banned_angles: ["sarcasm", "pile-on mockery"],
    },
    goldenExamples: ["runtime example"],
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
  assert.equal(prompt.includes("<room_context>"), true);
  assert.equal(prompt.includes("<sentiment>frustration</sentiment>"), true);
  assert.equal(prompt.indexOf("<room_context>") < prompt.indexOf("<target_persona>"), true);
  assert.equal(prompt.includes("<mechanical_style_rules><![CDATA["), true);
  assert.equal(
    prompt.includes(
      "You are an educator. Prioritize clear, actionable breakdowns and high-signal teaching.",
    ),
    true,
  );
  assert.equal(prompt.includes('<constraint source="explicit">no emojis</constraint>'), true);
  assert.equal(prompt.includes('<constraint source="inferred">make it angrier</constraint>'), true);
  assert.equal(prompt.includes('<example index="0">runtime example</example>'), true);
  assert.equal(prompt.includes("hook line"), false);
  assert.equal(
    prompt.includes(
      "If <session_constraints> conflicts with <mechanical_style_rules>, obey <session_constraints> for the current turn.",
    ),
    true,
  );
  assert.equal(
    prompt.includes(
      "If <room_context> conflicts with <target_persona> or <mechanical_style_rules>, obey <room_context> for the current turn.",
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

test("prompt hydration envelope preserves an explicit empty golden example list", () => {
  const prompt = buildPromptHydrationEnvelope({
    mode: "draft",
    goal: "audience growth",
    conversationState: "editing",
    styleCard: null,
    antiPatterns: [],
    goldenExamples: [],
    creatorProfileHints: {
      preferredOutputShape: "shortform",
      threadBias: "low",
      preferredHookPatterns: [],
      toneGuidelines: [],
      ctaPolicy: null,
      topExampleSnippets: ["legacy fallback"],
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

  assert.equal(prompt.includes("<golden_examples>"), false);
  assert.equal(prompt.includes("legacy fallback"), false);
  assert.equal(
    prompt.includes(
      "CRITICAL INSTRUCTION: You must internalize the <mechanical_style_rules> and format your output to match the structural cadence of the <golden_examples>.",
    ),
    false,
  );
});

test("prompt hydration envelope omits golden example tags when examples are undefined", () => {
  const prompt = buildPromptHydrationEnvelope({
    mode: "draft",
    goal: "audience growth",
    conversationState: "editing",
    styleCard: null,
    antiPatterns: [],
    creatorProfileHints: {
      preferredOutputShape: "shortform",
      threadBias: "low",
      preferredHookPatterns: [],
      toneGuidelines: [],
      ctaPolicy: null,
      topExampleSnippets: ["legacy fallback"],
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

  assert.equal(prompt.includes("<golden_examples>"), false);
  assert.equal(prompt.includes("legacy fallback"), false);
});

test("prompt hydration envelope emits live context in a CDATA-safe block", () => {
  const prompt = buildPromptHydrationEnvelope({
    mode: "draft",
    goal: "audience growth",
    conversationState: "draft_ready",
    styleCard: null,
    antiPatterns: [],
    liveContext: "breaking snippet ]]> follow-up",
  });

  assert.equal(prompt.includes("<live_context><![CDATA["), true);
  assert.equal(prompt.includes("]]]]><![CDATA[>"), true);
  assert.equal(prompt.includes("</live_context>"), true);
});
