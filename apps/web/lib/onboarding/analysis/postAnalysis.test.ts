import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzePostFeatures,
  classifyContentType,
  extractEntityCandidates,
  isLowSignalEntityCandidate,
} from "./postAnalysis.ts";

test("low-signal verb tokens do not survive as entity candidates", () => {
  assert.equal(isLowSignalEntityCandidate("built"), true);
  assert.equal(isLowSignalEntityCandidate("than"), true);

  const candidates = extractEntityCandidates(
    "Built a $30M company with a small team. Revenue matters more than vanity.",
  );

  assert.equal(candidates.includes("built"), false);
  assert.equal(candidates.includes("than"), false);
  assert.equal(candidates.includes("company"), true);
  assert.equal(candidates.includes("team"), true);
  assert.equal(candidates.includes("revenue"), true);
});

test("stopword-led and low-signal bigrams are filtered out", () => {
  const candidates = extractEntityCandidates(
    "Just wrote a guide on the hiring system that built my company.",
  );

  assert.equal(candidates.includes("hiring"), true);
  assert.equal(candidates.includes("hiring system"), true);
  assert.equal(candidates.includes("built my"), false);
  assert.equal(candidates.includes("that built"), false);
});

test("number-led metric phrases do not become profile topics", () => {
  const candidates = extractEntityCandidates(
    "Just wrote a 21-page full guide on the exact hiring system. $10M ARR could happen after growing a company with a strong team.",
  );

  assert.equal(candidates.includes("21"), false);
  assert.equal(candidates.includes("21 page"), false);
  assert.equal(candidates.includes("wrote 21 page"), false);
  assert.equal(candidates.includes("full guide"), false);
  assert.equal(candidates.includes("exact hiring"), false);
  assert.equal(candidates.includes("mrr could"), false);
  assert.equal(candidates.includes("10m"), false);
  assert.equal(candidates.includes("10m arr"), false);
  assert.equal(candidates.includes("hiring system"), true);
  assert.equal(candidates.includes("company"), true);
});

test("cta-ish and role-edge phrases are filtered out", () => {
  const candidates = extractEntityCandidates(
    "Reply talent below if you're hiring. Here who I think is great: Vitalii founder and operator.",
  );

  assert.equal(candidates.includes("reply talent"), false);
  assert.equal(candidates.includes("talent below"), false);
  assert.equal(candidates.includes("here who"), false);
  assert.equal(candidates.includes("vitalii founder"), false);
  assert.equal(candidates.includes("talent"), true);
  assert.equal(candidates.includes("operator"), true);
});

test("media-only t.co posts are classified as media-led instead of outbound-link posts", () => {
  const post = {
    id: "post-1",
    text: "holy fucking cinema. https://t.co/Fqnj4ifTfI",
    createdAt: "2026-03-20T12:00:00.000Z",
    metrics: {
      likeCount: 80,
      replyCount: 20,
      repostCount: 1,
      quoteCount: 0,
    },
    imageUrls: ["https://pbs.twimg.com/media/kevin-proof.jpg"],
    expandedUrls: null,
    linkSignal: "media_only" as const,
  };

  assert.equal(classifyContentType(post), "single_line");
  const features = analyzePostFeatures(post);
  assert.equal(features.linkSignal, "media_only");
  assert.equal(features.hasLinks, false);
  assert.equal(features.hasImageAttachments, true);
  assert.equal(features.imageCount, 1);
});

test("true outbound links still classify as link posts", () => {
  const post = {
    id: "post-2",
    text: "read the teardown https://t.co/example",
    createdAt: "2026-03-20T12:00:00.000Z",
    metrics: {
      likeCount: 10,
      replyCount: 1,
      repostCount: 2,
      quoteCount: 0,
    },
    imageUrls: null,
    expandedUrls: ["https://example.com/teardown"],
    linkSignal: "external" as const,
  };

  assert.equal(classifyContentType(post), "link_post");
  const features = analyzePostFeatures(post);
  assert.equal(features.hasLinks, true);
  assert.equal(features.linkCount, 1);
});
