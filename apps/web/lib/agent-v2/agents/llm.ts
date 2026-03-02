import "dotenv/config";

export interface LlmCompletionOptions {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

/**
 * Generic fetcher for Groq JSON outputs. Reduces boilerplate across the new agent actions.
 */
export async function fetchJsonFromGroq<T>(
  options: LlmCompletionOptions,
): Promise<T | null> {
  const apiKey = process.env.GROQ_API_KEY;
  const baseUrl = "https://api.groq.com/openai/v1/chat/completions";

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set");
  }

  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        ...options,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Groq API Error:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error("No content received from Groq");
      return null;
    }

    return JSON.parse(content) as T;
  } catch (err) {
    console.error("Failed to parse or fetch JSON from Groq:", err);
    return null;
  }
}
