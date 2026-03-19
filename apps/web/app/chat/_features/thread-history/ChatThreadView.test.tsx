import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const { mockUseChatThreadViewCanvas } = vi.hoisted(() => ({
  mockUseChatThreadViewCanvas: vi.fn(),
}));

vi.mock("../chat-page/ChatCanvasContext", () => ({
  useChatThreadViewCanvas: mockUseChatThreadViewCanvas,
}));

import { ChatThreadView } from "./ChatThreadView";

test("renders the square loading state while the workspace is bootstrapping", () => {
  mockUseChatThreadViewCanvas.mockReturnValue({
    threadScrollRef: { current: null },
    chatCanvasClassName: "canvas",
    threadCanvasTransitionClassName: "transition",
    threadContentTransitionClassName: "content",
    isLoading: true,
    isWorkspaceInitializing: false,
    hasContext: false,
    hasContract: false,
    errorMessage: null,
    statusMessage: null,
    showBillingWarningBanner: false,
    billingWarningLevel: null,
    billingCreditsLabel: "",
    onOpenPricing: vi.fn(),
    onDismissBillingWarning: vi.fn(),
  });

  const { container } = render(
    <ChatThreadView
      hero={<div>Hero content</div>}
      threadContent={<div>Thread content</div>}
    />,
  );

  expect(screen.getByText("Setting things up...")).toBeInTheDocument();
  expect(screen.getByRole("status", { name: "Setting things up" })).toBeInTheDocument();
  expect(container.querySelectorAll(".animate-pulse")).toHaveLength(9);
});
