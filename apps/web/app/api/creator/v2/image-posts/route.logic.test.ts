import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_IMAGE_TO_POST_IDEA_LENGTH,
  fileToDataUrl,
  parseImageToPostFormData,
} from "./route.logic.ts";

function buildImageFile(type = "image/png") {
  return new File([Buffer.from("image-bytes")], "example.png", { type });
}

test("parseImageToPostFormData accepts a supported image upload and trims idea text", () => {
  const formData = new FormData();
  formData.set("image", buildImageFile());
  formData.set("idea", "  indie hackers / shipping in public  ");

  const result = parseImageToPostFormData(formData);

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.data.idea, "indie hackers / shipping in public");
  assert.equal(result.data.imageFile.type, "image/png");
});

test("parseImageToPostFormData rejects requests without an image file", () => {
  const formData = new FormData();
  formData.set("idea", "creator growth");

  const result = parseImageToPostFormData(formData);

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.deepEqual(result.errors, [
    { field: "image", message: "An image upload is required." },
  ]);
});

test("parseImageToPostFormData rejects unsupported mime types", () => {
  const formData = new FormData();
  formData.set("image", buildImageFile("application/pdf"));

  const result = parseImageToPostFormData(formData);

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.deepEqual(result.errors, [
    {
      field: "image",
      message: "Image must be a PNG, JPG, JPEG, or WEBP file.",
    },
  ]);
});

test("parseImageToPostFormData rejects overly long idea text", () => {
  const formData = new FormData();
  formData.set("image", buildImageFile());
  formData.set("idea", "x".repeat(MAX_IMAGE_TO_POST_IDEA_LENGTH + 1));

  const result = parseImageToPostFormData(formData);

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.deepEqual(result.errors, [
    {
      field: "idea",
      message: `Idea must be ${MAX_IMAGE_TO_POST_IDEA_LENGTH} characters or fewer.`,
    },
  ]);
});

test("fileToDataUrl encodes the uploaded file as a data url", async () => {
  const dataUrl = await fileToDataUrl(buildImageFile("image/webp"));

  assert.equal(dataUrl, `data:image/webp;base64,${Buffer.from("image-bytes").toString("base64")}`);
});
