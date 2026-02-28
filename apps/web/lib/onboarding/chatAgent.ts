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

export interface CreatorChatReplyResult {
  reply: string;
  source: "openai" | "deterministic";
  model: string | null;
  mode: CreatorGenerationContract["mode"];
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

async function callOpenAIJson<T>(params: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
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
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
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
    throw new Error("OpenAI returned an empty structured response.");
  }

  return JSON.parse(content) as T;
}

async function callOpenAIText(params: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
}): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
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
    throw new Error("OpenAI returned an empty text response.");
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

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";

  if (!apiKey) {
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

  const planner = await callOpenAIJson<PlannerOutput>({
    apiKey,
    model,
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

  const writerReply = await callOpenAIText({
    apiKey,
    model,
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

  const critic = await callOpenAIJson<CriticOutput>({
    apiKey,
    model,
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
    source: "openai",
    model,
    mode: contract.mode,
  };
}
