import test from "node:test";
import assert from "node:assert/strict";

import {
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
} from "./route.logic.ts";
import { resolveArtifactContinuationAction } from "../../../../../lib/agent-v2/agents/controller.ts";
import { inferSourceTransparencyReply } from "../../../../../lib/agent-v2/orchestrator/correctionRepair.ts";

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

test("conversation context builder appends assistant angle titles for grounding", () => {
  const context = buildConversationContextFromHistory({
    selectedDraftContext: null,
    history: [
      { role: "assistant", content: "here are some ideas", angles: [
        { title: "how does the tone shift when you move a linkedin post to x?" },
        { title: "what gets lost when you convert a linkedin post to x?" },
      ] },
    ],
  });

  assert.equal(context.recentHistory.includes("assistant_angles:"), true);
  assert.equal(
    context.recentHistory.includes("1. how does the tone shift when you move a linkedin post to x?"),
    true,
  );
});

test("conversation context builder reuses stored assistant plan, draft, and grounding context", () => {
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

  assert.equal(context.recentHistory.includes("assistant_plan:"), true);
  assert.equal(context.recentHistory.includes("assistant_draft:"), true);
  assert.equal(context.recentHistory.includes("assistant_grounding:"), true);
  assert.equal(context.activeDraft, "xpo should feel like one smart operator, not a pile of routing rules.");
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
        },
      },
    ],
  });

  assert.equal(context.recentHistory.includes("assistant_plan:"), true);
  assert.equal(context.recentHistory.includes("assistant_draft:"), true);
  assert.equal(context.recentHistory.includes("assistant_grounding:"), true);
  assert.equal(context.recentHistory.includes("assistant_critique:"), true);
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

  assert.equal(context.recentHistory.includes("assistant_angles:"), true);
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
  assert.equal(context.recentHistory.includes("assistant_context:"), true);
});
