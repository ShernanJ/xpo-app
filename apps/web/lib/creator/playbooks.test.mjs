import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPlaybookTemplateGroups,
  buildRecommendedPlaybooks,
  inferCurrentPlaybookStage,
} from "./playbooks.ts";

function makeContext(overrides = {}) {
  return {
    creatorProfile: {
      identity: {
        followersCount: 1800,
      },
    },
    strategyDelta: {
      primaryGap: "Discovery from replies",
      adjustments: [
        {
          area: "distribution",
          note: "Reply volume is low and reach stays narrow.",
        },
      ],
    },
    ...overrides,
  };
}

test("inferCurrentPlaybookStage maps follower count to the shared playbook stages", () => {
  assert.equal(inferCurrentPlaybookStage(makeContext({ creatorProfile: { identity: { followersCount: 450 } } })), "0-1k");
  assert.equal(inferCurrentPlaybookStage(makeContext({ creatorProfile: { identity: { followersCount: 5400 } } })), "1k-10k");
  assert.equal(inferCurrentPlaybookStage(makeContext({ creatorProfile: { identity: { followersCount: 14500 } } })), "10k-50k");
  assert.equal(inferCurrentPlaybookStage(makeContext({ creatorProfile: { identity: { followersCount: 98000 } } })), "50k+");
});

test("buildRecommendedPlaybooks uses the shared scoring to rank playbooks", () => {
  const recommendations = buildRecommendedPlaybooks(
    makeContext({
      creatorProfile: {
        identity: {
          followersCount: 450,
        },
      },
    }),
    2,
  );

  assert.equal(recommendations.length, 2);
  assert.equal(recommendations[0]?.playbook.id, "reply-ladder");
  assert.equal(recommendations[1]?.playbook.id, "daily-shipping-loop");
});

test("buildPlaybookTemplateGroups adds fallbacks for missing template tabs", () => {
  const groups = buildPlaybookTemplateGroups({
    id: "minimal-playbook",
    name: "Minimal Playbook",
    outcome: "Test playbook",
    whenItWorks: "Whenever",
    difficulty: "Easy",
    timePerDay: "10 min/day",
    bestFor: [],
    loop: {
      input: "Input",
      action: "Action",
      feedback: "Feedback",
    },
    checklist: {
      daily: [],
      weekly: [],
    },
    templates: [
      {
        id: "minimal-hook",
        label: "Hook",
        text: "hello world",
      },
    ],
    metrics: [],
    rationale: "Test",
    mistakes: [],
    examples: [],
    quickStart: [],
  });

  assert.equal(groups.hook.length, 1);
  assert.equal(groups.reply[0]?.id, "minimal-playbook-reply-fallback");
  assert.equal(groups.thread[0]?.id, "minimal-playbook-thread-fallback");
  assert.equal(groups.cta[0]?.id, "minimal-playbook-cta-fallback");
});
