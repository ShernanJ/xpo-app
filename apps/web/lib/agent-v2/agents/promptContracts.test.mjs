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
  assert.equal(
    promptBuildersSource.includes(
      'Do NOT invent launch language, proof points, or promo CTA copy unless the user explicitly gave them.',
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      "If the grounding already contains clear usable wording, stay close to it instead of rewriting it into new marketing language or synonyms.",
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      'Do NOT add an invented before-state or pain-point setup like "tired of...", "stopped overthinking...", or similar framing unless the user actually gave that setup.',
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      'Do NOT restate the same grounded benefit a second time with a new synonym. If the grounding already says "without the mental load", do not add another line like "no extra thinking required."',
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes("SAFE REFERENCE HINTS (VOICE/SHAPE ONLY):"),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      "Do NOT turn them into facts, product mechanics, timelines, anecdotes, or proof claims.",
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      'The "draft" field must contain only the final X post text.',
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      'Do NOT include speaker labels, chat transcript lines, quoted prompt text, UI chrome, usernames/handles from a mock composer, timestamps, character counters, button labels',
    ),
    true,
  );
  assert.equal(promptBuildersSource.includes("GROUNDING PACKET:"), true);
  assert.equal(promptBuildersSource.includes("Source material details:"), true);
  assert.equal(
    promptBuildersSource.includes(
      "If source material details are present, prefer their saved claim/snippet seeds over invented framing.",
    ),
    true,
  );
  assert.equal(promptBuildersSource.includes("CREATOR PROFILE HINTS:"), true);
  assert.equal(
    promptBuildersSource.includes(
      "If Allowed first-person claims is empty, do NOT choose or draft a lived-experience story.",
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      "Use CREATOR PROFILE HINTS to bias target lane, hook family, and format preference",
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      "Every draft or reply must clearly map to at least one current content pillar or learning signal.",
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      "Reject broad motivational filler, generic praise-only replies, and off-brand side quests even if they sound polished.",
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      "treat the correction / grounding as the source of truth and ignore the older assistant wording.",
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      "treat that earlier text as superseded and do NOT reuse it.",
    ),
    true,
  );
});

test("reviser prompt keeps grounded revision boundaries for edit requests", () => {
  const reviserSource = readFileSync(
    fileURLToPath(new URL("./reviser.ts", import.meta.url)),
    "utf8",
  );

  assert.equal(reviserSource.includes("CURRENT USER NOTE:"), true);
  assert.equal(reviserSource.includes("GROUNDING PACKET:"), true);
  assert.equal(reviserSource.includes("HOOK EDIT MODE:"), true);
  assert.equal(reviserSource.includes("TONE SHIFT MODE:"), true);
  assert.equal(reviserSource.includes("GENERIC EDIT MODE:"), true);
  assert.equal(reviserSource.includes("FULL REWRITE MODE:"), true);
  assert.equal(
    reviserSource.includes(
      "If a detail is not supported here, in the current draft, or in the current user note, do not add it.",
    ),
    true,
  );
  assert.equal(
    reviserSource.includes(
      "Do NOT add new metrics, results, follower spikes, experiments, timelines, named customers, product mechanics, or autobiographical usage claims",
    ),
    true,
  );
});
