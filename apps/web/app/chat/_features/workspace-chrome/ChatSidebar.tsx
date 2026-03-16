"use client";

import type { KeyboardEvent } from "react";
import Image from "next/image";
import { Edit3, MessageSquareText, MoreVertical, Settings2, Trash2 } from "lucide-react";

import { AccountMenuPanel } from "./AccountMenuPanel";
import { useChatSidebarChrome } from "./ChatWorkspaceChromeContext";

export function ChatSidebar() {
  const {
    sidebarOpen,
    sidebarSearchQuery,
    onSidebarSearchQueryChange,
    onCloseSidebar,
    onOpenSidebar,
    onNewChat,
    sections,
    activeThreadId,
    hoveredThreadId,
    onHoveredThreadIdChange,
    menuOpenThreadId,
    onMenuOpenThreadIdChange,
    editingThreadId,
    editingTitle,
    onEditingTitleChange,
    onEditingThreadIdChange,
    onRenameSubmit,
    onSwitchToThread,
    onRequestDeleteThread,
    onOpenPreferences,
    onOpenFeedback,
    threadMenuRef,
    accountMenuRef,
    accountMenuOpen,
    onToggleAccountMenu,
    accountMenuVisible,
    monetizationEnabled,
    availableHandles,
    accountName,
    canAddAccount,
    onSwitchActiveHandle,
    onOpenAddAccount,
    onOpenSettings,
    rateLimitsMenuOpen,
    onToggleRateLimitsMenu,
    rateLimitWindowLabel,
    rateLimitsRemainingPercent,
    rateLimitResetLabel,
    showRateLimitUpgradeCta,
    rateLimitUpgradeLabel,
    onOpenPricing,
    avatarUrl,
    accountAvatarFallback,
    accountProfileAriaLabel,
    isVerifiedAccount,
    sessionEmail,
  } = useChatSidebarChrome();

  const handleThreadKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    sectionLabel: string,
    threadId: string,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    if (sectionLabel === "Chats" && threadId !== "current-workspace") {
      onSwitchToThread(threadId);
    }
  };

  return (
    <>
      {sidebarOpen ? (
        <button
          type="button"
          onClick={onCloseSidebar}
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          aria-label="Close sidebar overlay"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex min-h-0 shrink-0 flex-col overflow-hidden bg-[#050505] md:sticky md:top-0 md:bg-[#050505] [&_button:not(:disabled)]:cursor-pointer [&_[role=button]]:cursor-pointer transition-[width,transform] duration-300 ${
          sidebarOpen
            ? "w-[18.5rem] border-r border-white/10"
            : "w-[18.5rem] -translate-x-full border-r border-white/10 md:w-0 md:translate-x-0 md:border-r-0 md:bg-transparent"
        }`}
      >
        {sidebarOpen ? (
          <div className="flex items-center px-3 py-4">
            <button
              type="button"
              onClick={onCloseSidebar}
              className="flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-500 transition hover:bg-white/[0.04] hover:text-white"
              aria-label="Collapse sidebar"
            >
              ×
            </button>
          </div>
        ) : null}

        {sidebarOpen ? (
          <>
            <div className="px-3">
              <div className="flex items-center gap-2 rounded-2xl bg-white/[0.03] px-3 py-3">
                <span className="text-sm text-zinc-500">⌕</span>
                <input
                  type="text"
                  value={sidebarSearchQuery}
                  onChange={(event) => onSidebarSearchQueryChange(event.target.value)}
                  placeholder="Search chats"
                  className="w-full bg-transparent text-sm text-zinc-300 outline-none placeholder:text-zinc-500"
                />
              </div>
            </div>

            <div className="px-3 pt-2">
              <button
                type="button"
                onClick={onNewChat}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/[0.03]"
              >
                <span className="text-sm text-zinc-400">✎</span>
                <span className="text-sm font-medium text-white">New Chat</span>
              </button>
            </div>

            <div className="px-3 pt-1">
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={onOpenPreferences}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-zinc-500 transition hover:bg-white/[0.03] hover:text-zinc-200"
                >
                  <Settings2 className="h-4 w-4 shrink-0" />
                  <span>Preferences</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenFeedback}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-zinc-500 transition hover:bg-white/[0.03] hover:text-zinc-200"
                >
                  <MessageSquareText className="h-4 w-4 shrink-0" />
                  <span>Feedback</span>
                </button>
              </div>
            </div>
          </>
        ) : null}

        <div className="flex-1 overflow-y-auto px-3 py-4">
          {sidebarOpen ? (
            <div className="space-y-6">
              {sections.map((section) => (
                <div key={section.section} className="space-y-2">
                  <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
                    {section.section}
                  </p>
                  {section.items.map((item) => (
                    <div
                      key={item.id}
                      className="relative"
                      onMouseEnter={() => onHoveredThreadIdChange(item.id)}
                      onMouseLeave={() => onHoveredThreadIdChange(null)}
                    >
                      {editingThreadId === item.id ? (
                        <div
                          className={`flex w-full items-center rounded-2xl px-2 py-2 ${
                            activeThreadId === item.id ? "bg-white/[0.04]" : "hover:bg-white/[0.03]"
                          }`}
                        >
                          <input
                            autoFocus
                            value={editingTitle}
                            onChange={(event) => onEditingTitleChange(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                onRenameSubmit(item.id);
                              }
                              if (event.key === "Escape") {
                                onEditingThreadIdChange(null);
                              }
                            }}
                            onBlur={() => onRenameSubmit(item.id)}
                            className="w-full bg-transparent text-sm leading-6 text-zinc-200 outline-none"
                          />
                        </div>
                      ) : (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (section.section === "Chats" && item.id !== "current-workspace") {
                              onSwitchToThread(item.id);
                            }
                          }}
                          onKeyDown={(event) =>
                            handleThreadKeyDown(event, section.section, item.id)
                          }
                          className={`group block w-full cursor-pointer rounded-2xl px-2 py-2 text-left transition hover:bg-white/[0.03] ${
                            activeThreadId === item.id ? "bg-white/[0.04]" : ""
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1 pr-1">
                              <span className="line-clamp-2 text-sm leading-6 text-zinc-200">
                                {item.label}
                              </span>
                              <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                                {item.meta}
                              </span>
                            </div>

                            {section.section === "Chats" && item.id !== "current-workspace" ? (
                              <div
                                className="relative w-8 flex-shrink-0 pt-1"
                                ref={menuOpenThreadId === item.id ? threadMenuRef : null}
                              >
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onMenuOpenThreadIdChange(
                                      menuOpenThreadId === item.id ? null : item.id,
                                    );
                                  }}
                                  className={`ml-auto flex h-6 w-6 items-center justify-center rounded p-1 text-zinc-500 transition hover:bg-white/10 hover:text-white ${
                                    hoveredThreadId === item.id || menuOpenThreadId === item.id
                                      ? "pointer-events-auto opacity-100"
                                      : "pointer-events-none opacity-0"
                                  }`}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </button>

                                {menuOpenThreadId === item.id ? (
                                  <div className="absolute right-0 top-full z-50 mt-1 w-32 rounded-lg border border-white/10 bg-zinc-900 p-1 shadow-xl">
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onEditingTitleChange(item.label);
                                        onEditingThreadIdChange(item.id);
                                        onMenuOpenThreadIdChange(null);
                                      }}
                                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-white"
                                    >
                                      <Edit3 className="h-3 w-3" />
                                      Rename
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onRequestDeleteThread(item.id, item.label);
                                      }}
                                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                      Delete
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {section.items.length === 0 && sidebarSearchQuery.trim() ? (
                    <div className="rounded-2xl px-2 py-3 text-sm text-zinc-500">
                      No matching chats
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full" />
          )}
        </div>

        {sidebarOpen ? (
          <div ref={accountMenuRef} className="relative border-t border-white/10 px-3 py-4">
            <button
              type="button"
              onClick={onToggleAccountMenu}
              className={`flex w-full items-center justify-between rounded-xl p-2 transition ${
                accountMenuOpen ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
              }`}
              aria-label="Open account menu"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-sm font-bold text-black">
                  {avatarUrl ? (
                    <div
                      className="h-full w-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${avatarUrl})` }}
                      role="img"
                      aria-label={accountProfileAriaLabel}
                    />
                  ) : (
                    accountAvatarFallback
                  )}
                </div>
                <div className="flex flex-col items-start overflow-hidden text-left">
                  <span className="flex w-full items-center gap-1 truncate text-xs font-semibold text-zinc-100">
                    <span className="truncate">
                      {accountName ? `@${accountName}` : (sessionEmail ?? "Loading...")}
                    </span>
                    {isVerifiedAccount ? (
                      <Image
                        src="/x-verified.svg"
                        alt="Verified account"
                        width={14}
                        height={14}
                        className="h-3.5 w-3.5 shrink-0"
                      />
                    ) : null}
                  </span>
                  {accountName ? (
                    <span className="w-full truncate text-[10px] text-zinc-500">
                      {sessionEmail ?? ""}
                    </span>
                  ) : null}
                </div>
              </div>
              <span
                className={`h-4 w-4 shrink-0 text-zinc-500 transition-all duration-300 ${
                  accountMenuOpen ? "rotate-0 text-zinc-300" : "rotate-180"
                }`}
              >
                ⌃
              </span>
            </button>

            <AccountMenuPanel
              className="absolute bottom-full left-2 right-2 z-20 rounded-2xl border border-white/10 bg-zinc-950/95 p-1 shadow-2xl backdrop-blur-xl"
              accountMenuVisible={accountMenuVisible}
              accountMenuOpen={accountMenuOpen}
              monetizationEnabled={monetizationEnabled}
              availableHandles={availableHandles}
              accountName={accountName}
              canAddAccount={canAddAccount}
              onSwitchActiveHandle={onSwitchActiveHandle}
              onOpenAddAccount={onOpenAddAccount}
              onOpenSettings={onOpenSettings}
              rateLimitsMenuOpen={rateLimitsMenuOpen}
              onToggleRateLimitsMenu={onToggleRateLimitsMenu}
              rateLimitWindowLabel={rateLimitWindowLabel}
              rateLimitsRemainingPercent={rateLimitsRemainingPercent}
              rateLimitResetLabel={rateLimitResetLabel}
              showRateLimitUpgradeCta={showRateLimitUpgradeCta}
              rateLimitUpgradeLabel={rateLimitUpgradeLabel}
              onOpenPricing={onOpenPricing}
            />
          </div>
        ) : null}
      </aside>

      {!sidebarOpen ? (
        <>
          <div className="pointer-events-none absolute left-4 top-4 z-20 hidden md:block">
            <button
              type="button"
              onClick={onOpenSidebar}
              className="pointer-events-auto flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl text-zinc-500 transition hover:bg-white/[0.04] hover:text-white"
              aria-label="Expand sidebar"
            >
              ≡
            </button>
          </div>

          <div ref={accountMenuRef} className="absolute bottom-4 left-4 z-20 hidden md:block">
            <button
              type="button"
              onClick={onToggleAccountMenu}
              className={`flex h-11 w-11 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-white text-sm font-bold text-black shadow-[0_10px_28px_rgba(0,0,0,0.35)] transition-all duration-300 hover:opacity-85 ${
                accountMenuOpen ? "scale-[1.04] ring-2 ring-white/30" : "scale-100 ring-0"
              }`}
              aria-label="Open account menu"
            >
              {avatarUrl ? (
                <div
                  className="h-full w-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${avatarUrl})` }}
                  role="img"
                  aria-label={accountProfileAriaLabel}
                />
              ) : (
                accountAvatarFallback
              )}
            </button>
            <AccountMenuPanel
              className="absolute bottom-full left-0 z-20 w-64 rounded-2xl border border-white/10 bg-zinc-950/95 p-1 shadow-2xl backdrop-blur-xl"
              accountMenuVisible={accountMenuVisible}
              accountMenuOpen={accountMenuOpen}
              monetizationEnabled={monetizationEnabled}
              availableHandles={availableHandles}
              accountName={accountName}
              canAddAccount={canAddAccount}
              onSwitchActiveHandle={onSwitchActiveHandle}
              onOpenAddAccount={onOpenAddAccount}
              onOpenSettings={onOpenSettings}
              rateLimitsMenuOpen={rateLimitsMenuOpen}
              onToggleRateLimitsMenu={onToggleRateLimitsMenu}
              rateLimitWindowLabel={rateLimitWindowLabel}
              rateLimitsRemainingPercent={rateLimitsRemainingPercent}
              rateLimitResetLabel={rateLimitResetLabel}
              showRateLimitUpgradeCta={showRateLimitUpgradeCta}
              rateLimitUpgradeLabel={rateLimitUpgradeLabel}
              onOpenPricing={onOpenPricing}
            />
          </div>
        </>
      ) : null}
    </>
  );
}
