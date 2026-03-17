import test from "node:test";
import assert from "node:assert/strict";

import { normalizeChatTurn } from "./_lib/normalization/turnNormalization.ts";

test("ideation picks normalize into structured draft turns with a server-side plan seed", () => {
  const normalized = normalizeChatTurn({
    body: {
      turnSource: "ideation_pick",
      artifactContext: {
        kind: "selected_angle",
        angle: "what's the biggest friction you hit when launching a growth tool?",
        formatHint: "post",
      },
    },
  });

  assert.equal(normalized.source, "ideation_pick");
  assert.equal(normalized.explicitIntent, "draft");
  assert.equal(normalized.transcriptMessage, "> what's the biggest friction you hit when launching a growth tool?");
  assert.equal(
    normalized.orchestrationMessage,
    "draft a post in the user's voice that answers this question with a strong hook, at least one concrete detail, and a clean ending. do not repeat the question or answer it in a single flat sentence: what's the biggest friction you hit when launching a growth tool?",
  );
  assert.equal(normalized.shouldAllowReplyHandling, false);
  assert.equal(normalized.diagnostics.planSeedSource, "selected_angle");
  assert.equal(normalized.diagnostics.resolvedWorkflow, "plan_then_draft");
});

test("image-backed ideation picks preserve supportAsset in the normalized turn", () => {
  const normalized = normalizeChatTurn({
    body: {
      turnSource: "ideation_pick",
      artifactContext: {
        kind: "selected_angle",
        angle: "screenshots like this outperform polished launch art because the proof feels real",
        formatHint: "post",
        supportAsset: "Image anchor: analytics dashboard on a laptop.",
      },
    },
  });

  assert.equal(normalized.source, "ideation_pick");
  assert.equal(normalized.artifactContext?.kind, "selected_angle");
  assert.equal(
    normalized.artifactContext?.kind === "selected_angle"
      ? normalized.artifactContext.supportAsset
      : null,
    "Image anchor: analytics dashboard on a laptop.",
  );
  assert.equal(
    normalized.orchestrationMessage,
    "use this image context as grounding:\nImage anchor: analytics dashboard on a laptop.\n\ndraft a post from this chosen direction in the user's voice: screenshots like this outperform polished launch art because the proof feels real",
  );
});

test("legacy selectedAngle payloads still normalize into ideation picks during migration", () => {
  const normalized = normalizeChatTurn({
    body: {
      selectedAngle: "how did building your app change your x growth strategy?",
    },
  });

  assert.equal(normalized.source, "ideation_pick");
  assert.equal(normalized.artifactContext?.kind, "selected_angle");
  assert.equal(normalized.explicitIntent, "draft");
});

test("draft actions keep the user instruction but bypass reply parsing by contract", () => {
  const normalized = normalizeChatTurn({
    body: {
      message: "make it shorter",
      turnSource: "draft_action",
      artifactContext: {
        kind: "draft_selection",
        action: "edit",
        selectedDraftContext: {
          messageId: "msg_1",
          versionId: "ver_1",
          content: "draft body",
          focusedThreadPostIndex: 2,
        },
      },
    },
  });

  assert.equal(normalized.source, "draft_action");
  assert.equal(normalized.explicitIntent, "edit");
  assert.equal(normalized.orchestrationMessage, "make it shorter");
  assert.equal(normalized.selectedDraftContext?.focusedThreadPostIndex, 2);
  assert.equal(normalized.shouldAllowReplyHandling, false);
  assert.equal(normalized.diagnostics.replyHandlingBypassedReason, "turn_source_draft_action");
});

test("reply option selections normalize into deterministic reply actions", () => {
  const normalized = normalizeChatTurn({
    body: {
      turnSource: "reply_action",
      artifactContext: {
        kind: "reply_option_select",
        optionIndex: 1,
      },
    },
  });

  assert.equal(normalized.source, "reply_action");
  assert.equal(normalized.explicitIntent, null);
  assert.equal(normalized.transcriptMessage, "> option 2");
  assert.equal(normalized.orchestrationMessage, "go with option 2");
  assert.equal(normalized.diagnostics.resolvedWorkflow, "reply_to_post");
});

test("pasted posts without an explicit reply ask stay in free_text flow", () => {
  const normalized = normalizeChatTurn({
    body: {
      message: `@naval

Specific knowledge is becoming the only durable leverage.

Can you analyze why this works?`,
    },
  });

  assert.equal(normalized.source, "free_text");
  assert.equal(normalized.shouldAllowReplyHandling, true);
  assert.equal(normalized.diagnostics.resolvedWorkflow, "free_text");
  assert.equal(normalized.diagnostics.replyHandlingBypassedReason, null);
});
