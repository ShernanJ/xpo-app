import { buildCreatorAgentContext, type CreatorAgentContext } from "./agentContext";
import {
  buildCreatorGenerationContract,
  type CreatorGenerationContract,
} from "./generationContract";
import type { OnboardingResult } from "./types";

interface ChatHistoryMessage {
  role: "assistant" | "user";
  content: string;
}

interface PlannerOutput {
  objective: string;
  angle: string;
  targetLane: "original" | "reply" | "quote";
  mustInclude: string[];
  mustAvoid: string[];
}

interface CriticOutput {
  approved: boolean;
  finalReply: string;
  issues: string[];
}

export type ChatModelProvider = "openai" | "groq";

export interface CreatorChatReplyResult {
  reply: string;
  source: ChatModelProvider | "deterministic";
  model: string | null;
  mode: CreatorGenerationContract["mode"];
}

interface ModelProviderConfig {
  provider: ChatModelProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
}

function formatEnumLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildDeterministicFallback(params: {
  context: CreatorAgentContext;
  contract: CreatorGenerationContract;
  userMessage: string;
}): string {
  const { context, contract } = params;

  if (contract.mode === "analysis_only") {
    return `The model is still in analysis mode. ${context.readiness.reasons[0] ?? "The current sample is not strong enough for reliable drafting yet."}`;
  }

  const topHook = contract.planner.suggestedHookPatterns[0]
    ? formatEnumLabel(contract.planner.suggestedHookPatterns[0])
    : "Statement Open";
  const topType = contract.planner.suggestedContentTypes[0]
    ? formatEnumLabel(contract.planner.suggestedContentTypes[0])
    : "Single Line";

  return `Use the ${formatEnumLabel(
    contract.planner.targetLane,
  )} lane for "${params.userMessage}". Lead with a ${topHook} opener, structure it as ${topType}, and stay anchored to: ${contract.planner.primaryAngle}`;
}

function normalizeHistory(history: ChatHistoryMessage[]): ChatHistoryMessage[] {
  return history
    .filter(
      (message) =>
        (message.role === "assistant" || message.role === "user") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0,
    )
    .slice(-6)
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function resolveProviderConfig(
  preferredProvider?: ChatModelProvider,
): ModelProviderConfig | null {
  const normalizedPreference = preferredProvider ?? "openai";

  if (normalizedPreference === "groq") {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      return null;
    }

    return {
      provider: "groq",
      apiKey,
      model: process.env.GROQ_MODEL?.trim() || "llama-3.1-8b-instant",
      baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  return {
    provider: "openai",
    apiKey,
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
    baseUrl: "https://api.openai.com/v1/chat/completions",
  };
}

async function callProviderJson<T>(params: {
  provider: ModelProviderConfig;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const body =
    params.provider.provider === "openai"
      ? {
          model: params.provider.model,
          messages: [
            { role: "system", content: params.system },
            { role: "user", content: params.user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: params.schemaName,
              schema: params.schema,
              strict: true,
            },
          },
        }
      : {
          model: params.provider.model,
          messages: [
            {
              role: "system",
              content: `${params.system}\nReturn only valid JSON. Do not use markdown fences.`,
            },
            {
              role: "user",
              content: `${params.user}\n\nReturn JSON that matches this shape:\n${JSON.stringify(
                params.schema,
              )}`,
            },
          ],
          temperature: 0.2,
        };

  const response = await fetch(params.provider.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.provider.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `${params.provider.provider} request failed: ${response.status} ${errorText}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(`${params.provider.provider} returned an empty structured response.`);
  }

  return JSON.parse(extractJsonObject(content)) as T;
}

async function callProviderText(params: {
  provider: ModelProviderConfig;
  system: string;
  user: string;
}): Promise<string> {
  const response = await fetch(params.provider.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.provider.apiKey}`,
    },
    body: JSON.stringify({
      model: params.provider.model,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `${params.provider.provider} request failed: ${response.status} ${errorText}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(`${params.provider.provider} returned an empty text response.`);
  }

  return content;
}

function buildPlannerSystemPrompt(params: {
  context: CreatorAgentContext;
  contract: CreatorGenerationContract;
}): string {
  const { context, contract } = params;

  return [
    "You are the planner for an X growth assistant.",
    "You must refine the next message plan without breaking the deterministic contract.",
    `Generation mode: ${contract.mode}.`,
    `Goal: ${context.creatorProfile.strategy.primaryGoal}.`,
    `Observed niche: ${context.creatorProfile.niche.primaryNiche}.`,
    `Target niche: ${context.creatorProfile.niche.targetNiche ?? "none"}.`,
    `Primary loop: ${context.creatorProfile.distribution.primaryLoop}.`,
    `Primary angle: ${contract.planner.primaryAngle}.`,
    "Return only valid JSON that follows the provided schema.",
  ].join("\n");
}

function buildWriterSystemPrompt(params: {
  context: CreatorAgentContext;
  contract: CreatorGenerationContract;
  planner: PlannerOutput;
}): string {
  const { context, contract, planner } = params;

  return [
    "You are the writer for an X growth assistant.",
    "Write one high-quality assistant reply to the user.",
    "The reply should be directly useful, specific, and aligned to the deterministic contract.",
    `Generation mode: ${contract.mode}.`,
    `Target lane: ${planner.targetLane}.`,
    `Objective: ${planner.objective}.`,
    `Primary angle: ${planner.angle}.`,
    `Observed niche: ${context.creatorProfile.niche.primaryNiche}.`,
    `Target niche: ${context.creatorProfile.niche.targetNiche ?? "none"}.`,
    "Do not mention internal model fields unless useful to the user.",
    "If the user is asking for drafting help, provide concrete draft-ready guidance. If they ask for strategy, answer strategically.",
  ].join("\n");
}

function buildCriticSystemPrompt(params: {
  contract: CreatorGenerationContract;
  context: CreatorAgentContext;
}): string {
  const { contract, context } = params;

  return [
    "You are the critic for an X growth assistant.",
    "Review the candidate reply and either approve it or tighten it.",
    "Keep the final reply concise, useful, and aligned to the deterministic checklist.",
    `Generation mode: ${contract.mode}.`,
    `Checklist: ${contract.critic.checklist.join(" | ")}`,
    `Readiness status: ${context.readiness.status}.`,
    "Return only valid JSON that follows the provided schema.",
  ].join("\n");
}

export async function generateCreatorChatReply(params: {
  runId: string;
  onboarding: OnboardingResult;
  userMessage: string;
  history?: ChatHistoryMessage[];
  provider?: ChatModelProvider;
}): Promise<CreatorChatReplyResult> {
  const context = buildCreatorAgentContext({
    runId: params.runId,
    onboarding: params.onboarding,
  });
  const contract = buildCreatorGenerationContract({
    runId: params.runId,
    onboarding: params.onboarding,
  });

  if (contract.mode === "analysis_only") {
    return {
      reply: buildDeterministicFallback({
        context,
        contract,
        userMessage: params.userMessage,
      }),
      source: "deterministic",
      model: null,
      mode: contract.mode,
    };
  }

  const provider = resolveProviderConfig(params.provider);

  if (!provider) {
    return {
      reply: buildDeterministicFallback({
        context,
        contract,
        userMessage: params.userMessage,
      }),
      source: "deterministic",
      model: null,
      mode: contract.mode,
    };
  }

  const history = normalizeHistory(params.history ?? []);
  const historyText =
    history.length > 0
      ? history.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n")
      : "No prior chat history.";

  const planner = await callProviderJson<PlannerOutput>({
    provider,
    system: buildPlannerSystemPrompt({ context, contract }),
    user: [
      `User request: ${params.userMessage}`,
      `Recent chat history:\n${historyText}`,
      `Deterministic strategy delta: ${contract.planner.strategyDeltaSummary}`,
      `Blocked reasons: ${contract.planner.blockedReasons.join(" | ") || "none"}`,
      `Deterministic must-include constraints: ${contract.writer.mustInclude.join(" | ")}`,
      `Deterministic must-avoid constraints: ${contract.writer.mustAvoid.join(" | ")}`,
    ].join("\n\n"),
    schemaName: "creator_planner_output",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        objective: { type: "string" },
        angle: { type: "string" },
        targetLane: {
          type: "string",
          enum: ["original", "reply", "quote"],
        },
        mustInclude: {
          type: "array",
          items: { type: "string" },
          maxItems: 4,
        },
        mustAvoid: {
          type: "array",
          items: { type: "string" },
          maxItems: 4,
        },
      },
      required: ["objective", "angle", "targetLane", "mustInclude", "mustAvoid"],
    },
  });

  const writerReply = await callProviderText({
    provider,
    system: buildWriterSystemPrompt({ context, contract, planner }),
    user: [
      `User request: ${params.userMessage}`,
      `Recent chat history:\n${historyText}`,
      `Positive anchors to learn from: ${context.positiveAnchors
        .slice(0, 3)
        .map((post) => `${post.id}: ${post.text}`)
        .join("\n")}`,
      `Negative anchors to avoid: ${context.negativeAnchors
        .slice(0, 3)
        .map((post) => `${post.id}: ${post.selectionReason}`)
        .join("\n")}`,
      `Voice guidelines: ${contract.writer.voiceGuidelines.join(" | ")}`,
      `Must include: ${[
        ...contract.writer.mustInclude,
        ...planner.mustInclude,
      ].join(" | ")}`,
      `Must avoid: ${[
        ...contract.writer.mustAvoid,
        ...planner.mustAvoid,
      ].join(" | ")}`,
    ].join("\n\n"),
  });

  const critic = await callProviderJson<CriticOutput>({
    provider,
    system: buildCriticSystemPrompt({ contract, context }),
    user: [
      `User request: ${params.userMessage}`,
      `Candidate reply:\n${writerReply}`,
      `Checklist: ${contract.critic.checklist.join(" | ")}`,
    ].join("\n\n"),
    schemaName: "creator_critic_output",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        approved: { type: "boolean" },
        finalReply: { type: "string" },
        issues: {
          type: "array",
          items: { type: "string" },
          maxItems: 5,
        },
      },
      required: ["approved", "finalReply", "issues"],
    },
  });

  return {
    reply: critic.finalReply.trim() || writerReply,
    source: provider.provider,
    model: provider.model,
    mode: contract.mode,
  };
}
