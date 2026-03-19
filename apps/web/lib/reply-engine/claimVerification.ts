import { fetchJsonFromGroq } from "../agent-v2/agents/llm.ts";

import { resolveSourceInterpretation } from "./interpretation.ts";
import type {
  ClaimVerificationResult,
  ReplyClaimEvidence,
  ReplyExternalClaimType,
  ReplyExtractedClaim,
  ReplySourceContext,
  ReplyVisualContextSummary,
} from "./types.ts";
import type { ReplyDraftPreflightResult } from "../extension/types.ts";

const SEARCH_CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const searchCache = new Map<string, { expiresAt: number; results: ReplyClaimEvidence[] }>();

function normalizeWhitespace(value: string | null | undefined): string {
  return (value || "").trim().replace(/\s+/g, " ");
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function splitSentences(value: string): string[] {
  return normalizeWhitespace(value)
    .split(/(?<=[.?!])\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function classifyClaimType(sentence: string): ReplyExternalClaimType {
  const normalized = normalizeComparable(sentence);
  if (/\b\d[\d,.]*(?:\s*\/\s*(?:month|mo|year|yr))?\b/.test(normalized) || /\b(currently|today|right now|already)\b/.test(normalized)) {
    return "numeric_or_current_state";
  }
  if (/\b(policy|rule|rules|allowed|banned|cannot|must|terms)\b/.test(normalized)) {
    return "policy_or_rule";
  }
  if (/\b(company|companies|market|revenue|valuation|ceo|founder)\b/.test(normalized)) {
    return "market_or_company_fact";
  }
  if (/\b(person|people|who|profile|role|job title)\b/.test(normalized) && /\b(is|are|was|were)\b/.test(normalized)) {
    return "person_or_role_fact";
  }

  return "product_capability";
}

function sentenceNeedsVerification(sentence: string) {
  const raw = normalizeWhitespace(sentence);
  const normalized = normalizeComparable(sentence);
  return (
    /\b(can|can't|cannot|doesn't|does not|lets you|allows you|no way to|visible|private|public|already|currently|right now)\b/.test(
      normalized,
    ) ||
    /\bit(?:'d| would)\s+be\s+(?:better|more valuable)\s+if\b/i.test(raw) ||
    /\bthey\s+should\s+also\b/i.test(raw) ||
    /\byou\s+could\s+also\s+(?:see|show|know|view|get)\b/i.test(raw) ||
    /\balso\s+(?:see|show|know|view|get)\s+who(?:'s| is)\b/i.test(raw) ||
    /\bnot\s+just\b[^.?!]{0,80}\bbut\b/i.test(raw)
  );
}

function buildClaimQuery(claimText: string, sourceContext: ReplySourceContext, visualContext?: ReplyVisualContextSummary | null) {
  const contextTerms = [
    sourceContext.primaryPost.authorHandle || "",
    sourceContext.primaryPost.text,
    sourceContext.quotedPost?.text || "",
    visualContext?.readableText || "",
    ...(visualContext?.brandSignals || []),
  ]
    .join(" ")
    .match(/\b([A-Z][a-z]+|X|Twitter|LinkedIn|Premium|Bookmarks?|Replies?|Reposts?|Profile)\b/g);

  const terms = Array.from(new Set((contextTerms || []).slice(0, 5)));
  return normalizeWhitespace([claimText, ...terms].join(" ")).slice(0, 240);
}

export function extractVerifiableClaims(args: {
  draft: string;
  sourceContext: ReplySourceContext;
  visualContext?: ReplyVisualContextSummary | null;
}): ReplyExtractedClaim[] {
  return splitSentences(args.draft)
    .flatMap((sentence) => {
      if (!sentenceNeedsVerification(sentence)) {
        return [];
      }

      return [
        {
          text: sentence,
          type: classifyClaimType(sentence),
          query: buildClaimQuery(sentence, args.sourceContext, args.visualContext || null),
          needsVerification: true,
        },
      ];
    })
    .slice(0, 3);
}

export function draftContainsPotentialExternalClaims(draft: string): boolean {
  return extractVerifiableClaims({
    draft,
    sourceContext: {
      primaryPost: { id: "draft", url: null, text: "", authorHandle: null, postType: "original" },
      quotedPost: null,
      media: null,
      conversation: null,
    },
  }).length > 0;
}

function evaluateAgainstSource(args: {
  claim: ReplyExtractedClaim;
  sourceContext: ReplySourceContext;
  visualContext?: ReplyVisualContextSummary | null;
}): ReplyClaimEvidence[] {
  const sourceMaterial = normalizeComparable(
    [
      args.sourceContext.primaryPost.text,
      args.sourceContext.quotedPost?.text || "",
      args.visualContext?.readableText || "",
      args.visualContext?.imageReplyAnchor || "",
      ...(args.visualContext?.keyDetails || []),
    ].join(" "),
  );
  const claimText = normalizeComparable(args.claim.text);

  if (!sourceMaterial || !claimText) {
    return [];
  }

  if (sourceMaterial.includes(claimText)) {
    return [{ source: "source_local", summary: "Claim is directly restating visible source material." }];
  }

  return [];
}

function extractDuckDuckGoEvidence(html: string): ReplyClaimEvidence[] {
  const matches = Array.from(
    html.matchAll(
      /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>)([\s\S]*?)(?:<\/a>|<\/div>)/gi,
    ),
  );

  return matches.slice(0, 3).map((match) => ({
    source: "live_web" as const,
    url: normalizeWhitespace(match[1] || ""),
    summary: normalizeWhitespace(
      `${(match[2] || "").replace(/<[^>]+>/g, " ")} ${(match[3] || "").replace(/<[^>]+>/g, " ")}`,
    ).slice(0, 320),
  }));
}

async function liveLookupClaim(query: string): Promise<ReplyClaimEvidence[]> {
  if (
    process.argv.includes("--test") ||
    process.execArgv.includes("--test") ||
    process.env.NODE_ENV === "test" ||
    process.env.REPLY_CLAIM_LIVE_LOOKUP_DISABLED === "1"
  ) {
    return [];
  }

  const cached = searchCache.get(query);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.results.map((entry) => ({ ...entry, source: "cache" }));
  }

  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; XPO-Reply-Engine/1.0)",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    const results = extractDuckDuckGoEvidence(html);
    if (results.length > 0) {
      searchCache.set(query, {
        expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
        results,
      });
    }
    return results;
  } catch {
    return [];
  }
}

function heuristicEvidenceOutcome(args: {
  claim: ReplyExtractedClaim;
  evidence: ReplyClaimEvidence[];
}): "supported" | "contradicted" | "unverified" {
  if (args.evidence.length === 0) {
    return "unverified";
  }

  const text = normalizeComparable(args.claim.text);
  const snippets = normalizeComparable(args.evidence.map((entry) => entry.summary).join(" "));
  const negativeCapability = /\b(can't|cannot|doesn't|does not|no way to)\b/.test(text);
  const positiveCapability = /\b(can|lets you|allows you|visible|public)\b/.test(text) && !negativeCapability;
  const evidencePositive = /\b(can|lets you|allows you|visible|public|anyone can see|available)\b/.test(
    snippets,
  );
  const evidenceNegative = /\b(cannot|can't|doesn't|private|not available|only you)\b/.test(snippets);

  if (negativeCapability && evidencePositive) {
    return "contradicted";
  }
  if (positiveCapability && evidenceNegative) {
    return "contradicted";
  }
  if ((negativeCapability && evidenceNegative) || (positiveCapability && evidencePositive)) {
    return "supported";
  }

  return "unverified";
}

async function evaluateEvidenceWithModel(args: {
  claim: ReplyExtractedClaim;
  evidence: ReplyClaimEvidence[];
}): Promise<"supported" | "contradicted" | "unverified"> {
  if (!process.env.GROQ_API_KEY?.trim() || args.evidence.length === 0) {
    return heuristicEvidenceOutcome(args);
  }

  const raw = await fetchJsonFromGroq<{
    outcome: "supported" | "contradicted" | "unverified";
  }>({
    model: process.env.GROQ_REPLY_PREFLIGHT_MODEL?.trim() || "llama-3.1-8b-instant",
    temperature: 0,
    max_tokens: 80,
    jsonRepairInstruction:
      'Return ONLY valid JSON with key "outcome" and value supported|contradicted|unverified.',
    messages: [
      {
        role: "system",
        content:
          'Judge whether external evidence supports, contradicts, or cannot verify a single claim. Return ONLY JSON with key "outcome".',
      },
      {
        role: "user",
        content: [
          `Claim: ${args.claim.text}`,
          "Evidence snippets:",
          ...args.evidence.map((entry) => `- ${entry.summary}`),
        ].join("\n"),
      },
    ],
  });

  return raw?.outcome || heuristicEvidenceOutcome(args);
}

function buildSafeFallbackDraft(args: {
  sourceContext: ReplySourceContext;
  visualContext?: ReplyVisualContextSummary | null;
  preflightResult?: ReplyDraftPreflightResult | null;
}): string {
  const interpretation = resolveSourceInterpretation({
    sourceContext: args.sourceContext,
    preflightResult: args.preflightResult || null,
    visualContext: args.visualContext || null,
  });
  const imageAnchor = normalizeWhitespace(
    args.visualContext?.imageReplyAnchor || args.visualContext?.readableText || "",
  );

  if (interpretation.humor_mode === "satire" || interpretation.humor_mode === "parody") {
    if (/\bpremium social surveillance\b/i.test(interpretation.target)) {
      return "the premium social surveillance angle is already cursed enough";
    }
    if (imageAnchor) {
      return `the "${imageAnchor}" part is already the whole joke`;
    }
    return `the ${interpretation.target} part is already the actual bit`;
  }

  if (imageAnchor) {
    return `the "${imageAnchor}" part is the actual hook`;
  }

  const sourceKeywords = normalizeComparable(args.sourceContext.primaryPost.text)
    .split(" ")
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");
  return sourceKeywords ? `the ${sourceKeywords} part is the thing worth reacting to` : "that part is already the real point";
}

function stripUnsupportedClaimSentences(draft: string, claims: ReplyExtractedClaim[]) {
  const blocked = new Set(claims.map((claim) => normalizeWhitespace(claim.text).toLowerCase()));
  const remaining = splitSentences(draft).filter(
    (sentence) => !blocked.has(normalizeWhitespace(sentence).toLowerCase()),
  );

  return normalizeWhitespace(remaining.join(" "));
}

export async function verifyReplyClaims(args: {
  draft: string;
  sourceContext: ReplySourceContext;
  visualContext?: ReplyVisualContextSummary | null;
  preflightResult?: ReplyDraftPreflightResult | null;
}): Promise<ClaimVerificationResult> {
  const claims = extractVerifiableClaims({
    draft: args.draft,
    sourceContext: args.sourceContext,
    visualContext: args.visualContext || null,
  });
  if (claims.length === 0) {
    return {
      outcome: "not_needed",
      draft: args.draft,
      claims: [],
      evidence: [],
      usedLiveLookup: false,
    };
  }

  const evidence: ReplyClaimEvidence[] = [];
  let usedLiveLookup = false;
  const contradictedClaims: ReplyExtractedClaim[] = [];
  const unresolvedClaims: ReplyExtractedClaim[] = [];

  for (const claim of claims) {
    const localEvidence = evaluateAgainstSource({
      claim,
      sourceContext: args.sourceContext,
      visualContext: args.visualContext || null,
    });
    evidence.push(...localEvidence);

    let claimEvidence = [...localEvidence];
    if (claimEvidence.length === 0) {
      const liveEvidence = await liveLookupClaim(claim.query);
      if (liveEvidence.length > 0) {
        usedLiveLookup = true;
        claimEvidence = liveEvidence;
        evidence.push(...liveEvidence);
      }
    }

    const outcome = await evaluateEvidenceWithModel({
      claim,
      evidence: claimEvidence,
    });
    claim.outcome = outcome;

    if (outcome === "contradicted") {
      contradictedClaims.push(claim);
    } else if (outcome === "unverified") {
      unresolvedClaims.push(claim);
    }
  }

  if (contradictedClaims.length === 0 && unresolvedClaims.length === 0) {
    return {
      outcome: "supported",
      draft: args.draft,
      claims,
      evidence,
      usedLiveLookup,
    };
  }

  const strippedDraft = stripUnsupportedClaimSentences(args.draft, [...contradictedClaims, ...unresolvedClaims]);
  const rewrittenDraft = strippedDraft || buildSafeFallbackDraft(args);
  const remainingClaims = extractVerifiableClaims({
    draft: rewrittenDraft,
    sourceContext: args.sourceContext,
    visualContext: args.visualContext || null,
  });

  if (remainingClaims.length === 0) {
    return {
      outcome: "rewritten",
      draft: rewrittenDraft,
      claims,
      evidence,
      usedLiveLookup,
    };
  }

  return {
    outcome: "rejected",
    draft: buildSafeFallbackDraft(args),
    claims,
    evidence,
    usedLiveLookup,
  };
}
