import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildConcreteSceneDraftBlock,
  buildConcreteScenePlanBlock,
  NO_FABRICATION_CONSTRAINT,
  NO_FABRICATION_MUST_AVOID,
} from "../grounding/draftGrounding.ts";
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
  const source =
    "write one about playing league at the stan office against the ceo and losing hard";
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
  const groundingPromptBlockSource = readFileSync(
    fileURLToPath(new URL("./groundingPromptBlock.ts", import.meta.url)),
    "utf8",
  );
  const xPostPromptRulesSource = readFileSync(
    fileURLToPath(new URL("./xPostPromptRules.ts", import.meta.url)),
    "utf8",
  );
  const jsonPromptContractsSource = readFileSync(
    fileURLToPath(new URL("./jsonPromptContracts.ts", import.meta.url)),
    "utf8",
  );
  const promptHydratorSource = readFileSync(
    fileURLToPath(new URL("../prompts/promptHydrator.ts", import.meta.url)),
    "utf8",
  );
  const sparringPartnerToneSource = readFileSync(
    fileURLToPath(new URL("../core/sparringPartnerTone.ts", import.meta.url)),
    "utf8",
  );
  const promptSource = [
    promptBuildersSource,
    groundingPromptBlockSource,
    xPostPromptRulesSource,
    jsonPromptContractsSource,
    promptHydratorSource,
    sparringPartnerToneSource,
  ].join("\n");

  assert.equal(promptSource.includes("FACTUAL GROUNDING:"), true);
  assert.equal(
    promptSource.includes(
      'Do NOT turn the product into "another tool", a meetup, a hashtag engine, a growth hack',
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      "Do NOT widen them into adjacent mechanics, categories, or claims",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      'Do NOT invent first-person usage, personal testing, rollout history, or "i use / i tried / i let it" claims',
    ),
    true,
  );
  assert.equal(promptSource.includes("PLAIN FACTUAL PRODUCT MODE:"), true);
  assert.equal(
    promptSource.includes(
      'Do NOT open with universal claims like "every tool", "most tools", "most people", "everyone", "just another tool"',
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      'Do NOT invent launch language, proof points, or promo CTA copy unless the user explicitly gave them.',
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      "If the grounding already contains clear usable wording, stay close to it instead of rewriting it into new marketing language or synonyms.",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      'Do NOT add an invented before-state or pain-point setup like "tired of...", "stopped overthinking...", or similar framing unless the user actually gave that setup.',
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      'Do NOT restate the same grounded benefit a second time with a new synonym. If the grounding already says "without the mental load", do not add another line like "no extra thinking required."',
    ),
    true,
  );
  assert.equal(
    promptSource.includes("SAFE REFERENCE HINTS (VOICE/SHAPE ONLY):"),
    true,
  );
  assert.equal(
    promptSource.includes(
      "Do NOT turn them into facts, product mechanics, timelines, anecdotes, or proof claims.",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      'The "draft" field must contain only the final X post text.',
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      "If the source brief is phrased as a question, treat it as the problem the post should answer, not as text to paste back into the draft.",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      'Do NOT include speaker labels, chat transcript lines, quoted prompt text, UI chrome, usernames/handles from a mock composer, timestamps, character counters, button labels',
    ),
    true,
  );
  assert.equal(promptSource.includes('"extracted_constraints"'), true);
  assert.equal(promptSource.includes("ACTIVE TASK:"), true);
  assert.equal(
    promptSource.includes(
      "NO PLEASANTRIES: Never use phrases like 'Here is your draft', 'Sure!', 'I can help with that', 'Let's dive in', or 'Let me know what you think'. Output the requested result immediately.",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      "COACHING TONE: You are an elite, high-signal ghostwriter. Speak in direct, punchy sentences. If explaining an edit, explain the mechanical reasoning (e.g., 'Removed emojis to increase authority.').",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      "NO PREACHING: Do not give generic social media advice like 'Consistency is key.' Only comment on the structural mechanics of the text provided.",
    ),
    true,
  );
  assert.equal(promptSource.includes('buildXmlTag("active_task"'), true);
  assert.equal(promptSource.includes('buildXmlTag("target_persona"'), true);
  assert.equal(promptSource.includes("<mechanical_style_rules>"), true);
  assert.equal(promptSource.includes("<session_constraints>"), true);
  assert.equal(promptSource.includes('constraint source="${constraint.source}"'), true);
  assert.equal(promptSource.includes("<golden_examples>"), true);
  assert.equal(
    promptSource.includes(
      "If <session_constraints> conflicts with <mechanical_style_rules>, obey <session_constraints> for the current turn.",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      "CRITICAL INSTRUCTION: You must internalize the <mechanical_style_rules> and format your output to match the structural cadence of the <golden_examples>.",
    ),
    true,
  );
  assert.equal(
    promptSource.includes("extract hidden or implied turn-level rules into"),
    true,
  );
  assert.equal(
    promptSource.includes('args.title || "GROUNDING PACKET"') ||
      promptSource.includes("GROUNDING PACKET:"),
    true,
  );
  assert.equal(promptSource.includes("Source material details:"), true);
  assert.equal(promptSource.includes("SAFE FRAMEWORK FALLBACK MODE:"), true);
  assert.equal(promptSource.includes("FACTUAL TRUTH LAYER:"), true);
  assert.equal(promptSource.includes("STRATEGIC DRAFT PLAN:"), true);
  assert.equal(promptSource.includes("VOICE / SHAPE LAYER:"), true);
  assert.equal(promptSource.includes("ACTIVE ARTIFACT CONTEXT:"), true);
  assert.equal(
    promptSource.includes(
      "If source material details are present, prefer their saved claim/snippet seeds over invented framing.",
    ),
    true,
  );
  assert.equal(promptSource.includes("Factual authority:"), true);
  assert.equal(promptSource.includes("Voice context hints:"), true);
  assert.equal(
    promptSource.includes(
      "Voice context hints can guide territory, framing, or emphasis, but they are NOT proof on their own.",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      "Historical posts, creator-profile hints, and voice examples are NOT factual authority unless the same detail appears in this packet.",
    ),
    true,
  );
  assert.equal(promptSource.includes("CREATOR PROFILE HINTS:"), true);
  assert.equal(
    promptSource.includes(
      "If the request is autobiographical and details are still missing, keep the first-person narrative shape and use [Bracketed Placeholders]",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      "FORMAT OVERRIDE: The user wants a casual observation or joke. Do NOT format this like a standard growth post.",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      "HUMOR EXCEPTION: The user is writing a joke, meme, or shitpost.",
    ),
    true,
  );
  assert.equal(
    promptSource.includes("PLACEHOLDER STORY MODE:"),
    true,
  );
  assert.equal(
    promptSource.includes(
      "If the user asked for a lived-experience story and exact specifics are missing, keep the story angle and use [Bracketed Placeholders] instead of downgrading it into a framework.",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      "Use CREATOR PROFILE HINTS to bias target lane, hook family, and format preference",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      'The hook should come from a real tension, surprise, contradiction, stake, or concrete moment in the request, not a generic "thoughts on" setup.',
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      'Do NOT fill either list with meta writing advice like "be clear", "make it engaging", or "keep it concise."',
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      "Precedence order: FACTUAL TRUTH LAYER overrides STRATEGIC DRAFT PLAN, and STRATEGIC DRAFT PLAN overrides VOICE / SHAPE LAYER.",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      "You have been provided with real-time information in the <live_context> tag.",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      "Use this block to continue the current plan/draft/idea set even if the latest user turn is short.",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      "Treat this artifact context as more reliable than vague transcript wording when they conflict.",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      "Never use VOICE / SHAPE LAYER material to invent facts, metrics, product mechanics, anecdotes, or proof claims.",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      "If SAFE FRAMEWORK FALLBACK MODE is present, prefer a framework, opinion, principle, or plain factual execution over a fake specific one.",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      "Every draft or reply must clearly map to at least one current content pillar or learning signal.",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      "Reject broad motivational filler, generic praise-only replies, and off-brand side quests even if they sound polished.",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      "treat the correction as the source of truth and ignore the older assistant wording.",
    ),
    true,
  );
  assert.equal(
    promptSource.includes(
      "treat that earlier text as superseded and do NOT reuse it.",
    ),
    true,
  );
});

test("writer prompt binds thread execution to the planned beats", () => {
  const promptBuildersSource = readFileSync(
    fileURLToPath(new URL("./promptBuilders.ts", import.meta.url)),
    "utf8",
  );

  assert.equal(
    promptBuildersSource.includes(
      "THREAD BEAT PLAN (draft each post from this structure):",
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      "Draft each post to fulfill its assigned role in order. Each post separated by ---.",
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      "Keep the serialized post count aligned with this beat plan unless a factual or safety constraint makes one beat unusable.",
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      "Use each post's proof points in that post instead of scattering them across the thread.",
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      "If a transition hint is present, make the handoff felt in the wording between those beats.",
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      'Proof points must be concrete evidence, scenes, constraints, examples, or sharp claims from the request/grounding. Do NOT use meta reminders like "be specific", "make it clear", or "keep it engaging" as proof points.',
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      "Use one specific contradiction, surprise, stake, or scene from the source material to earn the hook.",
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      "CLOSE: end the thread with a new ending move - reflection, implication, challenge, CTA, or punchline. Do NOT just paraphrase the payoff.",
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      "If two adjacent posts could swap places without changing the thread, they are too samey - rewrite them so each beat earns its slot.",
    ),
    true,
  );
  assert.equal(
    promptBuildersSource.includes("Default role cadence:"),
    true,
  );
  assert.equal(
    promptBuildersSource.includes(
      "The close must feel like a distinct ending move. Do NOT use the close to simply restate the payoff with slightly different wording.",
    ),
    true,
  );
});

test("reviser prompt keeps grounded revision boundaries for edit requests", () => {
  const reviserSource = readFileSync(
    fileURLToPath(new URL("./reviser.ts", import.meta.url)),
    "utf8",
  );
  const groundingPromptBlockSource = readFileSync(
    fileURLToPath(new URL("./groundingPromptBlock.ts", import.meta.url)),
    "utf8",
  );
  const xPostPromptRulesSource = readFileSync(
    fileURLToPath(new URL("./xPostPromptRules.ts", import.meta.url)),
    "utf8",
  );
  const jsonPromptContractsSource = readFileSync(
    fileURLToPath(new URL("./jsonPromptContracts.ts", import.meta.url)),
    "utf8",
  );
  const reviserPromptSource = [
    reviserSource,
    groundingPromptBlockSource,
    xPostPromptRulesSource,
    jsonPromptContractsSource,
  ].join("\n");

  assert.equal(reviserSource.includes("<previous_draft>"), true);
  assert.equal(reviserSource.includes("<user_critique>"), true);
  assert.equal(reviserSource.includes("<critic_analysis>"), true);
  assert.equal(
    reviserPromptSource.includes('args.title || "GROUNDING PACKET"') ||
      reviserPromptSource.includes("GROUNDING PACKET:"),
    true,
  );
  assert.equal(reviserSource.includes("HOOK EDIT MODE:"), true);
  assert.equal(reviserSource.includes("TONE SHIFT MODE:"), true);
  assert.equal(reviserSource.includes("GENERIC EDIT MODE:"), true);
  assert.equal(reviserSource.includes("FULL REWRITE MODE:"), true);
  assert.equal(
    reviserPromptSource.includes(
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

test("drafting and revision prompts share X-platform rules", () => {
  const xPostPromptRulesSource = readFileSync(
    fileURLToPath(new URL("./xPostPromptRules.ts", import.meta.url)),
    "utf8",
  );

  assert.equal(
    xPostPromptRulesSource.includes(
      "Verification is not a professionalism signal. Do not make the writing more polished or corporate just because the account is verified.",
    ),
    true,
  );
  assert.equal(
    xPostPromptRulesSource.includes(
      "Verification is not a professionalism signal. Do not make the revision sound more polished or corporate just because the account is verified.",
    ),
    true,
  );
  assert.equal(
    xPostPromptRulesSource.includes(
      "X does NOT support markdown styling. Do not use bold, italics, headings, or other markdown markers like **text**, __text__, *text*, # heading, or backticks.",
    ),
    true,
  );
  assert.equal(
    xPostPromptRulesSource.includes(
      "X does NOT support markdown styling. Remove or avoid bold, italics, headings, or markdown markers like **text**, __text__, *text*, # heading, or backticks.",
    ),
    true,
  );
  assert.equal(
    xPostPromptRulesSource.includes(
      `Do NOT use empty engagement-bait CTAs like "reply 'FOCUS'" or "comment 'X'" unless the reader clearly gets something specific in return`,
    ),
    true,
  );
  assert.equal(
    xPostPromptRulesSource.includes(
      `Do NOT introduce empty engagement-bait CTAs like "reply 'FOCUS'" or "comment 'X'" unless the reader clearly gets something concrete in return`,
    ),
    true,
  );
  assert.equal(
    xPostPromptRulesSource.includes(
      `Do NOT allow empty engagement-bait CTAs like "reply 'FOCUS'" or "comment 'X'" unless the reader clearly gets a concrete payoff in return.`,
    ),
    true,
  );
  assert.equal(
    xPostPromptRulesSource.includes(
      "Use numbered framing. Prefix each post with a clear marker like 1/5, 2/5, 3/5",
    ),
    true,
  );
  assert.equal(
    xPostPromptRulesSource.includes(
      "If this is a thread revision, preserve or apply numbered framing like 1/5, 2/5, 3/5",
    ),
    true,
  );
});

test("critic prompt rejects flat middle beats and payoff-as-close endings in threads", () => {
  const criticSource = readFileSync(
    fileURLToPath(new URL("./critic.ts", import.meta.url)),
    "utf8",
  );

  assert.equal(
    criticSource.includes(
      "Middle posts must introduce new information or movement. If a setup/proof/turn post mainly rephrases the previous beat, rewrite it to add a distinct reason to exist.",
    ),
    true,
  );
  assert.equal(
    criticSource.includes(
      "The final post must add a fresh closing move. If it only restates the payoff in slightly different words, rewrite it into a sharper ending.",
    ),
    true,
  );
});

test("critic leaves delivery cleanup to validation workers instead of patching output inline", () => {
  const criticSource = readFileSync(
    fileURLToPath(new URL("./critic.ts", import.meta.url)),
    "utf8",
  );

  assert.equal(criticSource.includes("repairAbruptEnding("), false);
  assert.equal(criticSource.includes("stripTrailingPromptEcho("), false);
  assert.equal(criticSource.includes("stripThreadishLeadLabel("), false);
  assert.equal(criticSource.includes('Cleaned up an abrupt ending.'), false);
  assert.equal(
    criticSource.includes('Removed a trailing prompt echo from the draft.'),
    false,
  );
  assert.equal(
    criticSource.includes('Removed thread-style labeling from a standalone post.'),
    false,
  );
});

test("planner writer reviser and critic share JSON output contracts", () => {
  const jsonPromptContractsSource = readFileSync(
    fileURLToPath(new URL("./jsonPromptContracts.ts", import.meta.url)),
    "utf8",
  );

  assert.equal(
    jsonPromptContractsSource.includes(`"pitchResponse": "Conversational pitch to the user..."`),
    true,
  );
  assert.equal(
    jsonPromptContractsSource.includes(`"requires_live_context": false`),
    true,
  );
  assert.equal(
    jsonPromptContractsSource.includes(`"search_queries": ["specific search query"]`),
    true,
  );
  assert.equal(
    jsonPromptContractsSource.includes(`"draft": "The actual post text. If this is a thread, serialize posts using --- separators between each post."`),
    true,
  );
  assert.equal(
    jsonPromptContractsSource.includes(`"revisedDraft": "..."`),
    true,
  );
  assert.equal(
    jsonPromptContractsSource.includes(`"finalDraft": "The corrected draft text..."`),
    true,
  );
  assert.equal(
    jsonPromptContractsSource.includes("Respond ONLY with a valid JSON matching this schema:"),
    true,
  );
});
