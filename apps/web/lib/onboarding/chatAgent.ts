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
  angles: string[];
  drafts: string[];
  supportAsset: string;
  whyThisWorks: string[];
  watchOutFor: string[];
}

interface CriticOutput {
  approved: boolean;
  finalResponse: string;
  finalAngles: string[];
  finalDrafts: string[];
  finalSupportAsset: string;
  finalWhyThisWorks: string[];
  finalWatchOutFor: string[];
  issues: string[];
}

export type ChatModelProvider = "openai" | "groq";
export type CreatorChatIntent = "ideate" | "draft" | "review";
export type CreatorChatProgressPhase =
  | "planning"
  | "writing"
  | "critic"
  | "finalizing";

export interface CreatorChatReplyResult {
  reply: string;
  angles: string[];
  drafts: string[];
  supportAsset: string | null;
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
  intent?: CreatorChatIntent;
  contentFocus?: string | null;
}): Omit<CreatorChatReplyResult, "source" | "model" | "mode"> {
  const { context, contract } = params;

  if (contract.mode === "analysis_only") {
    return {
      reply: `The model is still in analysis mode. ${context.readiness.reasons[0] ?? "The current sample is not strong enough for reliable drafting yet."}`,
      angles: [],
      drafts: [],
      supportAsset: null,
      whyThisWorks: [],
      watchOutFor: [
        "Wait for the sample to deepen before relying on generated drafts.",
      ],
    };
  }

  if (params.intent === "ideate") {
    const focus = params.contentFocus?.trim() || "the next content lane";

    return {
      reply: `Focus on ${focus} first. Do not force a polished post yet. Pick 2-3 specific angles you could talk about naturally, then choose the one that best proves something real about you.`,
      angles: [
        `the real build problem or insight behind ${focus}`,
        `what you're seeing while building ${focus} that other people miss`,
        `one concrete lesson from ${focus} + "thoughts?"`,
      ],
      drafts: [],
      supportAsset:
        "Use a real screenshot, short demo clip, or a product link only if it helps prove the point.",
      whyThisWorks: [
        "It separates planning from final post writing.",
        "It keeps the next move anchored to a specific content focus instead of generic posting advice.",
      ],
      watchOutFor: [
        "Avoid placeholder hooks and generic engagement bait.",
        "Start from a real project, observation, or technical detail.",
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
    angles: [],
    drafts: [
      `${topHook}: ${contract.planner.primaryAngle}`,
      `${topType} version: ${params.userMessage}. ${contract.planner.primaryAngle}`,
    ],
    supportAsset:
      "If you mention a product or project, attach a screenshot or quick demo instead of a generic link.",
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

function extractConcreteSubject(userMessage: string): string | null {
  const trimmed = userMessage.trim();
  const patterns = [
    /(?:^|\b)i want to write a post about\s+(.+)$/i,
    /(?:^|\b)write a post about\s+(.+)$/i,
    /(?:^|\b)post about\s+(.+)$/i,
    /(?:^|\b)i'm posting about\s+(.+)$/i,
    /(?:^|\b)im posting about\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return match[1].trim().replace(/[.?!]+$/, "");
    }
  }

  return null;
}

function inferUserMessageVoiceHints(userMessage: string): string {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    return "No additional live voice hints.";
  }

  const letters = trimmed.match(/[A-Za-z]/g) ?? [];
  const lowercaseLetters = trimmed.match(/[a-z]/g) ?? [];
  const lowercaseShare =
    letters.length > 0 ? Math.round((lowercaseLetters.length / letters.length) * 100) : 0;
  const slangMatches = trimmed.match(/\b(bruh|lol|lmao|ngl|idk|rn|tl)\b/gi) ?? [];
  const sentenceCount = trimmed.split(/[.!?]+/).filter(Boolean).length;

  return [
    `Lowercase share in current request: ${lowercaseShare}%`,
    slangMatches.length > 0
      ? `Live slang present: ${slangMatches.join(", ").toLowerCase()}`
      : "Live slang present: none",
    sentenceCount <= 1
      ? "Live request style: clipped and direct"
      : "Live request style: multi-sentence",
    "Weight the current user message style more heavily than weak historical signals if they conflict.",
  ].join("\n");
}

function buildWriterSystemPrompt(params: {
  context: CreatorAgentContext;
  contract: CreatorGenerationContract;
  planner: PlannerOutput;
  intent: CreatorChatIntent;
  contentFocus: string | null;
}): string {
  const { context, contract, planner, intent, contentFocus } = params;

  return [
    "You are the writer for an X growth assistant.",
    "Write one high-quality assistant response package for the user.",
    intent === "ideate"
      ? "Return a short strategic response, 0-3 draft candidates, why the direction fits, and what to watch out for."
      : "Return a short strategic response, 1-3 concrete draft candidates, why they fit, and what to watch out for.",
    "The package must be directly useful, specific, and aligned to the deterministic contract.",
    "The user's native voice matters more than generic social-media best practices.",
    "The current user message style matters most when choosing how loose, casual, or clipped the output should feel.",
    "Mirror the user's actual tone, casing, looseness, and level of polish from the provided voice anchors.",
    "If the anchors are casual, lowercase, clipped, or slangy, keep that character in the drafts.",
    "Do not rewrite the user into polished consultant, corporate, or founder-bro language.",
    "Prefer concrete first-person observations and natural phrasing over generic engagement-bait questions.",
    "If the user gave you a concrete subject, keep that exact subject and wording family. Do not swap it for a generic adjacent topic.",
    "Do not introduce startup, investing, or business tropes unless they are clearly present in the user's request, niche, or anchors.",
    intent === "ideate"
      ? "Do not jump straight into finished posts unless the user explicitly asked for full copy. Prioritize 2-4 concrete, X-native angles written in the user's voice, and leave drafts empty."
      : "If the user is asking for drafting help, the draft candidates must read like actual X posts, not outlines.",
    intent === "ideate"
      ? "Each angle should feel like a believable post direction the user could actually say, not a generic instruction like 'share a recent win'."
      : "For draft mode, short punchy wording is better than explanatory filler. If a natural ending like 'thoughts?' fits, prefer that over a formal CTA.",
    `Generation mode: ${contract.mode}.`,
    `Target lane: ${planner.targetLane}.`,
    `Objective: ${planner.objective}.`,
    `Primary angle: ${planner.angle}.`,
    `Observed niche: ${context.creatorProfile.niche.primaryNiche}.`,
    `Target niche: ${context.creatorProfile.niche.targetNiche ?? "none"}.`,
    `Explicit content focus: ${contentFocus ?? "none"}.`,
    "Do not mention internal model fields unless useful to the user.",
    "Return only valid JSON that follows the provided schema.",
  ].join("\n");
}

function buildCriticSystemPrompt(params: {
  contract: CreatorGenerationContract;
  context: CreatorAgentContext;
  intent: CreatorChatIntent;
  contentFocus: string | null;
}): string {
  const { contract, context, intent, contentFocus } = params;

  return [
    "You are the critic for an X growth assistant.",
    "Review the candidate response package and either approve it or tighten it.",
    "Keep the final response concise, useful, and aligned to the deterministic checklist.",
    intent === "ideate"
      ? "If the user is still planning, keep the response focused on authentic angles, keep final drafts empty, and make the angles feel like something the user would naturally say."
      : "Keep the draft candidates sharp and usable as actual X posts.",
    "Reject drafts that sound more formal, generic, or polished than the user's real voice anchors.",
    "Reject drafts that read like empty engagement bait, forced binary questions, or generic startup advice unless the user clearly writes that way.",
    "Reject outputs that replace the user's concrete subject with a generic adjacent topic.",
    "The final drafts should feel like the user's own tone with stronger strategy, not a different person.",
    `Generation mode: ${contract.mode}.`,
    `Checklist: ${contract.critic.checklist.join(" | ")}`,
    `Readiness status: ${context.readiness.status}.`,
    `Explicit content focus: ${contentFocus ?? "none"}.`,
    "Return only valid JSON that follows the provided schema.",
  ].join("\n");
}

export async function generateCreatorChatReply(params: {
  runId: string;
  onboarding: OnboardingResult;
  userMessage: string;
  history?: ChatHistoryMessage[];
  provider?: ChatModelProvider;
  intent?: CreatorChatIntent;
  contentFocus?: string | null;
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
    intent: params.intent,
    contentFocus: params.contentFocus,
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
      `Task intent: ${params.intent ?? "draft"}`,
      `Explicit content focus: ${params.contentFocus ?? "none"}`,
      `Concrete subject from user request: ${
        extractConcreteSubject(params.userMessage) ?? "none"
      }`,
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
    system: buildWriterSystemPrompt({
      context,
      contract,
      planner,
      intent: params.intent ?? "draft",
      contentFocus: params.contentFocus ?? null,
    }),
    user: [
      `User request: ${params.userMessage}`,
      `Task intent: ${params.intent ?? "draft"}`,
      `Explicit content focus: ${params.contentFocus ?? "none"}`,
      `Concrete subject from user request: ${
        extractConcreteSubject(params.userMessage) ?? "none"
      }`,
      `Recent chat history:\n${historyText}`,
      `Voice profile:\n${formatVoiceProfile(context)}`,
      `Live request voice hints:\n${inferUserMessageVoiceHints(params.userMessage)}`,
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
        angles: {
          type: "array",
          items: { type: "string" },
          minItems: params.intent === "ideate" ? 2 : 0,
          maxItems: 4,
        },
        drafts: {
          type: "array",
          items: { type: "string" },
          minItems: 0,
          maxItems: 3,
        },
        supportAsset: { type: "string" },
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
      required: [
        "response",
        "angles",
        "drafts",
        "supportAsset",
        "whyThisWorks",
        "watchOutFor",
      ],
    },
  });

  params.onProgress?.("critic");
  const critic = await callProviderJson<CriticOutput>({
    provider,
    system: buildCriticSystemPrompt({
      contract,
      context,
      intent: params.intent ?? "draft",
      contentFocus: params.contentFocus ?? null,
    }),
    user: [
      `User request: ${params.userMessage}`,
      `Task intent: ${params.intent ?? "draft"}`,
      `Explicit content focus: ${params.contentFocus ?? "none"}`,
      `Concrete subject from user request: ${
        extractConcreteSubject(params.userMessage) ?? "none"
      }`,
      `Voice profile:\n${formatVoiceProfile(context)}`,
      `Live request voice hints:\n${inferUserMessageVoiceHints(params.userMessage)}`,
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
        finalAngles: {
          type: "array",
          items: { type: "string" },
          minItems: params.intent === "ideate" ? 2 : 0,
          maxItems: 4,
        },
        finalDrafts: {
          type: "array",
          items: { type: "string" },
          minItems: 0,
          maxItems: 3,
        },
        finalSupportAsset: { type: "string" },
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
        "finalAngles",
        "finalDrafts",
        "finalSupportAsset",
        "finalWhyThisWorks",
        "finalWatchOutFor",
        "issues",
      ],
    },
  });

  params.onProgress?.("finalizing");
  const intent = params.intent ?? "draft";

  return {
    reply: critic.finalResponse.trim() || writer.response.trim(),
    angles:
      intent === "ideate"
        ? sanitizeStringList(critic.finalAngles, 4, writer.angles)
        : [],
    drafts:
      intent === "ideate"
        ? []
        : sanitizeStringList(critic.finalDrafts, 3, writer.drafts),
    supportAsset:
      (critic.finalSupportAsset || writer.supportAsset).trim() || null,
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
