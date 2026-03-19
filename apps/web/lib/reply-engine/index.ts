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

async function requestReplyDraft(args: {
  model: string;
  messages: PreparedReplyPromptPacket["messages"];
  temperature: number;
  maxTokens: number;
}) {
  const completion = await getGroqClient().chat.completions.create({
    model: args.model,
    temperature: args.temperature,
    ...(isOpenAiModel(args.model)
      ? {
          max_completion_tokens: args.maxTokens,
          reasoning_effort: "low" as const,
        }
      : {
          max_tokens: args.maxTokens,
        }),
    stream: false,
    messages: args.messages,
  });

  return extractTextContent(completion.choices?.[0]?.message?.content);
}

function buildReplyRetryInstruction(promptPacket: PreparedReplyPromptPacket): string {
  return [
    "Retry once.",
    "The previous attempt sounded too generic, too polished, or too marketing-heavy.",
    "Lean harder on the lane-matched reply evidence for casing, cadence, sentence shape, and endings.",
    "Stay on the literal subject of the visible post.",
    "Reuse concrete nouns or phrasing from the visible post naturally.",
    promptPacket.voiceEvidence.antiPatterns.length > 0
      ? `Avoid these misses: ${promptPacket.voiceEvidence.antiPatterns.join(" | ")}`
      : null,
    "Avoid phrases like 'cheap signal', 'iterate on content', 'real data', 'would love to see', 'next build', or 'vanity likes'.",
    "Return ONLY the final drafted X reply text in message content. No empty content. No reasoning. No markdown. No commentary.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
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
    const maxTokens = args.maxTokens ?? 220;
    const baseMessages = [
      ...args.promptPacket.messages,
      {
        role: "user" as const,
        content:
          "Return ONLY the final drafted X reply text in message content. No empty content. No reasoning. No markdown. No commentary.",
      },
    ];
    const candidate = finalizeReplyDraftText(
      await requestReplyDraft({
        model,
        messages: baseMessages,
        temperature: args.temperature ?? 0.55,
        maxTokens,
      }),
      {
        styleCard: args.promptPacket.styleCard,
        maxCharacterLimit: args.promptPacket.maxCharacterLimit,
      },
    );
    if (candidate && looksAcceptableReplyDraft({ draft: candidate, sourceContext: args.promptPacket.sourceContext })) {
      return {
        draft: candidate,
        model,
        voiceTarget: args.promptPacket.voiceTarget,
        sourceContext: args.promptPacket.sourceContext,
        groundingPacket: args.promptPacket.groundingPacket,
        visualContext: args.promptPacket.visualContext,
      };
    }

    const retriedCandidate = finalizeReplyDraftText(
      await requestReplyDraft({
        model,
        messages: [
          ...args.promptPacket.messages,
          {
            role: "user",
            content: buildReplyRetryInstruction(args.promptPacket),
          },
        ],
        temperature: Math.min(args.temperature ?? 0.55, 0.35),
        maxTokens,
      }),
      {
        styleCard: args.promptPacket.styleCard,
        maxCharacterLimit: args.promptPacket.maxCharacterLimit,
      },
    );
    if (
      retriedCandidate &&
      looksAcceptableReplyDraft({
        draft: retriedCandidate,
        sourceContext: args.promptPacket.sourceContext,
      })
    ) {
      return {
        draft: retriedCandidate,
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
