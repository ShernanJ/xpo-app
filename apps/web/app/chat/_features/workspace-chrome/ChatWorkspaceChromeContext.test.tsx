import type { ImgHTMLAttributes } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { ChatWorkspaceCanvas } from "../chat-page/ChatWorkspaceCanvas";
import type { ChatWorkspaceChromeProviderProps } from "./ChatWorkspaceChromeContext";
import { ChatHeader } from "./ChatHeader";
import { ChatWorkspaceChromeProvider } from "./ChatWorkspaceChromeContext";
import { ChatSidebar } from "./ChatSidebar";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

function buildWorkspaceChromeProps(
  overrides: Partial<ChatWorkspaceChromeProviderProps> = {},
): ChatWorkspaceChromeProviderProps {
  return {
    toolsMenuRef: { current: null },
    toolsMenuOpen: true,
    setToolsMenuOpen: vi.fn(),
    setSidebarOpen: vi.fn(),
    setExtensionModalOpen: vi.fn(),
    resetSourceMaterialDraft: vi.fn(),
    openSourceMaterials: vi.fn(),
    openDraftQueue: vi.fn(),
    openAnalysis: vi.fn(),
    openGrowthGuide: vi.fn(),
    sidebarOpen: true,
    sidebarSearchQuery: "",
    setSidebarSearchQuery: vi.fn(),
    closeSidebar: vi.fn(),
    openSidebar: vi.fn(),
    handleNewChat: vi.fn(),
    chatThreads: [
      {
        id: "thread-1",
        title: "Thread one",
        updatedAt: "2026-03-15T12:00:00.000Z",
      },
    ],
    hasWorkspace: true,
    activeThreadId: "thread-1",
    hoveredThreadId: "thread-1",
    setHoveredThreadId: vi.fn(),
    menuOpenThreadId: "thread-1",
    setMenuOpenThreadId: vi.fn(),
    editingThreadId: null,
    editingTitle: "",
    setEditingTitle: vi.fn(),
    setEditingThreadId: vi.fn(),
    handleRenameSubmit: vi.fn().mockResolvedValue(undefined),
    switchToThreadWithTransition: vi.fn(),
    requestDeleteThread: vi.fn(),
    openPreferences: vi.fn(),
    openFeedbackDialog: vi.fn(),
    threadMenuRef: { current: null },
    accountMenuRef: { current: null },
    accountMenuOpen: true,
    toggleAccountMenu: vi.fn(),
    accountMenuVisible: true,
    monetizationEnabled: true,
    availableHandles: ["stanley", "growthmode"],
    accountName: "stanley",
    switchActiveHandle: vi.fn(),
    openAddAccountModal: vi.fn(),
    closeAccountMenu: vi.fn(),
    setSettingsModalOpen: vi.fn(),
    rateLimitsMenuOpen: true,
    setRateLimitsMenuOpen: vi.fn(),
    rateLimitWindowLabel: "Daily",
    rateLimitsRemainingPercent: 80,
    rateLimitResetLabel: "Mar 20, 12:00 PM",
    showRateLimitUpgradeCta: true,
    rateLimitUpgradeLabel: "Upgrade to Pro",
    setPricingModalOpen: vi.fn(),
    avatarUrl: null,
    isVerifiedAccount: true,
    sessionEmail: "stanley@example.com",
    ...overrides,
  };
}

function renderChrome(
  overrides: Partial<ChatWorkspaceChromeProviderProps> = {},
) {
  const props = buildWorkspaceChromeProps(overrides);

  render(
    <ChatWorkspaceChromeProvider {...props}>
      <ChatHeader />
      <ChatSidebar />
    </ChatWorkspaceChromeProvider>,
  );

  return props;
}

test("wires header tool actions through the workspace chrome provider", async () => {
  const user = userEvent.setup();
  const props = renderChrome();

  await user.click(screen.getByRole("button", { name: "Saved context" }));

  expect(props.setToolsMenuOpen).toHaveBeenCalledWith(false);
  expect(props.resetSourceMaterialDraft).toHaveBeenCalledTimes(1);
  expect(props.openSourceMaterials).toHaveBeenCalledTimes(1);
});

test("wires sidebar and account actions through the workspace chrome provider", async () => {
  const user = userEvent.setup();
  const props = renderChrome();

  fireEvent.change(screen.getByPlaceholderText("Search chats"), {
    target: { value: "plan" },
  });
  expect(props.setSidebarSearchQuery).toHaveBeenCalledWith("plan");

  await user.click(screen.getByRole("button", { name: /New Chat/i }));
  await user.click(screen.getByRole("button", { name: "Preferences" }));
  await user.click(screen.getByRole("button", { name: "Feedback" }));
  await user.click(screen.getByRole("button", { name: "Add Account" }));
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(screen.getByRole("button", { name: "Upgrade to Pro" }));

  expect(props.handleNewChat).toHaveBeenCalledTimes(1);
  expect(props.openPreferences).toHaveBeenCalledTimes(1);
  expect(props.openFeedbackDialog).toHaveBeenCalledTimes(1);
  expect(props.openAddAccountModal).toHaveBeenCalledTimes(1);
  expect(props.closeAccountMenu).toHaveBeenCalledTimes(2);
  expect(props.setSettingsModalOpen).toHaveBeenCalledWith(true);
  expect(props.setPricingModalOpen).toHaveBeenCalledWith(true);
});

test("wires thread rename and delete actions through the workspace chrome provider", async () => {
  const user = userEvent.setup();
  const props = renderChrome();

  await user.click(screen.getByRole("button", { name: "Rename" }));
  await user.click(screen.getByRole("button", { name: "Delete" }));

  expect(props.setEditingTitle).toHaveBeenCalledWith("Thread one");
  expect(props.setEditingThreadId).toHaveBeenCalledWith("thread-1");
  expect(props.setMenuOpenThreadId).toHaveBeenCalledWith(null);
  expect(props.requestDeleteThread).toHaveBeenCalledWith("thread-1", "Thread one");
});

test("renders header and sidebar inside the workspace chrome provider boundary", () => {
  const props = buildWorkspaceChromeProps();

  render(
    <ChatWorkspaceCanvas
      workspaceChromeProps={props}
      canvasProps={{
        threadScrollRef: { current: null },
        threadCanvasClassName: "",
        threadCanvasTransitionClassName: "",
        threadContentTransitionClassName: "",
        isLoading: false,
        isWorkspaceInitializing: false,
        hasContext: true,
        hasContract: true,
        errorMessage: null,
        statusMessage: null,
        showBillingWarningBanner: false,
        billingWarningLevel: null,
        billingCreditsLabel: "",
        onOpenPricing: vi.fn(),
        onDismissBillingWarning: vi.fn(),
        isHeroVisible: false,
        avatarUrl: null,
        heroIdentityLabel: "Stanley",
        heroInitials: "S",
        heroGreeting: "What are we making?",
        isVerifiedAccount: true,
        isLeavingHero: false,
        composerMode: null,
        draftInput: "",
        activePlaceholder: "write me a post",
        placeholderAnimationKey: "0:write me a post",
        shouldAnimatePlaceholder: false,
        slashCommands: [],
        slashCommandQuery: null,
        isSlashCommandPickerOpen: false,
        composerInlineNotice: null,
        composerImageAttachment: null,
        composerFileInputRef: { current: null },
        onDraftInputChange: vi.fn(),
        onCancelComposerMode: vi.fn(),
        onDismissSlashCommandPicker: vi.fn(),
        onComposerKeyDown: vi.fn(),
        onComposerSubmit: vi.fn(),
        onComposerFileChange: vi.fn(),
        onInterruptReply: vi.fn(),
        isComposerDisabled: false,
        isSubmitDisabled: true,
        isSending: false,
        heroQuickActions: [],
        onQuickAction: vi.fn(),
        onOpenComposerImagePicker: vi.fn(),
        onRemoveComposerImageAttachment: vi.fn(),
        onSelectSlashCommand: vi.fn(),
        isNewChatHero: false,
        showScrollToLatest: false,
        shouldCenterHero: false,
        onScrollToBottom: vi.fn(),
      }}
      threadContent={null}
    />,
  );

  expect(screen.getByRole("button", { name: "Toggle sidebar" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Open account menu" })).toBeVisible();
});
