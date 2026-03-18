import { z } from "zod";
import { fetchStructuredJsonFromGroq } from "./llm";

const DraftInspectorOutputSchema = z.object({
  summary: z.string().min(1),
});

export type DraftInspectorMode = "analyze" | "compare";

function buildFallbackSummary(mode: DraftInspectorMode): string {
  if (mode === "compare") {
    return "Couldn't run the full comparison just now. Keep the version that stays factually correct, lands the hook faster, and makes the value clearer in the first beat.";
  }

  return "Couldn't run the full draft review just now. Check whether the first line earns the scroll stop, whether the payoff lands fast, and whether extra wording weakens the punch.";
}

export async function inspectDraft(args: {
  mode: DraftInspectorMode;
  draft: string;
  currentDraft?: string | null;
}): Promise<string> {
  const draft = args.draft.trim();
  const currentDraft = args.currentDraft?.trim() || "";

  if (!draft) {
    return buildFallbackSummary(args.mode);
  }

  const prompt =
    args.mode === "compare"
      ? `
You are an expert X draft reviewer.
Compare two versions of the same X post.

VIEWED VERSION:
${draft}

CURRENT VERSION:
${currentDraft || "(missing)"}

Your job:
1. Briefly explain what changed between the two versions.
2. Say which version is more likely to perform better for growth and why.
3. If one version is more factually correct or fixes a user correction, explicitly say factual correctness matters more than raw punch.
4. Do not rewrite the post.
5. Keep the response short, direct, and useful.

Respond only with JSON:
{
  "summary": "2-4 short sentences."
}
`.trim()
      : `
You are an expert X draft reviewer.
Review this draft only. Do not rewrite it.

DRAFT:
${draft}

Your job:
1. Explain what is working for growth (hook, clarity, curiosity, pacing, payoff).
2. Explain what is not working or what may hurt performance.
3. Give the highest-ROI pointer to improve it without rewriting it.
4. Keep the response short, direct, and useful.

Respond only with JSON:
{
  "summary": "2-4 short sentences."
}
`.trim();

  const data = await fetchStructuredJsonFromGroq({
    schema: DraftInspectorOutputSchema,
    modelTier: "extraction",
    fallbackModel: "openai/gpt-oss-120b",
    reasoning_effort: "medium",
    temperature: 0.2,
    max_tokens: 700,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: args.mode === "compare" ? "Compare the drafts now." : "Analyze the draft now." },
    ],
  });

  return data?.summary.trim() || buildFallbackSummary(args.mode);
}
