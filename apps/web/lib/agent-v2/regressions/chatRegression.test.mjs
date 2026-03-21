import test from "node:test";
import assert from "node:assert/strict";

import {
  inferFormatIntent,
  isBareIdeationRequest,
  resolveConversationMode,
} from "../core/conversationHeuristics.ts";
import { buildIdeationReply } from "../responses/ideationReply.ts";
import { dedupeAngleTitlesForRetry } from "../core/angleNovelty.ts";
import {
  ANGLE_NOVELTY_FIXTURES,
  IDEATION_COMMAND_FIXTURES,
  IDEATION_REPLY_FIXTURES,
  NATURAL_REPAIR_FIXTURES,
} from "./chatRegressionFixtures.ts";
import {
  inferIdeationRationaleReply,
  inferPostReferenceReply,
  looksLikeConfusionPing,
} from "../responses/sourceTransparency.ts";

for (const fixture of IDEATION_COMMAND_FIXTURES) {
  test(`regression: ideation command detection - "${fixture.input}"`, () => {
    assert.equal(
      isBareIdeationRequest(fixture.input),
      fixture.shouldBeIdeationCommand,
    );
  });
}

test("regression: ideation retry command does not hijack active draft edit mode", () => {
  const mode = resolveConversationMode({
    explicitIntent: null,
    userMessage: "try again",
    classifiedIntent: "edit",
    activeDraft: "current draft",
  });

  assert.equal(mode, "edit");
});

test("regression: format intent classifier distinguishes jokes, observations, stories, and lessons", () => {
  assert.equal(inferFormatIntent("make it a coffee joke"), "joke");
  assert.equal(inferFormatIntent("this is just a quick observation"), "observation");
  assert.equal(
    inferFormatIntent("I spent 1 month trying to get a job at Stan"),
    "story",
  );
  assert.equal(inferFormatIntent("teach the hiring lesson here"), "lesson");
});

for (const fixture of IDEATION_REPLY_FIXTURES) {
  test(`regression: ideation follow-up wording - "${fixture.userMessage}"`, () => {
    const reply = buildIdeationReply({
      userMessage: fixture.userMessage,
      intro: fixture.intro,
      close: fixture.close,
      styleCard: null,
    });
    const normalizedReply = reply.toLowerCase();

    assert.equal(
      fixture.mustIncludeAny.some((phrase) =>
        normalizedReply.includes(phrase.toLowerCase()),
      ),
      true,
    );
    assert.equal(
      fixture.mustIncludeSwitchCue.some((phrase) =>
        normalizedReply.includes(phrase.toLowerCase()),
      ),
      true,
    );
    for (const forbidden of fixture.mustNotInclude) {
      assert.equal(normalizedReply.includes(forbidden.toLowerCase()), false);
    }
  });
}

for (const fixture of ANGLE_NOVELTY_FIXTURES) {
  test(`regression: ideation retry dedupes near-duplicate angles - "${fixture.seed}"`, () => {
    const nextAngles = dedupeAngleTitlesForRetry({
      angles: fixture.inputAngles,
      focusTopic: fixture.focusTopic,
      recentHistory: fixture.recentHistory,
      seed: fixture.seed,
    });

    assert.equal(
      nextAngles[0]?.title
        .toLowerCase()
        .includes("how does turning a linkedin post into an x post change the story you tell"),
      false,
    );
    assert.equal(
      nextAngles[1]?.title
        .toLowerCase()
        .includes("what's the biggest tone shift when you turn a linkedin post into an x post"),
      false,
    );
    assert.equal(/\?$/.test(nextAngles[0]?.title || ""), true);
    assert.equal(/\?$/.test(nextAngles[1]?.title || ""), true);
  });
}

for (const fixture of NATURAL_REPAIR_FIXTURES) {
  test(`regression: natural repair flow - ${fixture.kind}`, () => {
    if (fixture.kind === "rationale") {
      const reply = inferIdeationRationaleReply({
        userMessage: fixture.userMessage,
        topicSummary: fixture.topicSummary,
        recentHistory: fixture.recentHistory,
        lastIdeationAngles: [],
      });
      assert.equal(typeof reply, "string");
      assert.equal(/i chose them|grounding it in the ideas right above/i.test(reply || ""), true);
      return;
    }

    if (fixture.kind === "post_reference") {
      const reply = inferPostReferenceReply({
        userMessage: fixture.userMessage,
        recentHistory: fixture.recentHistory,
      });
      assert.equal(typeof reply, "string");
      assert.equal(/specific post/i.test(reply || ""), true);
      return;
    }

    assert.equal(looksLikeConfusionPing(fixture.userMessage), true);
  });
}
