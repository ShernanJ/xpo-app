"use client";

import Image from "next/image";

import { useChatHeroCanvas } from "../chat-page/ChatCanvasContext";
import { ChatComposerSurface } from "./ChatComposerSurface";

export function ChatHero() {
  const {
    isVisible,
    avatarUrl,
    heroIdentityLabel,
    heroInitials,
    heroGreeting,
    isVerifiedAccount,
    isLeavingHero,
    heroQuickActions,
    onQuickAction,
    ...composerSurfaceProps
  } = useChatHeroCanvas();

  if (!isVisible) {
    return null;
  }

  const composerChromeClassName =
    "relative w-full overflow-hidden border border-white/10 bg-white/[0.06] backdrop-blur-[24px] shadow-[0_16px_48px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-500 ease-out focus-within:border-white/15 focus-within:ring-1 focus-within:ring-white/15";
  const heroInlineComposerSurfaceClassName = `${composerChromeClassName} rounded-[1.4rem] p-1.5 sm:p-2`;
  const heroProfileMotionClassName = `flex flex-col items-center gap-4 transition-all duration-500 ease-out ${
    isLeavingHero
      ? "-translate-y-8 scale-[0.97] opacity-0 blur-[2px]"
      : "translate-y-0 scale-100 opacity-100 blur-0"
  }`;
  const heroComposerMotionClassName = `mt-3 transition-all duration-[720ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
    isLeavingHero
      ? "translate-y-10 scale-[0.97] opacity-0 blur-[2px] pointer-events-none"
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

        <div className={heroComposerMotionClassName}>
          <ChatComposerSurface
            {...composerSurfaceProps}
            surfaceClassName={heroInlineComposerSurfaceClassName}
          />
        </div>

        <div className={`${heroChipsMotionClassName} mt-4`}>
          {heroQuickActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => onQuickAction(action)}
              disabled={composerSurfaceProps.isComposerDisabled}
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
