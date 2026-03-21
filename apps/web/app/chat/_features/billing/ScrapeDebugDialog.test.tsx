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
      telemetry={{
        uniqueOriginalPostsCollected: 40,
        totalRawPostCount: 40,
        sessionId: "acct_1",
        rotatedSessionIds: ["acct_2"],
        didRotateSession: true,
      }}
      sessionHealth={{
        account: "stanley",
        checkedAt: "2026-03-20T12:10:00.000Z",
        sessions: [
          {
            id: "acct_1",
            rateLimit: {
              recentRequestCount: 3,
              lastRequestAt: "2026-03-20T12:09:00.000Z",
              cooldownUntil: null,
            },
            health: {
              status: "ok",
              message: "Authenticated scrape probe succeeded.",
              checkedAt: "2026-03-20T12:10:00.000Z",
              sessionId: "acct_1",
              nextCursor: "cursor_2",
              uniqueOriginalPostsCollected: 5,
              totalRawPostCount: 5,
            },
          },
        ],
      }}
      isLoading={false}
      actionInFlight={null}
      errorMessage={null}
      notice="Deep backfill queued for @stanley."
      onReload={vi.fn()}
      onRunRecentSync={vi.fn()}
      onRunDeepBackfill={vi.fn()}
      onRunSessionHealthCheck={vi.fn()}
    />,
  );

  expect(screen.getByText("Dev Only")).toBeVisible();
  expect(screen.getByRole("button", { name: /rerun recent/i })).toBeVisible();
  expect(screen.getByRole("button", { name: /rerun deepfill/i })).toBeVisible();
  expect(screen.getByRole("button", { name: /check sessions/i })).toBeVisible();
  expect(screen.getByText(/"captureId": "sc_123"/)).toBeVisible();
  expect(screen.getByText("Deep backfill queued for @stanley.")).toBeVisible();
  expect(screen.getAllByText("acct_1").length).toBeGreaterThan(0);
});
