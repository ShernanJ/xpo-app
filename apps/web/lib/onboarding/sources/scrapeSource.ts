import { resolveFreshOnboardingProfilePreview } from "../profilePreview";
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

  const freshPreview = await resolveFreshOnboardingProfilePreview(input.account);
  const profile = {
    ...latestCapture.profile,
    ...(freshPreview?.avatarUrl &&
    freshPreview.avatarUrl !== latestCapture.profile.avatarUrl
      ? { avatarUrl: freshPreview.avatarUrl }
      : {}),
    isVerified: latestCapture.profile.isVerified || freshPreview?.isVerified || false,
  };

  return {
    source: "scrape",
    profile,
    posts: latestCapture.posts.slice(0, 50),
    warnings,
  };
}
