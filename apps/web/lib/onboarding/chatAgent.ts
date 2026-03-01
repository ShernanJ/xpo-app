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
import {
  validateDraft,
  type DraftCtaMode,
  type DraftValidationResult,
} from "./draftValidator";
import {
  isBroadDraftRequest,
  isBroadDiscoveryPrompt,
  isCorrectionPrompt,
  isMetaClarifyingPrompt,
  isThinCoachInput,
  validateCoachReplyText,
} from "./coachReply";
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
export type CreatorChatIntent = "coach" | "ideate" | "draft" | "review";
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
  topicAnchors: CreatorChatDebugFormatExemplar[];
  pinnedVoiceReferences: CreatorChatDebugFormatExemplar[];
  pinnedEvidenceReferences: CreatorChatDebugFormatExemplar[];
  evidencePack: CreatorChatDebugEvidencePack;
  formatBlueprint: string;
  formatSkeleton: string;
  outputShapeRationale: string;
  draftDiagnostics: CreatorChatDebugDraftDiagnostic[];
}

export interface CreatorChatDebugDraftDiagnostic {
  preview: string;
  score: number;
  chosen: boolean;
  evidenceCoverage: {
    entityMatches: number;
    metricMatches: number;
    proofMatches: number;
    total: number;
  };
  focusTermMatches: number;
  genericPhraseCount: number;
  strategyLeakCount: number;
  matchesBlueprint: boolean | null;
  matchesSkeleton: boolean | null;
  validator: DraftValidationResult | null;
  reasons: string[];
}

export interface CreatorChatReplyResult {
  reply: string;
  angles: string[];
  drafts: string[];
  draftArtifacts: CreatorDraftArtifact[];
  supportAsset: string | null;
  outputShape:
    | CreatorGenerationOutputShape
    | "ideation_angles"
    | "coach_question";
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
  angleSelection: AngleSelection;
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

type VolatilityLane =
  | "Project Showcase"
  | "Technical Insight"
  | "Build In Public"
  | "Operator Lessons"
  | "Social Observation";

type VolatilityGoal = "followers" | "replies" | "clicks";

type VolatilityOpenerType =
  | "contrarian claim"
  | "problem statement"
  | "vivid micro-story"
  | "hard rule"
  | "surprising statistic"
  | "single-sentence thesis"
  | "identity announcement"
  | "question";

interface AngleLever {
  id: string;
  type:
    | "identity"
    | "scale"
    | "speed"
    | "team"
    | "philosophy"
    | "origin"
    | "talent"
    | "contrarian"
    | "process"
    | "trap";
  title: string;
  description: string;
  exampleHooks: string[];
  allowedProof: {
    metrics: string[];
    entities: string[];
  };
}

interface AngleSelection {
  inferredLane: VolatilityLane;
  inferredGoal: VolatilityGoal;
  primary: AngleLever | null;
  secondary: AngleLever[];
  anchorOpenerType: VolatilityOpenerType;
  allowedOpenerTypes: Array<
    | "contrarian claim"
    | "problem statement"
    | "vivid micro-story"
    | "hard rule"
    | "surprising statistic"
    | "single-sentence thesis"
  >;
  metricReuseLimit: number;
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

function looksLikeRawAssetLabel(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return true;
  }

  if (/^[A-Za-z0-9_-]{12,}$/.test(trimmed) && !/\s/.test(trimmed)) {
    return true;
  }

  return (
    /^(best asset|suggested asset|image|video|photo|screenshot|demo|link)$/i.test(
      trimmed,
    ) ||
    trimmed.length < 18
  );
}

function buildDefaultVisualSupportIdeas(params: {
  contentFocus?: string | null;
  selectedAngle?: string | null;
  userMessage: string;
  evidencePack: CreatorChatDebugEvidencePack;
}): string {
  const focusSource =
    params.selectedAngle?.trim() ||
    params.contentFocus?.trim() ||
    params.userMessage.trim();
  const normalizedFocus = focusSource.toLowerCase();
  const proofSeed =
    params.evidencePack.proofPoints[0] ||
    params.evidencePack.metrics[0] ||
    params.evidencePack.entities[0] ||
    "the core proof";

  if (
    /\b(build|product|feature|ship|app|tool|demo|launch|workflow|prototype)\b/.test(
      normalizedFocus,
    )
  ) {
    return `Pair it with a clean product screenshot that makes ${proofSeed} visible, a 10-20 second screen recording of the exact flow, or a before/after visual that shows what changed.`;
  }

  if (/\b(operator|team|growth|process|system|metrics?)\b/.test(normalizedFocus)) {
    return `Pair it with a dashboard screenshot, an annotated metric snapshot, or a short walkthrough video that shows the operating constraint or proof behind ${proofSeed}.`;
  }

  if (
    /\b(user|customer|reply|dm|conversation|surprised|feedback|reaction)\b/.test(
      normalizedFocus,
    )
  ) {
    return `Pair it with a cropped screenshot of the real moment, a blurred DM or reply that captures the reaction, or a short voiceover clip that explains why ${proofSeed} changed your thinking.`;
  }

  return `Pair it with a real screenshot, a short screen recording, or an annotated visual that makes ${proofSeed} feel tangible instead of abstract.`;
}

function normalizeVisualSupportIdeas(params: {
  raw: string | null;
  contentFocus?: string | null;
  selectedAngle?: string | null;
  userMessage: string;
  evidencePack: CreatorChatDebugEvidencePack;
}): string | null {
  const raw = params.raw?.trim() ?? "";
  if (!raw || looksLikeRawAssetLabel(raw)) {
    return buildDefaultVisualSupportIdeas(params);
  }

  const normalized = raw
    .replace(/\s+/g, " ")
    .replace(/^best asset:?/i, "")
    .replace(/^suggested asset:?/i, "")
    .trim();

  if (!normalized || looksLikeRawAssetLabel(normalized)) {
    return buildDefaultVisualSupportIdeas(params);
  }

  if (
    /^pair it with\b/i.test(normalized) ||
    /\b(screenshot|screen recording|demo|video|photo|visual|walkthrough)\b/i.test(
      normalized,
    )
  ) {
    return normalized;
  }

  return `Pair it with ${normalized.charAt(0).toLowerCase()}${normalized.slice(1)}.`;
}

function buildDeterministicCoachReply(params: {
  userMessage: string;
  contentFocus?: string | null;
  selectedAngle?: string | null;
  debug: CreatorChatDebugInfo;
}): Omit<CreatorChatReplyResult, "source" | "model" | "mode"> {
  const promptSeed =
    params.selectedAngle?.trim() ||
    params.contentFocus?.trim() ||
    params.userMessage.trim() ||
    "the next post";
  const normalizedSeed = promptSeed.replace(/\s+/g, " ").trim();
  const conciseSeed =
    normalizedSeed.length > 72
      ? `${normalizedSeed.slice(0, 69).trimEnd()}...`
      : normalizedSeed;
  const reply =
    isBroadDiscoveryPrompt(params.userMessage) ||
    isBroadDraftRequest(params.userMessage)
      ? [
          "Sure, let's figure out what you actually want to write before we force a draft.",
          "A few easy directions: a project you're building, an update from something you shipped, or something useful you learned while building.",
          "Which one feels closest to the post you want right now?",
        ].join(" ")
      : isMetaClarifyingPrompt(params.userMessage)
    ? [
        "You're right, that detail should not be steering the post if it is not actually the point.",
        `What is the real moment you want the post to revolve around instead of ${conciseSeed}?`,
      ].join(" ")
    : isCorrectionPrompt(params.userMessage)
      ? [
          "That's fair, we should keep the lesson without forcing the wrong framing.",
          `What is the version of ${conciseSeed} you actually want to emphasize?`,
        ].join(" ")
      : [
          "You already have enough signal to write something specific, but the next draft will be much better if we anchor it to one real moment instead of a broad topic.",
          `Tell me the most recent situation where ${conciseSeed} became real in practice?`,
        ].join(" ");
  const validation = validateCoachReplyText(reply);
  const safeReply = validation.isValid
    ? reply
    : "You already have enough signal to write something specific, but the next draft will be much better if we anchor it to one real moment instead of a broad topic. Tell me the most recent situation where this became real in practice?";

  return {
    reply: safeReply,
    angles: [],
    drafts: [],
    draftArtifacts: [],
    supportAsset: null,
    outputShape: "coach_question",
    whyThisWorks: [],
    watchOutFor: [],
    debug: params.debug,
  };
}

function buildCoachSystemPrompt(params: {
  context: CreatorAgentContext;
  contract: CreatorGenerationContract;
}): string {
  const { context, contract } = params;

  return [
    "You are an X writing coach.",
    "Your job is to help the creator get from a broad idea to one concrete post-worthy moment.",
    "Be concise, human, and specific.",
    "Do not write drafts.",
    "If the user asks broadly what to post about, you may give 2-4 broad directions first, then end with one focused follow-up question.",
    "Do not turn those directions into angle cards or rigid frameworks.",
    "Respond in 2-3 sentences total.",
    "Sentence 1 should be a short coaching observation or recommendation.",
    "The final sentence must be exactly one focused follow-up question and must be the only sentence that ends with a question mark.",
    "Ask for one concrete episode, proof point, reaction, mistake, or moment the creator can build a post around.",
    "Do not ask multiple questions.",
    `Creator archetype: ${context.creatorProfile.archetype}.`,
    `Primary niche: ${context.creatorProfile.niche.primaryNiche}.`,
    `Primary loop: ${context.creatorProfile.distribution.primaryLoop}.`,
    `Preferred output shape after enough context: ${contract.planner.outputShape}.`,
  ].join("\n");
}

function buildCoachUserPrompt(params: {
  userMessage: string;
  contentFocus?: string | null;
  selectedAngle?: string | null;
  history: ChatHistoryMessage[];
}): string {
  const historyText =
    params.history.length > 0
      ? params.history
          .slice(-4)
          .map(
            (message) =>
              `${message.role.toUpperCase()}: ${compactTextForPrompt(message.content, 160)}`,
          )
          .join("\n")
      : "No prior conversation.";

  return [
    `Current user input: ${params.userMessage}`,
    params.contentFocus ? `Current focus lane: ${params.contentFocus}` : null,
    params.selectedAngle ? `Selected angle: ${params.selectedAngle}` : null,
    "Recent conversation:",
    historyText,
    "Ask one focused follow-up question that makes the next draft more specific.",
    "If the current input is still broad, first acknowledge it casually, offer 2-4 broad directions that fit the creator, then ask for one recent concrete moment.",
    "If the current input already names a moment, ask for the strongest detail, reaction, or outcome from that moment.",
    "If the user is correcting your framing or setting a boundary, acknowledge that first in one sentence, then ask one better follow-up question.",
    "If the user asks why you mentioned something irrelevant, answer that directly in one sentence, then ask one tighter replacement question.",
    'Return JSON only: {"reply":"..."}',
  ]
    .filter(Boolean)
    .join("\n");
}

function buildDeterministicFallback(params: {
  context: CreatorAgentContext;
  contract: CreatorGenerationContract;
  userMessage: string;
  intent?: CreatorChatIntent;
  contentFocus?: string | null;
  selectedAngle?: string | null;
  pinnedVoicePostIds?: string[];
  pinnedEvidencePostIds?: string[];
}): Omit<CreatorChatReplyResult, "source" | "model" | "mode"> {
  const { context, contract } = params;
  const pinnedVoiceAnchors = selectPinnedReferencePosts(
    context,
    params.pinnedVoicePostIds ?? [],
  );
  const pinnedEvidenceAnchors = selectPinnedReferencePosts(
    context,
    params.pinnedEvidencePostIds ?? [],
  );
  const fallbackFormatExemplar =
    pinnedVoiceAnchors[0] ??
    pickFormatExemplar({
      context,
      contract,
    });
  const fallbackEvidencePack = buildEvidencePack({
    formatExemplar: fallbackFormatExemplar,
    topicAnchors: context.positiveAnchors.slice(0, 2),
    evidenceAnchors: pinnedEvidenceAnchors,
  });
  const fallbackAngleSelection = selectAngleLevers({
    levers: extractLeversFromEvidence({
      formatExemplar: fallbackFormatExemplar,
      evidencePack: fallbackEvidencePack,
    }),
    inferredLane: inferVolatilityLane({
      contentFocus: params.contentFocus ?? null,
      userMessage: params.userMessage,
      selectedAngle: params.selectedAngle ?? null,
    }),
    inferredGoal: inferVolatilityGoal(context),
    targetLength: contract.planner.outputShape,
    anchorOpenerType: classifyOpenerType(fallbackFormatExemplar?.text ?? ""),
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
    topicAnchors: context.positiveAnchors
      .slice(0, 2)
      .map(buildFormatExemplarDebug)
      .filter((post): post is CreatorChatDebugFormatExemplar => post !== null),
    pinnedVoiceReferences: pinnedVoiceAnchors.map(buildFormatExemplarDebug).filter(
      (post): post is CreatorChatDebugFormatExemplar => post !== null,
    ),
    pinnedEvidenceReferences: pinnedEvidenceAnchors
      .map(buildFormatExemplarDebug)
      .filter((post): post is CreatorChatDebugFormatExemplar => post !== null),
    evidencePack: fallbackEvidencePack,
    formatBlueprint: fallbackFormatBlueprint,
    formatSkeleton: fallbackFormatSkeleton,
    outputShapeRationale: contract.planner.outputShapeRationale,
    draftDiagnostics: [],
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

  if (params.intent === "coach") {
    return buildDeterministicCoachReply({
      userMessage: params.userMessage,
      contentFocus: params.contentFocus ?? null,
      selectedAngle: params.selectedAngle ?? null,
      debug: debugInfo,
    });
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

    const fallbackSupportAsset = normalizeVisualSupportIdeas({
      raw:
        fallbackEvidencePack.metrics.length > 0 || fallbackEvidencePack.proofPoints.length > 0
          ? "Use the exact screenshot, metric, or artifact that proves the strongest evidence point."
          : "Use a real screenshot, short demo clip, or a product link only if it helps prove the point.",
      contentFocus: params.contentFocus ?? null,
      selectedAngle: params.selectedAngle?.trim() || null,
      userMessage: params.userMessage,
      evidencePack: fallbackEvidencePack,
    });

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
      supportAsset: fallbackSupportAsset,
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

  const fallbackDraftCandidates =
    contract.planner.outputShape === "long_form_post"
      ? buildDeterministicAuthorityDrafts({
          contract,
          angleSelection: fallbackAngleSelection,
          selectedAngle: params.selectedAngle?.trim() || null,
          userMessage: params.userMessage,
          evidencePack: fallbackEvidencePack,
        }).map((draft) => loosenDraftText(draft, contract))
      : uniqueEvidenceStrings(
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
  const fallbackDrafts = rerankDrafts({
    drafts: fallbackDraftCandidates,
    contract,
    angleSelection: fallbackAngleSelection,
    selectedAngle: params.selectedAngle?.trim() || null,
    concreteSubject: extractConcreteSubject(params.userMessage),
    userMessage: params.userMessage,
    formatExemplar: fallbackFormatExemplar,
    blueprintProfile: buildFormatBlueprintProfile({
      post: fallbackFormatExemplar,
      outputShape: contract.planner.outputShape,
    }),
    contentSkeleton: buildLongFormContentSkeleton(fallbackFormatExemplar),
    evidencePack: fallbackEvidencePack,
  });
  const fallbackDraftDiagnostics = buildDraftDiagnostics({
    drafts:
      fallbackDrafts.length > 0
        ? fallbackDrafts
        : [
            params.selectedAngle?.trim() ||
              `${topHook}: ${contract.planner.primaryAngle}`,
            `${topType} version: ${
              params.selectedAngle?.trim() || params.userMessage
            }`,
          ].map((draft) => loosenDraftText(draft, contract)),
    contract,
    angleSelection: fallbackAngleSelection,
    selectedAngle: params.selectedAngle?.trim() || null,
    concreteSubject: extractConcreteSubject(params.userMessage),
    userMessage: params.userMessage,
    blueprintProfile: buildFormatBlueprintProfile({
      post: fallbackFormatExemplar,
      outputShape: contract.planner.outputShape,
    }),
    contentSkeleton: buildLongFormContentSkeleton(fallbackFormatExemplar),
    evidencePack: fallbackEvidencePack,
  });

  const fallbackDraftSupportAsset = normalizeVisualSupportIdeas({
    raw:
      fallbackEvidencePack.metrics.length > 0 || fallbackEvidencePack.proofPoints.length > 0
        ? "Attach the real screenshot, metric, or artifact that proves the strongest evidence point."
        : "If you mention a product or project, attach a screenshot or quick demo instead of a generic link.",
    contentFocus: params.contentFocus ?? null,
    selectedAngle: params.selectedAngle?.trim() || null,
    userMessage: params.userMessage,
    evidencePack: fallbackEvidencePack,
  });

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
      supportAsset: fallbackDraftSupportAsset,
    }),
    supportAsset: fallbackDraftSupportAsset,
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
    debug: {
      ...debugInfo,
      draftDiagnostics: fallbackDraftDiagnostics,
    },
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
  pinnedVoicePostIds?: string[];
  pinnedEvidencePostIds?: string[];
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
    pinnedVoicePostIds: params.pinnedVoicePostIds ?? [],
    pinnedEvidencePostIds: params.pinnedEvidencePostIds ?? [],
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
  maxOutputTokens?: number;
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
    ...(typeof params.maxOutputTokens === "number"
      ? { max_tokens: params.maxOutputTokens }
      : {}),
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
      ...(typeof params.maxOutputTokens === "number"
        ? { max_tokens: params.maxOutputTokens }
        : {}),
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

function getStageMaxOutputTokens(params: {
  stage: ChatModelStage;
  intent: CreatorChatIntent;
  outputShape?: CreatorGenerationOutputShape | "ideation_angles";
}): number {
  if (params.stage === "planner") {
    return 320;
  }

  if (params.stage === "critic") {
    return params.outputShape === "long_form_post" ||
      params.outputShape === "thread_seed"
      ? 1100
      : 700;
  }

  if (params.outputShape === "long_form_post") {
    return 1600;
  }

  if (params.outputShape === "thread_seed") {
    return 1200;
  }

  return params.intent === "ideate" ? 900 : 800;
}

function summarizeWriterOutputForCritic(writer: WriterOutput): string {
  return JSON.stringify({
    response: compactTextForPrompt(writer.response, 220),
    angles: writer.angles.slice(0, 4),
    drafts: writer.drafts.slice(0, 3).map((draft) => compactTextForPrompt(draft, 280)),
    supportAsset: compactTextForPrompt(writer.supportAsset, 100),
    whyThisWorks: writer.whyThisWorks.slice(0, 3),
    watchOutFor: writer.watchOutFor.slice(0, 3),
  });
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
    `Casing=${voice.primaryCasing}; Length=${voice.averageLengthBand}; Lowercase=${voice.lowercaseSharePercent}%; Questions=${voice.questionPostRate}%; Multiline=${voice.multiLinePostRate}%`,
    `Style notes: ${voice.styleNotes.slice(0, 2).join(" | ") || "none"}`,
  ].join("\n");
}

function compactTextForPrompt(text: string, maxLength = 180): string {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
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
        `${index + 1}. ${post.id} [goal-fit ${post.goalFitScore}] (${post.selectionReason}) -> ${compactTextForPrompt(post.text)}`,
    ),
  ].join("\n");
}

function formatNegativeAnchorSummary(
  anchors: CreatorRepresentativePost[],
  limit: number,
): string {
  const selected = anchors.slice(0, limit);

  if (selected.length === 0) {
    return "Negative anchors: none";
  }

  return [
    "Negative anchors:",
    ...selected.map(
      (post, index) =>
        `${index + 1}. ${post.id} (${post.selectionReason}) -> ${compactTextForPrompt(post.text, 140)}`,
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
  pinnedEvidenceAnchors: CreatorRepresentativePost[];
}): RequestConditionedAnchors {
  const pool = params.context.positiveAnchors;

  if (pool.length === 0) {
    const emptyEvidencePack = buildEvidencePack({
      formatExemplar: null,
      topicAnchors: [],
      evidenceAnchors: params.pinnedEvidenceAnchors,
    });
    return {
      topicAnchors: [],
      laneAnchors: [],
      formatAnchors: [],
      formatExemplar: null,
      evidencePack: emptyEvidencePack,
      angleSelection: selectAngleLevers({
        levers: extractLeversFromEvidence({
          formatExemplar: null,
          evidencePack: emptyEvidencePack,
        }),
        inferredLane: inferVolatilityLane({
          contentFocus: params.contentFocus,
          userMessage: params.userMessage,
          selectedAngle: params.selectedAngle,
        }),
        inferredGoal: inferVolatilityGoal(params.context),
        anchorOpenerType: "single-sentence thesis",
        targetLength: params.contract.planner.outputShape,
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
  const evidencePack = buildEvidencePack({
    formatExemplar,
    topicAnchors,
    evidenceAnchors: params.pinnedEvidenceAnchors,
  });
  const anchorOpenerType = classifyOpenerType(formatExemplar?.text ?? "");

  return {
    topicAnchors,
    laneAnchors,
    formatAnchors,
    formatExemplar,
    evidencePack,
    angleSelection: selectAngleLevers({
      levers: extractLeversFromEvidence({
        formatExemplar,
        evidencePack,
      }),
      inferredLane: inferVolatilityLane({
        contentFocus: params.contentFocus,
        userMessage: params.userMessage,
        selectedAngle: params.selectedAngle,
      }),
      inferredGoal: inferVolatilityGoal(params.context),
      anchorOpenerType,
      targetLength: params.contract.planner.outputShape,
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

function buildPinnedReferenceCandidatePool(
  context: CreatorAgentContext,
): CreatorRepresentativePost[] {
  return dedupeRepresentativePosts([
    ...context.creatorProfile.examples.voiceAnchors,
    ...context.creatorProfile.examples.replyVoiceAnchors,
    ...context.creatorProfile.examples.quoteVoiceAnchors,
    ...context.creatorProfile.examples.strategyAnchors,
    ...context.creatorProfile.examples.goalAnchors,
    ...context.creatorProfile.examples.bestPerforming,
  ]);
}

function selectPinnedReferencePosts(
  context: CreatorAgentContext,
  pinnedPostIds: string[],
): CreatorRepresentativePost[] {
  if (pinnedPostIds.length === 0) {
    return [];
  }

  const candidates = buildPinnedReferenceCandidatePool(context);
  const candidateMap = new Map(candidates.map((post) => [post.id, post]));

  return pinnedPostIds
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

function stripEvidenceListMarker(line: string): string {
  return line.replace(/^[-*•]\s*/, "").trim();
}

function isMetricLikeEvidenceLine(line: string): boolean {
  const normalized = stripEvidenceListMarker(line);

  if (!/\d/.test(normalized) || /:$/.test(normalized)) {
    return false;
  }

  return (
    /^[-*•]\s/.test(line) ||
    /\$|%|\b(arr|mrr|engineers?|users?|creators?|people|days?|months?|years?|profitable|processed)\b/i.test(
      normalized,
    )
  );
}

function isProofLikeEvidenceLine(line: string): boolean {
  const normalized = stripEvidenceListMarker(line);

  if (/:$/.test(normalized)) {
    return false;
  }

  return (
    /^[-*•]\s/.test(line) ||
    /\b(built|build|hit|processed|grew|launched|shipped|power|scaled|profitable|used|reached)\b/i.test(
      normalized,
    )
  );
}

function extractAtomicEvidenceFragments(
  lines: string[],
  limit: number,
  maxLength: number,
): string[] {
  return uniqueEvidenceStrings(
    lines.map((line) => compactTextForPrompt(stripEvidenceListMarker(line), maxLength)),
    limit,
  );
}

function extractEvidenceEntities(text: string): string[] {
  const entities: string[] = [];
  const stopwords = new Set([
    "I",
    "If",
    "And",
    "But",
    "The",
    "This",
    "That",
    "What",
    "How",
    "Why",
    "When",
    "Here",
    "Use",
    "Original",
    "Built",
    "Build",
    "Hit",
    "Reply",
    "Follow",
    "Random",
    "PDF",
  ]);

  for (const mention of text.match(/@\w+/g) ?? []) {
    entities.push(mention);
  }

  for (const match of text.matchAll(/\b(?:[A-Z][A-Za-z0-9$+/.-]*)(?:\s+[A-Z][A-Za-z0-9$+/.-]*){0,3}\b/g)) {
    const candidate = match[0].trim();
    if (candidate.length < 3) {
      continue;
    }
    if (stopwords.has(candidate)) {
      continue;
    }
    entities.push(candidate);
  }

  return uniqueEvidenceStrings(entities, 8);
}

function buildEvidencePack(params: {
  formatExemplar: CreatorRepresentativePost | null;
  topicAnchors: CreatorRepresentativePost[];
  evidenceAnchors?: CreatorRepresentativePost[];
}): CreatorChatDebugEvidencePack {
  const sourcePosts = dedupeRepresentativePosts(
    [
      ...(params.evidenceAnchors ?? []).slice(0, 2),
      params.formatExemplar,
      ...params.topicAnchors.slice(0, 2),
    ].filter((post): post is CreatorRepresentativePost => post !== null),
  );
  const allLines = sourcePosts.flatMap((post) => extractEvidenceLines(post.text));
  const metricLines = allLines.filter(isMetricLikeEvidenceLine);
  const proofLines = allLines.filter(isProofLikeEvidenceLine);
  const storyLines = allLines.filter((line) =>
    /\b(i|i'm|i’ve|i've|my|me)\b/i.test(line) && !/:$/.test(line),
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
  const metrics = extractAtomicEvidenceFragments(metricLines, 4, 72);
  const proofPoints = extractAtomicEvidenceFragments(proofLines, 5, 88);
  const storyBeats = extractAtomicEvidenceFragments(storyLines, 3, 88);
  const constraints = extractAtomicEvidenceFragments(constraintLines, 3, 72);

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

const VOLATILITY_ALLOWED_OPENERS: Array<
  | "contrarian claim"
  | "problem statement"
  | "vivid micro-story"
  | "hard rule"
  | "surprising statistic"
  | "single-sentence thesis"
> = [
  "contrarian claim",
  "problem statement",
  "vivid micro-story",
  "hard rule",
  "surprising statistic",
  "single-sentence thesis",
];

function inferVolatilityLane(params: {
  contentFocus: string | null;
  userMessage: string;
  selectedAngle: string | null;
}): VolatilityLane {
  const text = [
    params.contentFocus,
    params.userMessage,
    params.selectedAngle,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b(project|showcase|demo|ship|launched?)\b/.test(text)) {
    return "Project Showcase";
  }
  if (/\b(technical|tutorial|engineering|code|architecture|infra|debug)\b/.test(text)) {
    return "Technical Insight";
  }
  if (/\b(build in public|building in public|build|ship|shipped)\b/.test(text)) {
    return "Build In Public";
  }
  if (/\b(operator|ops|founder|startup|scale|distribution|team)\b/.test(text)) {
    return "Operator Lessons";
  }
  return "Social Observation";
}

function inferVolatilityGoal(context: CreatorAgentContext): VolatilityGoal {
  if (context.creatorProfile.distribution.primaryLoop === "reply_driven") {
    return "replies";
  }
  if (context.creatorProfile.strategy.primaryGoal === "leads") {
    return "clicks";
  }
  return "followers";
}

function classifyOpenerType(text: string): VolatilityOpenerType {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return "single-sentence thesis";
  }

  const firstSentence = extractFirstSentence(trimmed).toLowerCase();

  if (firstSentence.endsWith("?")) {
    return "question";
  }
  if (
    /\bhere'?s who i am\b|\bhere'?s what i do\b|\bi'm [a-z0-9@._-]+,/.test(
      firstSentence,
    )
  ) {
    return "identity announcement";
  }
  if (/^(most|too many|the problem|nobody talks about)\b/.test(firstSentence)) {
    return "problem statement";
  }
  if (/^(never|always|stop|do not|don't)\b/.test(firstSentence)) {
    return "hard rule";
  }
  if (/^(i |when i |i grew up|years ago|last year|the first time)\b/.test(firstSentence)) {
    return "vivid micro-story";
  }
  if (/\b\d/.test(firstSentence)) {
    return "surprising statistic";
  }
  if (
    /\b(wrong|broken|overrated|underrated|backwards|myth|mistake)\b/.test(
      firstSentence,
    )
  ) {
    return "contrarian claim";
  }

  return "single-sentence thesis";
}

function extractFirstSentence(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  const match = normalized.match(/.+?(?:[.!?](?=\s|$)|$)/);
  return match?.[0]?.trim() ?? normalized;
}

function extractFirstWords(text: string, count: number): string {
  return text
    .trim()
    .split(/\s+/)
    .slice(0, count)
    .join(" ")
    .toLowerCase();
}

function createLever(
  id: AngleLever["id"],
  type: AngleLever["type"],
  title: string,
  description: string,
  exampleHooks: string[],
  metrics: string[],
  entities: string[],
): AngleLever {
  return {
    id,
    type,
    title,
    description,
    exampleHooks,
    allowedProof: {
      metrics: uniqueEvidenceStrings(metrics, 4),
      entities: uniqueEvidenceStrings(entities, 4),
    },
  };
}

function extractLeversFromEvidence(params: {
  formatExemplar: CreatorRepresentativePost | null;
  evidencePack: CreatorChatDebugEvidencePack;
}): AngleLever[] {
  const sourceText = [
    params.formatExemplar?.text ?? "",
    ...params.evidencePack.storyBeats,
    ...params.evidencePack.proofPoints,
    ...params.evidencePack.constraints,
  ]
    .join("\n")
    .toLowerCase();
  const metrics = params.evidencePack.metrics;
  const entities = params.evidencePack.entities;
  const levers: AngleLever[] = [];

  if (/\b(small team|team|engineers?)\b/.test(sourceText)) {
    levers.push(
      createLever(
        "small-team-dominance",
        "team",
        "small team dominance",
        "show how lean teams outperform through clarity, talent density, and execution",
        [
          "small teams don't lose because they're small",
          "lean teams can outrun bigger orgs",
        ],
        metrics.filter((metric) => /\b(engineer|team|people|users?)\b/i.test(metric)),
        entities,
      ),
    );
  }

  if (/\b(ignore|ignored|best practices?)\b/.test(sourceText)) {
    levers.push(
      createLever(
        "ignore-best-practices",
        "contrarian",
        "ignoring best practices",
        "frame execution as winning by rejecting default playbooks",
        [
          "most best practices are inherited drag",
          "the default playbook breaks more companies than it saves",
        ],
        metrics,
        entities,
      ),
    );
  }

  if (/\b(grew up|immigrat|small town|winter|lens)\b/.test(sourceText)) {
    levers.push(
      createLever(
        "origin-lens",
        "origin",
        "origin lens",
        "use a formative personal arc to frame current operating beliefs",
        [
          "how you grow changes when you have rebuilt from nothing",
        ],
        metrics.filter((metric) => /\$|\b\d/.test(metric)),
        entities,
      ),
    );
  }

  if (/\b(hiring|talent|top 1%|waiting years?)\b/.test(sourceText)) {
    levers.push(
      createLever(
        "talent-density",
        "talent",
        "talent density over speed",
        "prioritize hiring quality and patience over fast headcount growth",
        [
          "hiring slower can speed the company up",
        ],
        metrics,
        entities,
      ),
    );
  }

  if (/\b(trap|mistake|kill companies|quietly kill)\b/.test(sourceText)) {
    levers.push(
      createLever(
        "founder-traps",
        "trap",
        "founder traps",
        "surface the hidden mistakes that look harmless until they compound",
        [
          "most founders don't die from obvious mistakes",
        ],
        metrics,
        entities,
      ),
    );
  }

  if (metrics.length > 0) {
    levers.push(
      createLever(
        "proof-led-scale",
        "scale",
        "proof-led scale",
        "lead with concrete operating proof instead of abstract claims",
        [
          "if you want to talk about scale, bring receipts",
        ],
        metrics,
        entities,
      ),
    );
  }

  if (
    /\b(execution|process|discipline|systems|delete 80%|doing less, not more)\b/.test(
      sourceText,
    )
  ) {
    levers.push(
      createLever(
        "execution-philosophy",
        "process",
        "execution philosophy",
        "turn the creator's operating philosophy into the core lesson",
        [
          "scale is usually a process problem before it's a resource problem",
        ],
        metrics,
        entities,
      ),
    );
  }

  if (levers.length === 0) {
    levers.push(
      createLever(
        "concrete-proof-angle",
        "philosophy",
        "concrete proof over vague advice",
        "anchor the post in the strongest available concrete proof",
        ["the fastest way to sound credible is to be specific"],
        metrics,
        entities,
      ),
    );
  }

  return dedupeLevers(levers);
}

function dedupeLevers(levers: AngleLever[]): AngleLever[] {
  const seen = new Set<string>();
  return levers.filter((lever) => {
    if (seen.has(lever.id)) {
      return false;
    }
    seen.add(lever.id);
    return true;
  });
}

function selectAngleLevers(params: {
  levers: AngleLever[];
  inferredLane: VolatilityLane;
  inferredGoal: VolatilityGoal;
  anchorOpenerType: VolatilityOpenerType;
  targetLength: CreatorGenerationOutputShape;
}): AngleSelection {
  const scored = params.levers
    .map((lever) => {
      let score = 0;

      if (params.inferredLane === "Operator Lessons") {
        if (
          ["team", "process", "contrarian", "trap", "talent"].includes(lever.type)
        ) {
          score += 4;
        }
      } else if (params.inferredLane === "Build In Public") {
        if (["origin", "process", "speed", "identity"].includes(lever.type)) {
          score += 4;
        }
      } else if (params.inferredLane === "Project Showcase") {
        if (["scale", "speed", "process"].includes(lever.type)) {
          score += 4;
        }
      } else if (params.inferredLane === "Technical Insight") {
        if (["process", "contrarian", "team"].includes(lever.type)) {
          score += 3;
        }
      } else if (["identity", "origin", "contrarian"].includes(lever.type)) {
        score += 3;
      }

      if (params.inferredGoal === "followers") {
        if (["contrarian", "identity", "trap", "origin"].includes(lever.type)) {
          score += 2;
        }
      } else if (params.inferredGoal === "replies") {
        if (["trap", "contrarian", "process"].includes(lever.type)) {
          score += 2;
        }
      } else if (["scale", "team", "talent"].includes(lever.type)) {
        score += 2;
      }

      if (params.targetLength === "long_form_post" || params.targetLength === "thread_seed") {
        score += lever.allowedProof.metrics.length > 0 ? 2 : 0;
      }

      return { lever, score };
    })
    .sort((left, right) => right.score - left.score);

  const primary = scored[0]?.lever ?? null;
  const secondary = primary
    ? scored
        .slice(1)
        .map((item) => item.lever)
        .filter((lever) => lever.type !== primary.type)
        .slice(0, 2)
    : [];

  const allowedOpenerTypes = VOLATILITY_ALLOWED_OPENERS.filter(
    (type) => type !== params.anchorOpenerType,
  );
  const metricReuseLimit =
    params.targetLength === "long_form_post" ? 4 : 2;

  return {
    inferredLane: params.inferredLane,
    inferredGoal: params.inferredGoal,
    primary,
    secondary,
    anchorOpenerType: params.anchorOpenerType,
    allowedOpenerTypes:
      allowedOpenerTypes.length > 0 ? allowedOpenerTypes : VOLATILITY_ALLOWED_OPENERS,
    metricReuseLimit,
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
    `Entities: ${evidencePack.entities.join(" | ") || "none"}`,
    `Metrics: ${evidencePack.metrics.join(" | ") || "none"}`,
    `Proof points: ${evidencePack.proofPoints.join(" | ") || "none"}`,
    `Story beats: ${evidencePack.storyBeats.join(" | ") || "none"}`,
    `Constraints: ${evidencePack.constraints.join(" | ") || "none"}`,
    `Required evidence count: ${evidencePack.requiredEvidenceCount}`,
    `Source posts: ${evidencePack.sourcePostIds.join(" | ") || "none"}`,
  ].join("\n");
}

function formatAngleSelection(angleSelection: AngleSelection): string {
  const primary = angleSelection.primary;
  const secondary =
    angleSelection.secondary.length > 0
      ? angleSelection.secondary.map((lever) => lever.title).join(" | ")
      : "none";

  return [
    `Inferred lane: ${angleSelection.inferredLane}`,
    `Inferred goal: ${angleSelection.inferredGoal}`,
    `Primary lever: ${primary ? `${primary.id} | ${primary.title} | ${primary.description}` : "none"}`,
    `Secondary levers: ${secondary}`,
    `Allowed opener types: ${angleSelection.allowedOpenerTypes.join(" | ")}`,
    `Anchor opener type to avoid: ${angleSelection.anchorOpenerType}`,
    `Metric reuse limit: ${angleSelection.metricReuseLimit}`,
    `Primary lever metrics: ${primary?.allowedProof.metrics.join(" | ") || "none"}`,
    `Primary lever entities: ${primary?.allowedProof.entities.join(" | ") || "none"}`,
  ].join("\n");
}

function buildAngleIsolationLine(angleSelection: AngleSelection): string {
  if (!angleSelection.primary) {
    return "No strong primary lever is available. Stay concrete and pick one specific claim, not a broad category.";
  }

  return `Use exactly one primary angle lever: ${angleSelection.primary.title}. You may support it with at most two secondary levers (${angleSelection.secondary.map((lever) => lever.title).join(" | ") || "none"}), but the draft must clearly read as being about the primary lever.`;
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

interface AuthorityRenderContractCheck {
  validator: DraftValidationResult;
  sectionCount: number;
  wordCount: number;
  blankLineSeparators: number;
  hasProofHeader: boolean;
  bulletCount: number;
  hasMechanismHeader: boolean;
  numberedCount: number;
  hasValidCta: boolean;
  finalLineIsQuestion: boolean;
  openerIsQuestion: boolean;
  genericDefinitionHits: number;
  isCompliant: boolean;
}

function pickAuthorityCtaTemplate(params: {
  lane: VolatilityLane;
  goal: VolatilityGoal;
}): string {
  const ctaMode = resolveAuthorityCtaMode(params);
  if (ctaMode === "A") {
    return 'CTA: Reply "PLAYBOOK" and I\'ll send the operator breakdown.';
  }
  if (ctaMode === "C") {
    return "CTA: Comment your bottleneck and I'll reply with the first 3 moves.";
  }
  return "CTA: Follow — I'm posting operator lessons for the next 14 days.";
}

function buildAuthorityCtaBody(params: {
  lane: VolatilityLane;
  goal: VolatilityGoal;
}): string {
  const ctaMode = resolveAuthorityCtaMode(params);
  if (ctaMode === "A") {
    return 'Reply "PLAYBOOK" and I\'ll send the operator breakdown.';
  }
  if (ctaMode === "C") {
    return "Comment your bottleneck and I'll reply with the first 3 moves.";
  }
  return "Follow — I'm posting operator lessons for the next 14 days.";
}

function resolveAuthorityCtaMode(params: {
  lane: VolatilityLane;
  goal: VolatilityGoal;
}): DraftCtaMode {
  if (params.goal === "followers") {
    return "B";
  }

  if (params.goal === "clicks") {
    return "A";
  }

  return "C";
}

function formatAuthorityRenderContract(params: {
  lane: VolatilityLane;
  goal: VolatilityGoal;
  targetCasing: CreatorGenerationContract["writer"]["targetCasing"];
}): string {
  const ctaTemplate = pickAuthorityCtaTemplate({
    lane: params.lane,
    goal: params.goal,
  });

  return [
    "Authority render contract (must follow exactly for long-form drafts):",
    "Return ONLY the final draft text.",
    "Exactly 4 sections, each separated by exactly one blank line.",
    'Section 1 starts with "THESIS:" on its own line and contains 1-2 declarative lines. No questions in the thesis.',
    'Section 2 starts with "PROOF:" on its own line and contains exactly 3 bullet lines beginning with "- ". At least 2 bullets must carry numeric proof when metrics exist.',
    'Section 3 starts with "MECHANISM:" on its own line and contains exactly 3 numbered lines beginning with "1) ", "2) ", "3) ". Each line must be a concrete step.',
    'Section 4 starts with "CTA:" on its own line, then 2-4 lines total in that section body. The final line must be a valid CTA and a statement, not a question.',
    "Keep total length between 90 and 190 words.",
    "Keep every line at or under 92 characters.",
    "No 5-word sequence from the selected exemplar may appear verbatim.",
    `Default CTA mode for this request: ${ctaTemplate}`,
    params.targetCasing === "lowercase"
      ? 'Use lowercase everywhere except proper nouns. Keep the labels "THESIS:", "PROOF:", "MECHANISM:", and "CTA:" uppercase.'
      : "Keep natural casing that matches the creator's actual voice.",
    "Do not define concepts or write vague abstractions. Every claim needs a mechanism or example.",
  ].join(" ");
}

function checkAuthorityRenderContract(params: {
  draft: string;
  exemplarText: string;
  evidenceMetrics: string[];
  ctaMode: DraftCtaMode;
}): AuthorityRenderContractCheck {
  const trimmed = params.draft.trim();
  const sections = trimmed
    .split(/\n[ \t]*\n/)
    .map((section) => section.trim())
    .filter(Boolean);
  const linesBySection = sections.map((section) =>
    section
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const proofLines = linesBySection[1] ?? [];
  const mechanismLines = linesBySection[2] ?? [];
  const closingLines = linesBySection[3] ?? [];
  const thesisLines = linesBySection[0] ?? [];
  const finalLine = closingLines[closingLines.length - 1] ?? "";
  const genericDefinitionHits =
    countPhraseMatches(trimmed, [
      "the key is",
      "important because",
      "allows for",
      "x is",
      "it is",
    ]) + (/\ballows for\b/i.test(trimmed) ? 1 : 0);
  const validator = validateDraft({
    draft: trimmed,
    mode: "long_form_post",
    exemplarText: params.exemplarText,
    evidenceMetrics: params.evidenceMetrics,
    ctaMode: params.ctaMode,
  });

  return {
    validator,
    sectionCount: validator.metrics.sectionCount,
    wordCount: validator.metrics.wordCount,
    blankLineSeparators: validator.metrics.blankLineSeparators,
    hasProofHeader: proofLines[0] === "PROOF:",
    bulletCount: validator.metrics.proofBullets,
    hasMechanismHeader: mechanismLines[0] === "MECHANISM:",
    numberedCount: validator.metrics.mechanismSteps,
    hasValidCta: !validator.errors.includes("E_INVALID_CTA"),
    finalLineIsQuestion: /\?\s*$/.test(finalLine),
    openerIsQuestion: thesisLines.slice(1).some((line) => line.includes("?")),
    genericDefinitionHits,
    isCompliant: validator.pass && genericDefinitionHits === 0,
  };
}

function sanitizeDeterministicEvidenceFragment(value: string): string {
  return stripEvidenceListMarker(value)
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.:;,\s]+$/g, "")
    .trim();
}

function buildDeterministicProofImplication(fragment: string): string {
  const lowered = fragment.toLowerCase();

  if (/\bengineers?\b|\bteam\b|\bpeople\b/.test(lowered)) {
    return "which proves leverage compounds when the bar stays high";
  }

  if (/\barr\b|\bmrr\b|\$|\brevenue\b|\bprofitable\b/.test(lowered)) {
    return "which shows focus can turn into durable growth fast";
  }

  if (/\busers?\b|\bcreators?\b|\bcustomers?\b/.test(lowered)) {
    return "which means the product solved a repeated pain at real scale";
  }

  if (/\bday\b|\bmonth\b|\byear\b|\bweek\b/.test(lowered)) {
    return "which matters because speed only counts when it compounds";
  }

  return "which matters because the mechanism was stronger than the hype";
}

function buildDeterministicMechanismHints(params: {
  selectedAngle: string | null;
  contract: CreatorGenerationContract;
  evidencePack: CreatorChatDebugEvidencePack;
}): string[] {
  const angle = (params.selectedAngle || params.contract.planner.primaryAngle).toLowerCase();
  const hints: string[] = [];

  if (/\bteam\b|\bhire\b|\btalent\b/.test(angle)) {
    hints.push("keep the team small enough that every strong hire changes output");
    hints.push("raise the talent bar so ownership is obvious on every project");
  }

  if (/\bdistribution\b|\bgrowth\b|\bmetric\b/.test(angle)) {
    hints.push("tie execution to a tiny set of metrics you can defend every week");
    hints.push("build repeatable distribution loops before adding more surface area");
  }

  if (/\bprocess\b|\boperator\b|\bexecution\b/.test(angle)) {
    hints.push("cut work aggressively until only the highest-leverage moves survive");
  }

  if (params.evidencePack.constraints[0]) {
    hints.push(`keep a hard constraint in place: ${sanitizeDeterministicEvidenceFragment(params.evidencePack.constraints[0]).toLowerCase()}`);
  }

  if (params.evidencePack.storyBeats[0]) {
    hints.push("turn one concrete operating detail into a repeatable standard");
  }

  hints.push("make the operating system obvious enough that results look repeatable");

  return uniqueEvidenceStrings(hints, 3);
}

function buildDeterministicAuthorityDrafts(params: {
  contract: CreatorGenerationContract;
  angleSelection: AngleSelection;
  selectedAngle: string | null;
  userMessage: string;
  evidencePack: CreatorChatDebugEvidencePack;
}): string[] {
  const angle =
    params.selectedAngle?.trim() ||
    params.angleSelection.primary?.title ||
    params.contract.planner.primaryAngle;
  const compactProof = uniqueEvidenceStrings(
    [
      ...params.evidencePack.metrics,
      ...params.evidencePack.proofPoints,
      ...params.evidencePack.constraints,
    ].map(sanitizeDeterministicEvidenceFragment),
    3,
  );
  const proofLines = compactProof
    .slice(0, 3)
    .map(
      (fragment) =>
        `- ${fragment} ${buildDeterministicProofImplication(fragment)}`,
    );
  while (proofLines.length < 3) {
    proofLines.push(
      "- the strongest results came from one repeatable operating advantage, not more complexity",
    );
  }

  const mechanismHints = buildDeterministicMechanismHints({
    selectedAngle: params.selectedAngle ?? null,
    contract: params.contract,
    evidencePack: params.evidencePack,
  });
  const numberedLines = mechanismHints.map((hint, index) => `${index + 1}) ${hint}`);
  while (numberedLines.length < 3) {
    numberedLines.push(
      `${numberedLines.length + 1}) keep the proof tied to one operating rule people can reuse`,
    );
  }

  const ctaBody = buildAuthorityCtaBody({
    lane: params.angleSelection.inferredLane,
    goal: params.angleSelection.inferredGoal,
  });
  const proofLead = compactProof[0]?.toLowerCase() || "the strongest operating proof";
  const thesisA = `${angle.replace(/[.?!]+$/g, "")} is only interesting when the proof is undeniable.`;
  const thesisB = `most people talk about ${angle.toLowerCase()}. the real advantage is the operating system behind it.`;
  const nextTopic = `${formatEnumLabel(params.angleSelection.inferredLane).toLowerCase()} systems that keep compounding when the team stays small`;
  const closeA = "the edge is not more people. the edge is better constraints and cleaner execution.";
  const closeB = "if the system is real, the proof will keep showing up without more noise.";

  const draftA = [
    ["THESIS:", thesisA, `${sanitizeDeterministicEvidenceFragment(proofLead)} is the receipt, not the headline.`].join("\n"),
    ["PROOF:", ...proofLines].join("\n"),
    ["MECHANISM:", ...numberedLines].join("\n"),
    ["CTA:", closeA, `i'll keep breaking down ${nextTopic}.`, ctaBody].join("\n"),
  ].join("\n\n");

  const draftB = [
    ["THESIS:", thesisB, "small teams only win when the mechanism is clear enough to repeat."].join("\n"),
    ["PROOF:", ...proofLines.slice().reverse()].join("\n"),
    [
      "MECHANISM:",
      `${1}) ${numberedLines[1]?.replace(/^2\)\s*/, "") || mechanismHints[0]}`,
      `${2}) ${numberedLines[0]?.replace(/^1\)\s*/, "") || mechanismHints[1]}`,
      `${3}) ${numberedLines[2]?.replace(/^3\)\s*/, "") || mechanismHints[2]}`,
    ].join("\n"),
    ["CTA:", closeB, `i'll keep posting the operator lessons behind ${nextTopic}.`, ctaBody].join("\n"),
  ].join("\n\n");

  return [draftA, draftB];
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

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const isThinVoiceSample =
    wordCount < 6 ||
    trimmed.length < 48 ||
    /^(project showcase|technical insight|build in public|operator lessons|social observation)$/i.test(
      trimmed,
    );

  if (isThinVoiceSample) {
    return [
      "Live request is too thin to override the established creator voice.",
      "Use it as a topical hint only, not as a casing or structure signal.",
    ].join("\n");
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
    "Only let the current user message style override the established voice when it is clearly specific and stronger than the existing anchors.",
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
    context.creatorProfile.voice.primaryCasing === "lowercase" &&
    context.creatorProfile.voice.lowercaseSharePercent >= 72 &&
    context.creatorProfile.voice.multiLinePostRate < 35
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
  const angleSelectionLine = formatAngleSelection(requestAnchors.angleSelection);
  const formatBlueprint = buildFormatBlueprint({
    post: requestAnchors.formatExemplar,
    outputShape: contract.planner.outputShape,
  });
  const formatSkeleton = formatLongFormSkeleton(
    buildLongFormContentSkeleton(requestAnchors.formatExemplar),
  );
  const authorityRenderContract =
    contract.planner.outputShape === "long_form_post"
      ? formatAuthorityRenderContract({
          lane: requestAnchors.angleSelection.inferredLane,
          goal: requestAnchors.angleSelection.inferredGoal,
          targetCasing: contract.writer.targetCasing,
        })
      : null;

  return [
    "You are the writer for an X growth assistant.",
    "Write one high-quality assistant response package for the user.",
    intent === "ideate"
      ? "Return a short strategic response, 0-4 angle candidates, why the direction fits, and what to watch out for."
      : "Return a short strategic response, 4-6 concrete draft candidates, why they fit, and what to watch out for.",
    "The package must be directly useful, specific, and aligned to the deterministic contract.",
    "Priority order: selected angle -> concrete subject -> evidence pack -> explicit content focus -> user request.",
    "The retrieved evidence pack is the concrete topic ground truth. Treat it as the main factual source whenever the request is compatible with it.",
    selectedAngle
      ? `Selected angle (highest-priority topic constraint): ${selectedAngle}`
      : "Selected angle (highest-priority topic constraint): none",
    `Angle volatility engine:\n${angleSelectionLine}`,
    buildAngleIsolationLine(requestAnchors.angleSelection),
    concreteSubject
      ? `Concrete subject (keep this wording family): ${concreteSubject}`
      : "Concrete subject (keep this wording family): none",
    `Concrete evidence pack (high-salience factual source):\n${evidencePackLine}`,
    requestAnchors.evidencePack.requiredEvidenceCount > 0
      ? `Reuse at least ${requestAnchors.evidencePack.requiredEvidenceCount} concrete evidence point(s) from the evidence pack when drafting.`
      : "No minimum evidence reuse requirement is available.",
    `Reuse at most ${requestAnchors.angleSelection.metricReuseLimit} metric proof point(s) in a single draft.`,
    `Format exemplar (imitate structure, not topic): ${formatExemplarLine}`,
    `Structural blueprint: ${formatBlueprint}`,
    `Long-form content skeleton: ${formatSkeleton}`,
    authorityRenderContract,
    `Required output shape: ${contract.planner.outputShape}.`,
    `Output shape rationale: ${contract.planner.outputShapeRationale}`,
    "Do not reuse or lightly paraphrase the exemplar's wording. Use it for structure and evidence only.",
    "Do not copy the anchor first sentence, the first 15 words, or any bullet line verbatim.",
    "No 5-word sequence from the anchor may appear in the draft.",
    `The opener must use one of these rotated moves: ${requestAnchors.angleSelection.allowedOpenerTypes.join(" | ")}.`,
    `The opener must not match the anchor opener type: ${requestAnchors.angleSelection.anchorOpenerType}.`,
    "Use strategy, niche, goal, and growth-loop guidance as background constraints only. They can shape framing, structure, and proof density, but they must not become the literal topic of the post.",
    "If the user gave you a concrete subject, keep that exact subject and wording family. Do not swap it for a generic adjacent topic.",
    buildConcreteTopicGuardrail({
      selectedAngle,
      concreteSubject,
      userMessage,
    }),
    "Use the current user message as a voice override only when it is substantive enough to be a real style sample. Thin prompts should not overpower the established creator voice.",
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
    "Mirror the user's actual tone, casing, looseness, and level of polish from the voice anchors.",
    "Do not rewrite the user into polished consultant, corporate, or founder-bro language.",
    "Prefer concrete first-person observations and natural phrasing over generic engagement-bait questions.",
    `Authority budget: ${contract.planner.authorityBudget}.`,
    `Proof requirement: ${contract.writer.proofRequirement}`,
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
    `Objective: ${planner.objective}.`,
    `Primary angle: ${planner.angle}.`,
    `Observed niche: ${context.creatorProfile.niche.primaryNiche}.`,
    `Target niche: ${context.creatorProfile.niche.targetNiche ?? "none"}.`,
    `Explicit content focus: ${contentFocus ?? "none"}.`,
    "The supportAsset field must describe 1-3 concrete image, video, or demo ideas that would make the post more believable.",
    "Never return a URL, raw asset id, or a vague label like 'best asset', 'screenshot', or 'demo' by itself.",
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
  const angleSelectionLine = formatAngleSelection(requestAnchors.angleSelection);
  const formatBlueprint = buildFormatBlueprint({
    post: requestAnchors.formatExemplar,
    outputShape: contract.planner.outputShape,
  });
  const formatSkeleton = formatLongFormSkeleton(
    buildLongFormContentSkeleton(requestAnchors.formatExemplar),
  );
  const authorityRenderContract =
    contract.planner.outputShape === "long_form_post"
      ? formatAuthorityRenderContract({
          lane: requestAnchors.angleSelection.inferredLane,
          goal: requestAnchors.angleSelection.inferredGoal,
          targetCasing: contract.writer.targetCasing,
        })
      : null;

  return [
    "You are the critic for an X growth assistant.",
    "Review the candidate response package and either approve it or tighten it.",
    "Keep the final response concise, useful, and aligned to the deterministic checklist.",
    `Angle volatility engine:\n${angleSelectionLine}`,
    buildAngleIsolationLine(requestAnchors.angleSelection),
    intent === "ideate"
      ? "If the user is still planning, keep the response focused on authentic angles, keep final drafts empty, and make the angles feel like something the user would naturally say."
      : "Keep the draft candidates sharp and usable as actual X posts.",
    "Priority order: selected angle -> concrete subject -> evidence pack -> explicit content focus -> user request.",
    "Reject outputs that replace the concrete topic with generic adjacent advice.",
    buildConcreteTopicGuardrail({
      selectedAngle,
      concreteSubject,
      userMessage,
    }),
    `Concrete evidence pack to enforce:\n${evidencePackLine}`,
    requestAnchors.evidencePack.requiredEvidenceCount > 0
      ? `Reject drafts that reuse fewer than ${requestAnchors.evidencePack.requiredEvidenceCount} concrete evidence point(s) when the topic aligns with the evidence pack.`
      : "No minimum evidence reuse requirement is available.",
    `Reject drafts that reuse more than ${requestAnchors.angleSelection.metricReuseLimit} metric proof point(s) unless the system explicitly asked for more.`,
    `Use this structure as the closest good mold when it exists: ${formatExemplarLine}`,
    `Structural blueprint to enforce: ${formatBlueprint}`,
    `Long-form content skeleton to enforce: ${formatSkeleton}`,
    authorityRenderContract
      ? `Reject drafts that violate this authority render contract: ${authorityRenderContract}`
      : "",
    "Reject outputs that ignore the strongest concrete evidence and replace it with generic category-level advice.",
    "Reject drafts that copy or closely paraphrase the anchor opener, the first 15 words, or any anchor bullet line.",
    "Reject drafts that reuse 5-word sequences from the anchor.",
    `Reject drafts whose opener type matches the anchor opener type: ${requestAnchors.angleSelection.anchorOpenerType}.`,
    "Reject outputs where broad strategy or goal phrasing becomes the literal topic. Strategy should shape framing only, not replace the concrete subject.",
    "Reject drafts that sound more formal, generic, or polished than the user's real voice anchors.",
    pinnedVoiceAnchorCount > 0
      ? "Pinned voice references are the strongest authority for tone. Reject outputs that drift away from them even if other inferred signals look weaker."
      : "No pinned voice references were provided.",
    "Reject drafts that read like empty engagement bait, forced binary questions, or generic startup advice unless the user clearly writes that way.",
    "Reject ideation angles that are just category labels, abstract strategies, or gerund starters like 'sharing...', 'discussing...', or 'highlighting...'.",
    "Reject bland phrases like 'major milestone', 'currently working on', 'excited to share', 'valuable insights', or 'establish authority'.",
    contract.planner.outputShape === "long_form_post"
      ? "Reject long-form drafts that still read like short tweet-sized posts. They should be meaningfully developed, usually beyond tweet length, with a clear thesis and structure."
      : "",
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
    "Reject supportAsset values that are just a URL, raw asset id, or a vague noun. Rewrite them into concrete visual or demo pairing ideas.",
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
  const restoredLabels = withAcronyms.replace(
    /^(thesis:|proof:|mechanism:|cta:)$/gim,
    (label) => label.toUpperCase(),
  );

  return restoredLabels.replace(/__url_(\d+)__/gi, (match, index) => {
    const numericIndex = Number(index);
    return Number.isInteger(numericIndex) && urlPlaceholders[numericIndex]
      ? urlPlaceholders[numericIndex]
      : match;
  });
}

function normalizeTowardSentenceCase(text: string): string {
  const normalizedLines = text.split("\n").map((line) => {
    if (!line.trim()) {
      return line;
    }

    if (/^(THESIS:|PROOF:|MECHANISM:|CTA:)$/i.test(line.trim())) {
      return line.trim().toUpperCase();
    }

    const lineMatch = line.match(/^(\s*(?:-\s+|\d\)\s+)?)?(.*)$/);
    const prefix = lineMatch?.[1] ?? "";
    const body = lineMatch?.[2] ?? line;

    const capitalizedBody = body.replace(/[a-z]/, (character) =>
      character.toUpperCase(),
    );
    const restoredPronouns = capitalizedBody.replace(/\bi\b/g, "I");
    const restoredAcronyms = restoredPronouns.replace(
      /\b[a-z][a-z0-9]{1,6}\b/g,
      (token) => ACRONYM_CASE_MAP.get(token) ?? token,
    );

    return `${prefix}${restoredAcronyms}`;
  });

  return normalizedLines.join("\n");
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
  next = applyTargetCasing(next, contract.writer.targetCasing);

  if (
    contract.writer.targetCasing !== "lowercase" &&
    (contract.planner.outputShape === "long_form_post" ||
      contract.planner.outputShape === "thread_seed") &&
    computeLowercaseShare(next) >= 85
  ) {
    next = normalizeTowardSentenceCase(next);
  }

  return next;
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

function normalizeWordsForOverlap(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter(
    (token) => token.length >= 3,
  );
}

function createNgrams(tokens: string[], size: number): Set<string> {
  const grams = new Set<string>();
  if (tokens.length < size) {
    return grams;
  }

  for (let index = 0; index <= tokens.length - size; index += 1) {
    grams.add(tokens.slice(index, index + size).join(" "));
  }

  return grams;
}

function analyzeExemplarReuse(
  draft: string,
  exemplar: CreatorRepresentativePost | null | undefined,
): {
  overlapRatio: number;
  exactLineReuseCount: number;
  reusedFiveGramCount: number;
  firstSentenceOverlap: boolean;
  firstFifteenWordOverlap: boolean;
  anchorOpenerType: VolatilityOpenerType;
  draftOpenerType: VolatilityOpenerType;
  openerMatchesAnchorType: boolean;
} {
  const draftOpenerType = classifyOpenerType(draft);

  if (!exemplar?.text.trim()) {
    return {
      overlapRatio: 0,
      exactLineReuseCount: 0,
      reusedFiveGramCount: 0,
      firstSentenceOverlap: false,
      firstFifteenWordOverlap: false,
      anchorOpenerType: "single-sentence thesis",
      draftOpenerType,
      openerMatchesAnchorType: false,
    };
  }

  const draftTokens = normalizeWordsForOverlap(draft);
  const exemplarTokens = normalizeWordsForOverlap(exemplar.text);
  const draftBigrams = createNgrams(draftTokens, 2);
  const exemplarBigrams = createNgrams(exemplarTokens, 2);
  const draftFiveGrams = createNgrams(draftTokens, 5);
  const exemplarFiveGrams = createNgrams(exemplarTokens, 5);

  let overlapCount = 0;
  for (const gram of draftBigrams) {
    if (exemplarBigrams.has(gram)) {
      overlapCount += 1;
    }
  }

  let reusedFiveGramCount = 0;
  for (const gram of draftFiveGrams) {
    if (exemplarFiveGrams.has(gram)) {
      reusedFiveGramCount += 1;
    }
  }

  const draftLines = draft
    .split(/\n+/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length >= 12);
  const exemplarLineSet = new Set(
    exemplar.text
      .split(/\n+/)
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line.length >= 12),
  );
  const exactLineReuseCount = draftLines.filter((line) =>
    exemplarLineSet.has(line),
  ).length;
  const normalizedDraft = draftTokens.join(" ");
  const normalizedAnchorFirstSentence = normalizeWordsForOverlap(
    extractFirstSentence(exemplar.text),
  ).join(" ");
  const normalizedAnchorFirstFifteen = normalizeWordsForOverlap(
    extractFirstWords(exemplar.text, 15),
  ).join(" ");
  const anchorOpenerType = classifyOpenerType(exemplar.text);

  return {
    overlapRatio:
      draftBigrams.size === 0 ? 0 : overlapCount / Math.max(1, draftBigrams.size),
    exactLineReuseCount,
    reusedFiveGramCount,
    firstSentenceOverlap:
      normalizedAnchorFirstSentence.length >= 12 &&
      normalizedDraft.includes(normalizedAnchorFirstSentence),
    firstFifteenWordOverlap:
      normalizedAnchorFirstFifteen.length >= 20 &&
      normalizedDraft.includes(normalizedAnchorFirstFifteen),
    anchorOpenerType,
    draftOpenerType,
    openerMatchesAnchorType: anchorOpenerType === draftOpenerType,
  };
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
  angleSelection: AngleSelection;
  selectedAngle: string | null;
  concreteSubject: string | null;
  userMessage: string;
  formatExemplar?: CreatorRepresentativePost | null;
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
  const exemplarReuse = analyzeExemplarReuse(draft, params.formatExemplar);
  const authorityRenderCheck =
    params.contract.planner.outputShape === "long_form_post"
      ? checkAuthorityRenderContract({
          draft,
          exemplarText: params.formatExemplar?.text ?? "",
          evidenceMetrics: params.evidencePack?.metrics ?? [],
          ctaMode: resolveAuthorityCtaMode({
            lane: params.angleSelection.inferredLane,
            goal: params.angleSelection.inferredGoal,
          }),
        })
      : null;
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

    if (
      evidenceCoverage.metricMatches > params.angleSelection.metricReuseLimit
    ) {
      score -=
        (evidenceCoverage.metricMatches - params.angleSelection.metricReuseLimit) *
        6;
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
    if (authorityRenderCheck?.isCompliant) {
      score += 12;
    } else if (authorityRenderCheck) {
      if (authorityRenderCheck.sectionCount !== 4) {
        score -= 8;
      }
      if (
        authorityRenderCheck.wordCount < 90 ||
        authorityRenderCheck.wordCount > 170
      ) {
        score -= 8;
      }
      if (!authorityRenderCheck.hasProofHeader) {
        score -= 5;
      }
      if (authorityRenderCheck.bulletCount !== 3) {
        score -= 6;
      }
      if (!authorityRenderCheck.hasMechanismHeader) {
        score -= 5;
      }
      if (authorityRenderCheck.numberedCount !== 3) {
        score -= 6;
      }
      if (!authorityRenderCheck.hasValidCta) {
        score -= 8;
      }
      if (authorityRenderCheck.finalLineIsQuestion) {
        score -= 4;
      }
      if (authorityRenderCheck.openerIsQuestion) {
        score -= 4;
      }
      if (authorityRenderCheck.genericDefinitionHits > 0) {
        score -= authorityRenderCheck.genericDefinitionHits * 4;
      }
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

  if (exemplarReuse.exactLineReuseCount > 0) {
    score -= exemplarReuse.exactLineReuseCount * 12;
  }

  if (exemplarReuse.reusedFiveGramCount > 0) {
    score -= exemplarReuse.reusedFiveGramCount * 10;
  }

  if (exemplarReuse.firstSentenceOverlap) {
    score -= 16;
  }

  if (exemplarReuse.firstFifteenWordOverlap) {
    score -= 14;
  }

  if (exemplarReuse.openerMatchesAnchorType) {
    score -= 8;
  }

  if (exemplarReuse.overlapRatio >= 0.55) {
    score -= 14;
  } else if (exemplarReuse.overlapRatio >= 0.4) {
    score -= 8;
  } else if (exemplarReuse.overlapRatio >= 0.25) {
    score -= 3;
  }

  return score;
}

function rerankDrafts(params: {
  drafts: string[];
  contract: CreatorGenerationContract;
  angleSelection: AngleSelection;
  selectedAngle: string | null;
  concreteSubject: string | null;
  userMessage: string;
  formatExemplar?: CreatorRepresentativePost | null;
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
        angleSelection: params.angleSelection,
        selectedAngle: params.selectedAngle,
        concreteSubject: params.concreteSubject,
        userMessage: params.userMessage,
        formatExemplar: params.formatExemplar,
        blueprintProfile: params.blueprintProfile,
        contentSkeleton: params.contentSkeleton,
        evidencePack: params.evidencePack,
      }),
    }))
    .sort((left, right) => right.score - left.score);

  return candidates.slice(0, 3).map((candidate) => candidate.draft);
}

function buildDraftDiagnostics(params: {
  drafts: string[];
  contract: CreatorGenerationContract;
  angleSelection: AngleSelection;
  selectedAngle: string | null;
  concreteSubject: string | null;
  userMessage: string;
  formatExemplar?: CreatorRepresentativePost | null;
  blueprintProfile?: FormatBlueprintProfile;
  contentSkeleton?: LongFormContentSkeleton;
  evidencePack?: CreatorChatDebugEvidencePack;
}): CreatorChatDebugDraftDiagnostic[] {
  const focusTerms = Array.from(
    new Set([
      ...collectSignalTerms(params.selectedAngle),
      ...collectSignalTerms(params.concreteSubject),
      ...collectSignalTerms(params.userMessage).slice(0, 4),
    ]),
  );

  return params.drafts.map((draft, index) => {
    const trimmedDraft = draft.trim();
    const evidenceCoverage = countEvidenceCoverage(trimmedDraft, params.evidencePack);
    const focusTermMatches = focusTerms.filter((term) =>
      new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
        trimmedDraft,
      ),
    ).length;
    const genericPhraseCount = countPhraseMatches(trimmedDraft, GENERIC_DRAFT_PHRASES);
    const strategyLeakCount = countPhraseMatches(
      trimmedDraft,
      STRATEGY_LEAKAGE_PHRASES,
    );
    const exemplarReuse = analyzeExemplarReuse(
      trimmedDraft,
      params.formatExemplar,
    );
    const authorityRenderCheck =
      params.contract.planner.outputShape === "long_form_post"
        ? checkAuthorityRenderContract({
            draft: trimmedDraft,
            exemplarText: params.formatExemplar?.text ?? "",
            evidenceMetrics: params.evidencePack?.metrics ?? [],
            ctaMode: resolveAuthorityCtaMode({
              lane: params.angleSelection.inferredLane,
              goal: params.angleSelection.inferredGoal,
            }),
          })
        : null;
    const matchesBlueprint =
      params.contract.planner.outputShape === "long_form_post" ||
      params.contract.planner.outputShape === "thread_seed"
        ? params.blueprintProfile
          ? matchesLongFormBlueprint(trimmedDraft, params.blueprintProfile)
          : null
        : null;
    const matchesSkeleton =
      params.contract.planner.outputShape === "long_form_post" ||
      params.contract.planner.outputShape === "thread_seed"
        ? params.contentSkeleton
          ? matchesLongFormSkeleton(trimmedDraft, params.contentSkeleton)
          : null
        : null;
    const score = scoreDraftCandidate({
      draft: trimmedDraft,
      contract: params.contract,
      angleSelection: params.angleSelection,
      selectedAngle: params.selectedAngle,
      concreteSubject: params.concreteSubject,
      userMessage: params.userMessage,
      formatExemplar: params.formatExemplar,
      blueprintProfile: params.blueprintProfile,
      contentSkeleton: params.contentSkeleton,
      evidencePack: params.evidencePack,
    });

    const reasons: string[] = [];

    if (index === 0) {
      reasons.push("Top-ranked after reranking.");
    }
    if (evidenceCoverage.total > 0) {
      reasons.push(
        `Reuses ${evidenceCoverage.total} evidence signal(s) (${evidenceCoverage.metricMatches} metric, ${evidenceCoverage.proofMatches} proof, ${evidenceCoverage.entityMatches} entity).`,
      );
    } else {
      reasons.push("Uses no concrete evidence from the current evidence pack.");
    }
    if (focusTermMatches > 0) {
      reasons.push(`Matches ${focusTermMatches} concrete request term(s).`);
    } else if (params.selectedAngle || params.concreteSubject) {
      reasons.push("Misses the strongest concrete request terms.");
    }
    if (matchesBlueprint === true) {
      reasons.push("Matches the current structural blueprint.");
    } else if (matchesBlueprint === false) {
      reasons.push("Misses the current structural blueprint.");
    }
    if (matchesSkeleton === true) {
      reasons.push("Matches the long-form content skeleton.");
    } else if (matchesSkeleton === false) {
      reasons.push("Misses the long-form content skeleton.");
    }
    if (genericPhraseCount > 0) {
      reasons.push(`Contains ${genericPhraseCount} generic filler phrase hit(s).`);
    }
    if (strategyLeakCount > 0) {
      reasons.push(`Contains ${strategyLeakCount} strategy-leak phrase hit(s).`);
    }
    if (exemplarReuse.exactLineReuseCount > 0) {
      reasons.push(
        `Reuses ${exemplarReuse.exactLineReuseCount} exemplar line(s) too closely.`,
      );
    }
    if (exemplarReuse.reusedFiveGramCount > 0) {
      reasons.push(
        `Reuses ${exemplarReuse.reusedFiveGramCount} five-word anchor sequence(s).`,
      );
    }
    if (exemplarReuse.firstSentenceOverlap) {
      reasons.push("Reuses the anchor's first sentence too closely.");
    }
    if (exemplarReuse.firstFifteenWordOverlap) {
      reasons.push("Overlaps with the anchor's first 15 words.");
    }
    if (exemplarReuse.openerMatchesAnchorType) {
      reasons.push(
        `Matches the anchor opener type (${exemplarReuse.anchorOpenerType}) instead of rotating it.`,
      );
    }
    if (
      params.evidencePack &&
      evidenceCoverage.metricMatches > params.angleSelection.metricReuseLimit
    ) {
      reasons.push(
        `Reuses ${evidenceCoverage.metricMatches} metric proof point(s), above the limit of ${params.angleSelection.metricReuseLimit}.`,
      );
    }
    if (
      exemplarReuse.exactLineReuseCount === 0 &&
      exemplarReuse.reusedFiveGramCount === 0 &&
      !exemplarReuse.firstSentenceOverlap &&
      !exemplarReuse.firstFifteenWordOverlap &&
      exemplarReuse.overlapRatio >= 0.4
    ) {
      reasons.push(
        `Overlaps ${Math.round(exemplarReuse.overlapRatio * 100)}% with the exemplar wording.`,
      );
    }
    if (authorityRenderCheck) {
      if (authorityRenderCheck.isCompliant) {
        reasons.push("Matches the authority long-form render contract.");
      } else {
        if (authorityRenderCheck.sectionCount !== 4) {
          reasons.push(
            `Uses ${authorityRenderCheck.sectionCount} sections instead of exactly 4.`,
          );
        }
        if (
          authorityRenderCheck.wordCount < 90 ||
          authorityRenderCheck.wordCount > 170
        ) {
          reasons.push(
            `Uses ${authorityRenderCheck.wordCount} words instead of the 90-170 target range.`,
          );
        }
        if (!authorityRenderCheck.hasProofHeader) {
          reasons.push('Missing the required "proof:" section header.');
        }
        if (authorityRenderCheck.bulletCount !== 3) {
          reasons.push(
            `Uses ${authorityRenderCheck.bulletCount} proof bullets instead of exactly 3.`,
          );
        }
        if (!authorityRenderCheck.hasMechanismHeader) {
          reasons.push('Missing the required "what made it work:" section header.');
        }
        if (authorityRenderCheck.numberedCount !== 3) {
          reasons.push(
            `Uses ${authorityRenderCheck.numberedCount} numbered mechanism lines instead of exactly 3.`,
          );
        }
        if (!authorityRenderCheck.hasValidCta) {
          reasons.push("Missing a valid CTA in the final line.");
        }
        if (authorityRenderCheck.finalLineIsQuestion) {
          reasons.push("Ends with a question instead of a confident CTA line.");
        }
        if (authorityRenderCheck.openerIsQuestion) {
          reasons.push("Opens with a question instead of a thesis or hard rule.");
        }
        if (authorityRenderCheck.genericDefinitionHits > 0) {
          reasons.push(
            `Contains ${authorityRenderCheck.genericDefinitionHits} generic-definition phrase hit(s).`,
          );
        }
      }
    }

    return {
      preview: compactTextForPrompt(trimmedDraft, 220),
      score: Math.round(score * 100) / 100,
      chosen: index === 0,
      evidenceCoverage,
      focusTermMatches,
      genericPhraseCount,
      strategyLeakCount,
      matchesBlueprint,
      matchesSkeleton,
      validator: authorityRenderCheck?.validator ?? null,
      reasons,
    };
  });
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
  const authorityRenderContract =
    params.contract.planner.outputShape === "long_form_post"
      ? formatAuthorityRenderContract({
          lane: params.requestAnchors.angleSelection.inferredLane,
          goal: params.requestAnchors.angleSelection.inferredGoal,
          targetCasing: params.contract.writer.targetCasing,
        })
      : null;

  return [
    "You are expanding an X long-form draft into a stronger, more developed post.",
    "Return one expanded draft only.",
    "The expanded draft must stay faithful to the existing premise, voice, and subject.",
    "Do not change the topic or turn it into generic advice.",
    "Priority order: selected angle -> evidence pack -> existing draft premise.",
    params.selectedAngle
      ? `Selected angle (highest-priority topic constraint): ${params.selectedAngle}`
      : "Selected angle (highest-priority topic constraint): none",
    `Concrete evidence pack (high-salience factual source):\n${evidencePackLine}`,
    params.requestAnchors.evidencePack.requiredEvidenceCount > 0
      ? `Carry forward at least ${params.requestAnchors.evidencePack.requiredEvidenceCount} concrete evidence point(s) from that pack.`
      : "No minimum evidence reuse requirement is available.",
    `Use this structure as the closest good mold when it exists: ${formatExemplarLine}`,
    `Follow this structural blueprint: ${formatBlueprint}`,
    `Follow this long-form content skeleton: ${formatSkeleton}`,
    authorityRenderContract,
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
    `Required output shape: ${params.contract.planner.outputShape}.`,
    `Output shape rationale: ${params.contract.planner.outputShapeRationale}`,
    `Target casing: ${params.contract.writer.targetCasing}.`,
    `Tone blend: ${params.contract.writer.toneBlendSummary}`,
    `Proof requirement: ${params.contract.writer.proofRequirement}`,
    "Return only valid JSON that follows the provided schema.",
  ].join("\n");
}

function validateLongFormDraftCandidate(params: {
  draft: string;
  requestAnchors: RequestConditionedAnchors;
}): DraftValidationResult {
  return validateDraft({
    draft: params.draft,
    mode: "long_form_post",
    exemplarText: params.requestAnchors.formatExemplar?.text ?? "",
    evidenceMetrics: params.requestAnchors.evidencePack.metrics,
    ctaMode: resolveAuthorityCtaMode({
      lane: params.requestAnchors.angleSelection.inferredLane,
      goal: params.requestAnchors.angleSelection.inferredGoal,
    }),
  });
}

function buildLongFormRepairSystemPrompt(params: {
  context: CreatorAgentContext;
  contract: CreatorGenerationContract;
  selectedAngle: string | null;
  requestAnchors: RequestConditionedAnchors;
  failingDraft: string;
  validation: DraftValidationResult;
}): string {
  const authorityRenderContract = formatAuthorityRenderContract({
    lane: params.requestAnchors.angleSelection.inferredLane,
    goal: params.requestAnchors.angleSelection.inferredGoal,
    targetCasing: params.contract.writer.targetCasing,
  });

  return [
    "You are repairing a failing X long-form authority post.",
    "Rewrite from scratch. Do not patch the existing draft line-by-line.",
    "Produce a NEW draft that fixes every validator error.",
    "Do not preserve overlapping 5-word sequences from the failing draft or the exemplar.",
    "Do not reuse the failing opener, sentence order, or section order verbatim.",
    "Keep the same concrete topic, selected angle, and proof source.",
    "The render contract is mandatory. If a constraint conflicts with the failing draft, discard the failing draft and follow the contract.",
    authorityRenderContract,
    `Selected angle: ${params.selectedAngle?.trim() || "none"}`,
    `Concrete evidence pack:\n${formatEvidencePack(params.requestAnchors.evidencePack)}`,
    `Format exemplar: ${formatExemplar(params.requestAnchors.formatExemplar)}`,
    `Current failing draft:\n${params.failingDraft}`,
    `Validator errors to fix: ${params.validation.errors.join(" | ") || "none"}`,
    "Required rewrite behavior:",
    "- Use uppercase section labels exactly as specified.",
    "- Use exactly one blank line between sections.",
    "- Write a fresh THESIS that is declarative and structurally different from the failing draft.",
    "- Include the required PROOF bullets and MECHANISM steps exactly.",
    "- End with a valid CTA and nothing after it.",
    "- If the previous draft copied phrasing too literally, rotate the wording and preserve only the proof.",
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
  pinnedVoicePostIds?: string[];
  pinnedEvidencePostIds?: string[];
  onProgress?: (phase: CreatorChatProgressPhase) => void;
}): Promise<CreatorChatReplyResult> {
  const requestedIntent = params.intent ?? "draft";
  const shouldForceCoachFromPrompt =
    isCorrectionPrompt(params.userMessage) ||
    isMetaClarifyingPrompt(params.userMessage);
  const shouldCoach =
    !params.selectedAngle &&
    requestedIntent !== "review" &&
    (requestedIntent === "coach" ||
      shouldForceCoachFromPrompt ||
      isThinCoachInput(params.userMessage) ||
      isBroadDiscoveryPrompt(params.userMessage) ||
      isBroadDraftRequest(params.userMessage));
  const effectiveIntent: CreatorChatIntent = shouldCoach
    ? "coach"
    : requestedIntent;
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
    intent: effectiveIntent,
    contentFocus: params.contentFocus,
    selectedAngle: params.selectedAngle ?? null,
    pinnedVoicePostIds: params.pinnedVoicePostIds ?? [],
    pinnedEvidencePostIds: params.pinnedEvidencePostIds ?? [],
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

  if (effectiveIntent === "coach") {
    if (
      isBroadDiscoveryPrompt(params.userMessage) ||
      isBroadDraftRequest(params.userMessage) ||
      isCorrectionPrompt(params.userMessage) ||
      isMetaClarifyingPrompt(params.userMessage)
    ) {
      params.onProgress?.("finalizing");
      return {
        ...buildDeterministicCoachReply({
          userMessage: params.userMessage,
          contentFocus: params.contentFocus ?? null,
          selectedAngle: params.selectedAngle ?? null,
          debug: deterministicFallback.debug,
        }),
        source: "deterministic",
        model: null,
        mode: contract.mode,
      };
    }

    if (!writerProvider) {
      params.onProgress?.("finalizing");
      return {
        ...buildDeterministicCoachReply({
          userMessage: params.userMessage,
          contentFocus: params.contentFocus ?? null,
          selectedAngle: params.selectedAngle ?? null,
          debug: deterministicFallback.debug,
        }),
        source: "deterministic",
        model: null,
        mode: contract.mode,
      };
    }

    try {
      params.onProgress?.("writing");
      const history = normalizeHistory(params.history ?? []);
      const coachOutput = await callProviderJson<{ reply: string }>({
        provider: writerProvider,
        system: buildCoachSystemPrompt({ context, contract }),
        user: buildCoachUserPrompt({
          userMessage: params.userMessage,
          contentFocus: params.contentFocus ?? null,
          selectedAngle: params.selectedAngle ?? null,
          history,
        }),
        schemaName: "coach_reply",
        schema: {
          type: "object",
          properties: {
            reply: { type: "string" },
          },
          required: ["reply"],
          additionalProperties: false,
        },
        maxOutputTokens: 220,
      });

      const reply = coerceString(coachOutput.reply);
      const validation = validateCoachReplyText(reply);
      const safeReply = validation.isValid
        ? reply
        : buildDeterministicCoachReply({
            userMessage: params.userMessage,
            contentFocus: params.contentFocus ?? null,
            selectedAngle: params.selectedAngle ?? null,
            debug: deterministicFallback.debug,
          }).reply;

      params.onProgress?.("finalizing");
      return {
        reply: safeReply,
        angles: [],
        drafts: [],
        draftArtifacts: [],
        supportAsset: null,
        outputShape: "coach_question",
        whyThisWorks: [],
        watchOutFor: [],
        debug: deterministicFallback.debug,
        source: writerProvider.provider,
        model: writerProvider.model,
        mode: contract.mode,
      };
    } catch {
      params.onProgress?.("finalizing");
      return {
        ...buildDeterministicCoachReply({
          userMessage: params.userMessage,
          contentFocus: params.contentFocus ?? null,
          selectedAngle: params.selectedAngle ?? null,
          debug: deterministicFallback.debug,
        }),
        source: "deterministic",
        model: null,
        mode: contract.mode,
      };
    }
  }

  if (!plannerProvider || !writerProvider || !criticProvider) {
    params.onProgress?.("finalizing");
    return {
      ...deterministicFallback,
      source: "deterministic",
      model: null,
      mode: contract.mode,
    };
  }

  const pinnedVoiceAnchors = selectPinnedReferencePosts(
    context,
    params.pinnedVoicePostIds ?? [],
  );
  const pinnedEvidenceAnchors = selectPinnedReferencePosts(
    context,
    params.pinnedEvidencePostIds ?? [],
  );
  const concreteSubject = extractConcreteSubject(params.userMessage);
  const requestAnchors = selectRequestConditionedAnchors({
    context,
    contract,
    userMessage: params.userMessage,
    concreteSubject,
    selectedAngle: params.selectedAngle ?? null,
    contentFocus: params.contentFocus ?? null,
    pinnedEvidenceAnchors,
  });
  const history = normalizeHistory(params.history ?? []);
  const historyText =
    history.length > 0
      ? history
          .slice(-6)
          .map(
            (message) =>
              `${message.role.toUpperCase()}: ${compactTextForPrompt(message.content, 180)}`,
          )
          .join("\n")
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
      `Selected angle: ${params.selectedAngle?.trim() || "none"}`,
      `Concrete subject from user request: ${concreteSubject ?? "none"}`,
      `Explicit content focus: ${params.contentFocus ?? "none"}`,
      `Angle volatility selection:\n${formatAngleSelection(requestAnchors.angleSelection)}`,
      `Concrete evidence pack:\n${formatEvidencePack(requestAnchors.evidencePack)}`,
      `Recent chat history:\n${historyText}`,
      `Deterministic strategy delta: ${contract.planner.strategyDeltaSummary}`,
      `Blocked reasons: ${contract.planner.blockedReasons.join(" | ") || "none"}`,
      `Deterministic must-include constraints: ${contract.writer.mustInclude.join(" | ")}`,
      `Deterministic must-avoid constraints: ${contract.writer.mustAvoid.join(" | ")}`,
    ].join("\n\n"),
    schemaName: "creator_planner_output",
    maxOutputTokens: getStageMaxOutputTokens({
      stage: "planner",
      intent: params.intent ?? "draft",
      outputShape: contract.planner.outputShape,
    }),
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
  const leverFallbackAngle =
    requestAnchors.angleSelection.primary?.title ??
    contract.planner.primaryAngle;
  const effectivePlanner: PlannerOutput = {
    ...planner,
    angle: params.selectedAngle?.trim() || leverFallbackAngle,
    mustInclude: params.selectedAngle?.trim()
      ? [
          `Preserve selected angle: ${params.selectedAngle.trim()}`,
          ...planner.mustInclude,
        ].slice(0, 4)
      : [
          `Use exactly one primary angle lever: ${leverFallbackAngle}`,
          ...planner.mustInclude,
        ].slice(0, 4),
    mustAvoid: planner.mustAvoid,
  };
  const laneVoiceAnchors = selectLaneVoiceAnchors(
    context,
    effectivePlanner.targetLane,
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
      `Selected angle: ${params.selectedAngle?.trim() || "none"}`,
      `Concrete subject from user request: ${concreteSubject ?? "none"}`,
      `Explicit content focus: ${params.contentFocus ?? "none"}`,
      `Angle volatility selection:\n${formatAngleSelection(requestAnchors.angleSelection)}`,
      `Concrete evidence pack:\n${formatEvidencePack(requestAnchors.evidencePack)}`,
      formatAnchorExamples(
        "Pinned evidence references (facts/proof first)",
        pinnedEvidenceAnchors,
        2,
      ),
      formatAnchorExamples(
        "Request-conditioned topic anchors",
        requestAnchors.topicAnchors,
        3,
      ),
      `Recent chat history:\n${historyText}`,
      `Voice profile:\n${formatVoiceProfile(context)}`,
      `Live request voice hints:\n${inferUserMessageVoiceHints(params.userMessage)}`,
      formatAnchorExamples(
        "Pinned voice references (highest priority)",
        pinnedVoiceAnchors,
        2,
      ),
      formatAnchorExamples(
        "Voice anchors to imitate for tone and casing",
        effectiveVoiceAnchors,
        2,
      ),
      formatAnchorExamples(
        "Format anchors (structure only)",
        requestAnchors.formatAnchors,
        1,
      ),
      formatAnchorExamples(
        "Strategy anchors (background only)",
        context.creatorProfile.examples.strategyAnchors,
        1,
      ),
      formatNegativeAnchorSummary(context.negativeAnchors, 2),
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
    maxOutputTokens: getStageMaxOutputTokens({
      stage: "writer",
      intent: params.intent ?? "draft",
      outputShape: contract.planner.outputShape,
    }),
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
      `Selected angle: ${params.selectedAngle?.trim() || "none"}`,
      `Concrete subject from user request: ${concreteSubject ?? "none"}`,
      `Explicit content focus: ${params.contentFocus ?? "none"}`,
      `Angle volatility selection:\n${formatAngleSelection(requestAnchors.angleSelection)}`,
      `Concrete evidence pack:\n${formatEvidencePack(requestAnchors.evidencePack)}`,
      formatAnchorExamples(
        "Pinned evidence references (facts/proof first)",
        pinnedEvidenceAnchors,
        2,
      ),
      formatAnchorExamples(
        "Request-conditioned topic anchors",
        requestAnchors.topicAnchors,
        3,
      ),
      `Voice profile:\n${formatVoiceProfile(context)}`,
      `Live request voice hints:\n${inferUserMessageVoiceHints(params.userMessage)}`,
      formatAnchorExamples(
        "Pinned voice references (highest priority)",
        pinnedVoiceAnchors,
        2,
      ),
      formatAnchorExamples(
        "Voice anchors to compare against",
        effectiveVoiceAnchors,
        2,
      ),
      formatAnchorExamples(
        "Format anchors (structure only)",
        requestAnchors.formatAnchors,
        1,
      ),
      `Candidate response package:\n${summarizeWriterOutputForCritic(writer)}`,
      `Checklist: ${contract.critic.checklist.join(" | ")}`,
      `Hard constraints: drafts must sound like the user's real voice, not generic expert copy.`,
    ].join("\n\n"),
    schemaName: "creator_critic_output",
    maxOutputTokens: getStageMaxOutputTokens({
      stage: "critic",
      intent: params.intent ?? "draft",
      outputShape: contract.planner.outputShape,
    }),
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
          angleSelection: requestAnchors.angleSelection,
          selectedAngle: params.selectedAngle?.trim() || null,
          concreteSubject,
          userMessage: params.userMessage,
          formatExemplar: requestAnchors.formatExemplar,
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
        maxOutputTokens: 1800,
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
          angleSelection: requestAnchors.angleSelection,
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

  if (
    intent !== "ideate" &&
    contract.planner.outputShape === "long_form_post" &&
    finalDrafts.length > 0
  ) {
    let validatedDrafts = finalDrafts.map((draft) => ({
      draft,
      validation: validateLongFormDraftCandidate({
        draft,
        requestAnchors,
      }),
      score: scoreDraftCandidate({
        draft,
        contract,
        angleSelection: requestAnchors.angleSelection,
        selectedAngle: params.selectedAngle?.trim() || null,
        concreteSubject,
        userMessage: params.userMessage,
        formatExemplar: requestAnchors.formatExemplar,
        blueprintProfile: formatBlueprintProfile,
        contentSkeleton: formatContentSkeleton,
        evidencePack: requestAnchors.evidencePack,
      }),
    }));

    let repairAttempts = 0;
    while (
      !validatedDrafts.some((candidate) => candidate.validation.pass) &&
      repairAttempts < 2 &&
      validatedDrafts.length > 0
    ) {
      const repairTarget = validatedDrafts
        .slice()
        .sort((left, right) => right.score - left.score)[0];

      try {
        const repair = await callProviderJson<{ repairedDraft: string }>({
          provider: writerProvider,
          system: buildLongFormRepairSystemPrompt({
            context,
            contract,
            selectedAngle: params.selectedAngle?.trim() || null,
            requestAnchors,
            failingDraft: repairTarget.draft,
            validation: repairTarget.validation,
          }),
          user: [
            `Original user request: ${params.userMessage}`,
            `Selected angle: ${params.selectedAngle?.trim() || "none"}`,
            `Concrete subject from user request: ${concreteSubject ?? "none"}`,
          ].join("\n\n"),
          schemaName: "creator_long_form_repair_output",
          maxOutputTokens: 1800,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              repairedDraft: { type: "string" },
            },
            required: ["repairedDraft"],
          },
        });

        const repairedDraft = loosenDraftText(
          coerceString(repair?.repairedDraft),
          contract,
        );

        if (repairedDraft) {
          finalDrafts = rerankDrafts({
            drafts: [repairedDraft, ...finalDrafts],
            contract,
            angleSelection: requestAnchors.angleSelection,
            selectedAngle: params.selectedAngle?.trim() || null,
            concreteSubject,
            userMessage: params.userMessage,
            formatExemplar: requestAnchors.formatExemplar,
            blueprintProfile: formatBlueprintProfile,
            contentSkeleton: formatContentSkeleton,
            evidencePack: requestAnchors.evidencePack,
          });
          validatedDrafts = finalDrafts.map((draft) => ({
            draft,
            validation: validateLongFormDraftCandidate({
              draft,
              requestAnchors,
            }),
            score: scoreDraftCandidate({
              draft,
              contract,
              angleSelection: requestAnchors.angleSelection,
              selectedAngle: params.selectedAngle?.trim() || null,
              concreteSubject,
              userMessage: params.userMessage,
              formatExemplar: requestAnchors.formatExemplar,
              blueprintProfile: formatBlueprintProfile,
              contentSkeleton: formatContentSkeleton,
              evidencePack: requestAnchors.evidencePack,
            }),
          }));
        }
      } catch {
        // Keep the best available candidate if repair fails.
      }

      repairAttempts += 1;
    }

    const passingDrafts = validatedDrafts
      .filter((candidate) => candidate.validation.pass)
      .map((candidate) => candidate.draft);

    if (passingDrafts.length > 0) {
      finalDrafts = passingDrafts.slice(0, 3);
    } else {
      finalWatchOutFor.unshift(
        "The candidate response package does not meet the long-form render contract.",
      );
    }
  }

  const normalizedSupportAsset = normalizeVisualSupportIdeas({
    raw: (critic.finalSupportAsset || writer.supportAsset).trim() || null,
    contentFocus: params.contentFocus ?? null,
    selectedAngle: params.selectedAngle?.trim() || null,
    userMessage: params.userMessage,
    evidencePack: requestAnchors.evidencePack,
  });

  return {
    reply: critic.finalResponse.trim() || writer.response.trim(),
    angles: finalAngles,
    drafts: finalDrafts,
    draftArtifacts: buildDraftArtifacts({
      drafts: finalDrafts,
      outputShape:
        intent === "ideate" ? "ideation_angles" : contract.planner.outputShape,
      supportAsset: normalizedSupportAsset,
    }),
    supportAsset: normalizedSupportAsset,
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
      topicAnchors: requestAnchors.topicAnchors
        .map(buildFormatExemplarDebug)
        .filter((post): post is CreatorChatDebugFormatExemplar => post !== null),
      pinnedVoiceReferences: pinnedVoiceAnchors
        .map(buildFormatExemplarDebug)
        .filter((post): post is CreatorChatDebugFormatExemplar => post !== null),
      pinnedEvidenceReferences: pinnedEvidenceAnchors
        .map(buildFormatExemplarDebug)
        .filter((post): post is CreatorChatDebugFormatExemplar => post !== null),
      evidencePack: requestAnchors.evidencePack,
      formatBlueprint: buildFormatBlueprint({
        post: requestAnchors.formatExemplar,
        outputShape: contract.planner.outputShape,
      }),
      formatSkeleton: formatLongFormSkeleton(formatContentSkeleton),
      outputShapeRationale: contract.planner.outputShapeRationale,
      draftDiagnostics:
        intent === "ideate"
          ? []
          : buildDraftDiagnostics({
              drafts: finalDrafts,
              contract,
              angleSelection: requestAnchors.angleSelection,
              selectedAngle: params.selectedAngle?.trim() || null,
              concreteSubject,
              userMessage: params.userMessage,
              formatExemplar: requestAnchors.formatExemplar,
              blueprintProfile: formatBlueprintProfile,
              contentSkeleton: formatContentSkeleton,
              evidencePack: requestAnchors.evidencePack,
            }),
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
