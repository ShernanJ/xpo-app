import type { V2ConversationMemory, V2ChatIntent } from "../../contracts/chat.ts";
import type {
  ChatArtifactContext,
  ChatResolvedWorkflow,
  ChatTurnSource,
  NormalizedChatTurnDiagnostics,
} from "../../contracts/turnContract.ts";
import type { VoiceStyleCard } from "../../core/styleProfile.ts";
import type { CreatorProfileHints } from "../../grounding/groundingPacket.ts";
import type { ProfileReplyContext } from "../../grounding/profileReplyContext.ts";
import { resolveRuntimeAction } from "../../runtime/resolveRuntimeAction.ts";
import { summarizeRuntimeWorkerExecutions } from "../../runtime/runtimeTrace.ts";
import type { RoutingTrace } from "../../runtime/conversationManager.ts";
import type { CreatorAgentContext } from "../../../onboarding/strategy/agentContext.ts";
import {
  planReplyTurn,
  resolveReplyTurnState,
  type PlannedReplyTurn,
  type ReplyAgentContext,
  type StructuredReplyContextInput,
} from "./replyTurnPlanner.ts";

type ReplyInsights = Parameters<typeof planReplyTurn>[0]["replyInsights"];

interface ControllerMemorySummary {
  conversationState: V2ConversationMemory["conversationState"];
  topicSummary: V2ConversationMemory["topicSummary"];
  hasPendingPlan: boolean;
  hasActiveDraft: boolean;
  unresolvedQuestion: V2ConversationMemory["unresolvedQuestion"];
  concreteAnswerCount: V2ConversationMemory["concreteAnswerCount"];
  pendingPlanSummary: string | null;
  latestRefinementInstruction: V2ConversationMemory["latestRefinementInstruction"];
  lastIdeationAngles: V2ConversationMemory["lastIdeationAngles"];
}

export interface PrepareHandledReplyTurnArgs {
  userId?: string | null;
  userMessage: string;
  recentHistory: string;
  explicitIntent?: V2ChatIntent | null;
  turnSource: ChatTurnSource;
  artifactContext: ChatArtifactContext | null;
  resolvedWorkflowHint?: ChatResolvedWorkflow | null;
  routingDiagnostics: NormalizedChatTurnDiagnostics;
  activeHandle: string | null;
  creatorAgentContext: ReplyAgentContext | null;
  creatorProfileHints?: CreatorProfileHints | null;
  profileReplyContext?: ProfileReplyContext | null;
  structuredReplyContext: StructuredReplyContextInput | null;
  shouldBypassReplyHandling: boolean;
  memory: V2ConversationMemory;
  toneRisk: unknown;
  goal: unknown;
  replyInsights: ReplyInsights;
  styleCard: VoiceStyleCard | null;
}

export interface PreparedHandledReplyTurn {
  plannedTurn: PlannedReplyTurn;
  routingTrace: RoutingTrace;
}

export interface ReplyTurnPreflightResult {
  handledTurn: PreparedHandledReplyTurn | null;
  shouldResetReplyWorkflow: boolean;
}

function buildControllerMemorySummary(memory: V2ConversationMemory): ControllerMemorySummary {
  return {
    conversationState: memory.conversationState,
    topicSummary: memory.topicSummary,
    hasPendingPlan: Boolean(memory.pendingPlan),
    hasActiveDraft:
      Boolean(memory.currentDraftArtifactId) ||
      memory.conversationState === "draft_ready" ||
      memory.conversationState === "editing",
    unresolvedQuestion: memory.unresolvedQuestion,
    concreteAnswerCount: memory.concreteAnswerCount,
    pendingPlanSummary: memory.pendingPlan
      ? [memory.pendingPlan.objective, memory.pendingPlan.angle].filter(Boolean).join(" | ")
      : null,
    latestRefinementInstruction: memory.latestRefinementInstruction,
    lastIdeationAngles: memory.lastIdeationAngles,
  };
}

export async function prepareHandledReplyTurn(
  args: PrepareHandledReplyTurnArgs,
): Promise<ReplyTurnPreflightResult> {
  const {
    replyStrategy,
    replyParseResult,
    replyContinuation,
    shouldResetReplyWorkflow,
    defaultReplyStage,
    defaultReplyTone,
    defaultReplyGoal,
  } = resolveReplyTurnState({
    activeHandle: args.activeHandle,
    creatorAgentContext: args.creatorAgentContext,
    effectiveMessage: args.userMessage,
    structuredReplyContext: args.structuredReplyContext,
    artifactContext: args.artifactContext,
    turnSource: args.turnSource,
    shouldBypassReplyHandling: args.shouldBypassReplyHandling,
    activeReplyContext: args.memory.activeReplyContext,
    toneRisk: args.toneRisk,
    goal: args.goal,
  });

  const plannedTurn = await planReplyTurn({
    activeReplyContext: args.memory.activeReplyContext,
    replyContinuation,
    replyParseResult,
    userId: args.userId || null,
    activeHandle: args.activeHandle,
    defaultReplyStage,
    defaultReplyTone,
    defaultReplyGoal,
    replyStrategy,
    replyInsights: args.replyInsights,
    styleCard: args.styleCard,
    creatorAgentContext:
      args.creatorAgentContext &&
      "generatedAt" in args.creatorAgentContext &&
      typeof args.creatorAgentContext.generatedAt === "string"
        ? (args.creatorAgentContext as CreatorAgentContext)
        : null,
    creatorProfileHints: args.creatorProfileHints || null,
    profileReplyContext: args.profileReplyContext || null,
  });

  if (!plannedTurn) {
    return {
      handledTurn: null,
      shouldResetReplyWorkflow,
    };
  }

  const runtimeAction = await resolveRuntimeAction({
    turnSource: args.turnSource,
    artifactContext: args.artifactContext,
    explicitIntent: args.explicitIntent,
    resolvedWorkflowHint:
      args.resolvedWorkflowHint && args.resolvedWorkflowHint !== "free_text"
        ? args.resolvedWorkflowHint
        : "reply_to_post",
    turnPlan: null,
    userMessage: args.userMessage,
    recentHistory: args.recentHistory,
    memory: buildControllerMemorySummary(args.memory),
  });

  const workerExecutions = [
    {
      worker: "reply_turn_preflight",
      capability: "replying" as const,
      phase: "execution" as const,
      mode: "sequential" as const,
      status: "completed" as const,
      groupId: null,
      details: {
        outputShape: plannedTurn.outputShape,
        surfaceMode: plannedTurn.surfaceMode,
        parseClassification: replyParseResult.classification,
        hasContinuation: Boolean(replyContinuation),
      },
    },
  ];

  return {
    shouldResetReplyWorkflow,
    handledTurn: {
      plannedTurn,
      routingTrace: {
        normalizedTurn: {
          turnSource: args.routingDiagnostics.turnSource,
          artifactKind: args.routingDiagnostics.artifactKind,
          planSeedSource: args.routingDiagnostics.planSeedSource,
          replyHandlingBypassedReason: args.routingDiagnostics.replyHandlingBypassedReason,
          resolvedWorkflow: args.routingDiagnostics.resolvedWorkflow,
        },
        runtimeResolution: {
          workflow: runtimeAction.workflow,
          source: runtimeAction.source,
        },
        workerExecutions,
        workerExecutionSummary: summarizeRuntimeWorkerExecutions(workerExecutions),
        persistedStateChanges: null,
        validations: [],
        turnPlan: null,
        controllerAction: runtimeAction.decision.action,
        classifiedIntent: runtimeAction.classifiedIntent,
        resolvedMode: runtimeAction.classifiedIntent,
        routerState: null,
        planInputSource: null,
        clarification: null,
        draftGuard: null,
        planFailure: null,
        timings: null,
      },
    },
  };
}
