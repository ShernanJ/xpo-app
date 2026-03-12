import test from "node:test";
import assert from "node:assert/strict";

import { rankOpportunityBatch } from "./opportunityBatch.ts";
import type { GrowthStrategySnapshot } from "../onboarding/growthStrategy.ts";

const strategy: GrowthStrategySnapshot = {
  knownFor: "software and product through product positioning",
  targetAudience: "builders who want clearer positioning on X",
  contentPillars: ["product positioning", "reply leverage", "proof-first posting"],
  replyGoals: ["Turn relevant replies into profile clicks from the right niche."],
  profileConversionCues: ["Bio and pinned post should make the niche obvious."],
  offBrandThemes: ["broad motivational advice with no niche tie"],
  ambiguities: ["The account still reads broad, so default to software and product until stronger proof arrives."],
  confidence: {
    overall: 68,
    positioning: 63,
    replySignal: 51,
    readiness: "caution",
  },
  truthBoundary: {
    verifiedFacts: ["Primary niche: software and product"],
    inferredThemes: ["product positioning", "reply leverage"],
    unknowns: ["No profile click data yet."],
  },
};

test("rankOpportunityBatch returns top scored opportunities with valid shapes", () => {
  const result = rankOpportunityBatch({
    request: {
      pageUrl: "https://x.com/home",
      surface: "home",
      candidates: [
        {
          postId: "post_1",
          author: {
            id: "author_1",
            handle: "builder",
            name: "Builder",
            verified: false,
            followerCount: 6800,
          },
          text: "Most founders miss the positioning layer, then wonder why the product sounds interchangeable.",
          url: "https://x.com/builder/status/1",
          createdAtIso: "2026-03-11T10:00:00.000Z",
          engagement: {
            replyCount: 5,
            repostCount: 2,
            likeCount: 18,
            quoteCount: 1,
            viewCount: 900,
          },
          postType: "original",
          conversation: {
            conversationId: "conv_1",
            inReplyToPostId: null,
            inReplyToHandle: null,
          },
          media: {
            hasMedia: false,
            hasImage: false,
            hasVideo: false,
            hasGif: false,
            hasLink: false,
            hasPoll: false,
          },
          surface: "home",
          captureSource: "graphql",
          capturedAtIso: "2026-03-11T10:15:00.000Z",
        },
        {
          postId: "post_2",
          author: {
            id: "author_2",
            handle: "viral",
            name: "Viral Account",
            verified: true,
            followerCount: 320000,
          },
          text: "100% agree. Follow for more growth hacks and join my newsletter.",
          url: "https://x.com/viral/status/2",
          createdAtIso: "2026-03-10T10:00:00.000Z",
          engagement: {
            replyCount: 140,
            repostCount: 90,
            likeCount: 2000,
            quoteCount: 20,
            viewCount: 90000,
          },
          postType: "reply",
          conversation: {
            conversationId: "conv_2",
            inReplyToPostId: "root_1",
            inReplyToHandle: "bigaccount",
          },
          media: {
            hasMedia: true,
            hasImage: false,
            hasVideo: false,
            hasGif: false,
            hasLink: true,
            hasPoll: false,
          },
          surface: "home",
          captureSource: "dom",
          capturedAtIso: "2026-03-11T10:15:00.000Z",
        },
      ],
    },
    strategy,
    styleCard: null,
  });

  assert.equal(result.topRanked.length <= 5, true);
  assert.equal(result.notes.length > 0, true);
  assert.equal(result.ranked[0]?.opportunity.why.length > 0, true);
  assert.equal(Number.isInteger(result.ranked[0]?.opportunity.score), true);
  assert.equal(
    ["reply", "watch", "dont_reply"].includes(result.ranked[1]?.opportunity.verdict || ""),
    true,
  );
  assert.equal(result.ranked[1]?.opportunity.verdict, "dont_reply");
  assert.equal((result.ranked[1]?.opportunity.riskFlags.length || 0) > 0, true);
});

test("rankOpportunityBatch biases opportunity scoring toward converting reply patterns", () => {
  const request = {
    pageUrl: "https://x.com/home",
    surface: "home" as const,
    candidates: [
      {
        postId: "post_learning",
        author: {
          id: "author_learning",
          handle: "builder",
          name: "Builder",
          verified: false,
          followerCount: 5200,
        },
        text: "The proof layer is what makes positioning advice actually usable.",
        url: "https://x.com/builder/status/learning",
        createdAtIso: "2026-03-11T09:00:00.000Z",
        engagement: {
          replyCount: 3,
          repostCount: 1,
          likeCount: 14,
          quoteCount: 0,
          viewCount: 640,
        },
        postType: "original" as const,
        conversation: {
          conversationId: "conv_learning",
          inReplyToPostId: null,
          inReplyToHandle: null,
        },
        media: {
          hasMedia: false,
          hasImage: false,
          hasVideo: false,
          hasGif: false,
          hasLink: false,
          hasPoll: false,
        },
        surface: "home" as const,
        captureSource: "graphql" as const,
        capturedAtIso: "2026-03-11T09:05:00.000Z",
      },
    ],
  };

  const baseline = rankOpportunityBatch({
    request,
    strategy,
    styleCard: null,
  });
  const learned = rankOpportunityBatch({
    request,
    strategy,
    styleCard: null,
    replyInsights: {
      topPillars: [
        {
          label: "product positioning",
          generatedCount: 4,
          selectedCount: 3,
          postedCount: 2,
          observedCount: 2,
          selectionRate: 0.75,
          postedRate: 0.5,
        },
      ],
      topIntentLabels: [
        {
          label: "example",
          generatedCount: 2,
          selectedCount: 2,
          postedCount: 2,
          observedCount: 2,
          selectionRate: 1,
          postedRate: 1,
          totalProfileClicks: 5,
          totalFollowerDelta: 1,
          averageProfileClicks: 2.5,
          averageFollowerDelta: 0.5,
        },
      ],
      topIntentAnchors: [
        {
          label: "proof | the proof layer",
          generatedCount: 2,
          selectedCount: 2,
          postedCount: 2,
          observedCount: 2,
          selectionRate: 1,
          postedRate: 1,
          totalProfileClicks: 5,
          totalFollowerDelta: 1,
          averageProfileClicks: 2.5,
          averageFollowerDelta: 0.5,
        },
      ],
      intentAttribution: {
        generatedIntentCount: 4,
        copiedIntentCount: 2,
        observedOutcomeCount: 2,
        fullyAttributedOutcomeCount: 2,
      },
    } as never,
  });

  assert.equal(
    learned.ranked[0]?.opportunity.score > baseline.ranked[0]?.opportunity.score,
    true,
  );
  assert.equal(learned.ranked[0]?.opportunity.suggestedAngle, "example");
  assert.equal(
    learned.notes.some((entry) => entry.toLowerCase().includes("biased toward reply patterns")),
    true,
  );
});
