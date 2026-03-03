import type { VoiceStyleCard } from "../core/styleProfile";
import type { ConversationState } from "../contracts/chat";

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

  return [
    "VOICE BIAS:",
    `- Pacing: ${styleCard.pacing || "direct and conversational"}`,
    `- Familiar openers: ${normalizeList(styleCard.sentenceOpenings || [], "none recorded")}`,
    `- Vocabulary: ${normalizeList(styleCard.slangAndVocabulary || [], "keep it plainspoken")}`,
    styleCard.formattingRules?.length
      ? `- Formatting: ${styleCard.formattingRules.join(" | ")}`
      : "- Formatting: keep it readable and natural.",
  ].join("\n");
}

export function buildAntiPatternBlock(antiPatterns: string[]): string {
  if (antiPatterns.length === 0) {
    return "ANTI-PATTERNS: none captured yet.";
  }

  return [
    "ANTI-PATTERNS:",
    `- Avoid: ${antiPatterns.map((pattern) => pattern.trim()).filter(Boolean).join(" | ")}`,
  ].join("\n");
}
