import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import type { CreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";
import { useComposerInteractions } from "./useComposerInteractions";

type ContentFocus = "build_in_public" | "operator_lessons";
type RequestAssistantReplyMock = (options: {
  prompt?: string;
  displayUserMessage?: string;
  includeUserMessageInHistory?: boolean;
  turnSource?: "ideation_pick" | "reply_action" | "free_text";
  intent?: "coach" | "ideate" | "plan" | "planner_feedback" | "draft" | "review" | "edit";
  artifactContext?:
    | {
        kind: "selected_angle";
        angle: string;
        formatHint: "post" | "thread";
        supportAsset?: string;
      }
    | {
        kind: "reply_option_select";
        optionIndex: number;
      };
  formatPreferenceOverride?: "shortform" | "longform" | "thread" | null;
  appendUserMessage: boolean;
  strategyInputOverride?: { goal: string };
  toneInputOverride?: { tone: string };
  contentFocusOverride?: ContentFocus | null;
}) => Promise<void>;
type SetActiveContentFocusMock = (value: ContentFocus) => void;
type SetDraftInputMock = (value: string) => void;
type SetErrorMessageMock = (value: string | null) => void;
type SetIsLeavingHeroMock = (value: boolean) => void;

function buildOptions(
  overrides: Partial<{
    activeContentFocus: ContentFocus | null;
    activeThreadId: string | null;
    draftInput: string;
    requestAssistantReply: RequestAssistantReplyMock;
    setActiveContentFocus: SetActiveContentFocusMock;
    setDraftInput: SetDraftInputMock;
    setErrorMessage: SetErrorMessageMock;
    setIsLeavingHero: SetIsLeavingHeroMock;
  }> = {},
) {
  return {
    context: {
      generatedAt: "2026-03-15T12:00:00.000Z",
      contextVersion: "agent_context_v3",
      creatorProfileVersion: "fixture_v1",
      evaluationRubricVersion: "fixture_v1",
      runId: "run-1",
      account: "stanley",
      source: "fixture",
      growthStrategySnapshot: {
        contentPillars: [],
        knownFor: null,
        targetAudience: null,
      },
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
        topics: {
          contentPillars: [],
          dominantTopics: [],
        },
        styleCard: {
          preferredOpeners: [],
          signaturePhrases: [],
        },
      },
      performanceModel: {},
      strategyDelta: {},
      confidence: {},
      readiness: {},
      anchorSummary: {},
      positiveAnchors: [],
      negativeAnchors: [],
      retrieval: {},
      unknowns: [],
    } as unknown as CreatorAgentContext,
    contract: { id: "contract-1" },
    activeThreadId: overrides.activeThreadId ?? "thread-1",
    draftInput: overrides.draftInput ?? "",
    messages: [] as Array<{ id: string; role: "assistant" | "user"; content: string }>,
    activeStrategyInputs: { goal: "followers" },
    activeToneInputs: { tone: "bold" },
    activeContentFocus: overrides.activeContentFocus ?? null,
    isMainChatLocked: false,
    requestAssistantReply:
      overrides.requestAssistantReply ??
      vi.fn<RequestAssistantReplyMock>(async () => undefined),
    setActiveContentFocus:
      overrides.setActiveContentFocus ?? vi.fn<SetActiveContentFocusMock>(),
    setDraftInput: overrides.setDraftInput ?? vi.fn<SetDraftInputMock>(),
    setErrorMessage: overrides.setErrorMessage ?? vi.fn<SetErrorMessageMock>(),
    setIsLeavingHero: overrides.setIsLeavingHero ?? vi.fn<SetIsLeavingHeroMock>(),
  };
}

test("handleQuickReplySelect submits the visible chip label immediately", async () => {
  const requestAssistantReply = vi.fn<RequestAssistantReplyMock>(async () => undefined);
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
  const requestAssistantReply = vi.fn<RequestAssistantReplyMock>(async () => undefined);
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

test("handleQuickReplySelect routes ideation angle chips into structured angle picks", async () => {
  const requestAssistantReply = vi.fn<RequestAssistantReplyMock>(async () => undefined);
  const setDraftInput = vi.fn();
  const setErrorMessage = vi.fn();

  const { result } = renderHook(() =>
    useComposerInteractions<
      { id: string; role: "assistant" | "user"; content: string },
      {
        kind: "ideation_angle";
        value: string;
        label: string;
        angle: string;
        formatHint: "post";
        supportAsset?: string;
      },
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
      kind: "ideation_angle",
      value: "the hiring filter that kept our team lean",
      label: "The hiring filter that kept our team lean",
      angle: "The hiring filter that kept our team lean",
      formatHint: "post",
      supportAsset: "Image anchor: shipping dashboard on a laptop.",
    });
  });

  expect(setErrorMessage).toHaveBeenCalledWith(null);
  expect(setDraftInput).not.toHaveBeenCalled();
  expect(requestAssistantReply).toHaveBeenCalledWith(
    expect.objectContaining({
      prompt: "",
      displayUserMessage: "> The hiring filter that kept our team lean",
      turnSource: "ideation_pick",
      artifactContext: {
        kind: "selected_angle",
        angle: "The hiring filter that kept our team lean",
        formatHint: "post",
        supportAsset: "Image anchor: shipping dashboard on a laptop.",
      },
    }),
  );
});

test("submitComposerPrompt forwards explicit draft and format overrides", async () => {
  const requestAssistantReply = vi.fn<RequestAssistantReplyMock>(async () => undefined);
  const setDraftInput = vi.fn();

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
      }),
    ),
  );

  await act(async () => {
    await result.current.submitComposerPrompt("turn this into a thread", {
      intentOverride: "draft",
      formatPreferenceOverride: "thread",
    });
  });

  expect(setDraftInput).toHaveBeenCalledWith("");
  expect(requestAssistantReply).toHaveBeenCalledWith(
    expect.objectContaining({
      prompt: "turn this into a thread",
      intent: "draft",
      formatPreferenceOverride: "thread",
      turnSource: "free_text",
    }),
  );
});
