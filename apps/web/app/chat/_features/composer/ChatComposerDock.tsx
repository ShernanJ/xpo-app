"use client";

import { ChevronDown } from "lucide-react";

import { useChatComposerDockCanvas } from "../chat-page/ChatCanvasContext";
import { ChatComposerSurface } from "./ChatComposerSurface";

export function ChatComposerDock() {
  const {
    isNewChatHero,
    isLeavingHero,
    showScrollToLatest,
    shouldCenterHero,
    onScrollToBottom,
    ...composerSurfaceProps
  } = useChatComposerDockCanvas();
  const composerChromeClassName =
    "relative w-full overflow-hidden border border-white/10 bg-white/[0.06] backdrop-blur-[24px] shadow-[0_16px_48px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-500 ease-out focus-within:border-white/15 focus-within:ring-1 focus-within:ring-white/15";
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
        <ChatComposerSurface
          {...composerSurfaceProps}
          surfaceClassName={dockComposerSurfaceClassName}
        />
        <p className="mt-2 px-1 text-center text-[11px] leading-4 text-zinc-500">
          Xpo can make mistakes. Your corrections help it improve.
        </p>
      </div>
    </div>
  );
}
