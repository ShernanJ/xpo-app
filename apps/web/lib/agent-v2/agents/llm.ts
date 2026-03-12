import "dotenv/config";
import Groq from "groq-sdk";

const groq = new Groq();

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

    // Build request params matching the official SDK format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = {
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 1,
      top_p: options.top_p ?? 1,
      stream: false,
      stop: null,
    };

    if (isOpenAiModel) {
      // OpenAI-proxied reasoning models use max_completion_tokens + reasoning_effort
      params.max_completion_tokens = options.max_tokens ?? 8192;
      params.reasoning_effort = options.reasoning_effort ?? "medium";
    } else {
      // Groq-native models (Llama/Mistral) use max_tokens + response_format
      params.max_tokens = options.max_tokens ?? 1024;
      params.response_format = { type: "json_object" };
    }

    console.log(`[LLM] Calling ${options.model} (${isOpenAiModel ? `openai, effort=${params.reasoning_effort}` : "groq-native"})...`);

    const chatCompletion = await groq.chat.completions.create(params);

    const choice = chatCompletion.choices?.[0];
    if (!choice) {
      reportFailure("returned no choices");
      console.error("[LLM] No choices returned from Groq:", JSON.stringify(chatCompletion, null, 2));
      return null;
    }

    const content = choice.message?.content;

    if (!content) {
      reportFailure("returned no content");
      console.error("[LLM] No content in message. Full message:", JSON.stringify(choice.message, null, 2));
      return null;
    }

    console.log(`[LLM] Got ${content.length} chars back from ${options.model}`);

    // Extract JSON from the response — some models wrap it in markdown code blocks
    let jsonStr = content.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    try {
      return JSON.parse(jsonStr) as T;
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
