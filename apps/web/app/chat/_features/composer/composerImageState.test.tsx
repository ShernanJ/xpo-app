import { expect, test } from "vitest";

import {
  buildImageIdeationQuickReplies,
  buildImagePostSupportAsset,
  validateComposerImageFile,
  COMPOSER_IMAGE_MAX_BYTES,
} from "./composerImageState";

test("validateComposerImageFile enforces mime type and size limits", () => {
  expect(
    validateComposerImageFile(
      new File(["image"], "draft.gif", {
        type: "image/gif",
      }),
    ),
  ).toEqual({
    ok: false,
    error: "Use a PNG, JPG, JPEG, or WEBP image.",
  });

  expect(
    validateComposerImageFile(
      new File([new Uint8Array(COMPOSER_IMAGE_MAX_BYTES + 1)], "draft.png", {
        type: "image/png",
      }),
    ),
  ).toEqual({
    ok: false,
    error: "Images need to be 8 MB or smaller.",
  });
});

test("buildImagePostSupportAsset summarizes the visual context for downstream draft tools", () => {
  expect(
    buildImagePostSupportAsset({
      primary_subject: "founder at a laptop",
      setting: "a bright home office",
      lighting_and_mood: "warm and focused",
      any_readable_text: "ship the update",
      key_details: ["coffee mug", "analytics dashboard", "notebook"],
    }),
  ).toBe(
    "Image anchor: founder at a laptop in a bright home office.\nMood: warm and focused.\nReadable text: ship the update.\nKey details: coffee mug, analytics dashboard, notebook.",
  );
});

test("buildImageIdeationQuickReplies maps image directions into ideation chips", () => {
  const result = buildImageIdeationQuickReplies({
    angles: ["Option one", "Option two", "Option three"],
    supportAsset: "Image anchor: founder at a laptop.",
  });

  expect(result).toHaveLength(3);
  expect(result[0]).toEqual(
    expect.objectContaining({
      kind: "ideation_angle",
      value: "Option one",
      label: "Option one",
      angle: "Option one",
      formatHint: "post",
      supportAsset: "Image anchor: founder at a laptop.",
    }),
  );
});
