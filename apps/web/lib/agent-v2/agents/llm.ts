import "dotenv/config";
import Groq from "groq-sdk";

let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqClient) {
    groqClient = new Groq();
  }
  return groqClient;
}

export interface LlmCompletionOptions {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  /** Only used for openai/ reasoning models. "low" | "medium" | "high" */
  reasoning_effort?: "low" | "medium" | "high";
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
): Record<string, unknown> {
  const params: Record<string, unknown> = {
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

async function retryEmptyContentOpenAiJson<T>(
  options: LlmCompletionOptions,
): Promise<T | null> {
  const retryMessages = [
    ...options.messages,
    {
      role: "user" as const,
      content:
        "Return ONLY the final valid JSON in message content. Do not leave content empty. Do not place the answer in reasoning.",
    },
  ];
  const retryParams = buildParams(options, true, {
    messages: retryMessages,
    reasoningEffort: "low",
  });

  console.warn(`[LLM] Empty content from ${options.model}; retrying once with forced content-only JSON.`);
  const retryCompletion = await getGroqClient().chat.completions.create(retryParams);
  const retryChoice = retryCompletion.choices?.[0];
  const retryContent = extractMessageContent((retryChoice?.message || null) as ChatMessage | null);

  if (!retryContent) {
    console.error("[LLM] Retry also returned no content. Full message:", JSON.stringify(retryChoice?.message, null, 2));
    return null;
  }

  console.log(`[LLM] Retry got ${retryContent.length} chars back from ${options.model}`);
  return parseJsonContent<T>(retryContent);
}

/**
 * Generic fetcher for Groq JSON outputs using the official SDK.
 */
export async function fetchJsonFromGroq<T>(
  options: LlmCompletionOptions,
): Promise<T | null> {
  const reportFailure = (reason: string) => {
    options.onFailure?.(reason);
  };

  try {
    const isOpenAiModel = options.model.startsWith("openai/");
    const params = buildParams(options, isOpenAiModel);

    console.log(`[LLM] Calling ${options.model} (${isOpenAiModel ? `openai, effort=${String(params.reasoning_effort)}` : "groq-native"})...`);

    const chatCompletion = await getGroqClient().chat.completions.create(params);

    const choice = chatCompletion.choices?.[0];
    if (!choice) {
      reportFailure("returned no choices");
      console.error("[LLM] No choices returned from Groq:", JSON.stringify(chatCompletion, null, 2));
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
          console.error("[LLM] Retry after empty content failed:", retryError);
        }
      }

      reportFailure("returned no content");
      console.error("[LLM] No content in message. Full message:", JSON.stringify(choice.message, null, 2));
      return null;
    }

    console.log(`[LLM] Got ${content.length} chars back from ${options.model}`);

    try {
      return parseJsonContent<T>(content);
    } catch (err) {
      reportFailure("returned invalid JSON");
      console.error("[LLM] Failed to parse JSON from Groq response:", err);
      return null;
    }
  } catch (err) {
    reportFailure("request failed");
    console.error("[LLM] Failed to fetch/parse JSON from Groq:", err);
    return null;
  }
}
