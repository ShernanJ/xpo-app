import "dotenv/config";
import { randomUUID } from "crypto";
import Groq from "groq-sdk";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "groq-sdk/resources/chat/completions";

let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqClient) {
    groqClient = new Groq();
  }
  return groqClient;
}

export interface LlmCompletionOptions {
  model: string;
  messages: Array<ChatCompletionMessageParam>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  /** Only used for openai/ reasoning models. "low" | "medium" | "high" */
  reasoning_effort?: "low" | "medium" | "high";
  jsonRepairInstruction?: string;
  onFailure?: (reason: string) => void;
}

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content?: string | null | Array<{ type?: string; text?: string }>;
  reasoning?: string | null;
};

function buildParams(
  options: LlmCompletionOptions,
  isOpenAiModel: boolean,
  overrides?: {
    messages?: LlmCompletionOptions["messages"];
    reasoningEffort?: LlmCompletionOptions["reasoning_effort"];
  },
): ChatCompletionCreateParamsNonStreaming {
  const params: ChatCompletionCreateParamsNonStreaming = {
    model: options.model,
    messages: overrides?.messages || options.messages,
    temperature: options.temperature ?? 1,
    top_p: options.top_p ?? 1,
    stream: false,
    stop: null,
  };

  if (isOpenAiModel) {
    params.max_completion_tokens = options.max_tokens ?? 8192;
    params.reasoning_effort = overrides?.reasoningEffort || options.reasoning_effort || "medium";
  } else {
    params.max_tokens = options.max_tokens ?? 1024;
    params.response_format = { type: "json_object" };
  }

  return params;
}

function extractMessageContent(message: ChatMessage | null | undefined): string {
  const content = message?.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }

  return "";
}

function parseJsonContent<T>(rawContent: string): T | null {
  let jsonStr = rawContent.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  return JSON.parse(jsonStr) as T;
}

async function retryInvalidJsonContent<T>(
  options: LlmCompletionOptions,
  invalidContent: string,
): Promise<T | null> {
  const requestId = randomUUID().slice(0, 8);
  const retryMessages: ChatCompletionMessageParam[] = [
    ...options.messages,
    {
      role: "assistant",
      content: invalidContent,
    },
    {
      role: "user",
      content:
        options.jsonRepairInstruction ||
        "Your previous response was not valid JSON. Return ONLY the corrected valid JSON with the same overall structure and no markdown or commentary.",
    },
  ];
  const isOpenAiModel = options.model.startsWith("openai/");
  const retryParams = buildParams(options, isOpenAiModel, {
    messages: retryMessages,
    reasoningEffort: "low",
  });

  console.warn(`[LLM][${requestId}] Invalid JSON from ${options.model}; retrying once with repair instruction.`);
  const retryCompletion = await getGroqClient().chat.completions.create(retryParams);
  const retryChoice = retryCompletion.choices?.[0];
  const retryContent = extractMessageContent((retryChoice?.message || null) as ChatMessage | null);

  if (!retryContent) {
    console.error(`[LLM][${requestId}] JSON repair retry returned no content.`);
    return null;
  }

  console.log(`[LLM][${requestId}] JSON repair retry got ${retryContent.length} chars back from ${options.model}`);
  return parseJsonContent<T>(retryContent);
}

async function retryEmptyContentOpenAiJson<T>(
  options: LlmCompletionOptions,
): Promise<T | null> {
  const requestId = randomUUID().slice(0, 8);
  const retryMessages: ChatCompletionMessageParam[] = [
    ...options.messages,
    {
      role: "user",
      content:
        "Return ONLY the final valid JSON in message content. Do not leave content empty. Do not place the answer in reasoning.",
    },
  ];
  const retryParams = buildParams(options, true, {
    messages: retryMessages,
    reasoningEffort: "low",
  });

  console.warn(`[LLM][${requestId}] Empty content from ${options.model}; retrying once with forced content-only JSON.`);
  const retryCompletion = await getGroqClient().chat.completions.create(retryParams);
  const retryChoice = retryCompletion.choices?.[0];
  const retryContent = extractMessageContent((retryChoice?.message || null) as ChatMessage | null);

  if (!retryContent) {
    console.error(`[LLM][${requestId}] Retry also returned no content.`);
    return null;
  }

  console.log(`[LLM][${requestId}] Retry got ${retryContent.length} chars back from ${options.model}`);
  return parseJsonContent<T>(retryContent);
}

/**
 * Generic fetcher for Groq JSON outputs using the official SDK.
 */
export async function fetchJsonFromGroq<T>(
  options: LlmCompletionOptions,
): Promise<T | null> {
  const requestId = randomUUID().slice(0, 8);
  const reportFailure = (reason: string) => {
    options.onFailure?.(reason);
  };

  try {
    const isOpenAiModel = options.model.startsWith("openai/");
    const params = buildParams(options, isOpenAiModel);

    console.log(`[LLM][${requestId}] Calling ${options.model} (${isOpenAiModel ? `openai, effort=${String(params.reasoning_effort)}` : "groq-native"})`);

    const chatCompletion = await getGroqClient().chat.completions.create(params);

    const choice = chatCompletion.choices?.[0];
    if (!choice) {
      reportFailure("returned no choices");
      console.error(`[LLM][${requestId}] No choices returned from provider.`);
      return null;
    }

    const content = extractMessageContent((choice.message || null) as ChatMessage | null);

    if (!content) {
      if (isOpenAiModel) {
        try {
          const retryResult = await retryEmptyContentOpenAiJson<T>(options);
          if (retryResult) {
            return retryResult;
          }
        } catch (retryError) {
          console.error(`[LLM][${requestId}] Retry after empty content failed:`, retryError);
        }
      }

      reportFailure("returned no content");
      console.error(`[LLM][${requestId}] No content in provider response.`);
      return null;
    }

    console.log(`[LLM][${requestId}] Got ${content.length} chars back from ${options.model}`);

    try {
      return parseJsonContent<T>(content);
    } catch (err) {
      console.error(`[LLM][${requestId}] Failed to parse JSON response:`, err);
      try {
        const retryResult = await retryInvalidJsonContent<T>(options, content);
        if (retryResult) {
          return retryResult;
        }
      } catch (retryError) {
        console.error(`[LLM][${requestId}] Retry after invalid JSON failed:`, retryError);
      }

      reportFailure("returned invalid JSON");
      return null;
    }
  } catch (err) {
    reportFailure("request failed");
    console.error(`[LLM][${requestId}] Failed to fetch/parse JSON from provider:`, err);
    return null;
  }
}
