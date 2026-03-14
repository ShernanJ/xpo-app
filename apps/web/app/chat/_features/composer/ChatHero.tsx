"use client";

import type { FormEvent, KeyboardEvent } from "react";
import Image from "next/image";

import type { HeroQuickAction } from "./composerViewState";

interface ChatHeroProps {
  avatarUrl: string | null;
  heroIdentityLabel: string;
  heroInitials: string;
  heroGreeting: string;
  isVerifiedAccount: boolean;
  isLeavingHero: boolean;
  draftInput: string;
  onDraftInputChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isComposerDisabled: boolean;
  isSubmitDisabled: boolean;
  isSending: boolean;
  heroQuickActions: HeroQuickAction[];
  onQuickAction: (prompt: string) => void;
}

export function ChatHero(props: ChatHeroProps) {
  const {
    avatarUrl,
    heroIdentityLabel,
    heroInitials,
    heroGreeting,
    isVerifiedAccount,
    isLeavingHero,
    draftInput,
    onDraftInputChange,
    onComposerKeyDown,
    onSubmit,
    isComposerDisabled,
    isSubmitDisabled,
    isSending,
    heroQuickActions,
    onQuickAction,
  } = props;
  const composerChromeClassName =
    "relative flex w-full items-end overflow-hidden border border-white/10 bg-white/[0.06] backdrop-blur-[24px] shadow-[0_16px_48px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-500 ease-out focus-within:border-white/15 focus-within:ring-1 focus-within:ring-white/15";
  const heroInlineComposerSurfaceClassName = `${composerChromeClassName} rounded-[1.4rem] p-1.5 sm:p-2`;
  const heroProfileMotionClassName = `flex flex-col items-center gap-4 transition-all duration-500 ease-out ${
    isLeavingHero
      ? "-translate-y-8 scale-[0.97] opacity-0 blur-[2px]"
      : "translate-y-0 scale-100 opacity-100 blur-0"
  }`;
  const heroChipsMotionClassName = `flex flex-wrap items-center justify-center gap-2.5 transition-all duration-300 ease-out ${
    isLeavingHero ? "-translate-y-4 opacity-0 blur-[2px]" : "translate-y-0 opacity-100 blur-0"
  }`;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 py-10 text-center">
      <div className="w-full max-w-xl">
        <div className={heroProfileMotionClassName}>
          <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 shadow-[0_14px_42px_rgba(0,0,0,0.32)] sm:h-24 sm:w-24">
            {avatarUrl ? (
              <div
                className="h-full w-full bg-cover bg-center"
                style={{ backgroundImage: `url(${avatarUrl})` }}
                role="img"
                aria-label={`${heroIdentityLabel} profile photo`}
              />
            ) : (
              <span className="text-2xl font-semibold text-white">{heroInitials}</span>
            )}
          </div>

          <div className="flex items-center justify-center gap-2">
            <p className="text-xl font-semibold tracking-[-0.04em] text-white sm:text-3xl">
              {heroGreeting}
            </p>
            {isVerifiedAccount ? (
              <Image
                src="/x-verified.svg"
                alt="Verified account"
                width={18}
                height={18}
                className="h-4 w-4 shrink-0 sm:h-5 sm:w-5"
              />
            ) : null}
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-3">
          <div className={heroInlineComposerSurfaceClassName}>
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

        <div className={`${heroChipsMotionClassName} mt-4`}>
          {heroQuickActions.map((action) => (
            <button
              key={action.prompt}
              type="button"
              onClick={() => onQuickAction(action.prompt)}
              disabled={isComposerDisabled}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-zinc-300 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:text-zinc-600 sm:px-3.5 sm:text-[13px]"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
