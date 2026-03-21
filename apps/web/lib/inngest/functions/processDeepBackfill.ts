import { RetryAfterError, type GetFunctionInput, type GetStepTools } from "inngest";

import { importUserTweetsPayload } from "@/lib/onboarding/sources/importScrapePayload";
import { readLatestScrapeCaptureByAccount } from "@/lib/onboarding/store/scrapeCaptureStore";
import { syncPostsToDb } from "@/lib/onboarding/store/onboardingRunStore";
import { runUserTweetsCapture } from "@/lib/x-scrape/userTweetsCapture.mjs";

import { inngest, type OnboardingDeepBackfillStartedEventData } from "../client";

const TARGET_DEEP_BACKFILL_POST_COUNT = 500;

type ProcessDeepBackfillContext = Omit<GetFunctionInput<typeof inngest>, "event"> & {
  event: {
    data: OnboardingDeepBackfillStartedEventData;
  };
  step: GetStepTools<typeof inngest>;
};

function isXRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b/.test(message) || /too many requests/i.test(message);
}

function isInternalScraperBudgetExceededError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("Scrape hourly budget exceeded")
  );
}

export async function processDeepBackfillHandler({
  event,
  step,
}: ProcessDeepBackfillContext) {
  const { account, userId } = event.data;
  let currentCursor =
    typeof event.data.cursor === "string" && event.data.cursor.trim().length > 0
      ? event.data.cursor
      : null;

  if (!currentCursor) {
    return {
      account,
      pagesProcessed: 0,
      postsImported: 0,
      skipped: true,
    };
  }

  let collected = 0;
  let page = 0;

  while (collected < TARGET_DEEP_BACKFILL_POST_COUNT) {
    const pageNumber = page;
    const scrapeResult = await step.run(`scrape-page-${pageNumber}`, async () => {
      try {
        return await runUserTweetsCapture({
          account,
          cursor: currentCursor,
          count: 40,
          pages: 1,
          userAgent: "onboarding-deep-backfill",
        });
      } catch (error) {
        if (isXRateLimitError(error)) {
          throw new RetryAfterError("X_RATE_LIMIT_REACHED", "15m", { cause: error });
        }

        if (isInternalScraperBudgetExceededError(error)) {
          throw new RetryAfterError("INTERNAL_SCRAPER_BUDGET_EXCEEDED", "1h", {
            cause: error,
          });
        }

        throw error;
      }
    });

    const saveResult = await step.run(`save-page-${pageNumber}`, async () =>
      importUserTweetsPayload({
        account,
        payload: scrapeResult.payload,
        source: "agent",
        userAgent: "onboarding-deep-backfill",
        mergeWithExisting: true,
      }),
    );

    collected += saveResult.postsImported;

    const next = scrapeResult.scrapeMeta?.nextCursor ?? null;
    if (
      collected >= TARGET_DEEP_BACKFILL_POST_COUNT ||
      next === null ||
      next === currentCursor
    ) {
      break;
    }

    currentCursor = next;
    await step.sleep(`pace-scraping-${pageNumber}`, "4s");
    page += 1;
  }

  const syncResult = await step.run("sync-posts-to-db", async () => {
    const latestCapture = await readLatestScrapeCaptureByAccount(account);
    if (!latestCapture) {
      throw new Error(`No scrape capture found for @${account} after deep backfill.`);
    }

    await syncPostsToDb({
      userId,
      xHandle: account,
      posts: latestCapture.posts,
      replyPosts: latestCapture.replyPosts ?? [],
      quotePosts: latestCapture.quotePosts ?? [],
    });

    return {
      captureId: latestCapture.captureId,
      postsSynced: latestCapture.posts.length,
    };
  });

  return {
    account,
    captureId: syncResult.captureId,
    pagesProcessed: page + 1,
    postsImported: collected,
    postsSynced: syncResult.postsSynced,
    skipped: false,
  };
}

export const processDeepBackfill = inngest.createFunction(
  {
    id: "process-deep-backfill",
    retries: 5,
    concurrency: [
      {
        limit: 2,
        key: '"deep-backfill"',
        scope: "env",
      },
      {
        limit: 1,
        key: "event.data.account",
      },
    ],
    singleton: {
      key: "event.data.account",
      mode: "skip",
    },
    triggers: [{ event: "onboarding/deep.backfill.started" }],
    timeouts: {
      finish: "3h",
    },
  },
  processDeepBackfillHandler,
);
