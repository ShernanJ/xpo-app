import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { ScrapeDebugDialog } from "./ScrapeDebugDialog";

test("renders scrape debug actions and pretty-printed capture json", () => {
  render(
    <ScrapeDebugDialog
      open
      onOpenChange={vi.fn()}
      handle="stanley"
      capture={{
        captureId: "sc_123",
        capturedAt: "2026-03-20T12:00:00.000Z",
        posts: [{ id: "1" }],
        replyPosts: [],
        quotePosts: [],
        metadata: {
          source: "agent",
          userAgent: "test",
        },
      }}
      isLoading={false}
      actionInFlight={null}
      errorMessage={null}
      notice="Deep backfill queued for @stanley."
      onReload={vi.fn()}
      onRunRecentSync={vi.fn()}
      onRunDeepBackfill={vi.fn()}
    />,
  );

  expect(screen.getByText("Dev Only")).toBeVisible();
  expect(screen.getByRole("button", { name: /rerun recent/i })).toBeVisible();
  expect(screen.getByRole("button", { name: /rerun deepfill/i })).toBeVisible();
  expect(screen.getByText(/"captureId": "sc_123"/)).toBeVisible();
  expect(screen.getByText("Deep backfill queued for @stanley.")).toBeVisible();
});
