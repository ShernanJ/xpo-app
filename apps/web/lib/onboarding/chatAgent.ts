import { buildCreatorAgentContext, type CreatorAgentContext } from "./agentContext";
import {
  buildCreatorGenerationContract,
  type CreatorGenerationContract,
  type CreatorGenerationOutputShape,
} from "./generationContract";
import type { OnboardingResult, TonePreference } from "./types";

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
  outputShape: CreatorGenerationOutputShape | "ideation_angles";
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

  if (contract.mode === "analysis_only") {
    return {
      reply: `The model is still in analysis mode. ${context.readiness.reasons[0] ?? "The current sample is not strong enough for reliable drafting yet."}`,
      angles: [],
      drafts: [],
      supportAsset: null,
      outputShape: contract.planner.outputShape,
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
      ].map((angle) => loosenDraftText(angle, contract)),
      drafts: [],
      supportAsset:
        "Use a real screenshot, short demo clip, or a product link only if it helps prove the point.",
      outputShape: "ideation_angles",
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
      params.selectedAngle?.trim() || `${topHook}: ${contract.planner.primaryAngle}`,
      `${topType} version: ${
        params.selectedAngle?.trim() || params.userMessage
      }`,
    ].map((draft) => loosenDraftText(draft, contract)),
    supportAsset:
      "If you mention a product or project, attach a screenshot or quick demo instead of a generic link.",
    outputShape: contract.planner.outputShape,
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
    `Required output shape: ${contract.planner.outputShape}.`,
    "If the user wants ideas, plan in concrete post premises, not content-marketing category labels.",
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
        "Multi-line structure is allowed when it helps clarity and matches the creator.",
      ];
    case "long_form_post":
      return [
        "Return longer-form drafts with a clear thesis, proof, and stronger point of view.",
        "Do not force a shallow question ending when a confident close is stronger.",
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
}): string {
  const { context, contract, planner, intent, contentFocus, selectedAngle } = params;
  const formFactorGuidance = buildFormFactorGuidance(context, intent);
  const outputShapeGuidance = buildOutputShapeGuidance(
    contract.planner.outputShape,
    intent,
  );

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
    `Target casing: ${contract.writer.targetCasing}.`,
    `Target risk: ${contract.writer.targetRisk}.`,
    `Tone blend: ${contract.writer.toneBlendSummary}`,
    "If the anchors are casual, lowercase, clipped, or slangy, keep that character in the drafts.",
    "When the current user message is explicit about the topic, use the anchors for syntax and tone only, not for changing the subject.",
    "Do not rewrite the user into polished consultant, corporate, or founder-bro language.",
    "Prefer concrete first-person observations and natural phrasing over generic engagement-bait questions.",
    `Authority budget: ${contract.planner.authorityBudget}.`,
    `Proof requirement: ${contract.writer.proofRequirement}`,
    "If the user gave you a concrete subject, keep that exact subject and wording family. Do not swap it for a generic adjacent topic.",
    selectedAngle
      ? `A structured angle was explicitly selected by the user. Preserve it as the central premise: ${selectedAngle}`
      : "No structured angle was explicitly selected.",
    "Do not introduce startup, investing, or business tropes unless they are clearly present in the user's request, niche, or anchors.",
    intent === "ideate"
      ? "Do not jump straight into finished posts unless the user explicitly asked for full copy. Prioritize 2-4 concrete, X-native angles written in the user's voice, and leave drafts empty."
      : "If the user is asking for drafting help, the draft candidates must read like actual X posts, not outlines.",
    intent === "ideate"
      ? "Each angle should feel like a believable post direction the user could actually say, not a generic instruction like 'share a recent win'."
      : "For draft mode, short punchy wording is better than explanatory filler. If a natural ending like 'thoughts?' fits, prefer that over a formal CTA.",
    intent === "ideate"
      ? "Angles should read like rough post premises or one-liners. Do not output category labels or gerund openers like 'sharing...', 'discussing...', 'highlighting...', or 'talking about...'."
      : "At least one draft should feel blunt and native to X, like something the user would text to the timeline, not a polished content exercise.",
    "A strong target shape for this user is a clipped lowercase line like: 'been building this project to help people draft x posts easier, thoughts?'",
    "Prefer that kind of sentence rhythm when it fits: first-person, concrete, casual, one thought, then a simple ending.",
    "Avoid bland filler phrases like 'major milestone', 'currently working on', 'excited to share', 'for a while now', 'valuable insights', 'connect with your audience', or 'establish authority'.",
    "Avoid vague motivational framing unless the user explicitly asked for it.",
    ...formFactorGuidance,
    ...outputShapeGuidance,
    `Generation mode: ${contract.mode}.`,
    `Target lane: ${planner.targetLane}.`,
    `Required output shape: ${contract.planner.outputShape}.`,
    `Objective: ${planner.objective}.`,
    `Primary angle: ${planner.angle}.`,
    `Observed niche: ${context.creatorProfile.niche.primaryNiche}.`,
    `Target niche: ${context.creatorProfile.niche.targetNiche ?? "none"}.`,
    `Explicit content focus: ${contentFocus ?? "none"}.`,
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
}): string {
  const { contract, context, intent, contentFocus, selectedAngle } = params;
  const formFactorGuidance = buildFormFactorGuidance(context, intent);
  const outputShapeGuidance = buildOutputShapeGuidance(
    contract.planner.outputShape,
    intent,
  );

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
    "Reject ideation angles that are just category labels, abstract strategies, or gerund starters like 'sharing...', 'discussing...', or 'highlighting...'.",
    "Reject bland phrases like 'major milestone', 'currently working on', 'excited to share', 'valuable insights', or 'establish authority'.",
    "Prefer concise first-person lowercase phrasing when the user's voice supports it, for example: 'been building ... , thoughts?'",
    `Target casing: ${contract.writer.targetCasing}.`,
    `Target risk: ${contract.writer.targetRisk}.`,
    `Tone blend: ${contract.writer.toneBlendSummary}`,
    `Authority budget: ${contract.planner.authorityBudget}.`,
    `Proof requirement: ${contract.writer.proofRequirement}`,
    contract.planner.authorityBudget === "low"
      ? "Reject drafts that stay abstract. For low-authority accounts, every real post should include a concrete receipt, artifact, metric, constraint, or explicit example."
      : "Prefer concrete specifics over abstraction, even when broader claims are allowed.",
    ...formFactorGuidance,
    "Reject generic 'why this works' bullets like 'connects with the audience' or 'establishes authority' when they are not specific to the actual content.",
    "Reject generic 'watch out for' bullets like 'keep it concise' unless they are specifically justified by the draft.",
    selectedAngle
      ? `The final result must preserve the user's selected angle as the central premise: ${selectedAngle}`
      : "No structured angle was explicitly selected.",
    "The final drafts should feel like the user's own tone with stronger strategy, not a different person.",
    ...outputShapeGuidance,
    `Generation mode: ${contract.mode}.`,
    `Checklist: ${contract.critic.checklist.join(" | ")}`,
    `Required output shape: ${contract.planner.outputShape}.`,
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
      `Selected angle: ${params.selectedAngle?.trim() || "none"}`,
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
  const effectivePlanner: PlannerOutput = {
    ...planner,
    angle: params.selectedAngle?.trim() || planner.angle,
    mustInclude: params.selectedAngle?.trim()
      ? [
          `Preserve selected angle: ${params.selectedAngle.trim()}`,
          ...planner.mustInclude,
        ].slice(0, 4)
      : planner.mustInclude,
  };

  params.onProgress?.("writing");
  const writer = await callProviderJson<WriterOutput>({
    provider,
    system: buildWriterSystemPrompt({
      context,
      contract,
      planner: effectivePlanner,
      intent: params.intent ?? "draft",
      contentFocus: params.contentFocus ?? null,
      selectedAngle: params.selectedAngle?.trim() || null,
    }),
    user: [
      `User request: ${params.userMessage}`,
      `Task intent: ${params.intent ?? "draft"}`,
      `Explicit content focus: ${params.contentFocus ?? "none"}`,
      `Selected angle: ${params.selectedAngle?.trim() || "none"}`,
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
      selectedAngle: params.selectedAngle?.trim() || null,
    }),
    user: [
      `User request: ${params.userMessage}`,
      `Task intent: ${params.intent ?? "draft"}`,
      `Explicit content focus: ${params.contentFocus ?? "none"}`,
      `Selected angle: ${params.selectedAngle?.trim() || "none"}`,
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
  const finalAngles =
    intent === "ideate"
      ? sanitizeStringList(critic.finalAngles, 4, writer.angles).map((angle) =>
          loosenDraftText(angle, contract),
        )
      : [];
  const finalDrafts =
    intent === "ideate"
      ? []
      : sanitizeStringList(critic.finalDrafts, 3, writer.drafts).map((draft) =>
          loosenDraftText(draft, contract),
        );
  const finalWatchOutFor = sanitizeStringList(
    critic.finalWatchOutFor,
    3,
    writer.watchOutFor,
  );

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
