import assert from "node:assert/strict";
import test from "node:test";

import {
  CopywriterPostOptionsSchema,
  ImageVisionContextSchema,
} from "./imagePostGeneration.ts";

test("ImageVisionContextSchema accepts the expected vision JSON shape", () => {
  const result = ImageVisionContextSchema.safeParse({
    primary_subject: "A laptop on a cafe table",
    setting: "Coffee shop",
    lighting_and_mood: "Warm morning light",
    any_readable_text: "Ship daily",
    key_details: ["open code editor", "ceramic mug", "sunlight on the desk"],
  });

  assert.equal(result.success, true);
});

test("ImageVisionContextSchema rejects malformed vision payloads", () => {
  const result = ImageVisionContextSchema.safeParse({
    primary_subject: "A laptop on a cafe table",
    setting: "Coffee shop",
    lighting_and_mood: "Warm morning light",
    any_readable_text: "Ship daily",
    key_details: "open code editor",
  });

  assert.equal(result.success, false);
});

test("CopywriterPostOptionsSchema requires exactly three drafted posts", () => {
  assert.equal(
    CopywriterPostOptionsSchema.safeParse([
      "What if the thing slowing your growth isn't the algorithm but the way your proof looks on the timeline?",
      "There is something weirdly effective about sharing the messy middle instead of the polished ending.",
      "Proof beats polish on X. Show the work, give the lesson, let the right people self-select.",
    ]).success,
    true,
  );

  assert.equal(
    CopywriterPostOptionsSchema.safeParse([
      "Only one post",
      "Only two posts",
    ]).success,
    false,
  );
});
