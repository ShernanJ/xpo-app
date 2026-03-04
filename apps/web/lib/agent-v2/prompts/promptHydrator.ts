import type { VoiceStyleCard } from "../core/styleProfile";
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
    "- Do not repeat the same opener patterns turn after turn.",
    "- Ask at most one question unless the UI is showing explicit choice chips.",
    "- Prefer concrete language over abstract strategy jargon.",
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

export function buildVoiceHydrationBlock(styleCard: VoiceStyleCard | null): string {
  if (!styleCard) {
    return "VOICE BIAS: Mirror a direct, casual peer by default.";
  }

  const prefersLowercase = inferLowercasePreference(styleCard);
  const preferredListMarker = inferPreferredListMarker(styleCard);

  return [
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
  ].join("\n");
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
