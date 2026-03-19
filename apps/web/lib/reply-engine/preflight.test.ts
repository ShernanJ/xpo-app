import test from "node:test";
import assert from "node:assert/strict";

import { analyzeReplySourceVisualContext } from "./context.ts";
import { classifyReplyDraftMode } from "./preflight.ts";

test("classifyReplyDraftMode falls back to joke riff for playful posts in tests", async () => {
  const result = await classifyReplyDraftMode({
    sourceText: "lol this meme format keeps winning because the screenshot is the whole bit",
  });

  assert.equal(result.recommended_reply_mode, "joke_riff");
  assert.equal(result.source_shape, "joke_setup");
});

test("classifyReplyDraftMode falls back to joke riff for self-own shitposts in tests", async () => {
  const result = await classifyReplyDraftMode({
    sourceText: "my startup strategy is just drinking 4 redbulls and hoping",
  });

  assert.equal(result.recommended_reply_mode, "joke_riff");
  assert.equal(result.source_shape, "joke_setup");
});

test("classifyReplyDraftMode falls back to joke riff for internet slang sarcasm in tests", async () => {
  const result = await classifyReplyDraftMode({
    sourceText: "lwk this launch plan is just vibes and a dream",
  });

  assert.equal(result.recommended_reply_mode, "joke_riff");
  assert.equal(result.source_shape, "joke_setup");
});

test("classifyReplyDraftMode tags casual self-reports as casual observations", async () => {
  const result = await classifyReplyDraftMode({
    sourceText: "Just had a full bag of chips #fuckit",
  });

  assert.equal(result.recommended_reply_mode, "joke_riff");
  assert.equal(result.source_shape, "casual_observation");
});

test("classifyReplyDraftMode falls back to empathetic support for emotionally heavy posts in tests", async () => {
  const result = await classifyReplyDraftMode({
    sourceText: "this week was brutal and i'm still trying to process it",
  });

  assert.equal(result.recommended_reply_mode, "empathetic_support");
  assert.equal(result.source_shape, "emotional_update");
});

test("classifyReplyDraftMode defaults to insightful add-on when no strong heuristic fires", async () => {
  const result = await classifyReplyDraftMode({
    sourceText: "good interfaces usually make the next step feel obvious",
  });

  assert.equal(result.recommended_reply_mode, "insightful_add_on");
  assert.equal(result.source_shape, "strategic_take");
});

test("classifyReplyDraftMode uses screenshot joke context as a punchline signal", async () => {
  const visualContext = await analyzeReplySourceVisualContext({
    primaryPost: {
      id: "tweet_7",
      url: "https://x.com/chribjel/status/7",
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
  const result = await classifyReplyDraftMode({
    sourceText: "Perfect algo pull",
    imageSummaryLines: visualContext?.summaryLines || [],
    visualContext,
  });

  assert.equal(result.recommended_reply_mode, "joke_riff");
  assert.equal(result.source_shape, "joke_setup");
  assert.equal(result.image_role, "punchline");
  assert.equal(result.should_reference_image_text, true);
  assert.match(result.image_reply_anchor, /posts? aren'?t loading right now/i);
});

test("classifyReplyDraftMode uses proof screenshots as evidence instead of jokes", async () => {
  const visualContext = await analyzeReplySourceVisualContext({
    primaryPost: {
      id: "tweet_8",
      url: "https://x.com/builder/status/8",
      text: "retention looks way better after the onboarding cleanup",
      authorHandle: "builder",
      postType: "original",
    },
    quotedPost: null,
    media: {
      images: [
        {
          altText:
            "Dashboard screenshot showing a retention chart and analytics proof after the onboarding update.",
        },
      ],
      hasVideo: false,
      hasGif: false,
      hasLink: false,
    },
    conversation: null,
  });
  const result = await classifyReplyDraftMode({
    sourceText: "retention looks way better after the onboarding cleanup",
    imageSummaryLines: visualContext?.summaryLines || [],
    visualContext,
  });

  assert.equal(result.recommended_reply_mode, "insightful_add_on");
  assert.equal(result.image_role, "proof");
  assert.equal(result.should_reference_image_text, true);
});

test("classifyReplyDraftMode treats parody premium mockups as non-literal satire", async () => {
  const visualContext = await analyzeReplySourceVisualContext({
    primaryPost: {
      id: "tweet_9",
      url: "https://x.com/elkelk/status/9",
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
  });
  const result = await classifyReplyDraftMode({
    sourceText:
      "Idea: X Premium Pro Max Plus where you can see who's viewed your profile and bookmarked your tweets",
    imageSummaryLines: visualContext?.summaryLines || [],
    visualContext,
  });

  assert.equal(result.recommended_reply_mode, "joke_riff");
  assert.equal(result.interpretation?.literality, "non_literal");
  assert.match(result.interpretation?.humor_mode || "", /satire|parody/i);
  assert.equal(result.interpretation?.post_frame, "mockup");
  assert.equal(result.interpretation?.image_artifact_type, "parody_ui");
  assert.equal(
    result.interpretation?.disallowed_reply_moves.includes("literal_product_brainstorm"),
    true,
  );
});
