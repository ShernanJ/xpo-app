import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRecentHistory,
  createReplayConversationSnapshot,
  createReplayServiceOverrides,
  findReplayFixture,
  listReplayFixtures,
} from "./creator-transcript-replay.ts";
import { CREATOR_TRANSCRIPT_FIXTURES } from "../fixtures/creator-transcript-fixtures.ts";

test("replay fixture list exposes checked-in transcript ids", () => {
  const fixtures = listReplayFixtures(CREATOR_TRANSCRIPT_FIXTURES);

  assert.equal(fixtures.some((fixture) => fixture.id === "stan-office-league-story"), true);
  assert.equal(fixtures.some((fixture) => fixture.id === "casual-opening-to-help-offer"), true);
});

test("replay fixture lookup returns the matching transcript", () => {
  const fixture = findReplayFixture(
    CREATOR_TRANSCRIPT_FIXTURES,
    "stan-office-league-story",
  );

  assert.ok(fixture);
  assert.equal(fixture?.turns.length, 7);
});

test("recent history builder mirrors route-style user and assistant lines", () => {
  const history = buildRecentHistory([
    { role: "user", message: "hi how are you" },
    { role: "assistant", message: "doing good. you?" },
    { role: "user", message: "vibing" },
  ]);

  assert.equal(
    history,
    "user: hi how are you\nassistant: doing good. you?\nuser: vibing",
  );
});

test("in-memory replay services preserve pending plan and clarification state", async () => {
  const fixture = findReplayFixture(
    CREATOR_TRANSCRIPT_FIXTURES,
    "casual-opening-to-help-offer",
  );
  assert.ok(fixture);

  const services = createReplayServiceOverrides(fixture);
  const created = await services.createConversationMemory?.({
    runId: "replay_fixture",
    threadId: "replay_fixture",
    userId: "replay-user",
  });

  assert.ok(created);

  await services.updateConversationMemory?.({
    runId: "replay_fixture",
    threadId: "replay_fixture",
    topicSummary: "x growth",
    activeConstraints: ["no emojis"],
    conversationState: "plan_pending_approval",
    pendingPlan: {
      objective: "x growth",
      angle: "say less, post better",
      targetLane: "original",
      mustInclude: ["shorter posts"],
      mustAvoid: ["generic advice"],
      hookType: "direct",
      pitchResponse: "run with a blunt version",
    },
    unresolvedQuestion: "do you want examples or a draft?",
    clarificationQuestionsAsked: 1,
  });

  const updated = await services.getConversationMemory?.({
    runId: "replay_fixture",
    threadId: "replay_fixture",
  });
  const snapshot = createReplayConversationSnapshot(updated);

  assert.equal(snapshot.topicSummary, "x growth");
  assert.equal(snapshot.activeConstraints.includes("no emojis"), true);
  assert.equal(snapshot.pendingPlan?.objective, "x growth");
  assert.equal(snapshot.unresolvedQuestion, "do you want examples or a draft?");
  assert.equal(snapshot.clarificationQuestionsAsked, 1);
});
