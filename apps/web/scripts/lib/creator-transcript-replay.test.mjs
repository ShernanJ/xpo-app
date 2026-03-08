import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRecentHistory,
  createReplayConversationSnapshot,
  createReplayServiceOverrides,
  findReplayFixture,
  listReplayFixtures,
  replayTranscriptFixture,
} from "./creator-transcript-replay.ts";
import { CREATOR_TRANSCRIPT_FIXTURES } from "../fixtures/creator-transcript-fixtures.ts";

test("replay fixture list exposes checked-in transcript ids", () => {
  const fixtures = listReplayFixtures(CREATOR_TRANSCRIPT_FIXTURES);

  assert.equal(fixtures.some((fixture) => fixture.id === "stan-office-league-story"), true);
  assert.equal(fixtures.some((fixture) => fixture.id === "casual-opening-to-help-offer"), true);
  assert.equal(fixtures.some((fixture) => fixture.id === "direct-draft-first-turn"), true);
  assert.equal(fixtures.some((fixture) => fixture.id === "vague-product-one-question"), true);
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

test("transcript replay delivers a draft for a direct first-turn draft ask", async () => {
  const fixture = findReplayFixture(
    CREATOR_TRANSCRIPT_FIXTURES,
    "direct-draft-first-turn",
  );
  assert.ok(fixture);

  const result = await replayTranscriptFixture(fixture, {
    async generatePlan(message) {
      return {
        objective: message,
        angle: "point out the mistakes directly",
        targetLane: "original",
        mustInclude: ["early-stage founders", "onboarding mistakes"],
        mustAvoid: [],
        hookType: "direct",
        pitchResponse: "run with this angle",
      };
    },
    async generateDrafts(plan) {
      return {
        draft:
          "most early-stage founders treat onboarding like setup. that's why users bounce before value lands.",
        plan,
        supportAsset: null,
      };
    },
    async critiqueDrafts(draft) {
      return {
        approved: true,
        issues: [],
        finalDraft: draft.draft,
      };
    },
  });

  assert.equal(result.turns.length, 1);
  assert.equal(result.turns[0]?.output.mode, "draft");
  assert.equal(result.turns[0]?.output.outputShape, "short_form_post");
  assert.equal(result.turns[0]?.output.surfaceMode, "generate_full_output");
  assert.equal(result.turns[0]?.output.response.toLowerCase().includes("angle first"), false);
  assert.equal(result.turns[0]?.output.data?.draft?.includes("founders"), true);
  assert.equal(result.finalMemory.pendingPlan, null);
});

test("transcript replay asks one useful question for a vague product draft ask, then drafts after the answer", async () => {
  const fixture = findReplayFixture(
    CREATOR_TRANSCRIPT_FIXTURES,
    "vague-product-one-question",
  );
  assert.ok(fixture);

  let generatePlanCalls = 0;
  const result = await replayTranscriptFixture(fixture, {
    async generatePlan(message) {
      generatePlanCalls += 1;
      return {
        objective: message,
        angle: "show the concrete before and after",
        targetLane: "original",
        mustInclude: ["rewrite replies in my voice", "ship posts faster"],
        mustAvoid: [],
        hookType: "contrast",
        pitchResponse: "this is the angle",
      };
    },
    async generateDrafts(plan) {
      return {
        draft:
          "my stanley extension rewrites replies in my voice, so i stop burning time on cleanup and ship posts faster.",
        plan,
        supportAsset: null,
      };
    },
    async critiqueDrafts(draft) {
      return {
        approved: true,
        issues: [],
        finalDraft: draft.draft,
      };
    },
  });

  assert.equal(result.turns.length, 2);
  assert.equal(result.turns[0]?.output.mode, "coach");
  assert.equal(result.turns[0]?.output.surfaceMode, "ask_one_question");
  assert.equal(result.turns[0]?.output.response.toLowerCase().includes("stanley"), true);
  assert.equal(/\?$/.test(result.turns[0]?.output.response.trim()), true);
  assert.equal(result.turns[1]?.output.mode, "draft");
  assert.equal(result.turns[1]?.output.outputShape, "short_form_post");
  assert.equal(
    /made that edit|updated it|reworked it/i.test(result.turns[1]?.output.response || ""),
    false,
  );
  assert.equal(generatePlanCalls, 1);
  assert.equal(result.finalMemory.unresolvedQuestion, null);
  assert.equal(result.finalMemory.pendingPlan, null);
});
