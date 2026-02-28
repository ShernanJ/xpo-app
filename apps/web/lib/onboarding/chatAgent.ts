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

interface WriterOutput {
  response: string;
  drafts: string[];
  whyThisWorks: string[];
  watchOutFor: string[];
}

interface CriticOutput {
  approved: boolean;
  finalResponse: string;
  finalDrafts: string[];
  finalWhyThisWorks: string[];
  finalWatchOutFor: string[];
  issues: string[];
}

export type ChatModelProvider = "openai" | "groq";
export type CreatorChatProgressPhase =
  | "planning"
  | "writing"
  | "critic"
  | "finalizing";

export interface CreatorChatReplyResult {
  reply: string;
  drafts: string[];
  whyThisWorks: string[];
  watchOutFor: string[];
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
}): Omit<CreatorChatReplyResult, "source" | "model" | "mode"> {
  const { context, contract } = params;

  if (contract.mode === "analysis_only") {
    return {
      reply: `The model is still in analysis mode. ${context.readiness.reasons[0] ?? "The current sample is not strong enough for reliable drafting yet."}`,
      drafts: [],
      whyThisWorks: [],
      watchOutFor: [
        "Wait for the sample to deepen before relying on generated drafts.",
      ],
    };
  }

  const topHook = contract.planner.suggestedHookPatterns[0]
    ? formatEnumLabel(contract.planner.suggestedHookPatterns[0])
    : "Statement Open";
  const topType = contract.planner.suggestedContentTypes[0]
    ? formatEnumLabel(contract.planner.suggestedContentTypes[0])
    : "Single Line";

  return {
    reply: `Use the ${formatEnumLabel(
      contract.planner.targetLane,
    )} lane for "${params.userMessage}". Lead with a ${topHook} opener, structure it as ${topType}, and stay anchored to: ${contract.planner.primaryAngle}`,
    drafts: [
      `${topHook}: ${contract.planner.primaryAngle}`,
      `${topType} version: ${params.userMessage}. ${contract.planner.primaryAngle}`,
    ],
    whyThisWorks: [
      "It stays inside the deterministic lane, hook, and angle constraints.",
      "It keeps the draft aligned to the strongest current strategy signal.",
    ],
    watchOutFor: [
      contract.writer.mustAvoid[0] ?? "Avoid broad generic phrasing.",
      plannerSafeConstraint(contract.planner.blockedReasons[0]),
    ].filter(Boolean),
  };
}

function plannerSafeConstraint(value: string | undefined): string {
  return value?.trim() || "";
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

function extractBalancedJsonValue(text: string): string {
  const trimmed = text.trim();
  const firstChar = trimmed[0];

  if (firstChar !== "{" && firstChar !== "[") {
    return trimmed;
  }

  const openChar = firstChar;
  const closeChar = firstChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === openChar) {
      depth += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(0, index + 1);
      }
    }
  }

  return trimmed;
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return extractBalancedJsonValue(trimmed);
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return extractBalancedJsonValue(fenced[1].trim());
  }

  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");
  const candidates = [firstBrace, firstBracket].filter((index) => index !== -1);

  if (candidates.length > 0) {
    const start = Math.min(...candidates);
    return extractBalancedJsonValue(trimmed.slice(start));
  }

  return trimmed;
}

function resolveProviderConfig(
  preferredProvider?: ChatModelProvider,
): ModelProviderConfig | null {
  const normalizedPreference = preferredProvider ?? "groq";

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
  const requestHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${params.provider.apiKey}`,
  };

  const parseResponse = async (response: Response): Promise<T> => {
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
      throw new Error(
        `${params.provider.provider} returned an empty structured response.`,
      );
    }

    return JSON.parse(extractJsonObject(content)) as T;
  };

  const buildPromptJsonBody = () => ({
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
  });

  if (params.provider.provider === "openai") {
    const schemaBody = {
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
    };

    const schemaResponse = await fetch(params.provider.baseUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(schemaBody),
    });

    if (schemaResponse.ok) {
      return parseResponse(schemaResponse);
    }

    const schemaErrorText = await schemaResponse.text();
    const promptResponse = await fetch(params.provider.baseUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(buildPromptJsonBody()),
    });

    if (!promptResponse.ok) {
      const promptErrorText = await promptResponse.text();
      throw new Error(
        `openai request failed: schema mode ${schemaResponse.status} ${schemaErrorText}; prompt-json fallback ${promptResponse.status} ${promptErrorText}`,
      );
    }

    return parseResponse(promptResponse);
  }

  const response = await fetch(params.provider.baseUrl, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(buildPromptJsonBody()),
  });

  return parseResponse(response);
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

function formatVoiceProfile(context: CreatorAgentContext): string {
  const voice = context.creatorProfile.voice;

  return [
    `Primary casing: ${voice.primaryCasing}`,
    `Average length band: ${voice.averageLengthBand}`,
    `Lowercase share percent: ${voice.lowercaseSharePercent}`,
    `Question post rate: ${voice.questionPostRate}`,
    `Multi-line post rate: ${voice.multiLinePostRate}`,
    `Style notes: ${voice.styleNotes.join(" | ") || "none"}`,
  ].join("\n");
}

function formatAnchorExamples(
  label: string,
  anchors: Array<{
    id: string;
    text: string;
    selectionReason: string;
    goalFitScore: number;
  }>,
  limit: number,
): string {
  const selected = anchors.slice(0, limit);

  if (selected.length === 0) {
    return `${label}: none`;
  }

  return [
    `${label}:`,
    ...selected.map(
      (post, index) =>
        `${index + 1}. ${post.id} [goal-fit ${post.goalFitScore}] (${post.selectionReason}) -> ${post.text}`,
    ),
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
    "Write one high-quality assistant response package for the user.",
    "Return a short strategic response, 1-3 concrete draft candidates, why they fit, and what to watch out for.",
    "The package must be directly useful, specific, and aligned to the deterministic contract.",
    "The user's native voice matters more than generic social-media best practices.",
    "Mirror the user's actual tone, casing, looseness, and level of polish from the provided voice anchors.",
    "If the anchors are casual, lowercase, clipped, or slangy, keep that character in the drafts.",
    "Do not rewrite the user into polished consultant, corporate, or founder-bro language.",
    "Prefer concrete first-person observations and natural phrasing over generic engagement-bait questions.",
    "Do not introduce startup, investing, or business tropes unless they are clearly present in the user's request, niche, or anchors.",
    `Generation mode: ${contract.mode}.`,
    `Target lane: ${planner.targetLane}.`,
    `Objective: ${planner.objective}.`,
    `Primary angle: ${planner.angle}.`,
    `Observed niche: ${context.creatorProfile.niche.primaryNiche}.`,
    `Target niche: ${context.creatorProfile.niche.targetNiche ?? "none"}.`,
    "Do not mention internal model fields unless useful to the user.",
    "If the user is asking for drafting help, the draft candidates must read like actual X posts, not outlines.",
    "Return only valid JSON that follows the provided schema.",
  ].join("\n");
}

function buildCriticSystemPrompt(params: {
  contract: CreatorGenerationContract;
  context: CreatorAgentContext;
}): string {
  const { contract, context } = params;

  return [
    "You are the critic for an X growth assistant.",
    "Review the candidate response package and either approve it or tighten it.",
    "Keep the final response concise, useful, and aligned to the deterministic checklist.",
    "Keep the draft candidates sharp and usable as actual X posts.",
    "Reject drafts that sound more formal, generic, or polished than the user's real voice anchors.",
    "Reject drafts that read like empty engagement bait, forced binary questions, or generic startup advice unless the user clearly writes that way.",
    "The final drafts should feel like the user's own tone with stronger strategy, not a different person.",
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
  onProgress?: (phase: CreatorChatProgressPhase) => void;
}): Promise<CreatorChatReplyResult> {
  const context = buildCreatorAgentContext({
    runId: params.runId,
    onboarding: params.onboarding,
  });
  const contract = buildCreatorGenerationContract({
    runId: params.runId,
    onboarding: params.onboarding,
  });

  const deterministicFallback = buildDeterministicFallback({
    context,
    contract,
    userMessage: params.userMessage,
  });

  if (contract.mode === "analysis_only") {
    params.onProgress?.("finalizing");
    return {
      ...deterministicFallback,
      source: "deterministic",
      model: null,
      mode: contract.mode,
    };
  }

  const provider = resolveProviderConfig(params.provider);

  if (!provider) {
    params.onProgress?.("finalizing");
    return {
      ...deterministicFallback,
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

  params.onProgress?.("planning");
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

  params.onProgress?.("writing");
  const writer = await callProviderJson<WriterOutput>({
    provider,
    system: buildWriterSystemPrompt({ context, contract, planner }),
    user: [
      `User request: ${params.userMessage}`,
      `Recent chat history:\n${historyText}`,
      `Voice profile:\n${formatVoiceProfile(context)}`,
      formatAnchorExamples(
        "Voice anchors to imitate for tone and casing",
        context.creatorProfile.examples.voiceAnchors,
        3,
      ),
      formatAnchorExamples(
        "Strategy anchors to learn from",
        context.creatorProfile.examples.strategyAnchors,
        2,
      ),
      formatAnchorExamples(
        "Goal anchors to learn from",
        context.creatorProfile.examples.goalAnchors,
        2,
      ),
      `Negative anchors to avoid:\n${context.negativeAnchors
        .slice(0, 3)
        .map((post, index) => `${index + 1}. ${post.id}: ${post.selectionReason}`)
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
    schemaName: "creator_writer_output",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        response: { type: "string" },
        drafts: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 3,
        },
        whyThisWorks: {
          type: "array",
          items: { type: "string" },
          maxItems: 3,
        },
        watchOutFor: {
          type: "array",
          items: { type: "string" },
          maxItems: 3,
        },
      },
      required: ["response", "drafts", "whyThisWorks", "watchOutFor"],
    },
  });

  params.onProgress?.("critic");
  const critic = await callProviderJson<CriticOutput>({
    provider,
    system: buildCriticSystemPrompt({ contract, context }),
    user: [
      `User request: ${params.userMessage}`,
      `Voice profile:\n${formatVoiceProfile(context)}`,
      formatAnchorExamples(
        "Voice anchors to compare against",
        context.creatorProfile.examples.voiceAnchors,
        3,
      ),
      `Candidate response package:\n${JSON.stringify(writer)}`,
      `Checklist: ${contract.critic.checklist.join(" | ")}`,
      `Hard constraints: drafts must sound like the user's real voice, not generic expert copy.`,
    ].join("\n\n"),
    schemaName: "creator_critic_output",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        approved: { type: "boolean" },
        finalResponse: { type: "string" },
        finalDrafts: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 3,
        },
        finalWhyThisWorks: {
          type: "array",
          items: { type: "string" },
          maxItems: 3,
        },
        finalWatchOutFor: {
          type: "array",
          items: { type: "string" },
          maxItems: 3,
        },
        issues: {
          type: "array",
          items: { type: "string" },
          maxItems: 5,
        },
      },
      required: [
        "approved",
        "finalResponse",
        "finalDrafts",
        "finalWhyThisWorks",
        "finalWatchOutFor",
        "issues",
      ],
    },
  });

  params.onProgress?.("finalizing");
  return {
    reply: critic.finalResponse.trim() || writer.response.trim(),
    drafts: sanitizeStringList(critic.finalDrafts, 3, writer.drafts),
    whyThisWorks: sanitizeStringList(
      critic.finalWhyThisWorks,
      3,
      writer.whyThisWorks,
    ),
    watchOutFor: sanitizeStringList(
      critic.finalWatchOutFor,
      3,
      writer.watchOutFor,
    ),
    source: provider.provider,
    model: provider.model,
    mode: contract.mode,
  };
}

function sanitizeStringList(
  values: string[] | undefined,
  maxItems: number,
  fallback: string[] = [],
): string[] {
  const source = Array.isArray(values) && values.length > 0 ? values : fallback;

  return source
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .slice(0, maxItems);
}
