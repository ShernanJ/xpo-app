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

test("assertExtensionReplyDraftResponseShape enforces safe or bold labels", () => {
  assert.equal(
    assertExtensionReplyDraftResponseShape({
      options: [
        { id: "safe-1", label: "safe", text: "reply one" },
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
