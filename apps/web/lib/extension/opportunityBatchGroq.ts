import Groq from "groq-sdk";
import { z } from "zod";

import type { GrowthStrategySnapshot } from "../onboarding/strategy/growthStrategy.ts";
import type { ReplyInsights } from "./replyOpportunities.ts";
import type {
  ExtensionOpportunityBatchRequest,
  ExtensionOpportunityBatchResponse,
  ExtensionOpportunityCandidate,
} from "./types.ts";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const DEFAULT_OPPORTUNITY_BATCH_MODEL =
  process.env.GROQ_OPPORTUNITY_BATCH_MODEL?.trim() ||
  process.env.GROQ_MODEL?.trim() ||
  "llama-3.3-70b-versatile";

const GroqOpportunityBatchSchema = z
  .object({
    scores: z.array(
      z
        .object({
          tweetId: z.string().trim().min(1),
          opportunityScore: z.number().finite().min(0).max(100),
          reason: z.string().trim().min(1).max(240),
        })
        .strict(),
    ),
  })
  .strict();

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function formatList(values: Array<string | null | undefined>, fallback: string, limit = 3) {
  const next = values
    .map((value) => normalizeWhitespace(value || ""))
    .filter(Boolean)
    .slice(0, limit);

  if (next.length === 0) {
    return `- ${fallback}`;
  }

  return next.map((entry) => `- ${entry}`).join("\n");
}

function formatTopAngleLabels(replyInsights?: ReplyInsights | null) {
  const entries = (replyInsights?.topAngleLabels || []).slice(0, 3);
  if (entries.length === 0) {
    return "- No ranked angle history yet.";
  }

  return entries
    .map((entry) => {
      const selectionRate =
        typeof entry.selectionRate === "number"
          ? `${Math.round(entry.selectionRate * 100)}% selected`
          : "selection rate unknown";
      const postedCount = typeof entry.postedCount === "number" ? `${entry.postedCount} posted` : "0 posted";
      return `- ${entry.label}: ${selectionRate}; ${postedCount}`;
    })
    .join("\n");
}

function summarizeCandidate(candidate: ExtensionOpportunityCandidate) {
  const author = candidate.author.handle ? `@${candidate.author.handle}` : "unknown author";
  const createdAt = candidate.createdAtIso || "unknown";

  return [
    `tweetId: ${candidate.postId}`,
    `author: ${author}`,
    `createdAtIso: ${createdAt}`,
    `postType: ${candidate.postType}`,
    `surface: ${candidate.surface}`,
    `followers: ${candidate.author.followerCount}`,
    `engagement: replies=${candidate.engagement.replyCount}, likes=${candidate.engagement.likeCount}, reposts=${candidate.engagement.repostCount}, quotes=${candidate.engagement.quoteCount}, views=${candidate.engagement.viewCount}`,
    `text: """${candidate.text.trim()}"""`,
  ].join("\n");
}

function extractTextContent(
  content: string | null | Array<{ text?: string | null }> | undefined,
) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((entry) => (typeof entry?.text === "string" ? entry.text : ""))
      .join("");
  }

  return "";
}

function parseGroqJson(content: string) {
  const trimmed = content.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenceMatch?.[1]?.trim() || trimmed;
  return JSON.parse(jsonText) as unknown;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildOpportunityBatchSystemPrompt(args: {
  strategy: GrowthStrategySnapshot;
  replyInsights?: ReplyInsights | null;
  growthStage: string;
  goal: string;
}) {
  return [
    "You score batches of X posts for reply opportunity on behalf of a creator.",
    "Return ONLY a valid JSON object with this exact shape:",
    '{"scores":[{"tweetId":"string","opportunityScore":72,"reason":"short reason"}]}',
    "Scoring rules:",
    "- Include every tweetId exactly once.",
    "- opportunityScore must be an integer from 0 to 100.",
    "- reason must be one concise sentence grounded in the creator strategy and reply insights.",
    "- Prefer posts where the creator can add non-generic nuance, proof, translation, or a sharper angle.",
    "- Penalize generic motivation, off-niche topics, spammy posts, rage bait, and conversations with poor audience fit.",
    "- Do not add markdown, commentary, or extra keys.",
    "",
    "Creator strategy:",
    `- Known for: ${args.strategy.knownFor}`,
    `- Target audience: ${args.strategy.targetAudience}`,
    `- Growth stage: ${args.growthStage}`,
    `- Goal: ${args.goal}`,
    `- Content pillars: ${args.strategy.contentPillars.slice(0, 4).join(" | ") || "none recorded"}`,
    `- Reply goals: ${args.strategy.replyGoals.slice(0, 3).join(" | ") || "none recorded"}`,
    `- Off-brand themes to avoid: ${args.strategy.offBrandThemes.slice(0, 3).join(" | ") || "none recorded"}`,
    "",
    "Reply analytics to use:",
    "Top angle labels:",
    formatTopAngleLabels(args.replyInsights),
    "Best signals:",
    formatList(args.replyInsights?.bestSignals || [], "No positive signals logged yet."),
    "Caution signals:",
    formatList(args.replyInsights?.cautionSignals || [], "No caution signals logged yet."),
  ].join("\n");
}

export function buildOpportunityBatchUserPrompt(args: {
  request: ExtensionOpportunityBatchRequest;
}) {
  const candidateBlocks = args.request.candidates.map((candidate, index) => {
    return [`Candidate ${index + 1}`, summarizeCandidate(candidate)].join("\n");
  });

  return [
    `Surface: ${args.request.surface}`,
    `Page URL: ${args.request.pageUrl}`,
    "Score these tweets for whether replying is worth the creator's attention right now.",
    "Return the JSON object only.",
    "",
    ...candidateBlocks,
  ].join("\n\n");
}

export async function scoreOpportunityBatchWithGroq(args: {
  request: ExtensionOpportunityBatchRequest;
  strategy: GrowthStrategySnapshot;
  replyInsights?: ReplyInsights | null;
  growthStage: string;
  goal: string;
}): Promise<ExtensionOpportunityBatchResponse> {
  if (!process.env.GROQ_API_KEY?.trim()) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const completion = await groq.chat.completions.create({
    model: DEFAULT_OPPORTUNITY_BATCH_MODEL,
    temperature: 0.2,
    max_tokens: 900,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: buildOpportunityBatchSystemPrompt({
          strategy: args.strategy,
          replyInsights: args.replyInsights,
          growthStage: args.growthStage,
          goal: args.goal,
        }),
      },
      {
        role: "user",
        content: buildOpportunityBatchUserPrompt({
          request: args.request,
        }),
      },
    ],
  });

  const content = extractTextContent(completion.choices?.[0]?.message?.content);
  if (!content.trim()) {
    throw new Error("Groq returned an empty opportunity batch response.");
  }

  const parsed = GroqOpportunityBatchSchema.parse(parseGroqJson(content));
  const byTweetId = new Map(
    parsed.scores.map((entry) => [
      entry.tweetId,
      {
        tweetId: entry.tweetId,
        opportunityScore: clampScore(entry.opportunityScore),
        reason: normalizeWhitespace(entry.reason),
      },
    ]),
  );

  return {
    scores: args.request.candidates.map((candidate) => {
      const matched = byTweetId.get(candidate.postId);
      return {
        tweetId: candidate.postId,
        opportunityScore: matched?.opportunityScore ?? 0,
        reason:
          matched?.reason ||
          "No grounded scoring rationale was returned for this tweet.",
      };
    }),
  };
}
