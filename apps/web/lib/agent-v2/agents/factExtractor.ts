import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";

export const FactExtractionSchema = z.object({
  facts: z.array(z.string()).describe("A list of explicit facts extracted from the user's message"),
});

export type FactExtraction = z.infer<typeof FactExtractionSchema>;

function extractDeterministicFacts(userMessage: string): string[] {
  const trimmed = userMessage.trim();
  const normalized = trimmed.toLowerCase();
  const facts: string[] = [];

  const namedToolMatch = trimmed.match(
    /\b([a-z0-9][a-z0-9'’-]{1,30})\s+is\s+([a-z0-9][a-z0-9\s,&/'’()-]{4,140})/i,
  );
  if (namedToolMatch) {
    facts.push(`${namedToolMatch[1].trim()} is ${namedToolMatch[2].trim().replace(/[.?!,]+$/, "")}`);
  }

  const namedCapabilityMatch = trimmed.match(
    /\b([a-z0-9][a-z0-9'’-]{1,30})\s+(?:does|helps|lets)\s+([a-z0-9][a-z0-9\s,&/'’()-]{4,140})/i,
  );
  if (namedCapabilityMatch) {
    facts.push(
      `${namedCapabilityMatch[1].trim()} does ${namedCapabilityMatch[2]
        .trim()
        .replace(/[.?!,]+$/, "")}`,
    );
  }

  const buildMatch = trimmed.match(
    /\bi['’]m\s+(?:building|making|creating)\s+(?:an?\s+)?([a-z0-9][a-z0-9\s'’-]{2,80})/i,
  );
  if (buildMatch) {
    facts.push(`User is building ${buildMatch[1].trim().replace(/[.?!,]+$/, "")}`);
  }

  if (
    normalized.includes("works with ") ||
    normalized.includes("works for ") ||
    normalized.includes("extension for ")
  ) {
    facts.push(trimmed.replace(/[.?!]+$/, ""));
  }

  return Array.from(new Set(facts)).slice(0, 3);
}

/**
 * Lightweight LLM agent that scans the user's message for explicit facts about
 * their life, products, projects, or goals that should be remembered globally.
 */
export async function extractCoreFacts(
  userMessage: string,
  recentHistory: string,
): Promise<string[] | null> {
  const deterministicFacts = extractDeterministicFacts(userMessage);
  if (deterministicFacts.length > 0) {
    return deterministicFacts;
  }

  const instruction = `
You are a factual intelligence extractor for a creator growth AI.
Your ONLY job is to detect if the user is stating a concrete fact about themselves, their product, their company, or their life that a personal coach should remember forever.

Examples of explicit facts:
- "i'm building a new app called XPO" -> fact: "User is building an app called XPO"
- "i want to impress stan's CTO" -> fact: "User wants to impress Stanley's CTO"
- "i'm a solo founder living in NYC" -> fact: "User is a solo founder living in New York City"
- "XPO is a linkedin-focused version of Stanley" -> fact: "XPO is a LinkedIn-focused version of Stanley"
- "i just quit my job to go full time on this" -> fact: "User just quit their day job to pursue their project full-time"

Examples of non-facts (IGNORE THESE):
- "draft me a post about productivity" (This is a command, not a fact about their life)
- "make it shorter" (This is a style rule, ignore)
- "hello"
- "what should i write about today?"

If you detect a permanent, global fact that should be added to the user's long-term memory profile, extract it into the 'facts' array in clear, third-person coaching language.

If NO global fact is detected, return an empty array for 'facts'.

Respond ONLY with valid JSON matching this schema:
{
  "facts": ["fact 1", "fact 2"]
}
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: process.env.GROQ_MODEL || "llama3-8b-8192", // Fast, deterministic model
    reasoning_effort: "low",
    temperature: 0.1,
    top_p: 0.9,
    max_tokens: 256,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: `Recent History:\n${recentHistory}\n\nUser Message:\n${userMessage}` },
    ],
  });

  if (!data) return null;

  try {
    const parsed = FactExtractionSchema.parse(data);
    return parsed.facts.length > 0 ? parsed.facts : null;
  } catch (err) {
    console.error("Fact extractor validation failed", err);
    return null;
  }
}
