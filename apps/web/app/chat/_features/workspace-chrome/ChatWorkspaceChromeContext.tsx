"use client";

import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
  type RefObject,
} from "react";

import {
  resolveAccountAvatarFallback,
  resolveAccountProfileAriaLabel,
  resolveSidebarThreadSections,
  WORKSPACE_CHROME_TOOLS,
} from "./workspaceChromeViewState";

type ThreadSections = Parameters<typeof resolveSidebarThreadSections>[0]["chatThreads"];

interface ChatWorkspaceChromeTool {
  key: string;
  label: string;
  onSelect: () => void;
}

interface ChatWorkspaceChromeState {
  toolsMenuOpen: boolean;
  tools: ChatWorkspaceChromeTool[];
  sidebarOpen: boolean;
  sidebarSearchQuery: string;
  sections: ReturnType<typeof resolveSidebarThreadSections>;
  activeThreadId: string | null;
  hoveredThreadId: string | null;
  menuOpenThreadId: string | null;
  editingThreadId: string | null;
  editingTitle: string;
  accountMenuOpen: boolean;
  accountMenuVisible: boolean;
  monetizationEnabled: boolean;
  availableHandles: string[];
  accountName: string | null;
  canAddAccount: boolean;
  rateLimitsMenuOpen: boolean;
  rateLimitWindowLabel: string;
  rateLimitsRemainingPercent: number | null;
  rateLimitResetLabel: string;
  showRateLimitUpgradeCta: boolean;
  rateLimitUpgradeLabel: string;
  avatarUrl: string | null;
  accountAvatarFallback: string;
  accountProfileAriaLabel: string;
  isVerifiedAccount: boolean;
  sessionEmail: string | null;
}

interface ChatWorkspaceChromeActions {
  toggleToolsMenu: () => void;
  toggleSidebar: () => void;
  openCompanionApp: () => void;
  setSidebarSearchQuery: (value: string) => void;
  closeSidebar: () => void;
  openSidebar: () => void;
  newChat: () => void;
  setHoveredThreadId: (threadId: string | null) => void;
  setMenuOpenThreadId: (threadId: string | null) => void;
  setEditingTitle: (value: string) => void;
  setEditingThreadId: (threadId: string | null) => void;
  renameThread: (threadId: string) => void;
  switchToThread: (threadId: string) => void;
  requestDeleteThread: (id: string, title: string) => void;
  openPreferences: () => void;
  openFeedback: () => void;
  toggleAccountMenu: () => void;
  switchActiveHandle: (handle: string) => void;
  openAddAccount: () => void;
  openSettings: () => void;
  toggleRateLimitsMenu: () => void;
  openPricing: () => void;
}

interface ChatWorkspaceChromeMeta {
  toolsMenuRef: RefObject<HTMLDivElement | null>;
  threadMenuRef: RefObject<HTMLDivElement | null>;
  accountMenuRef: RefObject<HTMLDivElement | null>;
}

interface ChatWorkspaceChromeContextValue {
  state: ChatWorkspaceChromeState;
  actions: ChatWorkspaceChromeActions;
  meta: ChatWorkspaceChromeMeta;
}

export interface ChatWorkspaceChromeProviderProps {
  toolsMenuRef: RefObject<HTMLDivElement | null>;
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
  chatThreads: ThreadSections;
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
  threadMenuRef: RefObject<HTMLDivElement | null>;
  accountMenuRef: RefObject<HTMLDivElement | null>;
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

const ChatWorkspaceChromeContext =
  createContext<ChatWorkspaceChromeContextValue | null>(null);

function useChatWorkspaceChromeContext() {
  const context = useContext(ChatWorkspaceChromeContext);

  if (!context) {
    throw new Error(
      "Chat workspace chrome components must be rendered inside ChatWorkspaceChromeProvider.",
    );
  }

  return context;
}

export function ChatWorkspaceChromeProvider(
  props: PropsWithChildren<ChatWorkspaceChromeProviderProps>,
) {
  const {
    children,
    toolsMenuRef,
    toolsMenuOpen,
    setToolsMenuOpen,
    setSidebarOpen,
    setExtensionModalOpen,
    resetSourceMaterialDraft,
    openSourceMaterials,
    openDraftQueue,
    openAnalysis,
    openGrowthGuide,
    sidebarOpen,
    setSidebarSearchQuery,
    closeSidebar,
    openSidebar,
    handleNewChat,
    chatThreads,
    hasWorkspace,
    activeThreadId,
    hoveredThreadId,
    setHoveredThreadId,
    menuOpenThreadId,
    setMenuOpenThreadId,
    editingThreadId,
    editingTitle,
    setEditingTitle,
    setEditingThreadId,
    handleRenameSubmit,
    switchToThreadWithTransition,
    requestDeleteThread,
    openPreferences,
    openFeedbackDialog,
    threadMenuRef,
    accountMenuRef,
    accountMenuOpen,
    toggleAccountMenu,
    accountMenuVisible,
    monetizationEnabled,
    availableHandles,
    sidebarSearchQuery,
    switchActiveHandle,
    openAddAccountModal,
    closeAccountMenu,
    setSettingsModalOpen,
    rateLimitsMenuOpen,
    setRateLimitsMenuOpen,
    rateLimitWindowLabel,
    rateLimitsRemainingPercent,
    rateLimitResetLabel,
    showRateLimitUpgradeCta,
    rateLimitUpgradeLabel,
    setPricingModalOpen,
    accountName,
    avatarUrl,
    isVerifiedAccount,
    sessionEmail,
  } = props;

  const tools = useMemo(
    () =>
      WORKSPACE_CHROME_TOOLS.map((tool) => ({
        key: tool.key,
        label: tool.label,
        onSelect: () => {
          setToolsMenuOpen(false);
          if (tool.key === "source_materials") {
            resetSourceMaterialDraft();
            openSourceMaterials();
            return;
          }
          if (tool.key === "draft_review") {
            openDraftQueue();
            return;
          }
          if (tool.key === "profile_breakdown") {
            openAnalysis();
            return;
          }

          openGrowthGuide();
        },
      })),
    [
      openAnalysis,
      openDraftQueue,
      openGrowthGuide,
      openSourceMaterials,
      resetSourceMaterialDraft,
      setToolsMenuOpen,
    ],
  );

  const sections = useMemo(
    () =>
      resolveSidebarThreadSections({
        hasWorkspace,
        chatThreads,
        activeThreadId,
        sidebarSearchQuery,
      }),
    [activeThreadId, chatThreads, hasWorkspace, sidebarSearchQuery],
  );

  const accountAvatarFallback = useMemo(
    () =>
      resolveAccountAvatarFallback({
        accountName,
        sessionEmail,
      }),
    [accountName, sessionEmail],
  );

  const accountProfileAriaLabel = useMemo(
    () =>
      resolveAccountProfileAriaLabel({
        accountName,
        sessionEmail,
      }),
    [accountName, sessionEmail],
  );

  const state = useMemo<ChatWorkspaceChromeState>(
    () => ({
      toolsMenuOpen,
      tools,
      sidebarOpen,
      sidebarSearchQuery,
      sections,
      activeThreadId,
      hoveredThreadId,
      menuOpenThreadId,
      editingThreadId,
      editingTitle,
      accountMenuOpen,
      accountMenuVisible,
      monetizationEnabled,
      availableHandles,
      accountName,
      canAddAccount: true,
      rateLimitsMenuOpen,
      rateLimitWindowLabel,
      rateLimitsRemainingPercent,
      rateLimitResetLabel,
      showRateLimitUpgradeCta,
      rateLimitUpgradeLabel,
      avatarUrl,
      accountAvatarFallback,
      accountProfileAriaLabel,
      isVerifiedAccount,
      sessionEmail,
    }),
    [
      accountMenuOpen,
      accountMenuVisible,
      accountName,
      accountAvatarFallback,
      accountProfileAriaLabel,
      activeThreadId,
      avatarUrl,
      availableHandles,
      editingThreadId,
      editingTitle,
      hoveredThreadId,
      isVerifiedAccount,
      menuOpenThreadId,
      monetizationEnabled,
      rateLimitResetLabel,
      rateLimitUpgradeLabel,
      rateLimitWindowLabel,
      rateLimitsMenuOpen,
      rateLimitsRemainingPercent,
      sessionEmail,
      showRateLimitUpgradeCta,
      sidebarOpen,
      sidebarSearchQuery,
      sections,
      tools,
      toolsMenuOpen,
    ],
  );

  const actions = useMemo<ChatWorkspaceChromeActions>(
    () => ({
      toggleToolsMenu: () => setToolsMenuOpen((current) => !current),
      toggleSidebar: () => setSidebarOpen((current) => !current),
      openCompanionApp: () => setExtensionModalOpen(true),
      setSidebarSearchQuery,
      closeSidebar,
      openSidebar,
      newChat: handleNewChat,
      setHoveredThreadId,
      setMenuOpenThreadId,
      setEditingTitle,
      setEditingThreadId,
      renameThread: (threadId) => {
        void handleRenameSubmit(threadId);
      },
      switchToThread: switchToThreadWithTransition,
      requestDeleteThread,
      openPreferences,
      openFeedback: openFeedbackDialog,
      toggleAccountMenu,
      switchActiveHandle,
      openAddAccount: openAddAccountModal,
      openSettings: () => {
        closeAccountMenu();
        setSettingsModalOpen(true);
      },
      toggleRateLimitsMenu: () => setRateLimitsMenuOpen((current) => !current),
      openPricing: () => {
        if (monetizationEnabled) {
          setPricingModalOpen(true);
        }
        closeAccountMenu();
      },
    }),
    [
      closeAccountMenu,
      closeSidebar,
      handleNewChat,
      handleRenameSubmit,
      monetizationEnabled,
      openAddAccountModal,
      openFeedbackDialog,
      openPreferences,
      openSidebar,
      requestDeleteThread,
      setEditingThreadId,
      setEditingTitle,
      setExtensionModalOpen,
      setHoveredThreadId,
      setMenuOpenThreadId,
      setPricingModalOpen,
      setRateLimitsMenuOpen,
      setSettingsModalOpen,
      setSidebarOpen,
      setSidebarSearchQuery,
      setToolsMenuOpen,
      switchActiveHandle,
      switchToThreadWithTransition,
      toggleAccountMenu,
    ],
  );

  const meta = useMemo<ChatWorkspaceChromeMeta>(
    () => ({
      toolsMenuRef,
      threadMenuRef,
      accountMenuRef,
    }),
    [accountMenuRef, threadMenuRef, toolsMenuRef],
  );

  const value = useMemo<ChatWorkspaceChromeContextValue>(
    () => ({
      state,
      actions,
      meta,
    }),
    [actions, meta, state],
  );

  return (
    <ChatWorkspaceChromeContext.Provider value={value}>
      {children}
    </ChatWorkspaceChromeContext.Provider>
  );
}

export function useChatHeaderChrome() {
  const { state, actions, meta } = useChatWorkspaceChromeContext();

  return {
    toolsMenuRef: meta.toolsMenuRef,
    toolsMenuOpen: state.toolsMenuOpen,
    tools: state.tools,
    onToggleToolsMenu: actions.toggleToolsMenu,
    onToggleSidebar: actions.toggleSidebar,
    onOpenCompanionApp: actions.openCompanionApp,
  };
}

export function useChatSidebarChrome() {
  const { state, actions, meta } = useChatWorkspaceChromeContext();

  return {
    sidebarOpen: state.sidebarOpen,
    sidebarSearchQuery: state.sidebarSearchQuery,
    sections: state.sections,
    activeThreadId: state.activeThreadId,
    hoveredThreadId: state.hoveredThreadId,
    menuOpenThreadId: state.menuOpenThreadId,
    editingThreadId: state.editingThreadId,
    editingTitle: state.editingTitle,
    accountMenuOpen: state.accountMenuOpen,
    accountMenuVisible: state.accountMenuVisible,
    monetizationEnabled: state.monetizationEnabled,
    availableHandles: state.availableHandles,
    accountName: state.accountName,
    canAddAccount: state.canAddAccount,
    rateLimitsMenuOpen: state.rateLimitsMenuOpen,
    rateLimitWindowLabel: state.rateLimitWindowLabel,
    rateLimitsRemainingPercent: state.rateLimitsRemainingPercent,
    rateLimitResetLabel: state.rateLimitResetLabel,
    showRateLimitUpgradeCta: state.showRateLimitUpgradeCta,
    rateLimitUpgradeLabel: state.rateLimitUpgradeLabel,
    avatarUrl: state.avatarUrl,
    accountAvatarFallback: state.accountAvatarFallback,
    accountProfileAriaLabel: state.accountProfileAriaLabel,
    isVerifiedAccount: state.isVerifiedAccount,
    sessionEmail: state.sessionEmail,
    onSidebarSearchQueryChange: actions.setSidebarSearchQuery,
    onCloseSidebar: actions.closeSidebar,
    onOpenSidebar: actions.openSidebar,
    onNewChat: actions.newChat,
    onHoveredThreadIdChange: actions.setHoveredThreadId,
    onMenuOpenThreadIdChange: actions.setMenuOpenThreadId,
    onEditingTitleChange: actions.setEditingTitle,
    onEditingThreadIdChange: actions.setEditingThreadId,
    onRenameSubmit: actions.renameThread,
    onSwitchToThread: actions.switchToThread,
    onRequestDeleteThread: actions.requestDeleteThread,
    onOpenPreferences: actions.openPreferences,
    onOpenFeedback: actions.openFeedback,
    threadMenuRef: meta.threadMenuRef,
    accountMenuRef: meta.accountMenuRef,
    onToggleAccountMenu: actions.toggleAccountMenu,
    onSwitchActiveHandle: actions.switchActiveHandle,
    onOpenAddAccount: actions.openAddAccount,
    onOpenSettings: actions.openSettings,
    onToggleRateLimitsMenu: actions.toggleRateLimitsMenu,
    onOpenPricing: actions.openPricing,
  };
}
