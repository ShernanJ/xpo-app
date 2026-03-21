import { createHash } from "crypto";
import Groq from "groq-sdk";

export interface ReplyContextCard {
  room_sentiment: string;
  social_intent: string;
  recommended_stance: string;
  banned_angles: string[];
}

const SENSITIVE_ROOM_SENTIMENTS = new Set([
  "grief",
  "vulnerability",
  "frustration",
]);

interface GroqChatCompletionLike {
  choices?: Array<{
    message?: {
      content?:
        | string
        | null
        | Array<{
            text?: string | null;
          }>;
    } | null;
  }>;
}

interface GroqClientLike {
  chat: {
    completions: {
      create(args: {
        model: string;
        temperature: number;
        max_tokens: number;
        response_format: { type: "json_object" };
        messages: Array<{
          role: "system" | "user";
          content: string;
        }>;
      }): Promise<GroqChatCompletionLike>;
    };
  };
}

let groqClient: GroqClientLike | null = null;

const replyContextCache = new Map<string, ReplyContextCard>();

function getGroqClient(): GroqClientLike {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  return groqClient;
}

function normalizeTweetText(value: string): string {
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function buildCacheKey(tweetText: string): string {
  return createHash("sha256").update(normalizeTweetText(tweetText)).digest("hex");
}

function extractTextContent(
  content: string | null | Array<{ text?: string | null }> | undefined,
): string {
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

export function buildReplyContextSystemPrompt(): string {
  return [
    "You are a source-tweet context analyzer for an X reply engine.",
    "You must output your analysis in JSON format.",
    "Analyze the provided tweet and return ONLY valid JSON that matches this exact schema:",
    "{",
    '  "room_sentiment": "string",',
    '  "social_intent": "string",',
    '  "recommended_stance": "string",',
    '  "banned_angles": ["string"]',
    "}",
    "Field guidance:",
    '- room_sentiment: short label like "grief", "celebration", "debate", "neutral", "frustration", or "vulnerability".',
    "- social_intent: what the original author seems to want from the audience.",
    "- recommended_stance: a short directive for how the reply should behave.",
    "- banned_angles: concrete reply moves the AI must not use for this tweet.",
    "Do not include markdown, prose, or any keys outside this schema.",
  ].join("\n");
}

export function isSensitiveReplyRoom(
  replyContext?: ReplyContextCard | null,
): boolean {
  if (!replyContext) {
    return false;
  }

  return SENSITIVE_ROOM_SENTIMENTS.has(
    replyContext.room_sentiment.trim().toLowerCase(),
  );
}

export function doesReplyContextBanAngle(
  replyContext: ReplyContextCard | null | undefined,
  candidateText: string,
): boolean {
  if (!replyContext || !candidateText.trim()) {
    return false;
  }

  const normalizedCandidate = candidateText.trim().toLowerCase();
  return replyContext.banned_angles.some((angle) => {
    const normalizedAngle = angle.trim().toLowerCase();
    return Boolean(
      normalizedAngle &&
        (normalizedCandidate.includes(normalizedAngle) ||
          normalizedAngle.includes(normalizedCandidate)),
    );
  });
}

function isReplyContextCard(value: unknown): value is ReplyContextCard {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.room_sentiment === "string" &&
    record.room_sentiment.trim().length > 0 &&
    typeof record.social_intent === "string" &&
    record.social_intent.trim().length > 0 &&
    typeof record.recommended_stance === "string" &&
    record.recommended_stance.trim().length > 0 &&
    Array.isArray(record.banned_angles) &&
    record.banned_angles.every(
      (entry) => typeof entry === "string" && entry.trim().length > 0,
    )
  );
}

function parseReplyContextCard(rawContent: string): ReplyContextCard | null {
  const parsed = JSON.parse(rawContent) as unknown;
  if (!isReplyContextCard(parsed)) {
    return null;
  }

  return {
    room_sentiment: parsed.room_sentiment.trim(),
    social_intent: parsed.social_intent.trim(),
    recommended_stance: parsed.recommended_stance.trim(),
    banned_angles: parsed.banned_angles.map((entry) => entry.trim()).filter(Boolean),
  };
}

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as {
    status?: unknown;
    message?: unknown;
    error?: { message?: unknown } | null;
  };
  const message = [
    typeof record.message === "string" ? record.message : "",
    typeof record.error?.message === "string" ? record.error.message : "",
  ]
    .filter(Boolean)
    .join(" ");

  return record.status === 429 || /\b429\b|too many requests|rate limit/i.test(message);
}

export async function analyzeSourceTweetWithDeps(
  tweetText: string,
  deps?: {
    getGroqClient?: () => GroqClientLike;
  },
): Promise<ReplyContextCard | null> {
  const normalizedTweetText = normalizeTweetText(tweetText);
  if (!normalizedTweetText) {
    return null;
  }

  const cacheKey = buildCacheKey(normalizedTweetText);
  const cached = replyContextCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  if (!process.env.GROQ_API_KEY?.trim()) {
    return null;
  }

  try {
    const completion = await (deps?.getGroqClient || getGroqClient)().chat.completions.create({
      model: "llama3-8b-8192",
      temperature: 0.1,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildReplyContextSystemPrompt(),
        },
        {
          role: "user",
          content: `Analyze this source tweet and return only JSON:\n\n${normalizedTweetText}`,
        },
      ],
    });

    const rawContent = extractTextContent(completion.choices?.[0]?.message?.content).trim();
    if (!rawContent) {
      return null;
    }

    const parsed = parseReplyContextCard(rawContent);
    if (!parsed) {
      return null;
    }

    replyContextCache.set(cacheKey, parsed);
    return parsed;
  } catch (error) {
    if (isRateLimitError(error)) {
      return null;
    }

    return null;
  }
}

export async function analyzeSourceTweet(
  tweetText: string,
): Promise<ReplyContextCard | null> {
  return analyzeSourceTweetWithDeps(tweetText);
}

export function clearReplyContextCacheForTests(): void {
  replyContextCache.clear();
}

export function setReplyContextGroqClientForTests(client: GroqClientLike | null): void {
  groqClient = client;
}
