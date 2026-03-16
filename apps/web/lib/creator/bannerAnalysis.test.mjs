import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeBannerForGrowth,
  analyzeBannerUrlForGrowth,
  buildFallbackBannerFeedback,
  normalizeBannerFeedback,
  normalizeBannerVisionExtraction,
} from "./bannerAnalysis.ts";

test("normalizes lightly malformed vision JSON", () => {
  const result = normalizeBannerVisionExtraction({
    readable_text: "Grow your SaaS audience",
    color_palette: "black, white, gold",
    objects_detected: ["logo", "portrait", "logo"],
    is_bottom_left_clear: "true",
    overall_vibe: "dark luxury",
  });

  assert.deepEqual(result, {
    readable_text: "Grow your SaaS audience",
    color_palette: ["black", "white", "gold"],
    objects_detected: ["logo", "portrait"],
    is_bottom_left_clear: true,
    overall_vibe: "dark luxury",
  });
});

test("normalizes lightly malformed strategist JSON", () => {
  const result = normalizeBannerFeedback({
    score: "7.6",
    strengths: "Clear headline, cohesive palette",
    actionable_improvements:
      "Move text away from the avatar overlap, shorten the copy",
  });

  assert.deepEqual(result, {
    score: 7.6,
    strengths: ["Clear headline", "cohesive palette"],
    actionable_improvements: [
      "Move text away from the avatar overlap",
      "shorten the copy",
    ],
  });
});

test("builds deterministic fallback feedback from vision output", () => {
  const result = buildFallbackBannerFeedback({
    readable_text: "Helping founders land their first 100 users",
    color_palette: ["black", "white", "gold"],
    objects_detected: ["text", "logo"],
    is_bottom_left_clear: false,
    overall_vibe: "dark luxury",
  });

  assert.equal(typeof result.score, "number");
  assert.ok(result.strengths.length > 0);
  assert.ok(
    result.actionable_improvements.some((item) =>
      /bottom-left|profile-photo overlap/i.test(item),
    ),
  );
});

test("falls back to heuristic feedback when reasoning JSON remains unusable", async () => {
  const calls = [];
  const result = await analyzeBannerForGrowth(
    {
      imageDataUrl: "data:image/png;base64,ZmFrZQ==",
      visionModel: "vision-model",
      reasoningModel: "reasoning-model",
    },
    {
      fetchJson: async (options) => {
        calls.push(options.model);

        if (options.model === "vision-model") {
          return {
            readable_text: "Helping creators grow on X",
            color_palette: ["black", "white"],
            objects_detected: ["text"],
            is_bottom_left_clear: true,
            overall_vibe: "clean minimalism",
          };
        }

        options.onFailure?.("returned invalid JSON");
        return null;
      },
    },
  );

  assert.deepEqual(calls, ["vision-model", "reasoning-model"]);
  assert.equal(result.meta.reasoningFallbackUsed, true);
  assert.ok(result.feedback.strengths.length > 0);
});

test("analyzes a remote banner URL before running the vision pipeline", async () => {
  const result = await analyzeBannerUrlForGrowth(
    {
      bannerUrl: "https://example.com/banner.png",
      visionModel: "vision-model",
      reasoningModel: "reasoning-model",
    },
    {
      fetchImpl: async () =>
        new Response(Buffer.from("fake-image"), {
          status: 200,
          headers: {
            "content-type": "image/png",
          },
        }),
      fetchJson: async (options) => {
        if (options.model === "vision-model") {
          return {
            readable_text: "Helping creators grow on X",
            color_palette: ["black", "white"],
            objects_detected: ["text"],
            is_bottom_left_clear: true,
            overall_vibe: "clean minimalism",
          };
        }

        return {
          score: 8.1,
          strengths: ["The banner makes the niche easy to read."],
          actionable_improvements: ["Add stronger proof."],
        };
      },
    },
  );

  assert.equal(result.feedback.score, 8.1);
  assert.equal(result.vision.readable_text, "Helping creators grow on X");
});
