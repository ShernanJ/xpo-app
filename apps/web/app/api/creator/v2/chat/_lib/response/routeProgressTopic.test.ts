import test from "node:test";
import assert from "node:assert/strict";

import { resolveProgressTopic } from "./routeProgressTopic.ts";

test("resolveProgressTopic falls back to a safe creator hint when recent topics are noisy", () => {
  assert.equal(
    resolveProgressTopic({
      profileReplyContext: {
        topicInsights: [
          {
            label: "asian men in toronto all dress the same https://t.co/mock-image",
          },
        ],
        topicBullets: ["asian men in toronto all dress the same httpp"],
      },
      creatorProfileHints: {
        contentPillars: ["Growth and distribution lessons"],
        knownFor: "Toronto creator culture",
      },
    }),
    "Growth and distribution lessons",
  );
});
