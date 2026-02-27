import { readLatestScrapeCaptureByAccount } from "../scrapeStore";
import type { OnboardingInput } from "../types";
import type { OnboardingDataSource } from "./types";

export async function resolveScrapeDataSource(
  input: OnboardingInput,
): Promise<OnboardingDataSource> {
  const latestCapture = await readLatestScrapeCaptureByAccount(input.account);
  if (!latestCapture) {
    throw new Error(
      `No scrape capture found for @${input.account}. Import UserTweets payload first.`,
    );
  }

  return {
    source: "scrape",
    profile: latestCapture.profile,
    posts: latestCapture.posts.slice(0, 50),
    warnings: [],
  };
}
