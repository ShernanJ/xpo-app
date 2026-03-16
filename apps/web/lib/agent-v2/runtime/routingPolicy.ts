import { isConstraintDeclaration, respondConversationally } from "../responses/chatResponder.ts";
import { createConversationMemorySnapshot } from "../memory/memoryStore.ts";
import { buildFastReplyRawResponse } from "./responseEnvelope.ts";
import type { TurnContext } from "./turnContextBuilder.ts";
import type {
  RawOrchestratorResponse,
  RoutingTrace,
} from "./types.ts";
import type { ConversationServices } from "./services.ts";
import type { V2ChatIntent } from "../contracts/chat.ts";
import { resolveRuntimeAction } from "./resolveRuntimeAction.ts";
import { summarizeRuntimeWorkerExecutions } from "./runtimeTrace.ts";

export interface RoutingPolicyResult {
  isFastReply: boolean;
  classifiedIntent: V2ChatIntent;
  resolvedMode: V2ChatIntent;
  routingTrace: RoutingTrace;
  memory: TurnContext["memory"];
  fastReplyResponse?: RawOrchestratorResponse;
}

function clearClarificationPatch() {
  return {
    unresolvedQuestion: null,
  } as const;
}

export async function resolveRoutingPolicy(
  context: TurnContext,
  services: ConversationServices,
): Promise<RoutingPolicyResult> {
  const {
    userMessage,
    recentHistory,
    explicitIntent,
    activeDraft,
    turnSource,
    artifactContext,
    planSeedSource,
    resolvedWorkflow,
    replyHandlingBypassedReason,
    memory,
    turnPlan,
    runId,
    threadId,
    userId,
    diagnosticContext,
    userContextString,
    profileReplyContext,
    styleCard,
    anchors,
    initialWorkerExecutions,
  } = context;

  const routingTrace: RoutingTrace = {
    normalizedTurn: {
      turnSource: turnSource || "free_text",
      artifactKind: artifactContext?.kind || null,
      planSeedSource: planSeedSource || null,
      replyHandlingBypassedReason: replyHandlingBypassedReason || null,
      resolvedWorkflow: resolvedWorkflow || null,
    },
    runtimeResolution: null,
    workerExecutions: [...initialWorkerExecutions],
    workerExecutionSummary: summarizeRuntimeWorkerExecutions(initialWorkerExecutions),
    persistedStateChanges: null,
    validations: [],
    turnPlan: turnPlan
      ? {
          userGoal: turnPlan.userGoal,
          overrideClassifiedIntent: turnPlan.overrideClassifiedIntent || null,
          shouldAutoDraftFromPlan: turnPlan.shouldAutoDraftFromPlan === true,
        }
      : null,
    controllerAction: null,
    classifiedIntent: null,
    resolvedMode: null,
    routerState: null,
    planInputSource: null,
    clarification: null,
    draftGuard: null,
    planFailure: null,
  };

  const controllerMemory = {
    conversationState: memory.conversationState,
    topicSummary: memory.topicSummary,
    hasPendingPlan: Boolean(memory.pendingPlan),
    hasActiveDraft:
      Boolean(activeDraft) ||
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

  const runtimeAction = await resolveRuntimeAction({
    turnSource,
    artifactContext,
    explicitIntent,
    resolvedWorkflowHint: resolvedWorkflow || null,
    turnPlan,
    userMessage,
    recentHistory,
    memory: controllerMemory,
    controlTurnImpl: services.controlTurn,
  });
  const controllerDecision = runtimeAction.decision;
  const classifiedIntent = runtimeAction.classifiedIntent;

  routingTrace.controllerAction = controllerDecision.action;
  routingTrace.runtimeResolution = {
    workflow: runtimeAction.workflow,
    source: runtimeAction.source,
  };

  let currentMemory = memory;
  if (controllerDecision.needs_memory_update) {
    const shouldStoreAsConstraint = isConstraintDeclaration(userMessage);
    let nextConstraints = shouldStoreAsConstraint
      ? Array.from(new Set([...currentMemory.activeConstraints, userMessage]))
      : [...currentMemory.activeConstraints];

    const MAX_CONSTRAINT_COUNT = 12;
    if (nextConstraints.length > MAX_CONSTRAINT_COUNT) {
      const hardGrounding = nextConstraints.filter(
        (c) => /^Correction lock:/i.test(c) || /^Topic grounding:/i.test(c),
      );
      const softConstraints = nextConstraints.filter(
        (c) => !/^Correction lock:/i.test(c) && !/^Topic grounding:/i.test(c),
      );
      const keepSoft = softConstraints.slice(-(MAX_CONSTRAINT_COUNT - hardGrounding.length));
      nextConstraints = [...hardGrounding, ...keepSoft];
    }

    const updated = await services.updateConversationMemory({
      runId,
      threadId,
      activeConstraints: nextConstraints,
    });
    currentMemory = createConversationMemorySnapshot(updated as unknown as Record<string, unknown>);
  }

  const mode = classifiedIntent;
  routingTrace.classifiedIntent = classifiedIntent;
  routingTrace.resolvedMode = mode;

  if ((turnPlan && !turnPlan.shouldGenerate) || runtimeAction.workflow === "answer_question") {
    // We already have styleCard and anchors from context building!
    const fastReply = await respondConversationally({
      userMessage,
      recentHistory,
      topicSummary: currentMemory.topicSummary,
      styleCard,
      topicAnchors: anchors.topicAnchors,
      userContextString,
      profileReplyContext,
      activeConstraints: currentMemory.activeConstraints,
      diagnosticContext,
      options: {
        conversationState: currentMemory.conversationState,
      },
    });

    if (fastReply) {
      const isConstraint = isConstraintDeclaration(userMessage);
      const nextConstraints = isConstraint
        ? Array.from(new Set([...currentMemory.activeConstraints, userMessage.trim()]))
        : undefined;

      const finalMemoryRecord = await services.updateConversationMemory({
        runId,
        threadId,
        conversationState:
          currentMemory.pendingPlan && currentMemory.conversationState === "plan_pending_approval"
            ? "plan_pending_approval"
            : currentMemory.conversationState === "draft_ready"
              ? "draft_ready"
              : "needs_more_context",
        ...(nextConstraints ? { activeConstraints: nextConstraints } : {}),
        assistantTurnCount: currentMemory.assistantTurnCount + 1,
        ...clearClarificationPatch(),
      });

      const finalMemory = createConversationMemorySnapshot(finalMemoryRecord as unknown as Record<string, unknown>);

      return {
        isFastReply: true,
        classifiedIntent,
        resolvedMode: mode,
        routingTrace,
        memory: finalMemory,
        fastReplyResponse: buildFastReplyRawResponse({
          response: fastReply.response,
          memory: finalMemory,
          data: {
            routingTrace,
          },
          presentationStyle: fastReply.presentationStyle,
        }) as RawOrchestratorResponse,
      };
    }
  }

  return {
    isFastReply: false,
    classifiedIntent,
    resolvedMode: mode,
    routingTrace,
    memory: currentMemory,
  };
}
