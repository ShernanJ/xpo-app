import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSelectedAngleDraftPrompt,
  stripSelectedAnglePromptPrefix,
} from "./selectedAnglePrompt.ts";

test("buildSelectedAngleDraftPrompt frames question angles as answer-the-question briefs", () => {
  assert.equal(
    buildSelectedAngleDraftPrompt({
      angle: "what's the biggest friction you hit when launching a growth tool?",
      formatHint: "post",
    }),
    "draft a post in the user's voice that answers this question with a strong hook, at least one concrete detail, and a clean ending. do not repeat the question or answer it in a single flat sentence: what's the biggest friction you hit when launching a growth tool?",
  );
});

test("buildSelectedAngleDraftPrompt frames non-question angles as chosen directions", () => {
  assert.equal(
    buildSelectedAngleDraftPrompt({
      angle: "the most underrated part of x growth is consistency",
      formatHint: "thread",
    }),
    "draft a thread from this chosen direction in the user's voice: the most underrated part of x growth is consistency",
  );
});

test("buildSelectedAngleDraftPrompt threads image grounding into the draft brief", () => {
  assert.equal(
    buildSelectedAngleDraftPrompt({
      angle: "screenshots like this outperform polished launch art because the proof feels real",
      formatHint: "post",
      supportAsset: "Image anchor: product analytics dashboard on a laptop.",
    }),
    "use this image context as grounding:\nImage anchor: product analytics dashboard on a laptop.\n\ndraft a post from this chosen direction in the user's voice: screenshots like this outperform polished launch art because the proof feels real",
  );
});

test("stripSelectedAnglePromptPrefix removes legacy and current selected-angle wrappers", () => {
  assert.equal(
    stripSelectedAnglePromptPrefix(
      "draft a post in the user's voice that answers this question with a strong hook, at least one concrete detail, and a clean ending. do not repeat the question or answer it in a single flat sentence: what's the biggest friction you hit when launching a growth tool?",
    ),
    "what's the biggest friction you hit when launching a growth tool?",
  );
  assert.equal(
    stripSelectedAnglePromptPrefix(
      "draft a post that directly answers this question in the user's voice: what's the biggest friction you hit when launching a growth tool?",
    ),
    "what's the biggest friction you hit when launching a growth tool?",
  );
  assert.equal(
    stripSelectedAnglePromptPrefix(
      "Turn the following angle into a draft: where does this break down in practice?",
    ),
    "where does this break down in practice?",
  );
});
