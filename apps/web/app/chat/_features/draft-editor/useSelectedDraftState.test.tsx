import { renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { useSelectedDraftTimelineState } from "./useSelectedDraftState";

test("historical draft selections do not expose a selected draft context for revisions", () => {
  const messages = [
    {
      id: "message-1",
      role: "assistant" as const,
      createdAt: "2026-03-13T11:00:00.000Z",
      revisionChainId: "chain-1",
      draftVersions: [
        {
          id: "v1",
          content: "older version",
          source: "assistant_generated" as const,
          createdAt: "2026-03-13T11:00:00.000Z",
          basedOnVersionId: null,
          weightedCharacterCount: 13,
          maxCharacterLimit: 280,
          supportAsset: null,
        },
      ],
      activeDraftVersionId: "v1",
    },
    {
      id: "message-2",
      role: "assistant" as const,
      createdAt: "2026-03-13T12:00:00.000Z",
      revisionChainId: "chain-1",
      previousVersionSnapshot: {
        messageId: "message-1",
        versionId: "v1",
        content: "older version",
        source: "assistant_generated" as const,
        createdAt: "2026-03-13T11:00:00.000Z",
        revisionChainId: "chain-1",
      },
      draftVersions: [
        {
          id: "v2",
          content: "latest editable version",
          source: "assistant_revision" as const,
          createdAt: "2026-03-13T12:00:00.000Z",
          basedOnVersionId: "v1",
          weightedCharacterCount: 23,
          maxCharacterLimit: 280,
          supportAsset: null,
        },
      ],
      activeDraftVersionId: "v2",
    },
  ];

  const { result } = renderHook(() =>
    useSelectedDraftTimelineState({
      activeDraftEditor: {
        messageId: "message-1",
        versionId: "v1",
        revisionChainId: "chain-1",
      },
      messages,
      composerCharacterLimit: 280,
      selectedThreadPostByMessageId: {},
      selectedDraftThreadPostCount: 0,
      draftEditorSerializedContent: "older version",
      selectedDraftMessage: messages[0],
      selectedDraftVersion: messages[0].draftVersions[0],
      isSelectedDraftThread: false,
      setActiveDraftEditor: vi.fn(),
      scrollMessageIntoView: vi.fn(),
    }),
  );

  expect(result.current.isViewingHistoricalDraftVersion).toBe(true);
  expect(result.current.selectedDraftContext).toBeNull();
});
