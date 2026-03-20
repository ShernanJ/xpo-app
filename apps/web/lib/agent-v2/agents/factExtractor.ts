import { fetchStructuredJsonFromGroq } from "./llm.ts";
import { z } from "zod";

export const FactExtractionSchema = z.object({
  facts: z.array(z.string()).describe("A list of explicit facts extracted from the user's message"),
});

export type FactExtraction = z.infer<typeof FactExtractionSchema>;

function dedupeFacts(facts: string[], limit: number = 5): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const fact of facts) {
    const normalized = fact.trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(normalized);

    if (next.length >= limit) {
      break;
    }
  }

  return next;
}

export function hasStrongAutobiographicalCue(userMessage: string): boolean {
  const normalized = userMessage.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return [
    /\bmy\s+\d+\s*(?:day|week|month|year)s?\s+journey\b/,
    /\bmy\s+journey\b/,
    /\bi\s+(?:am\s+|['’]m\s+)?trying\s+to\s+land\s+(?:an?\s+)?role\b/,
    /\btrying\s+to\s+land\s+(?:an?\s+)?role\s+at\b/,
    /\bi\s+(?:have\s+)?created\s+multiple\s+projects\b/,
    /\bi\s+(?:have\s+|['’]ve\s+)?been\s+working\s+on\b/,
    /\bi\s+been\s+working\s+on\b/,
    /\bto\s+impress\s+the\s+cto\b/,
  ].some((pattern) => pattern.test(normalized));
}

function looksLikeAutobiographicalFact(fact: string): boolean {
  return /\b(?:i|my|me|we|our|us)\b/i.test(fact) || /\buser\b/i.test(fact);
}

export function extractDeterministicFacts(userMessage: string): string[] {
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

  const journeyRoleMatch = trimmed.match(
    /\bmy\s+(\d+\s*(?:day|week|month|year)s?)\s+journey\s+(?:trying\s+to\s+land|landing|to\s+land)\s+(?:an?\s+)?role\s+at\s+([a-z0-9][a-z0-9\s.&'’()-]{1,40}?)(?=[,.;!?\n]|$)/i,
  );
  if (journeyRoleMatch) {
    facts.push(
      `User has spent ${journeyRoleMatch[1].trim()} trying to land a role at ${journeyRoleMatch[2]
        .trim()
        .replace(/[.?!,]+$/, "")}`,
    );
  }

  const roleGoalMatch = !journeyRoleMatch
    ? trimmed.match(
        /\b(?:i\s+(?:am\s+|['’]m\s+)?trying\s+to\s+land|trying\s+to\s+land)\s+(?:an?\s+)?role\s+at\s+([a-z0-9][a-z0-9\s.&'’()-]{1,40}?)(?=[,.;!?\n]|$)/i,
      )
    : null;
  if (roleGoalMatch) {
    facts.push(
      `User is trying to land a role at ${roleGoalMatch[1]
        .trim()
        .replace(/[.?!,]+$/, "")}`,
    );
  }

  if (/\bi\s+(?:have\s+)?created\s+multiple\s+projects\b/i.test(trimmed)) {
    facts.push("User created multiple projects");
  }

  const workingOnMatch = trimmed.match(
    /\bi\s+(?:(?:have\s+)?been\s+working\s+on|['’]ve\s+been\s+working\s+on|been\s+working\s+on)\s+([a-z0-9][a-z0-9._/-]{1,80})/i,
  );
  if (workingOnMatch) {
    facts.push(
      `User has been working on ${workingOnMatch[1].trim().replace(/[.?!,]+$/, "")}`,
    );
  }

  const appositiveProductMatch = trimmed.match(
    /\b([a-z0-9][a-z0-9._-]{1,60})\s*,\s*(?:an?\s+)?([a-z0-9][a-z0-9\s/&'’()-]{3,80}\bapp)\b/i,
  );
  if (appositiveProductMatch) {
    const description = appositiveProductMatch[2]
      .trim()
      .replace(/[.?!,]+$/, "");
    facts.push(
      `${appositiveProductMatch[1].trim()} is ${
        /^(?:a|an)\b/i.test(description) ? description : `a ${description}`
      }`,
    );
  }

  if (
    normalized.includes("works with ") ||
    normalized.includes("works for ") ||
    normalized.includes("extension for ")
  ) {
    facts.push(trimmed.replace(/[.?!]+$/, ""));
  }

  return dedupeFacts(facts);
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
  const needsAutobiographicalSupplement =
    hasStrongAutobiographicalCue(userMessage) &&
    !deterministicFacts.some(looksLikeAutobiographicalFact);

  if (deterministicFacts.length > 0 && !needsAutobiographicalSupplement) {
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

  const data = await fetchStructuredJsonFromGroq({
    schema: FactExtractionSchema,
    modelTier: "extraction",
    fallbackModel: "llama3-8b-8192",
    optionalDefaults: {
      facts: [],
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

  const mergedFacts = dedupeFacts([
    ...deterministicFacts,
    ...((data?.facts || []).filter(Boolean)),
  ]);

  return mergedFacts.length > 0 ? mergedFacts : null;
}
