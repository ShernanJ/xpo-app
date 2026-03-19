import test from "node:test";
import assert from "node:assert/strict";

import { analyzeReplySourceVisualContext } from "./context.ts";

test("analyzeReplySourceVisualContext falls back to alt text for screenshot jokes", async () => {
  const visualContext = await analyzeReplySourceVisualContext({
    primaryPost: {
      id: "tweet_1",
      url: "https://x.com/chribjel/status/1",
      text: "Perfect algo pull",
      authorHandle: "chribjel",
      postType: "original",
    },
    quotedPost: null,
    media: {
      images: [
        {
          altText:
            'Tweet screenshot showing the X app banner "Posts aren\'t loading right now" above a nested tweet image.',
        },
      ],
      hasVideo: false,
      hasGif: false,
      hasLink: false,
    },
    conversation: null,
  });

  assert.equal(visualContext?.sceneType, "screenshot");
  assert.equal(visualContext?.imageRole, "punchline");
  assert.equal(visualContext?.shouldReferenceImageText, true);
  assert.match(visualContext?.readableText || "", /posts? aren'?t loading right now/i);
  assert.match(visualContext?.imageReplyAnchor || "", /posts? aren'?t loading right now/i);
});

test("analyzeReplySourceVisualContext tags proof screenshots from alt text", async () => {
  const visualContext = await analyzeReplySourceVisualContext({
    primaryPost: {
      id: "tweet_2",
      url: "https://x.com/builder/status/2",
      text: "retention looks way better after the onboarding cleanup",
      authorHandle: "builder",
      postType: "original",
    },
    quotedPost: null,
    media: {
      images: [
        {
          altText:
            'Dashboard screenshot showing a retention chart and analytics proof after the onboarding update.',
        },
      ],
      hasVideo: false,
      hasGif: false,
      hasLink: false,
    },
    conversation: null,
  });

  assert.equal(visualContext?.imageRole, "proof");
  assert.equal(visualContext?.shouldReferenceImageText, true);
  assert.match(visualContext?.imageReplyAnchor || "", /dashboard screenshot|retention chart|analytics proof/i);
});
