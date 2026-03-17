import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveDraftCardRevisionAction,
  resolveSelectedThreadFramingChangeAction,
} from "./chatDraftActionState.ts";

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

test("resolveDraftCardRevisionAction targets the active draft version and carries current thread framing", () => {
  const action = resolveDraftCardRevisionAction({
    messageId: "message-1",
    prompt: "make it shorter",
    composerCharacterLimit: 560,
    messages: [
      {
        id: "message-1",
        role: "assistant",
        outputShape: "thread_seed",
        revisionChainId: "chain-1",
        draftVersions: [
          {
            id: "v1",
            content: "First\n\n---\n\nSecond",
            source: "assistant_generated",
            createdAt: "2026-03-14T12:00:00.000Z",
            basedOnVersionId: null,
            weightedCharacterCount: 20,
            maxCharacterLimit: 560,
            supportAsset: null,
            artifact: {
              ...baseArtifact,
              id: "artifact-thread",
              kind: "thread_seed",
              content: "First\n\n---\n\nSecond",
              maxCharacterLimit: 560,
              threadFramingStyle: "soft_signal",
              posts: [],
            },
          },
        ],
        activeDraftVersionId: "v1",
      },
    ],
  });

  assert.deepEqual(action, {
    activeDraftEditor: {
      messageId: "message-1",
      versionId: "v1",
      revisionChainId: "chain-1",
    },
    request: {
      prompt: "make it shorter",
      appendUserMessage: true,
      turnSource: "draft_action",
      artifactContext: {
        kind: "draft_selection",
        action: "edit",
        selectedDraftContext: {
          messageId: "message-1",
          versionId: "v1",
          content: "First\n\n---\n\nSecond",
          source: "assistant_generated",
          createdAt: "2026-03-14T12:00:00.000Z",
          maxCharacterLimit: 560,
          revisionChainId: "chain-1",
        },
      },
      intent: "edit",
      selectedDraftContextOverride: {
        messageId: "message-1",
        versionId: "v1",
        content: "First\n\n---\n\nSecond",
        source: "assistant_generated",
        createdAt: "2026-03-14T12:00:00.000Z",
        maxCharacterLimit: 560,
        revisionChainId: "chain-1",
      },
      threadFramingStyleOverride: "soft_signal",
    },
  });
});

test("resolveDraftCardRevisionAction prefers the latest editable active version in a revision chain", () => {
  const action = resolveDraftCardRevisionAction({
    messageId: "message-latest",
    prompt: "make it punchier",
    composerCharacterLimit: 280,
    messages: [
      {
        id: "message-latest",
        role: "assistant",
        revisionChainId: "chain-latest",
        draftVersions: [
          {
            id: "v1",
            content: "older version",
            source: "assistant_generated",
            createdAt: "2026-03-14T11:00:00.000Z",
            basedOnVersionId: null,
            weightedCharacterCount: 13,
            maxCharacterLimit: 280,
            supportAsset: null,
          },
          {
            id: "v2",
            content: "latest editable version",
            source: "assistant_revision",
            createdAt: "2026-03-14T12:00:00.000Z",
            basedOnVersionId: "v1",
            weightedCharacterCount: 23,
            maxCharacterLimit: 280,
            supportAsset: null,
          },
        ],
        activeDraftVersionId: "v2",
      },
    ],
  });

  assert.equal(action?.activeDraftEditor.versionId, "v2");
  assert.equal(action?.request.selectedDraftContextOverride.versionId, "v2");
  assert.equal(
    action?.request.selectedDraftContextOverride.content,
    "latest editable version",
  );
});

test("resolveDraftCardRevisionAction respects an explicit thread framing override", () => {
  const action = resolveDraftCardRevisionAction({
    messageId: "message-2",
    prompt: "make it stronger",
    composerCharacterLimit: 280,
    revisionOptions: {
      threadFramingStyleOverride: "numbered",
    },
    messages: [
      {
        id: "message-2",
        role: "assistant",
        outputShape: "short_form_post",
        draftVersions: [
          {
            id: "v2",
            content: "A short post",
            source: "assistant_generated",
            createdAt: "2026-03-14T12:00:00.000Z",
            basedOnVersionId: null,
            weightedCharacterCount: 12,
            maxCharacterLimit: 280,
            supportAsset: null,
          },
        ],
      },
    ],
  });

  assert.equal(action?.request.threadFramingStyleOverride, "numbered");
});

test("resolveDraftCardRevisionAction carries an explicit format override for thread conversions", () => {
  const action = resolveDraftCardRevisionAction({
    messageId: "message-thread-convert",
    prompt: "turn into thread",
    composerCharacterLimit: 280,
    revisionOptions: {
      formatPreferenceOverride: "thread",
      threadFramingStyleOverride: "soft_signal",
    },
    messages: [
      {
        id: "message-thread-convert",
        role: "assistant",
        outputShape: "short_form_post",
        draftVersions: [
          {
            id: "v-thread-convert",
            content: "A short post that should become a thread",
            source: "assistant_generated",
            createdAt: "2026-03-14T12:00:00.000Z",
            basedOnVersionId: null,
            weightedCharacterCount: 38,
            maxCharacterLimit: 280,
            supportAsset: null,
          },
        ],
      },
    ],
  });

  assert.equal(action?.request.formatPreferenceOverride, "thread");
  assert.equal(action?.request.threadFramingStyleOverride, "soft_signal");
});

test("resolveDraftCardRevisionAction carries the focused thread post index when provided", () => {
  const action = resolveDraftCardRevisionAction({
    messageId: "message-4",
    prompt: "make it tighter",
    composerCharacterLimit: 560,
    revisionOptions: {
      focusedThreadPostIndex: 1,
    },
    messages: [
      {
        id: "message-4",
        role: "assistant",
        outputShape: "thread_seed",
        revisionChainId: "chain-4",
        draftVersions: [
          {
            id: "v4",
            content: "Hook\n\n---\n\nMiddle",
            source: "assistant_generated",
            createdAt: "2026-03-14T12:00:00.000Z",
            basedOnVersionId: null,
            weightedCharacterCount: 18,
            maxCharacterLimit: 560,
            supportAsset: null,
          },
        ],
        activeDraftVersionId: "v4",
      },
    ],
  });

  assert.equal(
    action?.request.selectedDraftContextOverride.focusedThreadPostIndex,
    1,
  );
  assert.equal(
    action?.request.artifactContext.selectedDraftContext.focusedThreadPostIndex,
    1,
  );
});

test("resolveSelectedThreadFramingChangeAction plans a revision only when the style changes", () => {
  const selectedDraftMessage = {
    id: "message-3",
    role: "assistant" as const,
    revisionChainId: "chain-3",
  };
  const selectedDraftVersion = {
    id: "v3",
    content: "Thread content",
    source: "assistant_revision" as const,
    createdAt: "2026-03-14T12:00:00.000Z",
    basedOnVersionId: "v2",
    weightedCharacterCount: 14,
    maxCharacterLimit: 560,
    supportAsset: null,
  };

  const noChange = resolveSelectedThreadFramingChangeAction({
    selectedDraftMessage,
    selectedDraftVersion,
    selectedDraftThreadFramingStyle: "numbered",
    nextStyle: "numbered",
  });
  assert.equal(noChange, null);

  const action = resolveSelectedThreadFramingChangeAction({
    selectedDraftMessage,
    selectedDraftVersion,
    selectedDraftThreadFramingStyle: "soft_signal",
    nextStyle: "none",
  });

  assert.equal(
    action?.request.prompt,
    "keep the same thread but remove thread numbering and make the flow feel natural without explicit thread labels.",
  );
  assert.equal(action?.request.threadFramingStyleOverride, "none");
  assert.equal(action?.activeDraftEditor.revisionChainId, "chain-3");
});
