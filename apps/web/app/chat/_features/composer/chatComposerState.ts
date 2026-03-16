export interface ComposerQuickReplyLike<TFocus extends string> {
  kind: "content_focus" | "example_reply" | "planner_action" | "clarification_choice";
  value: string;
  label: string;
  suggestedFocus?: TFocus;
}

export type ComposerQuickReplyUpdate<TFocus extends string> =
  | {
      shouldApply: false;
    }
  | {
      shouldApply: true;
      nextDraftInput: string;
      nextActiveContentFocus?: TFocus;
      shouldClearError: true;
    };

export type ComposerSubmissionPreparation =
  | {
      status: "skip";
      trimmedPrompt: string;
      shouldAnimateHeroExit: false;
    }
  | {
      status: "blocked";
      trimmedPrompt: string;
      errorMessage: string;
      shouldAnimateHeroExit: false;
    }
  | {
      status: "ready";
      trimmedPrompt: string;
      shouldAnimateHeroExit: boolean;
    };

export function resolveComposerQuickReplyUpdate<TFocus extends string>(args: {
  quickReply: ComposerQuickReplyLike<TFocus>;
  isMainChatLocked: boolean;
}): ComposerQuickReplyUpdate<TFocus> {
  if (args.isMainChatLocked) {
    return {
      shouldApply: false,
    };
  }

  if (args.quickReply.kind === "content_focus") {
    return {
      shouldApply: true,
      nextDraftInput: args.quickReply.label,
      nextActiveContentFocus: args.quickReply.value as TFocus,
      shouldClearError: true,
    };
  }

  return {
    shouldApply: true,
    nextDraftInput: args.quickReply.label,
    ...(args.quickReply.suggestedFocus
      ? { nextActiveContentFocus: args.quickReply.suggestedFocus }
      : {}),
    shouldClearError: true,
  };
}

export function prepareComposerSubmission(args: {
  prompt: string;
  hasContext: boolean;
  hasContract: boolean;
  hasStrategyInputs: boolean;
  hasToneInputs: boolean;
  isMainChatLocked: boolean;
  activeThreadId: string | null;
  messagesLength: number;
}): ComposerSubmissionPreparation {
  const trimmedPrompt = args.prompt.trim();

  if (
    !trimmedPrompt ||
    !args.hasContext ||
    !args.hasContract ||
    args.isMainChatLocked
  ) {
    return {
      status: "skip",
      trimmedPrompt,
      shouldAnimateHeroExit: false,
    };
  }

  if (!args.hasStrategyInputs || !args.hasToneInputs) {
    return {
      status: "blocked",
      trimmedPrompt,
      errorMessage: "The planning model is still loading.",
      shouldAnimateHeroExit: false,
    };
  }

  return {
    status: "ready",
    trimmedPrompt,
    shouldAnimateHeroExit: !args.activeThreadId && args.messagesLength === 0,
  };
}
