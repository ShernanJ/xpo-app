import type { Persona } from "../../generated/prisma/client";
import type { VoiceStyleCard } from "../core/styleProfile.ts";
import type { VoiceTarget } from "../core/voiceTarget.ts";
import {
  inferPreferredListMarker,
  resolveDraftCasingPreference,
} from "../core/voiceSignals.ts";
import { buildXpoSparringPartnerPromptBlock } from "../core/sparringPartnerTone.ts";
import type {
  ConversationState,
  DraftFormatPreference,
  DraftPreference,
  SessionConstraint,
  StrategyPlan,
} from "../contracts/chat.ts";
import type { CreatorProfileHints } from "../grounding/groundingPacket.ts";

function normalizeList(values: string[], fallback: string): string {
  const filtered = values.map((value) => value.trim()).filter(Boolean);
  return filtered.length > 0 ? filtered.join(" | ") : fallback;
}

type PromptHydrationMode = "coach" | "ideate" | "plan" | "draft" | "critic";

const PERSONA_PROMPT_HINTS: Record<Persona, string> = {
  EDUCATOR:
    "You are an educator. Prioritize clear, actionable breakdowns and high-signal teaching.",
  CURATOR:
    "You are a curator. Synthesize patterns, distill what matters, and frame ideas through sharp selection and commentary.",
  ENTERTAINER:
    "You are an entertainer. Focus on observational humor, irony, and casual pacing.",
  DOCUMENTARIAN:
    "You are a documentarian. Lean on build-in-public details, behind-the-scenes process, and real operating lessons.",
  PROVOCATEUR:
    "You are a provocateur. Lean into contrarian angles, bold claims, and debate-sparking hooks.",
  CASUAL:
    "You are casual. Keep the tone conversational, low-friction, and human.",
};

export interface PromptHydrationEnvelopeArgs {
  mode: PromptHydrationMode;
  goal: string;
  conversationState: ConversationState;
  styleCard: VoiceStyleCard | null;
  primaryPersona?: Persona | null;
  antiPatterns: string[];
  voiceTarget?: VoiceTarget | null;
  activeConstraints?: string[];
  sessionConstraints?: SessionConstraint[];
  creatorProfileHints?: CreatorProfileHints | null;
  goldenExamples?: string[] | null;
  userContextString?: string;
  activeTaskSummary?: string | null;
  activePlan?: StrategyPlan | null;
  activeDraft?: string;
  latestRefinementInstruction?: string | null;
  lastIdeationAngles?: string[];
}

function stripSectionHeading(value: string): string {
  const trimmed = value.trim();
  const newlineIndex = trimmed.indexOf("\n");
  if (newlineIndex === -1) {
    return trimmed.replace(/^[^:]+:\s*/u, "").trim();
  }

  const firstLine = trimmed.slice(0, newlineIndex);
  if (!firstLine.includes(":")) {
    return trimmed;
  }

  return trimmed.slice(newlineIndex + 1).trim();
}

export function escapeXmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function wrapXmlCdata(value: string): string {
  return `<![CDATA[${value.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

function buildXmlTag(name: string, value: string): string {
  return `<${name}>${escapeXmlText(value)}</${name}>`;
}

function buildOptionalXmlTag(name: string, value: string | null): string | null {
  if (!value?.trim()) {
    return null;
  }

  return buildXmlTag(name, value.trim());
}

function buildResolvedStylePayload(args: {
  styleCard: VoiceStyleCard | null;
  voiceTarget?: VoiceTarget | null;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = args.styleCard
    ? JSON.parse(JSON.stringify(args.styleCard))
    : {};

  if (args.voiceTarget) {
    payload.voice_target_override = {
      summary: args.voiceTarget.summary,
      rationale: args.voiceTarget.rationale,
      casing: args.voiceTarget.casing,
      compression: args.voiceTarget.compression,
      formality: args.voiceTarget.formality,
      hookStyle: args.voiceTarget.hookStyle,
      emojiPolicy: args.voiceTarget.emojiPolicy,
      ctaPolicy: args.voiceTarget.ctaPolicy,
      risk: args.voiceTarget.risk,
      lane: args.voiceTarget.lane,
    };
  }

  return payload;
}

function buildTargetPersonaValue(args: {
  primaryPersona?: Persona | null;
  creatorProfileHints?: CreatorProfileHints | null;
  userContextString?: string;
}): string {
  const personaLines: string[] = [];

  if (args.primaryPersona) {
    personaLines.push(PERSONA_PROMPT_HINTS[args.primaryPersona]);
  }

  if (args.creatorProfileHints?.knownFor) {
    personaLines.push(`Known for: ${args.creatorProfileHints.knownFor}`);
  }

  if (args.creatorProfileHints?.targetAudience) {
    personaLines.push(`Target audience: ${args.creatorProfileHints.targetAudience}`);
  }

  if (args.creatorProfileHints?.contentPillars?.length) {
    personaLines.push(
      `Content pillars: ${args.creatorProfileHints.contentPillars.join(" | ")}`,
    );
  }

  if (args.creatorProfileHints?.toneGuidelines?.length) {
    personaLines.push(
      `Tone guidelines: ${args.creatorProfileHints.toneGuidelines.join(" | ")}`,
    );
  }

  if (args.userContextString?.trim()) {
    personaLines.push(args.userContextString.trim());
  }

  return personaLines.join("\n") || "No target persona provided.";
}

function buildActiveTaskValue(args: {
  activeTaskSummary?: string | null;
  activePlan?: StrategyPlan | null;
  activeDraft?: string;
  latestRefinementInstruction?: string | null;
  lastIdeationAngles?: string[];
}): string {
  const lines: string[] = [];

  if (args.activeTaskSummary?.trim()) {
    lines.push(args.activeTaskSummary.trim());
  }

  if (args.activePlan) {
    lines.push(
      `Current plan objective: ${args.activePlan.objective}`,
      `Current plan angle: ${args.activePlan.angle}`,
      `Current plan format: ${args.activePlan.formatPreference || "shortform"}`,
    );
  }

  if (args.activeDraft?.trim()) {
    lines.push("Current draft artifact: present");
  }

  if (args.latestRefinementInstruction?.trim()) {
    lines.push(`Latest refinement instruction: ${args.latestRefinementInstruction.trim()}`);
  }

  if (args.lastIdeationAngles?.length) {
    lines.push(`Current ideation options: ${args.lastIdeationAngles.slice(0, 3).join(" | ")}`);
  }

  return lines.join("\n") || "No active task summary provided.";
}

function buildSessionConstraintsXml(args: {
  sessionConstraints?: SessionConstraint[];
  activeConstraints?: string[];
}): string {
  const constraints =
    args.sessionConstraints && args.sessionConstraints.length > 0
      ? args.sessionConstraints
      : (args.activeConstraints || []).map((text) => ({
          source: "explicit" as const,
          text,
        }));

  const entries = constraints
    .map((constraint) => ({
      source: constraint.source,
      text: constraint.text.trim(),
    }))
    .filter((constraint) => constraint.text.length > 0);

  if (entries.length === 0) {
    return "<session_constraints></session_constraints>";
  }

  return [
    "<session_constraints>",
    ...entries.map(
      (constraint) =>
        `  <constraint source="${constraint.source}">${escapeXmlText(constraint.text)}</constraint>`,
    ),
    "</session_constraints>",
  ].join("\n");
}

function buildGoldenExamplesXml(
  args: {
    creatorProfileHints?: CreatorProfileHints | null;
    goldenExamples?: string[] | null;
  },
): string {
  const examples =
    typeof args.goldenExamples !== "undefined"
      ? (args.goldenExamples || [])
          .map((example) => example.trim())
          .filter(Boolean)
          .slice(0, 3)
      : (args.creatorProfileHints?.topExampleSnippets || [])
          .map((example) => example.trim())
          .filter(Boolean)
          .slice(0, 3);

  if (examples.length === 0) {
    return "<golden_examples></golden_examples>";
  }

  return [
    "<golden_examples>",
    ...examples.map(
      (example, index) =>
        `  <example index="${index}">${escapeXmlText(example)}</example>`,
    ),
    "</golden_examples>",
  ].join("\n");
}

export function buildPromptHydrationEnvelope(
  args: PromptHydrationEnvelopeArgs,
): string {
  const goalBias = stripSectionHeading(buildGoalHydrationBlock(args.goal, args.mode));
  const stateBias = stripSectionHeading(
    buildStateHydrationBlock(args.conversationState, args.mode),
  );
  const voiceBias = stripSectionHeading(
    buildVoiceHydrationBlock(args.styleCard, args.voiceTarget),
  );
  const negativeGuidance = stripSectionHeading(
    buildAntiPatternBlock(args.antiPatterns),
  );
  const targetPersona = buildTargetPersonaValue({
    primaryPersona: args.primaryPersona,
    creatorProfileHints: args.creatorProfileHints,
    userContextString: args.userContextString,
  });
  const activeTask = buildActiveTaskValue({
    activeTaskSummary: args.activeTaskSummary,
    activePlan: args.activePlan,
    activeDraft: args.activeDraft,
    latestRefinementInstruction: args.latestRefinementInstruction,
    lastIdeationAngles: args.lastIdeationAngles,
  });
  const stylePayload = JSON.stringify(
    buildResolvedStylePayload({
      styleCard: args.styleCard,
      voiceTarget: args.voiceTarget,
    }),
  );

  return [
    "<prompt_hydration>",
    `  ${buildXmlTag("active_task", activeTask)}`,
    `  ${buildXmlTag("target_persona", targetPersona)}`,
    `  ${buildXmlTag("goal_bias", goalBias)}`,
    `  ${buildXmlTag("state_bias", stateBias)}`,
    `  ${buildXmlTag("voice_bias", voiceBias)}`,
    `  ${buildXmlTag("negative_guidance", negativeGuidance)}`,
    buildOptionalXmlTag("profile_context", args.userContextString?.trim() || null)
      ? `  ${buildOptionalXmlTag("profile_context", args.userContextString?.trim() || null)}`
      : null,
    `  <mechanical_style_rules>${wrapXmlCdata(stylePayload)}</mechanical_style_rules>`,
    buildSessionConstraintsXml({
      sessionConstraints: args.sessionConstraints,
      activeConstraints: args.activeConstraints,
    })
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n"),
    buildGoldenExamplesXml({
      creatorProfileHints: args.creatorProfileHints,
      goldenExamples: args.goldenExamples,
    })
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n"),
    "</prompt_hydration>",
    "If <session_constraints> conflicts with <mechanical_style_rules>, obey <session_constraints> for the current turn.",
    "CRITICAL INSTRUCTION: You must internalize the <mechanical_style_rules> and format your output to match the structural cadence of the <golden_examples>.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildConversationToneBlock(
  mode: "chat" | "plan" | "draft" | "critic" = "chat",
): string {
  if (mode === "draft" || mode === "critic") {
    return [
      buildXpoSparringPartnerPromptBlock(),
      "",
      "WRITING NATURALNESS:",
      "- Write like the creator, not like the assistant.",
      "- Keep the language concrete, plainspoken, and human.",
      "- Avoid consultant jargon, hype, and canned AI framing.",
      "- Do not compress every beat into a reactive one-liner when the format is thread or longform.",
      "- Let scenes, proof beats, and transitions breathe when that matches the creator's cadence.",
      "- Use paragraph breaks when they make the thread feel more native to X.",
    ].join("\n");
  }

  if (mode === "plan") {
    return [
      buildXpoSparringPartnerPromptBlock(),
      "",
      "HUMAN SPEECH POLICY:",
      "- Be concise, specific, and direct.",
      "- Do not use canned affirmations like 'great question' or 'absolutely.'",
      "- Do not add fluff, hype, praise, or performative friendliness.",
      "- Avoid filler openers like 'love that', 'totally', or 'for sure' unless the user is clearly talking that way first.",
      "- Ask at most one question unless the UI is showing explicit choice chips.",
      "- Prefer concrete language over abstract strategy jargon.",
    ].join("\n");
  }

  return [
    buildXpoSparringPartnerPromptBlock(),
    "",
    "HUMAN SPEECH POLICY:",
    "- Be concise, specific, and clear.",
    "- Do not use canned affirmations like 'great question' or 'absolutely.'",
    "- Do not add fluff, hype, praise, or performative friendliness.",
    "- Avoid filler openers like 'love that', 'totally', or 'for sure' unless the user is clearly talking that way first.",
    "- Do not repeat the same opener patterns turn after turn.",
    "- Ask at most one question unless the UI is showing explicit choice chips.",
    "- Prefer concrete language over abstract strategy jargon.",
    "- Sound like a thoughtful operator, not a casual internet friend.",
    "- Make every sentence earn its place. If a line does not help the user write, choose, revise, or understand, cut it.",
  ].join("\n");
}

export function buildGoalHydrationBlock(
  goal: string,
  mode: "coach" | "ideate" | "plan" | "draft" | "critic",
): string {
  const normalizedGoal = goal.trim().toLowerCase();

  if (normalizedGoal.includes("monet") || normalizedGoal.includes("authority")) {
    return [
      `GOAL BIAS (${mode}):`,
      "- Prioritize specificity, proof, and credibility.",
      "- Favor angles that make the user sound experienced instead of merely motivational.",
    ].join("\n");
  }

  return [
    `GOAL BIAS (${mode}):`,
    "- Prioritize clear hooks and immediate relevance.",
    "- Favor angles that are easier for a broader audience to instantly understand.",
  ].join("\n");
}

export function buildStateHydrationBlock(
  conversationState: ConversationState,
  mode: "coach" | "ideate" | "plan" | "draft" | "critic",
): string {
  switch (conversationState) {
    case "plan_pending_approval":
      return [
        `STATE BIAS (${mode}):`,
        "- The user has already seen an outline.",
        "- Keep the reply focused on confirming, revising, or tightening that direction.",
      ].join("\n");
    case "draft_ready":
      return [
        `STATE BIAS (${mode}):`,
        "- The conversation already has enough context to move forward.",
        "- Avoid reopening broad discovery unless the user clearly changes direction.",
      ].join("\n");
    case "needs_more_context":
      return [
        `STATE BIAS (${mode}):`,
        "- Pull the user toward one concrete detail instead of broad strategy talk.",
      ].join("\n");
    default:
      return [
        `STATE BIAS (${mode}):`,
        "- Stay focused on the next concrete step and avoid robotic scaffolding.",
      ].join("\n");
  }
}

export function buildVoiceHydrationBlock(
  styleCard: VoiceStyleCard | null,
  voiceTarget?: VoiceTarget | null,
): string {
  if (!styleCard) {
    if (!voiceTarget) {
      return "VOICE BIAS: Mirror a crisp, analytical collaborator by default. Use standard casing and professional phrasing unless the user explicitly asks for something looser.";
    }

    return [
      "VOICE BIAS:",
      "- Treat the resolved VoiceTarget below as the authoritative style target for this turn.",
      `- Resolved target: ${voiceTarget.summary}`,
      ...voiceTarget.rationale.map((line) => `- ${line}`),
    ].join("\n");
  }

  const resolvedCasing = voiceTarget?.casing
    ? voiceTarget.casing
    : resolveDraftCasingPreference({
        styleCard,
      }).casing;
  const preferredListMarker = inferPreferredListMarker(styleCard);

  const lines = [
    "VOICE BIAS:",
    "- Match the creator's actual voice. Do not make it more polished, corporate, or professional just because the account is verified or established.",
    "- If the available voice evidence is weak or mixed, bias toward clear standard casing and precise wording instead of slang or lowercase mimicry.",
    `- Pacing: ${styleCard.pacing || "direct and conversational"}`,
    `- Familiar openers: ${normalizeList(styleCard.sentenceOpenings || [], "none recorded")}`,
    `- Vocabulary: ${normalizeList(styleCard.slangAndVocabulary || [], "keep it plainspoken")}`,
    resolvedCasing === "lowercase"
      ? "- Casing: keep it all lowercase unless a proper noun or URL truly needs otherwise."
      : resolvedCasing === "uppercase"
        ? "- Casing: keep it uppercase when the creator has explicitly asked for it."
      : "- Casing: follow the creator's normal casing instead of defaulting to formal title-case phrasing.",
    preferredListMarker
      ? `- Lists: when writing list items, prefer "${preferredListMarker}" as the bullet marker.`
      : "- Lists: preserve the creator's usual list style when they use bullet points.",
    styleCard.formattingRules?.length
      ? `- Formatting: ${styleCard.formattingRules.join(" | ")}`
      : "- Formatting: keep it readable and natural.",
  ];

  if (voiceTarget) {
    lines.push(
      "- VoiceTarget override: treat these per-turn settings as authoritative even when the stored history is mixed.",
      `- Resolved target: ${voiceTarget.summary}`,
      ...voiceTarget.rationale.map((line) => `- ${line}`),
    );
  }

  return lines.join("\n");
}

export function buildAntiPatternBlock(antiPatterns: string[]): string {
  if (antiPatterns.length === 0) {
    return "NEGATIVE GUIDANCE: none captured yet.";
  }

  return [
    "NEGATIVE GUIDANCE:",
    `- Avoid these misses: ${antiPatterns.map((pattern) => pattern.trim()).filter(Boolean).join(" | ")}`,
  ].join("\n");
}

export function buildFormatPreferenceBlock(
  formatPreference: DraftFormatPreference,
  mode: "plan" | "draft" | "critic",
): string {
  if (formatPreference === "thread") {
    return [
      `FORMAT BIAS (${mode}):`,
      "- Treat this as an X thread, not a single standalone post.",
      "- Build 4-6 connected posts that can stand on their own while still feeling like one chain.",
      "- Keep each post within the account's allowed weighted X character limit. Unverified accounts stay under 280; verified accounts can use long-post limits when needed.",
      "- Verified-thread posts do not need to read like legacy 280-character tweets. Use enough room for setup, proof, and transitions when that improves clarity.",
      "- Let the thread progress across posts instead of making every post behave like a standalone 280-character mini-tweet.",
      "- A thread post can be a short paragraph or a few sentences, not just a one-line teaser.",
      "- For story or journey threads, prefer short paragraphs and breathing room over bullet stacks, especially in the opener.",
      "- Avoid front-loading credentials, proof bullets, or the full lesson into post 1.",
      "- When serializing the final draft string, separate posts with a line containing only --- so the thread builder can split it cleanly.",
    ].join("\n");
  }

  if (formatPreference === "longform") {
    return [
      `FORMAT BIAS (${mode}):`,
      "- Treat this as longform X content.",
      "- You can use fuller setup, development, and payoff instead of compressing every beat.",
      "- Keep it readable, but do not force shortform cadence if the longer arc helps.",
    ].join("\n");
  }

  return [
    `FORMAT BIAS (${mode}):`,
    "- Treat this as shortform X content.",
    "- Land the hook early and compress the setup quickly.",
    "- Favor tighter phrasing and faster payoff over extra development.",
  ].join("\n");
}

export function buildDraftPreferenceBlock(
  draftPreference: DraftPreference,
  mode: "plan" | "draft" | "critic",
): string {
  switch (draftPreference) {
    case "voice_first":
      return [
        `DELIVERY BIAS (${mode}):`,
        "- Prioritize sounding like the user over maximizing reach.",
        "- Avoid growth-hack framing, forced hooks, and obvious engagement bait unless explicitly requested.",
        "- Keep the wording natural, plainspoken, and close to how the user would actually post.",
      ].join("\n");
    case "growth_first":
      return [
        `DELIVERY BIAS (${mode}):`,
        "- Prioritize clarity, hook strength, and early retention.",
        "- Keep it in the user's voice, but allow sharper framing that is more discoverable and shareable.",
        "- Favor concise, high-contrast phrasing over softer meandering setup.",
      ].join("\n");
    default:
      return [
        `DELIVERY BIAS (${mode}):`,
        "- Balance voice fidelity with post performance.",
        "- Keep it natural first, but still make the framing easy to grasp quickly.",
      ].join("\n");
  }
}
