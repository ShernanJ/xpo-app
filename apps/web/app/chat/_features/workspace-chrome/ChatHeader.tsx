"use client";

import Image from "next/image";
import { ArrowUpRight, Wrench } from "lucide-react";

import { useChatHeaderChrome } from "./ChatWorkspaceChromeContext";

export function ChatHeader() {
  const {
    toolsMenuRef,
    toolsMenuOpen,
    onToggleToolsMenu,
    onToggleSidebar,
    onOpenCompanionApp,
    tools,
  } = useChatHeaderChrome();

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
          <div ref={toolsMenuRef} className="relative">
            <button
              type="button"
              onClick={onToggleToolsMenu}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
                toolsMenuOpen
                  ? "border-white/20 bg-white/[0.06] text-white"
                  : "border-white/10 text-zinc-300 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <Wrench className="h-3.5 w-3.5" />
              <span>Tools</span>
            </button>
            {toolsMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.65rem)] z-30 w-56 rounded-3xl border border-white/10 bg-[#101010] p-2 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                {tools.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={item.onSelect}
                    className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm text-zinc-300 transition hover:bg-white/[0.05] hover:text-white"
                  >
                    <span>{item.label}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onOpenCompanionApp}
            className="hidden items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.04] md:inline-flex"
          >
            <span>Companion App</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
