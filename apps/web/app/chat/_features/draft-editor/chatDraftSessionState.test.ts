import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDraftRevisionTimeline,
  normalizeDraftVersionBundle,
  resolveDraftTimelineNavigation,
  resolveDraftTimelineState,
  resolveOpenDraftEditorState,
} from "./chatDraftSessionState.ts";

const baseArtifact = {
  id: "artifact-1",
  title: "Draft",
  kind: "short_form_post" as const,
  content: "draft one",
  posts: [],
  characterCount: 9,
  weightedCharacterCount: 9,
  maxCharacterLimit: 280,
  isWithinXLimit: true,
  supportAsset: null,
  groundingSources: [],
  groundingMode: null,
  groundingExplanation: null,
  betterClosers: [],
  replyPlan: [],
  voiceTarget: null,
  noveltyNotes: [],
  threadFramingStyle: null,
};

test("normalizeDraftVersionBundle falls back to draft content and keeps the active version last", () => {
  const bundle = normalizeDraftVersionBundle(
    {
      id: "message-1",
      role: "assistant",
      createdAt: "2026-03-13T12:00:00.000Z",
      draft: "fallback draft",
      draftArtifacts: [{ ...baseArtifact, content: "fallback draft" }],
    },
    280,
  );

  assert.equal(bundle?.activeVersionId, "message-1-v1");
  assert.equal(bundle?.activeVersion.content, "fallback draft");

  const multiVersionBundle = normalizeDraftVersionBundle(
    {
      id: "message-2",
      role: "assistant",
      draftVersions: [
        {
          id: "v1",
          content: "first draft",
          source: "assistant_generated",
          createdAt: "2026-03-13T12:00:00.000Z",
          basedOnVersionId: null,
          weightedCharacterCount: 11,
          maxCharacterLimit: 280,
          supportAsset: null,
        },
        {
          id: "v2",
          content: "second draft",
          source: "assistant_revision",
          createdAt: "2026-03-13T13:00:00.000Z",
          basedOnVersionId: "v1",
          weightedCharacterCount: 12,
          maxCharacterLimit: 280,
          supportAsset: null,
        },
      ],
      activeDraftVersionId: "v1",
    },
    280,
  );

  assert.deepEqual(
    multiVersionBundle?.versions.map((version) => version.id),
    ["v2", "v1"],
  );
  assert.equal(multiVersionBundle?.previousSnapshot?.versionId, "v2");
});

test("buildDraftRevisionTimeline includes prior snapshots when they are missing from the chain", () => {
  const timeline = buildDraftRevisionTimeline({
    messages: [
      {
        id: "message-1",
        role: "assistant",
        createdAt: "2026-03-13T12:00:00.000Z",
        revisionChainId: "chain-1",
        draftVersions: [
          {
            id: "v2",
            content: "current draft",
            source: "assistant_revision",
            createdAt: "2026-03-13T13:00:00.000Z",
            basedOnVersionId: null,
            weightedCharacterCount: 13,
            maxCharacterLimit: 280,
            supportAsset: null,
          },
        ],
        previousVersionSnapshot: {
          messageId: "message-0",
          versionId: "v1",
          content: "previous draft",
          source: "assistant_generated",
          createdAt: "2026-03-13T11:00:00.000Z",
          revisionChainId: "chain-1",
        },
      },
    ],
    activeDraftSelection: {
      messageId: "message-1",
      versionId: "v2",
      revisionChainId: "chain-1",
    },
    fallbackCharacterLimit: 280,
  });

  assert.deepEqual(
    timeline.map((entry) => `${entry.messageId}:${entry.versionId}`),
    ["message-0:v1", "message-1:v2"],
  );
});

test("resolveDraftTimelineState derives navigation and historical-view flags", () => {
  const timeline = [
    {
      messageId: "message-1",
      versionId: "v1",
      content: "old",
      createdAt: "2026-03-13T11:00:00.000Z",
      source: "assistant_generated" as const,
      revisionChainId: "chain-1",
      maxCharacterLimit: 280,
      isCurrentMessageVersion: false,
    },
    {
      messageId: "message-2",
      versionId: "v2",
      content: "current",
      createdAt: "2026-03-13T12:00:00.000Z",
      source: "assistant_revision" as const,
      revisionChainId: "chain-1",
      maxCharacterLimit: 280,
      isCurrentMessageVersion: true,
    },
  ];

  const state = resolveDraftTimelineState({
    timeline,
    activeDraftSelection: {
      messageId: "message-1",
      versionId: "v1",
    },
    serializedContent: "old",
    selectedDraftVersionContent: "old",
  });

  assert.deepEqual(state, {
    selectedDraftTimelineIndex: 0,
    selectedDraftTimelinePosition: 1,
    latestDraftTimelineEntry: timeline[1],
    canNavigateDraftBack: false,
    canNavigateDraftForward: true,
    isViewingHistoricalDraftVersion: true,
    hasDraftEditorChanges: false,
    shouldShowRevertDraftCta: true,
  });
});

test("resolveDraftTimelineNavigation plans scrolling only when the message changes", () => {
  const timeline = [
    {
      messageId: "message-1",
      versionId: "v1",
      content: "first",
      createdAt: "2026-03-13T11:00:00.000Z",
      source: "assistant_generated" as const,
      revisionChainId: "chain-1",
      maxCharacterLimit: 280,
      isCurrentMessageVersion: false,
    },
    {
      messageId: "message-2",
      versionId: "v2",
      content: "second",
      createdAt: "2026-03-13T12:00:00.000Z",
      source: "assistant_revision" as const,
      revisionChainId: "chain-1",
      maxCharacterLimit: 280,
      isCurrentMessageVersion: true,
    },
  ];

  assert.deepEqual(
    resolveDraftTimelineNavigation({
      direction: "forward",
      timeline,
      selectedDraftTimelineIndex: 0,
      activeDraftSelection: {
        messageId: "message-1",
        versionId: "v1",
      },
    }),
    {
      targetSelection: {
        messageId: "message-2",
        versionId: "v2",
        revisionChainId: "chain-1",
      },
      scrollToMessageId: "message-2",
    },
  );
});

test("resolveOpenDraftEditorState picks the requested version and thread preview state", () => {
  const openState = resolveOpenDraftEditorState({
    message: {
      id: "message-1",
      role: "assistant",
      revisionChainId: "chain-1",
      outputShape: "thread_seed",
      draftArtifacts: [
        {
          ...baseArtifact,
          kind: "thread_seed",
          content: "one\n\n---\n\ntwo",
          posts: [],
        },
      ],
      draftVersions: [
        {
          id: "v1",
          content: "one\n\n---\n\ntwo",
          source: "assistant_generated",
          createdAt: "2026-03-13T12:00:00.000Z",
          basedOnVersionId: null,
          weightedCharacterCount: 10,
          maxCharacterLimit: 560,
          supportAsset: null,
        },
      ],
    },
    fallbackCharacterLimit: 560,
    versionId: "v1",
    threadPostIndex: 3,
  });

  assert.deepEqual(openState, {
    selection: {
      messageId: "message-1",
      versionId: "v1",
      revisionChainId: "chain-1",
    },
    shouldExpandInlineThreadPreview: true,
    selectedThreadPostIndex: 3,
  });
});
