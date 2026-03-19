import Groq from "groq-sdk";

import { finalizeReplyDraftText, looksAcceptableReplyDraft } from "./finalize.ts";
import type {
  GeneratedReplyDraftResult,
  PreparedReplyPromptPacket,
} from "./types.ts";

export * from "./context.ts";
export * from "./finalize.ts";
export * from "./prompt.ts";
export * from "./types.ts";

let groqClient: Groq | null = null;

function getGroqClient() {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  return groqClient;
}

const DEFAULT_REPLY_DRAFT_MODEL =
  process.env.GROQ_REPLY_DRAFT_MODEL?.trim() ||
  process.env.GROQ_MODEL?.trim() ||
  "openai/gpt-oss-120b";
const FALLBACK_REPLY_DRAFT_MODEL =
  process.env.GROQ_REPLY_DRAFT_FALLBACK_MODEL?.trim() ||
  "llama-3.3-70b-versatile";

function isOpenAiModel(model: string) {
  return model.startsWith("openai/");
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

export async function generateReplyDraftText(args: {
  promptPacket: PreparedReplyPromptPacket;
  model?: string;
  fallbackModel?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<GeneratedReplyDraftResult> {
  const modelsToTry = [args.model || DEFAULT_REPLY_DRAFT_MODEL, args.fallbackModel || FALLBACK_REPLY_DRAFT_MODEL]
    .filter((model, index, list) => model && list.indexOf(model) === index);

  for (const model of modelsToTry) {
    const completion = await getGroqClient().chat.completions.create({
      model,
      temperature: args.temperature ?? 0.55,
      ...(isOpenAiModel(model)
        ? {
            max_completion_tokens: args.maxTokens ?? 220,
            reasoning_effort: "low" as const,
          }
        : {
            max_tokens: args.maxTokens ?? 220,
          }),
      stream: false,
      messages: [
        ...args.promptPacket.messages,
        {
          role: "user",
          content:
            "Return ONLY the final drafted X reply text in message content. No empty content. No reasoning. No markdown. No commentary.",
        },
      ],
    });

    const candidate = finalizeReplyDraftText(
      extractTextContent(completion.choices?.[0]?.message?.content),
    );
    if (
      candidate &&
      looksAcceptableReplyDraft({
        draft: candidate,
        sourceContext: args.promptPacket.sourceContext,
      })
    ) {
      return {
        draft: candidate,
        model,
        voiceTarget: args.promptPacket.voiceTarget,
        sourceContext: args.promptPacket.sourceContext,
        groundingPacket: args.promptPacket.groundingPacket,
        visualContext: args.promptPacket.visualContext,
      };
    }
  }

  throw new Error("Groq returned an unusable reply draft.");
}
