import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

test("writer prompt guardrails extract hard factual grounding from saved constraints", () => {
  const guardrails = resolveWriterPromptGuardrails({
    planMustAvoid: [],
    activeConstraints: [
      "Correction lock: xpo is a x growth/content engine",
      "Topic grounding: xpo: it helps people write and grow faster on x without the mental load",
    ],
    objective: "write a post about xpo",
    angle: "position xpo clearly",
    mustInclude: ["xpo"],
  });

  assert.equal(guardrails.hardFactualGrounding.length, 2);
  assert.equal(
    guardrails.hardFactualGrounding.some((line) =>
      line.includes("xpo is a x growth/content engine"),
    ),
    true,
  );
  assert.equal(
    guardrails.hardFactualGrounding.some((line) =>
      line.includes("mental load"),
    ),
    true,
  );
});

test("planner and writer prompts surface hard factual grounding for product asks", async () => {
  const promptBuildersSource = readFileSync(
    fileURLToPath(new URL("./promptBuilders.ts", import.meta.url)),
    "utf8",
  );

  assert.equal(promptBuildersSource.includes("FACTUAL GROUNDING:"), true);
  assert.equal(
    promptBuildersSource.includes(
      'Do NOT turn the product into "another tool", a meetup, a hashtag engine, a growth hack',
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      "Do NOT widen them into adjacent mechanics, categories, or claims",
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      'Do NOT invent first-person usage, personal testing, rollout history, or "i use / i tried / i let it" claims',
    ),
    true,
  );
  assert.equal(promptBuildersSource.includes("PLAIN FACTUAL PRODUCT MODE:"), true);
  assert.equal(
    promptBuildersSource.includes(
      'Do NOT open with universal claims like "every tool", "most tools", "most people", "everyone", "just another tool"',
    ),
    true,
  );
});
