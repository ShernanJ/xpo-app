import test from "node:test";
import assert from "node:assert/strict";

import { verifyReplyClaims } from "./claimVerification.ts";

test("verifyReplyClaims rewrites unsupported external capability claims on parody mockups", async () => {
  const result = await verifyReplyClaims({
    draft:
      "that's an interesting idea, but it'd be more valuable if you could also see who's replied to your tweets.",
    sourceContext: {
      primaryPost: {
        id: "tweet_1",
        url: "https://x.com/elkelk/status/1",
        text: "Idea: X Premium Pro Max Plus where you can see who's viewed your profile and bookmarked your tweets",
        authorHandle: "elkelk",
        postType: "original",
      },
      quotedPost: null,
      media: {
        images: [
          {
            altText:
              'Fake premium UI screenshot showing "Unlock X Premium", "See Who\'s Viewing You!", and "$800 / month".',
          },
        ],
        hasVideo: false,
        hasGif: false,
        hasLink: false,
      },
      conversation: null,
    },
    visualContext: {
      primarySubject: "tweet screenshot with embedded image",
      setting: "digital interface",
      lightingAndMood: "internet-native and jokey",
      readableText: "Unlock X Premium See Who's Viewing You! $800 / month",
      keyDetails: ["screenshot layout", "premium upsell", "who viewed your profile"],
      brandSignals: ["x", "premium"],
      absurdityMarkers: ["exaggerated tier naming", "absurd pricing", "surveillance feature framing"],
      artifactTargetHint: "premium social-surveillance UX",
      imageCount: 1,
      sceneType: "screenshot",
      imageArtifactType: "parody_ui",
      imageRole: "punchline",
      imageReplyAnchor: "Unlock X Premium",
      shouldReferenceImageText: true,
      replyRelevance: "high",
      images: [
        {
          imageUrl: null,
          source: "alt_text",
          sceneType: "screenshot",
          imageArtifactType: "parody_ui",
          imageRole: "punchline",
          primarySubject: "tweet screenshot with embedded image",
          setting: "digital interface",
          lightingAndMood: "internet-native and jokey",
          readableText: "Unlock X Premium See Who's Viewing You! $800 / month",
          keyDetails: ["screenshot layout", "premium upsell"],
          brandSignals: ["x", "premium"],
          absurdityMarkers: ["absurd pricing"],
          artifactTargetHint: "premium social-surveillance UX",
          jokeAnchor: "Unlock X Premium",
          replyRelevance: "high",
        },
      ],
      summaryLines: [
        "Image scene type: screenshot",
        "Image artifact type: parody_ui",
        "Image role: punchline",
      ],
    },
  });

  assert.match(result.outcome, /rewritten|rejected/);
  assert.equal(result.claims.length > 0, true);
  assert.equal(/\breplied to your tweets\b/i.test(result.draft), false);
});
