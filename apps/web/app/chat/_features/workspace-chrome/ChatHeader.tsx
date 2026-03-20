"use client";

import Image from "next/image";
import { ArrowUpRight } from "lucide-react";

import { useChatHeaderChrome } from "./ChatWorkspaceChromeContext";

export function ChatHeader() {
  const { onToggleSidebar, onOpenCompanionApp } = useChatHeaderChrome();

  return (
    <header className="shrink-0 border-b border-white/10 px-4 py-3 sm:px-6">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-500 transition hover:bg-white/[0.04] hover:text-white md:hidden"
            aria-label="Toggle sidebar"
          >
            ≡
          </button>
        </div>
        <div className="flex justify-center">
          <Image
            src="/xpo-logo-white.webp"
            alt="Xpo"
            width={846}
            height={834}
            className="h-8 w-auto"
            priority
          />
        </div>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onOpenCompanionApp}
            className="hidden cursor-pointer items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.04] md:inline-flex"
          >
            <span>Companion App</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
