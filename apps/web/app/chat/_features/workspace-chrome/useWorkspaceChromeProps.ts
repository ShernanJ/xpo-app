"use client";

import type { ComponentProps } from "react";

import { ChatHeader } from "./ChatHeader";
import { ChatSidebar } from "./ChatSidebar";
import {
  resolveAccountAvatarFallback,
  resolveAccountProfileAriaLabel,
  resolveSidebarThreadSections,
  WORKSPACE_CHROME_TOOLS,
} from "./workspaceChromeViewState";

type ChatHeaderProps = ComponentProps<typeof ChatHeader>;
type ChatSidebarProps = ComponentProps<typeof ChatSidebar>;

interface UseWorkspaceChromePropsOptions {
  toolsMenuRef: ChatHeaderProps["toolsMenuRef"];
  toolsMenuOpen: boolean;
  setToolsMenuOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  setSidebarOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  setExtensionModalOpen: (value: boolean) => void;
  resetSourceMaterialDraft: () => void;
  openSourceMaterials: () => void;
  openDraftQueue: () => void;
  openAnalysis: () => void;
  openGrowthGuide: () => void;
  sidebarOpen: boolean;
  sidebarSearchQuery: string;
  setSidebarSearchQuery: (value: string) => void;
  closeSidebar: () => void;
  openSidebar: () => void;
  handleNewChat: () => void;
  chatThreads: Parameters<typeof resolveSidebarThreadSections>[0]["chatThreads"];
  hasWorkspace: boolean;
  activeThreadId: string | null;
  hoveredThreadId: string | null;
  setHoveredThreadId: (threadId: string | null) => void;
  menuOpenThreadId: string | null;
  setMenuOpenThreadId: (threadId: string | null) => void;
  editingThreadId: string | null;
  editingTitle: string;
  setEditingTitle: (value: string) => void;
  setEditingThreadId: (threadId: string | null) => void;
  handleRenameSubmit: (threadId: string) => Promise<void>;
  switchToThreadWithTransition: (threadId: string) => void;
  requestDeleteThread: (id: string, title: string) => void;
  openPreferences: () => void;
  openFeedbackDialog: () => void;
  threadMenuRef: ChatSidebarProps["threadMenuRef"];
  accountMenuRef: ChatSidebarProps["accountMenuRef"];
  accountMenuOpen: boolean;
  toggleAccountMenu: () => void;
  accountMenuVisible: boolean;
  monetizationEnabled: boolean;
  availableHandles: string[];
  accountName: string | null;
  switchActiveHandle: (handle: string) => void;
  openAddAccountModal: () => void;
  closeAccountMenu: () => void;
  setSettingsModalOpen: (value: boolean) => void;
  rateLimitsMenuOpen: boolean;
  setRateLimitsMenuOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  rateLimitWindowLabel: string;
  rateLimitsRemainingPercent: number | null;
  rateLimitResetLabel: string;
  showRateLimitUpgradeCta: boolean;
  rateLimitUpgradeLabel: string;
  setPricingModalOpen: (value: boolean) => void;
  avatarUrl: string | null;
  isVerifiedAccount: boolean;
  sessionEmail: string | null;
}

export function useWorkspaceChromeProps(options: UseWorkspaceChromePropsOptions) {
  const headerTools = WORKSPACE_CHROME_TOOLS.map((tool) => ({
    key: tool.key,
    label: tool.label,
    onSelect: () => {
      options.setToolsMenuOpen(false);
      if (tool.key === "source_materials") {
        options.resetSourceMaterialDraft();
        options.openSourceMaterials();
        return;
      }
      if (tool.key === "draft_review") {
        options.openDraftQueue();
        return;
      }
      if (tool.key === "profile_breakdown") {
        options.openAnalysis();
        return;
      }

      options.openGrowthGuide();
    },
  }));

  const chatHeaderProps: ChatHeaderProps = {
    toolsMenuRef: options.toolsMenuRef,
    toolsMenuOpen: options.toolsMenuOpen,
    onToggleToolsMenu: () => options.setToolsMenuOpen((current) => !current),
    onToggleSidebar: () => options.setSidebarOpen((current) => !current),
    onOpenCompanionApp: () => options.setExtensionModalOpen(true),
    tools: headerTools,
  };

  const sections = resolveSidebarThreadSections({
    hasWorkspace: options.hasWorkspace,
    chatThreads: options.chatThreads,
    activeThreadId: options.activeThreadId,
    sidebarSearchQuery: options.sidebarSearchQuery,
  });

  const accountAvatarFallback = resolveAccountAvatarFallback({
    accountName: options.accountName,
    sessionEmail: options.sessionEmail,
  });

  const accountProfileAriaLabel = resolveAccountProfileAriaLabel({
    accountName: options.accountName,
    sessionEmail: options.sessionEmail,
  });

  const chatSidebarProps: ChatSidebarProps = {
    sidebarOpen: options.sidebarOpen,
    sidebarSearchQuery: options.sidebarSearchQuery,
    onSidebarSearchQueryChange: options.setSidebarSearchQuery,
    onCloseSidebar: options.closeSidebar,
    onOpenSidebar: options.openSidebar,
    onNewChat: options.handleNewChat,
    sections,
    activeThreadId: options.activeThreadId,
    hoveredThreadId: options.hoveredThreadId,
    onHoveredThreadIdChange: options.setHoveredThreadId,
    menuOpenThreadId: options.menuOpenThreadId,
    onMenuOpenThreadIdChange: options.setMenuOpenThreadId,
    editingThreadId: options.editingThreadId,
    editingTitle: options.editingTitle,
    onEditingTitleChange: options.setEditingTitle,
    onEditingThreadIdChange: options.setEditingThreadId,
    onRenameSubmit: (threadId) => {
      void options.handleRenameSubmit(threadId);
    },
    onSwitchToThread: options.switchToThreadWithTransition,
    onRequestDeleteThread: options.requestDeleteThread,
    onOpenPreferences: options.openPreferences,
    onOpenFeedback: options.openFeedbackDialog,
    threadMenuRef: options.threadMenuRef,
    accountMenuRef: options.accountMenuRef,
    accountMenuOpen: options.accountMenuOpen,
    onToggleAccountMenu: options.toggleAccountMenu,
    accountMenuVisible: options.accountMenuVisible,
    monetizationEnabled: options.monetizationEnabled,
    availableHandles: options.availableHandles,
    accountName: options.accountName,
    canAddAccount: true,
    onSwitchActiveHandle: options.switchActiveHandle,
    onOpenAddAccount: options.openAddAccountModal,
    onOpenSettings: () => {
      options.closeAccountMenu();
      options.setSettingsModalOpen(true);
    },
    rateLimitsMenuOpen: options.rateLimitsMenuOpen,
    onToggleRateLimitsMenu: () =>
      options.setRateLimitsMenuOpen((current) => !current),
    rateLimitWindowLabel: options.rateLimitWindowLabel,
    rateLimitsRemainingPercent: options.rateLimitsRemainingPercent,
    rateLimitResetLabel: options.rateLimitResetLabel,
    showRateLimitUpgradeCta: options.showRateLimitUpgradeCta,
    rateLimitUpgradeLabel: options.rateLimitUpgradeLabel,
    onOpenPricing: () => {
      if (options.monetizationEnabled) {
        options.setPricingModalOpen(true);
      }
      options.closeAccountMenu();
    },
    avatarUrl: options.avatarUrl,
    accountAvatarFallback,
    accountProfileAriaLabel,
    isVerifiedAccount: options.isVerifiedAccount,
    sessionEmail: options.sessionEmail,
  };

  return {
    chatHeaderProps,
    chatSidebarProps,
  };
}
