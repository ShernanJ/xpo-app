import type { ImgHTMLAttributes } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { ChatWorkspaceCanvas } from "./ChatWorkspaceCanvas";
import type { ChatCanvasProviderProps } from "./ChatCanvasContext";
import type { ChatWorkspaceChromeProviderProps } from "../workspace-chrome/ChatWorkspaceChromeContext";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

function buildWorkspaceChromeProps(
  overrides: Partial<ChatWorkspaceChromeProviderProps> = {},
): ChatWorkspaceChromeProviderProps {
  return {
    toolsMenuRef: { current: null },
    toolsMenuOpen: false,
    setToolsMenuOpen: vi.fn(),
    setSidebarOpen: vi.fn(),
    setExtensionModalOpen: vi.fn(),
    resetSourceMaterialDraft: vi.fn(),
    openSourceMaterials: vi.fn(),
    openDraftQueue: vi.fn(),
    openAnalysis: vi.fn(),
    openGrowthGuide: vi.fn(),
    sidebarOpen: false,
    sidebarSearchQuery: "",
    setSidebarSearchQuery: vi.fn(),
    closeSidebar: vi.fn(),
    openSidebar: vi.fn(),
    handleNewChat: vi.fn(),
    chatThreads: [],
    hasWorkspace: true,
    activeThreadId: null,
    hoveredThreadId: null,
    setHoveredThreadId: vi.fn(),
    menuOpenThreadId: null,
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
    accountMenuOpen: false,
    toggleAccountMenu: vi.fn(),
    accountMenuVisible: false,
    monetizationEnabled: true,
    availableHandles: ["stanley"],
    accountName: "stanley",
    switchActiveHandle: vi.fn(),
    openAddAccountModal: vi.fn(),
    closeAccountMenu: vi.fn(),
    setSettingsModalOpen: vi.fn(),
    rateLimitsMenuOpen: false,
    setRateLimitsMenuOpen: vi.fn(),
    rateLimitWindowLabel: "Daily",
    rateLimitsRemainingPercent: 80,
    rateLimitResetLabel: "Mar 20, 12:00 PM",
    showRateLimitUpgradeCta: true,
    rateLimitUpgradeLabel: "Upgrade to Pro",
    setPricingModalOpen: vi.fn(),
    avatarUrl: null,
    isVerifiedAccount: false,
    sessionEmail: "stanley@example.com",
    ...overrides,
  };
}

function buildCanvasProps(
  overrides: Partial<ChatCanvasProviderProps> = {},
): ChatCanvasProviderProps {
  return {
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
    showBillingWarningBanner: true,
    billingWarningLevel: "low",
    billingCreditsLabel: "12 credits left",
    onOpenPricing: vi.fn(),
    onDismissBillingWarning: vi.fn(),
    isHeroVisible: true,
    avatarUrl: null,
    heroIdentityLabel: "Stanley",
    heroInitials: "S",
    heroGreeting: "What are we making?",
    isVerifiedAccount: true,
    isLeavingHero: false,
    composerModeLabel: null,
    draftInput: "",
    onDraftInputChange: vi.fn(),
    onCancelComposerMode: vi.fn(),
    onComposerKeyDown: vi.fn(),
    onComposerSubmit: vi.fn(),
    onInterruptReply: vi.fn(),
    isComposerDisabled: false,
    isSubmitDisabled: true,
    isSending: false,
    heroQuickActions: [{ label: "Write a thread", prompt: "Write a thread" }],
    onQuickAction: vi.fn(),
    isNewChatHero: true,
    showScrollToLatest: false,
    shouldCenterHero: true,
    onScrollToBottom: vi.fn(),
    ...overrides,
  };
}

test("wires hero quick actions and billing controls through the canvas provider", async () => {
  const user = userEvent.setup();
  const canvasProps = buildCanvasProps();

  render(
    <ChatWorkspaceCanvas
      workspaceChromeProps={buildWorkspaceChromeProps()}
      canvasProps={canvasProps}
      threadContent={null}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Write a thread" }));
  await user.click(screen.getByRole("button", { name: /Upgrade/i }));
  await user.click(screen.getByRole("button", { name: "Dismiss billing warning" }));

  expect(canvasProps.onQuickAction).toHaveBeenCalledWith("Write a thread");
  expect(canvasProps.onOpenPricing).toHaveBeenCalledTimes(1);
  expect(canvasProps.onDismissBillingWarning).toHaveBeenCalledTimes(1);
});

test("wires the dock composer and scroll action through the canvas provider", async () => {
  const user = userEvent.setup();
  const canvasProps = buildCanvasProps({
    isHeroVisible: false,
    isNewChatHero: false,
    showScrollToLatest: true,
    shouldCenterHero: false,
    draftInput: "hello",
    isSubmitDisabled: false,
  });

  render(
    <ChatWorkspaceCanvas
      workspaceChromeProps={buildWorkspaceChromeProps()}
      canvasProps={canvasProps}
      threadContent={null}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Jump to latest message" }));
  fireEvent.change(screen.getByPlaceholderText("What are we creating today?"), {
    target: { value: "next draft" },
  });
  fireEvent.submit(screen.getByRole("button", { name: "Send message" }).closest("form")!);

  expect(canvasProps.onScrollToBottom).toHaveBeenCalledTimes(1);
  expect(canvasProps.onDraftInputChange).toHaveBeenCalledWith("next draft");
  expect(canvasProps.onComposerSubmit).toHaveBeenCalledTimes(1);
});

test("shows the stop action while a reply is sending", async () => {
  const user = userEvent.setup();
  const canvasProps = buildCanvasProps({
    isHeroVisible: false,
    isNewChatHero: false,
    isSending: true,
  });

  render(
    <ChatWorkspaceCanvas
      workspaceChromeProps={buildWorkspaceChromeProps()}
      canvasProps={canvasProps}
      threadContent={null}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Stop generating" }));

  expect(canvasProps.onInterruptReply).toHaveBeenCalledTimes(1);
});
