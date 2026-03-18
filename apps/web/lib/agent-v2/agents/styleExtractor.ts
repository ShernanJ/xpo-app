import { fetchStructuredJsonFromGroq } from "./llm";
import { z } from "zod";

export const StyleRuleExtractionSchema = z.object({
  rules: z.array(z.string()).describe("A list of explicit stylistic rules extracted from the user's message"),
});

export type StyleRuleExtraction = z.infer<typeof StyleRuleExtractionSchema>;

/**
 * Lightweight LLM agent that scans the user's message for explicit styling rules,
 * tone corrections, or writing preferences (e.g. "write all lowercase", "no emojis").
 */
export async function extractStyleRules(
  userMessage: string,
  recentHistory: string,
): Promise<string[] | null> {
  const instruction = `
You are a stylistic intelligence extractor for a creator growth AI.
Your ONLY job is to detect if the user is giving an explicit, imperative formatting or stylistic rule in their message.

Examples of explicit rules:
- "always write in lowercase" -> rule: "Always write in lowercase"
- "make it less cringe" -> rule: "Make the tone less cringe, more authentic and grounded"
- "never use emojis" -> rule: "Never use emojis in any posts"
- "i don't talk like that, use shorter sentences" -> rule: "Use shorter, punchier sentences"

Examples of non-rules (IGNORE THESE):
- "write a post about my new startup" (This is a topic, not a global style rule)
- "can you make this specific draft shorter?" (This is local editing, not a global rule)
- "hello"

If you detect a permanent, global stylistic preference or formatting rule that should apply to ALL future content for this user, extract it into the 'rules' array.
Translate the user's feedback into clear actionable constraints for an AI writer.

If NO global style rule is detected, return an empty array for 'rules'.

Respond ONLY with valid JSON matching this schema:
{
  "rules": ["rule 1", "rule 2"]
}
  `.trim();

  const data = await fetchStructuredJsonFromGroq({
    schema: StyleRuleExtractionSchema,
    modelTier: "extraction",
    fallbackModel: "llama3-8b-8192",
    optionalDefaults: {
      rules: [],
    },
    reasoning_effort: "low",
    temperature: 0.1,
    top_p: 0.9,
    max_tokens: 256,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: `Recent History:\n${recentHistory}\n\nUser Message:\n${userMessage}` },
    ],
  });

  return data && data.rules.length > 0 ? data.rules : null;
}
