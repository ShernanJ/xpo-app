import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeReplyText } from "./replyQuality.ts";
import { buildReplyGroundingPacket } from "./replyDraft.ts";
import type { GrowthStrategySnapshot } from "../onboarding/strategy/growthStrategy.ts";

const strategy: GrowthStrategySnapshot = {
  knownFor: "software and product through product positioning",
  targetAudience: "builders who want clearer positioning on X",
  contentPillars: ["product positioning", "reply leverage", "proof-first posting"],
  replyGoals: ["Turn relevant replies into profile clicks from the right niche."],
  profileConversionCues: ["Bio and pinned post should make the niche obvious."],
  offBrandThemes: ["broad motivational advice with no niche tie"],
  ambiguities: [],
  confidence: {
    overall: 72,
    positioning: 70,
    replySignal: 64,
    readiness: "ready",
  },
  truthBoundary: {
    verifiedFacts: ["Primary niche: software and product"],
    inferredThemes: ["product positioning", "reply leverage"],
    unknowns: [],
  },
};

test("sanitizeReplyText falls back when the candidate is generic agreement", () => {
  const groundingPacket = buildReplyGroundingPacket({
    request: {
      tweetId: "tweet_1",
      tweetText: "Positioning breaks when the product promise stays too broad.",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/1",
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
    },
    strategy,
    strategyPillar: "product positioning",
    angleLabel: "specific_layer",
  });

  const sanitized = sanitizeReplyText({
    candidate: "great point, totally agree",
    fallbackText:
      "the missing layer is the positioning clarity. that's what makes the point usable instead of just agreeable.",
    sourceText: "Positioning breaks when the product promise stays too broad.",
    strategyPillar: "product positioning",
    strategy,
    groundingPacket,
  });

  assert.equal(sanitized.includes("great point"), false);
  assert.match(sanitized, /positioning clarity|usable instead of just agreeable/i);
});

test("sanitizeReplyText falls back when the candidate invents first-person proof", () => {
  const groundingPacket = buildReplyGroundingPacket({
    request: {
      tweetId: "tweet_2",
      tweetText: "Replies work better when they add a real layer instead of agreement.",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/2",
      stage: "0_to_1k",
      tone: "dry",
      goal: "followers",
    },
    strategy,
    strategyPillar: "reply leverage",
    angleLabel: "implementation",
  });

  const sanitized = sanitizeReplyText({
    candidate: "i used this with 30 customers and it always works",
    fallbackText:
      "the missing layer is the follow-through in the reply itself. that's what makes the point reusable.",
    sourceText: "Replies work better when they add a real layer instead of agreement.",
    strategyPillar: "reply leverage",
    strategy,
    groundingPacket,
  });

  assert.equal(/\b(i|my|we|our)\b/i.test(sanitized), false);
  assert.equal(/\b\d[\d,.%]*\b/.test(sanitized), false);
});
