import test from "node:test";
import assert from "node:assert/strict";

import {
  buildInitialDraftVersionPayload,
  buildConversationContextFromHistory,
  buildDraftVersionMetadata,
  looksLikeDraftHandoff,
  normalizeDraftPayload,
  parseSelectedDraftContext,
  resolveDraftArtifactKind,
  resolveEffectiveExplicitIntent,
} from "./route.logic.ts";
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
  assert.equal(payload.draftArtifacts[0]?.noveltyNotes[0], "avoid mirroring last week's thread hook");
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
