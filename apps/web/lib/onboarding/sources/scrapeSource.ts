import { readLatestScrapeCaptureByAccount } from "../scrapeStore";
import type { OnboardingInput } from "../types";
import { bootstrapScrapeCapture } from "./scrapeBootstrap";
import type { OnboardingDataSource } from "./types";

export async function resolveScrapeDataSource(
  input: OnboardingInput,
): Promise<OnboardingDataSource> {
  let latestCapture = await readLatestScrapeCaptureByAccount(input.account);
  const warnings: string[] = [];

  if (!latestCapture) {
    await bootstrapScrapeCapture(input.account);
    latestCapture = await readLatestScrapeCaptureByAccount(input.account);
    warnings.push("No cached scrape found. Ran live onboarding bootstrap scrape.");
  }

  if (!latestCapture) {
    throw new Error(`No scrape capture found for @${input.account} after bootstrap.`);
  }

  return {
    source: "scrape",
    profile: latestCapture.profile,
    posts: latestCapture.posts.slice(0, 50),
    warnings,
  };
}
