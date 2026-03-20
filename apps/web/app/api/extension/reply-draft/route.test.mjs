import test from "node:test";
import assert from "node:assert/strict";

import {
  assertExtensionReplyDraftResponseShape,
  parseExtensionReplyDraftRequest,
} from "./route.logic.ts";

test("parseExtensionReplyDraftRequest accepts the extension contract payload", () => {
  const parsed = parseExtensionReplyDraftRequest({
    tweetId: "1",
    tweetText: "hello world",
    authorHandle: "creator",
    tweetUrl: "https://x.com/creator/status/1",
    stage: "0_to_1k",
    tone: "builder",
    goal: "followers",
    heuristicScore: 72,
    heuristicTier: "high",
  });

  assert.equal(parsed.ok, true);
});

test("parseExtensionReplyDraftRequest rejects invalid stage", () => {
  const parsed = parseExtensionReplyDraftRequest({
    tweetId: "1",
    tweetText: "hello world",
    authorHandle: "creator",
    tweetUrl: "https://x.com/creator/status/1",
    stage: "wrong",
    tone: "builder",
    goal: "followers",
  });

  assert.equal(parsed.ok, false);
});

test("parseExtensionReplyDraftRequest normalizes legacy stage and tone values", () => {
  const parsed = parseExtensionReplyDraftRequest({
    tweetId: "1",
    tweetText: "hello world",
    authorHandle: "creator",
    tweetUrl: "https://x.com/creator/status/1",
    stage: "0-1k",
    tone: "safe",
    goal: "followers",
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.stage, "0_to_1k");
    assert.equal(parsed.data.tone, "dry");
  }
});

test("parseExtensionReplyDraftRequest accepts playful tone directly", () => {
  const parsed = parseExtensionReplyDraftRequest({
    tweetId: "1",
    tweetText: "hello world",
    authorHandle: "creator",
    tweetUrl: "https://x.com/creator/status/1",
    stage: "0_to_1k",
    tone: "playful",
    goal: "followers",
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.tone, "playful");
  }
});

test("parseExtensionReplyDraftRequest normalizes playful tone aliases", () => {
  const parsed = parseExtensionReplyDraftRequest({
    tweetId: "1",
    tweetText: "hello world",
    authorHandle: "creator",
    tweetUrl: "https://x.com/creator/status/1",
    stage: "0_to_1k",
    tone: "comedic",
    goal: "followers",
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.tone, "playful");
  }
});

test("parseExtensionReplyDraftRequest accepts legacy alias fields", () => {
  const parsed = parseExtensionReplyDraftRequest({
    postId: "1",
    postText: "hello world",
    handle: "@creator",
    postUrl: "https://x.com/creator/status/1",
    growthStage: "1k-10k",
    risk: "bold",
    primaryGoal: "followers",
    score: 72,
    tier: "high",
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.tweetId, "1");
    assert.equal(parsed.data.tweetText, "hello world");
    assert.equal(parsed.data.authorHandle, "creator");
    assert.equal(parsed.data.tweetUrl, "https://x.com/creator/status/1");
    assert.equal(parsed.data.stage, "1k_to_10k");
    assert.equal(parsed.data.tone, "bold");
    assert.equal(parsed.data.goal, "followers");
    assert.equal(parsed.data.heuristicScore, 72);
    assert.equal(parsed.data.heuristicTier, "high");
  }
});

test("parseExtensionReplyDraftRequest accepts nested post payloads and tone objects", () => {
  const parsed = parseExtensionReplyDraftRequest({
    post: {
      postId: "2",
      text: "nested tweet text",
      url: "https://x.com/nested/status/2",
      author: {
        handle: "@nested",
      },
    },
    tone: {
      risk: "safe",
    },
    strategy: {
      growthStage: "10k-50k",
      goal: "followers",
    },
    opportunity: {
      score: 88,
      tier: "high",
    },
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.tweetId, "2");
    assert.equal(parsed.data.tweetText, "nested tweet text");
    assert.equal(parsed.data.authorHandle, "nested");
    assert.equal(parsed.data.tweetUrl, "https://x.com/nested/status/2");
    assert.equal(parsed.data.stage, "10k_to_50k");
    assert.equal(parsed.data.tone, "dry");
    assert.equal(parsed.data.heuristicScore, 88);
    assert.equal(parsed.data.heuristicTier, "high");
  }
});

test("parseExtensionReplyDraftRequest captures quote, media, and conversation context", () => {
  const parsed = parseExtensionReplyDraftRequest({
    post: {
      postId: "4",
      text: "lwk thought that i was the only one that was frustrated with the ux",
      url: "https://x.com/example/status/4",
      postType: "quote",
      author: {
        handle: "@example",
      },
      quotedPost: {
        id: "5",
        text: "the new posthog website is a prime example of why you shouldn't let your designers take LSD",
        author: {
          handle: "@quoted",
        },
      },
      media: {
        hasImage: true,
        images: [
          {
            imageUrl: "https://pbs.twimg.com/media/example.jpg",
            altText: "Screenshot of the website hero",
          },
        ],
      },
      conversation: {
        inReplyToPostId: "3",
        inReplyToHandle: "@parent",
      },
    },
    tone: "builder",
    goal: "followers",
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.postType, "quote");
    assert.equal(parsed.data.quotedPost?.tweetText.includes("posthog website"), true);
    assert.equal(parsed.data.media?.images.length, 1);
    assert.equal(parsed.data.conversation?.inReplyToPostId, "3");
    assert.equal(parsed.data.conversation?.inReplyToHandle, "parent");
  }
});

test("parseExtensionReplyDraftRequest accepts lightweight quotedPost and top-level imageUrls", () => {
  const parsed = parseExtensionReplyDraftRequest({
    tweetId: "10",
    tweetText: "this meme format keeps winning because the screenshot does half the work",
    authorHandle: "creator",
    tweetUrl: "https://x.com/creator/status/10",
    quotedPost: {
      author: "@quoted",
      text: "screenshots are the new proof tweets",
    },
    imageUrls: [
      "https://pbs.twimg.com/media/example-1.jpg",
      "https://pbs.twimg.com/media/example-2.jpg",
    ],
    stage: "0_to_1k",
    tone: "builder",
    goal: "followers",
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.quotedPost?.authorHandle, "quoted");
    assert.equal(parsed.data.quotedPost?.tweetText, "screenshots are the new proof tweets");
    assert.equal(parsed.data.media?.images.length, 2);
    assert.equal(parsed.data.media?.images[0]?.imageUrl, "https://pbs.twimg.com/media/example-1.jpg");
  }
});

test("parseExtensionReplyDraftRequest accepts source and quoted author display names", () => {
  const parsed = parseExtensionReplyDraftRequest({
    tweetId: "11",
    tweetText: "this works because the example is concrete",
    authorHandle: "creator",
    authorDisplayName: "Creator Name",
    tweetUrl: "https://x.com/creator/status/11",
    quotedPost: {
      author: {
        handle: "@quoted",
        displayName: "Quoted Name",
      },
      text: "proof is usually what makes the reply land",
    },
    stage: "0_to_1k",
    tone: "builder",
    goal: "followers",
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.authorDisplayName, "Creator Name");
    assert.equal(parsed.data.quotedPost?.authorDisplayName, "Quoted Name");
  }
});

test("parseExtensionReplyDraftRequest reads nested author display name aliases", () => {
  const parsed = parseExtensionReplyDraftRequest({
    post: {
      postId: "12",
      text: "the screenshot already did half the persuasion",
      url: "https://x.com/example/status/12",
      author: {
        handle: "@example",
        name: "Example Person",
      },
      quotedPost: {
        id: "13",
        text: "screenshots are carrying distribution now",
        authorName: "Quoted Person",
        author: {
          handle: "@quoted_person",
        },
      },
    },
    stage: "0_to_1k",
    tone: "builder",
    goal: "followers",
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.authorDisplayName, "Example Person");
    assert.equal(parsed.data.quotedPost?.authorDisplayName, "Quoted Person");
  }
});

test("parseExtensionReplyDraftRequest preserves author avatar urls when provided", () => {
  const parsed = parseExtensionReplyDraftRequest({
    tweetId: "13",
    tweetText: "avatars help the saved reply preview feel real",
    authorHandle: "creator",
    tweetUrl: "https://x.com/creator/status/13",
    author: {
      avatarUrl: "https://pbs.twimg.com/profile_images/creator_400x400.jpg",
    },
    quotedPost: {
      text: "quoted proof",
      author: {
        handle: "@quoted",
        avatarUrl: "https://pbs.twimg.com/profile_images/quoted_400x400.jpg",
      },
    },
    stage: "0_to_1k",
    tone: "builder",
    goal: "followers",
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(
      parsed.data.authorAvatarUrl,
      "https://pbs.twimg.com/profile_images/creator_400x400.jpg",
    );
    assert.equal(
      parsed.data.quotedPost?.authorAvatarUrl,
      "https://pbs.twimg.com/profile_images/quoted_400x400.jpg",
    );
  }
});

test("parseExtensionReplyDraftRequest can synthesize tweetUrl from handle and tweetId", () => {
  const parsed = parseExtensionReplyDraftRequest({
    tweetId: "3",
    tweetText: "tweet text",
    authorHandle: "@builder",
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.tweetUrl, "https://x.com/builder/status/3");
  }
});

test("parseExtensionReplyDraftRequest lists playful in invalid tone errors", () => {
  const parsed = parseExtensionReplyDraftRequest({
    tweetId: "3",
    tweetText: "tweet text",
    authorHandle: "builder",
    tweetUrl: "https://x.com/builder/status/3",
    stage: "0_to_1k",
    tone: "chaotic",
    goal: "followers",
  });

  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.equal(
      parsed.message,
      "Invalid option: expected one of \"dry\"|\"bold\"|\"builder\"|\"warm\"|\"playful\".",
    );
  }
});

test("assertExtensionReplyDraftResponseShape enforces safe or bold labels", () => {
  assert.equal(
    assertExtensionReplyDraftResponseShape({
      options: [
        {
          id: "safe-1",
          label: "safe",
          text: "reply one",
          intent: {
            label: "translate",
            strategyPillar: "product positioning",
            anchor: "replies | positioning clarity",
            rationale: "translate the take into practical language for builders",
          },
        },
        { id: "bold-1", label: "bold", text: "reply two" },
      ],
    }),
    true,
  );

  assert.equal(
    assertExtensionReplyDraftResponseShape({
      options: [{ id: "x", label: "other", text: "bad" }],
    }),
    false,
  );
});
