import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { useDraftEditorState } from "./useDraftEditorState";

const baseThreadArtifact = {
  id: "artifact-thread",
  title: "Draft",
  kind: "thread_seed" as const,
  content: "old hook\n\n---\n\nproof",
  posts: [
    {
      id: "post-1",
      content: "old hook",
      weightedCharacterCount: 8,
      maxCharacterLimit: 280,
      isWithinXLimit: true,
    },
    {
      id: "post-2",
      content: "proof",
      weightedCharacterCount: 5,
      maxCharacterLimit: 280,
      isWithinXLimit: true,
    },
  ],
  characterCount: 19,
  weightedCharacterCount: 13,
  maxCharacterLimit: 1680,
  isWithinXLimit: true,
  supportAsset: null,
  groundingSources: [],
  groundingMode: null,
  groundingExplanation: null,
  betterClosers: [],
  replyPlan: [],
  voiceTarget: null,
  noveltyNotes: [],
  threadFramingStyle: "soft_signal" as const,
};

test("saveDraftEditor falls back to the selected thread message id when no active thread is open", async () => {
  const fetchWorkspace = vi.fn(async () =>
    new Response(
      JSON.stringify({
        ok: true,
        data: {
          userMessage: {
            id: "user-msg-2",
            role: "user",
            content: "make this the current version",
            createdAt: "2026-03-18T15:00:00.000Z",
          },
          assistantMessage: {
            id: "assistant-msg-2",
            role: "assistant",
            content: "made this the current version. take a look.",
            createdAt: "2026-03-18T15:00:01.000Z",
            draft: "new hook\n\n---\n\nproof",
            drafts: ["new hook\n\n---\n\nproof"],
            draftArtifacts: [
              {
                ...baseThreadArtifact,
                content: "new hook\n\n---\n\nproof",
                posts: [
                  { ...baseThreadArtifact.posts[0], content: "new hook" },
                  baseThreadArtifact.posts[1],
                ],
              },
            ],
            draftVersions: [
              {
                id: "v2",
                content: "new hook\n\n---\n\nproof",
                source: "manual_save",
                createdAt: "2026-03-18T15:00:01.000Z",
                basedOnVersionId: "v1",
                weightedCharacterCount: 13,
                maxCharacterLimit: 1680,
                supportAsset: null,
              },
            ],
            activeDraftVersionId: "v2",
            previousVersionSnapshot: {
              messageId: "assistant-msg-1",
              versionId: "v1",
              content: "old hook\n\n---\n\nproof",
              source: "assistant_generated",
              createdAt: "2026-03-18T14:00:00.000Z",
              maxCharacterLimit: 1680,
              revisionChainId: "thread-chain-1",
            },
            revisionChainId: "thread-chain-1",
            supportAsset: null,
            outputShape: "thread_seed",
          },
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    ),
  );

  const { result } = renderHook(() =>
    useDraftEditorState({
      activeDraftEditor: {
        messageId: "assistant-msg-1",
        versionId: "v1",
        revisionChainId: "thread-chain-1",
      },
      composerCharacterLimit: 1680,
      messages: [
        {
          id: "assistant-msg-1",
          threadId: "thread-fallback",
          role: "assistant" as const,
          content: "original reply",
          createdAt: "2026-03-18T14:00:00.000Z",
          outputShape: "thread_seed" as const,
          revisionChainId: "thread-chain-1",
          draftArtifacts: [baseThreadArtifact],
          draftVersions: [
            {
              id: "v1",
              content: "old hook\n\n---\n\nproof",
              source: "assistant_generated" as const,
              createdAt: "2026-03-18T14:00:00.000Z",
              basedOnVersionId: null,
              weightedCharacterCount: 13,
              maxCharacterLimit: 1680,
              supportAsset: null,
              artifact: baseThreadArtifact,
            },
          ],
          activeDraftVersionId: "v1",
        },
      ],
      selectedDraftVersionId: "v1",
      selectedDraftVersionContent: "old hook\n\n---\n\nproof",
      selectedDraftVersion: {
        id: "v1",
        content: "old hook\n\n---\n\nproof",
        source: "assistant_generated",
        createdAt: "2026-03-18T14:00:00.000Z",
        basedOnVersionId: null,
        weightedCharacterCount: 13,
        maxCharacterLimit: 1680,
        supportAsset: null,
        artifact: baseThreadArtifact,
      },
      selectedDraftMessage: {
        id: "assistant-msg-1",
        threadId: "thread-fallback",
        role: "assistant" as const,
        content: "original reply",
        createdAt: "2026-03-18T14:00:00.000Z",
        outputShape: "thread_seed" as const,
        revisionChainId: "thread-chain-1",
        draftArtifacts: [baseThreadArtifact],
        draftVersions: [
          {
            id: "v1",
            content: "old hook\n\n---\n\nproof",
            source: "assistant_generated" as const,
            createdAt: "2026-03-18T14:00:00.000Z",
            basedOnVersionId: null,
            weightedCharacterCount: 13,
            maxCharacterLimit: 1680,
            supportAsset: null,
            artifact: baseThreadArtifact,
          },
        ],
        activeDraftVersionId: "v1",
      },
      selectedDraftArtifact: baseThreadArtifact,
      selectedDraftBundle: null,
      isSelectedDraftThread: true,
      isVerifiedAccount: false,
      activeThreadId: null,
      fetchWorkspace,
      mergeSourceMaterials: vi.fn(),
      scrollThreadToBottom: vi.fn(),
      setMessages: vi.fn(),
      setActiveDraftEditor: vi.fn(),
      setExpandedInlineThreadPreviewId: vi.fn(),
      setSelectedThreadPostByMessageId: vi.fn(),
      onErrorMessage: vi.fn(),
      createPromotionUserMessage: (args) => ({
        ...args,
        role: "user" as const,
      }),
      createPromotionAssistantMessage: (args) => ({
        ...args,
        role: "assistant" as const,
        feedbackValue: null,
      }),
    }),
  );

  await act(async () => {
    result.current.updateThreadDraftPost(0, "new hook");
  });

  await act(async () => {
    await result.current.saveDraftEditor();
  });

  expect(fetchWorkspace).toHaveBeenCalledTimes(1);
  expect(fetchWorkspace.mock.calls[0]?.[0]).toBe(
    "/api/creator/v2/threads/thread-fallback/draft-promotions",
  );
});

test("shareDraftEditorToX opens the source tweet for reply drafts", () => {
  const windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);

  const replyArtifact = {
    id: "reply-artifact",
    title: "Reply draft",
    kind: "reply_candidate" as const,
    content: "reply text",
    posts: [],
    characterCount: 10,
    weightedCharacterCount: 10,
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
    replySourcePreview: {
      postId: "2034751673290350617",
      sourceUrl: "https://x.com/elkelk/status/2034751673290350617",
      author: {
        displayName: "elkelk",
        username: "elkelk",
        avatarUrl: null,
        isVerified: false,
      },
      text: "Perfect algo pull",
      media: [],
    },
  };

  const { result } = renderHook(() =>
    useDraftEditorState({
      activeDraftEditor: {
        messageId: "assistant-msg-1",
        versionId: "v1",
        revisionChainId: "reply-chain-1",
      },
      composerCharacterLimit: 280,
      messages: [
        {
          id: "assistant-msg-1",
          threadId: "thread-1",
          role: "assistant" as const,
          content: "reply draft",
          createdAt: "2026-03-19T14:00:00.000Z",
          outputShape: "reply_candidate" as const,
          revisionChainId: "reply-chain-1",
          draftArtifacts: [replyArtifact],
          draftVersions: [
            {
              id: "v1",
              content: "reply text",
              source: "assistant_generated" as const,
              createdAt: "2026-03-19T14:00:00.000Z",
              basedOnVersionId: null,
              weightedCharacterCount: 10,
              maxCharacterLimit: 280,
              supportAsset: null,
              artifact: replyArtifact,
            },
          ],
          activeDraftVersionId: "v1",
        },
      ],
      selectedDraftVersionId: "v1",
      selectedDraftVersionContent: "reply text",
      selectedDraftVersion: {
        id: "v1",
        content: "reply text",
        source: "assistant_generated",
        createdAt: "2026-03-19T14:00:00.000Z",
        basedOnVersionId: null,
        weightedCharacterCount: 10,
        maxCharacterLimit: 280,
        supportAsset: null,
        artifact: replyArtifact,
      },
      selectedDraftMessage: {
        id: "assistant-msg-1",
        threadId: "thread-1",
        role: "assistant" as const,
        content: "reply draft",
        createdAt: "2026-03-19T14:00:00.000Z",
        outputShape: "reply_candidate" as const,
        revisionChainId: "reply-chain-1",
        draftArtifacts: [replyArtifact],
        draftVersions: [
          {
            id: "v1",
            content: "reply text",
            source: "assistant_generated" as const,
            createdAt: "2026-03-19T14:00:00.000Z",
            basedOnVersionId: null,
            weightedCharacterCount: 10,
            maxCharacterLimit: 280,
            supportAsset: null,
            artifact: replyArtifact,
          },
        ],
        activeDraftVersionId: "v1",
      },
      selectedDraftArtifact: replyArtifact,
      selectedDraftBundle: null,
      isSelectedDraftThread: false,
      isVerifiedAccount: false,
      activeThreadId: "thread-1",
      fetchWorkspace: vi.fn(),
      mergeSourceMaterials: vi.fn(),
      scrollThreadToBottom: vi.fn(),
      setMessages: vi.fn(),
      setActiveDraftEditor: vi.fn(),
      setExpandedInlineThreadPreviewId: vi.fn(),
      setSelectedThreadPostByMessageId: vi.fn(),
      onErrorMessage: vi.fn(),
      createPromotionUserMessage: (args) => ({
        ...args,
        role: "user" as const,
      }),
      createPromotionAssistantMessage: (args) => ({
        ...args,
        role: "assistant" as const,
        feedbackValue: null,
      }),
    }),
  );

  act(() => {
    result.current.shareDraftEditorToX();
  });

  expect(windowOpen).toHaveBeenCalledWith(
    "https://x.com/elkelk/status/2034751673290350617",
    "_blank",
    "noopener,noreferrer",
  );

  windowOpen.mockRestore();
});
