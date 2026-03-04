import { z } from "zod";

const AntiPatternSchema = z.object({
  shouldCapture: z.boolean(),
  feedbackReason: z.string(),
  patternTags: z.array(z.string()).min(0).max(5),
  badSnippet: z.string(),
  guidance: z.string(),
});

export type AntiPatternExtraction = z.infer<typeof AntiPatternSchema>;

export function looksLikeMechanicalEdit(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return [
    "remove commas",
    "fix typo",
    "make it shorter",
    "make it longer",
    "fix the first line",
    "remove emoji",
    "no emojis",
    "fix punctuation",
    "fix grammar",
    "fix spelling",
    "change to 280",
    "trim to fit",
  ].some((candidate) => normalized.includes(candidate));
}

export function looksLikeNegativeFeedback(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return [
    "too polished",
    "too generic",
    "too long",
    "too robotic",
    "sounds cringe",
    "sounds like linkedin",
    "don't like this",
    "not good",
    "this is bad",
  ].some((candidate) => normalized.includes(candidate));
}

export async function extractAntiPattern(
  userFeedback: string,
  activeDraft: string,
  recentHistory: string,
): Promise<AntiPatternExtraction | null> {
  const { fetchJsonFromGroq } = await import("./llm");
  const data = await fetchJsonFromGroq<unknown>({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    reasoning_effort: "low",
    temperature: 0.1,
    max_tokens: 256,
    messages: [
      {
        role: "system",
        content: [
          "Analyze user feedback about a rejected draft.",
          "Extract the core tonal complaint as reusable anti-pattern guidance.",
          "If the feedback is only a mechanical edit, set shouldCapture to false.",
          "Return a short badSnippet only if a clearly problematic phrase/pattern is obvious in the draft.",
          "Return concise guidance we can reuse in future prompts.",
          "Respond only with JSON: {\"shouldCapture\":boolean,\"feedbackReason\":\"...\",\"patternTags\":[\"...\"],\"badSnippet\":\"...\",\"guidance\":\"...\"}",
        ].join(" "),
      },
      {
        role: "user",
        content: `Recent history:\n${recentHistory}\n\nDraft:\n${activeDraft}\n\nUser feedback:\n${userFeedback}`,
      },
    ],
  });

  if (!data) {
    return null;
  }

  try {
    return AntiPatternSchema.parse(data);
  } catch (error) {
    console.error("Anti-pattern validation failed", error);
    return null;
  }
}
