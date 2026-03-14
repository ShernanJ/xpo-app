"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";

interface ChatComposerDockProps {
  isNewChatHero: boolean;
  isLeavingHero: boolean;
  showScrollToLatest: boolean;
  shouldCenterHero: boolean;
  onScrollToBottom: () => void;
  draftInput: string;
  onDraftInputChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isComposerDisabled: boolean;
  isSubmitDisabled: boolean;
  isSending: boolean;
}

export function ChatComposerDock(props: ChatComposerDockProps) {
  const {
    isNewChatHero,
    isLeavingHero,
    showScrollToLatest,
    shouldCenterHero,
    onScrollToBottom,
    draftInput,
    onDraftInputChange,
    onComposerKeyDown,
    onSubmit,
    isComposerDisabled,
    isSubmitDisabled,
    isSending,
  } = props;
  const composerChromeClassName =
    "relative flex w-full items-end overflow-hidden border border-white/10 bg-white/[0.06] backdrop-blur-[24px] shadow-[0_16px_48px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-500 ease-out focus-within:border-white/15 focus-within:ring-1 focus-within:ring-white/15";
  const dockComposerSurfaceClassName = `${composerChromeClassName} rounded-[1.12rem] p-1.5 sm:p-2`;
  const dockComposerWrapperClassName = `absolute inset-x-0 bottom-0 z-10 pb-[env(safe-area-inset-bottom)] transition-all duration-[720ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
    isNewChatHero || isLeavingHero
      ? "pointer-events-none -translate-y-[14.5rem] opacity-0 sm:-translate-y-[17rem]"
      : "pointer-events-auto translate-y-0 opacity-100"
  }`;

  return (
    <div className={dockComposerWrapperClassName}>
      <div className="mx-auto w-full max-w-4xl px-4 pb-6 pt-4 sm:px-6 sm:pb-8">
        {showScrollToLatest && !shouldCenterHero ? (
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={onScrollToBottom}
              className="group inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#0F0F0F]/90 text-zinc-300 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-white/20 hover:text-white"
              aria-label="Jump to latest message"
            >
              <ChevronDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
            </button>
          </div>
        ) : null}
        <form onSubmit={onSubmit}>
          <div className={dockComposerSurfaceClassName}>
            <textarea
              value={draftInput}
              onChange={(event) => onDraftInputChange(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder="What are we creating today?"
              disabled={isComposerDisabled}
              className="max-h-[180px] min-h-[44px] w-full resize-none bg-transparent px-4 py-3 pb-10 text-[14px] leading-5 text-white outline-none placeholder:text-zinc-400 disabled:opacity-50 sm:pr-14"
              rows={1}
            />
            <div className="absolute bottom-2.5 right-2.5 sm:bottom-3 sm:right-3">
              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="group flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition-all hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:bg-white/10 sm:h-9 sm:w-9"
                aria-label="Send message"
              >
                {isSending ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-zinc-800" />
                ) : (
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
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
