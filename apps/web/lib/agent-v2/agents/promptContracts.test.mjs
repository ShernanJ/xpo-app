import test from "node:test";
import assert from "node:assert/strict";

import {
  buildConcreteSceneDraftBlock,
  buildConcreteScenePlanBlock,
  NO_FABRICATION_CONSTRAINT,
  NO_FABRICATION_MUST_AVOID,
} from "../orchestrator/draftGrounding.ts";
import { resolveWriterPromptGuardrails } from "./draftPromptGuards.ts";

test("planner concrete-scene block stays anchored to the literal anecdote", () => {
  const instruction = buildConcreteScenePlanBlock(
    "can you write me a post on playing league at the stan office against the ceo and losing hard",
  );

  assert.equal(instruction.includes("CONCRETE SCENE MODE:"), true);
  assert.equal(instruction.includes("league"), true);
  assert.equal(instruction.includes("ceo"), true);
  assert.equal(
    instruction.includes("Preserve the literal scene the user named"),
    true,
  );
  assert.equal(
    instruction.includes(
      "Do NOT force a growth takeaway, product pitch, or X tactic unless the user explicitly asked for it.",
    ),
    true,
  );
});

test("writer concrete-scene block prevents neat fake growth morals", () => {
  const source = [
    "write one about playing league at the stan office against the ceo and losing hard",
    NO_FABRICATION_CONSTRAINT,
    NO_FABRICATION_MUST_AVOID,
  ].join(" ");
  const instruction = buildConcreteSceneDraftBlock(source);

  assert.equal(instruction.includes("CONCRETE SCENE DRAFT MODE:"), true);
  assert.equal(
    instruction.includes(
      "Do NOT inject a growth lesson, product mechanic, hashtag/data angle, or app pitch that the user never mentioned.",
    ),
    true,
  );
  assert.equal(
    instruction.includes("Keep the post grounded in that exact moment instead of drifting into a different story."),
    true,
  );
  assert.equal(
    instruction.includes("The user's literal source scene is:"),
    true,
  );
  assert.equal(instruction.includes("stan office"), true);
  assert.equal(instruction.includes("ceo"), true);
});

test("writer prompt guardrails enable concrete scene mode for anecdote prompts", () => {
  const guardrails = resolveWriterPromptGuardrails({
    planMustAvoid: [],
    activeConstraints: [],
    sourceUserMessage:
      "can you write me a post on playing league at the stan office against the ceo and losing hard",
    objective: "play league at the stan office against the ceo and lose hard",
    angle: "self-own from a literal office game",
    mustInclude: ["stan office", "ceo", "league loss"],
  });

  assert.equal(guardrails.noFabricatedAnecdotesGuardrail, false);
  assert.equal(guardrails.concreteSceneMode, true);
  assert.equal(guardrails.sceneSource.includes("stan office"), true);
});

test("writer prompt guardrails still enable strict factual mode from no-fabrication guardrails", () => {
  const guardrails = resolveWriterPromptGuardrails({
    planMustAvoid: [NO_FABRICATION_MUST_AVOID],
    activeConstraints: [NO_FABRICATION_CONSTRAINT],
    objective: "product lessons",
    angle: "keep it generic",
    mustInclude: [],
  });

  assert.equal(guardrails.noFabricatedAnecdotesGuardrail, true);
  assert.equal(guardrails.concreteSceneMode, true);
});
