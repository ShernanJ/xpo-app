import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

const { mockUseChatThreadViewCanvas } = vi.hoisted(() => ({
  mockUseChatThreadViewCanvas: vi.fn(),
}));

vi.mock("../chat-page/ChatCanvasContext", () => ({
  useChatThreadViewCanvas: mockUseChatThreadViewCanvas,
}));

import { ChatThreadView } from "./ChatThreadView";

function buildCanvasValue() {
  return {
    threadScrollRef: { current: null },
    chatCanvasClassName: "canvas",
    threadCanvasTransitionClassName: "transition",
    threadContentTransitionClassName: "content",
    isLoading: false,
    isWorkspaceInitializing: false,
    startupState: {
      status: "workspace_ready" as const,
    },
    hasQueuedInitialPrompt: false,
    isHeroVisible: false,
    hasContext: true,
    hasContract: true,
    errorMessage: null,
    statusMessage: null,
    showBillingWarningBanner: false,
    billingWarningLevel: null,
    billingCreditsLabel: "",
    onOpenPricing: vi.fn(),
    onDismissBillingWarning: vi.fn(),
    onRetryWorkspaceStartup: vi.fn(),
  };
}

test("renders the square loading state while the workspace is bootstrapping", () => {
  mockUseChatThreadViewCanvas.mockReturnValue({
    ...buildCanvasValue(),
    isLoading: true,
    startupState: {
      status: "shell_loading",
    },
    hasContext: false,
    hasContract: false,
  });

  const { container } = render(
    <ChatThreadView
      hero={<div>Hero content</div>}
      threadContent={<div>Thread content</div>}
    />,
  );

  expect(screen.getByText("Loading...")).toBeInTheDocument();
  expect(screen.getByRole("status", { name: "Setting things up" })).toBeInTheDocument();
  expect(container.querySelectorAll(".animate-pulse")).toHaveLength(9);
});

test("renders the hero shell with a setup-pending banner instead of a fatal loading block", () => {
  mockUseChatThreadViewCanvas.mockReturnValue({
    ...buildCanvasValue(),
    isLoading: true,
    startupState: {
      status: "setup_pending",
      pollAfterMs: 1200,
    },
    hasQueuedInitialPrompt: true,
    isHeroVisible: true,
    hasContext: false,
    hasContract: false,
  });

  render(
    <ChatThreadView
      hero={<div>Hero content</div>}
      threadContent={<div>Thread content</div>}
    />,
  );

  expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  expect(screen.getByText("Hero content")).toBeInTheDocument();
  expect(
    screen.getByText(
      "Setup is still finishing. Your first prompt is queued and will send automatically as soon as the workspace is ready.",
    ),
  ).toBeInTheDocument();
});

test("renders a retry action when setup times out", async () => {
  const user = userEvent.setup();
  const onRetryWorkspaceStartup = vi.fn();

  mockUseChatThreadViewCanvas.mockReturnValue({
    ...buildCanvasValue(),
    startupState: {
      status: "setup_timeout",
    },
    hasContext: false,
    hasContract: false,
    onRetryWorkspaceStartup,
  });

  render(
    <ChatThreadView
      hero={<div>Hero content</div>}
      threadContent={<div>Thread content</div>}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Retry setup" }));

  expect(onRetryWorkspaceStartup).toHaveBeenCalledTimes(1);
});
