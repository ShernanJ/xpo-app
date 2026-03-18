"use client";

import Image from "next/image";
import {
  AnimatePresence,
  motion,
} from "framer-motion";
import {
  Paperclip,
  Square,
  X,
} from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type ChangeEventHandler,
  type FormEventHandler,
  type KeyboardEventHandler,
  type RefObject,
  type SetStateAction,
} from "react";

import {
  dismissSlashCommandInput,
  filterSlashCommands,
} from "./chatComposerState";
import { TextShimmer } from "@/components/ui/text-shimmer";
import {
  formatComposerImageSize,
  COMPOSER_IMAGE_ACCEPT,
} from "./composerImageState";
import {
  formatComposerModeLabel,
} from "./composerViewState";
import type {
  ChatComposerMode,
  ComposerCommandId,
  ComposerImageAttachment,
  SlashCommandDefinition,
} from "./composerTypes";

interface ChatComposerSurfaceProps {
  draftInput: string;
  composerMode: ChatComposerMode;
  activePlaceholder: string;
  placeholderAnimationKey: string;
  shouldAnimatePlaceholder: boolean;
  slashCommands: SlashCommandDefinition[];
  slashCommandQuery: string | null;
  composerInlineNotice: string | null;
  composerImageAttachment: ComposerImageAttachment | null;
  composerFileInputRef: RefObject<HTMLInputElement | null>;
  isSlashCommandPickerOpen: boolean;
  isComposerDisabled: boolean;
  isSubmitDisabled: boolean;
  isSending: boolean;
  surfaceClassName: string;
  onCancelComposerMode: () => void;
  onComposerFileChange: ChangeEventHandler<HTMLInputElement>;
  onComposerKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onDraftInputChange: (value: string) => void;
  onDismissSlashCommandPicker: () => void;
  onInterruptReply: () => void;
  onOpenComposerImagePicker: () => void;
  onRemoveComposerImageAttachment: () => void;
  onSelectSlashCommand: (commandId: ComposerCommandId) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export function ChatComposerSurface(props: ChatComposerSurfaceProps) {
  const {
    draftInput,
    composerMode,
    activePlaceholder,
    placeholderAnimationKey,
    shouldAnimatePlaceholder,
    slashCommands,
    slashCommandQuery,
    composerInlineNotice,
    composerImageAttachment,
    composerFileInputRef,
    isSlashCommandPickerOpen,
    isComposerDisabled,
    isSubmitDisabled,
    isSending,
    surfaceClassName,
    onCancelComposerMode,
    onComposerFileChange,
    onComposerKeyDown,
    onDraftInputChange,
    onDismissSlashCommandPicker,
    onInterruptReply,
    onOpenComposerImagePicker,
    onRemoveComposerImageAttachment,
    onSelectSlashCommand,
    onSubmit,
  } = props;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightedSlashCommandSessionKey = `${isSlashCommandPickerOpen ? "open" : "closed"}:${slashCommandQuery ?? ""}`;
  const [highlightedCommandState, setHighlightedCommandState] = useState(() => ({
    index: 0,
    sessionKey: "",
  }));
  const modeLabel = formatComposerModeLabel(composerMode);
  const filteredSlashCommands = useMemo(
    () =>
      filterSlashCommands({
        commands: slashCommands,
        query: slashCommandQuery,
      }),
    [slashCommandQuery, slashCommands],
  );
  const highlightedCommandIndex =
    highlightedCommandState.sessionKey === highlightedSlashCommandSessionKey
      ? Math.min(
          highlightedCommandState.index,
          Math.max(filteredSlashCommands.length - 1, 0),
        )
      : 0;

  const updateHighlightedCommandIndex = (value: SetStateAction<number>) => {
    setHighlightedCommandState((current) => {
      const currentIndex =
        current.sessionKey === highlightedSlashCommandSessionKey
          ? current.index
          : 0;
      const nextIndex =
        typeof value === "function" ? value(currentIndex) : value;

      return {
        index: nextIndex,
        sessionKey: highlightedSlashCommandSessionKey,
      };
    });
  };

  const handleSelectSlashCommand = (commandId: ComposerCommandId) => {
    onSelectSlashCommand(commandId);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  const handleTextareaKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    if (isSlashCommandPickerOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        updateHighlightedCommandIndex((current) =>
          filteredSlashCommands.length === 0
            ? 0
            : (current + 1) % filteredSlashCommands.length,
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        updateHighlightedCommandIndex((current) =>
          filteredSlashCommands.length === 0
            ? 0
            : (current - 1 + filteredSlashCommands.length) % filteredSlashCommands.length,
        );
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onDismissSlashCommandPicker();
        return;
      }

      if ((event.key === "Enter" || event.key === "Tab") && filteredSlashCommands.length > 0) {
        event.preventDefault();
        handleSelectSlashCommand(
          filteredSlashCommands[highlightedCommandIndex]?.id ?? filteredSlashCommands[0].id,
        );
        return;
      }
    }

    if (composerMode?.kind === "command" && event.key === "Escape") {
      event.preventDefault();
      onCancelComposerMode();
      return;
    }

    if (composerMode?.kind === "command" && event.key === "Backspace" && !draftInput) {
      event.preventDefault();
      onCancelComposerMode();
      return;
    }

    onComposerKeyDown(event);
  };

  const placeholderTopClassName = modeLabel ? "top-[2.3rem]" : "top-3.5";
  const showPlaceholder = draftInput.length === 0;
  const inputRightPaddingClassName = "pr-[6.75rem] sm:pr-[7.25rem]";
  const placeholderRightInsetClassName = "right-[6.75rem] sm:right-[7.25rem]";
  const displayedPlaceholder = isSending ? "Agent is thinking" : activePlaceholder;
  const displayedPlaceholderAnimationKey = isSending
    ? "thinking"
    : placeholderAnimationKey;
  const shouldAnimateDisplayedPlaceholder = !isSending && shouldAnimatePlaceholder;

  return (
    <form onSubmit={onSubmit}>
      <div className={surfaceClassName}>
        {modeLabel ? (
          <div className="absolute left-3 top-2 z-10 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            <span>{modeLabel}</span>
            <button
              type="button"
              onClick={onCancelComposerMode}
              className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] text-zinc-400 transition hover:border-white/20 hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>
        ) : null}

        <div className="relative">
          <textarea
            ref={textareaRef}
            value={draftInput}
            onChange={(event) => onDraftInputChange(event.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder=""
            disabled={isComposerDisabled}
            aria-label="Chat composer"
            className={`max-h-[180px] min-h-[44px] w-full resize-none bg-transparent px-4 py-3 text-[16px] leading-6 text-white outline-none disabled:opacity-50 sm:text-[14px] sm:leading-5 ${inputRightPaddingClassName} ${modeLabel ? "pt-8" : ""}`}
            rows={1}
          />

          {showPlaceholder ? (
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute left-4 ${placeholderRightInsetClassName} ${placeholderTopClassName} overflow-hidden text-left text-[16px] leading-6 text-zinc-400 sm:text-[14px] sm:leading-5`}
            >
              {isSending ? (
                <TextShimmer
                  as="span"
                  duration={1.6}
                  className="block truncate text-[15px] font-medium leading-6 tracking-[0.01em] sm:text-[13px] sm:leading-5 [--base-color:#71717a] [--base-gradient-color:#fafafa] dark:[--base-color:#52525b] dark:[--base-gradient-color:#ffffff]"
                >
                  {displayedPlaceholder}
                </TextShimmer>
              ) : (
                <AnimatePresence initial={false} mode="wait">
                  <motion.span
                    key={displayedPlaceholderAnimationKey}
                    initial={
                      shouldAnimateDisplayedPlaceholder
                        ? { opacity: 0, y: 8, filter: "blur(3px)" }
                        : false
                    }
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={
                      shouldAnimateDisplayedPlaceholder
                        ? { opacity: 0, y: -8, filter: "blur(3px)" }
                        : { opacity: 1 }
                    }
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="block truncate"
                  >
                    {displayedPlaceholder}
                  </motion.span>
                </AnimatePresence>
              )}
            </div>
          ) : null}

          <div className="absolute bottom-2 right-2 z-10 flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenComposerImagePicker}
              disabled={isComposerDisabled}
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-black/20 text-zinc-300 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.04] hover:text-white disabled:pointer-events-none disabled:border-white/5 disabled:text-zinc-600"
              aria-label="Attach image"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              ref={composerFileInputRef}
              type="file"
              accept={COMPOSER_IMAGE_ACCEPT}
              onChange={onComposerFileChange}
              className="sr-only"
              tabIndex={-1}
            />

            {isSending ? (
              <button
                type="button"
                onClick={onInterruptReply}
                className="group flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-black transition-all hover:-translate-y-0.5 hover:scale-105 active:scale-95"
                aria-label="Stop generating"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="group flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-black transition-all hover:-translate-y-0.5 hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:bg-white/10"
                aria-label="Send message"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="translate-x-[1px] translate-y-[-1px] transition-transform group-hover:translate-x-[2px] group-hover:translate-y-[-2px]"
                >
                  <path
                    d="M12 20L12 4M12 4L5 11M12 4L19 11"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {isSlashCommandPickerOpen ? (
          <div className="mt-2 rounded-2xl border border-white/10 bg-black/30 p-2">
            {filteredSlashCommands.length > 0 ? (
              filteredSlashCommands.map((command, index) => {
                const isSelected = index === highlightedCommandIndex;

                return (
                  <button
                    key={command.id}
                    type="button"
                    onClick={() => handleSelectSlashCommand(command.id)}
                    onMouseEnter={() => updateHighlightedCommandIndex(index)}
                    className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left transition ${
                      isSelected
                        ? "bg-white/[0.08] text-white"
                        : "text-zinc-300 hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >
                    <div>
                      <p className="text-xs font-semibold tracking-[0.14em] text-zinc-200">
                        {command.label}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-zinc-400">
                        {command.description}
                      </p>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-2xl px-3 py-2 text-xs text-zinc-500">
                No slash command matches `{dismissSlashCommandInput(`/${slashCommandQuery || ""}`)}`.
              </div>
            )}
          </div>
        ) : null}

        {composerImageAttachment ? (
          <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-3 py-2">
            <Image
              src={composerImageAttachment.objectUrl}
              alt={composerImageAttachment.name}
              width={40}
              height={40}
              sizes="40px"
              unoptimized
              className="h-10 w-10 rounded-xl object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {composerImageAttachment.name}
              </p>
              <p className="text-xs text-zinc-400">
                {formatComposerImageSize(composerImageAttachment.sizeBytes)}
              </p>
            </div>
            <button
              type="button"
              onClick={onRemoveComposerImageAttachment}
              className="cursor-pointer rounded-full border border-white/10 p-1.5 text-zinc-400 transition hover:border-white/20 hover:text-white"
              aria-label="Remove attached image"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {composerInlineNotice ? (
          <p className="mt-2 rounded-2xl border border-amber-200/15 bg-amber-200/[0.06] px-3 py-2 text-xs leading-5 text-amber-100">
            {composerInlineNotice}
          </p>
        ) : null}

      </div>
    </form>
  );
}
