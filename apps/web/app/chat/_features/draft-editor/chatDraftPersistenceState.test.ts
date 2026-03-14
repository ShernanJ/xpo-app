import test from "node:test";
import assert from "node:assert/strict";

import { computeXWeightedCharacterCount } from "../../../../lib/onboarding/draftArtifacts.ts";

import {
  getThreadPostCharacterLimit,
  prepareDraftPromotionRequest,
  resolveDraftVersionRevertUpdate,
} from "./chatDraftPersistenceState.ts";

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

test("prepareDraftPromotionRequest shapes the current thread editor state into the existing API payload", () => {
  const result = prepareDraftPromotionRequest({
    activeDraftEditorRevisionChainId: "chain-editor",
    selectedDraftMessage: {
      id: "message-1",
      role: "assistant",
      outputShape: "thread_seed",
      revisionChainId: "chain-message",
      draftArtifacts: [
        {
          ...baseArtifact,
          id: "artifact-thread",
          kind: "thread_seed",
          content: "old one\n\n---\n\nold two",
          supportAsset: "asset-1",
          replyPlan: ["Lead with the strongest proof"],
          groundingSources: [
            {
              type: "story",
              title: "Launch story",
              claims: ["Shipped in public"],
              snippets: ["We shipped and learned fast"],
            },
          ],
          groundingMode: "saved_sources" as const,
          groundingExplanation: "Use the saved launch examples.",
          noveltyNotes: ["Mention the timing tradeoff."],
          threadFramingStyle: "soft_signal" as const,
        },
      ],
    },
    selectedDraftVersion: {
      id: "v1",
      content: "old one\n\n---\n\nold two",
      source: "assistant_generated",
      createdAt: "2026-03-13T12:00:00.000Z",
      basedOnVersionId: null,
      weightedCharacterCount: 20,
      maxCharacterLimit: 560,
      supportAsset: null,
    },
    selectedDraftArtifact: {
      ...baseArtifact,
      id: "artifact-thread",
      kind: "thread_seed",
      content: "old one\n\n---\n\nold two",
      supportAsset: "asset-1",
      replyPlan: ["Lead with the strongest proof"],
      groundingSources: [
        {
          type: "story",
          title: "Launch story",
          claims: ["Shipped in public"],
          snippets: ["We shipped and learned fast"],
        },
      ],
      groundingMode: "saved_sources",
      groundingExplanation: "Use the saved launch examples.",
      noveltyNotes: ["Mention the timing tradeoff."],
      threadFramingStyle: "soft_signal",
    },
    isSelectedDraftThread: true,
    editorDraftPosts: ["  first post  ", "second post  "],
    editorDraftText: "",
  });

  assert.deepEqual(result, {
    status: "ready",
    nextContent: "first post\n\n---\n\nsecond post",
    requestBody: {
      content: "first post\n\n---\n\nsecond post",
      outputShape: "thread_seed",
      supportAsset: "asset-1",
      maxCharacterLimit: 560,
      posts: ["first post", "second post"],
      replyPlan: ["Lead with the strongest proof"],
      groundingSources: [
        {
          type: "story",
          title: "Launch story",
          claims: ["Shipped in public"],
          snippets: ["We shipped and learned fast"],
        },
      ],
      groundingMode: "saved_sources",
      groundingExplanation: "Use the saved launch examples.",
      noveltyNotes: ["Mention the timing tradeoff."],
      threadFramingStyle: "soft_signal",
      revisionChainId: "chain-message",
      basedOn: {
        messageId: "message-1",
        versionId: "v1",
        content: "old one\n\n---\n\nold two",
        source: "assistant_generated",
        createdAt: "2026-03-13T12:00:00.000Z",
        maxCharacterLimit: 560,
        revisionChainId: "chain-message",
      },
    },
  });
});

test("prepareDraftPromotionRequest skips blank and unchanged drafts", () => {
  assert.deepEqual(
    prepareDraftPromotionRequest({
      activeDraftEditorRevisionChainId: null,
      selectedDraftMessage: {
        id: "message-1",
        role: "assistant",
      },
      selectedDraftVersion: {
        id: "v1",
        content: "same draft",
        source: "assistant_generated",
        createdAt: "2026-03-13T12:00:00.000Z",
        basedOnVersionId: null,
        weightedCharacterCount: 10,
        maxCharacterLimit: 280,
        supportAsset: null,
      },
      selectedDraftArtifact: null,
      isSelectedDraftThread: false,
      editorDraftPosts: [],
      editorDraftText: " same draft ",
    }),
    {
      status: "skip",
    },
  );
});

test("resolveDraftVersionRevertUpdate syncs draft versions, collections, and bundle selection", () => {
  const selectedDraftVersion = {
    id: "v1",
    content: "First post\n\n---\n\nSecond post",
    source: "assistant_revision" as const,
    createdAt: "2026-03-13T12:30:00.000Z",
    basedOnVersionId: null,
    weightedCharacterCount: 30,
    maxCharacterLimit: 560,
    supportAsset: "asset-1",
    artifact: {
      ...baseArtifact,
      id: "artifact-thread",
      kind: "thread_seed" as const,
      content: "First post\n\n---\n\nSecond post",
      supportAsset: "asset-1",
      threadFramingStyle: "numbered" as const,
      posts: [],
    },
  };
  const result = resolveDraftVersionRevertUpdate({
    activeDraftEditorRevisionChainId: "chain-editor",
    selectedDraftMessage: {
      id: "message-1",
      role: "assistant",
      outputShape: "thread_seed",
      drafts: ["stale one", "stale two"],
      draftArtifacts: [
        {
          ...baseArtifact,
          id: "artifact-thread",
          kind: "thread_seed",
          content: "stale one\n\n---\n\nstale two",
          supportAsset: "asset-1",
          threadFramingStyle: "numbered",
        },
      ],
      draftVersions: [
        selectedDraftVersion,
        {
          id: "v2",
          content: "Other option",
          source: "assistant_generated",
          createdAt: "2026-03-13T13:00:00.000Z",
          basedOnVersionId: "v1",
          weightedCharacterCount: 12,
          maxCharacterLimit: 280,
          supportAsset: null,
        },
      ],
      draftBundle: {
        kind: "sibling_options" as const,
        selectedOptionId: "option-2",
        options: [
          {
            id: "option-1",
            label: "Draft one",
            versionId: "v1",
            content: "Old content",
            artifact: { ...baseArtifact, id: "option-artifact-1", content: "Old content" },
          },
          {
            id: "option-2",
            label: "Draft two",
            versionId: "v2",
            content: "Other option",
            artifact: { ...baseArtifact, id: "option-artifact-2", content: "Other option" },
          },
        ],
      },
    },
    selectedDraftVersion,
    selectedDraftBundleVersions: null,
    isSelectedDraftThread: true,
    fallbackCharacterLimit: 280,
  });

  assert.equal(result?.revisionChainId, "chain-editor");
  assert.equal(result?.nextDraftCollections.draft, "First post\n\n---\n\nSecond post");
  assert.deepEqual(result?.nextDraftCollections.drafts, [
    "First post\n\n---\n\nSecond post",
    "Other option",
  ]);
  assert.equal(result?.nextDraftVersions[0].weightedCharacterCount, computeXWeightedCharacterCount("First post\n\n---\n\nSecond post"));
  assert.equal(result?.nextDraftVersions[0].artifact?.maxCharacterLimit, 560);
  assert.deepEqual(
    result?.nextDraftVersions[0].artifact?.posts.map((post) => post.content),
    ["First post", "Second post"],
  );
  assert.equal(result?.nextDraftBundle?.selectedOptionId, "option-1");
  assert.equal(result?.nextDraftBundle?.options[0]?.content, "First post\n\n---\n\nSecond post");
  assert.equal(
    result?.nextDraftBundle?.options[0]?.artifact.threadFramingStyle,
    "numbered",
  );
});

test("getThreadPostCharacterLimit falls back when the artifact has no post-level limit", () => {
  assert.equal(getThreadPostCharacterLimit(null, 280), 280);
  assert.equal(
    getThreadPostCharacterLimit(
      {
        ...baseArtifact,
        kind: "thread_seed",
        posts: [
          {
            id: "post-1",
            content: "Hello there",
            weightedCharacterCount: 11,
            maxCharacterLimit: 420,
            isWithinXLimit: true,
          },
        ],
      },
      280,
    ),
    420,
  );
});
