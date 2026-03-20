import type { V2ChatIntent } from "../../../../lib/agent-v2/contracts/chat";
import type { SlashCommandDefinition } from "./composerTypes";

export interface ComposerQuickReplyLike<TFocus extends string> {
  kind:
    | "content_focus"
    | "example_reply"
    | "planner_action"
    | "clarification_choice"
    | "ideation_angle"
    | "image_post_confirmation"
    | "retry_action";
  value: string;
  label: string;
  suggestedFocus?: TFocus;
  explicitIntent?: V2ChatIntent;
  formatPreference?: "shortform" | "longform" | "thread";
  angle?: string;
  formatHint?: "post" | "thread";
  supportAsset?: string;
  imageAssetId?: string;
  decision?: "confirm" | "decline";
}

export type ComposerQuickReplyUpdate<TFocus extends string> =
  | {
      shouldApply: false;
    }
  | {
      shouldApply: true;
      nextDraftInput: string;
      submissionPrompt: string;
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
      submissionPrompt: args.quickReply.label,
      nextActiveContentFocus: args.quickReply.value as TFocus,
      shouldClearError: true,
    };
  }

  return {
    shouldApply: true,
    nextDraftInput: args.quickReply.label,
    submissionPrompt: args.quickReply.value,
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

export function resolveSlashCommandQuery(input: string): string | null {
  const normalized = input.trimStart();
  if (!normalized.startsWith("/")) {
    return null;
  }

  const [token] = normalized.slice(1).split(/\s+/, 1);
  return token ?? "";
}

export function filterSlashCommands(args: {
  commands: readonly SlashCommandDefinition[];
  query: string | null;
}): SlashCommandDefinition[] {
  const normalizedQuery = (args.query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    return [...args.commands];
  }

  return args.commands.filter((command) => {
    const commandToken = command.command.slice(1).toLowerCase();
    return (
      commandToken.includes(normalizedQuery) ||
      command.label.toLowerCase().includes(normalizedQuery) ||
      command.description.toLowerCase().includes(normalizedQuery)
    );
  });
}

export function consumeExactLeadingSlashCommand(args: {
  input: string;
  commands: readonly SlashCommandDefinition[];
}):
  | {
      command: SlashCommandDefinition;
      remainder: string;
    }
  | null {
  const normalized = args.input.trimStart();
  if (!normalized.startsWith("/")) {
    return null;
  }

  const match = normalized.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
  if (!match) {
    return null;
  }

  const [, rawCommand, rawRemainder] = match;
  const command = args.commands.find(
    (entry) => entry.command.slice(1).toLowerCase() === rawCommand.toLowerCase(),
  );
  if (!command) {
    return null;
  }

  return {
    command,
    remainder: rawRemainder?.trimStart() ?? "",
  };
}

export function dismissSlashCommandInput(input: string): string {
  const normalized = input.trimStart();
  if (!normalized.startsWith("/")) {
    return input;
  }

  return normalized.slice(1);
}
