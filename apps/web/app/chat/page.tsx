"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import type { CreatorAgentContext } from "@/lib/onboarding/agentContext";
import type { CreatorGenerationContract } from "@/lib/onboarding/generationContract";
import type {
  PostingCadenceCapacity,
  ReplyBudgetPerDay,
  ToneCasing,
  ToneRisk,
  TransformationMode,
  UserGoal,
} from "@/lib/onboarding/types";

interface ValidationError {
  field: string;
  message: string;
}

interface CreatorAgentContextSuccess {
  ok: true;
  data: CreatorAgentContext;
}

interface CreatorAgentContextFailure {
  ok: false;
  errors: ValidationError[];
}

type CreatorAgentContextResponse = CreatorAgentContextSuccess | CreatorAgentContextFailure;

interface CreatorGenerationContractSuccess {
  ok: true;
  data: CreatorGenerationContract;
}

interface CreatorGenerationContractFailure {
  ok: false;
  errors: ValidationError[];
}

type CreatorGenerationContractResponse =
  | CreatorGenerationContractSuccess
  | CreatorGenerationContractFailure;

interface BackfillJobStatusResponse {
  ok: true;
  job: {
    jobId: string;
    status: "pending" | "processing" | "completed" | "failed";
    lastError: string | null;
  } | null;
}

interface CreatorChatSuccess {
  ok: true;
  data: {
    reply: string;
    angles: string[];
    drafts: string[];
    draftArtifacts: DraftArtifact[];
    supportAsset: string | null;
    outputShape:
      | "ideation_angles"
      | "short_form_post"
      | "long_form_post"
      | "thread_seed"
      | "reply_candidate"
      | "quote_candidate";
    whyThisWorks: string[];
    watchOutFor: string[];
    source: "openai" | "groq" | "deterministic";
    model: string | null;
    mode: CreatorGenerationContract["mode"];
  };
}

interface CreatorChatFailure {
  ok: false;
  errors: ValidationError[];
}

type CreatorChatResponse = CreatorChatSuccess | CreatorChatFailure;

interface CreatorChatStreamStatusEvent {
  type: "status";
  phase: "planning" | "writing" | "critic" | "finalizing";
  message: string;
}

interface CreatorChatStreamResultEvent {
  type: "result";
  data: CreatorChatSuccess["data"];
}

interface CreatorChatStreamErrorEvent {
  type: "error";
  message: string;
}

type CreatorChatStreamEvent =
  | CreatorChatStreamStatusEvent
  | CreatorChatStreamResultEvent
  | CreatorChatStreamErrorEvent;

interface DraftArtifact {
  id: string;
  title: string;
  kind:
    | "short_form_post"
    | "long_form_post"
    | "thread_seed"
    | "reply_candidate"
    | "quote_candidate";
  content: string;
  characterCount: number;
  weightedCharacterCount: number;
  isWithinXLimit: boolean;
  supportAsset: string | null;
  betterClosers: string[];
  replyPlan: string[];
}

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  angles?: string[];
  drafts?: string[];
  draftArtifacts?: DraftArtifact[];
  supportAsset?: string | null;
  whyThisWorks?: string[];
  watchOutFor?: string[];
  source?: "openai" | "groq" | "deterministic";
  model?: string | null;
  outputShape?: CreatorChatSuccess["data"]["outputShape"];
}

type ChatProviderPreference = "openai" | "groq";
type ChatIntent = "ideate" | "draft" | "review";
type ChatContentFocus =
  | "project_showcase"
  | "technical_insight"
  | "build_in_public"
  | "operator_lessons"
  | "social_observation";

interface ChatStrategyInputs {
  goal: UserGoal;
  postingCadenceCapacity: PostingCadenceCapacity;
  replyBudgetPerDay: ReplyBudgetPerDay;
  transformationMode: TransformationMode;
}

interface ChatToneInputs {
  toneCasing: ToneCasing;
  toneRisk: ToneRisk;
}

interface WorkspaceLoadResult {
  ok: boolean;
  contextData?: CreatorAgentContext;
  contractData?: CreatorGenerationContract;
}

type StrategyPromptStep =
  | "goal"
  | "transformationMode"
  | "postingCadenceCapacity"
  | "replyBudgetPerDay"
  | "contentFocus"
  | "toneCasing"
  | "toneRisk";

interface StrategyPromptOption {
  value: string;
  label: string;
}

interface StrategyPromptState {
  step: StrategyPromptStep;
  label: string;
  helper: string;
  options: StrategyPromptOption[];
  currentValue: string;
  index: number;
  total: number;
}

const showDevTools = process.env.NEXT_PUBLIC_SHOW_ONBOARDING_DEV_TOOLS === "1";
const chatProviderStorageKey = "stanley-x-chat-provider";
const DEFAULT_CHAT_STRATEGY_INPUTS: ChatStrategyInputs = {
  goal: "followers",
  postingCadenceCapacity: "1_per_day",
  replyBudgetPerDay: "5_15",
  transformationMode: "optimize",
};
const DEFAULT_CHAT_TONE_INPUTS: ChatToneInputs = {
  toneCasing: "normal",
  toneRisk: "safe",
};
const goalOptions: UserGoal[] = ["followers", "leads", "authority"];
const transformationModeOptions: TransformationMode[] = [
  "preserve",
  "optimize",
  "pivot_soft",
  "pivot_hard",
];
const postingCapacityOptions: PostingCadenceCapacity[] = [
  "3_per_week",
  "1_per_day",
  "2_per_day",
];
const replyBudgetOptions: ReplyBudgetPerDay[] = ["0_5", "5_15", "15_30"];
const contentFocusOptions: ChatContentFocus[] = [
  "project_showcase",
  "technical_insight",
  "build_in_public",
  "operator_lessons",
  "social_observation",
];
const toneCasingOptions: ToneCasing[] = ["lowercase", "normal"];
const toneRiskOptions: ToneRisk[] = ["safe", "bold"];
const strategyPromptSteps: StrategyPromptStep[] = [
  "goal",
  "transformationMode",
  "postingCadenceCapacity",
  "replyBudgetPerDay",
  "contentFocus",
  "toneCasing",
  "toneRisk",
];

function formatEnumLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAreaLabel(value: string): string {
  return formatEnumLabel(value);
}

function formatPostingCapacityLabel(value: PostingCadenceCapacity): string {
  if (value === "3_per_week") {
    return "3 / Week";
  }

  if (value === "1_per_day") {
    return "1 / Day";
  }

  return "2 / Day";
}

function formatReplyBudgetLabel(value: ReplyBudgetPerDay): string {
  if (value === "0_5") {
    return "0-5 Replies";
  }

  if (value === "5_15") {
    return "5-15 Replies";
  }

  return "15-30 Replies";
}

function formatContentFocusLabel(value: ChatContentFocus): string {
  switch (value) {
    case "project_showcase":
      return "Project Showcase";
    case "technical_insight":
      return "Technical Insight";
    case "build_in_public":
      return "Build In Public";
    case "operator_lessons":
      return "Operator Lessons";
    case "social_observation":
      return "Social Observation";
  }
}

function formatToneCasingLabel(value: ToneCasing): string {
  return value === "lowercase" ? "Lowercase / Casual" : "Normal / Standard";
}

function formatToneRiskLabel(value: ToneRisk): string {
  return value === "bold" ? "Bold / Punchier" : "Safe / Steady";
}

function buildStrategyPromptState(
  step: StrategyPromptStep | null,
  inputs: ChatStrategyInputs,
  contentFocus: ChatContentFocus,
  toneInputs: ChatToneInputs,
): StrategyPromptState | null {
  if (!step) {
    return null;
  }

  const index = strategyPromptSteps.indexOf(step);
  const base = {
    step,
    index: index + 1,
    total: strategyPromptSteps.length,
  };

  switch (step) {
    case "goal":
      return {
        ...base,
        label: "What are you optimizing for first?",
        helper: "Pick the primary outcome so the agent plans around the right type of growth.",
        options: goalOptions.map((option) => ({
          value: option,
          label: formatEnumLabel(option),
        })),
        currentValue: inputs.goal,
      };
    case "transformationMode":
      return {
        ...base,
        label: "How should we handle your current positioning?",
        helper: "Choose whether to preserve what works, optimize it, or pivot into a new lane.",
        options: transformationModeOptions.map((option) => ({
          value: option,
          label: formatEnumLabel(option),
        })),
        currentValue: inputs.transformationMode,
      };
    case "postingCadenceCapacity":
      return {
        ...base,
        label: "How often can you realistically post?",
        helper: "This caps the playbook so the plan is something you can actually sustain.",
        options: postingCapacityOptions.map((option) => ({
          value: option,
          label: formatPostingCapacityLabel(option),
        })),
        currentValue: inputs.postingCadenceCapacity,
      };
    case "replyBudgetPerDay":
      return {
        ...base,
        label: "How much reply bandwidth do you have each day?",
        helper: "Reply-heavy loops only make sense if you can sustain them.",
        options: replyBudgetOptions.map((option) => ({
          value: option,
          label: formatReplyBudgetLabel(option),
        })),
        currentValue: inputs.replyBudgetPerDay,
      };
    case "contentFocus":
      return {
        ...base,
        label: "What do you want to focus on posting about next?",
        helper:
          "Use this to steer the subject matter. The agent should keep your voice, but help you build clearer, more authentic topic direction.",
        options: contentFocusOptions.map((option) => ({
          value: option,
          label: formatContentFocusLabel(option),
        })),
        currentValue: contentFocus,
      };
    case "toneCasing":
      return {
        ...base,
        label: "How should the post read on the timeline?",
        helper:
          "Choose the default casing and looseness. This should reflect how you naturally type, not how polished you think it should look.",
        options: toneCasingOptions.map((option) => ({
          value: option,
          label: formatToneCasingLabel(option),
        })),
        currentValue: toneInputs.toneCasing,
      };
    case "toneRisk":
      return {
        ...base,
        label: "How aggressive should the tone be?",
        helper:
          "Safe stays more measured. Bold pushes harder on bluntness, stronger claims, and sharper phrasing.",
        options: toneRiskOptions.map((option) => ({
          value: option,
          label: formatToneRiskLabel(option),
        })),
        currentValue: toneInputs.toneRisk,
      };
  }
}

function formatNicheSummary(context: CreatorAgentContext): string {
  const { primaryNiche, targetNiche } = context.creatorProfile.niche;

  if (
    primaryNiche === "generalist" &&
    targetNiche &&
    targetNiche !== "generalist"
  ) {
    return `Broad Right Now -> ${formatEnumLabel(targetNiche)}`;
  }

  return formatEnumLabel(primaryNiche);
}

const chatScanlineStyle = {
  backgroundImage:
    "linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)",
  backgroundSize: "100% 6px",
};

function buildInitialAssistantMessage(
  context: CreatorAgentContext,
  contract: CreatorGenerationContract,
): string {
  const angle = contract.planner.primaryAngle;
  const loop = formatEnumLabel(context.creatorProfile.distribution.primaryLoop);
  const observedNiche = formatEnumLabel(context.creatorProfile.niche.primaryNiche);
  const targetNiche =
    context.creatorProfile.niche.targetNiche &&
    context.creatorProfile.niche.targetNiche !== "generalist"
      ? formatEnumLabel(context.creatorProfile.niche.targetNiche)
      : null;

  if (contract.mode === "analysis_only") {
    return `I analyzed @${context.account}. Your current model is not strong enough for reliable drafting yet. You're trending ${formatEnumLabel(
      context.creatorProfile.archetype,
    )} in ${observedNiche}, but we should stay in analysis mode until the sample deepens.`;
  }

  if (
    context.creatorProfile.niche.primaryNiche === "generalist" &&
    targetNiche
  ) {
    return `I analyzed @${context.account}. You're primarily ${formatEnumLabel(
      context.creatorProfile.archetype,
    )}, but your current niche signal is still broad. The best niche to build toward is ${targetNiche}, and your strongest growth loop is ${loop}. The best next angle is: ${angle}`;
  }

  return `I analyzed @${context.account}. You're primarily ${formatEnumLabel(
    context.creatorProfile.archetype,
  )} in ${observedNiche}, and your strongest growth loop is ${loop}. The best next angle is: ${angle}`;
}

function buildDeterministicReply(
  context: CreatorAgentContext,
  contract: CreatorGenerationContract,
  options?: {
    intent?: ChatIntent;
    contentFocus?: ChatContentFocus | null;
    selectedAngle?: string | null;
  },
): Omit<ChatMessage, "id" | "role"> {
  const topHook = contract.planner.suggestedHookPatterns[0]
    ? formatEnumLabel(contract.planner.suggestedHookPatterns[0])
    : "Statement Open";
  const topType = contract.planner.suggestedContentTypes[0]
    ? formatEnumLabel(contract.planner.suggestedContentTypes[0])
    : "Single Line";

  if (contract.mode === "analysis_only") {
    return {
      content:
        "Context readiness is still too weak for drafting. Stay in analysis mode, wait for the backfill to finish, and keep strengthening your standalone post sample.",
      angles: [],
      drafts: [],
      draftArtifacts: [],
      supportAsset: null,
      whyThisWorks: [],
      watchOutFor: [
        "Wait for a deeper sample before treating drafts as reliable.",
      ],
      source: "deterministic",
      model: null,
      outputShape: contract.planner.outputShape,
    };
  }

  if (options?.intent === "ideate") {
    const focusLabel = options.contentFocus
      ? formatContentFocusLabel(options.contentFocus)
      : "the next content lane";

    return {
      content: `Start with ${focusLabel.toLowerCase()}. Keep the tone natural, lowercase, and specific to what you actually did or noticed. The first move is to pick 2-3 honest angles in that lane before writing final post copy.`,
      angles: [
        `the real thing you're learning while building it`,
        `one concrete pain point the product fixes + "thoughts?"`,
        `what building it changed about how you think about x growth`,
      ],
      drafts: [],
      draftArtifacts: [],
      supportAsset:
        "Use a screenshot, quick demo clip, or a link only if it helps prove the point.",
      whyThisWorks: [
        "It separates subject-matter planning from final copywriting.",
        "It keeps the next move anchored to a specific content lane instead of broad generic posting.",
      ],
      watchOutFor: [
        "Do not jump straight into polished generic startup takes.",
        "Use a real observation, project, or technical detail instead of abstract advice.",
      ],
      source: "deterministic",
      model: null,
      outputShape: "ideation_angles",
    };
  }

  const drafts = [
    options?.selectedAngle?.trim() || `${topHook}: ${contract.planner.primaryAngle}`,
    `${topType} angle: ${
      options?.selectedAngle?.trim() || contract.planner.primaryAngle
    }`,
  ];

  return {
    content: `Use the ${formatEnumLabel(contract.planner.targetLane)} lane. Lead with a ${topHook} opener, structure it as ${topType}, and keep it aligned to: ${contract.planner.primaryAngle}`,
    angles: [],
    drafts,
    draftArtifacts: buildClientDraftArtifacts(
      drafts,
      contract.planner.outputShape,
      "If the post is about a build, use a screenshot or quick demo clip instead of generic filler.",
    ),
    supportAsset:
      "If the post is about a build, use a screenshot or quick demo clip instead of generic filler.",
    whyThisWorks: [
      "It stays aligned to the current lane and angle.",
      "It keeps the draft inside the strongest deterministic constraints.",
    ],
    watchOutFor: ["Avoid broad generic phrasing."],
    source: "deterministic",
    model: null,
    outputShape: contract.planner.outputShape,
  };
}

function buildClientDraftArtifacts(
  drafts: string[],
  outputShape: Exclude<CreatorChatSuccess["data"]["outputShape"], "ideation_angles">,
  supportAsset: string | null,
): DraftArtifact[] {
  return drafts.map((draft, index) =>
    buildClientDraftArtifact({
      id: `${outputShape}-${index + 1}`,
      title: buildArtifactTitle(outputShape, index),
      kind: outputShape,
      content: draft,
      supportAsset,
    }),
  );
}

function buildArtifactTitle(
  outputShape: Exclude<CreatorChatSuccess["data"]["outputShape"], "ideation_angles">,
  index: number,
): string {
  switch (outputShape) {
    case "thread_seed":
      return `Thread Seed ${index + 1}`;
    case "long_form_post":
      return `Long Form ${index + 1}`;
    case "reply_candidate":
      return `Reply ${index + 1}`;
    case "quote_candidate":
      return `Quote ${index + 1}`;
    case "short_form_post":
    default:
      return `Draft ${index + 1}`;
  }
}

function buildClientDraftArtifact(params: {
  id: string;
  title: string;
  kind: Exclude<CreatorChatSuccess["data"]["outputShape"], "ideation_angles">;
  content: string;
  supportAsset: string | null;
}): DraftArtifact {
  const weightedCharacterCount = computeClientXWeightedCharacterCount(params.content);

  return {
    id: params.id,
    title: params.title,
    kind: params.kind,
    content: params.content,
    characterCount: params.content.length,
    weightedCharacterCount,
    isWithinXLimit: weightedCharacterCount <= 280,
    supportAsset: params.supportAsset,
    betterClosers: buildClientBetterClosers(params.content, params.kind),
    replyPlan: buildClientReplyPlan(params.content, params.kind),
  };
}

function computeClientXWeightedCharacterCount(text: string): number {
  const urlRegex = /https?:\/\/\S+/gi;
  let weighted = 0;
  let lastIndex = 0;

  for (const match of text.matchAll(urlRegex)) {
    const start = match.index ?? 0;
    weighted += countClientWeightedSegment(text.slice(lastIndex, start));
    weighted += 23;
    lastIndex = start + match[0].length;
  }

  weighted += countClientWeightedSegment(text.slice(lastIndex));
  return weighted;
}

function countClientWeightedSegment(value: string): number {
  let total = 0;

  for (const char of Array.from(value)) {
    total += /[\u1100-\u115F\u2329\u232A\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(
      char,
    )
      ? 2
      : 1;
  }

  return total;
}

function buildClientBetterClosers(
  draft: string,
  kind: Exclude<CreatorChatSuccess["data"]["outputShape"], "ideation_angles">,
): string[] {
  const lower = draft.toLowerCase();
  const suggestions = new Set<string>();

  if (lower.includes("build") || lower.includes("project") || lower.includes("app")) {
    suggestions.add("thoughts?");
    suggestions.add("would you use this?");
    suggestions.add("what would you add?");
  } else if (kind === "reply_candidate" || kind === "quote_candidate") {
    suggestions.add("fair take or am i off?");
    suggestions.add("curious if you see it the same way");
  } else {
    suggestions.add("agree or am i off?");
    suggestions.add("curious if anyone else has felt this");
    suggestions.add("thoughts?");
  }

  return Array.from(suggestions).slice(0, 3);
}

function buildClientReplyPlan(
  draft: string,
  kind: Exclude<CreatorChatSuccess["data"]["outputShape"], "ideation_angles">,
): string[] {
  const plan: string[] = [];

  if (kind === "reply_candidate") {
    plan.push("If they engage, ask one tighter follow-up instead of dropping a second argument.");
    plan.push("If they push back, reply with one concrete example instead of broadening the claim.");
    return plan;
  }

  if (draft.trim().endsWith("?")) {
    plan.push("Reply to the first useful answer quickly and ask one deeper follow-up.");
  } else {
    plan.push("When someone asks for details, reply with the concrete step, metric, or build constraint you left out.");
  }

  plan.push("If someone disagrees, answer with one specific example before defending the whole thesis.");
  plan.push("If the thread gets traction, pin one short follow-up that adds the missing proof.");
  return plan.slice(0, 3);
}

function AssistantTypingBubble(props: { status?: string | null }) {
  return (
    <div
      className="max-w-[88%] rounded-[1.75rem] border border-white/10 bg-white/[0.03] px-4 py-4 text-zinc-100"
      aria-live="polite"
      aria-label="Assistant is typing"
    >
      <div className="flex items-center gap-2">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-2.5 w-2.5 rounded-full bg-zinc-400/80 animate-pulse"
            style={{ animationDelay: `${index * 180}ms` }}
          />
        ))}
      </div>
      {props.status ? (
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          {props.status}
        </p>
      ) : null}
    </div>
  );
}

export default function ChatPage() {
  const searchParams = useSearchParams();
  const runId = searchParams.get("runId")?.trim() ?? "";
  const backfillJobId = searchParams.get("backfillJobId")?.trim() ?? "";

  const [context, setContext] = useState<CreatorAgentContext | null>(null);
  const [contract, setContract] = useState<CreatorGenerationContract | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftInput, setDraftInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [providerPreference, setProviderPreference] =
    useState<ChatProviderPreference>("groq");
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [backfillNotice, setBackfillNotice] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [strategyInputs, setStrategyInputs] = useState<ChatStrategyInputs>(
    DEFAULT_CHAT_STRATEGY_INPUTS,
  );
  const [toneInputs, setToneInputs] = useState<ChatToneInputs>(
    DEFAULT_CHAT_TONE_INPUTS,
  );
  const [contentFocus, setContentFocus] =
    useState<ChatContentFocus>("project_showcase");
  const [activeContentFocus, setActiveContentFocus] =
    useState<ChatContentFocus | null>(null);
  const [activeStrategyInputs, setActiveStrategyInputs] =
    useState<ChatStrategyInputs | null>(null);
  const [activeToneInputs, setActiveToneInputs] = useState<ChatToneInputs | null>(
    null,
  );
  const [strategyPromptStep, setStrategyPromptStep] =
    useState<StrategyPromptStep | null>("goal");
  const [isApplyingStrategyInputs, setIsApplyingStrategyInputs] = useState(false);
  const [activeDraftEditor, setActiveDraftEditor] = useState<{
    messageId: string;
    artifactIndex: number;
  } | null>(null);
  const [editorDraftText, setEditorDraftText] = useState("");

  const loadWorkspace = useCallback(
    async (
      overrides: ChatStrategyInputs | null = activeStrategyInputs,
      toneOverrides: ChatToneInputs | null = activeToneInputs,
    ): Promise<WorkspaceLoadResult> => {
      if (!runId) {
        setErrorMessage("Missing runId. Start from the landing page.");
        setIsLoading(false);
        return { ok: false };
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const requestBody = {
          runId,
          ...(overrides ?? {}),
          ...(toneOverrides ?? {}),
        };

        const [contextResponse, contractResponse] = await Promise.all([
          fetch("/api/creator/context", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          }),
          fetch("/api/creator/generation-contract", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          }),
        ]);

        const contextData: CreatorAgentContextResponse = await contextResponse.json();
        const contractData: CreatorGenerationContractResponse =
          await contractResponse.json();

        if (!contextResponse.ok || !contextData.ok) {
          setErrorMessage(
            contextData.ok
              ? "Failed to load the creator context."
              : (contextData.errors[0]?.message ??
                "Failed to load the creator context."),
          );
          return { ok: false };
        }

        if (!contractResponse.ok || !contractData.ok) {
          setErrorMessage(
            contractData.ok
              ? "Failed to load the generation contract."
              : (contractData.errors[0]?.message ??
                "Failed to load the generation contract."),
          );
          return { ok: false };
        }

        setContext(contextData.data);
        setContract(contractData.data);
        return {
          ok: true,
          contextData: contextData.data,
          contractData: contractData.data,
        };
      } catch {
        setErrorMessage("Network error while loading the chat workspace.");
        return { ok: false };
      } finally {
        setIsLoading(false);
      }
    },
    [activeStrategyInputs, activeToneInputs, runId],
  );

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (!context || !contract || messages.length > 0) {
      return;
    }

    setMessages([
      {
        id: "assistant-initial",
        role: "assistant",
        content: buildInitialAssistantMessage(context, contract),
      },
    ]);
  }, [context, contract, messages.length]);

  useEffect(() => {
    if (!backfillJobId) {
      return;
    }

    let cancelled = false;
    let finished = false;

    async function pollBackfillJob() {
      if (finished) {
        return;
      }

      try {
        const response = await fetch(
          `/api/onboarding/backfill/jobs?jobId=${encodeURIComponent(backfillJobId)}`,
          { method: "GET" },
        );

        if (!response.ok) {
          return;
        }

        const data: BackfillJobStatusResponse = await response.json();
        const job = data.job;
        if (!job || cancelled) {
          return;
        }

        if (job.status === "pending") {
          setBackfillNotice("Background backfill is queued.");
          return;
        }

        if (job.status === "processing") {
          setBackfillNotice("Background backfill is deepening the model.");
          return;
        }

        if (job.status === "failed") {
          setBackfillNotice(
            job.lastError
              ? `Background backfill failed: ${job.lastError}`
              : "Background backfill failed.",
          );
          finished = true;
          return;
        }

        if (job.status === "completed") {
          setBackfillNotice("Background backfill completed. Context refreshed.");
          await loadWorkspace();
          finished = true;
        }
      } catch {
        // Keep polling on transient failures.
      }
    }

    void pollBackfillJob();
    const interval = window.setInterval(() => {
      void pollBackfillJob();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [backfillJobId, loadWorkspace]);

  useEffect(() => {
    if (!showDevTools) {
      return;
    }

    const storedValue = window.localStorage.getItem(chatProviderStorageKey);
    if (storedValue === "openai" || storedValue === "groq") {
      setProviderPreference(storedValue);
    }
  }, []);

  useEffect(() => {
    if (!showDevTools) {
      return;
    }

    window.localStorage.setItem(chatProviderStorageKey, providerPreference);
  }, [providerPreference]);

  useEffect(() => {
    if (
      !context ||
      !contract ||
      activeToneInputs ||
      strategyPromptStep === null ||
      messages.length > 1
    ) {
      return;
    }

    setToneInputs((current) => {
      if (
        current.toneCasing !== DEFAULT_CHAT_TONE_INPUTS.toneCasing ||
        current.toneRisk !== DEFAULT_CHAT_TONE_INPUTS.toneRisk
      ) {
        return current;
      }

      return {
        toneCasing:
          context.creatorProfile.voice.primaryCasing === "lowercase" ||
          context.creatorProfile.voice.lowercaseSharePercent >= 60
            ? "lowercase"
            : "normal",
        toneRisk: contract.writer.targetRisk,
      };
    });
  }, [activeToneInputs, context, contract, messages.length, strategyPromptStep]);

  const summaryChips = useMemo(() => {
    if (!context) {
      return [];
    }

    return [
      `Archetype: ${formatEnumLabel(context.creatorProfile.archetype)}`,
      `Niche: ${formatNicheSummary(context)}`,
      `Loop: ${formatEnumLabel(context.creatorProfile.distribution.primaryLoop)}`,
      `Readiness: ${formatEnumLabel(context.readiness.status)}`,
      ...(activeContentFocus
        ? [`Focus: ${formatContentFocusLabel(activeContentFocus)}`]
        : []),
      ...(activeToneInputs
        ? [
            `Tone: ${formatToneCasingLabel(
              activeToneInputs.toneCasing,
            )} / ${formatToneRiskLabel(activeToneInputs.toneRisk)}`,
          ]
        : []),
    ];
  }, [activeContentFocus, activeToneInputs, context]);

  const sidebarThreads = useMemo(() => {
    if (!context || !contract) {
      return [];
    }

    const strategyItems = context.strategyDelta.adjustments.slice(0, 3).map((item) => ({
      id: `${item.area}-${item.direction}`,
      label: `${formatEnumLabel(item.direction)} ${formatAreaLabel(item.area)}`,
      meta: formatEnumLabel(item.priority),
    }));

    const anchorItems = context.positiveAnchors.slice(0, 3).map((post) => ({
      id: post.id,
      label: post.text.length > 50 ? `${post.text.slice(0, 50)}...` : post.text,
      meta: `${formatEnumLabel(post.lane)} · ${post.goalFitScore}`,
    }));

    return [
      {
        section: "Active",
        items: [
          {
            id: "current-workspace",
            label: contract.planner.primaryAngle,
            meta: formatEnumLabel(contract.planner.targetLane),
          },
        ],
      },
      {
        section: "Strategy",
        items: strategyItems,
      },
      {
        section: "Anchors",
        items: anchorItems,
      },
    ].filter((section) => section.items.length > 0);
  }, [context, contract]);
  const currentStrategyPrompt = useMemo(
    () =>
      buildStrategyPromptState(
        strategyPromptStep,
        strategyInputs,
        contentFocus,
        toneInputs,
      ),
    [contentFocus, strategyInputs, strategyPromptStep, toneInputs],
  );
  const selectedDraftArtifact = useMemo(() => {
    if (!activeDraftEditor) {
      return null;
    }

    const message = messages.find((item) => item.id === activeDraftEditor.messageId);
    if (!message?.draftArtifacts) {
      return null;
    }

    return message.draftArtifacts[activeDraftEditor.artifactIndex] ?? null;
  }, [activeDraftEditor, messages]);

  useEffect(() => {
    if (!selectedDraftArtifact) {
      setEditorDraftText("");
      return;
    }

    setEditorDraftText(selectedDraftArtifact.content);
  }, [selectedDraftArtifact]);

  const openDraftEditor = useCallback((messageId: string, artifactIndex: number) => {
    setActiveDraftEditor({ messageId, artifactIndex });
  }, []);

  const saveDraftEditor = useCallback(() => {
    if (!activeDraftEditor) {
      return;
    }

    const nextContent = editorDraftText.trim();
    if (!nextContent) {
      return;
    }

    setMessages((current) =>
      current.map((message) => {
        if (message.id !== activeDraftEditor.messageId || !message.draftArtifacts) {
          return message;
        }

        const nextDraftArtifacts = message.draftArtifacts.map((artifact, index) =>
          index === activeDraftEditor.artifactIndex
            ? buildClientDraftArtifact({
                id: artifact.id,
                title: artifact.title,
                kind: artifact.kind,
                content: nextContent,
                supportAsset: artifact.supportAsset,
              })
            : artifact,
        );

        const nextDrafts =
          message.drafts && message.drafts.length > 0
            ? message.drafts.map((draft, index) =>
                index === activeDraftEditor.artifactIndex ? nextContent : draft,
              )
            : nextDraftArtifacts.map((artifact) => artifact.content);

        return {
          ...message,
          drafts: nextDrafts,
          draftArtifacts: nextDraftArtifacts,
        };
      }),
    );
  }, [activeDraftEditor, editorDraftText]);

  const copyDraftEditor = useCallback(async () => {
    if (!editorDraftText.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(editorDraftText);
    } catch {
      setErrorMessage("Copy failed. Try selecting the text manually.");
    }
  }, [editorDraftText]);

  const requestAssistantReply = useCallback(
    async (options: {
      prompt: string;
      appendUserMessage: boolean;
      displayUserMessage?: string;
      selectedAngle?: string | null;
      intent?: ChatIntent;
      historySeed?: ChatMessage[];
      strategyInputOverride?: ChatStrategyInputs;
      toneInputOverride?: ChatToneInputs;
      contentFocusOverride?: ChatContentFocus | null;
      fallbackContext?: CreatorAgentContext;
      fallbackContract?: CreatorGenerationContract;
    }) => {
      const resolvedContext = options.fallbackContext ?? context;
      const resolvedContract = options.fallbackContract ?? contract;
      const resolvedStrategyInputs =
        options.strategyInputOverride ?? activeStrategyInputs;
      const resolvedToneInputs = options.toneInputOverride ?? activeToneInputs;
      const resolvedContentFocus =
        options.contentFocusOverride ?? activeContentFocus;

      if (
        !runId ||
        !resolvedContext ||
        !resolvedContract ||
        !resolvedStrategyInputs ||
        !resolvedToneInputs ||
        isSending
      ) {
        return;
      }

      const trimmedPrompt = options.prompt.trim();
      if (!trimmedPrompt) {
        return;
      }

      let history = options.historySeed ?? messages.slice(-6);

      if (options.appendUserMessage) {
        const userMessage: ChatMessage = {
          id: `user-${Date.now()}`,
          role: "user",
          content: options.displayUserMessage?.trim() || trimmedPrompt,
        };

        setMessages((current) => [...current, userMessage]);
        history = [...history, userMessage].slice(-6);
      }

      setIsSending(true);
      setStreamStatus("Planning the next move.");
      setErrorMessage(null);

      try {
        const response = await fetch("/api/creator/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            runId,
            message: trimmedPrompt,
            history,
            provider: providerPreference,
            stream: true,
            intent: options.intent ?? "draft",
            contentFocus: resolvedContentFocus,
            selectedAngle: options.selectedAngle ?? null,
            ...resolvedToneInputs,
            ...resolvedStrategyInputs,
          }),
        });

        const contentType = response.headers.get("content-type") ?? "";

        if (contentType.includes("application/json")) {
          const data: CreatorChatResponse = await response.json();

          const reply =
            response.ok && data.ok
              ? data.data
              : data.ok
                ? {
                    reply: "The chat route failed to return a reply.",
                    angles: [],
                    drafts: [],
                    draftArtifacts: [],
                    supportAsset: null,
                    outputShape: "short_form_post" as const,
                    whyThisWorks: [],
                    watchOutFor: [],
                    source: "deterministic" as const,
                    model: null,
                    mode: resolvedContract.mode,
                  }
                : null;

          setMessages((current) => [
            ...current,
            {
              id: `assistant-${Date.now() + 1}`,
              role: "assistant",
              content:
                reply?.reply ??
                (data.ok
                  ? "The chat route failed to return a reply."
                  : (data.errors[0]?.message ?? "Failed to generate a reply.")),
              angles: reply?.angles ?? [],
              drafts: reply?.drafts ?? [],
              draftArtifacts: reply?.draftArtifacts ?? [],
              supportAsset: reply?.supportAsset ?? null,
              outputShape: reply?.outputShape,
              whyThisWorks: reply?.whyThisWorks ?? [],
              watchOutFor: reply?.watchOutFor ?? [],
              source: reply?.source,
              model: reply?.model ?? null,
            },
          ]);
          return;
        }

        if (!response.body) {
          throw new Error("The chat stream did not return a readable body.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamedResult: CreatorChatSuccess["data"] | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) {
              continue;
            }

            const event = JSON.parse(line) as CreatorChatStreamEvent;

            if (event.type === "status") {
              setStreamStatus(event.message);
              continue;
            }

            if (event.type === "result") {
              streamedResult = event.data;
              continue;
            }

            if (event.type === "error") {
              throw new Error(event.message);
            }
          }
        }

        if (buffer.trim()) {
          const event = JSON.parse(buffer.trim()) as CreatorChatStreamEvent;
          if (event.type === "status") {
            setStreamStatus(event.message);
          } else if (event.type === "result") {
            streamedResult = event.data;
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }

        if (!streamedResult) {
          throw new Error("The chat stream finished without a result.");
        }

        setMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now() + 1}`,
            role: "assistant",
            content: streamedResult.reply,
            angles: streamedResult.angles,
            drafts: streamedResult.drafts,
            draftArtifacts: streamedResult.draftArtifacts,
            supportAsset: streamedResult.supportAsset,
            outputShape: streamedResult.outputShape,
            whyThisWorks: streamedResult.whyThisWorks,
            watchOutFor: streamedResult.watchOutFor,
            source: streamedResult.source,
            model: streamedResult.model ?? null,
          },
        ]);
      } catch (error) {
        const fallback = buildDeterministicReply(resolvedContext, resolvedContract, {
          intent: options.intent,
          contentFocus: resolvedContentFocus,
          selectedAngle: options.selectedAngle ?? null,
        });
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now() + 1}`,
            role: "assistant",
            ...fallback,
          },
        ]);
        setErrorMessage(
          error instanceof Error
            ? `${error.message} The deterministic fallback was used.`
            : "The live model failed, so the deterministic fallback was used.",
        );
      } finally {
        setIsSending(false);
        setStreamStatus(null);
      }
    },
    [
      activeContentFocus,
      activeStrategyInputs,
      activeToneInputs,
      contract,
      context,
      isSending,
      messages,
      providerPreference,
      runId,
    ],
  );

  const handleAngleSelect = useCallback(
    async (angle: string) => {
      if (!activeStrategyInputs || !activeToneInputs || strategyPromptStep || isSending) {
        return;
      }

      await requestAssistantReply({
        prompt: "Turn this angle into real X drafts.",
        displayUserMessage: `use this angle: ${angle}`,
        selectedAngle: angle,
        appendUserMessage: true,
        intent: "draft",
        strategyInputOverride: activeStrategyInputs,
        toneInputOverride: activeToneInputs,
        contentFocusOverride: activeContentFocus,
      });
    },
    [
      activeContentFocus,
      activeStrategyInputs,
      activeToneInputs,
      isSending,
      requestAssistantReply,
      strategyPromptStep,
    ],
  );

  const finalizeStrategyPlan = useCallback(
    async (
      nextInputs: ChatStrategyInputs,
      nextContentFocus: ChatContentFocus,
      nextToneInputs: ChatToneInputs,
    ) => {
      setIsApplyingStrategyInputs(true);
      setErrorMessage(null);

      const loaded = await loadWorkspace(nextInputs, nextToneInputs);

      if (loaded.ok && loaded.contextData && loaded.contractData) {
        const confirmationMessage: ChatMessage = {
          id: `assistant-plan-${Date.now()}`,
          role: "assistant",
          content: `Plan locked: ${formatEnumLabel(nextInputs.goal)}, ${formatEnumLabel(
            nextInputs.transformationMode,
          )}, ${formatPostingCapacityLabel(
            nextInputs.postingCadenceCapacity,
          )}, ${formatReplyBudgetLabel(nextInputs.replyBudgetPerDay)}, ${formatToneCasingLabel(
            nextToneInputs.toneCasing,
          )}, ${formatToneRiskLabel(nextToneInputs.toneRisk)}.`,
        };

        setActiveStrategyInputs(nextInputs);
        setActiveContentFocus(nextContentFocus);
        setActiveToneInputs(nextToneInputs);
        setStrategyPromptStep(null);
        setMessages((current) => [...current, confirmationMessage]);

        await requestAssistantReply({
          prompt: `I want to focus on ${formatContentFocusLabel(
            nextContentFocus,
          ).toLowerCase()}. Help me decide the best authentic directions to post about next. Do not draft final posts yet. Give me concrete angles, what each angle would prove, and the best next move.`,
          appendUserMessage: false,
          historySeed: [...messages, confirmationMessage].slice(-6),
          strategyInputOverride: nextInputs,
          toneInputOverride: nextToneInputs,
          contentFocusOverride: nextContentFocus,
          intent: "ideate",
          fallbackContext: loaded.contextData,
          fallbackContract: loaded.contractData,
        });
      }

      setIsApplyingStrategyInputs(false);
    },
    [loadWorkspace, messages, requestAssistantReply],
  );

  async function handleStrategyPromptSelect(
    step: StrategyPromptStep,
    selectedValue: string,
  ) {
    if (isApplyingStrategyInputs || isSending) {
      return;
    }

    const nextInputs: ChatStrategyInputs = { ...strategyInputs };
    const nextToneInputs: ChatToneInputs = { ...toneInputs };
    let nextContentFocus = contentFocus;

    if (step === "goal") {
      nextInputs.goal = selectedValue as UserGoal;
    } else if (step === "transformationMode") {
      nextInputs.transformationMode = selectedValue as TransformationMode;
    } else if (step === "postingCadenceCapacity") {
      nextInputs.postingCadenceCapacity =
        selectedValue as PostingCadenceCapacity;
    } else if (step === "replyBudgetPerDay") {
      nextInputs.replyBudgetPerDay = selectedValue as ReplyBudgetPerDay;
    } else if (step === "contentFocus") {
      nextContentFocus = selectedValue as ChatContentFocus;
      setContentFocus(nextContentFocus);
    } else if (step === "toneCasing") {
      nextToneInputs.toneCasing = selectedValue as ToneCasing;
    } else if (step === "toneRisk") {
      nextToneInputs.toneRisk = selectedValue as ToneRisk;
    }

    setStrategyInputs(nextInputs);
    setToneInputs(nextToneInputs);

    const currentIndex = strategyPromptSteps.indexOf(step);
    const nextStep = strategyPromptSteps[currentIndex + 1] ?? null;

    if (nextStep) {
      setStrategyPromptStep(nextStep);
      return;
    }

    await finalizeStrategyPlan(nextInputs, nextContentFocus, nextToneInputs);
  }

  async function handleComposerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedInput = draftInput.trim();
    if (!trimmedInput || !context || !contract || isSending) {
      return;
    }

    if (!activeStrategyInputs || strategyPromptStep) {
      setErrorMessage("Finish the setup prompts before drafting.");
      return;
    }

    setDraftInput("");

    await requestAssistantReply({
      prompt: trimmedInput,
      appendUserMessage: true,
      intent: "draft",
      strategyInputOverride: activeStrategyInputs,
      toneInputOverride: activeToneInputs ?? toneInputs,
      contentFocusOverride: activeContentFocus,
    });
  }

  return (
    <main className="relative h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 opacity-20" style={chatScanlineStyle} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/10" />
      {showDevTools ? (
        <div className="fixed bottom-24 right-4 z-20 md:bottom-6">
          <button
            type="button"
            onClick={() =>
              setProviderPreference((current) =>
                current === "openai" ? "groq" : "openai",
              )
            }
            className="rounded-full border border-white/10 bg-black/80 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white backdrop-blur-xl transition hover:bg-white/[0.04]"
          >
            Provider: {providerPreference === "openai" ? "OpenAI" : "Groq"}
          </button>
        </div>
      ) : null}

      <div className="relative flex h-full min-h-0">
        <aside
          className={`sticky top-0 hidden h-full min-h-0 shrink-0 border-r border-white/10 bg-white/[0.02] transition-[width] duration-300 md:flex md:flex-col ${
            sidebarOpen ? "w-[18.5rem]" : "w-[4.75rem]"
          }`}
        >
          <div className="px-3 pt-3">
            <Link
              href="/"
              className={`flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-3 transition hover:bg-white/[0.04] ${
                sidebarOpen ? "justify-start" : "justify-center"
              }`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-sm font-semibold tracking-[0.18em] text-white">
                X
              </span>
              {sidebarOpen ? (
                <span className="text-sm font-semibold tracking-[0.18em] text-white">
                  Xpo
                </span>
              ) : null}
            </Link>
          </div>

          <div className="flex items-center justify-between px-4 py-4">
            <button
              type="button"
              onClick={() => setSidebarOpen((current) => !current)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-500 transition hover:bg-white/[0.04] hover:text-white"
              aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              {sidebarOpen ? "×" : "≡"}
            </button>
            {sidebarOpen ? (
              <button
                type="button"
                onClick={() => {
                  void loadWorkspace();
                }}
                className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-300 transition hover:bg-white/[0.04]"
              >
                Refresh
              </button>
            ) : null}
          </div>

          <div className="px-3">
            <div className="flex items-center gap-2 rounded-2xl bg-white/[0.03] px-3 py-3">
              <span className="text-sm text-zinc-500">⌕</span>
              {sidebarOpen ? (
                <>
                  <span className="text-sm text-zinc-400">Search</span>
                  <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                    ⌘K
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <div className="px-3 pt-3">
            <button
              type="button"
              className={`flex w-full items-center gap-3 rounded-2xl border border-white/10 px-3 py-3 text-left transition hover:bg-white/[0.03] ${
                sidebarOpen ? "justify-start" : "justify-center"
              }`}
            >
              <span className="text-sm text-white">✎</span>
              {sidebarOpen ? (
                <span className="text-sm font-medium text-white">New Chat</span>
              ) : null}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4">
            {sidebarOpen ? (
              <div className="space-y-6">
                {sidebarThreads.map((section) => (
                  <div key={section.section} className="space-y-2">
                    <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
                      {section.section}
                    </p>
                    {section.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="block w-full rounded-2xl px-2 py-2 text-left transition hover:bg-white/[0.03]"
                      >
                        <span className="line-clamp-2 text-sm leading-6 text-zinc-200">
                          {item.label}
                        </span>
                        <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                          {item.meta}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 pt-2">
                {sidebarThreads.flatMap((section) => section.items).slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.03] text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 transition hover:bg-white/[0.05] hover:text-white"
                    title={item.label}
                  >
                    {item.label.slice(0, 2)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-white/10 px-3 py-4">
            {sidebarOpen && context ? (
              <div className="rounded-2xl border border-white/10 px-3 py-3">
                <p className="text-sm font-semibold text-white">@{context.account}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  {formatEnumLabel(context.creatorProfile.distribution.primaryLoop)}
                </p>
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-sm font-semibold text-white">
                  {context?.account.slice(0, 2).toUpperCase() ?? "X"}
                </div>
              </div>
            )}
          </div>
        </aside>

        <div className="flex h-full min-h-0 flex-1 flex-col">
          <header className="shrink-0 border-b border-white/10 px-4 py-3 sm:px-6">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen((current) => !current)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-500 transition hover:bg-white/[0.04] hover:text-white md:hidden"
                aria-label="Toggle sidebar"
              >
                ≡
              </button>
              <div className="flex justify-center md:justify-start">
                <div className="rounded-full border border-white/10 px-5 py-2">
                  <p className="font-mono text-sm font-semibold tracking-[0.08em] text-white">
                    X Strategy Chat
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAnalysisOpen(true)}
                  className="rounded-full border border-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-white/[0.04]"
                >
                  View Analysis
                </button>
              </div>
            </div>
          </header>

          <section className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-6 px-4 pb-12 pt-8 sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                {summaryChips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400"
                  >
                    {chip}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setStrategyInputs(activeStrategyInputs ?? strategyInputs);
                    setToneInputs(activeToneInputs ?? toneInputs);
                    setContentFocus(activeContentFocus ?? contentFocus);
                    setStrategyPromptStep("goal");
                    setErrorMessage(null);
                  }}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500 transition hover:bg-white/[0.04] hover:text-white"
                >
                  {strategyPromptStep ? "Planning..." : "Retune Plan"}
                </button>
              </div>

              {backfillNotice ? (
                <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  {backfillNotice}
                </div>
              ) : null}

              {isLoading && !context && !contract ? (
                <div className="text-sm text-zinc-400">Loading the agent context...</div>
              ) : (
                <>
                  {currentStrategyPrompt ? (
                    <div className="max-w-[88%] rounded-[1.75rem] border border-white/10 bg-white/[0.03] px-4 py-4 text-zinc-100">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                        Setup {currentStrategyPrompt.index} / {currentStrategyPrompt.total}
                      </p>
                      <p className="mt-3 text-sm font-medium leading-7 text-white">
                        {currentStrategyPrompt.label}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-zinc-400">
                        {currentStrategyPrompt.helper}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {currentStrategyPrompt.options.map((option) => (
                          <button
                            key={`${currentStrategyPrompt.step}-${option.value}`}
                            type="button"
                            onClick={() =>
                              void handleStrategyPromptSelect(
                                currentStrategyPrompt.step,
                                option.value,
                              )
                            }
                            disabled={isApplyingStrategyInputs || isSending}
                            className={`rounded-full border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] transition ${
                              currentStrategyPrompt.currentValue === option.value
                                ? "border-white/30 bg-white/[0.08] text-white"
                                : "border-white/10 text-zinc-500 hover:bg-white/[0.04] hover:text-white"
                            } disabled:cursor-not-allowed disabled:text-zinc-600`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      {isApplyingStrategyInputs ? (
                        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                          Rebuilding the plan and drafting the first move.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {errorMessage ? (
                    <div className="rounded-3xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                      {errorMessage}
                    </div>
                  ) : null}

                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[88%] px-4 py-3 text-sm leading-8 ${
                        message.role === "assistant"
                          ? "rounded-[1.75rem] border border-white/10 bg-white/[0.03] text-zinc-100"
                          : "ml-auto rounded-[1.75rem] bg-white px-4 py-3 text-black"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>

                      {message.role === "assistant" && message.angles?.length ? (
                        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                          {message.angles.map((angle, index) => (
                            <div
                              key={`${message.id}-angle-${index}`}
                              className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3"
                            >
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                Angle {index + 1}
                              </p>
                              <p className="mt-2 whitespace-pre-wrap leading-7 text-zinc-100">
                                {angle}
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  void handleAngleSelect(angle);
                                }}
                                disabled={
                                  isSending || !!strategyPromptStep || !activeStrategyInputs
                                }
                                className="mt-3 rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:text-zinc-600"
                              >
                                Turn Into Drafts
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {message.role === "assistant" && message.draftArtifacts?.length ? (
                        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                          {message.draftArtifacts.map((artifact, index) => (
                            <div
                              key={`${message.id}-draft-artifact-${artifact.id}`}
                              className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                    {artifact.title}
                                  </p>
                                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                                    {formatAreaLabel(artifact.kind)} · {artifact.weightedCharacterCount}/280
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openDraftEditor(message.id, index)}
                                  className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
                                >
                                  Edit
                                </button>
                              </div>
                              <p className="mt-3 whitespace-pre-wrap leading-7 text-zinc-100">
                                {artifact.content}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {message.role === "assistant" &&
                      !message.draftArtifacts?.length &&
                      message.drafts?.length ? (
                        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                          {message.drafts.map((draft, index) => (
                            <div
                              key={`${message.id}-draft-${index}`}
                              className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3"
                            >
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                Draft {index + 1}
                              </p>
                              <p className="mt-2 whitespace-pre-wrap leading-7 text-zinc-100">
                                {draft}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {message.role === "assistant" &&
                      message.supportAsset &&
                      !message.draftArtifacts?.length ? (
                        <div className="mt-4 border-t border-white/10 pt-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                            Best Asset
                          </p>
                          <p className="mt-2 text-xs leading-6 text-zinc-300">
                            {message.supportAsset}
                          </p>
                        </div>
                      ) : null}

                      {message.role === "assistant" &&
                      ((message.whyThisWorks?.length ?? 0) > 0 ||
                        (message.watchOutFor?.length ?? 0) > 0) ? (
                        <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2">
                          {message.whyThisWorks?.length ? (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                Why This Works
                              </p>
                              <ul className="mt-2 space-y-2 text-xs leading-6 text-zinc-300">
                                {message.whyThisWorks.map((item, index) => (
                                  <li key={`${message.id}-why-${index}`}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {message.watchOutFor?.length ? (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                Watch Out For
                              </p>
                              <ul className="mt-2 space-y-2 text-xs leading-6 text-zinc-300">
                                {message.watchOutFor.map((item, index) => (
                                  <li key={`${message.id}-watch-${index}`}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {showDevTools && message.role === "assistant" && message.source ? (
                        <div className="mt-4 border-t border-white/10 pt-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                            {message.source}
                            {message.model ? ` · ${message.model}` : ""}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ))}

                  {isSending ? <AssistantTypingBubble status={streamStatus} /> : null}
                </>
              )}
            </div>
          </section>

          <div className="shrink-0 border-t border-white/10 bg-black/80 backdrop-blur-xl">
            <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6">
              <form onSubmit={handleComposerSubmit}>
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-end gap-3">
                    <button
                      type="button"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-zinc-500 transition hover:bg-white/[0.04] hover:text-white"
                    >
                      +
                    </button>
                    <textarea
                      value={draftInput}
                      onChange={(event) => setDraftInput(event.target.value)}
                      placeholder={
                        activeStrategyInputs && !strategyPromptStep
                          ? "What are we creating today?"
                          : "Finish the setup prompts first."
                      }
                      disabled={isSending || !activeStrategyInputs || !!strategyPromptStep}
                      className="min-h-[72px] flex-1 resize-none bg-transparent text-sm font-medium tracking-tight text-white outline-none placeholder:text-zinc-600"
                    />
                    <button
                      type="submit"
                      disabled={
                        !context ||
                        !contract ||
                        !activeStrategyInputs ||
                        !!strategyPromptStep ||
                        !draftInput.trim() ||
                        isSending
                      }
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:bg-zinc-500"
                      aria-label="Send message"
                    >
                      {isSending ? "…" : "↑"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {selectedDraftArtifact ? (
        <aside className="absolute inset-y-0 right-0 z-20 w-full border-l border-white/10 bg-black/95 backdrop-blur-xl sm:max-w-xl">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  {selectedDraftArtifact.title}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                  {formatAreaLabel(selectedDraftArtifact.kind)} · {computeClientXWeightedCharacterCount(
                    editorDraftText,
                  )}/280 · {computeClientXWeightedCharacterCount(editorDraftText) <= 280
                    ? "Within Limit"
                    : "Over Limit"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveDraftEditor(null)}
                className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <textarea
                value={editorDraftText}
                onChange={(event) => setEditorDraftText(event.target.value)}
                className="min-h-[22rem] w-full resize-none rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-white outline-none placeholder:text-zinc-600"
                placeholder="Draft content"
              />

              {selectedDraftArtifact.supportAsset ? (
                <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.02] px-4 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Suggested Asset
                  </p>
                  <p className="mt-2 text-sm leading-7 text-zinc-300">
                    {selectedDraftArtifact.supportAsset}
                  </p>
                </div>
              ) : null}

              {selectedDraftArtifact.betterClosers.length ? (
                <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.02] px-4 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Better Closers
                  </p>
                  <ul className="mt-2 space-y-2 text-sm leading-7 text-zinc-300">
                    {selectedDraftArtifact.betterClosers.map((closer, index) => (
                      <li key={`${selectedDraftArtifact.id}-closer-${index}`}>{closer}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {selectedDraftArtifact.replyPlan.length ? (
                <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.02] px-4 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Reply Plan
                  </p>
                  <ul className="mt-2 space-y-2 text-sm leading-7 text-zinc-300">
                    {selectedDraftArtifact.replyPlan.map((step, index) => (
                      <li key={`${selectedDraftArtifact.id}-reply-${index}`}>{step}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="border-t border-white/10 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                  Edit the draft here before you use it.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void copyDraftEditor();
                    }}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={saveDraftEditor}
                    className="rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-200"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      ) : null}

      {analysisOpen && context ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 px-4 py-8">
          <div className="relative max-h-[85vh] w-full max-w-4xl overflow-y-auto border border-white/10 bg-black p-6">
            <button
              type="button"
              onClick={() => setAnalysisOpen(false)}
              className="absolute right-4 top-4 rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/[0.04]"
            >
              Close
            </button>

            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
                  Analysis Drawer
                </p>
                <h2 className="mt-2 font-mono text-3xl font-semibold text-white">
                  The full model stays here.
                </h2>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="border border-white/10 p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Archetype</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {formatEnumLabel(context.creatorProfile.archetype)}
                  </p>
                </div>
                <div className="border border-white/10 p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Niche</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {formatNicheSummary(context)}
                  </p>
                </div>
                <div className="border border-white/10 p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Loop</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {formatEnumLabel(context.creatorProfile.distribution.primaryLoop)}
                  </p>
                </div>
                <div className="border border-white/10 p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Readiness</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {context.readiness.score}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="border border-white/10 p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    Strategy Delta
                  </p>
                  <p className="mt-3 text-sm font-medium text-white">
                    {context.strategyDelta.primaryGap}
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                    {context.strategyDelta.adjustments.slice(0, 4).map((item) => (
                      <li key={`${item.area}-${item.direction}`}>
                        {formatEnumLabel(item.direction)} {formatAreaLabel(item.area)} ({formatEnumLabel(item.priority)})
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="border border-white/10 p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    Confidence
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                    <li>Sample: {context.confidence.sampleSize} posts</li>
                    <li>Needs backfill: {context.confidence.needsBackfill ? "Yes" : "No"}</li>
                    <li>Evaluation: {context.confidence.evaluationOverallScore}</li>
                    <li>Anchor quality: {context.anchorSummary.anchorQualityScore ?? "N/A"}</li>
                  </ul>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="border border-white/10 p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    Positive Anchors
                  </p>
                  <ul className="mt-3 space-y-3 text-sm text-zinc-300">
                    {context.positiveAnchors.slice(0, 4).map((post) => (
                      <li key={post.id} className="border border-white/10 p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                          {formatEnumLabel(post.lane)} | {post.goalFitScore}
                        </p>
                        <p className="mt-2 line-clamp-3 leading-6">{post.text}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="border border-white/10 p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    Negative Anchors
                  </p>
                  <ul className="mt-3 space-y-3 text-sm text-zinc-300">
                    {context.negativeAnchors.slice(0, 4).map((post) => (
                      <li key={post.id} className="border border-white/10 p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                          {formatEnumLabel(post.lane)} | {post.goalFitScore}
                        </p>
                        <p className="mt-2 line-clamp-3 leading-6">{post.text}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
