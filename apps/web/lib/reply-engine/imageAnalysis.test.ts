import test from "node:test";
import assert from "node:assert/strict";

import { normalizeReplyImageVisualContext } from "./imageAnalysis.ts";

test("normalizeReplyImageVisualContext upgrades OCR-led joke screenshots over embedded photo descriptions", () => {
  const normalized = normalizeReplyImageVisualContext({
    sourceText: "Perfect algo pull",
    visualContext: {
      scene_type: "photo",
      image_role: "punchline",
      readable_text: "Posts aren't loading right now Try again",
      primary_subject: "man",
      setting: "server room or data center",
      lighting_and_mood: "neutral",
      key_details: ["server room", "man looking at servers", "error message"],
      joke_anchor: "man looking at servers with error message",
      reply_relevance: "high",
    },
  });

  assert.equal(normalized.scene_type, "screenshot");
  assert.equal(normalized.primary_subject, "tweet screenshot with embedded image");
  assert.equal(normalized.setting, "digital interface");
  assert.match(normalized.joke_anchor, /posts? aren'?t loading right now/i);
});

test("normalizeReplyImageVisualContext promotes UI text from joke anchor when readable text is missing", () => {
  const normalized = normalizeReplyImageVisualContext({
    sourceText: "Perfect algo pull",
    visualContext: {
      scene_type: "photo",
      image_role: "punchline",
      readable_text: "",
      primary_subject: "man",
      setting: "server room or data center",
      lighting_and_mood: "industrial",
      key_details: ["server cabinet", "wires", "man working"],
      joke_anchor: "Posts aren't loading right now / Try again",
      reply_relevance: "high",
    },
  });

  assert.equal(normalized.scene_type, "screenshot");
  assert.equal(normalized.primary_subject, "tweet screenshot with embedded image");
  assert.equal(normalized.setting, "digital interface");
  assert.equal(normalized.readable_text, "Posts aren't loading right now Try again");
  assert.match(normalized.joke_anchor, /posts? aren'?t loading right now/i);
  assert.equal(normalized.key_details.includes("screenshot layout"), true);
  assert.equal(normalized.key_details.includes("nested tweet image"), true);
  assert.equal(normalized.key_details.includes("error banner"), true);
});
