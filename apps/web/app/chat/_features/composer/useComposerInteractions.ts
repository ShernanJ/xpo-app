"use client";

import {
  useCallback,
  useMemo,
  type FormEventHandler,
  type KeyboardEventHandler,
} from "react";

import type {
  ChatArtifactContext,
  SelectedAngleFormatHint,
} from "../../../../lib/agent-v2/contracts/turnContract";
import type { CreatorAgentContext } from "../../../../lib/onboarding/strategy/agentContext";

import {
  prepareComposerSubmission,
  resolveComposerQuickReplyUpdate,
  type ComposerQuickReplyLike,
} from "./chatComposerState";
import { buildDefaultExampleQuickReplies } from "./composerViewState";

const HERO_EXIT_TRANSITION_MS = 720;

interface ChatMessageLike {
  id: string;
  role: "assistant" | "user";
  content: string;
}

type RequestAssistantReplyFn<TStrategyInputs, TToneInputs, TContentFocus extends string> = (
  options: {
    prompt?: string;
    displayUserMessage?: string;
    includeUserMessageInHistory?: boolean;
    turnSource?: "ideation_pick" | "reply_action" | "free_text";
    artifactContext?: ChatArtifactContext | null;
    intent?: "coach" | "ideate" | "plan" | "planner_feedback" | "draft" | "review" | "edit";
    formatPreferenceOverride?: "shortform" | "longform" | "thread" | null;
    appendUserMessage: boolean;
    strategyInputOverride?: TStrategyInputs;
    toneInputOverride?: TToneInputs;
    contentFocusOverride?: TContentFocus | null;
  },
) => Promise<void>;

interface UseComposerInteractionsOptions<
  TMessage extends ChatMessageLike,
  TStrategyInputs,
  TToneInputs,
  TContentFocus extends string,
> {
  context: CreatorAgentContext | null;
  contract: object | null;
  activeThreadId: string | null;
  draftInput: string;
  messages: TMessage[];
  activeStrategyInputs: TStrategyInputs | null;
  activeToneInputs: TToneInputs | null;
  activeContentFocus: TContentFocus | null;
  isMainChatLocked: boolean;
  requestAssistantReply: RequestAssistantReplyFn<
    TStrategyInputs,
    TToneInputs,
    TContentFocus
  >;
  setActiveContentFocus: (value: TContentFocus) => void;
  setDraftInput: (value: string) => void;
  setErrorMessage: (value: string | null) => void;
  setIsLeavingHero: (value: boolean) => void;
}

export function useComposerInteractions<
  TMessage extends ChatMessageLike,
  TQuickReply extends ComposerQuickReplyLike<TContentFocus>,
  TStrategyInputs,
  TToneInputs,
  TContentFocus extends string,
>(options: UseComposerInteractionsOptions<
  TMessage,
  TStrategyInputs,
  TToneInputs,
  TContentFocus
>) {
  const {
    context,
    contract,
    activeThreadId,
    draftInput,
    messages,
    activeStrategyInputs,
    activeToneInputs,
    activeContentFocus,
    isMainChatLocked,
    requestAssistantReply,
    setActiveContentFocus,
    setDraftInput,
    setErrorMessage,
    setIsLeavingHero,
  } = options;

  const latestAssistantMessageId = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.role === "assistant" && message.content.length > 0)
        ?.id ?? null,
    [messages],
  );
  const defaultQuickReplies = useMemo(
    () => buildDefaultExampleQuickReplies(context) as TQuickReply[],
    [context],
  );

  const handleAngleSelect = useCallback(
    async (
      angle: string,
      formatHint: SelectedAngleFormatHint,
      supportAsset?: string,
      imageAssetId?: string,
    ) => {
      if (!activeStrategyInputs || !activeToneInputs || isMainChatLocked) {
        return;
      }

      await requestAssistantReply({
        prompt: "",
        displayUserMessage: `> ${angle}`,
        includeUserMessageInHistory: false,
        turnSource: "ideation_pick",
        artifactContext: {
          kind: "selected_angle",
          angle,
          formatHint,
          ...(supportAsset ? { supportAsset } : {}),
          ...(imageAssetId ? { imageAssetId } : {}),
        },
        formatPreferenceOverride: formatHint === "thread" ? "thread" : null,
        appendUserMessage: true,
        strategyInputOverride: activeStrategyInputs,
        toneInputOverride: activeToneInputs,
        contentFocusOverride: activeContentFocus,
      });
    },
    [
      activeContentFocus,
      activeStrategyInputs,
      activeToneInputs,
      isMainChatLocked,
      requestAssistantReply,
    ],
  );

  const handleReplyOptionSelect = useCallback(
    async (optionIndex: number) => {
      if (!activeStrategyInputs || !activeToneInputs || isMainChatLocked) {
        return;
      }

      await requestAssistantReply({
        prompt: "",
        displayUserMessage: `> option ${optionIndex + 1}`,
        includeUserMessageInHistory: false,
        turnSource: "reply_action",
        artifactContext: {
          kind: "reply_option_select",
          optionIndex,
        },
        appendUserMessage: true,
        strategyInputOverride: activeStrategyInputs,
        toneInputOverride: activeToneInputs,
        contentFocusOverride: activeContentFocus,
      });
    },
    [
      activeContentFocus,
      activeStrategyInputs,
      activeToneInputs,
      isMainChatLocked,
      requestAssistantReply,
    ],
  );

  const submitComposerPrompt = useCallback(
    async (
      prompt: string,
      options?: {
        contentFocusOverride?: TContentFocus | null;
        intentOverride?: "coach" | "ideate" | "plan" | "planner_feedback" | "draft" | "review" | "edit";
        formatPreferenceOverride?: "shortform" | "longform" | "thread" | null;
        artifactContextOverride?: ChatArtifactContext | null;
      },
    ) => {
      const submission = prepareComposerSubmission({
        prompt,
        hasContext: Boolean(context),
        hasContract: Boolean(contract),
        hasStrategyInputs: Boolean(activeStrategyInputs),
        hasToneInputs: Boolean(activeToneInputs),
        isMainChatLocked,
        activeThreadId,
        messagesLength: messages.length,
      });

      if (submission.status === "skip") {
        return;
      }

      if (submission.status === "blocked") {
        setErrorMessage(submission.errorMessage);
        return;
      }

      if (submission.shouldAnimateHeroExit) {
        setIsLeavingHero(true);
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, HERO_EXIT_TRANSITION_MS);
        });
      }

      setDraftInput("");

      await requestAssistantReply({
        prompt: submission.trimmedPrompt,
        appendUserMessage: true,
        ...(options?.artifactContextOverride
          ? { artifactContext: options.artifactContextOverride }
          : { turnSource: "free_text" as const }),
        intent: options?.intentOverride,
        formatPreferenceOverride: options?.formatPreferenceOverride ?? null,
        strategyInputOverride: activeStrategyInputs as TStrategyInputs,
        toneInputOverride: activeToneInputs as TToneInputs,
        contentFocusOverride: options?.contentFocusOverride ?? activeContentFocus,
      });
    },
    [
      activeContentFocus,
      activeThreadId,
      activeStrategyInputs,
      activeToneInputs,
      contract,
      context,
      isMainChatLocked,
      messages.length,
      requestAssistantReply,
      setDraftInput,
      setErrorMessage,
      setIsLeavingHero,
    ],
  );

  const handleQuickReplySelect = useCallback(
    async (quickReply: TQuickReply) => {
      if (quickReply.kind === "ideation_angle") {
        if (isMainChatLocked) {
          return;
        }

        setErrorMessage(null);
        await handleAngleSelect(
          quickReply.angle || quickReply.label,
          quickReply.formatHint || "post",
          quickReply.supportAsset,
          quickReply.imageAssetId,
        );
        return;
      }

      const quickReplyUpdate = resolveComposerQuickReplyUpdate({
        quickReply,
        isMainChatLocked,
      });
      if (!quickReplyUpdate.shouldApply) {
        return;
      }

      if (quickReplyUpdate.nextActiveContentFocus) {
        setActiveContentFocus(quickReplyUpdate.nextActiveContentFocus as TContentFocus);
      }

      setDraftInput(quickReplyUpdate.nextDraftInput);
      if (quickReplyUpdate.shouldClearError) {
        setErrorMessage(null);
      }

      await submitComposerPrompt(quickReplyUpdate.nextDraftInput, {
        contentFocusOverride:
          quickReplyUpdate.nextActiveContentFocus ?? activeContentFocus,
      });
    },
    [
      activeContentFocus,
      handleAngleSelect,
      isMainChatLocked,
      setActiveContentFocus,
      setDraftInput,
      setErrorMessage,
      submitComposerPrompt,
    ],
  );

  const handleComposerSubmit: FormEventHandler<HTMLFormElement> = useCallback(
    (event) => {
      event.preventDefault();
      void submitComposerPrompt(draftInput);
    },
    [draftInput, submitComposerPrompt],
  );

  const submitQuickStarter = useCallback(
    async (prompt: string) => {
      await submitComposerPrompt(prompt);
    },
    [submitComposerPrompt],
  );

  const handleComposerKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void submitComposerPrompt(draftInput);
      }
    },
    [draftInput, submitComposerPrompt],
  );

  return {
    latestAssistantMessageId,
    submitComposerPrompt,
    defaultQuickReplies,
    handleAngleSelect,
    handleReplyOptionSelect,
    handleQuickReplySelect,
    handleComposerSubmit,
    submitQuickStarter,
    handleComposerKeyDown,
  };
}
