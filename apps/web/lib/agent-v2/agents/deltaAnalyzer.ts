import Groq from "groq-sdk";

import { DeltaAnalysisSchema } from "./jsonPromptContracts.ts";

type GroqClientLike = {
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
      }): Promise<{
        choices?: Array<{
          message?: {
            content?: string | Array<{ text?: string | null }> | null;
          } | null;
        }>;
      }>;
    };
  };
};

let groqClient: Groq | null = null;

function getGroqClient(): GroqClientLike {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  return groqClient;
}

function resolveDeltaAnalyzerModel(): string {
  return (
    process.env.GROQ_DELTA_ANALYZER_MODEL?.trim() ||
    process.env.GROQ_MODEL?.trim() ||
    "llama-3.3-70b-versatile"
  );
}

function extractTextContent(
  content: string | null | Array<{ text?: string | null }> | undefined,
): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((entry) => (typeof entry?.text === "string" ? entry.text : ""))
    .join("")
    .trim();
}

function parseDeltaAnalysis(raw: string) {
  try {
    return DeltaAnalysisSchema.safeParse(JSON.parse(raw));
  } catch {
    return null;
  }
}

function buildSystemPrompt(): string {
  return [
    "You are an elite forensic linguist.",
    "I will provide an Original AI Draft and the Final User Published Text.",
    "You must compare them and identify if the user made a mechanical or stylistic edit.",
    "Ignore minor typos.",
    "If the user systematically removed a certain word, changed the formatting, or altered the tone, set has_stylistic_change to true and synthesize a strict, permanent rule in extracted_rule to prevent the AI from making that mistake again.",
    "You must output your response in JSON format.",
  ].join(" ");
}

export async function analyzeDraftDeltaWithDeps(
  originalDraft: string,
  publishedText: string,
  deps?: {
    getGroqClient?: () => GroqClientLike;
  },
): Promise<string | null> {
  if (!deps?.getGroqClient && !process.env.GROQ_API_KEY?.trim()) {
    return null;
  }

  try {
    const completion = await (deps?.getGroqClient || getGroqClient)().chat.completions.create({
      model: resolveDeltaAnalyzerModel(),
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(),
        },
        {
          role: "user",
          content: [
            "Compare these two texts and return only JSON.",
            "",
            "Original AI Draft:",
            originalDraft,
            "",
            "Final User Published Text:",
            publishedText,
          ].join("\n"),
        },
      ],
    });

    const rawContent = extractTextContent(completion.choices?.[0]?.message?.content).trim();
    if (!rawContent) {
      return null;
    }

    const parsed = parseDeltaAnalysis(rawContent);
    if (!parsed?.success) {
      return null;
    }

    const extractedRule = parsed.data.extracted_rule?.trim();
    if (
      parsed.data.has_stylistic_change &&
      parsed.data.confidence_score > 80 &&
      extractedRule
    ) {
      return extractedRule;
    }

    return null;
  } catch {
    return null;
  }
}

export async function analyzeDraftDelta(
  originalDraft: string,
  publishedText: string,
): Promise<string | null> {
  return analyzeDraftDeltaWithDeps(originalDraft, publishedText);
}
