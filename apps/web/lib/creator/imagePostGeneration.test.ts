import assert from "node:assert/strict";
import test from "node:test";

import {
  ImagePostAngleOptionsSchema,
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

test("ImagePostAngleOptionsSchema requires exactly three image-backed directions", () => {
  assert.equal(
    ImagePostAngleOptionsSchema.safeParse([
      "the question this image quietly raises about shipping in public",
      "why this kind of screenshot works better than a polished launch graphic",
      "proof beats polish when the work is real",
    ]).success,
    true,
  );

  assert.equal(
    ImagePostAngleOptionsSchema.safeParse([
      "Only one direction",
      "Only two directions",
    ]).success,
    false,
  );
});
