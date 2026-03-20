import { z } from "zod";
import { fetchStructuredJsonFromGroq } from "./llm.ts";
import type { StrategyPlan } from "../contracts/chat";

const ThreadTitleSchema = z.object({
  title: z.string(),
});

function sanitizeThreadTitle(value: string): string {
  const clean = value
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) {
    return "New Chat";
  }

  return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean;
}

function detectComparisonSubject(combined: string): string {
  if (combined.includes("xpo")) {
    return "xpo";
  }

  if (combined.includes("twitter")) {
    return "twitter";
  }

  const mentionsX = combined.includes(" x") || combined.includes("x ");
  if (mentionsX) {
    return "x";
  }

  return "x";
}

function buildHeuristicTitle(args: {
  topicSummary: string;
  recentHistory: string;
  plan: StrategyPlan | null;
}): string | null {
  const combined = [
    args.topicSummary,
    args.recentHistory,
    args.plan?.objective || "",
    args.plan?.angle || "",
  ]
    .join(" ")
    .toLowerCase();
  const mentionsLinkedIn = combined.includes("linkedin");
  const mentionsX =
    combined.includes(" x") ||
    combined.includes("x ") ||
    combined.includes("twitter") ||
    combined.includes("xpo");

  if (mentionsLinkedIn && mentionsX) {
    const subject = detectComparisonSubject(combined);

    if (combined.includes("culture")) {
      return `${subject} vs linkedin: the culture clash`;
    }

    if (combined.includes("style") || combined.includes("writing")) {
      return `${subject} vs linkedin: the style gap`;
    }

    if (combined.includes("convert") || combined.includes("rewrite")) {
      return `${subject} vs linkedin: the rewrite gap`;
    }

    return `${subject} vs linkedin: what changes`;
  }

  if (combined.includes("stanley") && mentionsX) {
    return "stanley for x";
  }

  return null;
}

export async function generateThreadTitle(args: {
  topicSummary: string | null;
  recentHistory: string;
  plan: StrategyPlan | null;
}): Promise<string | null> {
  const topicSummary = args.topicSummary?.trim() || "";
  if (!topicSummary) {
    return null;
  }

  const heuristicTitle = buildHeuristicTitle({
    topicSummary,
    recentHistory: args.recentHistory,
    plan: args.plan,
  });
  if (heuristicTitle) {
    return heuristicTitle;
  }

  const data = await fetchStructuredJsonFromGroq({
    schema: ThreadTitleSchema,
    modelTier: "extraction",
    fallbackModel: "openai/gpt-oss-120b",
    reasoning_effort: "low",
    temperature: 0.2,
    max_tokens: 96,
    messages: [
      {
        role: "system",
        content: [
          "Write a short chat thread title.",
          "Keep it specific, punchy, and grounded in the current topic.",
          "Prefer 3 to 8 words.",
          "If the topic is a comparison, a contrast title is ideal.",
          "Do not use quotes. Do not use filler words like 'discussion about'.",
          "Respond only with JSON: {\"title\":\"...\"}",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          `Topic summary: ${topicSummary}`,
          args.plan ? `Plan angle: ${args.plan.angle}` : null,
          `Recent context: ${args.recentHistory}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  return sanitizeThreadTitle(data?.title || topicSummary);
}
