import { RetryAfterError } from "inngest";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  importUserTweetsPayload: vi.fn(),
  readLatestScrapeCaptureByAccount: vi.fn(),
  runUserTweetsCapture: vi.fn(),
  syncPostsToDb: vi.fn(),
}));

vi.mock("@/lib/onboarding/sources/importScrapePayload", () => ({
  importUserTweetsPayload: mocks.importUserTweetsPayload,
}));

vi.mock("@/lib/onboarding/store/scrapeCaptureStore", () => ({
  readLatestScrapeCaptureByAccount: mocks.readLatestScrapeCaptureByAccount,
}));

vi.mock("@/lib/onboarding/store/onboardingRunStore", () => ({
  syncPostsToDb: mocks.syncPostsToDb,
}));

vi.mock("@/lib/x-scrape/userTweetsCapture.mjs", () => ({
  runUserTweetsCapture: mocks.runUserTweetsCapture,
}));

import { processDeepBackfillHandler } from "./processDeepBackfill";

function createStepTools() {
  const cache = new Map<string, unknown>();

  return {
    run: vi.fn(async (stepId: string, fn: () => unknown) => {
      if (cache.has(stepId)) {
        return cache.get(stepId);
      }

      const result = await fn();
      cache.set(stepId, result);
      return result;
    }),
    sleep: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.importUserTweetsPayload.mockResolvedValue({
    postsImported: 40,
  });
  mocks.readLatestScrapeCaptureByAccount.mockResolvedValue({
    captureId: "capture_1",
    posts: [{ id: "post_1" }],
    replyPosts: [],
    quotePosts: [],
  });
  mocks.syncPostsToDb.mockResolvedValue(undefined);
});

describe("processDeepBackfillHandler", () => {
  test("processes multiple pages, sleeps between advancing cursors, and syncs the latest capture", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const step = createStepTools();
    mocks.runUserTweetsCapture
      .mockResolvedValueOnce({
        payload: { page: 1 },
        scrapeMeta: { nextCursor: "cursor_2", sessionId: "session_alpha" },
      })
      .mockResolvedValueOnce({
        payload: { page: 2 },
        scrapeMeta: { nextCursor: null, sessionId: "session_beta" },
      });

    const result = await processDeepBackfillHandler({
      event: {
        data: {
          account: "stan",
          cursor: "cursor_1",
          userId: "user_1",
        },
      },
      step,
    } as never);

    expect(result).toMatchObject({
      account: "stan",
      pagesProcessed: 2,
      postsImported: 80,
      skipped: false,
    });
    expect(mocks.runUserTweetsCapture).toHaveBeenNthCalledWith(1, {
      account: "stan",
      cursor: "cursor_1",
      count: 40,
      pages: 1,
      minIntervalMs: 30000,
      requestDelayMs: 4500,
      requestJitterMs: 6500,
      userAgent: "onboarding-deep-backfill",
    });
    expect(mocks.runUserTweetsCapture).toHaveBeenNthCalledWith(2, {
      account: "stan",
      cursor: "cursor_2",
      count: 40,
      pages: 1,
      minIntervalMs: 30000,
      requestDelayMs: 4500,
      requestJitterMs: 6500,
      userAgent: "onboarding-deep-backfill",
    });
    expect(step.sleep).toHaveBeenCalledTimes(1);
    expect(step.sleep).toHaveBeenCalledWith("pace-scraping-0", "25s");
    expect(mocks.syncPostsToDb).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      sessionsUsed: ["session_alpha", "session_beta"],
    });
    randomSpy.mockRestore();
  });

  test("breaks when the cursor stops advancing", async () => {
    const step = createStepTools();
    mocks.runUserTweetsCapture.mockResolvedValue({
      payload: { page: 1 },
      scrapeMeta: { nextCursor: "cursor_1" },
    });

    const result = await processDeepBackfillHandler({
      event: {
        data: {
          account: "stan",
          cursor: "cursor_1",
          userId: "user_1",
        },
      },
      step,
    } as never);

    expect(result).toMatchObject({
      pagesProcessed: 1,
      postsImported: 40,
      skipped: false,
    });
    expect(step.sleep).not.toHaveBeenCalled();
    expect(mocks.runUserTweetsCapture).toHaveBeenCalledTimes(1);
  });

  test("converts 429 scraper errors into a 15 minute retry-after error", async () => {
    const step = createStepTools();
    mocks.runUserTweetsCapture.mockRejectedValue(new Error("HTTP 429: Too Many Requests"));

    try {
      await processDeepBackfillHandler({
        event: {
          data: {
            account: "stan",
            cursor: "cursor_1",
            userId: "user_1",
          },
        },
        step,
      } as never);
    } catch (error) {
      expect(error).toBeInstanceOf(RetryAfterError);
      expect((error as RetryAfterError).message).toBe("X_RATE_LIMIT_REACHED");
      expect((error as RetryAfterError).retryAfter).toBe("900");
      return;
    }

    throw new Error("Expected a RetryAfterError to be thrown.");
  });

  test("converts scraper budget exhaustion into a 1 hour retry-after error", async () => {
    const step = createStepTools();
    mocks.runUserTweetsCapture.mockRejectedValue(
      new Error("Scrape hourly budget exceeded for session default (500/hour). Retry in ~2003s."),
    );

    try {
      await processDeepBackfillHandler({
        event: {
          data: {
            account: "stan",
            cursor: "cursor_1",
            userId: "user_1",
          },
        },
        step,
      } as never);
    } catch (error) {
      expect(error).toBeInstanceOf(RetryAfterError);
      expect((error as RetryAfterError).message).toBe(
        "INTERNAL_SCRAPER_BUDGET_EXCEEDED",
      );
      expect((error as RetryAfterError).retryAfter).toBe("3600");
      return;
    }

    throw new Error("Expected a RetryAfterError to be thrown.");
  });

  test("reuses the memoized scrape page when save-page-2 fails and the handler retries", async () => {
    const step = createStepTools();
    mocks.runUserTweetsCapture
      .mockResolvedValueOnce({
        payload: { page: 1 },
        scrapeMeta: { nextCursor: "cursor_2" },
      })
      .mockResolvedValueOnce({
        payload: { page: 2 },
        scrapeMeta: { nextCursor: null },
      });
    mocks.importUserTweetsPayload
      .mockResolvedValueOnce({ postsImported: 40 })
      .mockRejectedValueOnce(new Error("temporary save issue"))
      .mockResolvedValueOnce({ postsImported: 40 });

    await expect(
      processDeepBackfillHandler({
        event: {
          data: {
            account: "stan",
            cursor: "cursor_1",
            userId: "user_1",
          },
        },
        step,
      } as never),
    ).rejects.toThrow("temporary save issue");

    await expect(
      processDeepBackfillHandler({
        event: {
          data: {
            account: "stan",
            cursor: "cursor_1",
            userId: "user_1",
          },
        },
        step,
      } as never),
    ).resolves.toMatchObject({
      postsImported: 80,
      skipped: false,
    });

    expect(mocks.runUserTweetsCapture).toHaveBeenCalledTimes(2);
    expect(mocks.importUserTweetsPayload).toHaveBeenCalledTimes(3);
  });
});
