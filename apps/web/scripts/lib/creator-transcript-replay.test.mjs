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
  assert.equal(fixtures.some((fixture) => fixture.id === "opaque-entity-one-question"), true);
  assert.equal(fixtures.some((fixture) => fixture.id === "pending-plan-draft-command"), true);
  assert.equal(fixtures.some((fixture) => fixture.id === "draft-revision-meaning-loop"), true);
  assert.equal(fixtures.some((fixture) => fixture.id === "xpo-correction-loop"), true);
  assert.equal(fixtures.some((fixture) => fixture.id === "xpo-correction-then-redraft"), true);
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

test("transcript replay turns a pending-plan draft command straight into a draft", async () => {
  const fixture = findReplayFixture(
    CREATOR_TRANSCRIPT_FIXTURES,
    "pending-plan-draft-command",
  );
  assert.ok(fixture);

  let generateDraftCalls = 0;
  let generatePlanCalls = 0;
  const result = await replayTranscriptFixture(fixture, {
    async generatePlan() {
      generatePlanCalls += 1;
      return null;
    },
    async generateDrafts(plan) {
      generateDraftCalls += 1;
      return {
        draft:
          "most early-stage founders bury the value in onboarding. users bounce before they ever see the payoff.",
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
  assert.equal(result.turns[0]?.output.response.toLowerCase().includes("angle first"), false);
  assert.equal(generateDraftCalls, 1);
  assert.equal(generatePlanCalls, 0);
  assert.equal(result.finalMemory.pendingPlan, null);
  assert.equal(result.finalMemory.conversationState, "draft_ready");
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

test("transcript replay asks for entity definition before drafting an opaque named product topic", async () => {
  const fixture = findReplayFixture(
    CREATOR_TRANSCRIPT_FIXTURES,
    "opaque-entity-one-question",
  );
  assert.ok(fixture);

  let generatePlanCalls = 0;
  let lastPlanMessage = "";
  const result = await replayTranscriptFixture(fixture, {
    async generatePlan(message) {
      generatePlanCalls += 1;
      lastPlanMessage = message;
      return {
        objective: message,
        angle: "position xpo as a direct growth engine, not generic software",
        targetLane: "original",
        mustInclude: ["x growth/content engine", "helps people write and grow faster"],
        mustAvoid: ["hashtags", "meetup", "conference panel"],
        hookType: "direct",
        pitchResponse: "this angle is clean",
      };
    },
    async generateDrafts(plan) {
      return {
        draft:
          "xpo isn't another generic tool. it's a x growth/content engine that helps people write faster, post with more intent, and grow without burning mental cycles.",
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
  assert.equal(result.turns[0]?.output.response.toLowerCase().includes("what is xpo"), true);
  assert.equal(result.turns[0]?.output.response.toLowerCase().includes("before i write the post"), true);
  assert.equal(result.turns[1]?.output.mode, "draft");
  assert.equal(lastPlanMessage.toLowerCase().includes("write a post about xpo"), true);
  assert.equal(lastPlanMessage.toLowerCase().includes("factual grounding"), true);
  assert.equal(lastPlanMessage.toLowerCase().includes("mental load"), true);
  assert.equal(result.turns[1]?.output.data?.draft?.toLowerCase().includes("hashtag"), false);
  assert.equal(result.turns[1]?.output.data?.draft?.toLowerCase().includes("meetup"), false);
  assert.equal(generatePlanCalls, 1);
  assert.equal(
    result.finalMemory.activeConstraints.some((constraint) =>
      constraint.toLowerCase().includes("topic grounding: xpo: it helps people write and grow faster on x without the mental load"),
    ),
    true,
  );
  assert.equal(result.finalMemory.unresolvedQuestion, null);
  assert.equal(result.finalMemory.pendingPlan, null);
});

test("transcript replay revises a draft after 'that feels forced' and stays blunt on draft-meaning pushback", async () => {
  const fixture = findReplayFixture(
    CREATOR_TRANSCRIPT_FIXTURES,
    "draft-revision-meaning-loop",
  );
  assert.ok(fixture);

  let generateDraftCalls = 0;
  let revisionCalls = 0;
  const result = await replayTranscriptFixture(fixture, {
    async classifyIntent() {
      return {
        intent: "coach",
        needs_memory_update: false,
        confidence: 1,
      };
    },
    async generatePlan(message) {
      return {
        objective: message,
        angle: "call out the mistake without overexplaining",
        targetLane: "original",
        mustInclude: ["onboarding mistakes", "early-stage founders"],
        mustAvoid: [],
        hookType: "direct",
        pitchResponse: "run with this angle",
      };
    },
    async generateDrafts(plan) {
      generateDraftCalls += 1;
      return {
        draft:
          "early-stage founders keep making onboarding way too clever, so users bounce before the product earns the second click.",
        plan,
        supportAsset: null,
      };
    },
    async generateRevisionDraft() {
      revisionCalls += 1;
      return {
        revisedDraft:
          "most early-stage founders overcomplicate onboarding, and users leave before the product proves anything.",
        supportAsset: null,
        issuesFixed: ["Pulled the wording closer to a plainspoken tone."],
      };
    },
    async critiqueDrafts(draft) {
      return {
        approved: true,
        issues: [],
        finalDraft: draft.draft || draft.revisedDraft,
      };
    },
  });

  assert.equal(result.turns.length, 3);
  assert.equal(result.turns[0]?.output.mode, "draft");
  assert.equal(result.turns[1]?.output.mode, "draft");
  assert.equal(result.turns[2]?.output.mode, "coach");
  assert.equal(generateDraftCalls, 1);
  assert.equal(revisionCalls, 1);
  assert.equal(
    /as written, it's muddy/i.test(result.turns[2]?.output.response || ""),
    true,
  );
  assert.equal(
    /the point is|what this means is/i.test(result.turns[2]?.output.response || ""),
    false,
  );
});

test("transcript replay keeps xpo corrections factual instead of turning them into new ideation prompts", async () => {
  const fixture = findReplayFixture(
    CREATOR_TRANSCRIPT_FIXTURES,
    "xpo-correction-loop",
  );
  assert.ok(fixture);

  const result = await replayTranscriptFixture(fixture, {
    async classifyIntent() {
      return {
        intent: "coach",
        needs_memory_update: false,
        confidence: 1,
      };
    },
  });

  assert.equal(result.turns.length, 3);
  assert.equal(result.turns[0]?.output.mode, "coach");
  assert.equal(result.turns[1]?.output.mode, "coach");
  assert.equal(result.turns[2]?.output.mode, "coach");
  assert.equal(result.turns[0]?.output.response.toLowerCase().includes("keep this factual"), true);
  assert.equal(result.turns[1]?.output.response.toLowerCase().includes("hashtags"), true);
  assert.equal(result.turns[2]?.output.response.toLowerCase().includes("you were correcting me"), true);
  assert.equal(
    /pain point|which one should i draft first/i.test(result.turns[2]?.output.response || ""),
    false,
  );
  assert.equal(result.finalMemory.pendingPlan, null);
  assert.equal(
    result.finalMemory.activeConstraints.some((constraint) =>
      constraint.toLowerCase().includes("xpo doesn't generate hashtags"),
    ),
    true,
  );
});

test("transcript replay reuses product correction locks on the next draft request", async () => {
  const fixture = findReplayFixture(
    CREATOR_TRANSCRIPT_FIXTURES,
    "xpo-correction-then-redraft",
  );
  assert.ok(fixture);

  let lastPlanMessage = "";
  const result = await replayTranscriptFixture(fixture, {
    async generatePlan(message) {
      lastPlanMessage = message;
      return {
        objective: "write a post about xpo",
        angle: "position xpo as a x growth/content engine without fake mechanics",
        targetLane: "original",
        mustInclude: ["x growth/content engine"],
        mustAvoid: ["hashtags", "conference panel", "meetup"],
        hookType: "direct",
        pitchResponse: "this angle is clean",
      };
    },
    async generateDrafts(plan) {
      return {
        draft:
          "xpo is a x growth/content engine. it helps people write and grow faster without adding more mental load.",
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
  assert.equal(result.turns[0]?.output.surfaceMode, "generate_full_output");
  assert.equal(lastPlanMessage.toLowerCase().includes("factual grounding"), true);
  assert.equal(lastPlanMessage.toLowerCase().includes("xpo is a x growth/content engine"), true);
  assert.equal(lastPlanMessage.toLowerCase().includes("xpo doesn't generate hashtags"), true);
  assert.equal(result.turns[0]?.output.response.toLowerCase().includes("what is xpo"), false);
  assert.equal(result.turns[0]?.output.data?.draft?.toLowerCase().includes("hashtag"), false);
});
