import test from "node:test";
import assert from "node:assert/strict";

import {
  BANNER_ANALYSIS_MAX_FILE_BYTES,
  validateBannerUpload,
} from "./route.logic.ts";

test("accepts supported banner uploads by mime type", () => {
  const result = validateBannerUpload({
    fileName: "banner.png",
    mimeType: "image/png",
    sizeBytes: 1024,
  });

  assert.deepEqual(result, {
    ok: true,
    mimeType: "image/png",
  });
});

test("accepts supported banner uploads by file extension when mime type is blank", () => {
  const result = validateBannerUpload({
    fileName: "banner.jpeg",
    mimeType: "",
    sizeBytes: 2048,
  });

  assert.deepEqual(result, {
    ok: true,
    mimeType: "image/jpeg",
  });
});

test("rejects oversized banner uploads", () => {
  const result = validateBannerUpload({
    fileName: "banner.webp",
    mimeType: "image/webp",
    sizeBytes: BANNER_ANALYSIS_MAX_FILE_BYTES + 1,
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.status, 413);
});

test("rejects unsupported banner uploads", () => {
  const result = validateBannerUpload({
    fileName: "banner.gif",
    mimeType: "image/gif",
    sizeBytes: 2048,
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.status, 415);
});
