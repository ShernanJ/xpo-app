import type { VoiceStyleCard } from "../core/styleProfile";
import type { VoiceTarget } from "../core/voiceTarget";
import {
  inferLowercasePreference,
  inferPreferredListMarker,
} from "../core/voiceSignals";
import type {
  ConversationState,
  DraftFormatPreference,
  DraftPreference,
} from "../contracts/chat";

function normalizeList(values: string[], fallback: string): string {
  const filtered = values.map((value) => value.trim()).filter(Boolean);
  return filtered.length > 0 ? filtered.join(" | ") : fallback;
}

export function buildConversationToneBlock(): string {
  return [
    "HUMAN SPEECH POLICY:",
    "- Be short, reactive, and specific.",
    "- Do not use canned affirmations like 'great question' or 'absolutely.'",
    "- Do not add fluff, hype, praise, or performative friendliness.",
    "- Avoid filler openers like 'love that', 'totally', or 'for sure' unless the user is clearly talking that way first.",
    "- Do not repeat the same opener patterns turn after turn.",
    "- Ask at most one question unless the UI is showing explicit choice chips.",
    "- Prefer concrete language over abstract strategy jargon.",
    "- Make every sentence earn its place. If a line does not help the user write, choose, revise, or understand, cut it.",
  ].join("\n");
}

export function buildGoalHydrationBlock(
  goal: string,
  mode: "coach" | "ideate" | "plan" | "draft",
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
  mode: "coach" | "ideate" | "plan" | "draft",
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
      return "VOICE BIAS: Mirror a direct, casual peer by default.";
    }

    return [
      "VOICE BIAS:",
      "- Treat the resolved VoiceTarget below as the authoritative style target for this turn.",
      `- Resolved target: ${voiceTarget.summary}`,
      ...voiceTarget.rationale.map((line) => `- ${line}`),
    ].join("\n");
  }

  const prefersLowercase = inferLowercasePreference(styleCard);
  const preferredListMarker = inferPreferredListMarker(styleCard);

  const lines = [
    "VOICE BIAS:",
    "- Match the creator's actual voice. Do not make it more polished, corporate, or professional just because the account is verified or established.",
    `- Pacing: ${styleCard.pacing || "direct and conversational"}`,
    `- Familiar openers: ${normalizeList(styleCard.sentenceOpenings || [], "none recorded")}`,
    `- Vocabulary: ${normalizeList(styleCard.slangAndVocabulary || [], "keep it plainspoken")}`,
    prefersLowercase
      ? "- Casing: keep it all lowercase unless a proper noun or URL truly needs otherwise."
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
      "- A thread post can be a short paragraph or a few sentences, not just a one-line teaser.",
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
