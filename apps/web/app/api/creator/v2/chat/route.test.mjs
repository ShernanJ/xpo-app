import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  buildChatRoutePersistencePlan,
  buildChatRouteMappedData,
  buildDraftBundleVersionPayload,
  buildInitialDraftVersionPayload,
  buildConversationContextFromHistory,
  buildDraftVersionMetadata,
  looksLikeDraftHandoff,
  normalizeDraftPayload,
  parseSelectedDraftContext,
  resolveSelectedDraftContextFromHistory,
  resolveDraftArtifactKind,
  resolveEffectiveExplicitIntent,
  shouldBypassEmbeddedReplyHandling,
} from "./route.logic.ts";
import { persistAssistantTurnWithDeps } from "./route.persistence.ts";
import { findDuplicateTurnReplayInMessages } from "./route.idempotency.ts";
import { finalizeReplyTurnWithDeps } from "./route.replyFinalize.ts";
import {
  buildChatSuccessResponse,
  buildReplyAssistantMessageData,
  planReplyAssistantTurnProductEvents,
  planMainAssistantTurnProductEvents,
} from "./_lib/response/routeResponse.ts";
import { normalizeChatTurn } from "./_lib/normalization/turnNormalization.ts";
import { resolveArtifactContinuationAction } from "../../../../../lib/agent-v2/agents/controller.ts";
import { inferSourceTransparencyReply } from "../../../../../lib/agent-v2/orchestrator/correctionRepair.ts";
import { summarizeRuntimeWorkerExecutions } from "../../../../../lib/agent-v2/runtime/runtimeTrace.ts";

const baseMemory = {
  conversationState: "needs_more_context",
  topicSummary: "growth on x",
  lastIdeationAngles: [],
  concreteAnswerCount: 0,
  currentDraftArtifactId: null,
  activeDraftRef: null,
  rollingSummary: null,
  pendingPlan: null,
  clarificationState: null,
  assistantTurnCount: 1,
  latestRefinementInstruction: null,
  unresolvedQuestion: null,
  clarificationQuestionsAsked: 0,
  preferredSurfaceMode: "natural",
  formatPreference: "shortform",
  activeConstraints: [],
  activeReplyContext: null,
  activeReplyArtifactRef: null,
  selectedReplyOptionId: null,
  voiceFidelity: "balanced",
};

function createBaseRoutingTrace(overrides = {}) {
  const workerExecutions = overrides.workerExecutions || [
    {
      worker: "turn_context_hydration",
      capability: "shared",
      phase: "context_load",
      mode: "parallel",
      status: "completed",
      groupId: "turn_context_hydration",
    },
  ];

  return {
    normalizedTurn: {
      turnSource: "free_text",
      artifactKind: null,
      planSeedSource: "message",
      replyHandlingBypassedReason: null,
      resolvedWorkflow: "plan_then_draft",
    },
    runtimeResolution: {
      workflow: "plan_then_draft",
      source: "structured_turn",
    },
    workerExecutions,
    workerExecutionSummary: summarizeRuntimeWorkerExecutions(workerExecutions),
    persistedStateChanges: null,
    validations: [],
    turnPlan: null,
    controllerAction: null,
    classifiedIntent: "draft",
    resolvedMode: "draft",
    routerState: null,
    planInputSource: null,
    clarification: null,
    draftGuard: null,
    planFailure: null,
    ...overrides,
  };
}

test("selectedDraftContext defaults route intent to edit when explicit intent is missing", () => {
  const selectedDraftContext = parseSelectedDraftContext({
    messageId: "msg_1",
    versionId: "ver_1",
    content: "current draft",
  });

  const nextIntent = resolveEffectiveExplicitIntent({
    intent: "",
    selectedDraftContext,
  });

  assert.equal(nextIntent, "edit");
});

test("selected draft revisions bypass embedded reply handling", () => {
  const selectedDraftContext = parseSelectedDraftContext({
    messageId: "msg_1",
    versionId: "ver_1",
    content: "current draft",
  });

  assert.equal(
    shouldBypassEmbeddedReplyHandling({
      selectedDraftContext,
    }),
    true,
  );
});

test("structured ideation picks bypass embedded reply handling by turn source instead of draft context", () => {
  const normalized = normalizeChatTurn({
    body: {
      turnSource: "ideation_pick",
      artifactContext: {
        kind: "selected_angle",
        angle: "what's one habit that changed your x growth?",
        formatHint: "post",
      },
    },
  });

  assert.equal(
    shouldBypassEmbeddedReplyHandling({
      turnSource: normalized.source,
      artifactContext: normalized.artifactContext,
    }),
    true,
  );
});

test("normalizeDraftPayload moves actual draft text out of reply", () => {
  const result = normalizeDraftPayload({
    reply: "this is the actual draft content that should live in the draft field now",
    draft: null,
    drafts: [],
    outputShape: "short_form_post",
  });

  assert.equal(result.draft?.startsWith("this is the actual draft"), true);
  assert.equal(looksLikeDraftHandoff(result.reply), true);
});

test("normalizeDraftPayload preserves conversational handoff replies", () => {
  const handoffReply =
    "ran with that idea and drafted this. want any tweaks before you post?";
  const result = normalizeDraftPayload({
    reply: handoffReply,
    draft: "sample draft body",
    drafts: ["sample draft body"],
    outputShape: "short_form_post",
    surfaceMode: "generate_full_output",
    shouldAskFollowUp: true,
  });

  assert.equal(result.reply, handoffReply);
  assert.equal(result.draft, "sample draft body");
  assert.equal(looksLikeDraftHandoff(handoffReply), true);
});

test("normalizeDraftPayload can emit a non-question revision handoff", () => {
  const result = normalizeDraftPayload({
    reply: "",
    draft: "updated draft body",
    drafts: ["updated draft body"],
    outputShape: "short_form_post",
    surfaceMode: "revise_and_return",
    shouldAskFollowUp: false,
  });

  assert.equal(result.reply.includes("?"), false);
  assert.equal(result.reply.length > 0, true);
});

test("normalizeDraftPayload emits thread-native handoff copy for thread drafts", () => {
  const result = normalizeDraftPayload({
    reply: "",
    draft: "post 1\\n\\npost 2",
    drafts: ["post 1\\n\\npost 2"],
    outputShape: "thread_seed",
    surfaceMode: "generate_full_output",
    shouldAskFollowUp: true,
  });

  assert.equal(result.reply.toLowerCase().includes("thread"), true);
  assert.equal(result.reply.toLowerCase().includes("post?"), false);
});

test("normalizeDraftPayload emits thread-native non-question copy for thread revisions", () => {
  const result = normalizeDraftPayload({
    reply: "",
    draft: "post 1\\n\\npost 2",
    drafts: ["post 1\\n\\npost 2"],
    outputShape: "thread_seed",
    surfaceMode: "revise_and_return",
    shouldAskFollowUp: false,
  });

  assert.equal(result.reply.toLowerCase().includes("thread"), true);
  assert.equal(result.reply.includes("?"), false);
});

test("buildChatRouteMappedData uses finalized response-shape ownership for artifact visibility", () => {
  const mapped = buildChatRouteMappedData({
    result: {
      outputShape: "coach_question",
      response: "what angle do you want to push?",
      surfaceMode: "ask_one_question",
      responseShapePlan: {
        surfaceMode: "ask_one_question",
        shouldShowArtifacts: false,
        shouldAskFollowUp: true,
        maxFollowUps: 1,
      },
      memory: baseMemory,
      data: {
        plan: {
          objective: "should not leak",
          angle: "should stay hidden",
          targetLane: "original",
        },
        quickReplies: [{ id: "qr_1", label: "go" }],
        angles: [{ title: "hidden angle" }],
      },
    },
    plan: {
      objective: "should not leak",
      angle: "should stay hidden",
      targetLane: "original",
      mustInclude: [],
      mustAvoid: [],
      hookType: "question",
      pitchResponse: "hidden",
    },
    selectedDraftContext: null,
    formatPreference: "shortform",
    isVerifiedAccount: false,
    userPreferences: null,
    styleCard: null,
    routingDiagnostics: {
      turnSource: "free_text",
      artifactKind: null,
      planSeedSource: "message",
      replyHandlingBypassedReason: null,
      resolvedWorkflow: "free_text",
    },
    clientTurnId: "turn_1",
  });

  assert.deepEqual(mapped.mappedData.angles, []);
  assert.deepEqual(mapped.mappedData.quickReplies, []);
  assert.equal(mapped.mappedData.plan, null);
  assert.equal(mapped.mappedData.surfaceMode, "ask_one_question");
});

test("buildChatRouteMappedData derives draft handoff from finalized envelope fields", () => {
  const mapped = buildChatRouteMappedData({
    result: {
      outputShape: "short_form_post",
      response: "",
      surfaceMode: "revise_and_return",
      responseShapePlan: {
        surfaceMode: "revise_and_return",
        shouldShowArtifacts: true,
        shouldAskFollowUp: false,
        maxFollowUps: 0,
      },
      memory: {
        ...baseMemory,
        conversationState: "editing",
      },
      data: {
        draft: "updated draft body",
      },
    },
    plan: null,
    selectedDraftContext: null,
    formatPreference: "shortform",
    isVerifiedAccount: false,
    userPreferences: null,
    styleCard: null,
    routingDiagnostics: {
      turnSource: "free_text",
      artifactKind: null,
      planSeedSource: "message",
      replyHandlingBypassedReason: null,
      resolvedWorkflow: "free_text",
    },
    clientTurnId: "turn_2",
  });

  assert.equal(mapped.mappedData.reply.includes("?"), false);
  assert.equal(mapped.mappedData.draft, "updated draft body");
});

test("buildChatRoutePersistencePlan prepares thread updates, candidate writes, and analytics from mapped data", () => {
  const plan = buildChatRoutePersistencePlan({
    mappedDataSeed: {
      reply: "here's the draft. take a look.",
      angles: [],
      quickReplies: [],
      plan: null,
      draft: "selected draft",
      drafts: ["selected draft", "backup draft"],
      draftArtifacts: [
        {
          id: "artifact-1",
          title: "Primary draft",
          kind: "short_form_post",
          content: "selected draft",
          voiceTarget: { summary: "plainspoken" },
          noveltyNotes: ["lead with proof"],
          groundingSources: [{ type: "story", title: "Customer story", claims: [], snippets: [] }],
          groundingMode: "saved_sources",
          groundingExplanation: "Grounded in saved material.",
        },
      ],
      draftVersions: [
        {
          id: "version-1",
          content: "selected draft",
          source: "assistant_generated",
          createdAt: "2026-03-13T12:00:00.000Z",
          basedOnVersionId: null,
          weightedCharacterCount: 120,
          maxCharacterLimit: 280,
        },
      ],
      activeDraftVersionId: "version-1",
      previousVersionSnapshot: undefined,
      revisionChainId: "revision-chain-1",
      draftBundle: {
        kind: "sibling_options",
        selectedOptionId: "option-2",
        options: [
          {
            id: "option-1",
            label: "Option one",
            versionId: "version-1",
            content: "first draft",
            artifact: {
              id: "bundle-artifact-1",
              title: "Option one",
              kind: "short_form_post",
              content: "first draft",
              voiceTarget: { summary: "first" },
              noveltyNotes: ["open with tension"],
              groundingSources: [],
              groundingMode: "saved_sources",
              groundingExplanation: "Saved sources",
            },
          },
          {
            id: "option-2",
            label: "Option two",
            versionId: "version-2",
            content: "selected draft",
            artifact: {
              id: "bundle-artifact-2",
              title: "Option two",
              kind: "short_form_post",
              content: "selected draft",
              voiceTarget: { summary: "second" },
              noveltyNotes: ["keep it tighter"],
              groundingSources: [{ type: "story", title: "Customer story", claims: [], snippets: [] }],
              groundingMode: "saved_sources",
              groundingExplanation: "Saved sources",
            },
          },
        ],
      },
      supportAsset: null,
      groundingSources: [{ type: "story", title: "Customer story", claims: [], snippets: [] }],
      autoSavedSourceMaterials: {
        count: 2,
        assets: [],
      },
      outputShape: "short_form_post",
      surfaceMode: "generate_full_output",
      memory: baseMemory,
      routingDiagnostics: {
        turnSource: "free_text",
        artifactKind: null,
        planSeedSource: "message",
        replyHandlingBypassedReason: null,
        resolvedWorkflow: "free_text",
      },
      requestTrace: {
        clientTurnId: "turn_3",
      },
      replyArtifacts: null,
      replyParse: null,
    },
    issuesFixed: ["tightened the opener"],
    responseGroundingMode: "saved_sources",
    responseGroundingExplanation: "Grounded in saved material.",
    defaultThreadTitle: "New Chat",
    currentThreadTitle: "Current thread",
    nextThreadTitle: "Sharper thread title",
    preferredSurfaceMode: "structured",
    shouldClearReplyWorkflow: true,
  });

  assert.equal(plan.assistantMessageData.threadTitle, "Current thread");
  assert.equal(plan.assistantMessageData.contextPacket.draftRef?.activeDraftVersionId, "version-1");
  assert.equal(plan.threadUpdate.title, "Sharper thread title");
  assert.equal(plan.memoryUpdate.activeDraftVersionId, "version-1");
  assert.equal(plan.memoryUpdate.shouldClearReplyWorkflow, true);
  assert.equal(plan.draftCandidateCreates.length, 2);
  assert.equal(plan.draftCandidateCreates[1]?.title, "Option two");
  assert.equal(plan.analytics.primaryGroundingMode, "saved_sources");
  assert.equal(plan.analytics.primaryGroundingSourceCount, 1);
  assert.equal(plan.analytics.autoSavedSourceMaterialCount, 2);
});

test("buildReplyAssistantMessageData preserves reply artifacts and context packet details", () => {
  const mapped = buildReplyAssistantMessageData({
    reply: "pulled 3 grounded reply directions from that post.",
    outputShape: "reply_candidate",
    surfaceMode: "offer_options",
    quickReplies: [{ id: "qr_1", label: "show drafts" }],
    memory: {
      ...baseMemory,
      preferredSurfaceMode: "structured",
      activeReplyContext: {
        sourceText: "original post body",
        sourceUrl: "https://x.com/example/status/1",
        authorHandle: "example",
        quotedUserAsk: null,
        confidence: "high",
        parseReason: "reply_request_with_embedded_post",
        awaitingConfirmation: false,
        stage: "1k_to_10k",
        tone: "builder",
        goal: "start_conversation",
        opportunityId: "opp_1",
        latestReplyOptions: [],
        latestReplyDraftOptions: [],
        selectedReplyOptionId: null,
      },
    },
    routingDiagnostics: {
      turnSource: "free_text",
      artifactKind: null,
      planSeedSource: "message",
      replyHandlingBypassedReason: null,
      resolvedWorkflow: "reply",
    },
    clientTurnId: "turn_reply_1",
    threadTitle: "Reply thread",
    replyArtifacts: {
      kind: "reply_options",
      sourceText: "original post body",
      sourceUrl: "https://x.com/example/status/1",
      authorHandle: "example",
      options: [{ id: "opt_1", label: "Option 1", text: "first reply" }],
      groundingNotes: ["pulled from original post"],
      warnings: [],
      selectedOptionId: null,
    },
    replyParse: {
      detected: true,
      confidence: "high",
      needsConfirmation: false,
      parseReason: "reply_request_with_embedded_post",
    },
  });

  assert.equal(mapped.replyArtifacts?.kind, "reply_options");
  assert.equal(mapped.requestTrace.clientTurnId, "turn_reply_1");
  assert.equal(mapped.contextPacket.replyRef?.kind, "reply_options");
  assert.equal(mapped.contextPacket.replyParse?.parseReason, "reply_request_with_embedded_post");
});

test("planMainAssistantTurnProductEvents derives draft analytics and clarification prompts from mapped data", () => {
  const events = planMainAssistantTurnProductEvents({
    mappedData: {
      outputShape: "short_form_post",
      draft: "draft body",
      surfaceMode: "generate_full_output",
      memory: {
        ...baseMemory,
        clarificationQuestionsAsked: 2,
      },
    },
    analytics: {
      primaryGroundingMode: "saved_sources",
      primaryGroundingSourceCount: 3,
      autoSavedSourceMaterialCount: 1,
    },
    explicitIntent: null,
  });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, "draft_generated");
  assert.equal(events[0]?.properties.usedSavedSources, true);
  assert.equal(events[0]?.properties.autoSavedSourceMaterialCount, 1);

  const clarificationEvents = planMainAssistantTurnProductEvents({
    mappedData: {
      outputShape: "coach_question",
      draft: null,
      surfaceMode: "ask_one_question",
      memory: {
        ...baseMemory,
        conversationState: "needs_more_context",
        clarificationQuestionsAsked: 1,
        topicSummary: "messaging",
      },
    },
    analytics: {
      primaryGroundingMode: null,
      primaryGroundingSourceCount: 0,
      autoSavedSourceMaterialCount: 0,
    },
    explicitIntent: "edit",
  });

  assert.equal(clarificationEvents.length, 1);
  assert.equal(clarificationEvents[0]?.eventType, "clarification_prompted");
  assert.equal(clarificationEvents[0]?.properties.explicitIntent, "edit");
  assert.equal(clarificationEvents[0]?.properties.hasTopicSummary, true);
});

test("buildChatSuccessResponse merges billing and ids into the final API payload", async () => {
  const response = await buildChatSuccessResponse({
    mappedData: {
      reply: "here's the draft",
      angles: [],
      quickReplies: [],
      plan: null,
      draft: "draft body",
      drafts: ["draft body"],
      draftArtifacts: [],
      draftVersions: [],
      activeDraftVersionId: undefined,
      previousVersionSnapshot: undefined,
      revisionChainId: undefined,
      draftBundle: null,
      supportAsset: null,
      groundingSources: [],
      autoSavedSourceMaterials: null,
      outputShape: "short_form_post",
      surfaceMode: "generate_full_output",
      memory: baseMemory,
      routingDiagnostics: {
        turnSource: "free_text",
        artifactKind: null,
        planSeedSource: "message",
        replyHandlingBypassedReason: null,
        resolvedWorkflow: "draft",
      },
      requestTrace: {
        clientTurnId: "turn_4",
      },
      replyArtifacts: null,
      replyParse: null,
      threadTitle: "Thread title",
      billing: null,
      contextPacket: {
        version: "assistant_context_v2",
        summary: "draft: draft body",
        planRef: null,
        draftRef: {
          excerpt: "draft body",
          activeDraftVersionId: null,
          revisionChainId: null,
        },
        grounding: {
          mode: null,
          explanation: null,
          sourceTitles: [],
        },
        critique: {
          issuesFixed: [],
        },
        replyRef: null,
        replyParse: null,
        artifacts: {
          outputShape: "short_form_post",
          surfaceMode: "generate_full_output",
          quickReplyCount: 0,
          hasDraft: true,
        },
      },
    },
    createdAssistantMessageId: "assistant-msg-9",
    newThreadId: "thread-9",
    loadBilling: async () => ({ creditsRemaining: 12 }),
  });
  const json = await response.json();

  assert.equal(json.ok, true);
  assert.equal(json.data.billing.creditsRemaining, 12);
  assert.equal(json.data.messageId, "assistant-msg-9");
  assert.equal(json.data.newThreadId, "thread-9");
});

test("buildChatSuccessResponse exposes routingTrace only when provided", async () => {
  const routingTrace = createBaseRoutingTrace();
  const response = await buildChatSuccessResponse({
    mappedData: {
      reply: "here's the draft",
      angles: [],
      quickReplies: [],
      plan: null,
      draft: "draft body",
      drafts: ["draft body"],
      draftArtifacts: [],
      draftVersions: [],
      activeDraftVersionId: undefined,
      previousVersionSnapshot: undefined,
      revisionChainId: undefined,
      draftBundle: null,
      supportAsset: null,
      groundingSources: [],
      autoSavedSourceMaterials: null,
      outputShape: "short_form_post",
      surfaceMode: "generate_full_output",
      memory: baseMemory,
      routingDiagnostics: {
        turnSource: "free_text",
        artifactKind: null,
        planSeedSource: "message",
        replyHandlingBypassedReason: null,
        resolvedWorkflow: "draft",
      },
      requestTrace: {
        clientTurnId: "turn_5",
      },
      replyArtifacts: null,
      replyParse: null,
      threadTitle: "Thread title",
      billing: null,
      contextPacket: {
        version: "assistant_context_v2",
        summary: "draft: draft body",
        planRef: null,
        draftRef: {
          excerpt: "draft body",
          activeDraftVersionId: null,
          revisionChainId: null,
        },
        grounding: {
          mode: null,
          explanation: null,
          sourceTitles: [],
        },
        critique: {
          issuesFixed: [],
        },
        replyRef: null,
        replyParse: null,
        artifacts: {
          outputShape: "short_form_post",
          surfaceMode: "generate_full_output",
          quickReplyCount: 0,
          hasDraft: true,
        },
      },
    },
    routingTrace,
    loadBilling: async () => ({ creditsRemaining: 11 }),
  });
  const json = await response.json();

  assert.deepEqual(json.data.routingTrace, routingTrace);
});

test("finalizeReplyTurnWithDeps keeps reply planning separate from route persistence and response assembly", async () => {
  let persistedArgs = null;
  let dispatchedArgs = null;
  const routingTrace = createBaseRoutingTrace();

  const response = await finalizeReplyTurnWithDeps(
    {
      plannedTurn: {
        reply: "ran with option 2 and tightened it into a full reply.",
        outputShape: "reply_candidate",
        surfaceMode: "generate_full_output",
        quickReplies: [{ id: "reply_1", label: "Use this" }],
        activeReplyContext: {
          sourceText: "Founders should write every day even if nobody reads it yet.",
          sourceUrl: "https://x.com/example/status/1",
          authorHandle: "example",
          quotedUserAsk: "how should i reply?",
          confidence: "high",
          parseReason: "reply_option_selected",
          awaitingConfirmation: false,
          stage: "1k_to_10k",
          tone: "builder",
          goal: "followers",
          opportunityId: "chat-reply-1",
          latestReplyOptions: [],
          latestReplyDraftOptions: [],
          selectedReplyOptionId: "option_2",
        },
        selectedReplyOptionId: "option_2",
        replyArtifacts: {
          kind: "reply_draft",
          sourceText: "Founders should write every day even if nobody reads it yet.",
          sourceUrl: "https://x.com/example/status/1",
          authorHandle: "example",
          options: [
            {
              id: "option_2",
              label: "Option 2",
              text: "agree with the principle, but i'd make the reps more deliberate than daily by default.",
              intent: {
                label: "useful nuance",
                strategyPillar: "useful nuance",
                anchor: "daily reps",
                rationale: "adds one practical layer",
              },
            },
          ],
          notes: ["Keep it practical."],
          selectedOptionId: "option_2",
        },
        replyParse: {
          detected: true,
          confidence: "high",
          needsConfirmation: false,
          parseReason: "reply_option_selected",
        },
        eventType: "chat_reply_draft_generated",
      },
      storedMemory: baseMemory,
      routingDiagnostics: {
        turnSource: "reply_action",
        artifactKind: "reply_confirmation",
        planSeedSource: "message",
        replyHandlingBypassedReason: null,
        resolvedWorkflow: "reply_to_post",
      },
      clientTurnId: "turn_reply_1",
      defaultThreadTitle: "New Chat",
      storedThreadId: "thread-reply-1",
      storedThreadTitle: "Existing Reply Thread",
      requestedThreadId: "",
      routingTrace,
      shouldIncludeRoutingTrace: true,
      userId: "user-reply-1",
      activeHandle: "stan",
      loadBilling: async () => ({ creditsRemaining: 8 }),
      recordProductEvent: async () => null,
    },
    {
      persistAssistantTurn: async (args) => {
        persistedArgs = args;
        return {
          assistantMessageId: "assistant-msg-reply",
          updatedThreadTitle: "Updated Reply Thread",
          tracePatch: {
            workerExecutions: [
              {
                worker: "persist_assistant_message",
                capability: "shared",
                phase: "persistence",
                mode: "sequential",
                status: "completed",
                groupId: null,
                details: {
                  threadId: "thread-reply-1",
                  assistantMessageId: "assistant-msg-reply",
                },
              },
              {
                worker: "update_chat_thread",
                capability: "shared",
                phase: "persistence",
                mode: "sequential",
                status: "completed",
                groupId: null,
                details: {
                  threadId: "thread-reply-1",
                  updatedTitle: "Updated Reply Thread",
                },
              },
            ],
            persistedStateChanges: {
              assistantMessageId: "assistant-msg-reply",
              thread: {
                threadId: "thread-reply-1",
                updatedTitle: "Updated Reply Thread",
                titleChanged: true,
              },
              memory: {
                updated: true,
                preferredSurfaceMode: "structured",
                activeDraftVersionId: null,
                clearedReplyWorkflow: false,
                selectedReplyOptionId: "option_2",
              },
              draftCandidates: {
                attempted: 0,
                created: 0,
                skipped: 0,
              },
            },
          },
        };
      },
      buildReplyAssistantMessageData,
      planReplyAssistantTurnProductEvents,
      dispatchPlannedProductEvents: (args) => {
        dispatchedArgs = args;
      },
      buildChatSuccessResponse,
    },
  );

  assert.equal(persistedArgs.threadId, "thread-reply-1");
  assert.equal(
    persistedArgs.assistantMessageData.reply,
    "ran with option 2 and tightened it into a full reply.",
  );
  assert.deepEqual(
    persistedArgs.buildMemoryUpdate("assistant-msg-reply"),
    {
      preferredSurfaceMode: "structured",
      activeReplyContext: {
        sourceText: "Founders should write every day even if nobody reads it yet.",
        sourceUrl: "https://x.com/example/status/1",
        authorHandle: "example",
        quotedUserAsk: "how should i reply?",
        confidence: "high",
        parseReason: "reply_option_selected",
        awaitingConfirmation: false,
        stage: "1k_to_10k",
        tone: "builder",
        goal: "followers",
        opportunityId: "chat-reply-1",
        latestReplyOptions: [],
        latestReplyDraftOptions: [],
        selectedReplyOptionId: "option_2",
      },
      activeReplyArtifactRef: {
        messageId: "assistant-msg-reply",
        kind: "reply_draft",
      },
      selectedReplyOptionId: "option_2",
    },
  );
  assert.equal(dispatchedArgs.events.length, 1);
  assert.equal(dispatchedArgs.events[0].eventType, "chat_reply_draft_generated");
  assert.equal(dispatchedArgs.threadId, "thread-reply-1");
  assert.equal(dispatchedArgs.messageId, "assistant-msg-reply");

  const json = await response.json();
  assert.equal(json.ok, true);
  assert.equal(json.data.threadTitle, "Updated Reply Thread");
  assert.equal(json.data.messageId, "assistant-msg-reply");
  assert.equal(json.data.newThreadId, "thread-reply-1");
  assert.equal(json.data.replyArtifacts.kind, "reply_draft");
  assert.equal(json.data.replyParse.parseReason, "reply_option_selected");
  assert.equal(json.data.routingTrace.workerExecutions.at(-1).worker, "update_chat_thread");
  assert.equal(json.data.routingTrace.persistedStateChanges.assistantMessageId, "assistant-msg-reply");
  assert.equal(json.data.routingTrace.persistedStateChanges.memory.selectedReplyOptionId, "option_2");
});

test("persistAssistantTurnWithDeps preserves sequential write order", async () => {
  const calls = [];

  const result = await persistAssistantTurnWithDeps(
    {
      threadId: "thread-1",
      assistantMessageData: {
        reply: "here's the draft",
        threadTitle: "Current thread",
      },
      threadUpdate: {
        updatedAt: new Date("2026-03-13T15:00:00.000Z"),
        title: "Updated title",
      },
      buildMemoryUpdate: (assistantMessageId) => ({
        preferredSurfaceMode: "natural",
        activeDraftRef: {
          messageId: assistantMessageId,
          versionId: "version-1",
          revisionChainId: "revision-chain-1",
        },
      }),
      draftCandidateCreates: [
        {
          title: "Option one",
          artifact: { id: "artifact-1" },
          voiceTarget: { summary: "first" },
          noveltyNotes: ["note one"],
        },
        {
          title: "Option two",
          artifact: { id: "artifact-2" },
          voiceTarget: null,
          noveltyNotes: ["note two"],
        },
      ],
      draftCandidateContext: {
        userId: "user-1",
        xHandle: "stan",
        runId: "run-1",
        sourcePrompt: "write me a post",
        sourcePlaybook: "chat_bundle",
        outputShape: "short_form_post",
      },
    },
    {
      async createChatMessage(args) {
        calls.push(["createChatMessage", args.threadId, args.content]);
        return { id: "assistant-msg-1" };
      },
      async updateConversationMemory(args) {
        calls.push([
          "updateConversationMemory",
          args.threadId,
          args.activeDraftRef?.messageId,
          args.activeDraftRef?.versionId,
        ]);
        return null;
      },
      async updateChatThread(args) {
        calls.push(["updateChatThread", args.threadId, args.data.title ?? null]);
        return { title: "Updated title" };
      },
      async createDraftCandidate(args) {
        calls.push(["createDraftCandidate", args.threadId, args.title]);
        return null;
      },
    },
  );

  assert.equal(result.assistantMessageId, "assistant-msg-1");
  assert.equal(result.updatedThreadTitle, "Updated title");
  assert.deepEqual(
    result.tracePatch.workerExecutions.map((execution) => execution.worker),
    [
      "persist_assistant_message",
      "update_conversation_memory",
      "update_chat_thread",
      "create_draft_candidate",
      "create_draft_candidate",
    ],
  );
  assert.deepEqual(result.tracePatch.persistedStateChanges, {
    assistantMessageId: "assistant-msg-1",
    thread: {
      threadId: "thread-1",
      updatedTitle: "Updated title",
      titleChanged: true,
    },
    memory: {
      updated: true,
      preferredSurfaceMode: "natural",
      activeDraftVersionId: "version-1",
      clearedReplyWorkflow: false,
      selectedReplyOptionId: null,
    },
    draftCandidates: {
      attempted: 2,
      created: 2,
      skipped: 0,
    },
  });
  assert.deepEqual(calls, [
    ["createChatMessage", "thread-1", "here's the draft"],
    ["updateConversationMemory", "thread-1", "assistant-msg-1", "version-1"],
    ["updateChatThread", "thread-1", "Updated title"],
    ["createDraftCandidate", "thread-1", "Option one"],
    ["createDraftCandidate", "thread-1", "Option two"],
  ]);
});

test("duplicate clientTurnId reuses the stored assistant response for the same thread turn", () => {
  const replay = findDuplicateTurnReplayInMessages({
    clientTurnId: "turn_duplicate_1",
    messages: [
      {
        id: "user-msg-1",
        role: "user",
        createdAt: "2026-03-13T15:00:00.000Z",
        data: {
          version: "user_context_v2",
          clientTurnId: "turn_duplicate_1",
        },
      },
      {
        id: "assistant-msg-1",
        role: "assistant",
        createdAt: "2026-03-13T15:00:01.000Z",
        data: {
          reply: "here's the stored answer",
          angles: [],
          quickReplies: [],
          plan: null,
          draft: null,
          drafts: [],
          draftArtifacts: [],
          draftBundle: null,
          supportAsset: null,
          groundingSources: [],
          autoSavedSourceMaterials: null,
          outputShape: "coach_question",
          surfaceMode: "answer_directly",
          memory: baseMemory,
          routingDiagnostics: {
            turnSource: "free_text",
            artifactKind: null,
            planSeedSource: "message",
            replyHandlingBypassedReason: null,
            resolvedWorkflow: "free_text",
          },
          requestTrace: {
            clientTurnId: "turn_duplicate_1",
          },
          threadTitle: "Thread title",
          billing: null,
          replyArtifacts: null,
          replyParse: null,
          contextPacket: {
            version: "assistant_context_v2",
            summary: "reply: here's the stored answer",
            planRef: null,
            draftRef: null,
            grounding: {
              mode: null,
              explanation: null,
              sourceTitles: [],
            },
            critique: {
              issuesFixed: [],
            },
            replyRef: null,
            replyParse: null,
            artifacts: {
              outputShape: "coach_question",
              surfaceMode: "answer_directly",
              quickReplyCount: 0,
              hasDraft: false,
            },
          },
        },
      },
    ],
  });

  assert.equal(replay?.assistantMessageId, "assistant-msg-1");
  assert.equal(replay?.mappedData.reply, "here's the stored answer");
  assert.equal(replay?.mappedData.requestTrace.clientTurnId, "turn_duplicate_1");
});

test("duplicate clientTurnId does not replay when the original user turn never reached an assistant write", () => {
  const replay = findDuplicateTurnReplayInMessages({
    clientTurnId: "turn_duplicate_2",
    messages: [
      {
        id: "user-msg-2",
        role: "user",
        createdAt: "2026-03-13T15:00:00.000Z",
        data: {
          version: "user_context_v2",
          clientTurnId: "turn_duplicate_2",
        },
      },
      {
        id: "user-msg-3",
        role: "user",
        createdAt: "2026-03-13T15:00:01.000Z",
        data: {
          version: "user_context_v2",
          clientTurnId: "turn_other",
        },
      },
    ],
  });

  assert.equal(replay, null);
});

test("persistAssistantTurnWithDeps keeps core writes single-shot while draft candidates fan out once each", async () => {
  const callCounts = {
    createChatMessage: 0,
    updateConversationMemory: 0,
    updateChatThread: 0,
  };
  const candidateTitles = [];

  const result = await persistAssistantTurnWithDeps(
    {
      threadId: "thread-1",
      assistantMessageData: {
        reply: "bundle ready",
        threadTitle: "Current thread",
      },
      threadUpdate: {
        updatedAt: new Date("2026-03-13T15:00:00.000Z"),
        title: "Updated title",
      },
      buildMemoryUpdate: (assistantMessageId) => ({
        activeDraftRef: {
          messageId: assistantMessageId,
          versionId: "version-1",
          revisionChainId: "revision-chain-1",
        },
      }),
      draftCandidateCreates: [
        {
          title: "Option one",
          artifact: { id: "artifact-1" },
          voiceTarget: null,
          noveltyNotes: [],
        },
        {
          title: "Option two",
          artifact: { id: "artifact-2" },
          voiceTarget: null,
          noveltyNotes: [],
        },
      ],
      draftCandidateContext: {
        userId: "user-1",
        xHandle: "stan",
        runId: "run-1",
        sourcePrompt: "draft it",
        sourcePlaybook: "chat_bundle",
        outputShape: "short_form_post",
      },
    },
    {
      async createChatMessage() {
        callCounts.createChatMessage += 1;
        return { id: "assistant-msg-1" };
      },
      async updateConversationMemory() {
        callCounts.updateConversationMemory += 1;
        return null;
      },
      async updateChatThread() {
        callCounts.updateChatThread += 1;
        return { title: "Updated title" };
      },
      async createDraftCandidate(args) {
        candidateTitles.push(args.title);
        await new Promise((resolve) =>
          setTimeout(resolve, args.title === "Option one" ? 15 : 1),
        );
        return null;
      },
    },
  );

  assert.deepEqual(callCounts, {
    createChatMessage: 1,
    updateConversationMemory: 1,
    updateChatThread: 1,
  });
  assert.deepEqual(candidateTitles.sort(), ["Option one", "Option two"]);
  assert.deepEqual(result.tracePatch.persistedStateChanges.draftCandidates, {
    attempted: 2,
    created: 2,
    skipped: 0,
  });
  assert.equal(
    result.tracePatch.workerExecutions.filter(
      (execution) => execution.worker === "create_draft_candidate",
    ).every((execution) => execution.groupId === "chat_route_persistence_draft_candidates"),
    true,
  );
});

test("persistAssistantTurnWithDeps does not double-write memory while candidate writes resolve out of order", async () => {
  let updateConversationMemoryCalls = 0;
  const calls = [];

  await persistAssistantTurnWithDeps(
    {
      threadId: "thread-2",
      assistantMessageData: {
        reply: "bundle ready",
        threadTitle: "Bundle thread",
      },
      threadUpdate: {
        updatedAt: new Date("2026-03-13T16:00:00.000Z"),
        title: "Bundle title",
      },
      buildMemoryUpdate: (assistantMessageId) => ({
        preferredSurfaceMode: "structured",
        activeDraftRef: {
          messageId: assistantMessageId,
          versionId: "bundle-version-1",
          revisionChainId: "bundle-chain-1",
        },
      }),
      draftCandidateCreates: [
        {
          title: "Slow option",
          artifact: { id: "artifact-slow" },
          voiceTarget: null,
          noveltyNotes: ["slow note"],
        },
        {
          title: "Fast option",
          artifact: { id: "artifact-fast" },
          voiceTarget: null,
          noveltyNotes: ["fast note"],
        },
      ],
      draftCandidateContext: {
        userId: "user-2",
        xHandle: "stan",
        runId: "run-2",
        sourcePrompt: "draft 4 posts",
        sourcePlaybook: "chat_bundle",
        outputShape: "short_form_post",
      },
    },
    {
      async createChatMessage() {
        calls.push("createChatMessage");
        return { id: "assistant-msg-2" };
      },
      async updateConversationMemory() {
        updateConversationMemoryCalls += 1;
        calls.push("updateConversationMemory");
        return null;
      },
      async updateChatThread() {
        calls.push("updateChatThread");
        return { title: "Bundle title" };
      },
      async createDraftCandidate(args) {
        calls.push(`start:${args.title}`);
        await new Promise((resolve) => setTimeout(resolve, args.title === "Slow option" ? 20 : 1));
        calls.push(`finish:${args.title}`);
        return null;
      },
    },
  );

  assert.equal(updateConversationMemoryCalls, 1);
  assert.deepEqual(calls.slice(0, 3), [
    "createChatMessage",
    "updateConversationMemory",
    "updateChatThread",
  ]);
  assert.deepEqual(
    calls.filter((entry) => entry === "updateConversationMemory"),
    ["updateConversationMemory"],
  );
});

test("persistAssistantTurnWithDeps skips writes when no thread is available", async () => {
  const calls = [];

  const result = await persistAssistantTurnWithDeps(
    {
      threadId: null,
      assistantMessageData: {
        reply: "no-op",
        threadTitle: "New Chat",
      },
      threadUpdate: {
        updatedAt: new Date("2026-03-13T15:00:00.000Z"),
      },
    },
    {
      async createChatMessage() {
        calls.push("createChatMessage");
        return { id: "unexpected" };
      },
      async updateConversationMemory() {
        calls.push("updateConversationMemory");
        return null;
      },
      async updateChatThread() {
        calls.push("updateChatThread");
        return { title: null };
      },
      async createDraftCandidate() {
        calls.push("createDraftCandidate");
        return null;
      },
    },
  );

  assert.deepEqual(result, {
    tracePatch: {
      workerExecutions: [
        {
          worker: "persist_assistant_message",
          capability: "shared",
          phase: "persistence",
          mode: "sequential",
          status: "skipped",
          groupId: null,
          details: {
            reason: "missing_thread",
          },
        },
        {
          worker: "update_chat_thread",
          capability: "shared",
          phase: "persistence",
          mode: "sequential",
          status: "skipped",
          groupId: null,
          details: {
            reason: "missing_thread",
          },
        },
      ],
      persistedStateChanges: {
        assistantMessageId: null,
        thread: null,
        memory: null,
        draftCandidates: {
          attempted: 0,
          created: 0,
          skipped: 0,
        },
      },
    },
  });
  assert.deepEqual(calls, []);
});

test("long_form_post remains a valid route draft kind", () => {
  assert.equal(resolveDraftArtifactKind("long_form_post"), "long_form_post");
  assert.equal(resolveDraftArtifactKind("planning_outline"), null);
});

test("revision metadata is preserved when a selected draft context is present", () => {
  const selectedDraftContext = parseSelectedDraftContext({
    messageId: "msg_1",
    versionId: "ver_1",
    content: "old version",
    source: "assistant_generated",
    revisionChainId: "revision-chain-msg_1",
  });

  const metadata = buildDraftVersionMetadata({
    selectedDraftContext,
  });

  assert.equal(metadata.source, "assistant_revision");
  assert.equal(metadata.basedOnVersionId, "ver_1");
  assert.equal(metadata.revisionChainId, "revision-chain-msg_1");
  assert.equal(metadata.previousVersionSnapshot?.content, "old version");
});

test("initial draft version payload preserves revision linkage and stored max limit", () => {
  const selectedDraftContext = parseSelectedDraftContext({
    messageId: "msg_5",
    versionId: "ver_5",
    content: "old draft",
    source: "assistant_generated",
    maxCharacterLimit: 4000,
    revisionChainId: "revision-chain-msg_5",
  });

  const payload = buildInitialDraftVersionPayload({
    draft: "new revised draft",
    outputShape: "long_form_post",
    supportAsset: null,
    selectedDraftContext,
  });

  assert.equal(payload.draftArtifacts.length, 1);
  assert.equal(payload.draftArtifacts[0]?.maxCharacterLimit, 4000);
  assert.equal(payload.draftVersions?.[0]?.basedOnVersionId, "ver_5");
  assert.equal(payload.previousVersionSnapshot?.versionId, "ver_5");
  assert.equal(payload.revisionChainId, "revision-chain-msg_5");
});

test("thread payloads build structured thread artifacts with posts", () => {
  const payload = buildInitialDraftVersionPayload({
    draft: "hook\n\n---\n\nproof\n\n---\n\ncta",
    outputShape: "thread_seed",
    supportAsset: "pair with a screenshot of the workflow",
    selectedDraftContext: null,
    groundingSources: [
      {
        type: "story",
        title: "Launch story",
        claims: ["I launched Xpo in public"],
        snippets: ["We kept the rollout small at first."],
      },
    ],
    groundingMode: "saved_sources",
    groundingExplanation: "Built from saved stories and proof you've already taught Xpo to reuse.",
    noveltyNotes: ["avoid mirroring last week's thread hook"],
    threadPostMaxCharacterLimit: 25_000,
    threadFramingStyle: "numbered",
  });

  assert.equal(payload.draftArtifacts.length, 1);
  assert.equal(payload.draftArtifacts[0]?.kind, "thread_seed");
  assert.equal(payload.draftArtifacts[0]?.posts.length, 3);
  assert.equal(payload.draftArtifacts[0]?.posts[1]?.content, "proof");
  assert.equal(payload.draftArtifacts[0]?.posts[0]?.maxCharacterLimit, 25_000);
  assert.equal(payload.draftArtifacts[0]?.maxCharacterLimit, 150_000);
  assert.equal(payload.draftArtifacts[0]?.threadFramingStyle, "numbered");
  assert.equal(payload.draftVersions?.[0]?.artifact?.posts.length, 3);
  assert.equal(payload.draftVersions?.[0]?.artifact?.supportAsset, "pair with a screenshot of the workflow");
  assert.equal(payload.draftArtifacts[0]?.groundingSources[0]?.title, "Launch story");
  assert.equal(payload.draftArtifacts[0]?.groundingMode, "saved_sources");
  assert.equal(
    payload.draftArtifacts[0]?.groundingExplanation,
    "Built from saved stories and proof you've already taught Xpo to reuse.",
  );
  assert.equal(payload.draftArtifacts[0]?.noveltyNotes[0], "avoid mirroring last week's thread hook");
});

test("bundle payload builds sibling draft versions and keeps the selected option active", () => {
  const payload = buildDraftBundleVersionPayload({
    draftBundle: {
      kind: "sibling_options",
      selectedOptionId: "bundle-proof",
      options: [
        {
          id: "bundle-lesson",
          label: "Lesson / Reflection",
          framing: "lesson_reflection",
          draft: "First option",
          supportAsset: null,
          issuesFixed: [],
          voiceTarget: null,
          noveltyNotes: ["keep it distinct"],
          threadFramingStyle: null,
          groundingSources: [],
          groundingMode: "saved_sources",
          groundingExplanation: "Saved context.",
        },
        {
          id: "bundle-proof",
          label: "Proof / Result",
          framing: "proof_result",
          draft: "Second option",
          supportAsset: null,
          issuesFixed: [],
          voiceTarget: null,
          noveltyNotes: ["lead with proof"],
          threadFramingStyle: null,
          groundingSources: [],
          groundingMode: "saved_sources",
          groundingExplanation: "Saved context.",
        },
      ],
    },
    outputShape: "short_form_post",
  });

  assert.equal(payload.draftArtifacts.length, 2);
  assert.equal(payload.draftVersions?.length, 2);
  assert.equal(payload.draftBundle?.options.length, 2);
  assert.equal(payload.draftBundle?.selectedOptionId, "bundle-proof");
  assert.equal(
    payload.draftBundle?.options.find((option) => option.id === "bundle-proof")?.versionId,
    payload.activeDraftVersionId,
  );
});

test("conversation context builder keeps recent history and prefers selected draft context", () => {
  const selectedDraftContext = parseSelectedDraftContext({
    messageId: "msg_9",
    versionId: "ver_9",
    content: "selected draft snapshot",
  });

  const context = buildConversationContextFromHistory({
    selectedDraftContext,
    history: [
      { role: "user", content: "first message" },
      { role: "assistant", content: "reply" },
      { role: "assistant", content: "draft output", draft: "history draft should lose" },
    ],
  });

  assert.equal(context.activeDraft, "selected draft snapshot");
  assert.equal(context.recentHistory.includes("user: first message"), true);
  assert.equal(context.recentHistory.includes("assistant: reply"), true);
});

test("conversation context builder keeps assistant metadata out of transcript history", () => {
  const context = buildConversationContextFromHistory({
    selectedDraftContext: null,
    history: [
      { role: "assistant", content: "here are some ideas", angles: [
        { title: "how does the tone shift when you move a linkedin post to x?" },
        { title: "what gets lost when you convert a linkedin post to x?" },
      ] },
    ],
  });

  assert.equal(context.recentHistory, "assistant: here are some ideas");
  assert.equal(context.recentHistory.includes("assistant_angles:"), false);
});

test("conversation context builder keeps transcript natural while reusing stored draft context", () => {
  const context = buildConversationContextFromHistory({
    selectedDraftContext: null,
    history: [
      {
        id: "assistant_1",
        role: "assistant",
        content: "this is the cleanest direction.",
        data: {
          plan: {
            objective: "position xpo as a growth agent for x",
            angle: "the main win is continuity, not generic drafting",
            targetLane: "original",
          },
          draft: "xpo should feel like one smart operator, not a pile of routing rules.",
          groundingExplanation: "Built from saved stories and proof you've already taught Xpo to reuse.",
          groundingSources: [
            {
              type: "story",
              title: "routing cleanup",
              claims: [],
              snippets: [],
            },
          ],
          issuesFixed: ["Removed vague language."],
        },
      },
    ],
  });

  assert.equal(context.recentHistory, "assistant: this is the cleanest direction.");
  assert.equal(context.recentHistory.includes("assistant_"), false);
  assert.equal(context.activeDraft, "xpo should feel like one smart operator, not a pile of routing rules.");
});

test("conversation context builder keeps reply artifact metadata out of transcript history", () => {
  const context = buildConversationContextFromHistory({
    selectedDraftContext: null,
    history: [
      {
        id: "assistant_reply_1",
        role: "assistant",
        content: "pulled 3 grounded reply directions from that post.",
        data: {
          contextPacket: {
            version: "assistant_context_v2",
            summary: "reply_source: most people optimize for approval first",
            replyRef: {
              kind: "reply_options",
              sourceExcerpt: "most people optimize for approval first",
              sourceUrl: "https://x.com/creator/status/1",
              authorHandle: "creator",
              selectedOptionId: null,
              optionLabels: ["nuance", "example", "translate"],
            },
            replyParse: {
              detected: true,
              confidence: "medium",
              needsConfirmation: false,
              parseReason: "reply_ask_with_multiline_post_block",
            },
          },
        },
      },
    ],
  });

  assert.equal(context.recentHistory, "assistant: pulled 3 grounded reply directions from that post.");
  assert.equal(context.recentHistory.includes("assistant_reply:"), false);
  assert.equal(context.activeDraft, undefined);
});

test("conversation context builder prefers standardized context packet refs over legacy top-level fields", () => {
  const context = buildConversationContextFromHistory({
    selectedDraftContext: null,
    history: [
      {
        id: "assistant_2",
        role: "assistant",
        content: "this is the active thread to keep pushing.",
        data: {
          contextPacket: {
            version: "assistant_context_v2",
            planRef: {
              objective: "position xpo as a conversational growth agent",
              angle: "continuity beats brittle routing",
              targetLane: "original",
              formatPreference: "thread",
            },
            draftRef: {
              excerpt: "context should survive the turn, not reset every message.",
              activeDraftVersionId: "ver_2",
              revisionChainId: "revision-chain-msg_2",
            },
            grounding: {
              mode: "saved_sources",
              explanation: "Built from stored product and voice context.",
              sourceTitles: ["Continuity teardown", "Voice profile"],
            },
            critique: {
              issuesFixed: ["Removed generic framing."],
            },
            artifacts: {
              outputShape: "thread_seed",
              surfaceMode: "generate_full_output",
              quickReplyCount: 2,
              hasDraft: true,
            },
          },
          draft: "legacy draft should not win",
        },
      },
    ],
  });

  assert.equal(context.recentHistory, "assistant: this is the active thread to keep pushing.");
  assert.equal(context.recentHistory.includes("assistant_"), false);
  assert.equal(
    context.activeDraft,
    "context should survive the turn, not reset every message.",
  );
});

test("selected draft resolution prefers the stored active draft ref over stale client selection", () => {
  const resolved = resolveSelectedDraftContextFromHistory({
    selectedDraftContext: parseSelectedDraftContext({
      messageId: "assistant_old",
      versionId: "ver_old",
      content: "older selected draft",
      revisionChainId: "revision-chain-old",
    }),
    activeDraftRef: {
      messageId: "assistant_new",
      versionId: "ver_new",
      revisionChainId: "revision-chain-new",
    },
    history: [
      {
        id: "assistant_old",
        role: "assistant",
        data: {
          draftVersions: [
            {
              id: "ver_old",
              content: "older selected draft",
              source: "assistant_generated",
              createdAt: "2026-03-01T00:00:00.000Z",
              basedOnVersionId: null,
              weightedCharacterCount: 24,
              maxCharacterLimit: 280,
              supportAsset: null,
            },
          ],
          activeDraftVersionId: "ver_old",
          revisionChainId: "revision-chain-old",
        },
      },
      {
        id: "assistant_new",
        role: "assistant",
        data: {
          draftVersions: [
            {
              id: "ver_new",
              content: "newest canonical draft",
              source: "assistant_revision",
              createdAt: "2026-03-02T00:00:00.000Z",
              basedOnVersionId: "ver_old",
              weightedCharacterCount: 23,
              maxCharacterLimit: 280,
              supportAsset: null,
            },
          ],
          activeDraftVersionId: "ver_new",
          revisionChainId: "revision-chain-new",
        },
      },
    ],
  });

  assert.equal(resolved?.messageId, "assistant_new");
  assert.equal(resolved?.versionId, "ver_new");
  assert.equal(resolved?.content, "newest canonical draft");
  assert.equal(resolved?.revisionChainId, "revision-chain-new");
});

test("continuity stack routes lets do it into draft from stored pending-plan context", () => {
  const action = resolveArtifactContinuationAction({
    userMessage: "lets do it",
    memory: {
      conversationState: "plan_pending_approval",
      topicSummary: "xpo continuity",
      hasPendingPlan: true,
      hasActiveDraft: false,
      unresolvedQuestion: null,
      concreteAnswerCount: 2,
      pendingPlanSummary: "xpo continuity | continuity beats brittle routing",
      latestRefinementInstruction: null,
      lastIdeationAngles: [],
    },
  });

  assert.equal(action, "draft");
});

test("continuity stack routes option picks into plan from stored ideation angles", () => {
  const context = buildConversationContextFromHistory({
    selectedDraftContext: null,
    history: [
      {
        role: "assistant",
        content: "here are a few directions",
        data: {
          angles: [
            { title: "why context loss kills continuity" },
            { title: "what makes an x growth agent feel natural" },
          ],
        },
      },
    ],
  });

  assert.equal(context.recentHistory, "assistant: here are a few directions");
  assert.equal(context.recentHistory.includes("assistant_angles:"), false);
  const action = resolveArtifactContinuationAction({
    userMessage: "go with option 2",
    memory: {
      conversationState: "ready_to_ideate",
      topicSummary: "xpo continuity",
      hasPendingPlan: false,
      hasActiveDraft: false,
      unresolvedQuestion: null,
      concreteAnswerCount: 2,
      pendingPlanSummary: null,
      latestRefinementInstruction: null,
      lastIdeationAngles: [
        "why context loss kills continuity",
        "what makes an x growth agent feel natural",
      ],
    },
  });

  assert.equal(action, "plan");
});

test("continuity stack routes short draft edits into revise from stored active draft refs", () => {
  const selectedDraftContext = resolveSelectedDraftContextFromHistory({
    selectedDraftContext: null,
    activeDraftRef: {
      messageId: "assistant_3",
      versionId: "ver_3",
      revisionChainId: "revision-chain-3",
    },
    history: [
      {
        id: "assistant_3",
        role: "assistant",
        data: {
          draftVersions: [
            {
              id: "ver_3",
              content: "context should survive the turn, not reset every message.",
              source: "assistant_generated",
              createdAt: "2026-03-03T00:00:00.000Z",
              basedOnVersionId: null,
              weightedCharacterCount: 52,
              maxCharacterLimit: 280,
              supportAsset: null,
            },
          ],
          activeDraftVersionId: "ver_3",
          revisionChainId: "revision-chain-3",
        },
      },
    ],
  });

  const context = buildConversationContextFromHistory({
    selectedDraftContext,
    history: [],
  });

  assert.equal(
    context.activeDraft,
    "context should survive the turn, not reset every message.",
  );
  const action = resolveArtifactContinuationAction({
    userMessage: "make that punchier",
    memory: {
      conversationState: "draft_ready",
      topicSummary: "xpo continuity",
      hasPendingPlan: false,
      hasActiveDraft: true,
      unresolvedQuestion: null,
      concreteAnswerCount: 2,
      pendingPlanSummary: null,
      latestRefinementInstruction: "drafted a version",
      lastIdeationAngles: [],
    },
  });

  assert.equal(action, "revise");
});

test("continuity stack routes pending-plan tone refinements back into plan", () => {
  const action = resolveArtifactContinuationAction({
    userMessage: "same angle but softer",
    memory: {
      conversationState: "plan_pending_approval",
      topicSummary: "xpo continuity",
      hasPendingPlan: true,
      hasActiveDraft: false,
      unresolvedQuestion: null,
      concreteAnswerCount: 2,
      pendingPlanSummary: "xpo continuity | continuity beats brittle routing",
      latestRefinementInstruction: null,
      lastIdeationAngles: [],
    },
  });

  assert.equal(action, "plan");
});

test("route-level context feeds deterministic source transparency attribution", () => {
  const selectedDraftContext = parseSelectedDraftContext({
    messageId: "msg_17",
    versionId: "ver_17",
    content: "5 years, 3 product launches, 10 teammates-what's the biggest lesson?",
  });

  const routeContext = buildConversationContextFromHistory({
    selectedDraftContext,
    history: [
      { role: "user", content: "give me post ideas" },
      { role: "assistant", content: "which angle sounds best to flesh out?" },
      { role: "user", content: "write one about leading 10 teammates through product launches" },
    ],
  });

  const reply = inferSourceTransparencyReply({
    userMessage: "where did that come from?",
    activeDraft: routeContext.activeDraft,
    recentHistory: routeContext.recentHistory,
    contextAnchors: [],
  });

  assert.equal(typeof reply, "string");
  assert.equal(/prior message/i.test(reply || ""), true);
});

test("conversation context builder can exclude the current user turn when thread-backed history is used", () => {
  const context = buildConversationContextFromHistory({
    selectedDraftContext: null,
    excludeMessageId: "user_2",
    history: [
      { id: "user_1", role: "user", content: "help me figure out what to post" },
      {
        id: "assistant_2",
        role: "assistant",
        content: "let's keep it on one lane",
        data: {
          contextPacket: {
            summary: "plan: one core lane\nreply: keep it grounded in product-specific proof",
          },
        },
      },
      { id: "user_2", role: "user", content: "write it now" },
    ],
  });

  assert.equal(context.recentHistory.includes("user: write it now"), false);
  assert.equal(context.recentHistory.includes("assistant: let's keep it on one lane"), true);
  assert.equal(context.recentHistory.includes("assistant_context:"), false);
});

test("reply route ownership stays in runtime modules without shim files or shim imports", () => {
  const routeSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  const routeReplyFinalizeSource = readFileSync(
    new URL("./route.replyFinalize.ts", import.meta.url),
    "utf8",
  );
  const routeLogicSource = readFileSync(new URL("./route.logic.ts", import.meta.url), "utf8");
  const routeResponseSource = readFileSync(
    new URL("./_lib/response/routeResponse.ts", import.meta.url),
    "utf8",
  );

  assert.equal(existsSync(new URL("./route.reply.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("./reply.logic.ts", import.meta.url)), false);

  assert.match(
    routeSource,
    /from "@\/lib\/agent-v2\/orchestrator\/replyTurnPlanner";/,
  );
  assert.equal(/from "\.\/route\.reply(?:\.ts)?";/.test(routeSource), false);
  assert.equal(/from "\.\/reply\.logic(?:\.ts)?";/.test(routeSource), false);

  assert.match(
    routeReplyFinalizeSource,
    /from "\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/lib\/agent-v2\/orchestrator\/replyTurnPlanner\.ts";/,
  );
  assert.equal(
    /from "\.\/route\.reply(?:\.ts)?";/.test(routeReplyFinalizeSource),
    false,
  );

  assert.match(
    routeLogicSource,
    /from "\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/lib\/agent-v2\/orchestrator\/replyTurnLogic\.ts";/,
  );
  assert.equal(/from "\.\/reply\.logic(?:\.ts)?";/.test(routeLogicSource), false);

  assert.match(
    routeResponseSource,
    /from "\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/lib\/agent-v2\/orchestrator\/replyTurnLogic\.ts";/,
  );
  assert.equal(/from "\.\/reply\.logic(?:\.ts)?";/.test(routeResponseSource), false);
});
