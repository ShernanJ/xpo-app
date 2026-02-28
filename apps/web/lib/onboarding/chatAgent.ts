import { buildCreatorAgentContext, type CreatorAgentContext } from "./agentContext";
import {
  buildDraftArtifacts,
  computeXWeightedCharacterCount,
  type DraftArtifactDetails,
} from "./draftArtifacts";
import {
  buildCreatorGenerationContract,
  type CreatorGenerationContract,
  type CreatorGenerationOutputShape,
} from "./generationContract";
import type {
  CreatorRepresentativePost,
  OnboardingResult,
  TonePreference,
} from "./types";

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

function coerceString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function coerceStringArray(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

function normalizePlannerOutput(
  value: PlannerOutput,
  fallback: CreatorGenerationContract,
): PlannerOutput {
  const targetLane =
    value?.targetLane === "original" ||
    value?.targetLane === "reply" ||
    value?.targetLane === "quote"
      ? value.targetLane
      : fallback.planner.targetLane;

  return {
    objective: coerceString(value?.objective, fallback.planner.objective),
    angle: coerceString(value?.angle, fallback.planner.primaryAngle),
    targetLane,
    mustInclude: coerceStringArray(value?.mustInclude, 4),
    mustAvoid: coerceStringArray(value?.mustAvoid, 4),
  };
}

function normalizeWriterOutput(value: WriterOutput): WriterOutput {
  return {
    response: coerceString(value?.response),
    angles: coerceStringArray(value?.angles, 4),
    drafts: coerceStringArray(value?.drafts, 6),
    supportAsset: coerceString(value?.supportAsset),
    whyThisWorks: coerceStringArray(value?.whyThisWorks, 3),
    watchOutFor: coerceStringArray(value?.watchOutFor, 3),
  };
}

function normalizeCriticOutput(
  value: CriticOutput,
  writerFallback: WriterOutput,
): CriticOutput {
  return {
    approved: typeof value?.approved === "boolean" ? value.approved : true,
    finalResponse: coerceString(value?.finalResponse, writerFallback.response),
    finalAngles: coerceStringArray(value?.finalAngles, 4),
    finalDrafts: coerceStringArray(value?.finalDrafts, 6),
    finalSupportAsset: coerceString(
      value?.finalSupportAsset,
      writerFallback.supportAsset,
    ),
    finalWhyThisWorks: coerceStringArray(value?.finalWhyThisWorks, 3),
    finalWatchOutFor: coerceStringArray(value?.finalWatchOutFor, 3),
    issues: coerceStringArray(value?.issues, 5),
  };
}

export type ChatModelProvider = "openai" | "groq";
type ChatModelStage = "planner" | "writer" | "critic";
export type CreatorChatIntent = "ideate" | "draft" | "review";
export type CreatorChatProgressPhase =
  | "planning"
  | "writing"
  | "critic"
  | "finalizing";

export type CreatorDraftArtifact = DraftArtifactDetails;

export interface CreatorChatDebugFormatExemplar {
  id: string;
  lane: CreatorRepresentativePost["lane"];
  text: string;
  selectionReason: string;
  goalFitScore: number;
}

export interface CreatorChatDebugEvidencePack {
  sourcePostIds: string[];
  entities: string[];
  metrics: string[];
  proofPoints: string[];
  storyBeats: string[];
  constraints: string[];
  requiredEvidenceCount: number;
}

export interface CreatorChatDebugInfo {
  formatExemplar: CreatorChatDebugFormatExemplar | null;
  evidencePack: CreatorChatDebugEvidencePack;
  formatBlueprint: string;
  formatSkeleton: string;
  outputShapeRationale: string;
}

export interface CreatorChatReplyResult {
  reply: string;
  angles: string[];
  drafts: string[];
  draftArtifacts: CreatorDraftArtifact[];
  supportAsset: string | null;
  outputShape: CreatorGenerationOutputShape | "ideation_angles";
  whyThisWorks: string[];
  watchOutFor: string[];
  debug: CreatorChatDebugInfo;
  source: ChatModelProvider | "deterministic";
  model: string | null;
  mode: CreatorGenerationContract["mode"];
}

interface RequestConditionedAnchors {
  topicAnchors: CreatorRepresentativePost[];
  laneAnchors: CreatorRepresentativePost[];
  formatAnchors: CreatorRepresentativePost[];
  formatExemplar: CreatorRepresentativePost | null;
  evidencePack: CreatorChatDebugEvidencePack;
}

interface FormatBlueprintProfile {
  minimumWords: number;
  minimumSections: number;
  prefersBulletCore: boolean;
  minimumProofSignals: number;
  preferConfidentClose: boolean;
}

interface LongFormContentSkeleton {
  introMode: "identity_intro" | "direct_thesis";
  hasContextBeat: boolean;
  hasProofBlock: boolean;
  hasTurningPoint: boolean;
  hasLesson: boolean;
  closeMode: "confident" | "question";
}

interface ModelProviderConfig {
  provider: ChatModelProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
}

const ACRONYM_CASE_MAP = new Map<string, string>([
  ["ai", "AI"],
  ["api", "API"],
  ["cpu", "CPU"],
  ["gpu", "GPU"],
  ["http", "HTTP"],
  ["https", "HTTPS"],
  ["json", "JSON"],
  ["oauth", "OAuth"],
  ["sql", "SQL"],
  ["url", "URL"],
  ["urls", "URLs"],
]);

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
  selectedAngle?: string | null;
}): Omit<CreatorChatReplyResult, "source" | "model" | "mode"> {
  const { context, contract } = params;
  const fallbackFormatExemplar = pickFormatExemplar({
    context,
    contract,
  });
  const fallbackEvidencePack = buildEvidencePack({
    formatExemplar: fallbackFormatExemplar,
    topicAnchors: context.positiveAnchors.slice(0, 2),
  });
  const fallbackFormatBlueprint = buildFormatBlueprint({
    post: fallbackFormatExemplar,
    outputShape: contract.planner.outputShape,
  });
  const fallbackFormatSkeleton = formatLongFormSkeleton(
    buildLongFormContentSkeleton(fallbackFormatExemplar),
  );
  const debugInfo: CreatorChatDebugInfo = {
    formatExemplar: buildFormatExemplarDebug(fallbackFormatExemplar),
    evidencePack: fallbackEvidencePack,
    formatBlueprint: fallbackFormatBlueprint,
    formatSkeleton: fallbackFormatSkeleton,
    outputShapeRationale: contract.planner.outputShapeRationale,
  };

  if (contract.mode === "analysis_only") {
    return {
      reply: `The model is still in analysis mode. ${context.readiness.reasons[0] ?? "The current sample is not strong enough for reliable drafting yet."}`,
      angles: [],
      drafts: [],
      draftArtifacts: [],
      supportAsset: null,
      outputShape: contract.planner.outputShape,
      whyThisWorks: [],
      watchOutFor: [
        "Wait for the sample to deepen before relying on generated drafts.",
      ],
      debug: debugInfo,
    };
  }

  if (params.intent === "ideate") {
    const focus = params.contentFocus?.trim() || "the next content lane";
    const proofSeed =
      fallbackEvidencePack.proofPoints[0] ||
      fallbackEvidencePack.metrics[0] ||
      fallbackEvidencePack.storyBeats[0] ||
      null;
    const secondarySeed =
      fallbackEvidencePack.proofPoints[1] ||
      fallbackEvidencePack.constraints[0] ||
      fallbackEvidencePack.entities[0] ||
      null;

    return {
      reply:
        fallbackEvidencePack.requiredEvidenceCount > 0
          ? `Focus on ${focus}, but keep it anchored to something real you've already proven. Start from the strongest concrete proof point, then choose the angle that makes that evidence impossible to ignore.`
          : `Focus on ${focus} first. Do not force a polished post yet. Pick 2-3 specific angles you could talk about naturally, then choose the one that best proves something real about you.`,
      angles: uniqueEvidenceStrings(
        [
          proofSeed
            ? `the operator lesson hidden inside: ${proofSeed}`
            : "",
          secondarySeed
            ? `why ${secondarySeed} matters more than generic ${focus} advice`
            : "",
          fallbackEvidencePack.storyBeats[0]
            ? `${fallbackEvidencePack.storyBeats[0]} -> the lesson most people would miss`
            : "",
          fallbackEvidencePack.entities[0] && fallbackEvidencePack.metrics[0]
            ? `${fallbackEvidencePack.entities[0]} + ${fallbackEvidencePack.metrics[0]} is the proof. build the post around that.`
            : "",
          `what is the concrete proof behind ${focus}? use that instead of generic advice.`,
        ],
        4,
      ).map((angle) => loosenDraftText(angle, contract)),
      drafts: [],
      draftArtifacts: [],
      supportAsset:
        fallbackEvidencePack.metrics.length > 0 || fallbackEvidencePack.proofPoints.length > 0
          ? "Use the exact screenshot, metric, or artifact that proves the strongest evidence point."
          : "Use a real screenshot, short demo clip, or a product link only if it helps prove the point.",
      outputShape: "ideation_angles",
      whyThisWorks: [
        "It separates planning from final post writing.",
        fallbackEvidencePack.requiredEvidenceCount > 0
          ? "It keeps ideation anchored to real proof from the creator's existing posts instead of generic advice."
          : "It keeps the next move anchored to a specific content focus instead of generic posting advice.",
      ],
      watchOutFor: [
        "Avoid placeholder hooks and generic engagement bait.",
        "Start from a real project, observation, or technical detail.",
      ],
      debug: debugInfo,
    };
  }

  const topHook = contract.planner.suggestedHookPatterns[0]
    ? formatEnumLabel(contract.planner.suggestedHookPatterns[0])
    : "Statement Open";
  const topType = contract.planner.suggestedContentTypes[0]
    ? formatEnumLabel(contract.planner.suggestedContentTypes[0])
    : "Single Line";

  const fallbackDrafts = uniqueEvidenceStrings(
    [
      [
        params.selectedAngle?.trim() || params.userMessage,
        fallbackEvidencePack.proofPoints[0],
        fallbackEvidencePack.metrics[0],
        fallbackEvidencePack.constraints[0],
      ]
        .filter(Boolean)
        .join("\n\n"),
      [
        fallbackEvidencePack.storyBeats[0],
        fallbackEvidencePack.proofPoints[1] || fallbackEvidencePack.proofPoints[0],
        fallbackEvidencePack.metrics[1] || fallbackEvidencePack.metrics[0],
        "the point is in the proof, not the generic advice",
      ]
        .filter(Boolean)
        .join("\n\n"),
    ],
    2,
  ).map((draft) => loosenDraftText(draft, contract));

  return {
    reply: fallbackEvidencePack.requiredEvidenceCount > 0
      ? `Use the ${formatEnumLabel(
          contract.planner.targetLane,
        )} lane, but ground it in the creator's actual proof instead of generic strategy language. Build around: ${fallbackEvidencePack.proofPoints[0] || fallbackEvidencePack.metrics[0] || params.userMessage}`
      : `Use the ${formatEnumLabel(
          contract.planner.targetLane,
        )} lane for "${params.userMessage}". Lead with a ${topHook} opener, structure it as ${topType}, and stay anchored to: ${contract.planner.primaryAngle}`,
    angles: [],
    drafts: fallbackDrafts.length > 0
      ? fallbackDrafts
      : [
          params.selectedAngle?.trim() || `${topHook}: ${contract.planner.primaryAngle}`,
          `${topType} version: ${
            params.selectedAngle?.trim() || params.userMessage
          }`,
        ].map((draft) => loosenDraftText(draft, contract)),
    draftArtifacts: buildDraftArtifacts({
      drafts:
        fallbackDrafts.length > 0
          ? fallbackDrafts
          : [
              params.selectedAngle?.trim() || `${topHook}: ${contract.planner.primaryAngle}`,
              `${topType} version: ${
                params.selectedAngle?.trim() || params.userMessage
              }`,
            ].map((draft) => loosenDraftText(draft, contract)),
      outputShape: contract.planner.outputShape,
      supportAsset:
        fallbackEvidencePack.metrics.length > 0 || fallbackEvidencePack.proofPoints.length > 0
          ? "Attach the real screenshot, metric, or artifact that proves the strongest evidence point."
          : "If you mention a product or project, attach a screenshot or quick demo instead of a generic link.",
    }),
    supportAsset:
      fallbackEvidencePack.metrics.length > 0 || fallbackEvidencePack.proofPoints.length > 0
        ? "Attach the real screenshot, metric, or artifact that proves the strongest evidence point."
        : "If you mention a product or project, attach a screenshot or quick demo instead of a generic link.",
    outputShape: contract.planner.outputShape,
    whyThisWorks: [
      fallbackEvidencePack.requiredEvidenceCount > 0
        ? "It grounds the draft in concrete evidence already present in the creator's posts."
        : "It stays inside the deterministic lane, hook, and angle constraints.",
      "It keeps the draft aligned to the strongest current strategy signal.",
    ],
    watchOutFor: [
      contract.writer.mustAvoid[0] ?? "Avoid broad generic phrasing.",
      plannerSafeConstraint(contract.planner.blockedReasons[0]),
    ].filter(Boolean),
    debug: debugInfo,
  };
}

export function buildDeterministicCreatorChatReply(params: {
  runId: string;
  onboarding: OnboardingResult;
  tonePreference?: TonePreference | null;
  userMessage: string;
  intent?: CreatorChatIntent;
  contentFocus?: string | null;
  selectedAngle?: string | null;
}): CreatorChatReplyResult {
  const context = buildCreatorAgentContext({
    runId: params.runId,
    onboarding: params.onboarding,
  });
  const contract = buildCreatorGenerationContract({
    runId: params.runId,
    onboarding: params.onboarding,
    tonePreference: params.tonePreference ?? null,
  });
  const fallback = buildDeterministicFallback({
    context,
    contract,
    userMessage: params.userMessage,
    intent: params.intent,
    contentFocus: params.contentFocus,
    selectedAngle: params.selectedAngle ?? null,
  });

  return {
    ...fallback,
    source: "deterministic",
    model: null,
    mode: contract.mode,
  };
}

function plannerSafeConstraint(value: string | undefined): string {
  return value?.trim() || "";
}

function buildFormatExemplarDebug(
  post: CreatorRepresentativePost | null,
): CreatorChatDebugFormatExemplar | null {
  if (!post) {
    return null;
  }

  return {
    id: post.id,
    lane: post.lane,
    text: post.text,
    selectionReason: post.selectionReason,
    goalFitScore: post.goalFitScore,
  };
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

function resolveStageProviderPreference(
  stage: ChatModelStage,
  preferredProvider?: ChatModelProvider,
): ChatModelProvider {
  const envKey = `CHAT_${stage.toUpperCase()}_PROVIDER` as const;
  const envPreference = process.env[envKey]?.trim().toLowerCase();

  if (envPreference === "openai" || envPreference === "groq") {
    return envPreference;
  }

  return preferredProvider ?? "groq";
}

function buildProviderConfig(
  provider: ChatModelProvider,
  stage: ChatModelStage,
): ModelProviderConfig | null {
  if (provider === "groq") {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      return null;
    }

    const stageModelKey = `GROQ_${stage.toUpperCase()}_MODEL` as const;

    return {
      provider: "groq",
      apiKey,
      model:
        process.env[stageModelKey]?.trim() ||
        process.env.GROQ_MODEL?.trim() ||
        "llama-3.1-8b-instant",
      baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const stageModelKey = `OPENAI_${stage.toUpperCase()}_MODEL` as const;

  return {
    provider: "openai",
    apiKey,
    model:
      process.env[stageModelKey]?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      "gpt-4.1-mini",
    baseUrl: "https://api.openai.com/v1/chat/completions",
  };
}

function resolveProviderConfig(
  stage: ChatModelStage,
  preferredProvider?: ChatModelProvider,
): ModelProviderConfig | null {
  const preferred = resolveStageProviderPreference(stage, preferredProvider);
  const primary = buildProviderConfig(preferred, stage);
  if (primary) {
    return primary;
  }

  const fallbackProvider: ChatModelProvider =
    preferred === "groq" ? "openai" : "groq";

  return buildProviderConfig(fallbackProvider, stage);
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
    `Required output shape: ${contract.planner.outputShape}.`,
    "If the user wants ideas, plan in concrete post premises, not content-marketing category labels.",
    "When strong retrieved evidence exists, keep the plan anchored to those real facts instead of abstracting into generic domain advice.",
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

function scoreRetrievedAnchor(params: {
  post: CreatorRepresentativePost;
  signalTerms: string[];
  preferredLane: CreatorGenerationContract["planner"]["targetLane"];
  outputShape: CreatorGenerationOutputShape;
}): {
  topicScore: number;
  laneScore: number;
  formatScore: number;
} {
  const text = params.post.text;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const hasStructure = /\n|^- /m.test(text) ? 1 : 0;
  const matchingTerms = params.signalTerms.filter((term) =>
    new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
      text,
    ),
  ).length;
  const proofBonus =
    hasProofSignal(text) || /\b(arr|users|team|engineers|profit|scale)\b/i.test(text)
      ? 1.5
      : 0;
  const laneBonus = params.post.lane === params.preferredLane ? 3 : 0;
  let formatBonus = 0;

  if (
    params.outputShape === "long_form_post" ||
    params.outputShape === "thread_seed"
  ) {
    formatBonus += hasStructure ? 4 : 0;
    formatBonus += wordCount >= 120 ? 4 : wordCount >= 80 ? 2 : wordCount >= 50 ? 1 : -3;
  } else {
    formatBonus += wordCount <= 40 ? 2 : wordCount <= 70 ? 0.5 : -2;
  }

  return {
    topicScore:
      matchingTerms * 3 + params.post.goalFitScore * 0.25 + proofBonus + laneBonus * 0.5,
    laneScore:
      laneBonus + matchingTerms * 1.5 + params.post.goalFitScore * 0.2 + proofBonus,
    formatScore:
      formatBonus + matchingTerms * 2 + params.post.goalFitScore * 0.25 + laneBonus + proofBonus,
  };
}

function selectRequestConditionedAnchors(params: {
  context: CreatorAgentContext;
  contract: CreatorGenerationContract;
  userMessage: string;
  concreteSubject: string | null;
  selectedAngle: string | null;
  contentFocus: string | null;
}): RequestConditionedAnchors {
  const pool = params.context.positiveAnchors;

  if (pool.length === 0) {
    return {
      topicAnchors: [],
      laneAnchors: [],
      formatAnchors: [],
      formatExemplar: null,
      evidencePack: buildEvidencePack({
        formatExemplar: null,
        topicAnchors: [],
      }),
    };
  }

  const signalTerms = Array.from(
    new Set([
      ...collectSignalTerms(params.selectedAngle),
      ...collectSignalTerms(params.concreteSubject),
      ...collectSignalTerms(params.contentFocus),
      ...collectSignalTerms(params.userMessage),
    ]),
  );

  const scored = pool.map((post) => ({
    post,
    ...scoreRetrievedAnchor({
      post,
      signalTerms,
      preferredLane: params.contract.planner.targetLane,
      outputShape: params.contract.planner.outputShape,
    }),
  }));

  const topicAnchors = [...scored]
    .sort((left, right) => right.topicScore - left.topicScore)
    .slice(0, 4)
    .map((item) => item.post);

  const laneAnchors = [...scored]
    .sort((left, right) => right.laneScore - left.laneScore)
    .slice(0, 3)
    .map((item) => item.post);

  const formatAnchors = [...scored]
    .sort((left, right) => right.formatScore - left.formatScore)
    .slice(0, 2)
    .map((item) => item.post);
  const formatExemplar =
    formatAnchors[0] ??
    pickFormatExemplar({
      context: params.context,
      contract: params.contract,
    });

  return {
    topicAnchors,
    laneAnchors,
    formatAnchors,
    formatExemplar,
    evidencePack: buildEvidencePack({
      formatExemplar,
      topicAnchors,
    }),
  };
}

function pickFormatExemplar(params: {
  context: CreatorAgentContext;
  contract: CreatorGenerationContract;
}): CreatorRepresentativePost | null {
  const preferredLane = params.contract.planner.targetLane;
  const anchors =
    params.context.positiveAnchors.filter((post) => post.lane === preferredLane)
      .length > 0
      ? params.context.positiveAnchors.filter((post) => post.lane === preferredLane)
      : params.context.positiveAnchors;

  if (anchors.length === 0) {
    return null;
  }

  const scored = [...anchors].sort((left, right) => {
    const leftWordCount = left.text.split(/\s+/).filter(Boolean).length;
    const rightWordCount = right.text.split(/\s+/).filter(Boolean).length;
    const leftHasStructure = /\n|^- /m.test(left.text) ? 1 : 0;
    const rightHasStructure = /\n|^- /m.test(right.text) ? 1 : 0;

    if (
      params.contract.planner.outputShape === "long_form_post" ||
      params.contract.planner.outputShape === "thread_seed"
    ) {
      return (
        rightHasStructure - leftHasStructure ||
        rightWordCount - leftWordCount ||
        right.goalFitScore - left.goalFitScore
      );
    }

    return (
      leftWordCount - rightWordCount ||
      right.goalFitScore - left.goalFitScore
    );
  });

  return scored[0] ?? null;
}

function selectLaneVoiceAnchors(
  context: CreatorAgentContext,
  targetLane: CreatorGenerationContract["planner"]["targetLane"],
): CreatorRepresentativePost[] {
  if (targetLane === "reply") {
    return context.creatorProfile.examples.replyVoiceAnchors.length > 0
      ? context.creatorProfile.examples.replyVoiceAnchors
      : context.creatorProfile.examples.voiceAnchors;
  }

  if (targetLane === "quote") {
    return context.creatorProfile.examples.quoteVoiceAnchors.length > 0
      ? context.creatorProfile.examples.quoteVoiceAnchors
      : context.creatorProfile.examples.voiceAnchors;
  }

  return context.creatorProfile.examples.voiceAnchors;
}

function dedupeRepresentativePosts(
  posts: CreatorRepresentativePost[],
): CreatorRepresentativePost[] {
  const seen = new Set<string>();

  return posts.filter((post) => {
    if (seen.has(post.id)) {
      return false;
    }

    seen.add(post.id);
    return true;
  });
}

function selectPinnedVoiceAnchors(
  context: CreatorAgentContext,
  pinnedReferencePostIds: string[],
): CreatorRepresentativePost[] {
  if (pinnedReferencePostIds.length === 0) {
    return [];
  }

  const candidates = dedupeRepresentativePosts([
    ...context.creatorProfile.examples.voiceAnchors,
    ...context.creatorProfile.examples.replyVoiceAnchors,
    ...context.creatorProfile.examples.quoteVoiceAnchors,
    ...context.creatorProfile.examples.strategyAnchors,
    ...context.creatorProfile.examples.goalAnchors,
    ...context.creatorProfile.examples.bestPerforming,
  ]);
  const candidateMap = new Map(candidates.map((post) => [post.id, post]));

  return pinnedReferencePostIds
    .map((id) => candidateMap.get(id) ?? null)
    .filter((post): post is CreatorRepresentativePost => post !== null);
}

function mergeVoiceAnchors(
  primary: CreatorRepresentativePost[],
  secondary: CreatorRepresentativePost[],
  limit = 4,
): CreatorRepresentativePost[] {
  return dedupeRepresentativePosts([...primary, ...secondary]).slice(0, limit);
}

function formatExemplar(post: CreatorRepresentativePost | null): string {
  if (!post) {
    return "No strong format exemplar available.";
  }

  return `${post.id} (${post.selectionReason}) -> ${post.text}`;
}

function uniqueEvidenceStrings(values: string[], limit: number): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.replace(/\s+/g, " ").trim())
        .filter((value) => value.length > 0),
    ),
  ).slice(0, limit);
}

function extractEvidenceLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

function extractEvidenceEntities(text: string): string[] {
  const entities: string[] = [];

  for (const mention of text.match(/@\w+/g) ?? []) {
    entities.push(mention);
  }

  for (const match of text.matchAll(/\b(?:[A-Z][A-Za-z0-9$+/.-]*)(?:\s+[A-Z][A-Za-z0-9$+/.-]*){0,3}\b/g)) {
    const candidate = match[0].trim();
    if (candidate.length < 3) {
      continue;
    }
    if (/^(I|If|And|But|The|This|That|What|How|Why|When|Here)$/i.test(candidate)) {
      continue;
    }
    entities.push(candidate);
  }

  return uniqueEvidenceStrings(entities, 8);
}

function buildEvidencePack(params: {
  formatExemplar: CreatorRepresentativePost | null;
  topicAnchors: CreatorRepresentativePost[];
}): CreatorChatDebugEvidencePack {
  const sourcePosts = dedupeRepresentativePosts(
    [
      params.formatExemplar,
      ...params.topicAnchors.slice(0, 2),
    ].filter((post): post is CreatorRepresentativePost => post !== null),
  );
  const allLines = sourcePosts.flatMap((post) => extractEvidenceLines(post.text));
  const metricLines = allLines.filter((line) => /\d/.test(line));
  const proofLines = allLines.filter((line) =>
    /\d/.test(line) ||
    /\b(built|build|hit|processed|grew|launched|shipped|power|scaled|profitable|used|reached)\b/i.test(
      line,
    ),
  );
  const storyLines = allLines.filter((line) =>
    /\b(i|i'm|i’ve|i've|my|me)\b/i.test(line),
  );
  const constraintLines = allLines.filter((line) =>
    /\b(with|without|less than|instead of|not more|small team|only|under|<)\b/i.test(
      line,
    ),
  );
  const entities = uniqueEvidenceStrings(
    sourcePosts.flatMap((post) => extractEvidenceEntities(post.text)),
    8,
  );
  const metrics = uniqueEvidenceStrings(metricLines, 6);
  const proofPoints = uniqueEvidenceStrings(proofLines, 6);
  const storyBeats = uniqueEvidenceStrings(storyLines, 4);
  const constraints = uniqueEvidenceStrings(constraintLines, 4);

  return {
    sourcePostIds: sourcePosts.map((post) => post.id),
    entities,
    metrics,
    proofPoints,
    storyBeats,
    constraints,
    requiredEvidenceCount:
      metrics.length >= 2 || proofPoints.length >= 3
        ? 2
        : metrics.length > 0 || proofPoints.length > 0 || entities.length > 0
          ? 1
          : 0,
  };
}

function formatEvidencePack(evidencePack: CreatorChatDebugEvidencePack): string {
  if (
    evidencePack.entities.length === 0 &&
    evidencePack.metrics.length === 0 &&
    evidencePack.proofPoints.length === 0 &&
    evidencePack.storyBeats.length === 0 &&
    evidencePack.constraints.length === 0
  ) {
    return "No strong concrete evidence pack available.";
  }

  return [
    `Source posts: ${evidencePack.sourcePostIds.join(" | ") || "none"}`,
    `Entities: ${evidencePack.entities.join(" | ") || "none"}`,
    `Metrics: ${evidencePack.metrics.join(" | ") || "none"}`,
    `Proof points: ${evidencePack.proofPoints.join(" | ") || "none"}`,
    `Story beats: ${evidencePack.storyBeats.join(" | ") || "none"}`,
    `Constraints: ${evidencePack.constraints.join(" | ") || "none"}`,
    `Required evidence count: ${evidencePack.requiredEvidenceCount}`,
  ].join("\n");
}

function countEvidenceCoverage(
  text: string,
  evidencePack: CreatorChatDebugEvidencePack | undefined,
): {
  entityMatches: number;
  metricMatches: number;
  proofMatches: number;
  total: number;
} {
  if (!evidencePack) {
    return {
      entityMatches: 0,
      metricMatches: 0,
      proofMatches: 0,
      total: 0,
    };
  }

  const lowered = text.toLowerCase();
  const entityMatches = evidencePack.entities.filter((entity) =>
    collectSignalTerms(entity).some(
      (term) =>
        term.length >= 3 &&
        new RegExp(
          `\\b${term.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`,
          "i",
        ).test(text),
    ),
  ).length;
  const metricMatches = evidencePack.metrics.filter((metric) =>
    (metric.match(/[$<]?\d[\d,.]*(?:[kKmMbByY]|%|x)?(?:\/[A-Za-z]+)?/g) ?? []).some(
      (token) => token.length >= 2 && lowered.includes(token.toLowerCase()),
    ),
  ).length;
  const proofMatches = evidencePack.proofPoints.filter((point) =>
    collectSignalTerms(point).some(
      (term) =>
        term.length >= 3 &&
        new RegExp(
          `\\b${term.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`,
          "i",
        ).test(text),
    ),
  ).length;

  return {
    entityMatches,
    metricMatches,
    proofMatches,
    total: entityMatches + metricMatches + proofMatches,
  };
}

function countProofSignals(text: string): number {
  return text.match(/\b\d[\d,.%$kKmMbByY<>+/:-]*\b/g)?.length ?? 0;
}

function countStructuralSections(text: string): number {
  const sections = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (sections.length > 0) {
    return sections.length;
  }

  const paragraphs = text
    .split(/(?:\.\s+|\?\s+|!\s+)/)
    .map((part) => part.trim())
    .filter(Boolean);

  return paragraphs.length;
}

function buildFormatBlueprintProfile(params: {
  post: CreatorRepresentativePost | null;
  outputShape: CreatorGenerationOutputShape;
}): FormatBlueprintProfile {
  const { post, outputShape } = params;

  if (outputShape !== "long_form_post" && outputShape !== "thread_seed") {
    return {
      minimumWords: 18,
      minimumSections: 1,
      prefersBulletCore: false,
      minimumProofSignals: 0,
      preferConfidentClose: false,
    };
  }

  if (!post) {
    return {
      minimumWords: outputShape === "long_form_post" ? 90 : 45,
      minimumSections: outputShape === "long_form_post" ? 4 : 3,
      prefersBulletCore: false,
      minimumProofSignals: 1,
      preferConfidentClose: true,
    };
  }

  const lines = post.text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const wordCount = post.text.split(/\s+/).filter(Boolean).length;
  const bulletLines = lines.filter((line) => /^[-*•]\s|^\d+\./.test(line)).length;
  const proofSignals = countProofSignals(post.text);

  const minimumWords =
    outputShape === "long_form_post"
      ? Math.max(90, Math.min(260, Math.floor(wordCount * 0.55)))
      : Math.max(40, Math.min(140, Math.floor(wordCount * 0.45)));
  const minimumSections =
    outputShape === "long_form_post"
      ? Math.max(4, Math.min(10, lines.length > 0 ? lines.length - 1 : 4))
      : Math.max(3, Math.min(8, lines.length > 0 ? Math.max(3, lines.length - 1) : 3));

  return {
    minimumWords,
    minimumSections,
    prefersBulletCore: bulletLines >= 2,
    minimumProofSignals: Math.max(1, Math.min(4, proofSignals > 0 ? proofSignals : 1)),
    preferConfidentClose: !/\?\s*$/.test(post.text.trim()),
  };
}

function buildFormatBlueprint(params: {
  post: CreatorRepresentativePost | null;
  outputShape: CreatorGenerationOutputShape;
}): string {
  const { post, outputShape } = params;

  if (!post) {
    return "No strong structural blueprint available.";
  }

  const blueprintProfile = buildFormatBlueprintProfile({
    post,
    outputShape,
  });

  const lines = post.text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const wordCount = post.text.split(/\s+/).filter(Boolean).length;
  const bulletLines = lines.filter((line) => /^[-*•]\s|^\d+\./.test(line)).length;
  const numberedFacts =
    post.text.match(/\b\d[\d,.%$kKmMbByY<>+/:-]*\b/g)?.length ?? 0;
  const hasIdentityIntro =
    /(?:^|\n)i(?:'m| am)\b.{0,60}\b(founder|builder|cto|ceo|engineer)\b/i.test(
      post.text,
    );
  const hasManifestoSection =
    /here'?s what i(?:'ll| will) be posting about|here'?s what i(?:'m| am) focused on|my goal for\b/i.test(
      post.text,
    );
  const hasOriginStory =
    /\b(i grew up|when i first|years later|immigrat|small town|cold .+ winter)\b/i.test(
      post.text,
    );
  const hasContrarianFrame =
    /\b(ignore|ignoring|wrong|unlearn|less, not more|delete 80%|founder traps)\b/i.test(
      post.text,
    );
  const hasConfidentClose = !/\?\s*$/.test(post.text.trim());

  return [
    outputShape === "long_form_post" || outputShape === "thread_seed"
      ? "Use a developed long-form authority shape, not a tweet-sized answer."
      : "Keep the structure compact and direct.",
    `Exemplar-derived minimums: at least ${blueprintProfile.minimumWords} words and ${blueprintProfile.minimumSections} clear sections.`,
    hasIdentityIntro
      ? "Open by grounding the reader in who the creator is or what they do."
      : "Open with a clear thesis, not a question.",
    bulletLines > 0
      ? `Use a bullet-led core section (${bulletLines} bullet beats in the exemplar).`
      : lines.length >= 4 || wordCount >= 80
        ? `Use multiple short sections (${Math.max(lines.length, 3)} beats), not one flat paragraph.`
        : "Use at least 3 clear beats if you are writing long form.",
    numberedFacts > 0
      ? `Carry concrete proof. The exemplar uses ${numberedFacts} numeric or metric signals; target at least ${blueprintProfile.minimumProofSignals}.`
      : "Include at least one concrete proof point, artifact, or operating detail.",
    hasContrarianFrame
      ? "Include one strong contrarian belief or anti-best-practice statement."
      : "Make one clear point of view explicit.",
    hasManifestoSection
      ? "If it fits, include an explicit promise, framework, or 'here's what I'm posting about' section."
      : "",
    hasOriginStory
      ? "Use one short lived-context or backstory beat to add weight."
      : "",
    hasConfidentClose
      ? "Prefer a confident closing statement over a forced question ending."
      : "If you end with a question, only do it after a fully developed thesis.",
    blueprintProfile.prefersBulletCore
      ? "The core should include a bullet-led section, not just flat paragraphs."
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildLongFormContentSkeleton(
  post: CreatorRepresentativePost | null,
): LongFormContentSkeleton {
  if (!post) {
    return {
      introMode: "direct_thesis",
      hasContextBeat: false,
      hasProofBlock: false,
      hasTurningPoint: true,
      hasLesson: true,
      closeMode: "confident",
    };
  }

  const lines = post.text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = lines[0] ?? "";
  const introMode =
    /\b(i(?:'m| am)|founder|builder|cto|ceo|engineer)\b/i.test(firstLine)
      ? "identity_intro"
      : "direct_thesis";
  const hasContextBeat =
    hasLongFormContextBeat(post.text) ||
    lines.some((line) => hasLongFormContextBeat(line));
  const hasProofBlock =
    lines.filter((line) => /^[-*•]\s|^\d+\./.test(line)).length > 0 ||
    countProofSignals(post.text) >= 2;
  const hasTurningPoint = hasLongFormTurningPoint(post.text);
  const hasLesson = hasLongFormLesson(post.text);

  return {
    introMode,
    hasContextBeat,
    hasProofBlock,
    hasTurningPoint,
    hasLesson,
    closeMode: /\?\s*$/.test(post.text.trim()) ? "question" : "confident",
  };
}

function hasLongFormContextBeat(text: string): boolean {
  return /\b(i grew up|when i first|years later|small town|immigrat|winter|walked|moved)\b/i.test(
    text,
  );
}

function hasLongFormTurningPoint(text: string): boolean {
  return /\bbut\b|\bhowever\b|\bi realized\b|\bthat changed\b|\bthe thing is\b/i.test(
    text,
  );
}

function hasLongFormLesson(text: string): boolean {
  return /\bhere'?s what\b|\bthe lesson\b|\bwhat i learned\b|\bthe point is\b|\bthat arc\b|\bthat'?s why\b|\bif you ask me\b|\bmy goal\b/i.test(
    text,
  );
}

function formatLongFormSkeleton(skeleton: LongFormContentSkeleton): string {
  return [
    skeleton.introMode === "identity_intro"
      ? "Open by grounding the reader in who the creator is or what they do."
      : "Open with a direct thesis, not an identity bio.",
    skeleton.hasContextBeat
      ? "Include one short lived-context or backstory beat."
      : "Context is optional; do not force a backstory beat.",
    skeleton.hasProofBlock
      ? "Use a concrete proof block in the middle (bullets or distinct proof beats)."
      : "Use at least one concrete proof beat, even if not a full bullet block.",
    skeleton.hasTurningPoint
      ? "Include a turning-point or contrast beat that pivots the post."
      : "Keep the progression linear unless a turning point is natural.",
    skeleton.hasLesson
      ? "Land on a clear lesson, principle, or explicit takeaway."
      : "Make the lesson explicit even if the exemplar implied it.",
    skeleton.closeMode === "confident"
      ? "Close with a confident statement, not a trailing question."
      : "A question close is acceptable only after the full thesis and proof are established.",
  ].join(" ");
}

function matchesLongFormSkeleton(
  draft: string,
  skeleton: LongFormContentSkeleton,
): boolean {
  const trimmed = draft.trim();
  if (!trimmed) {
    return false;
  }

  const lines = trimmed
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = lines[0] ?? "";
  const hasBulletBlock = lines.some((line) => /^[-*•]\s|^\d+\./.test(line));
  const proofSignals = countProofSignals(trimmed);

  if (
    skeleton.introMode === "identity_intro" &&
    !/\b(i(?:'m| am)|founder|builder|cto|ceo|engineer)\b/i.test(firstLine)
  ) {
    return false;
  }

  if (skeleton.hasContextBeat && !hasLongFormContextBeat(trimmed)) {
    return false;
  }

  if (skeleton.hasProofBlock && !hasBulletBlock && proofSignals < 2) {
    return false;
  }

  if (skeleton.hasTurningPoint && !hasLongFormTurningPoint(trimmed)) {
    return false;
  }

  if (skeleton.hasLesson && !hasLongFormLesson(trimmed)) {
    return false;
  }

  if (skeleton.closeMode === "confident" && /\?\s*$/.test(trimmed)) {
    return false;
  }

  if (skeleton.closeMode === "question" && !/\?\s*$/.test(trimmed)) {
    return false;
  }

  return true;
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

function buildFormFactorGuidance(
  context: CreatorAgentContext,
  intent: CreatorChatIntent,
): string[] {
  const isLongFormAuthority =
    context.creatorProfile.identity.isVerified ||
    context.creatorProfile.voice.averageLengthBand === "long" ||
    context.creatorProfile.playbook.cadence.threadBias === "high";

  if (isLongFormAuthority) {
    return [
      "This creator can support longer-form, thesis-led X posts.",
      "Prefer strong point-of-view, specific claims, concrete numbers, and multi-line structure when useful.",
      "Do not default to shallow reply-bait or generic questions at the end. A confident closing statement is often stronger.",
      intent === "ideate"
        ? "Angles should read like concrete theses, founder lessons, or sharp stances, not beginner prompts."
        : "At least one draft can be longer and more structured if that better matches the creator's actual style.",
    ];
  }

  if (
    context.creatorProfile.voice.primaryCasing === "lowercase" ||
    context.creatorProfile.voice.lowercaseSharePercent >= 60
  ) {
    return [
      "Prefer clipped lowercase wording, loose syntax, and casual internet-native phrasing.",
      "Short blunt lines are better than polished explanatory copy.",
      context.creatorProfile.voice.questionPostRate <= 20
        ? "Only use a closer like 'thoughts?' if it fits naturally. Do not force a question ending."
        : "A simple closer like 'thoughts?' can work if it sounds natural.",
    ];
  }

  return [
    "Match the creator's observed sentence length and structure instead of forcing a default platform style.",
    "Do not force a question ending if the creator does not naturally write that way.",
  ];
}

function buildOutputShapeGuidance(
  outputShape: CreatorGenerationOutputShape,
  intent: CreatorChatIntent,
): string[] {
  if (intent === "ideate") {
    return [
      "For ideation, return angles only. Do not return finished drafts.",
      "Angles should still reflect the preferred output shape the creator is best suited for.",
    ];
  }

  switch (outputShape) {
    case "reply_candidate":
      return [
        "Return compact reply-sized drafts only.",
        "Each draft should feel conversational and naturally continue someone else's thread.",
      ];
    case "quote_candidate":
      return [
        "Return quote-friendly drafts that still stand on their own as a clear take.",
        "The draft should be concise enough to work as commentary on another post.",
      ];
    case "thread_seed":
      return [
        "Return stronger thesis-led drafts that can expand into a thread.",
        "At least one draft should use multi-line structure or bullet beats instead of a one-line question.",
      ];
    case "long_form_post":
      return [
        "Return longer-form drafts with a clear thesis, proof, and stronger point of view.",
        "At least one draft should be structured as an intro plus bullets or distinct paragraphs, not a single shallow question.",
        "Do not force a shallow question ending when a confident close is stronger.",
        "Do not keep these at tweet length. Long-form drafts should usually be well beyond 280 weighted characters and feel meaningfully developed.",
      ];
    case "short_form_post":
    default:
      return [
        "Return short, punchy standalone drafts.",
        "One concrete thought is better than a polished mini-essay.",
      ];
  }
}

function buildWriterSystemPrompt(params: {
  context: CreatorAgentContext;
  contract: CreatorGenerationContract;
  planner: PlannerOutput;
  intent: CreatorChatIntent;
  contentFocus: string | null;
  selectedAngle: string | null;
  concreteSubject: string | null;
  userMessage: string;
  requestAnchors: RequestConditionedAnchors;
  pinnedVoiceAnchorCount: number;
}): string {
  const {
    context,
    contract,
    planner,
    intent,
    contentFocus,
    selectedAngle,
    concreteSubject,
    userMessage,
    requestAnchors,
    pinnedVoiceAnchorCount,
  } = params;
  const formFactorGuidance = buildFormFactorGuidance(context, intent);
  const outputShapeGuidance = buildOutputShapeGuidance(
    contract.planner.outputShape,
    intent,
  );
  const formatExemplarLine = formatExemplar(requestAnchors.formatExemplar);
  const evidencePackLine = formatEvidencePack(requestAnchors.evidencePack);
  const formatBlueprint = buildFormatBlueprint({
    post: requestAnchors.formatExemplar,
    outputShape: contract.planner.outputShape,
  });
  const formatSkeleton = formatLongFormSkeleton(
    buildLongFormContentSkeleton(requestAnchors.formatExemplar),
  );

  return [
    "You are the writer for an X growth assistant.",
    "Write one high-quality assistant response package for the user.",
    intent === "ideate"
      ? "Return a short strategic response, 0-4 angle candidates, why the direction fits, and what to watch out for."
      : "Return a short strategic response, 4-6 concrete draft candidates, why they fit, and what to watch out for.",
    "The package must be directly useful, specific, and aligned to the deterministic contract.",
    "The user's native voice matters more than generic social-media best practices.",
    "The retrieved evidence pack is the concrete topic ground truth. Use it for actual nouns, proof, metrics, and story details whenever the request is compatible with it.",
    "The current user message style matters most when choosing how loose, casual, or clipped the output should feel.",
    "Mirror the user's actual tone, casing, looseness, and level of polish from the provided voice anchors.",
    pinnedVoiceAnchorCount > 0
      ? "Pinned voice references are the highest-priority tone source. If they conflict with weaker inferred signals, follow the pinned references."
      : "No pinned voice references were provided.",
    `Target casing: ${contract.writer.targetCasing}.`,
    `Target risk: ${contract.writer.targetRisk}.`,
    `Tone blend: ${contract.writer.toneBlendSummary}`,
    `Preferred opener patterns: ${contract.writer.preferredOpeners.join(" | ") || "none"}`,
    `Preferred closer patterns: ${contract.writer.preferredClosers.join(" | ") || "none"}`,
    `Signature phrases: ${contract.writer.signaturePhrases.join(" | ") || "none"}`,
    `Punctuation guidance: ${contract.writer.punctuationGuidelines.join(" | ") || "none"}`,
    `Emoji policy: ${contract.writer.emojiPolicy}`,
    "If the anchors are casual, lowercase, clipped, or slangy, keep that character in the drafts.",
    "When the current user message is explicit about the topic, use the anchors for syntax and tone only, not for changing the subject.",
    "Do not rewrite the user into polished consultant, corporate, or founder-bro language.",
    "Prefer concrete first-person observations and natural phrasing over generic engagement-bait questions.",
    `Authority budget: ${contract.planner.authorityBudget}.`,
    `Proof requirement: ${contract.writer.proofRequirement}`,
    "If the user gave you a concrete subject, keep that exact subject and wording family. Do not swap it for a generic adjacent topic.",
    buildConcreteTopicGuardrail({
      selectedAngle,
      concreteSubject,
      userMessage,
    }),
    "Treat strategy, niche, goal, and growth-loop guidance as background constraints only. They can shape framing, structure, and proof density, but they must not become the literal topic of the post.",
    selectedAngle
      ? `A structured angle was explicitly selected by the user. Preserve it as the central premise: ${selectedAngle}`
      : "No structured angle was explicitly selected.",
    "Do not introduce startup, investing, or business tropes unless they are clearly present in the user's request, niche, or anchors.",
    intent === "ideate"
      ? "Do not jump straight into finished posts unless the user explicitly asked for full copy. Prioritize 2-4 concrete, X-native angles written in the user's voice, and leave drafts empty."
      : "If the user is asking for drafting help, the draft candidates must read like actual X posts, not outlines.",
    intent === "ideate"
      ? "Each angle should feel like a believable post direction the user could actually say, not a generic instruction like 'share a recent win'."
      : contract.planner.outputShape === "long_form_post" ||
          contract.planner.outputShape === "thread_seed"
        ? "For draft mode, match the creator's natural structure and length. Do not compress long-form or thread-shaped outputs into tweet-sized copy."
        : "For draft mode, short punchy wording is better than explanatory filler. If a natural ending like 'thoughts?' fits, prefer that over a formal CTA.",
    intent === "ideate"
      ? "Angles should read like rough post premises or one-liners. Do not output category labels or gerund openers like 'sharing...', 'discussing...', 'highlighting...', or 'talking about...'."
      : contract.planner.outputShape === "long_form_post" ||
          contract.planner.outputShape === "thread_seed"
        ? "Long-form and thread-shaped drafts should still feel native to X, but they must preserve the creator's natural sections, spacing, and proof density."
        : "At least one draft should feel blunt and native to X, like something the user would text to the timeline, not a polished content exercise.",
    "Casual does not mean forced lowercase or one-line output. Preserve the creator's natural casing, line breaks, and structure unless the anchors and exemplar clearly show otherwise.",
    "When a casual tone fits, prefer direct first-person wording and simple phrasing without flattening the creator's natural formatting.",
    "Avoid bland filler phrases like 'major milestone', 'currently working on', 'excited to share', 'for a while now', 'valuable insights', 'connect with your audience', or 'establish authority'.",
    `Creator-specific forbidden phrases: ${contract.writer.forbiddenPhrases.join(" | ") || "none"}`,
    "Avoid vague motivational framing unless the user explicitly asked for it.",
    ...formFactorGuidance,
    ...outputShapeGuidance,
    `Generation mode: ${contract.mode}.`,
    `Target lane: ${planner.targetLane}.`,
    `Required output shape: ${contract.planner.outputShape}.`,
    `Output shape rationale: ${contract.planner.outputShapeRationale}`,
    `Objective: ${planner.objective}.`,
    `Primary angle: ${planner.angle}.`,
    `Observed niche: ${context.creatorProfile.niche.primaryNiche}.`,
    `Target niche: ${context.creatorProfile.niche.targetNiche ?? "none"}.`,
    `Explicit content focus: ${contentFocus ?? "none"}.`,
    `Format exemplar (imitate structure, not topic): ${formatExemplarLine}`,
    `Concrete evidence pack (use this as topical proof, not just background flavor):\n${evidencePackLine}`,
    `Structural blueprint (follow this shape unless the user clearly needs something else): ${formatBlueprint}`,
    `Long-form content skeleton (preserve this content progression when writing long form): ${formatSkeleton}`,
    requestAnchors.evidencePack.requiredEvidenceCount > 0
      ? `Reuse at least ${requestAnchors.evidencePack.requiredEvidenceCount} concrete evidence point(s) from the evidence pack when drafting.`
      : "No minimum evidence reuse requirement is available.",
    "Make 'whyThisWorks' specific to this creator, this subject, and this format. Do not use generic claims like 'it helps you connect with your audience' or 'it establishes authority'.",
    "Make 'watchOutFor' concrete and tied to the actual draft, not generic reminders like 'keep it concise' unless that is truly the main risk.",
    "Do not mention internal model fields unless useful to the user.",
    "Return only valid JSON that follows the provided schema.",
  ].join("\n");
}

function buildCriticSystemPrompt(params: {
  contract: CreatorGenerationContract;
  context: CreatorAgentContext;
  intent: CreatorChatIntent;
  contentFocus: string | null;
  selectedAngle: string | null;
  concreteSubject: string | null;
  userMessage: string;
  requestAnchors: RequestConditionedAnchors;
  pinnedVoiceAnchorCount: number;
}): string {
  const {
    contract,
    context,
    intent,
    contentFocus,
    selectedAngle,
    concreteSubject,
    userMessage,
    requestAnchors,
    pinnedVoiceAnchorCount,
  } = params;
  const formFactorGuidance = buildFormFactorGuidance(context, intent);
  const outputShapeGuidance = buildOutputShapeGuidance(
    contract.planner.outputShape,
    intent,
  );
  const formatExemplarLine = formatExemplar(requestAnchors.formatExemplar);
  const evidencePackLine = formatEvidencePack(requestAnchors.evidencePack);
  const formatBlueprint = buildFormatBlueprint({
    post: requestAnchors.formatExemplar,
    outputShape: contract.planner.outputShape,
  });
  const formatSkeleton = formatLongFormSkeleton(
    buildLongFormContentSkeleton(requestAnchors.formatExemplar),
  );

  return [
    "You are the critic for an X growth assistant.",
    "Review the candidate response package and either approve it or tighten it.",
    "Keep the final response concise, useful, and aligned to the deterministic checklist.",
    intent === "ideate"
      ? "If the user is still planning, keep the response focused on authentic angles, keep final drafts empty, and make the angles feel like something the user would naturally say."
      : "Keep the draft candidates sharp and usable as actual X posts.",
    "Reject drafts that sound more formal, generic, or polished than the user's real voice anchors.",
    pinnedVoiceAnchorCount > 0
      ? "Pinned voice references are the strongest authority for tone. Reject outputs that drift away from them even if other inferred signals look weaker."
      : "No pinned voice references were provided.",
    "Reject drafts that read like empty engagement bait, forced binary questions, or generic startup advice unless the user clearly writes that way.",
    "Reject outputs that replace the user's concrete subject with a generic adjacent topic.",
    buildConcreteTopicGuardrail({
      selectedAngle,
      concreteSubject,
      userMessage,
    }),
    "Reject outputs that ignore the strongest concrete evidence and replace it with generic category-level advice.",
    "Reject outputs where broad strategy or goal phrasing becomes the literal topic. Strategy should shape framing only, not replace the concrete subject.",
    "Reject ideation angles that are just category labels, abstract strategies, or gerund starters like 'sharing...', 'discussing...', or 'highlighting...'.",
    "Reject bland phrases like 'major milestone', 'currently working on', 'excited to share', 'valuable insights', or 'establish authority'.",
    contract.planner.outputShape === "long_form_post"
      ? "Reject long-form drafts that still read like short tweet-sized posts. They should be meaningfully developed, usually beyond tweet length, with a clear thesis and structure."
      : "",
    `Use this structure as the closest good mold when it exists: ${formatExemplarLine}`,
    `Concrete evidence pack to enforce:\n${evidencePackLine}`,
    `Structural blueprint to enforce: ${formatBlueprint}`,
    `Long-form content skeleton to enforce: ${formatSkeleton}`,
    requestAnchors.evidencePack.requiredEvidenceCount > 0
      ? `Reject drafts that reuse fewer than ${requestAnchors.evidencePack.requiredEvidenceCount} concrete evidence point(s) when the topic aligns with the evidence pack.`
      : "No minimum evidence reuse requirement is available.",
    "Reject long-form or thread outputs that ignore the structural blueprint and collapse into a generic tweet-sized answer.",
    "Treat lowercase as a casing preference only. Casual voice can still be sentence-case, multi-line, or sectioned when the creator's anchors or exemplar support that structure.",
    `Target casing: ${contract.writer.targetCasing}.`,
    `Target risk: ${contract.writer.targetRisk}.`,
    `Tone blend: ${contract.writer.toneBlendSummary}`,
    `Preferred opener patterns: ${contract.writer.preferredOpeners.join(" | ") || "none"}`,
    `Preferred closer patterns: ${contract.writer.preferredClosers.join(" | ") || "none"}`,
    `Signature phrases: ${contract.writer.signaturePhrases.join(" | ") || "none"}`,
    `Punctuation guidance: ${contract.writer.punctuationGuidelines.join(" | ") || "none"}`,
    `Emoji policy: ${contract.writer.emojiPolicy}`,
    `Authority budget: ${contract.planner.authorityBudget}.`,
    `Proof requirement: ${contract.writer.proofRequirement}`,
    contract.planner.authorityBudget === "low"
      ? "Reject drafts that stay abstract. For low-authority accounts, every real post should include a concrete receipt, artifact, metric, constraint, or explicit example."
      : "Prefer concrete specifics over abstraction, even when broader claims are allowed.",
    ...formFactorGuidance,
    "Reject generic 'why this works' bullets like 'connects with the audience' or 'establishes authority' when they are not specific to the actual content.",
    "Reject generic 'watch out for' bullets like 'keep it concise' unless they are specifically justified by the draft.",
    `Reject creator-specific forbidden phrases: ${contract.writer.forbiddenPhrases.join(" | ") || "none"}`,
    selectedAngle
      ? `The final result must preserve the user's selected angle as the central premise: ${selectedAngle}`
      : "No structured angle was explicitly selected.",
    "The final drafts should feel like the user's own tone with stronger strategy, not a different person.",
    ...outputShapeGuidance,
    `Generation mode: ${contract.mode}.`,
    `Checklist: ${contract.critic.checklist.join(" | ")}`,
    `Required output shape: ${contract.planner.outputShape}.`,
    `Output shape rationale: ${contract.planner.outputShapeRationale}`,
    `Readiness status: ${context.readiness.status}.`,
    `Explicit content focus: ${contentFocus ?? "none"}.`,
    "Return only valid JSON that follows the provided schema.",
  ].join("\n");
}

function applyTargetCasing(
  text: string,
  targetCasing: CreatorGenerationContract["writer"]["targetCasing"],
): string {
  if (targetCasing !== "lowercase") {
    return text;
  }

  const urlPlaceholders: string[] = [];
  const protectedText = text.replace(/https?:\/\/\S+/gi, (url) => {
    const placeholder = `__URL_${urlPlaceholders.length}__`;
    urlPlaceholders.push(url);
    return placeholder;
  });

  const lowered = protectedText.toLowerCase();
  const withAcronyms = lowered.replace(/\b[a-z][a-z0-9]{1,6}\b/g, (token) => {
    return ACRONYM_CASE_MAP.get(token) ?? token;
  });

  return withAcronyms.replace(/__url_(\d+)__/gi, (match, index) => {
    const numericIndex = Number(index);
    return Number.isInteger(numericIndex) && urlPlaceholders[numericIndex]
      ? urlPlaceholders[numericIndex]
      : match;
  });
}

function loosenDraftText(text: string, contract: CreatorGenerationContract): string {
  let next = text.trim().replace(/[ \t]+/g, " ");

  if (
    contract.writer.targetCasing === "lowercase" ||
    contract.writer.targetRisk === "bold"
  ) {
    next = next
      .replace(/\bI am\b/g, "i'm")
      .replace(/\bI have\b/g, "i've")
      .replace(/\bI will\b/g, "i'll");

    if (!next.includes("\n")) {
      next = next.replace(/[.!]+$/g, "");
    }
  }

  return applyTargetCasing(next, contract.writer.targetCasing);
}

function hasProofSignal(text: string): boolean {
  return (
    /\d/.test(text) ||
    /https?:\/\//i.test(text) ||
    /\b(screenshot|demo|clip|repo|commit|metric|users|arr|mrr|latency|shipped|built|launched|prototype|feature|bug|constraint|days?|hours?|weeks?)\b/i.test(
      text,
    )
  );
}

const LOW_SIGNAL_DRAFT_TERMS = new Set([
  "a",
  "an",
  "and",
  "about",
  "all",
  "are",
  "as",
  "be",
  "been",
  "build",
  "building",
  "for",
  "from",
  "help",
  "how",
  "i",
  "i'm",
  "im",
  "in",
  "is",
  "it",
  "just",
  "my",
  "of",
  "on",
  "people",
  "post",
  "posting",
  "project",
  "that",
  "the",
  "this",
  "to",
  "users",
  "what",
  "with",
  "x",
]);

const GENERIC_DRAFT_PHRASES = [
  "major milestone",
  "currently working on",
  "excited to share",
  "valuable insights",
  "connect with your audience",
  "establish authority",
  "what's your take",
  "what are your top lessons",
  "what's the one thing",
  "share your story",
];

const STRATEGY_LEAKAGE_PHRASES = [
  "distribution-friendly hooks",
  "repeatable topic series",
  "strongest current strategy signal",
  "lean into",
  "optimize for discovery",
  "growth loop",
  "operator lessons",
  "actionable insights",
];

function collectSignalTerms(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .toLowerCase()
        .match(/[a-z0-9]+/g)
        ?.filter(
          (term) => term.length >= 3 && !LOW_SIGNAL_DRAFT_TERMS.has(term),
        ) ?? [],
    ),
  );
}

function buildConcreteTopicGuardrail(params: {
  selectedAngle: string | null;
  concreteSubject: string | null;
  userMessage: string;
}): string {
  if (params.selectedAngle && params.concreteSubject) {
    return `Use the selected angle as the central premise and keep the concrete subject in the same wording family. Do not replace either with abstract strategy language. Selected angle: ${params.selectedAngle}. Concrete subject: ${params.concreteSubject}.`;
  }

  if (params.selectedAngle) {
    return `Use the selected angle as the exact topic center. Do not replace it with broader strategy phrasing. Selected angle: ${params.selectedAngle}.`;
  }

  if (params.concreteSubject) {
    return `The user gave a concrete subject. Keep that exact topic and wording family instead of drifting into broad strategy language. Concrete subject: ${params.concreteSubject}.`;
  }

  return `No explicit selected angle or concrete subject was detected. Use the user's actual request as the topic source instead of abstract strategy summaries: ${params.userMessage}.`;
}

function computeLowercaseShare(text: string): number {
  const letters = text.match(/[A-Za-z]/g) ?? [];
  if (letters.length === 0) {
    return 0;
  }

  const lowercaseLetters = text.match(/[a-z]/g) ?? [];
  return (lowercaseLetters.length / letters.length) * 100;
}

function looksLikeGenericQuestion(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return (
    trimmed.endsWith("?") &&
    /^(what|how|why|when|where|who)\b/.test(trimmed) &&
    !hasProofSignal(trimmed)
  );
}

function hasStructuredLongFormShape(text: string): boolean {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return /\n/.test(text) || /^- /m.test(text) || wordCount >= 45;
}

function scoreAngleCandidate(params: {
  angle: string;
  contract: CreatorGenerationContract;
  selectedAngle: string | null;
  concreteSubject: string | null;
  userMessage: string;
  evidencePack?: CreatorChatDebugEvidencePack;
}): number {
  const angle = params.angle.trim();
  if (!angle) {
    return Number.NEGATIVE_INFINITY;
  }

  const lowered = angle.toLowerCase();
  const words = lowered.match(/[a-z0-9']+/g) ?? [];
  const focusTerms = Array.from(
    new Set([
      ...collectSignalTerms(params.selectedAngle),
      ...collectSignalTerms(params.concreteSubject),
      ...collectSignalTerms(params.userMessage).slice(0, 4),
    ]),
  );
  const matchingTerms = focusTerms.filter((term) =>
    new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
      angle,
    ),
  );
  const strategyLeakCount = countPhraseMatches(angle, STRATEGY_LEAKAGE_PHRASES);
  const evidenceCoverage = countEvidenceCoverage(angle, params.evidencePack);
  let score = 0;

  if (
    params.contract.planner.outputShape === "long_form_post" ||
    params.contract.planner.outputShape === "thread_seed"
  ) {
    if (/\?$/.test(angle) || /^(what|how|why|when|where|who)\b/i.test(angle)) {
      score -= 9;
    }

    if (
      /\b(how to|what are|what's the|how do you|how can founders|what metrics do you)\b/i.test(
        angle,
      )
    ) {
      score -= 5;
    }

    if (
      !/\?$/.test(angle) &&
      /^(here'?s|the|most|founders|get|why|building|scaling|i(?:'m| am)|my|the playbook|the discipline|the founder traps|what it actually takes)\b/i.test(
        angle,
      )
    ) {
      score += 3;
    }

    if (hasProofSignal(angle) || /\b(arr|users|team|engineers|profit|scale)\b/i.test(angle)) {
      score += 2;
    }
  } else if (looksLikeGenericQuestion(angle)) {
    score -= 3;
  }

  if (/^(sharing|discussing|highlighting|talking)\b/i.test(angle)) {
    score -= 4;
  }

  if (focusTerms.length > 0) {
    score += Math.min(matchingTerms.length, 3) * 1.5;

    if ((params.selectedAngle || params.concreteSubject) && matchingTerms.length === 0) {
      score -= 4;
    } else if (
      (params.selectedAngle || params.concreteSubject) &&
      focusTerms.length >= 3 &&
      matchingTerms.length <= 1
    ) {
      score -= 1.5;
    }
  }

  if (params.evidencePack) {
    score += Math.min(evidenceCoverage.entityMatches, 2) * 1.25;
    score += Math.min(evidenceCoverage.metricMatches, 2) * 2;
    score += Math.min(evidenceCoverage.proofMatches, 2) * 1.5;

    if (
      params.evidencePack.requiredEvidenceCount > 0 &&
      evidenceCoverage.total < params.evidencePack.requiredEvidenceCount
    ) {
      score -=
        (params.evidencePack.requiredEvidenceCount - evidenceCoverage.total) * 4;
    }
  }

  score += words.length >= 6 ? 1 : -1;
  score -= countPhraseMatches(angle, GENERIC_DRAFT_PHRASES) * 2;
  if ((params.selectedAngle || params.concreteSubject) && strategyLeakCount > 0) {
    score -= strategyLeakCount * 3;
  }

  return score;
}

function rerankAngles(params: {
  angles: string[];
  contract: CreatorGenerationContract;
  selectedAngle: string | null;
  concreteSubject: string | null;
  userMessage: string;
  evidencePack?: CreatorChatDebugEvidencePack;
}): string[] {
  const seen = new Set<string>();

  return params.angles
    .map((angle) => loosenDraftText(angle, params.contract))
    .filter((angle) => {
      const normalized = angle.trim().toLowerCase();
      if (!normalized || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    })
    .map((angle) => ({
      angle,
      score: scoreAngleCandidate({
        angle,
        contract: params.contract,
        selectedAngle: params.selectedAngle,
        concreteSubject: params.concreteSubject,
        userMessage: params.userMessage,
        evidencePack: params.evidencePack,
      }),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((candidate) => candidate.angle);
}

function countPhraseMatches(text: string, phrases: string[]): number {
  const lowered = text.toLowerCase();
  return phrases.filter((phrase) => lowered.includes(phrase)).length;
}

function isClearlyLongFormDraft(draft: string): boolean {
  const weightedCount = computeXWeightedCharacterCount(draft);
  const wordCount = draft.trim().split(/\s+/).filter(Boolean).length;

  return (
    weightedCount >= 380 ||
    (hasStructuredLongFormShape(draft) && wordCount >= 55)
  );
}

function matchesLongFormBlueprint(
  draft: string,
  blueprint: FormatBlueprintProfile,
): boolean {
  const wordCount = draft.trim().split(/\s+/).filter(Boolean).length;
  const sectionCount = countStructuralSections(draft);
  const bulletLines = draft
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^[-*•]\s|^\d+\./.test(line)).length;

  if (wordCount < blueprint.minimumWords) {
    return false;
  }

  if (sectionCount < blueprint.minimumSections) {
    return false;
  }

  if (blueprint.prefersBulletCore && bulletLines === 0) {
    return false;
  }

  if (countProofSignals(draft) < blueprint.minimumProofSignals) {
    return false;
  }

  if (blueprint.preferConfidentClose && /\?\s*$/.test(draft.trim())) {
    return false;
  }

  return true;
}

function scoreDraftCandidate(params: {
  draft: string;
  contract: CreatorGenerationContract;
  selectedAngle: string | null;
  concreteSubject: string | null;
  userMessage: string;
  blueprintProfile?: FormatBlueprintProfile;
  contentSkeleton?: LongFormContentSkeleton;
  evidencePack?: CreatorChatDebugEvidencePack;
}): number {
  const draft = params.draft.trim();
  if (!draft) {
    return Number.NEGATIVE_INFINITY;
  }

  const lowered = draft.toLowerCase();
  const words = lowered.match(/[a-z0-9']+/g) ?? [];
  const lowercaseShare = computeLowercaseShare(draft);
  const sectionCount = countStructuralSections(draft);
  const proofSignalCount = countProofSignals(draft);
  const focusTerms = Array.from(
    new Set([
      ...collectSignalTerms(params.selectedAngle),
      ...collectSignalTerms(params.concreteSubject),
      ...collectSignalTerms(params.userMessage).slice(0, 4),
    ]),
  );
  const matchingTerms = focusTerms.filter((term) =>
    new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
      draft,
    ),
  );
  const strategyLeakCount = countPhraseMatches(draft, STRATEGY_LEAKAGE_PHRASES);
  const evidenceCoverage = countEvidenceCoverage(draft, params.evidencePack);
  let score = 0;

  if (params.contract.writer.targetCasing === "lowercase") {
    score += lowercaseShare >= 72 ? 3 : lowercaseShare >= 55 ? 1 : -3;
  } else {
    score += lowercaseShare <= 55 ? 1 : -1;
  }

  if (params.contract.planner.authorityBudget === "low") {
    score += hasProofSignal(draft) ? 4 : -5;
  } else if (params.contract.planner.authorityBudget === "medium") {
    score += hasProofSignal(draft) ? 2 : -1;
  } else if (hasProofSignal(draft)) {
    score += 1;
  }

  if (focusTerms.length > 0) {
    score += Math.min(matchingTerms.length, 4) * 1.25;

    if ((params.selectedAngle || params.concreteSubject) && matchingTerms.length === 0) {
      score -= 7;
    } else if (
      (params.selectedAngle || params.concreteSubject) &&
      focusTerms.length >= 3 &&
      matchingTerms.length <= 1
    ) {
      score -= 2;
    }
  }

  if (params.evidencePack) {
    score += Math.min(evidenceCoverage.entityMatches, 3) * 1.25;
    score += Math.min(evidenceCoverage.metricMatches, 3) * 2.25;
    score += Math.min(evidenceCoverage.proofMatches, 3) * 1.5;

    if (
      params.evidencePack.requiredEvidenceCount > 0 &&
      evidenceCoverage.total < params.evidencePack.requiredEvidenceCount
    ) {
      score -=
        (params.evidencePack.requiredEvidenceCount - evidenceCoverage.total) * 5;
    }
  }

  if (params.contract.planner.outputShape === "short_form_post") {
    score += words.length <= 24 ? 2 : words.length <= 36 ? 0.5 : -2;
  } else if (params.contract.planner.outputShape === "long_form_post") {
    score += hasStructuredLongFormShape(draft) ? 6 : 0;
    if (
      params.blueprintProfile &&
      matchesLongFormBlueprint(draft, params.blueprintProfile)
    ) {
      score += 8;
    }
    if (
      params.contentSkeleton &&
      matchesLongFormSkeleton(draft, params.contentSkeleton)
    ) {
      score += 8;
    }
    if (words.length >= 90) {
      score += 4;
    } else if (words.length >= 60) {
      score += 2;
    } else if (words.length >= 40) {
      score -= 1;
    } else {
      score -= 10;
    }
    if (/\?$/.test(draft)) {
      score -= 5;
    }
    if (params.blueprintProfile) {
      if (words.length < params.blueprintProfile.minimumWords) {
        score -= 8;
      }
      if (sectionCount < params.blueprintProfile.minimumSections) {
        score -= 6;
      }
      if (proofSignalCount < params.blueprintProfile.minimumProofSignals) {
        score -= 5;
      }
      if (
        params.blueprintProfile.prefersBulletCore &&
        !/^[-*•]\s|^\d+\./m.test(draft)
      ) {
        score -= 4;
      }
      if (
        params.blueprintProfile.preferConfidentClose &&
        /\?\s*$/.test(draft)
      ) {
        score -= 4;
      }
    }
    if (
      params.contentSkeleton &&
      !matchesLongFormSkeleton(draft, params.contentSkeleton)
    ) {
      score -= 6;
    }
  } else if (params.contract.planner.outputShape === "thread_seed") {
    score += hasStructuredLongFormShape(draft) ? 4 : words.length >= 22 ? 1 : -4;
    if (/\?$/.test(draft)) {
      score -= 3;
    }
    if (params.blueprintProfile) {
      if (words.length < params.blueprintProfile.minimumWords) {
        score -= 4;
      }
      if (sectionCount < params.blueprintProfile.minimumSections) {
        score -= 3;
      }
      if (
        params.blueprintProfile.prefersBulletCore &&
        !/^[-*•]\s|^\d+\./m.test(draft)
      ) {
        score -= 2;
      }
    }
    if (
      params.contentSkeleton &&
      matchesLongFormSkeleton(draft, params.contentSkeleton)
    ) {
      score += 4;
    }
  }

  if (looksLikeGenericQuestion(draft)) {
    score -= 4;
  }

  if (
    params.contract.planner.outputShape === "short_form_post" &&
    /(thoughts\?|curious if|anyone else)/i.test(lowered)
  ) {
    score += 1.5;
  }

  score -= countPhraseMatches(draft, GENERIC_DRAFT_PHRASES) * 3;
  if ((params.selectedAngle || params.concreteSubject) && strategyLeakCount > 0) {
    score -= strategyLeakCount * 4;
  }

  if (/^(sharing|discussing|highlighting|talking)\b/i.test(draft)) {
    score -= 2;
  }

  return score;
}

function rerankDrafts(params: {
  drafts: string[];
  contract: CreatorGenerationContract;
  selectedAngle: string | null;
  concreteSubject: string | null;
  userMessage: string;
  blueprintProfile?: FormatBlueprintProfile;
  contentSkeleton?: LongFormContentSkeleton;
  evidencePack?: CreatorChatDebugEvidencePack;
}): string[] {
  const seen = new Set<string>();
  const candidates = params.drafts
    .map((draft) => loosenDraftText(draft, params.contract))
    .filter((draft) => {
      const normalized = draft.trim().toLowerCase();
      if (!normalized || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    })
    .map((draft) => ({
      draft,
      score: scoreDraftCandidate({
        draft,
        contract: params.contract,
        selectedAngle: params.selectedAngle,
        concreteSubject: params.concreteSubject,
        userMessage: params.userMessage,
        blueprintProfile: params.blueprintProfile,
        contentSkeleton: params.contentSkeleton,
        evidencePack: params.evidencePack,
      }),
    }))
    .sort((left, right) => right.score - left.score);

  return candidates.slice(0, 3).map((candidate) => candidate.draft);
}

function buildLongFormExpansionSystemPrompt(params: {
  context: CreatorAgentContext;
  contract: CreatorGenerationContract;
  selectedAngle: string | null;
  requestAnchors: RequestConditionedAnchors;
}): string {
  const formatExemplarLine = formatExemplar(params.requestAnchors.formatExemplar);
  const evidencePackLine = formatEvidencePack(params.requestAnchors.evidencePack);
  const blueprintProfile = buildFormatBlueprintProfile({
    post: params.requestAnchors.formatExemplar,
    outputShape: params.contract.planner.outputShape,
  });
  const contentSkeleton = buildLongFormContentSkeleton(
    params.requestAnchors.formatExemplar,
  );
  const formatBlueprint = buildFormatBlueprint({
    post: params.requestAnchors.formatExemplar,
    outputShape: params.contract.planner.outputShape,
  });
  const formatSkeleton = formatLongFormSkeleton(contentSkeleton);

  return [
    "You are expanding an X long-form draft into a stronger, more developed post.",
    "Return one expanded draft only.",
    "The expanded draft must stay faithful to the existing premise, voice, and subject.",
    "Do not change the topic or turn it into generic advice.",
    "Keep the user's voice and casing. Preserve casualness when appropriate.",
    "For long-form on X, the post should be substantially developed and usually exceed normal tweet length.",
    `Exemplar-derived minimums: at least ${blueprintProfile.minimumWords} words and ${blueprintProfile.minimumSections} clear sections.`,
    "Use a clear thesis, supporting proof, and stronger structure.",
    `Include at least ${blueprintProfile.minimumProofSignals} concrete proof signal(s): metrics, counts, constraints, artifacts, or specific operating details.`,
    "A paragraph + bullets or multiple short paragraphs is good if it fits.",
    blueprintProfile.prefersBulletCore
      ? "The expanded draft should include a bullet-led core section."
      : "If bullets are not natural, use multiple short sections instead of one flat paragraph.",
    blueprintProfile.preferConfidentClose
      ? "Prefer a confident close, not a trailing question."
      : "A question close is only acceptable after a fully developed thesis.",
    "Do not pad with filler. Add specifics, examples, constraints, or stronger framing.",
    params.selectedAngle
      ? `The selected angle must remain the central premise: ${params.selectedAngle}`
      : "No explicit selected angle was provided.",
    `Concrete evidence pack to preserve and reuse:\n${evidencePackLine}`,
    params.requestAnchors.evidencePack.requiredEvidenceCount > 0
      ? `Carry forward at least ${params.requestAnchors.evidencePack.requiredEvidenceCount} concrete evidence point(s) from that pack.`
      : "No minimum evidence reuse requirement is available.",
    `Required output shape: ${params.contract.planner.outputShape}.`,
    `Output shape rationale: ${params.contract.planner.outputShapeRationale}`,
    `Target casing: ${params.contract.writer.targetCasing}.`,
    `Tone blend: ${params.contract.writer.toneBlendSummary}`,
    `Proof requirement: ${params.contract.writer.proofRequirement}`,
    `Use this structure as the closest good mold when it exists: ${formatExemplarLine}`,
    `Follow this structural blueprint: ${formatBlueprint}`,
    `Follow this long-form content skeleton: ${formatSkeleton}`,
    "Return only valid JSON that follows the provided schema.",
  ].join("\n");
}

export async function generateCreatorChatReply(params: {
  runId: string;
  onboarding: OnboardingResult;
  tonePreference?: TonePreference | null;
  userMessage: string;
  history?: ChatHistoryMessage[];
  provider?: ChatModelProvider;
  intent?: CreatorChatIntent;
  contentFocus?: string | null;
  selectedAngle?: string | null;
  pinnedReferencePostIds?: string[];
  onProgress?: (phase: CreatorChatProgressPhase) => void;
}): Promise<CreatorChatReplyResult> {
  const context = buildCreatorAgentContext({
    runId: params.runId,
    onboarding: params.onboarding,
  });
  const contract = buildCreatorGenerationContract({
    runId: params.runId,
    onboarding: params.onboarding,
    tonePreference: params.tonePreference ?? null,
  });

  const deterministicFallback = buildDeterministicFallback({
    context,
    contract,
    userMessage: params.userMessage,
    intent: params.intent,
    contentFocus: params.contentFocus,
    selectedAngle: params.selectedAngle ?? null,
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

  const plannerProvider = resolveProviderConfig("planner", params.provider);
  const writerProvider = resolveProviderConfig("writer", params.provider);
  const criticProvider = resolveProviderConfig("critic", params.provider);

  if (!plannerProvider || !writerProvider || !criticProvider) {
    params.onProgress?.("finalizing");
    return {
      ...deterministicFallback,
      source: "deterministic",
      model: null,
      mode: contract.mode,
    };
  }

  const concreteSubject = extractConcreteSubject(params.userMessage);
  const requestAnchors = selectRequestConditionedAnchors({
    context,
    contract,
    userMessage: params.userMessage,
    concreteSubject,
    selectedAngle: params.selectedAngle ?? null,
    contentFocus: params.contentFocus ?? null,
  });
  const history = normalizeHistory(params.history ?? []);
  const historyText =
    history.length > 0
      ? history.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n")
      : "No prior chat history.";
  const formatBlueprintProfile = buildFormatBlueprintProfile({
    post: requestAnchors.formatExemplar,
    outputShape: contract.planner.outputShape,
  });
  const formatContentSkeleton = buildLongFormContentSkeleton(
    requestAnchors.formatExemplar,
  );

  params.onProgress?.("planning");
  const plannerResponse = await callProviderJson<PlannerOutput>({
    provider: plannerProvider,
    system: buildPlannerSystemPrompt({ context, contract }),
    user: [
      `User request: ${params.userMessage}`,
      `Task intent: ${params.intent ?? "draft"}`,
      `Explicit content focus: ${params.contentFocus ?? "none"}`,
      `Selected angle: ${params.selectedAngle?.trim() || "none"}`,
      `Concrete subject from user request: ${concreteSubject ?? "none"}`,
      `Concrete evidence pack:\n${formatEvidencePack(requestAnchors.evidencePack)}`,
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
  const planner = normalizePlannerOutput(plannerResponse, contract);
  const effectivePlanner: PlannerOutput = {
    ...planner,
    angle: params.selectedAngle?.trim() || planner.angle,
    mustInclude: params.selectedAngle?.trim()
      ? [
          `Preserve selected angle: ${params.selectedAngle.trim()}`,
          ...planner.mustInclude,
        ].slice(0, 4)
      : planner.mustInclude,
    mustAvoid: planner.mustAvoid,
  };
  const laneVoiceAnchors = selectLaneVoiceAnchors(
    context,
    effectivePlanner.targetLane,
  );
  const pinnedVoiceAnchors = selectPinnedVoiceAnchors(
    context,
    params.pinnedReferencePostIds ?? [],
  );
  const effectiveVoiceAnchors = mergeVoiceAnchors(
    pinnedVoiceAnchors,
    laneVoiceAnchors,
    4,
  );

  params.onProgress?.("writing");
  const writerResponse = await callProviderJson<WriterOutput>({
    provider: writerProvider,
    system: buildWriterSystemPrompt({
      context,
      contract,
      planner: effectivePlanner,
      intent: params.intent ?? "draft",
      contentFocus: params.contentFocus ?? null,
      selectedAngle: params.selectedAngle?.trim() || null,
      concreteSubject,
      userMessage: params.userMessage,
      requestAnchors,
      pinnedVoiceAnchorCount: pinnedVoiceAnchors.length,
    }),
    user: [
      `User request: ${params.userMessage}`,
      `Task intent: ${params.intent ?? "draft"}`,
      `Explicit content focus: ${params.contentFocus ?? "none"}`,
      `Selected angle: ${params.selectedAngle?.trim() || "none"}`,
      `Concrete subject from user request: ${concreteSubject ?? "none"}`,
      `Concrete evidence pack:\n${formatEvidencePack(requestAnchors.evidencePack)}`,
      `Recent chat history:\n${historyText}`,
      `Voice profile:\n${formatVoiceProfile(context)}`,
      `Live request voice hints:\n${inferUserMessageVoiceHints(params.userMessage)}`,
      formatAnchorExamples(
        "Request-conditioned topic anchors",
        requestAnchors.topicAnchors,
        4,
      ),
      formatAnchorExamples(
        "Request-conditioned lane anchors",
        requestAnchors.laneAnchors,
        3,
      ),
      formatAnchorExamples(
        "Request-conditioned format anchors",
        requestAnchors.formatAnchors,
        2,
      ),
      formatAnchorExamples(
        "Pinned voice references (highest priority)",
        pinnedVoiceAnchors,
        2,
      ),
      formatAnchorExamples(
        "Voice anchors to imitate for tone and casing",
        effectiveVoiceAnchors,
        3,
      ),
      formatAnchorExamples(
        "Strategy anchors to learn from for structure and proof density only (not topic)",
        context.creatorProfile.examples.strategyAnchors,
        2,
      ),
      formatAnchorExamples(
        "Goal anchors to learn from for framing only (not topic)",
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
        ...effectivePlanner.mustInclude,
      ].join(" | ")}`,
      `Must avoid: ${[
        ...contract.writer.mustAvoid,
        ...effectivePlanner.mustAvoid,
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
          maxItems: 6,
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

  const writer = normalizeWriterOutput(writerResponse);

  params.onProgress?.("critic");
  const criticResponse = await callProviderJson<CriticOutput>({
    provider: criticProvider,
    system: buildCriticSystemPrompt({
      contract,
      context,
      intent: params.intent ?? "draft",
      contentFocus: params.contentFocus ?? null,
      selectedAngle: params.selectedAngle?.trim() || null,
      concreteSubject,
      userMessage: params.userMessage,
      requestAnchors,
      pinnedVoiceAnchorCount: pinnedVoiceAnchors.length,
    }),
    user: [
      `User request: ${params.userMessage}`,
      `Task intent: ${params.intent ?? "draft"}`,
      `Explicit content focus: ${params.contentFocus ?? "none"}`,
      `Selected angle: ${params.selectedAngle?.trim() || "none"}`,
      `Concrete subject from user request: ${concreteSubject ?? "none"}`,
      `Concrete evidence pack:\n${formatEvidencePack(requestAnchors.evidencePack)}`,
      `Voice profile:\n${formatVoiceProfile(context)}`,
      `Live request voice hints:\n${inferUserMessageVoiceHints(params.userMessage)}`,
      formatAnchorExamples(
        "Request-conditioned topic anchors",
        requestAnchors.topicAnchors,
        4,
      ),
      formatAnchorExamples(
        "Request-conditioned format anchors",
        requestAnchors.formatAnchors,
        2,
      ),
      formatAnchorExamples(
        "Pinned voice references (highest priority)",
        pinnedVoiceAnchors,
        2,
      ),
      formatAnchorExamples(
        "Voice anchors to compare against",
        effectiveVoiceAnchors,
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
          maxItems: 6,
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

  const critic = normalizeCriticOutput(criticResponse, writer);

  params.onProgress?.("finalizing");
  const intent = params.intent ?? "draft";
  const finalAngles =
    intent === "ideate"
      ? rerankAngles({
          angles: sanitizeStringList(critic.finalAngles, 4, writer.angles),
          contract,
          selectedAngle: params.selectedAngle?.trim() || null,
          concreteSubject,
          userMessage: params.userMessage,
          evidencePack: requestAnchors.evidencePack,
        })
      : [];
  let finalDrafts =
    intent === "ideate"
      ? []
      : rerankDrafts({
          drafts: sanitizeStringList(critic.finalDrafts, 6, writer.drafts),
          contract,
          selectedAngle: params.selectedAngle?.trim() || null,
          concreteSubject,
          userMessage: params.userMessage,
          blueprintProfile: formatBlueprintProfile,
          contentSkeleton: formatContentSkeleton,
          evidencePack: requestAnchors.evidencePack,
        });
  const finalWatchOutFor = sanitizeStringList(
    critic.finalWatchOutFor,
    3,
    writer.watchOutFor,
  );

  if (
    intent !== "ideate" &&
    contract.planner.outputShape === "long_form_post" &&
    finalDrafts.length > 0 &&
    !finalDrafts.some(
      (draft) =>
        isClearlyLongFormDraft(draft) &&
        matchesLongFormBlueprint(draft, formatBlueprintProfile) &&
        matchesLongFormSkeleton(draft, formatContentSkeleton),
    )
  ) {
    try {
      const expansion = await callProviderJson<{ expandedDraft: string }>({
        provider: writerProvider,
        system: buildLongFormExpansionSystemPrompt({
          context,
          contract,
          selectedAngle: params.selectedAngle?.trim() || null,
          requestAnchors,
        }),
        user: [
          `Original user request: ${params.userMessage}`,
          `Selected angle: ${params.selectedAngle?.trim() || "none"}`,
          `Concrete subject from user request: ${concreteSubject ?? "none"}`,
          `Current best draft to expand:\n${finalDrafts[0]}`,
          `Other candidate drafts:\n${finalDrafts.slice(1).join("\n\n") || "none"}`,
        ].join("\n\n"),
        schemaName: "creator_long_form_expansion_output",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            expandedDraft: { type: "string" },
          },
          required: ["expandedDraft"],
        },
      });

      const expandedDraft = loosenDraftText(
        coerceString(expansion?.expandedDraft),
        contract,
      );

      if (expandedDraft) {
        finalDrafts = rerankDrafts({
          drafts: [expandedDraft, ...finalDrafts],
          contract,
          selectedAngle: params.selectedAngle?.trim() || null,
          concreteSubject,
          userMessage: params.userMessage,
          blueprintProfile: formatBlueprintProfile,
          contentSkeleton: formatContentSkeleton,
          evidencePack: requestAnchors.evidencePack,
        });
      }
    } catch {
      // Keep the original drafts if the long-form expansion pass fails.
    }
  }

  if (
    intent !== "ideate" &&
    contract.planner.authorityBudget === "low" &&
    finalDrafts.length > 0 &&
    finalDrafts.every((draft) => !hasProofSignal(draft))
  ) {
    finalWatchOutFor.unshift(
      "This needs one real receipt: a metric, screenshot, build detail, hard constraint, or explicit example.",
    );
  }

  return {
    reply: critic.finalResponse.trim() || writer.response.trim(),
    angles: finalAngles,
    drafts: finalDrafts,
    draftArtifacts: buildDraftArtifacts({
      drafts: finalDrafts,
      outputShape:
        intent === "ideate" ? "ideation_angles" : contract.planner.outputShape,
      supportAsset: (critic.finalSupportAsset || writer.supportAsset).trim() || null,
    }),
    supportAsset:
      (critic.finalSupportAsset || writer.supportAsset).trim() || null,
    outputShape:
      intent === "ideate" ? "ideation_angles" : contract.planner.outputShape,
    whyThisWorks: sanitizeStringList(
      critic.finalWhyThisWorks,
      3,
      writer.whyThisWorks,
    ),
    watchOutFor: sanitizeStringList(finalWatchOutFor, 3),
    debug: {
      formatExemplar: buildFormatExemplarDebug(requestAnchors.formatExemplar),
      evidencePack: requestAnchors.evidencePack,
      formatBlueprint: buildFormatBlueprint({
        post: requestAnchors.formatExemplar,
        outputShape: contract.planner.outputShape,
      }),
      formatSkeleton: formatLongFormSkeleton(formatContentSkeleton),
      outputShapeRationale: contract.planner.outputShapeRationale,
    },
    source: writerProvider.provider,
    model: writerProvider.model,
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
