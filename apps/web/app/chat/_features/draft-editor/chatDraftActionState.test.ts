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

test("resolveDraftCardRevisionAction respects an explicit thread framing override", () => {
  const action = resolveDraftCardRevisionAction({
    messageId: "message-2",
    prompt: "make it stronger",
    composerCharacterLimit: 280,
    threadFramingStyleOverride: "numbered",
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
