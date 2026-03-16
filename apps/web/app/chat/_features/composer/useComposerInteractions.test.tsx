import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { useComposerInteractions } from "./useComposerInteractions";

type ContentFocus = "build_in_public" | "operator_lessons";

function buildOptions(
  overrides: Partial<{
    activeContentFocus: ContentFocus | null;
    activeThreadId: string | null;
    draftInput: string;
    requestAssistantReply: ReturnType<typeof vi.fn>;
    setActiveContentFocus: ReturnType<typeof vi.fn>;
    setDraftInput: ReturnType<typeof vi.fn>;
    setErrorMessage: ReturnType<typeof vi.fn>;
    setIsLeavingHero: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return {
    context: {
      id: "context-1",
      account: "stanley",
      creatorProfile: {
        voice: {
          primaryCasing: "sentence",
          lowercaseSharePercent: 0,
          averageLengthBand: "medium",
          styleNotes: [],
        },
        identity: {
          username: "stanley",
          isVerified: false,
        },
        styleCard: {
          preferredOpeners: [],
          signaturePhrases: [],
        },
      },
    },
    contract: { id: "contract-1" },
    activeThreadId: overrides.activeThreadId ?? "thread-1",
    draftInput: overrides.draftInput ?? "",
    messages: [] as Array<{ id: string; role: "assistant" | "user"; content: string }>,
    activeStrategyInputs: { goal: "followers" },
    activeToneInputs: { tone: "bold" },
    activeContentFocus: overrides.activeContentFocus ?? null,
    isMainChatLocked: false,
    requestAssistantReply:
      overrides.requestAssistantReply ?? vi.fn(async () => undefined),
    setActiveContentFocus: overrides.setActiveContentFocus ?? vi.fn(),
    setDraftInput: overrides.setDraftInput ?? vi.fn(),
    setErrorMessage: overrides.setErrorMessage ?? vi.fn(),
    setIsLeavingHero: overrides.setIsLeavingHero ?? vi.fn(),
  };
}

test("handleQuickReplySelect submits the visible chip label immediately", async () => {
  const requestAssistantReply = vi.fn(async () => undefined);
  const setDraftInput = vi.fn();
  const setErrorMessage = vi.fn();

  const { result } = renderHook(() =>
    useComposerInteractions<
      { id: string; role: "assistant" | "user"; content: string },
      { kind: "example_reply"; value: string; label: string },
      { goal: string },
      { tone: string },
      ContentFocus
    >(
      buildOptions({
        requestAssistantReply,
        setDraftInput,
        setErrorMessage,
      }),
    ),
  );

  await act(async () => {
    await result.current.handleQuickReplySelect({
      kind: "example_reply",
      value: "draft 4 posts from what you know about me",
      label: "Draft 4 posts",
    });
  });

  expect(setDraftInput).toHaveBeenNthCalledWith(1, "Draft 4 posts");
  expect(setDraftInput).toHaveBeenNthCalledWith(2, "");
  expect(setErrorMessage).toHaveBeenCalledWith(null);
  expect(requestAssistantReply).toHaveBeenCalledWith(
    expect.objectContaining({
      prompt: "Draft 4 posts",
      appendUserMessage: true,
      turnSource: "free_text",
    }),
  );
});

test("handleQuickReplySelect sends with the chip focus immediately", async () => {
  const requestAssistantReply = vi.fn(async () => undefined);
  const setActiveContentFocus = vi.fn();

  const { result } = renderHook(() =>
    useComposerInteractions<
      { id: string; role: "assistant" | "user"; content: string },
      {
        kind: "content_focus";
        value: ContentFocus;
        label: string;
      },
      { goal: string },
      { tone: string },
      ContentFocus
    >(
      buildOptions({
        activeContentFocus: "operator_lessons",
        requestAssistantReply,
        setActiveContentFocus,
      }),
    ),
  );

  await act(async () => {
    await result.current.handleQuickReplySelect({
      kind: "content_focus",
      value: "build_in_public",
      label: "Build In Public",
    });
  });

  expect(setActiveContentFocus).toHaveBeenCalledWith("build_in_public");
  expect(requestAssistantReply).toHaveBeenCalledWith(
    expect.objectContaining({
      prompt: "Build In Public",
      contentFocusOverride: "build_in_public",
    }),
  );
});
